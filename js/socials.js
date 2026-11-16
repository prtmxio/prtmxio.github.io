const LINKS = { github: "link-github", linkedin: "link-linkedin", twitter: "link-x" };

export function populateHeroLinks(social) {
    Object.entries(LINKS).forEach(([key, id]) => {
        const el = document.getElementById(id);
        const url = social?.[key];
        if (!el || !url) return;
        el.href = url;
        el.hidden = false;
    });
}
