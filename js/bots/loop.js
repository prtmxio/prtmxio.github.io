// Page bots: frame loop. One rAF, capped frame rate, paused while the tab is hidden.
// The clock only advances while frames run, so every timer built on it is "active time".
export function createLoop(update, fps = 30) {
    let raf = 0, last = 0, wanted = false, running = false, interval = 1000 / fps;
    const clock = { t: 0 };
    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (!last) { last = now; return; }
        const dt = now - last;
        if (dt < interval - 2) return;
        last = now;
        const d = Math.min(dt, 100) / 1000; // a stall (debugger, throttled tab) never jumps the clock
        clock.t += d;
        update(clock.t, d);
    }
    function run() {
        if (running || !wanted || document.hidden) return;
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
    }
    function halt() {
        running = false;
        cancelAnimationFrame(raf);
    }
    document.addEventListener("visibilitychange", () => (document.hidden ? halt() : run()));
    return {
        clock,
        start() { wanted = true; run(); },
        stop() { wanted = false; halt(); },
        setFps(n) { interval = 1000 / n; },
        get running() { return running; },
    };
}
