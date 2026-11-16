// Page bots: world geometry. Pure functions plus one DOM measurement (measure).
// Units: css px for positions, cells for sprite dimensions and lift. Draw code converts to device px.
import { BOTS } from "./sprites.js?v=5";

export const CLIMB = true; // false: edge-wrap swap (walk off the left edge, re-enter on the other surface)
export const WIDE = "(min-width: 768px)";
export const GRIPPER_CELLS = 6.4; // arm gripper width in arm cells (closed jaw, from arm.js finger geometry)
export const WIDEST = 14; // widest bot sprite, cells

// Everything the layout depends on, read from the page. Called on start, resize and from the guard tick.
export function measure() {
    const vw = innerWidth, vh = innerHeight;
    const narrow = !matchMedia(WIDE).matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bar = document.querySelector(".rail-bar");
    const ceilY = bar ? Math.round(bar.getBoundingClientRect().bottom) : narrow ? 44 : 48;
    let floorY = vh;
    const sb = document.querySelector(".statusbar");
    if (sb) {
        const r = sb.getBoundingClientRect();
        if (r.height > 0 && getComputedStyle(sb).display !== "none") floorY = Math.round(r.top);
    }
    let armLeft = null, armCs = 0;
    const layer = document.querySelector(".arm-layer");
    if (layer && !narrow) {
        armCs = parseFloat(getComputedStyle(layer).getPropertyValue("--arm-cs")) || 0;
        const cv = layer.querySelector("canvas");
        if (cv && !layer.hidden) {
            const r = cv.getBoundingClientRect();
            if (r.width > 1 && r.height > 1) armLeft = Math.round(r.left);
        }
    }
    // 3px cells, or 4px when the widest bot (14 cells) is no wider than the arm gripper on screen.
    const cell = !narrow && armCs && GRIPPER_CELLS * armCs >= WIDEST * 4 ? 4 : 3;
    const cellPx = Math.max(1, Math.round(cell * dpr));
    const c = cellPx / dpr; // effective css size of one sprite cell
    const laneL = 0;
    let laneR = armLeft == null ? vw : Math.min(vw, armLeft);
    if (laneR - laneL < 160) laneR = Math.min(vw, laneL + 160);
    return { vw, vh, dpr, cell, cellPx, c, ceilY, floorY, laneL, laneR, narrow, armLeft, innerLeft: 15 * c };
}

export function newBot(key, surface, x) {
    const d = BOTS[key];
    return {
        key, name: d.name, w: d.w, h: d.h, def: d,
        surface, x, y: 0, lane: "out", face: 1, climbDir: -1,
        lift: key === "floatie" ? 2 : 0,
        anim: "idle", fi: 0, ov: null, ovi: 0,
        alpha: 1, targetAlpha: 1,
        act: "idle", mood: d.mood, base: d.mood,
    };
}

// Sprite size in cells for the current orientation (a wall bot is rotated a quarter turn).
export const cellsOf = (b) => (b.surface === "wall" ? { w: b.h, h: b.w } : { w: b.w, h: b.h });

// Lossless orientation for the atlas. Floatie flies, so it is never flipped upside down or rotated.
export function orientOf(b) {
    if (b.surface === "wall") return { flipH: b.climbDir < 0, rot: 1 };
    const o = { flipH: b.face < 0 };
    if (b.surface === "ceiling" && b.key !== "floatie") o.flipV = true;
    return o;
}

// Top-left of the sprite in css px.
export function spriteBox(b, sc) {
    const { w, h } = cellsOf(b), c = sc.c, lift = Math.round(b.lift);
    if (b.surface === "floor") return { left: b.x - (w * c) / 2, top: sc.floorY - (h + lift) * c };
    if (b.surface === "ceiling") return { left: b.x - (w * c) / 2, top: sc.ceilY + lift * c };
    return { left: b.lane === "in" ? sc.innerLeft : 0, top: b.y - (h * c) / 2 };
}

// Allowed range for a bot's centre x. The floor lane stops at the arm's canvas rect.
export function laneBounds(b, sc) {
    const half = (b.w * sc.c) / 2;
    const lo = (b.surface === "ceiling" ? 0 : sc.laneL) + half;
    const hi = (b.surface === "ceiling" ? sc.vw : sc.laneR) - half;
    return hi > lo ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2];
}

// Rest layout (also the reduced-motion layout and the sim's starting layout).
export function layoutBots(sc) {
    const mk = (key, surface, f) => {
        const b = newBot(key, surface, 0);
        const [lo, hi] = laneBounds(b, sc);
        b.x = Math.round(lo + (hi - lo) * f);
        return b;
    };
    return sc.narrow
        ? [mk("floatie", "ceiling", 0.62), mk("waddle", "floor", 0.45)]
        : [mk("floatie", "ceiling", 0.62), mk("rover", "floor", 0.28), mk("waddle", "floor", 0.7)];
}
