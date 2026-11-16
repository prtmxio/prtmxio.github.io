// Fixed ASCII robot arm behind the page. Decorative only: aria-hidden, pointer-events none.
// Rendering: bodies are rasterised by coverage onto a character grid; every lit cell is a
// toned tile (1px gap) with an optional glyph on top. Sim runs in continuous px space.

const LINK_FRAC = [0.4, 0.34, 0.26]; // link length as a fraction of layer height
const RADII = [18, 14, 11, 8]; // body radius (px) at base, joint 1, joint 2, wrist
const HUB = [20, 15, 12]; // joint hub radius (px)
const TONE_ALPHA = [0.1, 0.22, 0.4, 0.62];
const SOFT = 1.1; // edge softness in cell widths
const LIGHT = [-0.5, -0.6, 0.62];

const root = document.documentElement;
const wideMQ = matchMedia("(min-width: 768px)");

let layer, canvas, ctx;
let W = 0, H = 0, dpr = 1;
let cw = 7, ch = 14, cols = 0, rows = 0;
let tone = new Uint8Array(0); // 0 empty, 1..4 = tone + 1
let glyph = new Uint8Array(0); // char code, 0 none
let accent = new Uint8Array(0);
let col = { sub: "#b5b2ab", bg: "#1a1917", accent: "#ff7a1a" };
let baseX = 0, baseY = 0;
const lens = [0, 0, 0];
const ang = [1.83, 2.79, 3.49]; // absolute link angles (rad, ccw from +x, y up)
const jx = [0, 0, 0, 0], jy = [0, 0, 0, 0];
let started = false;

const LL = Math.hypot(LIGHT[0], LIGHT[1], LIGHT[2]);
const LX = LIGHT[0] / LL, LY = LIGHT[1] / LL, LZ = LIGHT[2] / LL;

function readColors() {
    const cs = getComputedStyle(root);
    const g = (n, d) => cs.getPropertyValue(n).trim() || d;
    col = { sub: g("--sub", col.sub), bg: g("--bg", col.bg), accent: g("--accent", col.accent) };
}

function orient(dx, dy) {
    let a = (Math.atan2(-dy, dx) * 180) / Math.PI;
    if (a < 0) a += 180;
    if (a >= 157.5 || a < 22.5) return 45; // -
    if (a < 67.5) return 47; // /
    if (a < 112.5) return 124; // |
    return 92; // \
}

function put(c, r, t, g, acc) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const i = r * cols + c;
    if (t + 1 >= tone[i]) {
        tone[i] = t + 1;
        glyph[i] = g;
        accent[i] = acc ? 1 : 0;
    }
}

// Lambert term to 0..1 so the lit side reaches the top tone and the far side the bottom.
function remap(raw) {
    const v = (raw - 0.1) * 1.25;
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function toneOf(shade) {
    return shade > 0.8 ? 3 : shade > 0.55 ? 2 : shade > 0.3 ? 1 : 0;
}

// Tapered capsule from (ax,ay) radius ra to (bx,by) radius rb.
function capsule(ax, ay, bx, by, ra, rb) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const len = Math.sqrt(len2);
    const nx = -dy / len, ny = dx / len;
    const soft = cw * SOFT;
    const rm = Math.max(ra, rb) + soft;
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - rm) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((Math.max(ax, bx) + rm) / cw));
    const r0 = Math.max(0, Math.floor((Math.min(ay, by) - rm) / ch));
    const r1 = Math.min(rows - 1, Math.ceil((Math.max(ay, by) + rm) / ch));
    const edgeGlyph = orient(dx, dy);
    for (let r = r0; r <= r1; r++) {
        const py = (r + 0.5) * ch;
        for (let c = c0; c <= c1; c++) {
            const px = (c + 0.5) * cw;
            let t = ((px - ax) * dx + (py - ay) * dy) / len2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = px - (ax + dx * t), qy = py - (ay + dy * t);
            const rad = ra + (rb - ra) * t;
            const d = Math.hypot(qx, qy) - rad;
            if (d > soft * 0.5) continue;
            const cov = Math.min(1, Math.max(0, 0.5 - d / soft));
            if (cov < 0.08) continue;
            let u = (qx * nx + qy * ny) / rad;
            u = u < -1 ? -1 : u > 1 ? 1 : u;
            const nz = Math.sqrt(1 - u * u);
            const shade = remap(u * nx * LX + u * ny * LY + nz * LZ);
            let tn = toneOf(shade);
            let g = 0;
            if (cov < 0.35) { tn = 0; g = edgeGlyph; }
            else if (cov < 0.65) { tn = Math.min(tn, 1); g = edgeGlyph; }
            else if (Math.abs(u) < 0.16) g = (c + r) % 4 === 0 ? 111 : edgeGlyph; // axis line, rivets
            put(c, r, tn, g, false);
        }
    }
}

// Shaded disc (hubs, turret dome).
function disc(cx, cy, rad, glyphCode, ring) {
    const soft = cw * SOFT;
    const rm = rad + soft;
    const c0 = Math.max(0, Math.floor((cx - rm) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((cx + rm) / cw));
    const r0 = Math.max(0, Math.floor((cy - rm) / ch));
    const r1 = Math.min(rows - 1, Math.ceil((cy + rm) / ch));
    for (let r = r0; r <= r1; r++) {
        const py = (r + 0.5) * ch;
        for (let c = c0; c <= c1; c++) {
            const px = (c + 0.5) * cw;
            const dxx = px - cx, dyy = py - cy;
            const dist = Math.hypot(dxx, dyy);
            const d = dist - rad;
            if (d > soft * 0.5) continue;
            const cov = Math.min(1, Math.max(0, 0.5 - d / soft));
            if (cov < 0.08) continue;
            const u = Math.min(1, dist / rad);
            const nz = Math.sqrt(1 - u * u);
            const shade = remap((dxx / rad) * LX + (dyy / rad) * LY + nz * LZ);
            let tn = toneOf(shade);
            let g = 0;
            if (cov < 0.5) { tn = 0; }
            else if (dist < cw * 0.9 && Math.abs(dyy) < ch * 0.6) g = glyphCode; // bolt at centre
            else if (ring && dist > rad - cw * 0.9) g = 111;
            put(c, r, tn, g, false);
        }
    }
}

// Turret: stepped plinth with a domed top, cropped by the layer's right and bottom edges.
function base() {
    const hw = cw * 7;
    const top = baseY - ch * 3;
    const c0 = Math.floor((baseX - hw) / cw), c1 = Math.ceil((baseX + hw) / cw);
    const r0 = Math.floor(top / ch), r1 = Math.ceil(baseY / ch) + 2;
    for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
            const rr = r - r0;
            const cx = (c + 0.5) * cw - baseX;
            // bottom steps wider, top narrower
            const lim = hw - Math.max(0, 2 - rr) * cw * 1.5;
            if (Math.abs(cx) > lim) continue;
            const g = rr === 0 ? 95 : rr === 1 ? 61 : (c + r) % 3 === 0 ? 35 : 61; // _ = # =
            put(c, r, rr === 0 ? 1 : 2, g, false);
        }
    }
    disc(baseX, baseY - ch * 2.2, 40, 64, false);
}

function fk() {
    jx[0] = baseX; jy[0] = baseY - ch * 2.2;
    for (let i = 0; i < 3; i++) {
        jx[i + 1] = jx[i] + Math.cos(ang[i]) * lens[i];
        jy[i + 1] = jy[i] - Math.sin(ang[i]) * lens[i];
    }
}

function finger(x, y, a, len) {
    const ex = x + Math.cos(a) * len, ey = y - Math.sin(a) * len;
    capsule(x, y, ex, ey, 5, 3);
    return [ex, ey];
}

function draw() {
    tone.fill(0);
    glyph.fill(0);
    accent.fill(0);
    fk();
    base();
    for (let i = 0; i < 3; i++) capsule(jx[i], jy[i], jx[i + 1], jy[i + 1], RADII[i], RADII[i + 1]);
    for (let i = 0; i < 3; i++) disc(jx[i], jy[i], HUB[i], 64, i > 0);
    disc(jx[3], jy[3], 10, 64, false);
    // two-finger gripper (static open pose in step 1)
    const a3 = ang[2];
    const open = 0.4;
    const f1 = finger(jx[3], jy[3], a3 + open, 44);
    const f2 = finger(jx[3], jy[3], a3 - open, 44);
    const tx = (f1[0] + f2[0]) / 2, ty = (f1[1] + f2[1]) / 2;
    put(Math.floor(tx / cw), Math.floor(ty / ch), 3, 42, true); // end-effector

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = col.sub;
    for (let t = 0; t < 4; t++) {
        ctx.globalAlpha = TONE_ALPHA[t];
        for (let i = 0; i < tone.length; i++) {
            if (tone[i] !== t + 1 || accent[i]) continue;
            ctx.fillRect((i % cols) * cw + 1, ((i / cols) | 0) * ch + 1, cw - 1, ch - 1);
        }
    }
    ctx.fillStyle = col.accent;
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < tone.length; i++) {
        if (accent[i]) ctx.fillRect((i % cols) * cw + 1, ((i / cols) | 0) * ch + 1, cw - 1, ch - 1);
    }
    // glyphs: dark on bright tiles, light on dim tiles
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? col.bg : col.sub;
        ctx.globalAlpha = pass ? 0.75 : 0.7;
        for (let i = 0; i < glyph.length; i++) {
            if (!glyph[i]) continue;
            const bright = tone[i] >= 3 || accent[i];
            if (bright !== (pass === 1)) continue;
            ctx.fillText(String.fromCharCode(glyph[i]), ((i % cols) + 0.5) * cw, (((i / cols) | 0) + 0.5) * ch + 1);
        }
    }
    ctx.globalAlpha = 1;
}

function layout() {
    W = Math.round(Math.min(innerWidth * 0.55, 720));
    H = Math.round(Math.min(innerHeight * 0.75, 680));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    layer.style.width = `${W}px`;
    layer.style.height = `${H}px`;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.font = `12px ${getComputedStyle(root).getPropertyValue("--font-mono") || "monospace"}`;
    cw = Math.max(5, Math.round(ctx.measureText("M").width));
    ch = Math.round(cw * 1.95);
    cols = Math.floor(W / cw);
    rows = Math.floor(H / ch);
    tone = new Uint8Array(cols * rows);
    glyph = new Uint8Array(cols * rows);
    accent = new Uint8Array(cols * rows);
    ctx.font = `12px ${getComputedStyle(root).getPropertyValue("--font-mono") || "monospace"}`;
    baseX = W - cw * 5; // turret is cropped by the right edge
    baseY = H + ch * 0.5; // and by the bottom edge
    for (let i = 0; i < 3; i++) lens[i] = LINK_FRAC[i] * H;
    readColors();
    draw();
}

function start() {
    if (started) return;
    started = true;
    layer = document.createElement("div");
    layer.className = "arm-layer";
    layer.setAttribute("aria-hidden", "true");
    canvas = document.createElement("canvas");
    layer.appendChild(canvas);
    document.body.appendChild(layer);
    ctx = canvas.getContext("2d");
    layout();
    let pending = 0;
    window.addEventListener("resize", () => {
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(layout);
    });
    new MutationObserver(() => { readColors(); draw(); }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    requestAnimationFrame(() => layer.classList.add("on"));
}

async function boot() {
    try { await document.fonts.ready; } catch (_) { /* fonts API missing: measure with fallback */ }
    if (!root.classList.contains("intro")) { start(); return; }
    window.addEventListener("introdone", start, { once: true });
    // The head failsafe removes the intro class without firing the event.
    const mo = new MutationObserver(() => {
        if (!root.classList.contains("intro")) { mo.disconnect(); start(); }
    });
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
