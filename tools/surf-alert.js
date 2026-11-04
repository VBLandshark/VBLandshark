// Good-surf alert for 1st Street Jetty / Rudee Inlet, run by .github/workflows/surf-alert.yml.
// Opens (and closes) a GitHub issue titled "GOOD SURF NOTICE ..." when surf is 4 ft+ and clean,
// which emails the owner. Quiet otherwise.
// Before noon Eastern it checks the rest of today's daylight; after noon it checks tomorrow.
// Rules: wave_height >= 4 ft, wave_period >= 7 s, wind under 5 mph (glassy) or from 230–330°
// (offshore) under 25 mph, between sunrise and sunset, at least 2 qualifying hours in a row.
// Run locally with: node tools/surf-alert.js   (no GITHUB_TOKEN = just prints the result)

const TZ = "America/New_York";
const UA = "VBLandshark surf alert (github.com/VBLandshark/VBLandshark)";
const MARINE = "https://marine-api.open-meteo.com/v1/marine?latitude=36.83&longitude=-75.94&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period&length_unit=imperial&timezone=America%2FNew_York&forecast_days=3";
const WX = "https://api.open-meteo.com/v1/forecast?latitude=36.8432&longitude=-75.9779&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=sunrise,sunset&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=3";
const TIDES = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&station=8639208&range=48&datum=MLLW&time_zone=lst_ldt&units=english&interval=hilo&format=json&application=vb_conditions";

const getJSON = async u => {
  const r = await fetch(u, {headers: {"User-Agent": UA}, signal: AbortSignal.timeout(30000)});
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(u).host}`);
  return r.json();
};
const DIRS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
const compass = d => DIRS[Math.round(d / 22.5) % 16];
const clock = s => { const [h, m] = s.slice(11, 16).split(":").map(Number); return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`; };
const dayName = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", {timeZone: "UTC", weekday: "short", month: "short", day: "numeric"});
const range = (a, unit) => { const lo = Math.floor(Math.min(...a)), hi = Math.round(Math.max(...a)); return lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`; };
const isClean = (mph, dir) => mph < 5 || (dir >= 230 && dir <= 330 && mph < 25);

(async () => {
  // Current Eastern time as "YYYY-MM-DDTHH:00"
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"})
    .formatToParts(new Date()).map(p => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`, hour = +parts.hour;
  const morning = hour < 12;

  let marine, wx;
  try { [marine, wx] = await Promise.all([getJSON(MARINE), getJSON(WX)]); }
  catch (e) { console.log(`No alert – surf data unavailable (${e.message})`); return; }

  const di = morning ? 0 : 1;
  const day = wx.daily.time[di], sunrise = wx.daily.sunrise[di], sunset = wx.daily.sunset[di];
  const from = morning ? `${today}T${String(hour).padStart(2, "0")}:00` : `${day}T00:00`;

  const hours = marine.hourly.time.map((t, i) => {
    const w = wx.hourly.time.indexOf(t);
    return {t, ft: marine.hourly.wave_height[i], per: marine.hourly.wave_period[i],
      mph: wx.hourly.wind_speed_10m[w], dir: wx.hourly.wind_direction_10m[w]};
  }).filter(h => h.t.startsWith(day) && h.t >= from && h.t >= sunrise.slice(0, 13) + ":00" && h.t <= sunset);

  for (const h of hours) h.ok = h.ft != null && h.mph != null && h.ft >= 4 && h.per >= 7 && isClean(h.mph, h.dir);

  // Longest run of qualifying hours
  let best = [], cur = [];
  for (const h of hours) { if (h.ok) { cur.push(h); if (cur.length > best.length) best = cur.slice(); } else cur = []; }

  const maxFt = Math.max(...hours.map(h => h.ft ?? 0));
  if (best.length < 2) {
    const maxWind = Math.max(...hours.map(h => h.mph ?? 0));
    console.log(`No alert – conditions don't meet 4 ft and clean\n${dayName(day)}: max ${maxFt.toFixed(1)} ft, wind up to ${Math.round(maxWind)} mph`);
    return;
  }

  const ft = range(best.map(h => h.ft), "");
  const per = Math.round(best.reduce((s, h) => s + h.per, 0) / best.length);
  const avgDir = best[Math.floor(best.length / 2)].dir;
  const mph = range(best.map(h => h.mph), " mph");
  const glassy = best.every(h => h.mph < 5);
  const windTxt = glassy ? `glassy, ${mph}` : `offshore ${compass(avgDir)} ${mph}`;
  const endT = best[best.length - 1].t.slice(0, 11) + String(+best[best.length - 1].t.slice(11, 13) + 1).padStart(2, "0") + ":00";
  const win = `${clock(best[0].t)}–${clock(endT)}`;

  let tide = "";
  try {
    const t = await getJSON(`${TIDES}&begin_date=${day.replace(/-/g, "")}`);
    const next = (t.predictions || []).find(p => p.t.replace(" ", "T") >= best[0].t);
    if (next) tide = ` Tide: ${next.type === "H" ? "high" : "low"} ${clock(next.t.replace(" ", "T"))}.`;
  } catch (e) {}

  const title = `GOOD SURF NOTICE – ${dayName(day)}: ${ft} ft @ ${per} s, ${windTxt}, best ${win}`;
  const body = `GOOD SURF NOTICE from Claude\n\n🏄 VB surf – ${dayName(day)}: ${ft} ft @ ${per} s, ${windTxt}, best ${win}.${tide} https://vblandshark.netlify.app\n\n` +
    best.map(h => `- ${clock(h.t)}: ${h.ft.toFixed(1)} ft @ ${Math.round(h.per)} s, wind ${compass(h.dir)} ${Math.round(h.mph)} mph`).join("\n") +
    `\n\n_Open-Meteo forecast for 36.83, -75.94. Rules: 4 ft+, 7 s+, glassy or offshore wind, daylight, 2+ hours in a row._`;
  console.log(title + "\n\n" + body);

  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return;
  const api = (p, opts = {}) => fetch(`https://api.github.com/repos/${repo}${p}`, {...opts,
    headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": UA}}).then(r => r.json());
  const issue = await api("/issues", {method: "POST", body: JSON.stringify({title, body})});
  if (issue.number) await api(`/issues/${issue.number}`, {method: "PATCH", body: JSON.stringify({state: "closed", state_reason: "completed"})});
  else console.log("Couldn't open issue:", JSON.stringify(issue));
})();
