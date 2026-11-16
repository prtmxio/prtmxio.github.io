// Page bots: ceiling rotation. Exactly one bot lives on the ceiling. After 90-240s (re-rolled after every swap,
// first swap not before 60s, 10-20s with ?botdebug=1) it swaps with a random floor bot:
//   up bot   (floor -> ceiling): runs to the left edge, climbs the left wall in the inner lane (rotated a quarter
//            turn), steps onto the ceiling when it is empty and walks off the corner upside down.
//   down bot (ceiling -> floor): runs to the left edge along the ceiling, climbs down the outer lane, lands on
//            the floor when the landing is clear and walks off.
// Floatie flies: straight up to hover under the ceiling, or straight down to a free spot on the floor.
// The right wall is the arm's, so the left edge is the only free one. CLIMB = false in world.js switches to
// edge-wrap (walk off the left edge, re-enter on the other surface) with the same state machine.
import { startAct, isTransit, rnd, gapTo } from "./brain.js?v=6";
import { CLIMB, laneBounds } from "./world.js?v=6";

const RUN = 75; // scurry speed to and from the wall, cells per second
const FIRST_MIN = 60; // seconds
const roll = (sim) => (sim.debug ? rnd(10, 20) : rnd(90, 240));

export function installTransit(sim) {
    if (sim.sc.narrow) return; // below 768px Floatie stays on the ceiling and Waddle on the floor
    sim.swap = null;
    sim.swapAt = sim.debug ? rnd(10, 20) : Math.max(FIRST_MIN, roll(sim));
    sim.hooks.transit = stepTransit;
    sim.hooks.schedule = schedule;
}

function schedule(sim, dt) {
    if (sim.swap) return;
    if (sim.calm) { sim.swapAt += dt; return; } // timer held while calm
    if (sim.T < sim.swapAt) return;
    const down = sim.bots.find((b) => b.surface === "ceiling" && !isTransit(b));
    const ups = sim.bots.filter((b) => b.surface === "floor" && !isTransit(b));
    if (!down || !ups.length) { sim.swapAt = sim.T + 5; return; }
    const up = ups[Math.floor(Math.random() * ups.length)];
    sim.swap = { up, down };
    begin(sim, up, "up", down);
    begin(sim, down, "down", up);
}

const liftMax = (sim, b) => (sim.sc.floorY - sim.sc.ceilY - 2 * sim.sc.c) / sim.sc.c - b.h;

function setTr(sim, b, act) {
    b.act = act;
    b.actStart = sim.T;
    b.tr.tw = sim.T;
}

function begin(sim, b, role, partner) {
    const tWall = rnd(4, 8); // the wall leg (or the flight) takes 4-8s
    b.tr = { role, partner, tWall };
    b.ov = null;
    b.anim = "move";
    b.fi = 0;
    b.fAt = sim.T;
    b.afterAct = null;
    if (sim.bubble && sim.bubble.bot === b.key) sim.bubble = null;
    if (b.key === "floatie") {
        b.tr.lMax = liftMax(sim, b);
        if (role === "up") {
            b.tr.v = (b.tr.lMax - b.lift) / tWall;
        } else {
            b.surface = "floor"; // same pixels: top = ceilY + 2 cells
            b.lift = b.tr.lMax;
            b.tr.v = (b.tr.lMax - 2) / tWall;
            b.tr.tx = pickLanding(sim, b);
        }
        setTr(sim, b, "tr_fly");
    } else {
        b.face = -1;
        setTr(sim, b, "tr_edge");
    }
}

// A free x on the floor for Floatie to settle at.
function pickLanding(sim, b) {
    const [lo, hi] = laneBounds({ ...b, surface: "floor" }, sim.sc);
    for (let i = 0; i < 12; i++) {
        const x = lo + Math.random() * (hi - lo);
        if (sim.bots.every((o) => o === b || o.surface !== "floor" || isTransit(o) || Math.abs(o.x - x) > gapTo(sim, b, o) + 4 * sim.sc.c)) return x;
    }
    return Math.max(lo, Math.min(hi, b.x));
}

const ceilingBusy = (sim, b) => sim.bots.some((o) => o !== b && o.surface === "ceiling");
function landingClear(sim, b, landX) {
    return sim.bots.every((o) => o === b || o.surface !== "floor" || (o.key === "floatie" && o.lift > 8) || Math.abs(o.x - landX) >= gapTo(sim, b, o));
}

function finish(sim, b) {
    b.tr = null;
    startAct(sim, b, "idle", rnd(0.8, 1.6));
    const s = sim.swap;
    if (s && !s.up.tr && !s.down.tr) {
        sim.swap = null;
        sim.swapAt = sim.T + roll(sim); // re-rolled after every swap
    }
}

function stepTransit(sim, b, dt) {
    const sc = sim.sc, c = sc.c, T = sim.T, tr = b.tr;
    if (!tr) { startAct(sim, b, "idle", 1); return; }
    if (T >= b.fAt) { b.fi = (b.fi + 1) % 4; b.fAt = T + 0.09; }
    const hw = (b.w * c) / 2, up = tr.role === "up";
    switch (b.act) {
        case "tr_edge": {
            const stop = CLIMB ? (up ? sc.innerLeft + hw : hw) : -hw - 2;
            b.x -= RUN * c * dt;
            if (b.x > stop) break;
            b.x = stop;
            if (CLIMB) {
                b.surface = "wall";
                b.lane = up ? "in" : "out";
                b.climbDir = up ? -1 : 1;
                b.y = up ? sc.floorY - hw : sc.ceilY + hw;
                tr.speed = (sc.floorY - sc.ceilY - b.w * c) / tr.tWall;
                setTr(sim, b, "tr_climb");
            } else setTr(sim, b, "tr_wait");
            break;
        }
        case "tr_climb": {
            b.y += b.climbDir * tr.speed * dt;
            const top = sc.ceilY + hw, bot = sc.floorY - hw;
            if (b.climbDir < 0 ? b.y <= top : b.y >= bot) { b.y = b.climbDir < 0 ? top : bot; setTr(sim, b, "tr_wait"); }
            break;
        }
        case "tr_wait": {
            if (up) {
                if (ceilingBusy(sim, b)) break; // never two on the ceiling
                b.surface = "ceiling";
                b.x = CLIMB ? sc.innerLeft + hw : -hw;
                b.face = 1;
                b.lift = b.key === "floatie" ? 2 : 0;
                tr.exitX = sc.innerLeft + hw + 24 * c;
                if (b.key === "floatie") { finish(sim, b); break; }
                setTr(sim, b, "tr_exit");
            } else {
                const landX = CLIMB ? hw : -hw;
                if (!landingClear(sim, b, hw) && T - tr.tw < 4) break; // wait up to 4s for the landing, then land anyway
                b.surface = "floor";
                b.x = landX;
                b.face = 1;
                b.lift = 0;
                tr.exitX = sc.innerLeft + hw + 20 * c;
                setTr(sim, b, "tr_exit");
            }
            break;
        }
        case "tr_exit": {
            const [, hi] = laneBounds(b, sc);
            b.x += b.face * RUN * c * dt;
            if (b.x >= Math.min(tr.exitX, hi)) finish(sim, b);
            break;
        }
        case "tr_fly": {
            if (up) {
                b.lift += tr.v * dt;
                if (b.lift >= tr.lMax) { b.lift = tr.lMax; setTr(sim, b, "tr_wait"); }
            } else {
                b.lift -= tr.v * dt;
                const d = tr.tx - b.x;
                b.x += Math.sign(d) * Math.min(Math.abs(d), RUN * c * 0.35 * dt);
                if (d) b.face = Math.sign(d);
                if (b.lift <= 2) { b.lift = 2; finish(sim, b); }
            }
            break;
        }
        default: break;
    }
}
