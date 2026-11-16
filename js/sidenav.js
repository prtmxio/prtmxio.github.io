const SECTIONS = ["about", "experience", "projects", "blog", "contact"];

// Builds the left-edge section rail. Click handling and active state live in
// nav.js and key off [data-section], so these links need no listeners here.
export function initSidenav() {
    if (document.querySelector(".sidenav")) return;
    const nav = document.createElement("nav");
    nav.className = "sidenav";
    nav.setAttribute("aria-label", "Sections");
    const ol = document.createElement("ol");
    SECTIONS.forEach((id, i) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `#${id}`;
        a.dataset.section = id;
        a.innerHTML = `<span class="sidenav-idx" aria-hidden="true">0${i + 1}</span><span class="sidenav-word">${id}</span>`;
        a.style.setProperty("--i", i);
        li.appendChild(a);
        ol.appendChild(li);
    });
    nav.appendChild(ol);
    const main = document.getElementById("main-container");
    if (main) main.parentNode.insertBefore(nav, main);
    else document.body.appendChild(nav);

    // Words step in once. rail-pending (set in <head>) exists only when the intro runs, so the
    // rail is never hidden on hash or reduced-motion loads.
    const root = document.documentElement;
    const reveal = () => {
        root.classList.remove("rail-pending");
        root.classList.add("rail-in");
    };
    if (root.classList.contains("rail-pending")) window.addEventListener("introdone", reveal, { once: true });
    else reveal();
}
