// Pixel sprites for the three page bots: Floatie (R-1), Rover (R-2), Waddle (R-3).
// Sprites only: no behaviour, no page integration. Drawn facing right; flip at draw time.
// One char per cell: '.' empty, '@' outline, '1'..'7' grey ramp (7 lightest), 'o' orange, 'O' dark orange.
// Light from the top-left. Bodies are hand-authored row templates; expressions are hand-authored
// visor patches stamped into them, so frames stay small and consistent.

export const DARK = { "@": "#252522", 1: "#3A3935", 2: "#55524E", 3: "#78746E", 4: "#9C9890", 5: "#B9B5AD", 6: "#D4D1C9", 7: "#F0EDE7", o: "#FF7A1A", O: "#C4520F" };
export const LIGHT_LINE = "#D9D5CC"; // outline on the light theme, same as the arm

// Light theme: reverse the grey ramp (1<->7, 2<->6, 3<->5); outline from the arm's light line.
export function palette(light = false, line = LIGHT_LINE) {
    if (!light) return { ...DARK };
    const p = { ...DARK, "@": line };
    for (let i = 1; i <= 7; i++) p[i] = DARK[8 - i];
    return p;
}

// ---------- row helpers (strings in, strings out) ----------
const blank = (w) => ".".repeat(w);
const sub = (row, x, s) => row.slice(0, x) + s + row.slice(x + s.length);
// Stamp a patch at (x, y). ' ' keeps the cell, '.' becomes outline/visor fill.
const stamp = (rows, x, y, patch) => {
    const out = rows.slice();
    patch.forEach((p, j) => {
        let r = out[y + j];
        for (let i = 0; i < p.length; i++) if (p[i] !== " ") r = sub(r, x + i, p[i] === "." ? "@" : p[i]);
        out[y + j] = r;
    });
    return out;
};

// ======================= R-1 FLOATIE 12x10 =======================
// rows: 0 rotor, 1-7 helmet, 8-9 flame. Visor patch at (3,4), 6x2, framed by a grey bezel.
const F_BODY = [
    "............", // 0 rotor (replaced per frame)
    "...@6776@...", // 1 cap (mast joins the rotor)
    "..@677543@..", // 2 dome
    ".6222222224.", // 3 bezel
    ".62@@@@@@24.", // 4 visor
    ".62@@@@@@24.", // 5
    ".5222222223.", // 6 bezel
    "...@4334@...", // 7 nozzle
];
const F_ROTOR = [".5555555555.", "....4444....", ".5555775555.", "..44444444.."];
const F_ROTOR_STOP = "...333333...";
const F_VISOR = {
    idle: [".7..7.", ".7..7."],
    blink: ["......", ".7..7."],
    lookL: ["7..7..", "7..7.."],
    lookR: ["..7..7", "..7..7"],
    surprised: ["77..77", "77..77"],
    sleep: ["......", "55..55"],
    happy: ["77..77", "7....7"],
    confusedA: [".7....", ".7..7."],
    confusedB: ["....7.", ".7..7."],
};
function floatie({ visor, rotor, dy = 0, flame = 2 }) {
    let body = F_BODY.slice();
    body[0] = rotor;
    body = stamp(body, 3, 4, F_VISOR[visor]);
    body[2] = sub(body[2], 0, "o"); // left antenna fin
    body[3] = sub(body[3], 0, "o");
    body[4] = sub(body[4], 0, "O");
    body[4] = sub(body[4], 11, "o"); // right pod
    body[5] = sub(body[5], 11, "O");
    const rows = new Array(10).fill(blank(12));
    body.forEach((r, i) => { rows[i + dy] = r; });
    if (flame >= 1) rows[8 + dy] = "....oooo....";
    if (flame >= 2) rows[9 + dy] = ".....oO.....";
    return rows;
}

// ======================= R-2 ROVER 14x10 =======================
// rows: 0-1 antenna, 2-6 body, 7-9 tracks. Visor patch at (3,4), 8x2.
const R_BODY = [
    "..............", // 0 antenna lamp (stamped)
    "..............", // 1 stalk (stamped)
    ".677777777774.", // 2
    ".622222222223.", // 3 bezel
    ".62@@@@@@@@24.", // 4 visor
    ".62@@@@@@@@24.", // 5
    ".422222222223.", // 6 bezel
];
const R_VISOR = {
    idle: [".77..77.", ".44..44."], // half-lidded
    blink: ["........", ".44..44."],
    lookL: ["77..77..", "44..44.."],
    lookR: ["..77..77", "..44..44"],
    surprised: ["777..777", "777..777"],
    sleepA: ["........", ".66..66."],
    sleepB: ["........", ".33..33."],
    happy: [".77..77.", ".7....7."],
    confusedA: [".77.....", ".77..77."],
    confusedB: ["....77..", ".77..77."],
};
function tracks(k) {
    let mid = "13oo";
    for (let c = 4; c <= 9; c++) mid += "3322"[(c + k) & 3]; // tread loop, period 4
    return [".444444444444.", mid + "oo31", ".222222222222."];
}
function rover({ visor, tread = 0, lamp = "o", ant = 4 }) {
    const body = R_BODY.slice();
    body[0] = sub(body[0], ant, lamp);
    body[1] = sub(body[1], ant, "3");
    return stamp(body, 3, 4, R_VISOR[visor]).concat(tracks(tread));
}

// ======================= R-3 WADDLE 14x12 =======================
// rows: 0-9 body (ears 0-1), 10-11 feet. Visor patch at (3,4), 8x3.
const W_BODY = [
    ".4o4......4o4.", // 0 ear tips
    ".444677775444.", // 1 ear bases, head top
    ".667777776654.", // 2
    ".622222222223.", // 3 bezel
    "652@@@@@@@@233", // 4 face
    "652@@@@@@@@233", // 5
    "652@@@@@@@@233", // 6
    ".422222222233.", // 7 bezel
    ".433333322222.", // 8
    "..3222222221..", // 9
];
const W_VISOR = {
    idle: ["........", "..7..7..", "..7..7.."],
    blink: ["........", "........", "..7..7.."],
    lookL: ["........", ".7..7...", ".7..7..."],
    lookR: ["........", "...7..7.", "...7..7."],
    surprised: ["........", ".77..77.", ".77..77."],
    sleep: ["........", ".55..55.", "........"],
    happy: ["........", ".77..77.", ".7....7."],
    confusedA: ["........", "..7.....", "..7..77."],
    confusedB: ["........", ".....7..", ".77..7.."],
};
// shift: body drop in rows. Foot: 2 planted (rows 10-11), 1 stubby planted (row 11), -1 lifted (row 10).
function waddle({ visor, shift = 0, footL = 2, footR = 2 }) {
    const body = stamp(W_BODY, 3, 4, W_VISOR[visor]);
    const rows = new Array(12).fill(blank(14));
    body.forEach((r, i) => { rows[i + shift] = r; });
    const foot = (x, h) => {
        if (h === 2) { rows[10] = sub(rows[10], x, "3553"); rows[11] = sub(rows[11], x, "2222"); }
        else if (h === 1) rows[11] = sub(rows[11], x, "3553");
        else rows[10] = sub(rows[10], x, "3553");
    };
    foot(2, footL);
    foot(8, footR);
    return rows;
}

// ======================= bots =======================
const SQ = { shift: 1, footL: 1, footR: 1 }; // squashed stance

export const BOTS = {
    floatie: {
        id: "R-1", name: "Floatie", mood: "curious", w: 12, h: 10,
        anchor: { x: 6, y: 10 }, // hover baseline: bottom edge of the flame, centred
        frames: {
            idle: [floatie({ visor: "idle", rotor: F_ROTOR[0] }), floatie({ visor: "blink", rotor: F_ROTOR[3], dy: 1, flame: 1 })],
            move: [
                floatie({ visor: "idle", rotor: F_ROTOR[0] }),
                floatie({ visor: "idle", rotor: F_ROTOR[1], dy: 1, flame: 1 }),
                floatie({ visor: "idle", rotor: F_ROTOR[2] }),
                floatie({ visor: "idle", rotor: F_ROTOR[3], dy: 1, flame: 1 }),
            ],
            lookL: [floatie({ visor: "lookL", rotor: F_ROTOR[0] })],
            lookR: [floatie({ visor: "lookR", rotor: F_ROTOR[0] })],
            surprised: [floatie({ visor: "surprised", rotor: F_ROTOR[1], flame: 0 }), floatie({ visor: "surprised", rotor: F_ROTOR[3], flame: 0 })],
            sleeping: [floatie({ visor: "sleep", rotor: F_ROTOR_STOP, dy: 1, flame: 0 }), floatie({ visor: "sleep", rotor: F_ROTOR_STOP, dy: 1, flame: 1 })],
            happy: [floatie({ visor: "happy", rotor: F_ROTOR[0] }), floatie({ visor: "happy", rotor: F_ROTOR[1], dy: 1, flame: 1 }), floatie({ visor: "happy", rotor: F_ROTOR[2] })],
            confused: [floatie({ visor: "confusedA", rotor: F_ROTOR[0] }), floatie({ visor: "confusedB", rotor: F_ROTOR[3], dy: 1, flame: 1 })],
        },
    },
    rover: {
        id: "R-2", name: "Rover", mood: "sleepy", w: 14, h: 10,
        anchor: { x: 7, y: 10 }, // bottom edge of the tracks, centred
        frames: {
            idle: [rover({ visor: "idle" }), rover({ visor: "blink", lamp: "O" })],
            move: [0, 1, 2, 3].map((k) => rover({ visor: "idle", tread: k })),
            lookL: [rover({ visor: "lookL" })],
            lookR: [rover({ visor: "lookR" })],
            surprised: [rover({ visor: "surprised" }), rover({ visor: "surprised", lamp: "O" })],
            sleeping: [rover({ visor: "sleepA", lamp: "O" }), rover({ visor: "sleepB", lamp: "O" })],
            happy: [rover({ visor: "happy" }), rover({ visor: "happy", lamp: "O", tread: 2 }), rover({ visor: "happy", tread: 1 })],
            confused: [rover({ visor: "confusedA" }), rover({ visor: "confusedB", lamp: "O" })],
        },
    },
    waddle: {
        id: "R-3", name: "Waddle", mood: "silly", w: 14, h: 12,
        anchor: { x: 7, y: 12 }, // sole of the feet, centred
        frames: {
            idle: [waddle({ visor: "idle" }), waddle({ visor: "blink", ...SQ })],
            move: [waddle({ visor: "idle", ...SQ }), waddle({ visor: "idle", footL: 2, footR: -1 }), waddle({ visor: "idle", ...SQ }), waddle({ visor: "idle", footL: -1, footR: 2 })],
            lookL: [waddle({ visor: "lookL" })],
            lookR: [waddle({ visor: "lookR" })],
            surprised: [waddle({ visor: "surprised" }), waddle({ visor: "surprised", ...SQ })],
            sleeping: [waddle({ visor: "sleep", ...SQ }), waddle({ visor: "sleep", ...SQ, footL: -1 })],
            happy: [waddle({ visor: "happy" }), waddle({ visor: "happy", ...SQ }), waddle({ visor: "happy", footL: -1, footR: -1 })],
            confused: [waddle({ visor: "confusedA" }), waddle({ visor: "confusedB", ...SQ })],
        },
    },
};
for (const b of Object.values(BOTS)) {
    for (const [name, list] of Object.entries(b.frames)) {
        for (const f of list) {
            if (f.length !== b.h || f.some((r) => r.length !== b.w)) throw new Error(`bad frame ${b.name}.${name}`);
        }
    }
}

// ======================= pixel font 3x5 =======================
export const FONT = {
    o: [".#.", "#.#", "#.#", "#.#", ".#."],
    _: ["...", "...", "...", "...", "###"],
    "?": ["###", "..#", ".#.", "...", ".#."],
    "!": [".#.", ".#.", ".#.", "...", ".#."],
    "^": [".#.", "#.#", "...", "...", "..."],
    "-": ["...", "...", "###", "...", "..."],
    z: ["...", "###", ".#.", "#..", "###"],
    Z: ["###", "..#", ".#.", "#..", "###"],
    ":": ["...", ".#.", "...", ".#.", "..."],
    3: ["###", "..#", ".##", "..#", "###"],
    ",": ["...", "...", "...", ".#.", "#.."],
    ".": ["...", "...", "...", "...", ".#."],
    " ": ["...", "...", "...", "...", "..."],
};
export const FONT_H = 5;

// Text as rows of the sprite alphabet: ink char on '.', one blank column between glyphs.
export function textRows(text, ink = "7") {
    const rows = ["", "", "", "", ""];
    [...text].forEach((ch, i) => {
        const g = FONT[ch] || FONT[" "];
        for (let y = 0; y < 5; y++) rows[y] += (i ? "." : "") + g[y].replace(/#/g, ink);
    });
    return rows;
}

// Bubble 9-slice: cut corners, 1-cell outline edges, dark fill centre, light text.
// Padding 2 cells left/right, 1 above/below. A 3-row tail hangs under the left or right end.
export const BUBBLE = { outline: "3", fill: "1", ink: "7", padX: 2, padY: 1 };
export function bubbleRows(text, tail = "left") {
    const { outline: O, fill: F, ink, padX, padY } = BUBBLE;
    const t = textRows(text, ink);
    const tw = t[0].length;
    const w = tw + 2 * padX + 2, h = 5 + 2 * padY + 2;
    const rows = [];
    for (let y = 0; y < h; y++) {
        let r = "";
        for (let x = 0; x < w; x++) {
            const ex = x === 0 || x === w - 1, ey = y === 0 || y === h - 1;
            r += ex && ey ? "." : ex || ey ? O : F;
        }
        rows.push(r);
    }
    for (let y = 0; y < 5; y++) {
        let r = rows[1 + padY + y];
        for (let x = 0; x < tw; x++) if (t[y][x] !== ".") r = sub(r, 1 + padX + x, t[y][x]);
        rows[1 + padY + y] = r;
    }
    const left = tail === "left";
    const x0 = left ? 2 : w - 4; // 2-wide opening in the bottom border at x0..x0+1
    rows[h - 1] = sub(rows[h - 1], x0, F + F);
    const line = (cols, fills) => {
        let r = blank(w);
        for (const c of cols) r = sub(r, c, O);
        for (const c of fills) r = sub(r, c, F);
        return r;
    };
    if (left) { // wedge points down-left
        rows.push(line([x0 - 1, x0 + 2], [x0, x0 + 1]));
        rows.push(line([x0 - 1, x0 + 1], [x0]));
        rows.push(line([x0 - 1], []));
    } else { // wedge points down-right
        rows.push(line([x0 - 1, x0 + 2], [x0, x0 + 1]));
        rows.push(line([x0, x0 + 2], [x0 + 1]));
        rows.push(line([x0 + 2], []));
    }
    return rows;
}

// ======================= overlays (separate cells, not part of the body frame) =======================
// Each overlay is a list of steps; a step is a list of {dx, dy, rows}: offset in cells from the sprite's
// top-left, may be negative or beyond the body (above, to the right).
const glyph = (ch, ink) => FONT[ch].map((r) => r.replace(/#/g, ink));
for (const b of Object.values(BOTS)) {
    b.overlays = {
        sleep: [
            [{ dx: b.w - 2, dy: 1, rows: glyph("z", "5") }],
            [{ dx: b.w - 2, dy: 1, rows: glyph("z", "4") }, { dx: b.w + 2, dy: -5, rows: glyph("Z", "6") }],
        ],
    };
}
BOTS.waddle.overlays.happy = [ // sparks when excited
    [{ dx: BOTS.waddle.w - 1, dy: -3, rows: ["o.o", ".O.", "o.."] }],
    [{ dx: BOTS.waddle.w, dy: -4, rows: ["..o", ".o.", "O.o"] }],
];

// ======================= lossless transforms (string-array in, string-array out) =======================
export const flipH = (rows) => rows.map((r) => [...r].reverse().join(""));
export const flipV = (rows) => rows.slice().reverse();
export function rotCW(rows) { // 90 degrees clockwise: new width = old height
    const h = rows.length, w = rows[0].length, out = [];
    for (let x = 0; x < w; x++) {
        let r = "";
        for (let y = h - 1; y >= 0; y--) r += rows[y][x];
        out.push(r);
    }
    return out;
}
export const rotCCW = (rows) => rotCW(rotCW(rotCW(rows)));
export const rot180 = (rows) => flipV(flipH(rows));
// o = {flipH, flipV, rot: quarter turns clockwise}. Flips apply first, then the rotation.
export function orient(rows, o = {}) {
    let r = rows;
    if (o.flipH) r = flipH(r);
    if (o.flipV) r = flipV(r);
    for (let i = 0; i < ((o.rot || 0) & 3); i++) r = rotCW(r);
    return r;
}
const orientKey = (o = {}) => `${o.flipH ? 1 : 0}${o.flipV ? 1 : 0}${(o.rot || 0) & 3}`;

// ======================= atlas =======================
// cellPx is an integer device-pixel scale. For a crisp result at devicePixelRatio d and a css cell of c px,
// pass cellPxFor(c, d). Every frame is prerendered once; orientation variants render once on first use.
export const cellPxFor = (cssCell, dpr = 1) => Math.max(1, Math.round(cssCell * dpr));

function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    return Object.assign(document.createElement("canvas"), { width: w, height: h });
}
function render(rows, cellPx, pal) {
    const h = rows.length, w = rows[0].length;
    const c = makeCanvas(w * cellPx, h * cellPx);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const col = pal[rows[y][x]];
            if (col) { g.fillStyle = col; g.fillRect(x * cellPx, y * cellPx, cellPx, cellPx); }
        }
    }
    return c;
}

export function buildAtlas(cellPx, { light = false, line = LIGHT_LINE } = {}) {
    cellPx = Math.max(1, Math.round(cellPx));
    const pal = palette(light, line);
    const cache = new Map();
    const get = (key, rows, o) => {
        const k = `${key}|${orientKey(o)}`;
        let c = cache.get(k);
        if (!c) { c = render(orient(rows, o), cellPx, pal); cache.set(k, c); }
        return c;
    };
    const atlas = {
        cellPx, light,
        // canvas for bot key ('floatie'), anim ('idle'), frame index, orientation
        frame: (bot, anim, i = 0, o) => get(`${bot}.${anim}.${i}`, BOTS[bot].frames[anim][i], o),
        // overlay step: [{canvas, dx, dy}] with dx, dy in cells
        overlay: (bot, name, step = 0) => (BOTS[bot].overlays[name][step] || []).map((p, j) => ({ canvas: get(`${bot}.ov.${name}.${step}.${j}`, p.rows), dx: p.dx, dy: p.dy })),
        bubble: (text, tail = "left", o) => get(`bubble.${tail}.${text}`, bubbleRows(text, tail), o),
        sprite: (key, rows, o) => get(key, rows, o),
    };
    for (const [bot, b] of Object.entries(BOTS)) {
        for (const [anim, list] of Object.entries(b.frames)) list.forEach((_, i) => atlas.frame(bot, anim, i));
    }
    return atlas;
}
