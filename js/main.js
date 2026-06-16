import { boot } from './boot.js';
import { loadData } from './data.js';
import { setupNavigation } from './nav.js';
import { populateSocials } from './socials.js';
import { renderAboutAndExperience, renderProjects, renderBlog } from './render.js';
import { initBlog } from './blog.js';
import { typeWriter } from './utils.js';

document.addEventListener("DOMContentLoaded", async () => {
    setupNavigation();

    let data;
    try {
        [, data] = await Promise.all([boot(), loadData()]);
    } catch (err) {
        console.error("Error loading data:", err);
        document.getElementById("main-container").innerHTML = `
            <div style="padding:80px 40px;font-family:'JetBrains Mono',monospace;font-size:12px;">
                <p style="color:var(--accent);margin-bottom:8px;">// error</p>
                <p style="color:var(--sub);">${err.message}</p>
            </div>`;
        return;
    }

    const { bio, projects, blogPosts } = data;

    document.title = `${bio.profile?.name || "Portfolio"} | Portfolio`;
    document.getElementById("name").textContent = bio.profile?.name     || "";
    document.getElementById("bio").textContent  = bio.profile?.shortBio || "";

    populateSocials(bio.social);
    renderAboutAndExperience(bio.about?.fullBio || "", bio.experience || []);
    renderProjects(projects);
    renderBlog(blogPosts);
    initBlog(blogPosts);

    setTimeout(() => typeWriter("tagline-text", bio.profile?.tagline || "", 36), 80);
});
