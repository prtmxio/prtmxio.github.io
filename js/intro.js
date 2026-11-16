// Scan-line intro (DESIGN.md section 9). Opacity and fixed layers only, so no layout shift.
const SCAN_START = 100;
const SCAN_END = 1300;
const REVEAL = [1400, 1500, 1600, 1700, 1800];
const DONE = 2000;
const CAP = 2500;
const CELLS = 5;

export function runIntro() {
    const root = document.documentElement;
    const finishEvent = () => window.dispatchEvent(new Event("introdone"));

    const hash = location.hash;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!root.classList.contains("intro") || hash || reduced) {
        root.classList.remove("intro");
        finishEvent();
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const scan = document.createElement("div");
        scan.className = "intro-scan";
        scan.setAttribute("aria-hidden", "true");
        const counter = document.createElement("div");
        counter.className = "intro-counter";
        counter.setAttribute("aria-hidden", "true");
        const num = document.createElement("span");
        counter.appendChild(num);
        const cellsEl = document.createElement("span");
        cellsEl.className = "intro-cells";
        counter.appendChild(cellsEl);
        document.body.append(scan, counter);

        const ticks = Array.from(document.querySelectorAll(".sidenav a"));
        const hasSidenav = ticks.length > 0 && ticks[0].getClientRects().length > 0;
        const tickY = hasSidenav
            ? ticks.map((a) => {
                  const r = a.getBoundingClientRect();
                  return r.top + r.height / 2;
              })
            : [];
        const cellAt = Array.from({ length: CELLS }, (_, i) => SCAN_START + ((i + 1) / CELLS) * (SCAN_END - SCAN_START));
        let vh = window.innerHeight;
        const onResize = () => { vh = window.innerHeight; };
        window.addEventListener("resize", onResize);

        const t0 = performance.now();
        let raf = 0;
        let capTimer = 0;
        let groups = 0;
        let finished = false;
        let lastNum = -1;
        let lastCells = -1;

        const onKey = (e) => { if (e.key === "Escape") e.preventDefault(); finish(); };
        const skip = () => finish();
        const skipOpts = { capture: true, passive: true };

        function frame(now) {
            if (finished) return;
            raf = requestAnimationFrame(frame);
            const t = now - t0;

            const p = Math.min(1, Math.max(0, (t - SCAN_START) / (SCAN_END - SCAN_START)));
            if (t >= SCAN_START && t < REVEAL[0]) {
                root.classList.add("scan");
                // Layout-snapped whole device pixels. A transformed 1px layer at a fractional offset can be
                // sampled across two rows by the compositor, which is the suspected double-line cause.
                const dpr = window.devicePixelRatio || 1;
                scan.style.height = `${1 / dpr}px`;
                scan.style.top = `${Math.round(p * (vh - 1) * dpr) / dpr}px`;
                scan.style.visibility = "visible";
                counter.style.visibility = "visible";
                const n = Math.round(p * 100);
                if (n !== lastNum) {
                    lastNum = n;
                    num.textContent = String(n).padStart(3, "0");
                }
                if (hasSidenav) {
                    const y = p * vh;
                    ticks.forEach((a, i) => { if (y >= tickY[i]) a.classList.add("lit"); });
                } else {
                    const c = cellAt.filter((ms) => t >= ms).length;
                    if (c !== lastCells) {
                        lastCells = c;
                        cellsEl.textContent = ` [${"=".repeat(c)}${"-".repeat(CELLS - c)}]`;
                    }
                }
            } else if (t >= REVEAL[0]) {
                scan.style.visibility = "hidden";
                counter.style.visibility = "hidden";
            }

            while (groups < REVEAL.length && t >= REVEAL[groups]) {
                groups++;
                root.classList.add(`g${groups}`);
            }
            if (t >= DONE) finish();
        }

        function finish() {
            if (finished) return;
            finished = true;
            cancelAnimationFrame(raf);
            clearTimeout(capTimer);
            window.removeEventListener("pointerdown", skip, skipOpts);
            window.removeEventListener("wheel", skip, skipOpts);
            window.removeEventListener("touchmove", skip, skipOpts);
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("resize", onResize);
            ticks.forEach((a) => a.classList.remove("lit"));
            scan.remove();
            counter.remove();
            // Drop intro and group classes together: no transition is declared outside html.intro.gN.
            root.classList.remove("intro", "scan", "g1", "g2", "g3", "g4", "g5");
            finishEvent();
            resolve();
        }

        window.addEventListener("pointerdown", skip, skipOpts);
        window.addEventListener("wheel", skip, skipOpts);
        window.addEventListener("touchmove", skip, skipOpts);
        window.addEventListener("keydown", onKey, true);
        capTimer = setTimeout(finish, CAP);
        scan.style.visibility = "hidden";
        counter.style.visibility = "hidden";
        raf = requestAnimationFrame(frame);
    });
}
