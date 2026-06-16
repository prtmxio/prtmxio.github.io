export async function boot() {
    const overlay = document.getElementById("boot-overlay");
    if (overlay) overlay.style.display = "none";
    const main = document.getElementById("main-container");
    if (main) main.style.opacity = "1";
}
