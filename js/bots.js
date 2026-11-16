// Page bots: Floatie, Rover and Waddle live on the floor and ceiling of the viewport.
// One fixed canvas behind the content (pointer-events none). Decorative only. See DESIGN.md "Bots".
import { measure, layoutBots, WIDE } from "./bots/world.js?v=1";
import { createRenderer } from "./bots/render.js?v=1";
import { LIGHT_LINE } from "./bots/sprites.js?v=1";

function boot() {
    const root = document.documentElement;
    const rmMQ = matchMedia("(prefers-reduced-motion: reduce)");
    const wideMQ = matchMedia(WIDE);
    const KEY = "bots-field";
    const toggle = document.getElementById("bots-toggle");

    let layer = null, renderer = null, sc = null, bots = [], started = false, on = true;

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

    function apply() {
        if (!layer) return;
        layer.hidden = !on;
        if (!on) { renderer.clear(); return; }
        sc = measure();
        renderer.setScene(sc, readTheme());
        bots = layoutBots(sc);
        renderer.draw(bots, null, false);
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
        apply();
        let pending = 0;
        window.addEventListener("resize", () => {
            cancelAnimationFrame(pending);
            pending = requestAnimationFrame(apply);
        });
        wideMQ.addEventListener("change", apply);
        rmMQ.addEventListener("change", apply);
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
