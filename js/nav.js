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

    window.addEventListener("hashchange", onHashNavigation);
    window.addEventListener("popstate", onHashNavigation);

    observeSections();
    setActive("about");
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
}

function scrollToSection(sectionId, instant) {
    const target = document.getElementById(sectionId);
    if (!target) return;
    target.scrollIntoView({ behavior: instant || reduceMotion.matches ? "auto" : "smooth", block: "start" });
}

function observeSections() {
    if (!("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) setActive(entry.target.id);
        });
    }, { rootMargin: "-40% 0px -55% 0px" });
    SECTION_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
    });
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
