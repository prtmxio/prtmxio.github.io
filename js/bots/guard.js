// Page bots: legibility guard and calm signal. Runs from the sim clock about every 500ms, no timers, no observers.
import { spriteBox, cellsOf } from "./world.js?v=5";
import { setCalm, CALM_ALPHA, BLOCKED_ALPHA } from "./brain.js?v=5";

const INTERACTIVE = "a,button,input,textarea,select,label,summary,[role='button'],[contenteditable]:not([contenteditable='false'])";
const BACKGROUND = new Set(["HTML", "BODY", "MAIN", "SECTION", "CANVAS", "SVG"]);

// Calm = blog reader open, a form field focused or the terminal open. arm.js already derives this and
// writes it to .arm-layer[data-level]; read that, and only repeat the three checks if the arm is not there.
export function readCalm() {
    const arm = document.querySelector(".arm-layer");
    if (arm && arm.dataset.level) return arm.dataset.level === "calm";
    if (document.body.classList.contains("reader-open")) return true;
    const a = document.activeElement;
    if (a && a.matches && a.matches("input,textarea,select,[contenteditable]:not([contenteditable='false'])")) return true;
    const tp = document.getElementById("term-panel");
    return !!(tp && !tp.hidden);
}

function hasOwnText(el) {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
}

// Is text or an interactive element above this viewport point? (the bots canvas has pointer-events none,
// so elementsFromPoint only returns page content)
function blockedAt(x, y) {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    for (const el of document.elementsFromPoint(x, y)) {
        if (BACKGROUND.has(el.tagName.toUpperCase()) || el.id === "main-container" || el.hasAttribute("data-field-empty")) continue;
        if (el.matches(INTERACTIVE) || hasOwnText(el)) return true;
    }
    return false;
}

// Three points per bot: centre and two inset corners.
export function readBlocked(b, sc) {
    const box = spriteBox(b, sc), { w, h } = cellsOf(b), W = w * sc.c, H = h * sc.c, i = 2 * sc.c;
    return blockedAt(box.left + W / 2, box.top + H / 2) || blockedAt(box.left + i, box.top + i) || blockedAt(box.left + W - i, box.top + H - i);
}

const target = (calm, blocked) => Math.min(calm ? CALM_ALPHA : 1, blocked ? BLOCKED_ALPHA : 1);

// Called every ~500ms. Two matching readings in a row before a bot starts to fade (no flicker at text edges).
export function guardTick(sim) {
    const calm = readCalm();
    if (calm !== sim.calm) setCalm(sim, calm);
    for (const b of sim.bots) {
        if (b.surface === "wall") { b.targetAlpha = target(calm, b.blocked); continue; }
        const now = readBlocked(b, sim.sc);
        if (now === b.lastRead) b.blocked = now;
        b.lastRead = now;
        b.targetAlpha = target(calm, b.blocked);
    }
    return calm;
}

// Reduced motion: one pass when drawing, applied at once.
export function guardStatic(bots, sc) {
    const calm = readCalm();
    for (const b of bots) b.alpha = b.targetAlpha = target(calm, readBlocked(b, sc));
}
