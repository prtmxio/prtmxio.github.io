import { pad } from './utils.js';

export function renderAboutAndExperience(aboutText, experience) {
    const aboutEl = document.getElementById("about-content");
    aboutEl.textContent = "";
    (aboutText || "").split("\n").forEach((para) => {
        if (para.trim()) {
            const p = document.createElement("p");
            p.textContent = para;
            aboutEl.appendChild(p);
        }
    });

    document.getElementById("experience-container").innerHTML = (experience || [])
        .map((exp, i) => `
            <div class="item-card" style="animation-delay:${i * 0.07}s">
                <div class="card-top">
                    <span class="card-idx">[${pad(i + 1)}]</span>
                    <span class="card-date">${exp.date}</span>
                </div>
                <h3 class="item-title">${exp.title}</h3>
                <p class="item-subtitle">${exp.company}</p>
                <div class="item-description">
                    <ul>${(exp.description || []).map((d) => `<li>${d}</li>`).join("")}</ul>
                </div>
            </div>`)
        .join("");
}

export function renderProjects(projects) {
    document.getElementById("projects-container").innerHTML = (projects || [])
        .sort((a, b) => (a.priority || 99) - (b.priority || 99))
        .map((proj, i) => {
            const title = proj.codeUrl
                ? `<a href="${proj.codeUrl}" target="_blank" rel="noopener noreferrer" class="item-title-link">${proj.title}</a>`
                : `<h3 class="item-title" style="margin-bottom:8px;">${proj.title}</h3>`;
            return `
                <div class="item-card" style="animation-delay:${i * 0.07}s">
                    <div class="card-top">
                        <span class="card-idx">[${pad(i + 1)}]</span>
                    </div>
                    ${title}
                    <p class="item-description">${proj.description || ""}</p>
                    <div class="tech-tags">
                        ${(proj.technologies || []).map((t) => `<span class="tech-tag">${t}</span>`).join("")}
                    </div>
                </div>`;
        })
        .join("");
}

export function renderBlog(posts) {
    document.getElementById("blog-container").innerHTML = (posts || [])
        .map((post, i) => `
            <div class="item-card" style="animation-delay:${i * 0.07}s">
                <div class="card-top">
                    <span class="card-idx">[${pad(i + 1)}]</span>
                    <span class="card-date">${post.date || ""}</span>
                </div>
                <a class="item-title-link" href="#" data-post-index="${i}">${post.title}</a>
                <p class="item-summary">${post.content || ""}</p>
                <div class="tech-tags">
                    ${(post.tags || []).map((t) => `<span class="tech-tag blog-tag">${t}</span>`).join("")}
                </div>
            </div>`)
        .join("");
}
