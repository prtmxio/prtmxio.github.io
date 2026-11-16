import { runIntro } from "./intro.js?v=3";
import { loadData } from "./data.js?v=2";
import { setupNavigation, jumpToHash } from "./nav.js?v=5";
import { initSidenav } from "./sidenav.js?v=1";
import { initRail } from "./rail.js?v=1";
import { populateHeroLinks } from "./socials.js?v=3";
import { renderAboutAndExperience, renderHeroSpec, renderProjects, renderBlog } from "./render.js?v=3";
import { initBlog } from "./blog.js?v=2";
import { initReaderTheme, initTheme } from "./theme.js?v=2";
import { typeWriter } from "./utils.js?v=2";
import { initTerminal } from "./terminal.js?v=2";

document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    initReaderTheme();
    initSidenav();
    setupNavigation();
    initRail();

    let data;
    try {
        data = await loadData();
    } catch (err) {
        console.error("Error loading data:", err);
        const main = document.getElementById("main-container");
        if (main) {
            main.innerHTML = `<div class="fatal-error"><p>// error</p><pre>${err.message}</pre></div>`;
        }
        runIntro();
        return;
    }

    const { bio, projects, blogPosts } = data;
    const email = bio.social?.email || "dhimanpritam1579@gmail.com";

    document.title = `${bio.profile?.name || "Portfolio"} | Robotics · AI · Linux`;
    document.getElementById("name").textContent = bio.profile?.name || "";
    document.getElementById("direct-email").textContent = email;
    document.getElementById("direct-email").href = `mailto:${email}`;

    populateHeroLinks(bio.social);
    renderHeroSpec(bio.profile, bio.experience || []);
    renderAboutAndExperience(bio.about?.fullBio || "", bio.experience || []);
    renderProjects(projects);
    renderBlog(blogPosts);
    initBlog(blogPosts);
    initTerminal(bio, projects, blogPosts);
    initContactForm(email);
    jumpToHash();
    runIntro();

    setTimeout(() => typeWriter("tagline-text", bio.profile?.tagline || "", 34), 80);
});

function initContactForm(email) {
    const form = document.getElementById("contact-form");
    if (!form) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const name = document.getElementById("contact-name").value.trim();
        const from = document.getElementById("contact-email").value.trim();
        const subject = document.getElementById("contact-subject").value.trim() || "Portfolio contact";
        const message = document.getElementById("contact-message").value.trim();
        const body = [
            message,
            "",
            "---",
            name ? `Name: ${name}` : "",
            from ? `Email: ${from}` : "",
            "Sent from prtmxio.github.io",
        ].filter(Boolean).join("\n");

        window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
}
