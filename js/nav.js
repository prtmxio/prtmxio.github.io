export function setupNavigation() {
    const navLinks = document.querySelectorAll(".nav-link");
    const sections = document.querySelectorAll(".content-section");
    navLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            navLinks.forEach((l) => l.classList.remove("active"));
            sections.forEach((s) => s.classList.remove("active"));
            link.classList.add("active");
            const target = document.getElementById(link.dataset.section);
            target.classList.add("active");
            target.style.animation = "none";
            target.offsetHeight; // force reflow to re-trigger CSS animation
            target.style.animation = "";
            if (window.innerWidth <= 768) {
                document.querySelector(".right-pane").scrollIntoView({ behavior: "smooth" });
            }
        });
    });
}
