import { delay } from './utils.js';

export async function boot() {
    const container = document.getElementById("boot-lines");
    const lines = [
        `<span class="b-ok">></span> loading prtmxio.github.io...`,
        `<span class="b-ok">></span> reading profile data...<span class="b-ok"> [OK]</span>`,
        `<span class="b-ok">></span> mounting filesystem...<span class="b-ok"> [OK]</span>`,
    ];
    for (const line of lines) {
        await delay(260);
        const el = document.createElement("div");
        el.innerHTML = line;
        container.appendChild(el);
    }
    await delay(360);
    const overlay = document.getElementById("boot-overlay");
    overlay.style.opacity = "0";
    await delay(450);
    overlay.style.display = "none";
    document.getElementById("main-container").style.opacity = "1";
}
