// Pixel-art robot arm, fixed behind the page. Decorative only: aria-hidden, pointer-events none.
// Layout of this file:
//   1. pure math (IK, spring, smooth-damp, rasterize): no DOM, exported, node-testable
//   2. renderer + sim + input (browser only, started by boot())
// World units are grid cells, origin at the base bottom-centre, +x right, +y up.
// The arm is mirrored so it reaches left. Joint angles are radians: q1 absolute from +x,
// q2 and q3 relative to the previous link.

const DEG = Math.PI / 180;

export const L = [28, 24, 18]; // link lengths (cells)
export const FING = 8; // wrist-flange to fingertip reach
export const SH_X = 0;
export const SH_Y = 20; // shoulder pivot, in the turret top
export const Q1 = [25 * DEG, 165 * DEG];
export const Q2 = [-20 * DEG, 140 * DEG];
export const Q3 = [-110 * DEG, 60 * DEG];
const RMIN = 18; // wrist cannot come closer to the shoulder than this
const FLOOR = 15; // joints stay above the base top plus hub radius
const TURRET_FLOOR = 26; // and above the turret while over it

export const JAW_OPEN = 28 * DEG;
export const JAW_CLOSED = 6 * DEG;

export const HERO = [135 * DEG, 6 * DEG, -1 * DEG];
export const REST = [118 * DEG, 140 * DEG, -95 * DEG];

// Spring / motion constants (tuned by eye, see report).
export const OMEGA = 9;
export const ZETA = 0.78;
export const VMAX = 3.2;
export const TAU = 0.18;
export const SWAY = 1.2 * DEG;
export const SWAY_HZ = 0.35;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Joint positions into P: x0 y0 x1 y1 x2 y2 x3 y3 tipx tipy. q = [q1,q2,q3].
export function fk(q, P) {
    const t1 = q[0], t2 = t1 + q[1], t3 = t2 + q[2];
    P[0] = SH_X; P[1] = SH_Y;
    P[2] = P[0] + L[0] * Math.cos(t1); P[3] = P[1] + L[0] * Math.sin(t1);
    P[4] = P[2] + L[1] * Math.cos(t2); P[5] = P[3] + L[1] * Math.sin(t2);
    P[6] = P[4] + L[2] * Math.cos(t3); P[7] = P[5] + L[2] * Math.sin(t3);
    P[8] = P[6] + FING * Math.cos(t3); P[9] = P[7] + FING * Math.sin(t3);
}

const chk = new Float64Array(10);

function violates(q) {
    fk(q, chk);
    for (let i = 1; i <= 3; i++) {
        const x = chk[i * 2], y = chk[i * 2 + 1];
        if (y < FLOOR) return true;
        if (x > -14 && x < 14 && y < TURRET_FLOOR) return true;
    }
    return false;
}

// Tool direction as a function of target height: down-left when low, up-left when high.
export function toolAngle(ty) {
    let s = (ty - 15) / 50;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    s = s * s * (3 - 2 * s);
    return (235 - 95 * s) * DEG;
}

// Elbow-up analytic IK. Target (tx,ty) is the fingertip; the wrist pivot is solved with a
// fixed tool direction. out = [q1,q2,q3]; returns 1 when the target had to be pulled in.
export function solveIK(tx, ty, out) {
    if (!(tx === tx) || !(ty === ty)) { tx = -40; ty = 50; }
    // Floor for the fingertip: high over the turret, easing down to near the base line further left.
    let k = (tx + 30) / 12;
    k = k < 0 ? 0 : k > 1 ? 1 : k;
    const floorY = 14 + 16 * k * k * (3 - 2 * k);
    let ey = ty < floorY ? floorY : ty > 78 ? 78 : ty;
    const phi = toolAngle(ey);
    const lt = L[2] + FING;
    let wx = tx - lt * Math.cos(phi);
    let wy = ey - lt * Math.sin(phi);
    if (wy < SH_Y + 4) wy = SH_Y + 4;
    let dx = wx - SH_X, dy = wy - SH_Y;
    let r = Math.hypot(dx, dy);
    let pulled = 0;
    const rmax = L[0] + L[1] - 0.05;
    if (r < 1e-6) { dx = -1; dy = 0; r = 1; }
    if (r > rmax) { dx *= rmax / r; dy *= rmax / r; r = rmax; pulled = 1; }
    else if (r < RMIN) { dx *= RMIN / r; dy *= RMIN / r; r = RMIN; pulled = 1; }
    const c = clamp((r * r - L[0] * L[0] - L[1] * L[1]) / (2 * L[0] * L[1]), -1, 1);
    let q2 = Math.acos(c);
    let chord = Math.atan2(dy, dx);
    if (chord < -100 * DEG) chord += 2 * Math.PI;
    let q1 = chord - Math.atan2(L[1] * Math.sin(q2), L[0] + L[1] * c);
    q1 = clamp(q1, Q1[0], Q1[1]);
    q2 = clamp(q2, Q2[0], Q2[1]);
    let q3 = clamp(phi - (q1 + q2), Q3[0], Q3[1]);
    out[0] = q1; out[1] = q2; out[2] = q3;
    keepClear(out);
    return pulled;
}

// Safety: nothing below the base line or through the turret. Lifts the pose toward upright.
export function keepClear(q) {
    for (let n = 0; n < 150 && violates(q); n++) {
        q[0] += q[0] > 90 * DEG ? -DEG : DEG;
        q[1] = Math.max(0, q[1] - 0.5 * DEG);
        q[2] = clamp(q[2] + 0.5 * DEG, Q3[0], Q3[1]);
        q[0] = clamp(q[0], Q1[0], Q1[1]);
    }
}

// Clamp a joint triple to the limits (used for wander keyframes plus offsets).
export function clampQ(q) {
    q[0] = clamp(q[0], Q1[0], Q1[1]);
    q[1] = clamp(q[1], Q2[0], Q2[1]);
    q[2] = clamp(q[2], Q3[0], Q3[1]);
}

// Semi-implicit damped spring per joint, velocity capped.
export function springStep(pos, vel, tgt, n, dt, w, z, vmax) {
    for (let i = 0; i < n; i++) {
        const a = w * w * (tgt[i] - pos[i]) - 2 * z * w * vel[i];
        let v = vel[i] + a * dt;
        v = v > vmax ? vmax : v < -vmax ? -vmax : v;
        vel[i] = v;
        pos[i] += v * dt;
    }
}

// Frame-rate independent exponential ease (time constant tau seconds).
export function smoothDamp(cur, target, dt, tau) {
    return cur + (target - cur) * (1 - Math.exp(-dt / tau));
}

// ---- rasterizer -------------------------------------------------------------------------

export const COLS = 92;
export const ROWS = 84;
export const BASE_RIGHT = 10; // base centre, cells from the right edge
export const BASE_BELOW = 3; // base bottom, cells below the bottom edge

// Cell codes: 0 empty, 1..7 grey ramp (7 = lightest), 8 outline, 9 orange, 10 dark orange.
export function createGrid(cols = COLS, rows = ROWS) {
    return {
        cols, rows,
        bx: cols - BASE_RIGHT, by: rows + BASE_BELOW,
        cell: new Uint8Array(cols * rows),
        z: new Uint8Array(cols * rows),
    };
}

const LX = -0.55, LY = 0.6, LZ = 0.58; // light, top-left, +y up
const Z_BASE = 1, Z_TURRET = 2, Z_CABLE = 3, Z_L1 = 4, Z_H0 = 5, Z_L2 = 6, Z_H1 = 7, Z_L3 = 8, Z_H2 = 9, Z_FING = 10;

function put(g, c, r, z, code) {
    if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return;
    const i = r * g.cols + c;
    if (z >= g.z[i]) { g.z[i] = z; g.cell[i] = code; }
}

function levelOf(lam) {
    const t = lam * 1.2 + 0.02;
    return t <= 0 ? 1 : t >= 1 ? 7 : 1 + ((t * 7) | 0);
}

function taper(f, h0, h1, h2) {
    return f < 0.5 ? h0 + (h1 - h0) * f * 2 : h1 + (h2 - h1) * (f - 0.5) * 2;
}

// Link by inverse mapping: every cell centre in the bounding box is tested in (u,v) link space.
// flags: 1 hydraulic strip with orange connectors, 2 orange tip (fingers)
function tube(g, x0, y0, th, len, h0, h1, h2, z, flags, tipFrom) {
    const ca = Math.cos(th), sa = Math.sin(th);
    const x1 = x0 + len * ca, y1 = y0 + len * sa;
    const m = Math.max(h0, h1, h2) + 1;
    const c0 = Math.floor(g.bx + Math.min(x0, x1) - m), c1 = Math.ceil(g.bx + Math.max(x0, x1) + m);
    const r0 = Math.floor(g.by - Math.max(y0, y1) - m), r1 = Math.ceil(g.by - Math.min(y0, y1) + m);
    const lv = -LX * sa + LY * ca; // light across the tube, in the link frame
    const side = lv >= 0.15 ? 1 : lv <= -0.15 ? -1 : ca >= 0 ? 1 : -1; // lit side, ties go to the upper side
    for (let r = r0; r <= r1; r++) {
        const wy = g.by - (r + 0.5);
        for (let c = c0; c <= c1; c++) {
            const wx = c + 0.5 - g.bx;
            const dx = wx - x0, dy = wy - y0;
            const u = dx * ca + dy * sa;
            if (u < 0 || u > len) continue;
            const v = -dx * sa + dy * ca;
            const hw = taper(u / len, h0, h1, h2);
            const av = v < 0 ? -v : v;
            if (av > hw) continue;
            const nv = v / hw;
            const nz = Math.sqrt(1 - nv * nv);
            let lvl = levelOf(nv * lv + nz * LZ);
            const e = v * side;
            if (e >= hw - 1.7 && e <= hw - 0.7) lvl = 7; // spine highlight on the lit side
            const f = u / len;
            if ((f > 0.33 && f < 0.37 + 0.5 / len) || (f > 0.7 - 0.5 / len && f < 0.72)) lvl = lvl > 1 ? lvl - 1 : 1; // panel lines
            let code = lvl;
            if (flags & 1) {
                if (v > -hw + 0.4 && v < -hw + 1.6 && u > 2.2 && u < len - 2.2) code = 2; // hydraulic strip
                if (v > -hw + 0.4 && v < -hw + 1.6 && (Math.abs(u - 2.6) < 0.7 || Math.abs(u - (len - 2.6)) < 0.7)) code = 9;
            }
            if ((flags & 2) && u >= tipFrom) code = 9;
            put(g, c, r, z, code);
        }
    }
}

// Hub disc 6x6: orange ring (dark orange on the shadow side), dark body, bolt.
function hub(g, x0, y0, z) {
    const c0 = Math.floor(g.bx + x0 - 4), c1 = Math.ceil(g.bx + x0 + 4);
    const r0 = Math.floor(g.by - y0 - 4), r1 = Math.ceil(g.by - y0 + 4);
    for (let r = r0; r <= r1; r++) {
        const wy = g.by - (r + 0.5);
        for (let c = c0; c <= c1; c++) {
            const dx = c + 0.5 - g.bx - x0, dy = wy - y0;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > 3.1) continue;
            let code;
            if (d < 1.0) code = 5;
            else if (d <= 2.0) code = 2;
            else code = dx * LX + dy * LY >= 0 ? 9 : 10;
            put(g, c, r, z, code);
        }
    }
}

function palm(g, x0, y0, z) {
    const c0 = Math.floor(g.bx + x0 - 3), c1 = Math.ceil(g.bx + x0 + 3);
    const r0 = Math.floor(g.by - y0 - 3), r1 = Math.ceil(g.by - y0 + 3);
    for (let r = r0; r <= r1; r++) {
        const wy = g.by - (r + 0.5);
        for (let c = c0; c <= c1; c++) {
            const dx = c + 0.5 - g.bx - x0, dy = wy - y0;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > 2.4) continue;
            put(g, c, r, z, levelOf((dx * LX + dy * LY) / 2.4 * 0.6 + 0.35));
        }
    }
}

const HW_BASE = [12, 12, 12, 12, 11, 11, 10, 10, 9, 9, 9, 9];
const HW_TURRET = [9, 9, 8, 8, 8, 8, 7, 7, 7, 7];

function stampBase(g) {
    for (let r = 0; r < g.rows; r++) {
        const wy = g.by - (r + 0.5);
        if (wy < 0 || wy >= 12) continue;
        const i = Math.floor(wy);
        const hw = HW_BASE[i];
        for (let c = 0; c < g.cols; c++) {
            const wx = c + 0.5 - g.bx;
            const a = wx < 0 ? -wx : wx;
            if (a > hw) continue;
            let code = i >= 8 ? 4 : 3;
            if (wx < -hw + 2) code = i >= 8 ? 6 : 5;
            else if (wx > hw - 2) code = 1;
            if (i === 11) code = 6;
            if (i === 7) code = 1; // seam under the collar
            if (i >= 3 && i <= 6 && a < 5) { // hazard band
                const m = (((Math.floor(wx) + i) % 6) + 6) % 6;
                code = m < 3 ? 9 : 2;
                if (m === 2) code = 10;
            } else if (i === 9 && (a > 6 && a < 7)) code = 7; // bolts
            put(g, c, r, Z_BASE, code);
        }
    }
    for (let r = 0; r < g.rows; r++) {
        const wy = g.by - (r + 0.5);
        if (wy < 12 || wy >= 22) continue;
        const i = Math.floor(wy) - 12;
        const hw = HW_TURRET[i];
        for (let c = 0; c < g.cols; c++) {
            const wx = c + 0.5 - g.bx;
            const a = wx < 0 ? -wx : wx;
            if (a > hw) continue;
            let code = 4;
            if (wx < -hw + 2) code = 6;
            else if (wx > hw - 2) code = 2;
            if (i === 9) code = 7;
            if (i === 4) code = 1;
            put(g, c, r, Z_TURRET, code);
        }
    }
}

function cable(g, t1, p1x, p1y) {
    const bkx = Math.sin(t1), bky = -Math.cos(t1);
    const sx = 7.5, sy = 17;
    const ex = p1x + bkx * 3.6, ey = p1y + bky * 3.6;
    const cx = (sx + ex) / 2 + bkx * 10, cy = (sy + ey) / 2 + bky * 10;
    for (let k = 0; k <= 40; k++) {
        const t = k / 40, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
        const x = a * sx + b * cx + d * ex, y = a * sy + b * cy + d * ey;
        put(g, Math.floor(g.bx + x), Math.floor(g.by - y), Z_CABLE, 1);
    }
}

function finger(g, bx, by, th, s, jaw, z) {
    const a1 = th + s * jaw * 0.5; // jaw is the total opening angle
    tube(g, bx, by, a1, 5, 1.05, 1.05, 1.0, z, 0, 99);
    const ex = bx + 5 * Math.cos(a1), ey = by + 5 * Math.sin(a1);
    tube(g, ex, ey, a1 - s * 35 * DEG, 2.2, 1.0, 1.0, 0.8, z, 2, 0);
}

const PP = new Float64Array(10);

// q = [q1,q2,q3], jaw in radians. Fills g.cell and g.z.
export function rasterize(q, jaw, g) {
    g.cell.fill(0);
    g.z.fill(0);
    fk(q, PP);
    const t1 = q[0], t2 = t1 + q[1], t3 = t2 + q[2];
    stampBase(g);
    cable(g, t1, PP[2], PP[3]);
    tube(g, PP[0], PP[1], t1, L[0], 4, 3.5, 2.5, Z_L1, 1, 0);
    hub(g, PP[0], PP[1], Z_H0);
    tube(g, PP[2], PP[3], t2, L[1], 3.5, 3, 2, Z_L2, 1, 0);
    hub(g, PP[2], PP[3], Z_H1);
    tube(g, PP[4], PP[5], t3, L[2], 3, 2.5, 2, Z_L3, 0, 0);
    hub(g, PP[4], PP[5], Z_H2);
    palm(g, PP[6], PP[7], Z_FING);
    const nx = -Math.sin(t3), ny = Math.cos(t3);
    for (let s = -1; s <= 1; s += 2) {
        const bx = PP[6] + Math.cos(t3) * 1.0 + nx * s * 1.9;
        const by = PP[7] + Math.sin(t3) * 1.0 + ny * s * 1.9;
        finger(g, bx, by, t3, s, jaw, Z_FING);
    }
    // 1-cell outline on every empty cell 4-adjacent to a filled one
    const { cols, rows, z, cell } = g;
    for (let r = 0; r < rows; r++) {
        const o = r * cols;
        for (let c = 0; c < cols; c++) {
            const i = o + c;
            if (z[i]) continue;
            if ((c > 0 && z[i - 1]) || (c < cols - 1 && z[i + 1]) || (r > 0 && z[i - cols]) || (r < rows - 1 && z[i + cols])) cell[i] = 8;
        }
    }
}

// ---- browser: renderer, sim, input -----------------------------------------------------

const LEVELS = ["#3A3935", "#55524E", "#78746E", "#9C9890", "#B9B5AD", "#D4D1C9", "#F0EDE7"];
const GLYPHS = [".", ":", "-", "=", "+", "*", "#", "@", "!", "%", "", "+", "*", "."];
const OUTLINE = "#252522", ORANGE = "#FF7A1A", ORANGE_DEEP = "#C4520F";
const GLYPH_BG = "#1a1917";
const GLYPH_FONT = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const TILES = 14; // 7 levels, outline, orange, dark orange, ghost, 3 marker steps

function parseHex(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(h, to, k) {
    const a = parseHex(h);
    return `rgb(${Math.round(a[0] + (to - a[0]) * k)},${Math.round(a[1] + (to - a[1]) * k)},${Math.round(a[2] + (to - a[2]) * k)})`;
}
function lum(h) {
    const a = parseHex(h);
    return (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) / 255;
}

function boot() {
    const root = document.documentElement;
    const wideMQ = matchMedia("(min-width: 768px)");
    const rmMQ = matchMedia("(prefers-reduced-motion: reduce)");
    const debugOn = /[?&]armdebug=1\b/.test(location.search);
    const KEY = "arm-field";

    // layer
    let layer = null, canvas = null, ctx = null, atlas = null, atlasCtx = null;
    let started = false;
    let D = 7, cs = 7, dpr = 1;
    let grid = createGrid();
    const N = COLS * ROWS;
    const occ = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)]; // ring: k, k-1, k-2, k-3
    let frameNo = 0;
    let rect = { left: 0, top: 0, width: 1, height: 1 };

    // state
    let mode = "on"; // on | off | still | animate
    let runState = "off"; // running | paused-hidden | still | off | narrow
    let level = "hero";
    let speed = 1;
    let raf = 0, last = 0, acc = 0, lastRender = 0;
    let simT = 0;
    const q = new Float64Array(HERO), qv = new Float64Array(3), qt = new Float64Array(HERO);
    const P = new Float64Array(10), PT = new Float64Array(10);
    let jaw = JAW_OPEN, jawT = JAW_OPEN;
    let ptrX = -40, ptrY = 50, lastMove = -100, sx = 0, sy = 0, havePtr = false;
    let steer = "wander"; // follow | wander | marker
    let wIdx = 0, wState = 1, wPause = 0, wMoveT = 0;
    const wt = new Float64Array(HERO);
    const tgt = new Float64Array(3);
    const KF = [HERO, [128 * DEG, 12 * DEG, -28 * DEG], [165 * DEG, 10 * DEG, 40 * DEG], REST];
    // markers: x, y, state (0 waiting, 1 gripped/decaying), t
    const MX = new Float64Array(3), MY = new Float64Array(3), MS = new Int8Array(3), MT = new Float64Array(3);
    const MG = new Int8Array(3); // crumb group per marker
    let nMark = 0;
    let holdT = -1;
    let gripLabel = "open";
    let inputOn = false;

    const statusEl = document.getElementById("status-section");
    const readout = document.getElementById("arm-readout");
    const toggle = document.getElementById("arm-toggle");
    let debugEl = null, fpsCount = 0, fpsT = 0, fps = 0;
    let rq1 = 1e9, rq2 = 1e9, rq3 = 1e9, rex = 1e9, rey = 1e9, readT = 0;

    // ---- mode / storage ----
    function readStored() {
        try { return localStorage.getItem(KEY); } catch (_) { return null; }
    }
    function writeStored(v) {
        try { localStorage.setItem(KEY, v); } catch (_) { /* storage blocked */ }
    }
    function effectiveMode() {
        const s = readStored();
        if (rmMQ.matches) return s === "animate" ? "animate" : s === "off" ? "off" : "still";
        return s === "off" ? "off" : "on";
    }
    function nextMode(m) {
        if (rmMQ.matches) return m === "still" ? "animate" : m === "animate" ? "off" : "still";
        return m === "on" ? "off" : "on";
    }
    function paintToggle() {
        if (!toggle) return;
        toggle.textContent = `[field: ${mode}]`;
        toggle.setAttribute("aria-pressed", mode === "on" || mode === "animate" ? "true" : "false");
    }

    // ---- level ----
    function computeLevel() {
        if (document.body.classList.contains("reader-open")) return "calm";
        const a = document.activeElement;
        if (a && a.matches && a.matches("input,textarea,select,[contenteditable]:not([contenteditable='false'])")) return "calm";
        const tp = document.getElementById("term-panel");
        if (tp && !tp.hidden) return "calm";
        const s = statusEl ? statusEl.textContent.trim() : "[about]";
        return s === "[about]" || s === "" ? "hero" : "dim";
    }
    function applyLevel() {
        const l = computeLevel();
        if (l === level && layer && layer.dataset.level === l) return;
        level = l;
        speed = l === "calm" ? 0.5 : 1;
        if (layer) layer.dataset.level = l;
        if (runState === "still") render();
    }

    // ---- atlas ----
    function buildAtlas() {
        if (!atlas) { atlas = document.createElement("canvas"); atlasCtx = atlas.getContext("2d"); }
        atlas.width = D * TILES;
        atlas.height = D;
        const a = atlasCtx;
        a.clearRect(0, 0, atlas.width, atlas.height);
        const fills = [...LEVELS, OUTLINE, ORANGE, ORANGE_DEEP, LEVELS[1], ORANGE, ORANGE, ORANGE];
        const gap = D >= 5 ? 1 : 0;
        a.font = `500 ${Math.max(4, Math.round(D * 0.8))}px ${GLYPH_FONT}`;
        a.textAlign = "center";
        a.textBaseline = "middle";
        for (let t = 0; t < TILES; t++) {
            const x = t * D;
            const f = fills[t];
            a.fillStyle = f;
            a.fillRect(x, 0, D - gap, D - gap);
            const g = GLYPHS[t];
            if (!g) continue;
            const bright = t >= 11 ? false : lum(f) > 0.42;
            a.fillStyle = t >= 11 ? GLYPH_BG : mixHex(f, bright ? 0 : 255, 0.28);
            a.fillText(g, x + (D - gap) / 2, (D - gap) / 2 + 0.5);
        }
    }

    // ---- layout ----
    function layout() {
        if (!layer) return;
        const vw = innerWidth, vh = innerHeight;
        cs = Math.max(6, Math.min(12, Math.round(Math.min(0.4 * vw, 0.6 * vh) / 54)));
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        D = Math.max(3, Math.round(cs * dpr));
        canvas.width = COLS * D;
        canvas.height = ROWS * D;
        layer.style.width = `${(COLS * D) / dpr}px`;
        layer.style.height = `${(ROWS * D) / dpr}px`;
        layer.style.setProperty("--arm-cs", `${cs}px`);
        ctx.imageSmoothingEnabled = false;
        buildAtlas();
        if (crumbCv) { crumbCv.width = innerWidth; crumbCv.height = innerHeight; crumbDirty = true; }
        const r = canvas.getBoundingClientRect();
        rect = { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 };
        if (runState !== "running") render();
    }

    // ---- markers: crumb sprinkle ----
    // One viewport canvas (dpr 1, integer fillRect, no AA). Up to 6 crumb groups: 3 tied to live
    // markers plus detached ones that are vanishing or fading. Typed arrays only, nothing per frame.
    const NG = 6, NC = 9;
    const VANISH = 0.25, FADE = 1.5, POP = 0.08;
    const CRUMB_A = [1, 0.66, 0.33, 0];
    let crumbCv = null, crumbCtx = null, crumbDirty = false, crumbDrawn = false;
    const crumbCol0 = ORANGE, crumbCol1 = ORANGE_DEEP;
    // GSt: 0 free, 1 waiting at click, 2 vanishing (gripped), 3 stepped fade (stale)
    const GX = new Float64Array(NG), GY = new Float64Array(NG), GT = new Float64Array(NG);
    const GSt = new Int8Array(NG), GN = new Uint8Array(NG), GSz = new Uint8Array(NG);
    const GOx = new Int16Array(NG * NC), GOy = new Int16Array(NG * NC), GCol = new Uint8Array(NG * NC);
    function crumbAlloc() {
        let best = -1, bt = -1;
        for (let g = 0; g < NG; g++) {
            if (GSt[g] === 0) return g;
            if (GSt[g] !== 1 && GT[g] > bt) { bt = GT[g]; best = g; }
        }
        return best;
    }
    function crumbSpawn(x, y) {
        const g = crumbAlloc();
        if (g < 0) return -1;
        const s = Math.max(2, Math.round(cs / 3)), R = 4 * cs, minD = 2 * s + 1, b = g * NC;
        const want = 6 + ((Math.random() * 4) | 0);
        let n = 0;
        for (let k = 0; k < want; k++) {
            for (let t = 0; t < 30; t++) {
                const ang = Math.random() * 6.2832, rr = R * Math.sqrt(Math.random());
                const ox = Math.round(Math.cos(ang) * rr), oy = Math.round(Math.sin(ang) * rr);
                let ok = true;
                for (let j = 0; j < n; j++) {
                    const dx = GOx[b + j] - ox, dy = GOy[b + j] - oy;
                    if (dx * dx + dy * dy < minD * minD) { ok = false; break; }
                }
                if (!ok) continue;
                // insertion by distance from click: index order is vanish order
                const d2 = ox * ox + oy * oy;
                let i = n;
                while (i > 0 && GOx[b + i - 1] * GOx[b + i - 1] + GOy[b + i - 1] * GOy[b + i - 1] > d2) {
                    GOx[b + i] = GOx[b + i - 1]; GOy[b + i] = GOy[b + i - 1]; GCol[b + i] = GCol[b + i - 1]; i--;
                }
                GOx[b + i] = ox; GOy[b + i] = oy; GCol[b + i] = Math.random() < 0.25 ? 1 : 0;
                n++;
                break;
            }
        }
        GX[g] = x; GY[g] = y; GT[g] = 0; GSt[g] = 1; GN[g] = n; GSz[g] = s;
        crumbDirty = true;
        return g;
    }
    function crumbTo(g, st) {
        if (g < 0 || GSt[g] !== 1) return;
        GSt[g] = st; GT[g] = 0; crumbDirty = true;
    }
    function crumbAge(dt) {
        for (let g = 0; g < NG; g++) {
            const st = GSt[g];
            if (st === 0) continue;
            GT[g] += dt;
            if ((st === 2 && GT[g] >= VANISH) || (st === 3 && GT[g] >= FADE)) { GSt[g] = 0; crumbDirty = true; }
        }
    }
    function paintCrumbs() {
        if (!crumbCtx) return;
        let any = false;
        for (let g = 0; g < NG; g++) if (GSt[g]) { any = true; break; }
        if (!any && !crumbDrawn && !crumbDirty) return;
        crumbDirty = false;
        const c = crumbCtx;
        c.clearRect(0, 0, crumbCv.width, crumbCv.height);
        crumbDrawn = any;
        if (!any) return;
        const kx = rect.width / COLS, ky = rect.height / ROWS;
        let alpha = 1, col = -1;
        c.globalAlpha = 1;
        for (let g = 0; g < NG; g++) {
            const st = GSt[g];
            if (!st) continue;
            const n = GN[g], s = GSz[g], t = GT[g], b = g * NC;
            const cx = Math.round(rect.left + (grid.bx + GX[g]) * kx), cy = Math.round(rect.top + (grid.by - GY[g]) * ky);
            let a = 1, first = 0, step = 1;
            if (st === 1) { if (t < POP) step = 2; } // 2-step pop: half, then all
            else if (st === 2) first = Math.floor(t / VANISH * n); // nearest-first vanish
            else a = CRUMB_A[Math.min(3, Math.floor(t / (FADE / 4)))];
            if (a !== alpha) { c.globalAlpha = a; alpha = a; }
            if (a === 0) continue;
            const h = s >> 1;
            for (let i = first; i < n; i += step) {
                const cc = GCol[b + i];
                if (cc !== col) { c.fillStyle = cc ? crumbCol1 : crumbCol0; col = cc; }
                c.fillRect(cx + GOx[b + i] - h, cy + GOy[b + i] - h, s, s);
            }
        }
        c.globalAlpha = 1;
    }

    // ---- render ----
    function render() {
        if (!layer || !atlas) return;
        rasterize(q, jaw, grid);
        const { cell, z, cols } = grid;
        // Four-slot ring indexed by frame number: the slot written this frame held k-4 before.
        const cur = occ[frameNo & 3], g1 = occ[(frameNo + 3) & 3], g2 = occ[(frameNo + 2) & 3], g3 = occ[(frameNo + 1) & 3];
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        fk(q, P);
        const speedSum = Math.abs(qv[0]) + Math.abs(qv[1]) + Math.abs(qv[2]);
        const ghostOn = runState === "running" && speedSum > 0.5;
        let gc0 = 0, gc1 = -1, gr0 = 0, gr1 = -1;
        if (ghostOn) {
            const minx = Math.min(P[4], P[6], P[8]) - 6, maxx = Math.max(P[4], P[6], P[8]) + 6;
            const miny = Math.min(P[5], P[7], P[9]) - 6, maxy = Math.max(P[5], P[7], P[9]) + 6;
            gc0 = Math.floor(grid.bx + minx); gc1 = Math.ceil(grid.bx + maxx);
            gr0 = Math.floor(grid.by - maxy); gr1 = Math.ceil(grid.by - miny);
        }
        let alpha = 1;
        for (let r = 0, i = 0; r < ROWS; r++) {
            const y = r * D;
            for (let c = 0; c < cols; c++, i++) {
                const code = cell[i];
                if (code) {
                    if (alpha !== 1) { ctx.globalAlpha = 1; alpha = 1; }
                    ctx.drawImage(atlas, (code - 1) * D, 0, D, D, c * D, y, D, D);
                } else if (ghostOn && c >= gc0 && c <= gc1 && r >= gr0 && r <= gr1) {
                    const a = g1[i] ? 0.35 : g2[i] ? 0.2 : g3[i] ? 0.1 : 0;
                    if (a) {
                        if (alpha !== a) { ctx.globalAlpha = a; alpha = a; }
                        ctx.drawImage(atlas, 10 * D, 0, D, D, c * D, y, D, D);
                    }
                }
            }
        }
        ctx.globalAlpha = 1;
        paintCrumbs();
        // occupancy history: write current into the slot the next frame will read as k-1
        for (let i = 0; i < z.length; i++) cur[i] = z[i] ? 1 : 0;
        frameNo++;
        fpsCount++;
    }

    // ---- sim ----
    function pickWander() {
        let i = wIdx;
        while (i === wIdx) i = (Math.random() * KF.length) | 0;
        wIdx = i;
        for (let k = 0; k < 3; k++) wt[k] = KF[i][k] + (Math.random() - 0.5) * 2 * 4 * DEG;
        clampQ(wt);
        wState = 0; wMoveT = 0;
    }

    function markerAdd(x, y) {
        if (nMark === 3) {
            if (MS[0] === 0) crumbTo(MG[0], 3);
            for (let i = 1; i < 3; i++) { MX[i - 1] = MX[i]; MY[i - 1] = MY[i]; MS[i - 1] = MS[i]; MT[i - 1] = MT[i]; MG[i - 1] = MG[i]; }
            nMark = 2;
        }
        MX[nMark] = x; MY[nMark] = y; MS[nMark] = 0; MT[nMark] = 0; MG[nMark] = crumbSpawn(x, y); nMark++;
    }
    function markerDrop(i) {
        for (let k = i + 1; k < nMark; k++) { MX[k - 1] = MX[k]; MY[k - 1] = MY[k]; MS[k - 1] = MS[k]; MT[k - 1] = MT[k]; MG[k - 1] = MG[k]; }
        nMark--;
    }

    function tick(dt) {
        simT += dt;
        crumbAge(dt);
        // markers age
        let goal = -1;
        for (let m = nMark - 1; m >= 0; m--) {
            MT[m] += dt;
            if (MS[m] === 1 && MT[m] > VANISH) markerDrop(m);
            else if (MS[m] === 0 && MT[m] > 5) { MS[m] = 1; MT[m] = 0; crumbTo(MG[m], 3); }
        }
        for (let m = 0; m < nMark; m++) if (MS[m] === 0) { goal = m; break; }
        const idle = simT - lastMove;
        const want = goal >= 0 ? "marker" : idle < 3 && havePtr ? "follow" : "wander";
        fk(q, P);
        if (want !== steer) {
            if ((want === "follow" || want === "marker") && steer === "wander") { sx = P[8]; sy = P[9]; }
            else if (want === "wander") { wPause = 0; pickWander(); }
            steer = want;
        }
        let jawGoal = JAW_OPEN;
        if (steer === "marker") {
            sx = smoothDamp(sx, MX[goal], dt, TAU); sy = smoothDamp(sy, MY[goal], dt, TAU);
            solveIK(sx, sy, tgt);
            const d = Math.hypot(P[8] - MX[goal], P[9] - MY[goal]);
            const sp = Math.abs(qv[0]) + Math.abs(qv[1]) + Math.abs(qv[2]);
            // Out of reach: after 2s settled at the closest pose, grip anyway so the marker still resolves.
            fk(tgt, PT);
            const atLimit = MT[goal] > 2 && Math.hypot(P[8] - PT[8], P[9] - PT[9]) < 1.2;
            if (holdT < 0 && (d < 1.5 || atLimit) && sp < 0.35) holdT = 0.4;
            if (holdT >= 0) {
                jawGoal = JAW_CLOSED;
                holdT -= dt;
                if (holdT <= 0) { MS[goal] = 1; MT[goal] = 0; holdT = -1; crumbTo(MG[goal], 2); }
            }
            gripLabel = holdT >= 0 ? "closed" : "reach";
        } else {
            holdT = -1;
            gripLabel = "open";
            if (steer === "follow") {
                sx = smoothDamp(sx, ptrX, dt, TAU); sy = smoothDamp(sy, ptrY, dt, TAU);
                solveIK(sx, sy, tgt);
            } else {
                if (wState === 0) {
                    wMoveT += dt;
                    const err = Math.max(Math.abs(q[0] - wt[0]), Math.abs(q[1] - wt[1]), Math.abs(q[2] - wt[2]));
                    if (wMoveT > 0.5 && err < 1.5 * DEG && Math.abs(qv[0]) + Math.abs(qv[1]) + Math.abs(qv[2]) < 0.15) {
                        wState = 1; wPause = 0.8 + Math.random() * 1.6;
                    }
                } else {
                    wPause -= dt;
                    if (wPause <= 0) pickWander();
                }
                tgt[0] = wt[0]; tgt[1] = wt[1]; tgt[2] = wt[2];
            }
        }
        qt[0] = tgt[0]; qt[1] = tgt[1];
        qt[2] = tgt[2] + SWAY * Math.sin(2 * Math.PI * SWAY_HZ * simT);
        springStep(q, qv, qt, 3, dt, OMEGA, ZETA, VMAX);
        keepClear(q);
        jawT = jawGoal;
        jaw = smoothDamp(jaw, jawT, dt, 0.06);
    }

    // ---- loop ----
    const STEP = 1 / 60;
    function frame(now) {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(now - last, 100) / 1000;
        last = now;
        acc += dt;
        let n = 0;
        while (acc >= STEP && n < 4) { tick(STEP * speed); acc -= STEP; n++; }
        if (acc > STEP) acc = 0;
        const minInt = level === "hero" ? 14 : 30;
        if (now - lastRender >= minInt) {
            lastRender = now;
            render();
            updateReadout(now);
        }
        fpsT += dt;
        if (fpsT >= 1) { fps = Math.round(fpsCount / fpsT); fpsCount = 0; fpsT = 0; }
    }

    function shouldRun() {
        return !!layer && (mode === "on" || mode === "animate") && wideMQ.matches && !document.hidden;
    }
    function stopLoop() {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    function startLoop() {
        if (raf) return;
        last = performance.now();
        lastRender = 0;
        acc = 0;
        raf = requestAnimationFrame(frame);
    }

    function pad3(n) { return (n < 10 ? "00" : n < 100 ? "0" : "") + n; }
    function updateReadout(now) {
        if (!readout) return;
        if (now - readT < 100) return;
        readT = now;
        fk(q, P);
        const a = Math.round(q[0] / DEG * 10), b = Math.round(q[1] / DEG * 10), c = Math.round(q[2] / DEG * 10);
        const ex = Math.round(P[8]), ey = Math.round(P[9]);
        if (a === rq1 && b === rq2 && c === rq3 && ex === rex && ey === rey) return;
        rq1 = a; rq2 = b; rq3 = c; rex = ex; rey = ey;
        const f = (t) => (t < 0 ? "-" : "+") + pad3(Math.floor(Math.abs(t) / 10)) + "." + (Math.abs(t) % 10);
        const g = (t) => (t < 0 ? "-" : "+") + pad3(Math.abs(t));
        readout.textContent = `q1 ${f(a)}  q2 ${f(b)}  q3 ${f(c)}  ee x ${g(ex)} y ${g(ey)}`;
    }

    // ---- input ----
    function toWorld(cx, cy) {
        const w = rect.width / COLS, h = rect.height / ROWS;
        ptrX = (cx - rect.left) / w - grid.bx;
        ptrY = grid.by - (cy - rect.top) / h;
    }
    function onMove(e) {
        if (e.pointerType === "touch") return;
        toWorld(e.clientX, e.clientY);
        lastMove = simT;
        havePtr = true;
    }
    function isEmpty(t) {
        if (!(t instanceof Element)) return false;
        if (t.closest("a,button,input,textarea,label,[role],pre,p,li,h1,h2,h3,select,summary")) return false;
        return t === document.body || t === root || t.tagName === "MAIN" || t.tagName === "SECTION" || t.id === "main-container" || !!t.closest("[data-field-empty]");
    }
    function onDown(e) {
        if (e.button !== 0 || !isEmpty(e.target) || level === "calm") return;
        toWorld(e.clientX, e.clientY);
        markerAdd(ptrX, ptrY);
        if (runState !== "running") render();
    }
    function attachInput() {
        if (inputOn) return;
        inputOn = true;
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerdown", onDown, { passive: true });
    }
    function detachInput() {
        if (!inputOn) return;
        inputOn = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerdown", onDown);
    }

    // ---- mode application ----
    function applyMode() {
        mode = effectiveMode();
        paintToggle();
        const wide = wideMQ.matches;
        if (!layer) { runState = "off"; return; }
        stopLoop();
        if (!wide) {
            runState = "narrow";
            layer.hidden = true;
            detachInput();
            if (readout) readout.textContent = "";
            return;
        }
        if (mode === "off") {
            runState = "off";
            layer.hidden = true;
            detachInput();
            if (readout) { readout.textContent = ""; rq1 = 1e9; }
            return;
        }
        layer.hidden = false;
        if (mode === "still") {
            runState = "still";
            detachInput();
            q.set(HERO); qv.fill(0); jaw = JAW_OPEN;
            layout();
            readT = 0; updateReadout(1e6);
            return;
        }
        attachInput();
        layout();
        if (document.hidden) { runState = "paused-hidden"; render(); return; }
        runState = "running";
        startLoop();
    }

    document.addEventListener("visibilitychange", () => {
        if (!layer) return;
        if (document.hidden) {
            if (runState === "running") { stopLoop(); runState = "paused-hidden"; }
        } else if (runState === "paused-hidden" && shouldRun()) {
            runState = "running";
            startLoop();
        }
    });

    // ---- debug ----
    function dbgNum(n) { return (n < 0 ? "-" : "+") + pad3(Math.min(999, Math.round(Math.abs(n)))); }
    function paintDebug() {
        if (!debugEl) return;
        fk(q, P);
        debugEl.textContent =
            `fps ${fps}  run ${runState}  rm ${rmMQ.matches}\n` +
            `ptr x ${dbgNum(ptrX)} y ${dbgNum(ptrY)}  steer ${steer}\n` +
            `q1 ${(q[0] / DEG).toFixed(1)}  q2 ${(q[1] / DEG).toFixed(1)}  q3 ${(q[2] / DEG).toFixed(1)}\n` +
            `level ${level}  grip ${gripLabel}  mode ${mode}`;
    }

    // ---- start ----
    function start() {
        if (started) return;
        started = true;
        layer = document.createElement("div");
        layer.className = "arm-layer";
        layer.setAttribute("aria-hidden", "true");
        layer.dataset.level = level;
        canvas = document.createElement("canvas");
        layer.appendChild(canvas);
        document.body.appendChild(layer);
        crumbCv = document.createElement("canvas");
        crumbCv.setAttribute("aria-hidden", "true");
        crumbCv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:5;image-rendering:pixelated";
        crumbCv.width = innerWidth; crumbCv.height = innerHeight;
        document.body.appendChild(crumbCv);
        crumbCtx = crumbCv.getContext("2d");
        ctx = canvas.getContext("2d");
        applyLevel();
        if (effectiveMode() === "on" || effectiveMode() === "animate") { q.set(REST); wPause = 3; }
        else q.set(HERO);
        applyMode();
        let pending = 0;
        window.addEventListener("resize", () => {
            cancelAnimationFrame(pending);
            pending = requestAnimationFrame(() => { layout(); });
        });
        requestAnimationFrame(() => layer.classList.add("on"));
    }

    function bootAsync() {
        mode = effectiveMode();
        paintToggle();
        if (toggle) {
            toggle.addEventListener("click", () => {
                const n = nextMode(mode);
                writeStored(n);
                applyMode();
            });
        }
        if (debugOn) {
            debugEl = document.createElement("pre");
            debugEl.id = "arm-debug";
            debugEl.setAttribute("aria-hidden", "true");
            document.body.appendChild(debugEl);
            setInterval(paintDebug, 250);
        }
        wideMQ.addEventListener("change", applyMode);
        rmMQ.addEventListener("change", applyMode);
        if (statusEl) new MutationObserver(applyLevel).observe(statusEl, { childList: true, characterData: true, subtree: true });
        new MutationObserver(applyLevel).observe(document.body, { attributes: true, attributeFilter: ["class"] });
        const tp = document.getElementById("term-panel");
        if (tp) new MutationObserver(applyLevel).observe(tp, { attributes: true, attributeFilter: ["hidden"] });
        document.addEventListener("focusin", applyLevel);
        document.addEventListener("focusout", () => setTimeout(applyLevel, 0));
        const go = () => start();
        const fonts = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve();
        fonts.then(() => {
            if (!root.classList.contains("intro")) { go(); return; }
            window.addEventListener("introdone", go, { once: true });
            // The head failsafe removes the intro class without firing the event.
            const mo = new MutationObserver(() => {
                if (!root.classList.contains("intro")) { mo.disconnect(); go(); }
            });
            mo.observe(root, { attributes: true, attributeFilter: ["class"] });
        });
    }
    bootAsync();
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
}
