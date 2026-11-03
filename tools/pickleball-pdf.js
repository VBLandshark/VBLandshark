// Builds pickleball-schedule.pdf (two landscape letter pages: the week, then a map of the centers)
// from the pickleball data in index.html. The map is tools/vb-rec-centers-map.svg (rebuild it with
// python3 tools/make_rec_map.py tools/vb-rec-centers-map.svg if a center moves).
// Usage, from the repo folder:  node tools/pickleball-pdf.js
// Needs Playwright with Chromium (require('playwright')). The data lives in index.html:
// PB_CENTERS, PB_SLOTS, PB_EXCEPTIONS, PB_SEASON_END and PB_CHECKED. Edit those, then run this.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const a = html.indexOf('const PB_CENTERS'), b = html.indexOf('function renderPickleball');
if (a < 0 || b < 0) throw new Error('Pickleball data not found in index.html');
const mapSvg = fs.readFileSync(path.join(__dirname, 'vb-rec-centers-map.svg'), 'utf8').replace(/<svg /, '<svg class="map" ');
const ctx = {};
vm.runInNewContext(html.slice(a, b).replace(/\bconst (PB_\w+)/g, 'this.$1'), ctx);
const {PB_CENTERS: C, PB_SLOTS: SLOTS, PB_EXCEPTIONS: EX, PB_SEASON_END: END, PB_CHECKED: CHECKED} = ctx;

// light print colors for each center (screen colors are tuned for the dark site)
const INK = {bay:'#2f6fb5', bow:'#8a4fb0', gn:'#c2571a', kv:'#1f8a7a', pa:'#b33a5b', st:'#5b7a1f', wf:'#7a5a2f'};
const ink = k => INK[k] || '#17251c';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmt = t => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + (m ? ':' + String(m).padStart(2, '0') : '') + ' ' + ap; };
const range = (x, y) => { const A = fmt(x), B = fmt(y); return A.slice(-2) === B.slice(-2) ? A.slice(0, -3) + '–' + B : A + '–' + B; };
const DAYS = [[1,'Monday'],[2,'Tuesday'],[3,'Wednesday'],[4,'Thursday'],[5,'Friday'],[6,'Saturday'],[0,'Sunday']];
const nice = d => new Date(d + 'T12:00').toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});

const week = DAYS.map(([wd, name]) => {
  const list = SLOTS.filter(s => s[0] === wd).sort((p, q) => mins(p[2]) - mins(q[2]) || mins(p[3]) - mins(q[3]));
  return `<div class="day"><h2>${name}</h2>${list.map(s => `<div class="slot" style="--c:${ink(s[1])}"><div class="t">${range(s[2], s[3])}</div><div class="c">${esc(C[s[1]].name)}</div>${s[4] ? `<div class="n">${esc(s[4].replace(/^!/, ''))}</div>` : ''}</div>`).join('') || '<div class="n">No play listed</div>'}</div>`;
}).join('');
const centers = Object.entries(C).map(([k, c]) => `<tr><td><span class="sw" style="background:${ink(k)}"></span>${esc(c.name)}</td><td>${esc(c.addr)}</td><td>${esc(c.phone.replace(/[()]/g, '').replace(' ', '-'))}</td></tr>`).join('');
const today = new Date().toISOString().slice(0, 10);
const exNotes = EX.filter(e => e.date >= today).sort((p, q) => p.date.localeCompare(q.date))
  .map(e => `<li><b>${esc(C[e.c].name)}, ${nice(e.date)}:</b> ${esc(e.cancel ? 'no play (' + e.cancel + ')' : e.warn)}</li>`).join('');

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: letter landscape; margin: 0.4in 0.45in; }
* { box-sizing:border-box; }
body { margin:0; font:12px/1.4 "Carlito","Liberation Sans",Arial,sans-serif; color:#17251c; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
h1 { margin:0; font:700 30px/1 "TeX Gyre Heros Cn","Liberation Sans Narrow","Arial Narrow",sans-serif; }
.dot { display:inline-block; width:.5em; height:.5em; border-radius:50%; background:#d9e021; margin-left:.15em; vertical-align:.08em; }
header { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:10px; }
.sub { color:#5d6b62; margin:5px 0 0; font-size:12.5px; }
.stamp { color:#5d6b62; font-size:12px; white-space:nowrap; } .stamp b { color:#17251c; }
.week { display:grid; grid-template-columns:repeat(7, minmax(0,1fr)); gap:6px; }
.day { border:1px solid #d8e0d6; border-radius:8px; padding:8px 6px 6px; display:flex; flex-direction:column; gap:5px; }
.day h2 { margin:0 2px 2px; font:700 18px/1 "TeX Gyre Heros Cn","Liberation Sans Narrow",sans-serif; }
.slot { border-left:4px solid var(--c); background:#f2f5ef; border-radius:4px; padding:5px 6px; }
.t { font:700 13px/1.15 "TeX Gyre Heros Cn","Liberation Sans Narrow",sans-serif; }
.c { font-weight:700; font-size:12px; color:var(--c); }
.n { font-size:10.5px; color:#5d6b62; }
.info { display:grid; grid-template-columns:1fr 1.25fr; gap:24px; margin-top:14px; }
h3 { margin:0 0 6px; font:700 17px "TeX Gyre Heros Cn","Liberation Sans Narrow",sans-serif; }
table { width:100%; border-collapse:collapse; font-size:11.5px; }
th, td { text-align:left; padding:3px 5px; border-bottom:1px solid #d8e0d6; }
th { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#5d6b62; }
.sw { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:6px; }
ul { margin:0; padding-left:16px; font-size:11px; display:grid; gap:3px; }
footer { margin-top:10px; font-size:10.5px; color:#5d6b62; }
.p2 { break-before:page; }
.p2 .wrap { display:grid; grid-template-columns:auto 1fr; gap:28px; align-items:start; margin-top:12px; }
.map { display:block; height:7.15in; width:auto; }
.p2 table { font-size:13px; } .p2 td, .p2 th { padding:6px 6px; }
.p2 .tip { font-size:12px; color:#5d6b62; margin-top:12px; }
</style></head><body>
<header><div><h1>VB Rec Center Pickleball<span class="dot"></span></h1>
<p class="sub">Weekly indoor drop-in pickleball at the seven Virginia Beach Parks &amp; Recreation centers, from each center's posted gym schedule. Leagues and clinics that need sign-up are left out.</p></div>
<div class="stamp">Schedules checked <b>${esc(CHECKED)}</b></div></header>
<div class="week">${week}</div>
<div class="info"><div><h3>Rec centers</h3><table><thead><tr><th>Center</th><th>Address</th><th>Phone</th></tr></thead><tbody>${centers}</tbody></table></div>
<div><h3>Before you go</h3><ul>
<li>Times can change for camps, events, rentals, maintenance and holidays. Call the center if you're driving far.</li>
<li>Most sessions are ages 14 and up. Kempsville's weekday sessions are 18 and up.</li>
${exNotes}
<li>These schedules are known to run through ${nice(END)}.</li>
</ul></div></div>
<footer>Sources: each center's gym schedule at parks.virginiabeach.gov/rec-centers. Parks &amp; Recreation main line: 757-385-1100. Live today/tomorrow view: vblandshark.netlify.app/#pickleball · Map of the centers on page 2.</footer>
<section class="p2">
<header><div><h1>Where the rec centers are<span class="dot"></span></h1>
<p class="sub">Virginia Beach Parks &amp; Recreation centers with indoor drop-in pickleball. Dot colors match the weekly schedule.</p></div>
<div class="stamp">Schedules checked <b>${esc(CHECKED)}</b></div></header>
<div class="wrap">${mapSvg}
<div><h3>Addresses &amp; phones</h3><table><thead><tr><th>Center</th><th>Address</th><th>Phone</th></tr></thead><tbody>${centers}</tbody></table>
<p class="tip">All centers are in Virginia Beach, VA. Main Parks &amp; Recreation line: 757-385-1100.</p>
<p class="tip">Map: road and shoreline shapes from US Census Bureau TIGER data, simplified; not to exact scale for navigation.</p></div></div>
</section>
</body></html>`;

(async () => {
  const tmp = path.join(require('os').tmpdir(), 'pickleball-print.html');
  fs.writeFileSync(tmp, page);
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.goto('file://' + tmp);
  const out = path.join(root, 'pickleball-schedule.pdf');
  for (const scale of [1, 0.93, 0.86, 0.8, 0.75]) {           // shrink until the week fits on page 1 (map is page 2)
    await p.pdf({path: out, format: 'Letter', landscape: true, printBackground: true, preferCSSPageSize: true, scale});
    const n = (fs.readFileSync(out, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (n <= 2) { console.log(`Wrote ${out} (scale ${scale})`); break; }
  }
  await browser.close();
})();
