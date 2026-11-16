export function initRail() {
    const rail = document.getElementById("rail");
    const toggle = document.getElementById("rail-menu");
    if (!rail || !toggle) return;

    const setOpen = (open) => {
        rail.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", String(open));
        toggle.textContent = open ? "[close]" : "[menu]";
    };

    toggle.addEventListener("click", () => setOpen(!rail.classList.contains("open")));

    rail.addEventListener("click", (event) => {
        if (event.target.closest(".rail-panel a")) setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && rail.classList.contains("open")) {
            setOpen(false);
            toggle.focus();
        }
    });

    window.matchMedia("(min-width: 768px)").addEventListener("change", (e) => {
        if (e.matches) setOpen(false);
    });
}
