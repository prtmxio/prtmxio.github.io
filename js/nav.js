const SECTION_IDS = ["about", "experience", "projects", "blog", "contact"];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let currentHash = "";
let observer = null;

export function setupNavigation() {
    currentHash = window.location.hash;

    // Delegated so the top rail and the sidenav (and anything added later) share one handler.
    document.addEventListener("click", (event) => {
        const link = event.target.closest("a[data-section]");
        if (!link || event.defaultPrevented || event.button !== 0
            || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const section = link.dataset.section;
        if (!SECTION_IDS.includes(section)) return;
        event.preventDefault();
        const hash = `#${section}`;
        if (window.location.hash !== hash) history.pushState(null, "", hash);
        currentHash = hash;
        scrollToSection(section, false);
    });

    document.addEventListener("keydown", onJumpKey);
    window.addEventListener("hashchange", onHashNavigation);
    window.addEventListener("popstate", onHashNavigation);

    observeSections();
    setActive("about");
    trackProgress();
}

// Keys 1-5 jump to a section. Ignored while typing, in the terminal, in the reader or with a modifier.
function onJumpKey(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const section = SECTION_IDS[Number(event.key) - 1];
    if (!section || event.key.length !== 1) return;
    const t = event.target;
    if (t && (t.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))) return;
    const term = document.getElementById("term-panel");
    if (term && !term.hidden) return;
    if (document.body.classList.contains("reader-open") || document.documentElement.classList.contains("intro")) return;
    const hash = `#${section}`;
    if (window.location.hash !== hash) history.pushState(null, "", hash);
    currentHash = hash;
    scrollToSection(section, false);
}

// Page scroll progress (0..1) for the section rail's accent hairline.
function trackProgress() {
    const rail = document.querySelector(".sidenav");
    if (!rail) return;
    let queued = false;
    const update = () => {
        queued = false;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        rail.style.setProperty("--progress", p.toFixed(4));
    };
    const schedule = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    update();
}

// Back/forward, terminal commands and manual hash edits land here.
// hashchange and popstate both fire for the same navigation; currentHash dedupes them.
function onHashNavigation() {
    const hash = window.location.hash;
    if (hash === currentHash) return;
    const prev = currentHash;
    currentHash = hash;

    const parts = hash.replace(/^#/, "").split("/");
    // The blog reader is a layer over the page: opening, closing or stepping
    // between posts must not move the page behind it.
    if (parts[0] === "blog" && (parts[1] || prev.replace(/^#/, "").startsWith("blog/"))) return;
    if (parts[0] === "" && prev.replace(/^#/, "").startsWith("blog/")) return;

    scrollToSection(parts[0] || "about", false);
}

// Call once after content is rendered so a direct load with a hash lands correctly.
export function jumpToHash() {
    currentHash = window.location.hash;
    const section = getSectionFromHash();
    if (window.location.hash && SECTION_IDS.includes(section)) scrollToSection(section, true);
    syncActive();
}

function scrollToSection(sectionId, instant) {
    const target = document.getElementById(sectionId);
    if (!target) return;
    target.scrollIntoView({ behavior: instant || reduceMotion.matches ? "auto" : "smooth", block: "start" });
}

function observeSections() {
    if (!("IntersectionObserver" in window)) return;
    // Any change re-reads which section covers the band, so content growing under it
    // (data render, font swap) cannot leave a stale section active.
    observer = new IntersectionObserver(syncActive, { rootMargin: "-40% 0px -55% 0px" });
    SECTION_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
    });
}

function syncActive() {
    const y = window.innerHeight * 0.425;
    const hit = SECTION_IDS.find((id) => {
        const r = document.getElementById(id)?.getBoundingClientRect();
        return r && r.top <= y && r.bottom > y;
    });
    if (hit) setActive(hit);
}

function setActive(sectionId) {
    document.querySelectorAll("a[data-section]").forEach((link) => {
        const on = link.dataset.section === sectionId;
        link.classList.toggle("active", on);
        if (on) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
    });
    const status = document.getElementById("status-section");
    if (status) status.textContent = `[${sectionId}]`;
}

// Kept for blog.js. The page is one scroll, so there is nothing to show or hide;
// only sync the nav state and never move the page behind the reader.
export function activateSection(sectionId = "about") {
    if (SECTION_IDS.includes(sectionId)) setActive(sectionId);
}

export function getSectionFromHash() {
    const raw = window.location.hash.replace(/^#/, "");
    return raw.split("/")[0] || "about";
}
