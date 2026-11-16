// Hero ASCII robot arm: 3-link FABRIK arm on a canvas in the hero's open field.
// Decorative only: aria-hidden, pointer-events none, listeners on window.
const FPS_STEP = 1000 / 30;
const DT = 1 / 30;
const LINKS = [0.36, 0.3, 0.22];
const SPEED = 0.6; // fraction of field height per second
const IDLE_MS = 2500;
const HOLD_MS = 1500;
const MARK_MS = 1200;
const MAX_MARKS = 3;
const READOUT_H = 40;
const MIN_SPACE = 240;
const IGNORE =
    "a,button,input,textarea,select,label,summary,[contenteditable],.hero,p,li,h1,h2,h3,h4,pre,code,dd,dt,nav,header,.sidenav";

const root = document.documentElement;
const reducedMQ = matchMedia("(prefers-reduced-motion: reduce)");
const wideMQ = matchMedia("(min-width: 768px)");
const reduced = reducedMQ.matches;

let started = false;
let field, canvas, ctx, readoutEl, about, hero;
let w = 0, h = 0, dpr = 1;
let cw = 8, chh = 18, cols = 0, rows = 0, fontStr = "";
let gch = [], gcol = new Uint8Array(0);
let colors = ["#b5b2ab", "#959189", "#ff7a1a"]; // sub, muted, accent
let baseX = 0, baseY = 0, lens = [0, 0, 0], reach = 0;
let joints = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
let eff = { x: 0, y: 0 }; // smoothed target
let goal = { x: 0, y: 0 };
let ptr = null; // last pointer client coords
let rect = null;
let lastMove = 0, holdUntil = 0, mode = "idle";
let marks = [];
let shown = false, heroVisible = true, rafId = 0, last = 0, acc = 0, dirty = true;
let lastReadout = "";
let dprMQ = null;

function pad(n, width) {
    return Math.abs(n).toFixed(1).padStart(width, "0");
}
function sgn(n) {
    return n < 0 ? "-" : "+";
}
function norm(a) {
    while (a > 180) a -= 360;
    while (a <= -180) a += 360;
    return a;
}

function readColors() {
    const cs = getComputedStyle(root);
    const g = (n, f) => cs.getPropertyValue(n).trim() || f;
    colors = [g("--sub", colors[0]), g("--muted", colors[1]), g("--accent", colors[2])];
    dirty = true;
}

function measure() {
    const cs = getComputedStyle(root);
    const fs = parseFloat(cs.getPropertyValue("--t-ui")) || 13;
    const fam = cs.getPropertyValue("--font-mono").trim() || "monospace";
    fontStr = `400 ${fs}px ${fam}`;
    ctx.font = fontStr;
    cw = ctx.measureText("M").width || fs * 0.6;
    chh = Math.round(fs * 1.4);
}

function placeField() {
    // Returns true when the field is shown.
    if (!wideMQ.matches || !about || !hero) return false;
    const ar = about.getBoundingClientRect();
    const hr = hero.getBoundingClientRect();
    let right = hr.right;
    for (const el of hero.children) {
        const r = el.getBoundingClientRect();
        right = Math.max(right, r.left + Math.max(r.width, el.scrollWidth || 0));
    }
    const space = ar.right - right;
    if (space < MIN_SPACE || hr.height < 200) return false;
    const width = Math.min(ar.width * 0.34, 420, space);
    field.style.top = `${hr.top - ar.top}px`;
    field.style.width = `${width}px`;
    field.style.height = `${hr.height}px`;
    return true;
}

function build() {
    // Size canvas, grid and geometry from current field box.
    const cr = canvas.getBoundingClientRect();
    w = cr.width;
    h = cr.height;
    if (w < 40 || h < 80) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measure();
    cols = Math.max(8, Math.floor(w / cw));
    rows = Math.max(8, Math.floor(h / chh));
    gch = new Array(cols * rows).fill("");
    gcol = new Uint8Array(cols * rows);
    baseX = (Math.floor(cols / 2) + 0.5) * cw;
    baseY = (rows - 3) * chh + chh / 2;
    lens = LINKS.map((f) => f * baseY);
    reach = lens[0] + lens[1] + lens[2];
    rect = null;
    const first = joints[3].x === 0 && joints[3].y === 0;
    if (first || reduced) {
        const a = reduced ? 1.15 : Math.PI / 2;
        joints[0] = { x: baseX, y: baseY };
        if (reduced) {
            goal = { x: baseX + Math.cos(a) * reach * 0.62, y: baseY - Math.sin(a) * reach * 0.8 };
        } else {
            goal = { x: baseX, y: baseY - reach * 0.7 };
        }
        // Slightly bent seed pose so FABRIK does not start collinear.
        let px = baseX, py = baseY;
        const seed = [1.45, 1.7, 1.35];
        for (let i = 0; i < 3; i++) {
            px += Math.cos(seed[i]) * lens[i] * (i === 1 ? -1 : 1) * 0.4;
            py -= Math.sin(seed[i]) * lens[i];
            joints[i + 1] = { x: px, y: py };
        }
        eff = { x: goal.x, y: goal.y };
        for (let i = 0; i < 20; i++) solve(eff);
    } else {
        eff.x = Math.min(Math.max(eff.x, 0), w);
        eff.y = Math.min(eff.y, baseY);
        solve(eff);
    }
    dirty = true;
}

function clampGoal(t) {
    let x = Math.min(Math.max(t.x, 0), w);
    let y = Math.min(t.y, baseY);
    const dx = x - baseX, dy = y - baseY;
    const d = Math.hypot(dx, dy);
    if (d > reach) {
        x = baseX + (dx / d) * reach;
        y = baseY + (dy / d) * reach;
    }
    return { x, y };
}

function constrain(prev, p, L) {
    // Keep a joint above the base line and inside the field, preserving link length.
    if (p.y > baseY) {
        const dy = baseY - prev.y;
        const dx = Math.sqrt(Math.max(0, L * L - dy * dy));
        p.y = baseY;
        p.x = prev.x + (p.x >= prev.x ? dx : -dx);
    }
    if (p.x < 0 || p.x > w) {
        const cx = Math.min(Math.max(p.x, 0), w);
        const dx = cx - prev.x;
        const dy = Math.sqrt(Math.max(0, L * L - dx * dx));
        p.x = cx;
        p.y = prev.y + (p.y >= prev.y ? dy : -dy);
        if (p.y > baseY) p.y = baseY;
    }
}

function solve(t) {
    const p = joints;
    const target = clampGoal(t);
    for (let it = 0; it < 10; it++) {
        // backward: end effector to target
        p[3].x = target.x;
        p[3].y = target.y;
        for (let i = 2; i >= 0; i--) {
            const dx = p[i].x - p[i + 1].x, dy = p[i].y - p[i + 1].y;
            const d = Math.hypot(dx, dy) || 1;
            p[i].x = p[i + 1].x + (dx / d) * lens[i];
            p[i].y = p[i + 1].y + (dy / d) * lens[i];
        }
        // forward: base fixed, constrained
        p[0].x = baseX;
        p[0].y = baseY;
        for (let i = 0; i < 3; i++) {
            const dx = p[i + 1].x - p[i].x, dy = p[i + 1].y - p[i].y;
            const d = Math.hypot(dx, dy) || 1;
            p[i + 1].x = p[i].x + (dx / d) * lens[i];
            p[i + 1].y = p[i].y + (dy / d) * lens[i];
            constrain(p[i], p[i + 1], lens[i]);
        }
        if (Math.hypot(p[3].x - target.x, p[3].y - target.y) < 0.5) break;
    }
}

function setGoalFromPointer() {
    if (!ptr) return;
    if (!rect) rect = canvas.getBoundingClientRect();
    goal = { x: ptr.x - rect.left, y: ptr.y - rect.top };
}

function update(now) {
    if (mode === "follow" && now - lastMove > IDLE_MS && now > holdUntil) mode = "idle";
    if (now > holdUntil) {
        if (mode === "idle") {
            const t = now / 1000;
            const th = Math.PI / 2 + (Math.PI / 3) * Math.sin(Math.PI * 2 * 0.08 * t);
            goal = { x: baseX + Math.cos(th) * reach * 0.75, y: baseY - Math.sin(th) * reach * 0.75 };
        } else if (mode === "follow") {
            setGoalFromPointer();
        }
    }
    const g = clampGoal(goal);
    const dx = g.x - eff.x, dy = g.y - eff.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.05) {
        const v = Math.min(SPEED * baseY, dist * 8); // capped, eases out near the goal
        const step = Math.min(dist, v * DT);
        eff.x += (dx / dist) * step;
        eff.y += (dy / dist) * step;
        solve(eff);
        dirty = true;
    }
    if (marks.length) {
        marks = marks.filter((m) => now - m.t < MARK_MS);
        dirty = true;
    }
}

function put(cx, cy, ch, col) {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
    const i = cy * cols + cx;
    gch[i] = ch;
    gcol[i] = col;
}

function line(x0, y0, x1, y1, ch, col) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 400; n++) {
        put(x0, y0, ch, col);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}

function glyph(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const a = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
    if (a < 22.5 || a > 157.5) return "-";
    if (a > 67.5 && a < 112.5) return "|";
    return dx * dy < 0 ? "/" : "\\";
}

function cellX(x) { return Math.min(cols - 1, Math.max(0, Math.floor(x / cw))); }
function cellY(y) { return Math.min(rows - 1, Math.max(0, Math.floor(y / chh))); }

function draw(now) {
    gch.fill("");
    const p = joints;
    for (let i = 0; i < 3; i++) {
        line(cellX(p[i].x), cellY(p[i].y), cellX(p[i + 1].x), cellY(p[i + 1].y),
            glyph(p[i].x, p[i].y, p[i + 1].x, p[i + 1].y), 0);
    }
    put(cellX(p[1].x), cellY(p[1].y), "o", 0);
    put(cellX(p[2].x), cellY(p[2].y), "o", 0);
    // base
    const bc = Math.floor(cols / 2), br = rows - 3;
    const rowsTxt = ["_[#]_", "[###]", "====="];
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 5; c++) put(bc - 2 + c, br + r, rowsTxt[r][c], 1);
    }
    for (const m of marks) put(cellX(m.x), cellY(m.y), "+", 2);
    put(cellX(p[3].x), cellY(p[3].y), "*", 2);

    ctx.clearRect(0, 0, w, h);
    ctx.font = fontStr;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let cur = -1;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i = r * cols + c;
            const ch = gch[i];
            if (!ch) continue;
            const col = gcol[i];
            if (col !== cur) { ctx.fillStyle = colors[col]; cur = col; }
            let a = 1;
            if (col === 2 && ch === "+") {
                for (const m of marks) {
                    if (cellX(m.x) === c && cellY(m.y) === r) {
                        a = 1 - Math.floor(((now - m.t) / MARK_MS) * 4) / 4;
                        break;
                    }
                }
            }
            if (a !== 1) ctx.globalAlpha = Math.max(a, 0.25);
            ctx.fillText(ch, (c + 0.5) * cw, (r + 0.5) * chh);
            if (a !== 1) ctx.globalAlpha = 1;
        }
    }
    dirty = false;
    updateReadout();
}

function updateReadout() {
    const p = joints;
    const a1 = (Math.atan2(baseY - p[1].y, p[1].x - p[0].x) * 180) / Math.PI;
    const a2 = (Math.atan2(p[1].y - p[2].y, p[2].x - p[1].x) * 180) / Math.PI;
    const a3 = (Math.atan2(p[2].y - p[3].y, p[3].x - p[2].x) * 180) / Math.PI;
    const q2 = norm(a2 - a1), q3 = norm(a3 - a2);
    const ex = Math.round(p[3].x - p[0].x), ey = Math.round(baseY - p[3].y);
    const s =
        `q1 ${sgn(a1)}${pad(a1, 5)}°  q2 ${sgn(q2)}${pad(q2, 5)}°  q3 ${sgn(q3)}${pad(q3, 5)}°\n` +
        `ee x ${sgn(ex)}${String(Math.abs(ex)).padStart(3, "0")} y ${sgn(ey)}${String(Math.abs(ey)).padStart(3, "0")}`;
    if (s !== lastReadout) {
        lastReadout = s;
        readoutEl.textContent = s;
    }
}

function frame(t) {
    rafId = requestAnimationFrame(frame);
    if (!last) last = t;
    acc += t - last;
    last = t;
    if (acc < FPS_STEP - 1) return;
    acc = acc % FPS_STEP;
    update(t);
    if (dirty) draw(t);
}

function sync() {
    const want = started && !reduced && shown && heroVisible && !document.hidden;
    if (want && !rafId) {
        last = 0;
        acc = 0;
        lastMove = Math.max(lastMove, performance.now());
        rafId = requestAnimationFrame(frame);
    } else if (!want && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
    }
}

function relayout() {
    if (!started) return;
    const ok = placeField();
    shown = ok;
    field.hidden = !ok;
    if (ok) build();
    if (ok && reduced) draw(0);
    sync();
}

function onMove(e) {
    ptr = { x: e.clientX, y: e.clientY };
    lastMove = performance.now();
    if (lastMove > holdUntil) mode = "follow";
}

function onDown(e) {
    if (e.button !== 0 || !shown) return;
    const tg = e.target;
    if (tg && tg.closest && tg.closest(IGNORE)) return;
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString()) return;
    if (!rect) rect = canvas.getBoundingClientRect();
    const now = performance.now();
    const g = clampGoal({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    goal = g;
    mode = "follow";
    lastMove = now;
    holdUntil = now + HOLD_MS;
    marks.push({ x: g.x, y: g.y, t: now });
    if (marks.length > MAX_MARKS) marks.shift();
    dirty = true;
}

function watchDpr() {
    if (dprMQ) dprMQ.removeEventListener("change", onDpr);
    dprMQ = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    dprMQ.addEventListener("change", onDpr);
}
function onDpr() {
    watchDpr();
    relayout();
}

function start() {
    if (started) return;
    started = true;
    about = document.getElementById("about");
    hero = about && about.querySelector(".hero");
    if (!about || !hero) return;

    field = document.createElement("div");
    field.className = "arm-field";
    field.setAttribute("aria-hidden", "true");
    field.hidden = true;
    canvas = document.createElement("canvas");
    readoutEl = document.createElement("pre");
    readoutEl.className = "arm-readout";
    field.append(canvas, readoutEl);
    about.appendChild(field);
    ctx = canvas.getContext("2d");
    readColors();

    const go = () => {
        relayout();
        // Fade in after layout so the stepped transition runs from opacity 0.
        requestAnimationFrame(() => field.classList.add("on"));
    };
    const fontP = document.fonts && document.fonts.load
        ? Promise.race([
              document.fonts.load("400 13px 'IBM Plex Mono'").catch(() => {}),
              new Promise((r) => setTimeout(r, 1500)),
          ])
        : Promise.resolve();
    fontP.then(go);

    new MutationObserver(() => { readColors(); if (reduced && shown) draw(0); })
        .observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    new ResizeObserver(() => relayout()).observe(hero);
    new ResizeObserver(() => relayout()).observe(about);
    wideMQ.addEventListener("change", relayout);
    watchDpr();
    document.fonts && document.fonts.ready.then(() => relayout());

    if (!reduced) {
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerdown", onDown, { passive: true });
        window.addEventListener("scroll", () => { rect = null; }, { passive: true });
        document.addEventListener("visibilitychange", sync);
        new IntersectionObserver((es) => {
            heroVisible = es[es.length - 1].isIntersecting;
            sync();
        }).observe(hero);
    }
}

function gate() {
    if (!root.classList.contains("intro")) {
        start();
        return;
    }
    window.addEventListener("introdone", start, { once: true });
    const mo = new MutationObserver(() => {
        if (!root.classList.contains("intro")) {
            mo.disconnect();
            start();
        }
    });
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", gate, { once: true });
} else {
    gate();
}
