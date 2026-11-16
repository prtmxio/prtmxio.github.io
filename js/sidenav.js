const SECTIONS = ["about", "experience", "projects", "blog", "contact"];

// Builds the left-edge section index. Click handling and active state live in
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
        a.innerHTML = `<span class="sidenav-label"><span class="sidenav-idx">[0${i + 1}]</span> <span class="sidenav-word">${id}</span></span>`;
        li.appendChild(a);
        ol.appendChild(li);
    });
    nav.appendChild(ol);
    const main = document.getElementById("main-container");
    if (main) main.parentNode.insertBefore(nav, main);
    else document.body.appendChild(nav);
}
