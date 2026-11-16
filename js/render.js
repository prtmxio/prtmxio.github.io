import { pad } from "./utils.js";
import { slugify } from "./blog.js";

// "Glazia, Gurgaon : Remote" -> { name: "Glazia", loc: "Gurgaon : Remote" } (split on the last comma).
function splitCompany(company = "") {
    const i = String(company).lastIndexOf(",");
    if (i < 0) return { name: String(company).trim(), loc: "" };
    return { name: company.slice(0, i).trim(), loc: company.slice(i + 1).trim() };
}

export function renderAbout(bio, projects, posts) {
    const profile = bio.profile || {};
    const experience = bio.experience || [];

    const lead = document.getElementById("about-lead");
    if (lead) {
        lead.textContent = profile.shortBio || "";
        lead.hidden = !profile.shortBio;
    }

    const aboutEl = document.getElementById("about-content");
    aboutEl.textContent = "";
    (bio.about?.fullBio || "").split("\n").forEach((para) => {
        if (!para.trim()) return;
        const p = document.createElement("p");
        p.textContent = para;
        aboutEl.appendChild(p);
    });

    renderSpec(profile, experience);
    renderStats(profile, experience, projects, posts);
}

// Rows with no source value are hidden.
function renderSpec(profile, experience) {
    const el = document.getElementById("hero-spec");
    if (!el) return;
    const job = experience[0];
    const current = job && job.title
        ? `${job.title}${job.company ? ` @ ${splitCompany(job.company).name}` : ""}`
        : "";
    const rows = [
        ["Based", profile.based],
        ["Currently", current],
        ["Open to", profile.openTo],
    ];
    el.innerHTML = rows
        .filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `<div class="spec-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`)
        .join("");
}

// profile.stats[] when present, otherwise counts derived from the JSON.
function renderStats(profile, experience, projects, posts) {
    const el = document.getElementById("about-stats");
    if (!el) return;
    let stats = Array.isArray(profile.stats)
        ? profile.stats.filter((s) => s && s.value != null && String(s.value).trim() && s.label)
        : [];
    if (!stats.length) {
        const tech = new Set();
        (projects || []).forEach((p) => (p.technologies || []).forEach((t) => tech.add(String(t).trim().toLowerCase())));
        stats = [
            { value: (projects || []).length, label: "projects" },
            { value: (posts || []).length, label: "posts" },
            { value: experience.length, label: "roles" },
            { value: tech.size, label: "technologies" },
        ];
    }
    el.innerHTML = stats
        .slice(0, 4)
        .map((s) => `<div class="stat"><span class="stat-value">${escapeHtml(s.value)}</span><span class="stat-label">${escapeHtml(s.label)}</span></div>`)
        .join("");
}

export function renderExperience(experience) {
    document.getElementById("experience-container").innerHTML = (experience || [])
        .map((exp) => {
            const co = splitCompany(exp.company);
            return `
            <article class="role" data-field-empty>
                <div class="role-side" data-field-empty>
                    <p class="role-co">${escapeHtml(co.name)}</p>
                    ${co.loc ? `<p class="role-loc">${escapeHtml(co.loc)}</p>` : ""}
                </div>
                <div class="role-main">
                    <span class="role-date">${escapeHtml(exp.date || "")}</span>
                    <h3 class="role-title">${escapeHtml(exp.title || "")}</h3>
                    <p class="role-company">${escapeHtml(exp.company || "")}</p>
                    <ul class="role-list">
                        ${(exp.description || []).map((d) => `<li>${escapeHtml(d)}</li>`).join("")}
                    </ul>
                </div>
            </article>`;
        })
        .join("");
}

export function renderProjects(projects) {
    document.getElementById("projects-container").innerHTML = (projects || [])
        .sort((a, b) => (a.priority || 99) - (b.priority || 99))
        .map((proj, i) => `
            <article class="index-row" data-field-empty>
                <span class="index-idx">[${pad(i + 1)}]</span>
                <div class="index-main">
                    <h3 class="index-name">${escapeHtml(proj.title || "")}</h3>
                    <p class="index-desc">${escapeHtml(proj.description || "")}</p>
                    <ul class="tokens">
                        ${(proj.technologies || []).map((t) => `<li class="token">${escapeHtml(t)}</li>`).join("")}
                    </ul>
                    ${proj.codeUrl ? `<a class="row-link" href="${escapeAttr(proj.codeUrl)}" target="_blank" rel="noopener noreferrer">[code -&gt;]</a>` : ""}
                </div>
            </article>`)
        .join("");
}

export function renderBlog(posts) {
    const sortedPosts = [...(posts || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const count = document.getElementById("blog-count");
    if (count) count.textContent = `${sortedPosts.length} posts`;

    document.getElementById("blog-container").innerHTML = sortedPosts
        .map((post) => {
            const slug = escapeAttr(post.slug || slugify(post.title));
            return `
            <article class="item-card log-row" data-field-empty>
                <span class="log-date">${escapeHtml(post.date || "")}</span>
                <div class="log-main">
                    <a class="log-title" href="#blog/${slug}" data-post-slug="${slug}">${escapeHtml(post.title || "")}</a>
                    <p class="log-summary">${escapeHtml(post.content || "")}</p>
                    <ul class="tokens">
                        ${(post.tags || []).map((t) => `<li class="token">${escapeHtml(t)}</li>`).join("")}
                    </ul>
                </div>
            </article>`;
        })
        .join("");
}

function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[char]));
}

function escapeAttr(value = "") {
    return escapeHtml(value).replace(/`/g, "&#96;");
}
