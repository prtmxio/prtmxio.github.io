// Page bots: behaviour. No DOM. Personality = base weights per bot, mood = temporary multipliers.
// All timers are deadlines on the sim clock (sim.T, seconds of active time), never setTimeout.
import { layoutBots, laneBounds } from "./world.js?v=5";

export const rnd = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;

// Baseline action weights per personality. Speeds are cells per second.
export const PERS = {
    floatie: { speed: 14, w: { idle: 3, walk: 2, look: 3, tilt: 2, spin: 0.5, sleep: 0.3, glance: 2, bounce: 0, startle: 0.2 } },
    rover: { speed: 7, w: { idle: 4, walk: 1.5, look: 1, tilt: 0, spin: 0, sleep: 2, glance: 0.5, bounce: 0, startle: 0.1 } },
    waddle: { speed: 18, w: { idle: 1.5, walk: 3, look: 1, tilt: 0, spin: 1.2, sleep: 0.2, glance: 1, bounce: 3, startle: 0.4 } },
};
// Mood multipliers on top of the personality weights.
const MOOD = {
    curious: { look: 2, glance: 2 },
    sleepy: { sleep: 3, walk: 0.5, idle: 1.5 },
    silly: { bounce: 2, spin: 2, tilt: 1.5, startle: 2 },
    excited: { walk: 1.8, bounce: 2, idle: 0.3 },
    confused: { look: 2 },
    happy: { spin: 1.5 },
    surprised: {},
    sleeping: {},
};
const SHIFT_POOL = ["curious", "sleepy", "silly"];
const ALPHA = [0.25, 0.35, 0.5, 0.75, 1];
export const CALM_ALPHA = 0.35;
export const BLOCKED_ALPHA = 0.25;

export function createSim(sc, { debug = false } = {}) {
    const sim = {
        T: 0, sc, debug, calm: false, bubble: null, bots: layoutBots(sc),
        ptr: { x: 0, y: 0, t: -99 }, pairCd: new Map(), lastEvent: -99,
        hooks: { transit: null, events: null, schedule: null },
    };
    sim.bots.forEach((b, i) => initBot(sim, b, i));
    return sim;
}

function initBot(sim, b, i) {
    const T = sim.T;
    b.nextShift = T + rnd(8, 25);
    b.moodUntil = 0;
    b.lastAct = "idle";
    b.lastGlance = -99;
    b.fadeAt = 0;
    b.seed = i;
    b.cause = null;
    startAct(sim, b, "idle", rnd(0.6, 2));
    b.face = chance(0.5) ? 1 : -1;
}

export const baseLift = (b) => (b.key === "floatie" ? 2 : 0);
export const isTransit = (b) => b.act.startsWith("tr_");
const speedPx = (sim, b) => PERS[b.key].speed * (MOOD[b.mood]?.walk || 1) * sim.sc.c * (b.key === "rover" && b.mood === "excited" ? 1.3 : 1);

// Sprite-space look: lookR means "toward the sprite's facing". dir is the screen direction (-1 or 1).
export function lookAnim(b, dir) {
    return dir * b.face > 0 ? "lookR" : "lookL";
}

export function setMood(sim, b, mood, dur) {
    b.mood = mood;
    b.moodUntil = dur ? sim.T + dur : 0;
}

export function startAct(sim, b, act, dur, extra = {}) {
    const T = sim.T;
    b.lastAct = b.act;
    b.act = act;
    b.actStart = T;
    b.actEnd = T + dur;
    b.fi = 0;
    b.fAt = T;
    b.ov = null;
    b.ovi = 0;
    b.lift = baseLift(b);
    b.cause = extra.cause || null;
    b.afterAct = extra.after || null;
    b.target = extra.target ?? null;
    switch (act) {
        case "idle": b.anim = "idle"; b.fAt = T + rnd(0.5, 0.9); break;
        case "walk": b.anim = "move"; b.fAt = T + rnd(0.12, 0.18); break;
        case "look": b.anim = extra.anim || "lookR"; break;
        case "glance": b.anim = extra.anim || "lookR"; b.lastGlance = T; break;
        case "sleep": b.anim = "sleeping"; b.ov = "sleep"; b.fAt = T + rnd(0.6, 0.9); break;
        case "react": b.anim = extra.anim || "surprised"; b.fAt = T + 0.2; b.ov = extra.ov || null; b.seq = extra.seq || null; b.seqI = 0; if (b.seq) b.anim = b.seq[0]; break;
        case "spin": b.anim = "idle"; b.fAt = T + 0.09; break;
        case "bounce": b.anim = "happy"; break;
        case "tilt": b.anim = "lookL"; b.fAt = T + 0.22; break;
        case "hover": b.anim = "idle"; b.fAt = T + rnd(0.5, 0.9); break;
        default: b.anim = "idle";
    }
}

function wake(sim, b) {
    startAct(sim, b, "idle", rnd(0.5, 1));
}

function pickNext(sim, b) {
    const T = sim.T;
    if (sim.calm) { startAct(sim, b, "sleep", 1e9); return; }
    if (b.afterAct === "sleep") { startAct(sim, b, "sleep", rnd(3, 6)); return; }
    if (b.act !== "idle" && b.act !== "sleep" && chance(0.5)) { startAct(sim, b, "idle", rnd(0.8, 2.5)); return; }
    const w = { ...PERS[b.key].w };
    const m = MOOD[b.mood] || {};
    for (const k in m) if (k in w) w[k] *= m[k];
    const near = sim.ptr && T - sim.ptr.t < 2.5 && b.surface !== "wall" && Math.hypot(sim.ptr.x - b.x, sim.ptr.y - botY(sim, b)) < 300;
    if (!near || T - b.lastGlance < 4) w.glance = 0;
    if (b.lastAct === "sleep") w.sleep = 0;
    let sum = 0;
    for (const k in w) sum += w[k];
    let r = Math.random() * sum, act = "idle";
    for (const k in w) { r -= w[k]; if (r <= 0) { act = k; break; } }
    switch (act) {
        case "idle": startAct(sim, b, "idle", rnd(0.8, 2.5)); break;
        case "walk": {
            const [lo, hi] = laneBounds(b, sim.sc);
            b.face = b.x - lo < 30 ? 1 : hi - b.x < 30 ? -1 : chance(0.5) ? 1 : -1;
            startAct(sim, b, "walk", rnd(1, 3));
            break;
        }
        case "look": {
            const r2 = Math.random();
            startAct(sim, b, "look", rnd(1, 3), { anim: r2 < 0.15 ? "lookUp" : r2 < 0.575 ? "lookL" : "lookR" });
            break;
        }
        case "sleep": startAct(sim, b, "sleep", b.key === "rover" ? rnd(4, 12) : rnd(4, 8)); break;
        case "spin": startAct(sim, b, "spin", 0.54); break;
        case "bounce": startAct(sim, b, "bounce", Math.round(rnd(2, 3)) * 0.42); break;
        case "tilt": startAct(sim, b, "tilt", rnd(0.8, 1.4)); break;
        case "glance": startAct(sim, b, "glance", rnd(0.6, 1.2), { anim: lookAnim(b, Math.sign(sim.ptr.x - b.x) || 1) }); break;
        case "startle": startAct(sim, b, "react", rnd(0.5, 0.9), { anim: "surprised" }); setMood(sim, b, "surprised", 1); break;
        default: startAct(sim, b, "idle", rnd(0.8, 2));
    }
}

function botY(sim, b) {
    return b.surface === "ceiling" ? sim.sc.ceilY + 10 : sim.sc.floorY - 10;
}

function stepMood(sim, b) {
    const T = sim.T;
    if (T >= b.nextShift) {
        b.nextShift = T + rnd(8, 25);
        if (b.mood === b.base) {
            const m = chance(0.5) ? b.base : SHIFT_POOL[Math.floor(Math.random() * SHIFT_POOL.length)];
            if (m !== b.base) setMood(sim, b, m, rnd(6, 14));
        }
    }
    if (b.mood !== b.base && b.moodUntil && T >= b.moodUntil) { b.mood = b.base; b.moodUntil = 0; }
}

// Stepped fade: one alpha level per 100ms toward the target.
function stepAlpha(sim, b) {
    if (b.alpha === b.targetAlpha || sim.T < b.fadeAt) return;
    b.fadeAt = sim.T + 0.1;
    let i = ALPHA.indexOf(b.alpha);
    if (i < 0) i = ALPHA.length - 1;
    const t = ALPHA.reduce((best, a, k) => (Math.abs(a - b.targetAlpha) < Math.abs(ALPHA[best] - b.targetAlpha) ? k : best), 0);
    b.alpha = ALPHA[i + Math.sign(t - i)];
}

// Keep clear of other bots on the same surface: never overlap, never touch.
export function gapTo(sim, a, o) {
    return (a.w + o.w) * sim.sc.c * 0.5 + 2 * sim.sc.c;
}
function blockedAhead(sim, b, nx) {
    for (const o of sim.bots) {
        if (o === b || o.surface !== b.surface || isTransit(o)) continue;
        const g = gapTo(sim, b, o);
        if (Math.abs(nx - o.x) < g && Math.abs(nx - o.x) < Math.abs(b.x - o.x)) return true;
    }
    return false;
}

function moveWalk(sim, b, dt) {
    const [lo, hi] = laneBounds(b, sim.sc);
    const nx = b.x + b.face * speedPx(sim, b) * dt;
    if (blockedAhead(sim, b, nx)) { startAct(sim, b, "idle", rnd(0.6, 1.4)); return; }
    b.x = nx;
    if (b.x <= lo || b.x >= hi) {
        const atArm = b.x >= hi && b.surface === "floor" && sim.sc.armLeft != null;
        b.x = Math.max(lo, Math.min(hi, b.x));
        if (atArm && chance(0.35)) {
            // occasionally look up at the arm before turning back
            startAct(sim, b, "look", rnd(1, 2), { anim: "lookUp", after: "turn" });
        } else {
            b.face = -b.face;
            if (chance(0.5)) startAct(sim, b, "idle", rnd(0.6, 1.6));
        }
    }
}

function animate(sim, b) {
    const T = sim.T, def = b.def, n = (def.frames[b.anim] || def.frames.idle).length;
    if (b.act !== "react" && b.act !== "sleep" && b.key === "floatie" && (b.act === "idle" || b.act === "walk" || b.act === "look" || b.act === "glance")) {
        b.lift = baseLift(b) + (((Math.floor(T / 0.7) + b.seed) & 1) ? 1 : 0); // hover bob
    }
    switch (b.act) {
        case "idle":
            if (T >= b.fAt) { b.fi = b.fi ? 0 : 1; b.fAt = T + (b.fi ? 0.14 : rnd(0.5, 0.9)); }
            break;
        case "walk":
            if (T >= b.fAt) { b.fi = (b.fi + 1) % n; b.fAt = T + rnd(0.12, 0.18); }
            break;
        case "sleep":
            if (T >= b.fAt) { b.fi = (b.fi + 1) % n; b.ovi = b.fi; b.fAt = T + rnd(0.6, 0.9); }
            break;
        case "react":
            if (b.seq) {
                if (T >= b.fAt) { b.seqI = (b.seqI + 1) % b.seq.length; b.anim = b.seq[b.seqI]; b.fi = 0; b.fAt = T + 0.6; }
            } else if (T >= b.fAt) { b.fi = (b.fi + 1) % n; b.ovi = b.fi; b.fAt = T + 0.2; }
            break;
        case "spin":
            if (T >= b.fAt) { b.face = -b.face; b.fAt = T + 0.09; if (b.key === "floatie") b.fi = (b.fi + 1) % 4; }
            b.anim = b.key === "floatie" ? "move" : "idle";
            break;
        case "bounce": {
            const p = ((T - b.actStart) / 0.42) % 1;
            b.lift = Math.round(16 * p * (1 - p)); // 4 cells at the apex
            if (b.lift > 0) { b.anim = "happy"; b.fi = 0; } else { b.anim = "idle"; b.fi = 1; }
            break;
        }
        case "tilt":
            if (T >= b.fAt) { b.anim = b.anim === "lookL" ? "lookR" : "lookL"; b.fAt = T + 0.22; }
            b.lift = baseLift(b) + ((Math.floor((T - b.actStart) / 0.22)) & 1);
            break;
        case "hover":
            if (T >= b.fAt) { b.fi = b.fi ? 0 : 1; b.fAt = T + (b.fi ? 0.14 : rnd(0.5, 0.9)); }
            b.lift = baseLift(b) + ((Math.floor(T / 0.6) + b.seed) & 1);
            break;
        default: break;
    }
}

function stepHover(sim, b, dt) {
    const o = b.target && sim.bots.find((x) => x.key === b.target);
    if (!o) return;
    const want = o.x + Math.sign(b.x - o.x || 1) * (gapTo(sim, b, o) + 6 * sim.sc.c);
    const [lo, hi] = laneBounds(b, sim.sc);
    const tx = Math.max(lo, Math.min(hi, want));
    const d = tx - b.x;
    if (Math.abs(d) > 1) {
        b.x += Math.sign(d) * Math.min(Math.abs(d), speedPx(sim, b) * dt);
        b.face = Math.sign(d);
    } else b.face = Math.sign(o.x - b.x) || b.face;
}

function stepBot(sim, b, dt) {
    const T = sim.T;
    if (isTransit(b)) { if (sim.hooks.transit) sim.hooks.transit(sim, b, dt); return; }
    animate(sim, b);
    if (b.act === "walk") moveWalk(sim, b, dt);
    else if (b.act === "hover") stepHover(sim, b, dt);
    if (T >= b.actEnd) {
        const a = b.act;
        if (b.afterAct === "turn") b.face = -b.face;
        if (a === "spin" && chance(0.5)) b.face = -b.face;
        if (a === "sleep" || a === "react" || a === "hover") { if (a === "sleep" && !sim.calm) wake(sim, b); else pickNext(sim, b); }
        else pickNext(sim, b);
    }
}

export function step(sim, T, dt) {
    sim.T = T;
    if (sim.bubble && T >= sim.bubble.until) sim.bubble = null;
    for (const b of sim.bots) { stepMood(sim, b); stepAlpha(sim, b); stepBot(sim, b, dt); }
    if (sim.hooks.events) sim.hooks.events(sim);
    if (sim.hooks.schedule) sim.hooks.schedule(sim, dt);
}

export function onPointer(sim, x, y) {
    sim.ptr.x = x; sim.ptr.y = y; sim.ptr.t = sim.T;
}

// Calm: everyone falls asleep where they are (transits finish first).
export function setCalm(sim, on) {
    if (sim.calm === on) return;
    sim.calm = on;
    sim.bubble = null;
    for (const b of sim.bots) {
        if (isTransit(b)) continue;
        if (on) startAct(sim, b, "sleep", 1e9);
        else wake(sim, b);
    }
}

// Rescene after a resize: keep bots inside the new lanes.
export function rescene(sim, sc) {
    sim.sc = sc;
    for (const b of sim.bots) {
        if (b.surface === "wall") continue;
        const [lo, hi] = laneBounds(b, sc);
        b.x = Math.max(lo, Math.min(hi, b.x));
    }
}

export function say(sim, b, text, dur = rnd(1, 2)) {
    if (sim.calm || isTransit(b) || b.alpha < 0.5 || b.surface === "wall") return false;
    if (sim.bubble && sim.T < sim.bubble.until) return false; // one bubble at a time
    const [, hi] = laneBounds(b, sim.sc);
    sim.bubble = { bot: b.key, text, tail: b.x > hi - 60 ? "right" : "left", until: sim.T + dur };
    return true;
}
