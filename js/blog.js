let allBlogPosts = [];

const markdownConverter = new showdown.Converter();
markdownConverter.setOption("ghCompatibleHeaderId", true);
markdownConverter.setOption("simpleLineBreaks", true);

export function initBlog(posts) {
    allBlogPosts = posts;

    document.getElementById("blog-container").addEventListener("click", (e) => {
        const link = e.target.closest("[data-post-index]");
        if (link) {
            e.preventDefault();
            showBlogPost(parseInt(link.dataset.postIndex, 10));
        }
    });

    document.querySelector(".blog-back-button").addEventListener("click", hideBlogPost);
}

async function showBlogPost(index) {
    const post = allBlogPosts[index];
    if (!post) return;

    document.getElementById("post-title").textContent = post.title || "";
    document.getElementById("post-date").textContent  = post.date  || "";
    document.getElementById("blog-post-viewer").style.display = "block";
    document.getElementById("main-container").style.display   = "none";
    window.scrollTo(0, 0);

    const postBody = document.getElementById("post-body");
    postBody.innerHTML = `<p style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);"><span style="color:var(--accent)">></span> loading...</p>`;

    try {
        const res = await fetch(post.read_me);
        if (!res.ok) throw new Error(`${post.read_me} (${res.status})`);
        let md = await res.text();

        const mathBlocks = [];
        let mi = 0;
        function pushMath(tex, display) {
            const key = `MATH_${mi++}`;
            mathBlocks.push({ key, tex, display });
            return `<!--${key}-->`;
        }

        md = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => pushMath(`$$${tex}$$`, true));
        md = md.replace(/(?<!\$)\$([^\n$]+?)\$(?!\$)/g, (_, tex) => pushMath(`$${tex}$`, false));

        let html = markdownConverter.makeHtml(md);
        mathBlocks.forEach(({ key, tex, display }) => {
            html = html.replace(new RegExp(`<!--${key}-->`, "g"), display ? `\n\n${tex}\n\n` : tex);
        });
        html = html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        postBody.innerHTML = html;

        if (window.MathJax?.typesetPromise) {
            await MathJax.typesetPromise([postBody]);
        } else {
            setTimeout(() => window.MathJax?.typesetPromise?.([postBody])?.catch(console.error), 200);
        }
    } catch (err) {
        console.error("Blog load error:", err);
        postBody.innerHTML = `<p style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);">// error: ${err.message}</p>`;
    }
}

function hideBlogPost(event) {
    event.preventDefault();
    document.getElementById("blog-post-viewer").style.display = "none";
    document.getElementById("main-container").style.display   = "";
    document.getElementById("post-title").textContent = "";
    document.getElementById("post-date").textContent  = "";
    document.getElementById("post-body").innerHTML    = "";
}
