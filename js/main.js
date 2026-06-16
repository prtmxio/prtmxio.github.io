import { boot } from "./boot.js";
import { loadData } from "./data.js";
import { setupNavigation } from "./nav.js";
import { populateSocials } from "./socials.js";
import { renderAboutAndExperience, renderProjects, renderBlog } from "./render.js";
import { initBlog } from "./blog.js";
import { initReaderTheme, initTheme } from "./theme.js";
import { typeWriter } from "./utils.js";

document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    initReaderTheme();
    setupNavigation();

    let data;
    try {
        [, data] = await Promise.all([boot(), loadData()]);
    } catch (err) {
        console.error("Error loading data:", err);
        document.getElementById("main-container").innerHTML = `
            <div class="fatal-error">
                <p>// error</p>
                <pre>${err.message}</pre>
            </div>`;
        return;
    }

    const { bio, projects, blogPosts } = data;
    const email = bio.social?.email || "dhimanpritam1579@gmail.com";

    document.title = `${bio.profile?.name || "Portfolio"} | Robotics · AI · Linux`;
    document.getElementById("name").textContent = bio.profile?.name || "";
    document.getElementById("bio").textContent = bio.profile?.shortBio || "";
    document.getElementById("direct-email").textContent = email;
    document.getElementById("direct-email").href = `mailto:${email}`;

    populateSocials(bio.social);
    renderAboutAndExperience(bio.about?.fullBio || "", bio.experience || []);
    renderProjects(projects);
    renderBlog(blogPosts);
    initBlog(blogPosts);
    initContactForm(email);

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
