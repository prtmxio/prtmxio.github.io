// Page bots: canvas renderer. Integer device-pixel positions, dirty-rect clearing, stepped alpha.
import { BOTS, buildAtlas } from "./sprites.js?v=1";
import { spriteBox, orientOf } from "./world.js?v=1";

const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function createRenderer(canvas) {
    const ctx = canvas.getContext("2d");
    let sc = null, atlas = null, atlasKey = "", full = true, W = 0, H = 0, prev = new Map();

    function setScene(next, theme) {
        sc = next;
        W = Math.round(sc.vw * sc.dpr);
        H = Math.round(sc.vh * sc.dpr);
        if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
        ctx.imageSmoothingEnabled = false;
        const key = `${sc.cellPx}|${theme.light}|${theme.line}`;
        if (key !== atlasKey) { atlas = buildAtlas(sc.cellPx, theme); atlasKey = key; }
        full = true;
    }

    // Bounding box of parts [{canvas, x, y}].
    function bbox(parts) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const p of parts) {
            x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
            x1 = Math.max(x1, p.x + p.canvas.width); y1 = Math.max(y1, p.y + p.canvas.height);
        }
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    function describeBot(b, debug) {
        const cp = sc.cellPx, o = orientOf(b), box = spriteBox(b, sc), def = b.def;
        let x = Math.round((box.left * sc.dpr) / cp) * cp; // x snaps to the cell grid
        const y = Math.round(box.top * sc.dpr);
        const list = def.frames[b.anim] || def.frames.idle;
        const fi = b.fi % list.length;
        const parts = [{ canvas: atlas.frame(b.key, b.anim in def.frames ? b.anim : "idle", fi, o), x, y, a: 1 }];
        let ovSig = "";
        if (b.ov && b.surface !== "wall" && def.overlays[b.ov]) {
            const steps = def.overlays[b.ov], si = b.ovi % steps.length;
            steps[si].forEach((p, j) => {
                let dx = p.dx, dy = p.dy;
                const pw = p.rows[0].length, ph = p.rows.length, oo = {};
                if (o.flipH) { dx = def.w - dx - pw; oo.flipH = true; }
                if (o.flipV) { dy = def.h - dy - ph; oo.flipV = true; }
                parts.push({ canvas: atlas.sprite(`${b.key}.ov.${b.ov}.${si}.${j}`, p.rows, oo), x: x + dx * cp, y: y + dy * cp });
            });
            ovSig = `${b.ov}${si}`;
        }
        const body = parts[0];
        const ent = { id: b.key, parts, body, alpha: b.alpha, top: y, bottom: y + body.canvas.height, cx: x + body.canvas.width / 2 };
        let label = null;
        if (debug) {
            label = `${b.name} ${b.mood} ${b.act}`;
            const fs = Math.round(9 * sc.dpr);
            ctx.font = `${fs}px monospace`;
            const tw = Math.ceil(ctx.measureText(label).width) + 4;
            const ly = b.surface === "ceiling" || b.surface === "wall" ? ent.bottom + 2 : ent.top - fs - 6;
            ent.label = { text: label, x: Math.max(0, Math.min(W - tw, x)), y: ly, w: tw, h: fs + 4, fs };
        }
        const all = parts.concat(ent.label ? [{ canvas: { width: ent.label.w, height: ent.label.h }, x: ent.label.x, y: ent.label.y }] : []);
        ent.rect = bbox(all);
        ent.sig = `${b.anim}|${fi}|${x}|${y}|${o.flipH ? 1 : 0}${o.flipV ? 1 : 0}${o.rot || 0}|${b.alpha}|${ovSig}|${label || ""}`;
        return ent;
    }

    // bubble: {text, tail, bot}; the entity is placed over or under its bot's entity.
    function describeBubble(bubble, botEnt, b) {
        const cp = sc.cellPx, below = b.surface === "ceiling";
        const flip = below ? { flipV: true } : {};
        const cv = atlas.bubble(bubble.text, bubble.tail, flip);
        let x = bubble.tail === "left" ? botEnt.cx - 3 * cp : botEnt.cx - (cv.width - 3 * cp);
        x = Math.round(Math.max(0, Math.min(W - cv.width, x)) / cp) * cp;
        const y = below ? botEnt.bottom + cp : botEnt.top - cv.height - cp;
        return { id: "bubble", parts: [{ canvas: cv, x, y }], alpha: b.alpha, rect: { x, y, w: cv.width, h: cv.height }, sig: `${bubble.text}|${bubble.tail}|${x}|${y}|${b.alpha}` };
    }

    function paint(e) {
        ctx.globalAlpha = e.alpha;
        for (const p of e.parts) ctx.drawImage(p.canvas, p.x, p.y);
        if (e.label) {
            const l = e.label;
            ctx.globalAlpha = 1;
            ctx.fillStyle = "rgba(26,25,23,0.85)";
            ctx.fillRect(l.x, l.y, l.w, l.h);
            ctx.fillStyle = "#B9B5AD";
            ctx.font = `${l.fs}px monospace`;
            ctx.textBaseline = "top";
            ctx.fillText(l.text, l.x + 2, l.y + 2);
        }
        ctx.globalAlpha = 1;
    }

    // bots: visible bots in draw order. bubble: {bot: key, text, tail} or null. Returns true if anything was drawn.
    function draw(bots, bubble, debug) {
        if (!atlas) return false;
        const ents = bots.map((b) => describeBot(b, debug));
        if (bubble) {
            const bi = bots.findIndex((b) => b.key === bubble.bot);
            if (bi >= 0 && bots[bi].surface !== "wall" && bots[bi].alpha >= 0.5) ents.push(describeBubble(bubble, ents[bi], bots[bi]));
        }
        let drew = false;
        if (full) {
            ctx.clearRect(0, 0, W, H);
            ents.forEach(paint);
            full = false;
            drew = true;
        } else {
            const dirty = [], now = new Set();
            for (const e of ents) {
                now.add(e.id);
                const p = prev.get(e.id);
                if (!p || p.sig !== e.sig) { if (p) dirty.push(p.rect); dirty.push(e.rect); }
            }
            for (const [id, p] of prev) if (!now.has(id)) dirty.push(p.rect);
            if (dirty.length) {
                for (const r of dirty) ctx.clearRect(r.x, r.y, r.w, r.h);
                for (const e of ents) if (dirty.some((r) => hit(r, e.rect))) paint(e);
                drew = true;
            }
        }
        prev = new Map(ents.map((e) => [e.id, e]));
        return drew;
    }

    function clear() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        prev = new Map();
        full = true;
    }

    return { setScene, draw, clear };
}
