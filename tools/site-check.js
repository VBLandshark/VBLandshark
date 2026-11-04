// Daily health check for vblandshark.netlify.app, run by .github/workflows/site-check.yml.
// Reads index.html to get the same data URLs the page builds, requests each one, and checks
// that real data comes back. Problems are reported in one GitHub issue (which emails the owner);
// the issue is closed automatically once everything passes again.
// Run locally with: node tools/site-check.js   (no GITHUB_TOKEN = just prints results)

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");

const SITE = "https://vblandshark.netlify.app/";
const UA = "VBLandshark site check (github.com/VBLandshark/VBLandshark)";
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

// ---- Pull values out of index.html so the checks follow the page ----
function grab(re, what) {
  const m = html.match(re);
  if (!m) throw new Error(`couldn't find ${what} in index.html`);
  return m[1];
}
const consts = ["LAT", "MLAT", "TZ", "TIDE_STATION"].map(k => grab(new RegExp(`^(const ${k} =.*)$`, "m"), k)).join("\n");
const P = new Function(`${consts}\nreturn {LAT, LON, MLAT, MLON, TZ, TIDE_STATION};`)();
const arr = name => new Function("return " + grab(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n?\\]);`), name))();
const BUOYS = arr("BUOYS"), OBS = arr("OBS"), FISH = arr("FISH");
const tmpl = (re, what, vars) => new Function(...Object.keys(vars), "return " + grab(re, what))(...Object.values(vars));
const MARINE_URL = tmpl(/const u = (`https:\/\/marine-api[\s\S]*?);\n/, "Open-Meteo marine URL", P);
const WX_URL = tmpl(/const u = (`https:\/\/api\.open-meteo[\s\S]*?);\n/, "Open-Meteo forecast URL", P);
const radarLines = grab(/^(const R_CLAT[\s\S]*?^const R_BBOX = .*)$/m, "radar box");
const R_BBOX = new Function(`${radarLines}\nreturn R_BBOX;`)();
const RADAR_URL = tmpl(/(`https:\/\/opengeo\.ncep\.noaa\.gov[^`]*`)/, "radar URL", {R_BBOX});
const TOPO_URL = tmpl(/(`https:\/\/basemap\.nationalmap\.gov[^`]*`)/, "USGS topo URL", {R_BBOX});
const TIDE_BASE = grab(/const base = "(https:\/\/api\.tidesandcurrents[^"]*product=predictions[^"]*)"/, "tide URL") + P.TIDE_STATION;
const WTEMP_BASE = grab(/const base = "(https:\/\/api\.tidesandcurrents[^"]*water_temperature[^"]*)"/, "water temp URL");
const WTEMP_STATIONS = [...grab(/get\(("\d+"\), get\("\d+")\)/, "water temp stations").matchAll(/\d+/g)].map(m => m[0]);
const WM = grab(/const WM = "([^"]+)"/, "Wikimedia base");

// ---- Helpers ----
async function req(url, opts = {}) {
  const r = await fetch(url, {...opts, headers: {"User-Agent": UA, ...(opts.headers || {})}, signal: AbortSignal.timeout(30000)});
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}
const json = async (url, opts) => (await req(url, opts)).json();
const text = async (url, opts) => (await req(url, opts)).text();
const geo = {headers: {Accept: "application/geo+json"}};
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const num = v => typeof v === "number" && isFinite(v);
const ymd = d => d.toLocaleDateString("en-CA", {timeZone: P.TZ}).replace(/-/g, "");
const hoursOld = t => (Date.now() - new Date(t).getTime()) / 36e5;

// ---- Checks: [name, async fn returning a short note] ----
const checks = [];
const add = (name, fn) => checks.push({name, fn});

add("Live site page", async () => {
  const t = await text(SITE);
  const title = (t.match(/<title>([^<]*)<\/title>/i) || [])[1] || "";
  must(title.includes("VBLandshark"), `title is "${title}"`);
  return title;
});
for (const f of ["vblandshark-boat.jpg", "icon-180.png", "manifest.webmanifest"]) {
  add(`Live site ${f}`, async () => {
    const r = await req(SITE + f);
    const n = (await r.arrayBuffer()).byteLength;
    must(n > 100, `only ${n} bytes`);
    return `${n} bytes`;
  });
}

add("Open-Meteo marine (waves)", async () => {
  const j = await json(MARINE_URL);
  must(!j.error, j.reason);
  must(num(j.current?.wave_height), "no current wave_height");
  must(num(j.current?.sea_surface_temperature), "no current sea_surface_temperature");
  must(j.hourly?.wave_height?.length > 24, "hourly wave_height missing");
  must(j.daily?.wave_height_max?.length >= 3, "daily wave_height_max missing");
  return `${j.current.wave_height} ft, water ${j.current.sea_surface_temperature}°F`;
});
add("Open-Meteo forecast (weather)", async () => {
  const j = await json(WX_URL);
  must(!j.error, j.reason);
  must(num(j.current?.temperature_2m), "no current temperature_2m");
  must(num(j.current?.wind_speed_10m), "no current wind_speed_10m");
  must(j.daily?.sunrise?.length >= 3, "daily sunrise missing");
  must(j.hourly?.weather_code?.length > 24, "hourly weather_code missing");
  return `${j.current.temperature_2m}°F, wind ${j.current.wind_speed_10m} mph`;
});

add("weather.gov point forecast", async () => {
  const pts = await json(`https://api.weather.gov/points/${P.LAT},${P.LON}`, geo);
  must(pts.properties?.forecast, "points has no forecast link");
  const f = await json(pts.properties.forecast, geo);
  must(f.properties?.periods?.length > 0, "no forecast periods");
  return f.properties.periods[0].name + ": " + f.properties.periods[0].shortForecast;
});
add("weather.gov alerts (point)", async () => {
  const j = await json(`https://api.weather.gov/alerts/active?point=${P.LAT},${P.LON}`, geo);
  must(Array.isArray(j.features), "no features list");
  return `${j.features.length} active`;
});
add("weather.gov alerts (zone ANZ656)", async () => {
  const j = await json("https://api.weather.gov/alerts/active?zone=ANZ656", geo);
  must(Array.isArray(j.features), "no features list");
  return `${j.features.length} active`;
});
add("weather.gov marine forecast ANZ656", async () => {
  const j = await json("https://api.weather.gov/zones/marine/ANZ656/forecast", geo);
  must(j.properties?.periods?.length > 0, "no forecast periods");
  return j.properties.periods[0].name;
});
for (const st of OBS) {
  add(`weather.gov observations ${st.id}`, async () => {
    const o = (await json(`https://api.weather.gov/stations/${st.id}/observations/latest`, geo)).properties;
    must(o?.timestamp, "no observation");
    const h = hoursOld(o.timestamp);
    must(h < 6, `latest observation is ${Math.round(h)} h old`);
    return `${Math.round(h * 60)} min old`;
  });
}

add(`NOAA tide predictions ${P.TIDE_STATION}`, async () => {
  const begin = ymd(new Date(Date.now() - 864e5));
  const j = await json(`${TIDE_BASE}&begin_date=${begin}&range=${24 * 32}&interval=hilo`);
  must(!j.error, j.error?.message);
  must(j.predictions?.length > 50, "no predictions");
  return `${j.predictions.length} highs/lows`;
});
for (const s of WTEMP_STATIONS) {
  add(`NOAA water temperature ${s}`, async () => {
    const j = await json(`${WTEMP_BASE}&station=${s}`);
    must(!j.error, j.error?.message);
    must(j.data?.length && j.data[0].v !== "", "no reading");
    return `${j.data[0].v}°F at ${j.data[0].t}`;
  });
}

for (const b of BUOYS) {
  add(`CDIP buoy ${b.id} (${b.name})`, async () => {
    const B = "https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/realtime/";
    const dds = await text(`${B}${b.id}p1_rt.nc.dds`);
    const n = k => +((dds.match(new RegExp(k + "\\s*=\\s*(\\d+)")) || [])[1] || 0);
    const nw = n("waveTime");
    must(nw, "no waveTime in data");
    const txt = await text(`${B}${b.id}p1_rt.nc.ascii?waveTime[${nw - 1}],waveHs[${nw - 1}],waveTp[${nw - 1}],waveDp[${nw - 1}]`);
    const body = txt.slice(txt.lastIndexOf("-----") + 5), v = {};
    for (const m of body.matchAll(/(\w+)\[1\]\s*\n\s*([-\d.eE]+)/g)) v[m[1]] = +m[2];
    must(num(v.waveHs) && num(v.waveTime), "couldn't read waveHs/waveTime");
    const h = hoursOld(v.waveTime * 1000);
    must(h < 12, `last report ${Math.round(h)} h ago`);
    return `${(v.waveHs * 3.28084).toFixed(1)} ft, ${Math.round(h * 60)} min ago`;
  });
}

add("NOAA radar map (conus_bref_qcd)", async () => {
  const cap = await text(RADAR_URL.split("?")[0] + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities");
  must(cap.includes("conus_bref_qcd"), "layer conus_bref_qcd not listed");
  const r = await req(RADAR_URL);
  must((r.headers.get("content-type") || "").startsWith("image/"), `map returned ${r.headers.get("content-type")}`);
  return "layer listed, map image OK";
});
add("USGS topo map", async () => {
  const r = await req(TOPO_URL);
  must((r.headers.get("content-type") || "").startsWith("image/"), `map returned ${r.headers.get("content-type")}`);
  return "map image OK";
});
add(`Wikimedia fish images (${FISH.length})`, async () => {
  const bad = [];
  for (const f of FISH) {
    const file = f.img.split("/").pop();
    try { await req(`${WM}${f.img}/330px-${file}`, {method: "HEAD"}); } catch (e) { bad.push(`${f.name} (${e.message})`); }
  }
  must(!bad.length, "not loading: " + bad.join(", "));
  return "all load";
});
add("NOAA ACIS climate (records/normals)", async () => {
  const d = new Date().toLocaleDateString("en-CA", {timeZone: P.TZ});
  const j = await json("https://data.rcc-acis.org/StnData", {method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({sid: grab(/const sid = "([^"]+)"/, "ACIS station"), sdate: d, edate: d, elems: [{name: "maxt", normal: "1"}, {name: "mint", normal: "1"}]})});
  must(!j.error, j.error);
  must(j.data?.[0]?.length === 3 && j.data[0][1] !== "M", "no normals");
  return `normal high ${j.data[0][1]}°F`;
});

add("Page script parses (node --check)", async () => {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const f = path.join(os.tmpdir(), "vbl-page.js");
  fs.writeFileSync(f, scripts.join("\n;\n"));
  try { execFileSync(process.execPath, ["--check", f], {stdio: "pipe"}); }
  catch (e) { throw new Error(String(e.stderr).split("\n").slice(0, 5).join(" ")); }
  return `${scripts.length} script blocks OK`;
});
add("Page div tags balanced", async () => {
  const o = (html.match(/<div\b/g) || []).length, c = (html.match(/<\/div>/g) || []).length;
  must(o === c, `${o} opening vs ${c} closing`);
  return `${o}/${c}`;
});

// ---- Run (each failed check gets one retry a minute later, to skip brief blips) ----
async function runAll(list) {
  return Promise.all(list.map(async c => {
    try { return {...c, ok: true, note: await c.fn()}; } catch (e) { return {...c, ok: false, note: e.message || String(e)}; }
  }));
}

(async () => {
  let res = await runAll(checks);
  const failed = res.filter(r => !r.ok);
  if (failed.length) {
    await new Promise(r => setTimeout(r, 60000));
    const again = await runAll(failed);
    res = res.map(r => again.find(a => a.name === r.name) || r);
  }
  for (const r of res) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name} — ${r.note}`);
  const bad = res.filter(r => !r.ok);
  await report(bad, res);
  if (bad.length) process.exitCode = 1;
})();

// ---- GitHub issue reporting ----
async function report(bad, all) {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return;
  const api = (p, opts = {}) => fetch(`https://api.github.com/repos/${repo}${p}`, {...opts,
    headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": UA}}).then(r => r.json());
  const TITLE = "Site check: something on VBLandshark needs a look";
  const open = (await api("/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100")).filter(i => i.title === TITLE)[0];
  const today = new Date().toLocaleDateString("en-US", {timeZone: P.TZ, month: "short", day: "numeric", year: "numeric"});
  const key = bad.map(b => b.name).sort().join("|");
  const run = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  if (!bad.length) {
    if (open) {
      await api(`/issues/${open.number}/comments`, {method: "POST", body: JSON.stringify({body: `All ${all.length} checks passing again (${today}). Closing this.`})});
      await api(`/issues/${open.number}`, {method: "PATCH", body: JSON.stringify({state: "closed", state_reason: "completed"})});
    }
    return;
  }
  const list = bad.map(b => `- **${b.name}**: ${b.note}`).join("\n");
  const msg = `${bad.length} of ${all.length} checks failed on ${today}:\n\n${list}\n\n` +
    `A single server error or timeout is usually a temporary outage and clears up on its own. ` +
    `If the same item keeps failing for days, the source has probably changed and the page needs a fix.\n\n[Full results](${run})\n\n<!-- key:${key} -->`;
  if (!open) {
    await api("/issues", {method: "POST", body: JSON.stringify({title: TITLE, body: msg})});
  } else if (!(open.body || "").includes(`<!-- key:${key} -->`)) {
    // The list of problems changed: comment (emails the owner) and refresh the issue text.
    await api(`/issues/${open.number}/comments`, {method: "POST", body: JSON.stringify({body: msg})});
    await api(`/issues/${open.number}`, {method: "PATCH", body: JSON.stringify({body: msg})});
  }
  // Same problems as yesterday: stay quiet.
}
