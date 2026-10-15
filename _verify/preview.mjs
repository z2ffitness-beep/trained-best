// Renders the strength chart's real geometry into a standalone HTML page, so
// the layout can be looked at rather than reasoned about. Not a test - a way
// to see label collisions, overflow and spacing before shipping.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const H = await load(path.join(here, "..", "src", "App.jsx"), [
  "wasLifted", "topSetWeight", "estimateOneRepMax", "exerciseHistory",
  "strengthSummary", "trendPoints",
  { name: "E1RM_REP_CEILING", kind: "const" },
]);

const set = (n, w, r) => ({ set: n, done: true, weight: w, unit: "lb", reps: r });
const mk = (date, w, r) => ({
  date, programDay: "Day 1 - Lower",
  exercises: [{ name: "Back Squat", sets: [set(1, w, r)], setsCompleted: 1, setsPrescribed: 1 }],
});

// A realistic block: a climb, a deload dip, a three-week layoff, then a best.
const CASES = {
  "Typical block": [mk("2025-09-01",135,8),mk("2025-09-08",145,8),mk("2025-09-15",155,6),mk("2025-09-22",125,8),mk("2025-09-29",165,5),mk("2025-10-06",170,5),mk("2025-10-27",175,3)],
  "Two sessions": [mk("2025-09-01",135,8),mk("2025-09-08",145,8)],
  "Completely flat": [mk("2025-09-01",135,8),mk("2025-09-08",135,8),mk("2025-09-15",135,8)],
  "Long history": Array.from({length: 24}, (_, i) => {
    const d = new Date(Date.UTC(2025,0,6+i*7)).toISOString().slice(0,10);
    return mk(d, 135 + Math.round(Math.sin(i/3)*15) + i*2, 5);
  }),
};

// Mirrors StrengthTrend's geometry exactly. If this drifts from the component
// the preview stops being worth anything, so keep the constants in step.
const PAD_X = 6, PAD_TOP = 14, PAD_BOTTOM = 10, H_PX = 150;
const px = p => PAD_X + p.x * (100 - PAD_X * 2);
const py = p => PAD_TOP + (1 - p.y) * (100 - PAD_TOP - PAD_BOTTOM);

const card = (title, logs) => {
  const rows = H.exerciseHistory("Back Squat", logs);
  const s = H.strengthSummary(rows);
  const pts = H.trendPoints(rows);
  const line = pts.map((p,i) => `${i===0?"M":"L"}${px(p).toFixed(2)},${py(p).toFixed(2)}`).join(" ");
  const grid = [0,0.5,1].map(t => {
    const y = PAD_TOP + t*(100-PAD_TOP-PAD_BOTTOM);
    return `<line x1="${PAD_X}" x2="${100-PAD_X}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-width="0.4" vector-effect="non-scaling-stroke"/>`;
  }).join("");
  const dots = pts.map(p => {
    const sel = p.isLast;
    const accent = p.isMax ? "var(--orange)" : "var(--blue)";
    const size = sel ? 11 : 8;
    return `<button class="dot" style="left:${px(p)}%;top:${py(p)}%"><span style="width:${size}px;height:${size}px;background:${accent}"></span></button>`;
  }).join("");
  return `<section class="card">
    <h3>${title}</h3>
    <div class="stats">
      <div class="stat"><span class="lbl">Latest</span><b>${s.latest.topWeight}</b><i>lb</i></div>
      <div class="stat"><span class="lbl">Best set</span><b style="color:var(--orange)">${s.bestTop.topWeight}</b><i>lb</i></div>
      <div class="stat"><span class="lbl">Est. 1RM</span><b style="color:var(--blue)">${s.bestE1rm?.e1rm ?? "—"}</b><i>lb</i></div>
    </div>
    <div class="plotcard">
      <div class="plothead"><span>TOP SET</span><span class="mono">lb</span></div>
      <p class="hint">Tap a point to see that session.</p>
      <div class="plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">${grid}
          <path d="${line}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        </svg>
        <div class="dots">${dots}</div>
      </div>
      <div class="axis"><span>${pts[0].entry.date}</span><span>${pts[pts.length-1].entry.date}</span></div>
    </div>
    <p class="meta">${pts.length} points · change ${s.change > 0 ? "+" : ""}${s.change} lb · PR ${s.isPR}</p>
  </section>`;
};

const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#12100E;--panel:#1C1917;--border:#2E2A26;--text:#F5F1EC;--sub:#A8A29A;--faint:#6B655E;--blue:#4A90D9;--orange:#E8833A}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,sans-serif;padding:16px;max-width:390px}
h3{font-size:15px;margin:0 0 10px}
.card{margin-bottom:28px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
.stat{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:10px 12px}
.lbl{display:block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:600}
.stat b{font-size:18px;line-height:1;display:inline-block;margin-top:4px}
.stat i{font-size:10px;color:var(--faint);font-style:normal;font-family:ui-monospace,monospace;margin-left:3px}
.plotcard{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:16px}
.plothead{display:flex;justify-content:space-between;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--sub)}
.hint{font-size:11px;color:var(--faint);margin:2px 0 12px}
.plot{position:relative;height:${H_PX}px}
.plot svg{position:absolute;inset:0;width:100%;height:100%}
.dots{position:absolute;inset:0}
.dot{position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;border:0;background:none;padding:0;display:flex;align-items:center;justify-content:center}
.dot span{display:block;border-radius:999px;box-shadow:0 0 0 2px var(--panel)}
.axis{display:flex;justify-content:space-between;font-size:10px;font-family:ui-monospace,monospace;color:var(--faint);margin-top:8px}
.meta{font-size:11px;color:var(--faint);margin:10px 0 0}
.mono{font-family:ui-monospace,monospace;color:var(--faint)}
</style>
${Object.entries(CASES).map(([t, l]) => card(t, l)).join("\n")}`;

const out = path.join(here, "preview.html");
fs.writeFileSync(out, page);
console.log(out);
