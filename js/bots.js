// Page bots: Floatie, Rover and Waddle live on the floor and ceiling of the viewport.
// One fixed canvas behind the content (pointer-events none). Decorative only. See DESIGN.md "Bots".
import { measure, layoutBots, WIDE } from "./bots/world.js?v=2";
import { createRenderer } from "./bots/render.js?v=2";
import { createLoop } from "./bots/loop.js?v=2";
import { createSim, step, onPointer, rescene } from "./bots/brain.js?v=2";
import { LIGHT_LINE } from "./bots/sprites.js?v=2";

function boot() {
    const root = document.documentElement;
    const rmMQ = matchMedia("(prefers-reduced-motion: reduce)");
    const wideMQ = matchMedia(WIDE);
    const KEY = "bots-field";
    const debug = /[?&]botdebug=1\b/.test(location.search);
    const toggle = document.getElementById("bots-toggle");

    let layer = null, renderer = null, sc = null, sim = null, staticBots = [], started = false, on = true, loop = null;
    let themeKey = "", nextPoll = 0, ptrOn = false;

    const readStored = () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } };
    const writeStored = (v) => { try { localStorage.setItem(KEY, v); } catch (_) { /* storage blocked */ } };
    function paintToggle() {
        if (!toggle) return;
        toggle.textContent = `[bots: ${on ? "on" : "off"}]`;
        toggle.setAttribute("aria-pressed", on ? "true" : "false");
    }
    function readTheme() {
        const light = root.dataset.theme === "light";
        const line = getComputedStyle(root).getPropertyValue("--line").trim();
        return { light, line: /^#[0-9a-f]{6}$/i.test(line) ? line : LIGHT_LINE };
    }
    const themeSig = (t) => `${t.light}|${t.line}`;

    // ---- pointer (eyes only; mouse only; passive) ----
    function onMove(e) {
        if (e.pointerType === "touch" || !sim) return;
        onPointer(sim, e.clientX, e.clientY);
    }
    function attachPointer() {
        if (ptrOn) return;
        ptrOn = true;
        window.addEventListener("pointermove", onMove, { passive: true });
    }
    function detachPointer() {
        if (!ptrOn) return;
        ptrOn = false;
        window.removeEventListener("pointermove", onMove);
    }

    // ---- frame ----
    function update(T, dt) {
        step(sim, T, dt);
        renderer.draw(sim.bots, sim.bubble, debug);
        if (T >= nextPoll) { nextPoll = T + 0.5; poll(); }
    }

    // Re-measure the page and the theme; rebuild only what changed.
    function poll() {
        const next = measure(), t = readTheme();
        const same = sc && ["vw", "vh", "dpr", "cell", "ceilY", "floorY", "laneR", "narrow"].every((k) => sc[k] === next[k]);
        if (same && themeSig(t) === themeKey) return;
        const roster = !sc || sc.narrow !== next.narrow;
        sc = next;
        themeKey = themeSig(t);
        renderer.setScene(sc, t);
        if (sim && roster) sim = createSim(sc, { debug });
        else if (sim) rescene(sim, sc);
    }

    function stopAll() {
        if (loop) loop.stop();
        detachPointer();
    }

    function apply() {
        if (!layer) return;
        stopAll();
        layer.hidden = !on;
        if (!on) { renderer.clear(); return; }
        sc = measure();
        const t = readTheme();
        themeKey = themeSig(t);
        renderer.setScene(sc, t);
        if (rmMQ.matches) {
            // Reduced motion: one static draw in an idle pose, no timers, no pointer listener.
            sim = null;
            staticBots = layoutBots(sc);
            renderer.draw(staticBots, null, false);
            return;
        }
        sim = createSim(sc, { debug });
        loop.clock.t = 0;
        nextPoll = 0.5;
        renderer.draw(sim.bots, null, debug);
        attachPointer();
        loop.start();
    }

    function start() {
        if (started) return;
        started = true;
        layer = document.createElement("div");
        layer.className = "bots-layer";
        layer.setAttribute("aria-hidden", "true");
        const canvas = document.createElement("canvas");
        layer.appendChild(canvas);
        document.body.appendChild(layer);
        renderer = createRenderer(canvas);
        loop = createLoop(update, 30);
        apply();
        let pending = 0;
        window.addEventListener("resize", () => {
            cancelAnimationFrame(pending);
            pending = requestAnimationFrame(() => {
                if (!on) return;
                if (rmMQ.matches) { apply(); return; }
                nextPoll = 0;
            });
        });
        wideMQ.addEventListener("change", apply);
        rmMQ.addEventListener("change", apply);
        // Reduced motion has no polling loop, so theme changes need a hook of their own.
        new MutationObserver(() => { if (on && rmMQ.matches) apply(); })
            .observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    }

    on = readStored() !== "off";
    paintToggle();
    if (toggle) {
        toggle.addEventListener("click", () => {
            on = !on;
            writeStored(on ? "on" : "off");
            paintToggle();
            apply();
        });
    }
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve();
    fonts.then(() => {
        if (!root.classList.contains("intro")) { start(); return; }
        window.addEventListener("introdone", start, { once: true });
        // The head failsafe removes the intro class without firing the event.
        const mo = new MutationObserver(() => {
            if (!root.classList.contains("intro")) { mo.disconnect(); start(); }
        });
        mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
