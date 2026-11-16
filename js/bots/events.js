// Page bots: interactions. Proximity checks on a 250ms tick, a per-pair cooldown and a global rate limit.
// Reactions are tagged (cause) and never emit events themselves, so nothing cascades. Never physical:
// bots only look, emote or hover at a distance.
import { startAct, setMood, say, lookAnim, isTransit, rnd } from "./brain.js?v=5";

const PAIR_CD = 8; // seconds, per pair
const GLOBAL_GAP = 1.5; // seconds between any two events
const TICK = 0.25;
const WAKING = new Set(["idle", "walk", "look", "glance", "tilt"]); // acts a bot can be pulled out of

const pk = (a, b) => (a.key < b.key ? `${a.key}:${b.key}` : `${b.key}:${a.key}`);
const chance = (p) => Math.random() < p;

export function installEvents(sim) {
    let next = 0;
    const px = (n) => (n * sim.sc.c) / 3; // thresholds are authored for 3px cells

    // ok: same surface. seen: floor and ceiling bots can also see each other (horizontal distance only).
    const ok = (a, b) => a.surface === b.surface && a.surface !== "wall" && !isTransit(a) && !isTransit(b);
    const seen = (a, b) => a.surface !== "wall" && b.surface !== "wall" && !isTransit(a) && !isTransit(b);
    const cooled = (a, b) => sim.T >= (sim.pairCd.get(pk(a, b)) || 0);
    const fire = (a, b) => { sim.pairCd.set(pk(a, b), sim.T + PAIR_CD); sim.lastEvent = sim.T; };
    const dirTo = (a, b) => Math.sign(b.x - a.x) || 1;
    const dist = (a, b) => Math.abs(a.x - b.x);
    const by = (k) => sim.bots.find((b) => b.key === k);

    sim.hooks.events = () => {
        if (sim.T < next) return;
        next = sim.T + TICK;
        if (sim.calm) return;
        const T = sim.T;

        // "-_-" when a bot nods off (only the bubble; the zzz overlay is part of the sleep sprite).
        for (const b of sim.bots) {
            if (b.act === "sleep" && b.sleepSaid !== b.actStart) {
                b.sleepSaid = b.actStart;
                if (chance(0.6)) say(sim, b, "-_-", rnd(1, 1.6));
            }
        }
        if (T - sim.lastEvent < GLOBAL_GAP) return;

        const f = by("floatie"), r = by("rover"), w = by("waddle");

        // 1. One bot is surprised: the nearest other bot reacts once.
        for (const a of sim.bots) {
            if (a.act !== "react" || a.anim !== "surprised" || a.cause || a.surpHandled === a.actStart) continue;
            a.surpHandled = a.actStart;
            let best = null;
            for (const o of sim.bots) {
                if (o === a || !seen(a, o) || !cooled(a, o) || !WAKING.has(o.act) || dist(a, o) > px(200)) continue;
                if (!best || dist(a, o) < dist(a, best)) best = o;
            }
            if (best) {
                fire(a, best);
                startAct(sim, best, "react", rnd(0.6, 1), { anim: "confused", cause: "event" });
                setMood(sim, best, "confused", rnd(3, 5));
                say(sim, best, "??");
                return;
            }
        }

        // 2. Floatie sees Rover asleep: hovers nearby (never closer than a body plus a gap).
        if (f && r && ok(f, r) && cooled(f, r) && r.act === "sleep" && WAKING.has(f.act) && dist(f, r) < px(160)) {
            fire(f, r);
            startAct(sim, f, "hover", rnd(3, 6), { target: "rover", cause: "event" });
            say(sim, f, "o_o");
            return;
        }

        // 3. Rover sees Waddle bouncing: briefly opens its eyes, then dozes again. Sometimes ignores it.
        if (r && w && ok(r, w) && cooled(r, w) && r.act === "sleep" && w.act === "bounce" && dist(r, w) < px(160)) {
            fire(r, w);
            if (chance(0.5)) {
                startAct(sim, r, "react", rnd(0.7, 1.1), { anim: lookAnim(r, dirTo(r, w)), after: "sleep", cause: "event" });
                say(sim, r, "o_o", 0.9);
            }
            return;
        }

        // 4. Waddle sees Floatie: gets excited.
        if (w && f && seen(w, f) && cooled(w, f) && WAKING.has(w.act) && dist(w, f) < px(140)) {
            fire(w, f);
            startAct(sim, w, "react", rnd(0.9, 1.2), { anim: "happy", ov: "happy", cause: "event" });
            setMood(sim, w, "excited", rnd(3, 5));
            say(sim, w, "^_^ !!", 1.4);
            return;
        }

        // 5. Two idle bots close together swap expressions.
        for (let i = 0; i < sim.bots.length; i++) {
            for (let j = i + 1; j < sim.bots.length; j++) {
                const a = sim.bots[i], b = sim.bots[j];
                if (!ok(a, b) || !cooled(a, b) || a.act !== "idle" || b.act !== "idle" || dist(a, b) > px(100)) continue;
                fire(a, b);
                if (a.key === "rover" || b.key === "rover") { if (chance(0.5)) continue; } // Rover sometimes ignores
                startAct(sim, a, "react", 1.2, { anim: "happy", seq: ["happy", "confused"], cause: "event" });
                startAct(sim, b, "react", 1.2, { anim: "confused", seq: ["confused", "happy"], cause: "event" });
                say(sim, a, ":3", 1.2);
                return;
            }
        }

        // 6. Two bots meet: they look at each other.
        for (let i = 0; i < sim.bots.length; i++) {
            for (let j = i + 1; j < sim.bots.length; j++) {
                const a = sim.bots[i], b = sim.bots[j];
                if (!seen(a, b) || !cooled(a, b) || !WAKING.has(a.act) || !WAKING.has(b.act) || dist(a, b) > px(a.surface === b.surface ? 80 : 120)) continue;
                fire(a, b);
                for (const [x, y] of [[a, b], [b, a]]) {
                    if (x.key === "rover" && chance(0.5)) continue; // Rover sometimes ignores the others
                    // across the room (floor vs ceiling) the eyes go up or down instead of sideways
                    const anim = x.surface !== y.surface ? (x.surface === "floor" ? "lookUp" : lookAnim(x, dirTo(x, y))) : lookAnim(x, dirTo(x, y));
                    startAct(sim, x, "look", rnd(0.8, 1.5), { anim, cause: "event" });
                }
                if (chance(0.4)) say(sim, a, "o_o", 1);
                return;
            }
        }
    };
}
