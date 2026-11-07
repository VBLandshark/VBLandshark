// Today's peak surfing time, exactly as the live page's "Best times" tab works it out (best 2-hour daylight window).
// Run by .github/workflows/pier-cam.yml; writes cam-frames/peak.json for the scheduled surf-report task.
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  fs.mkdirSync("cam-frames", {recursive: true});
  const out = {computed: new Date().toISOString(), ok: false};
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({timezoneId: "America/New_York", locale: "en-US"});
    const p = await ctx.newPage();
    await p.goto(process.env.SITE || "https://vblandshark.netlify.app/", {waitUntil: "domcontentloaded", timeout: 60000});
    await p.waitForFunction(() => typeof store !== "undefined" && store.wx && store.marine && store.hilo, null, {timeout: 60000});
    Object.assign(out, await p.evaluate(() => {
      // Same scoring and window picking as renderBest(), over all of today's daylight hours.
      const now = Date.now(), d0 = dayStart(now), d1 = addDays(now, 1);
      const suns = sunTimes(), sun = suns.find(z => z.rise >= d0 && z.rise < d1);
      if (!sun) return {note: "no sunrise/sunset for today"};
      const hours = [];
      for (let t = d0; t < d1; t += 36e5) {
        if (!(t >= sun.rise - 18e5 && t + 18e5 <= sun.set)) continue;
        const r = surfScore(t); if (r) hours.push({t, ...r});
      }
      const best = bestWindows(hours, 3, 3).sort((a, b) => b.sc - a.sc)[0];
      if (!best) return {note: "no daylight surf hours scored"};
      return {ok: true, time: new Date(best.t).toISOString(), local: fmtTime(new Date(best.t)),
        end: new Date(best.t + 72e5).toISOString(), score: Math.round(best.sc), rating: scorePill(best.sc)[0],
        why: reasons(best.why), sunrise: new Date(sun.rise).toISOString(), sunset: new Date(sun.set).toISOString()};
    }));
  } catch (e) { out.note = "error: " + e.message; }
  finally {
    fs.writeFileSync("cam-frames/peak.json", JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out));
    await b.close();
  }
})();
