// Capture frames from the Surfchex Virginia Beach Pier cam across its sweep (pier to the 1st Street jetty).
// Run by .github/workflows/pier-cam.yml; frames go to the cam-frames branch for the scheduled surf report to look at.
const { chromium } = require("playwright");
const fs = require("fs");
const FRAMES = +(process.env.FRAMES || 15), EVERY = +(process.env.EVERY || 10);   // 15 frames, 10 s apart ≈ one full sweep
(async () => {
  fs.mkdirSync("cam-frames", {recursive: true});
  const status = {time: new Date().toISOString(), online: false, frames: [], note: ""};
  // Use real Google Chrome (preinstalled on GitHub runners): Playwright's own Chromium can't play the cam's H.264 video,
  // and the player then shows "temporarily offline". Fall back to Chromium if Chrome isn't there.
  const opts = {args: ["--autoplay-policy=no-user-gesture-required"]};
  const b = await chromium.launch({...opts, channel: "chrome"}).catch(() => chromium.launch(opts));
  try {
    const p = await b.newPage({viewport: {width: 1600, height: 1000}});
    await p.goto("https://surfchex.com/cams/virginia-beach-web-cam/", {waitUntil: "domcontentloaded", timeout: 60000});
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      await p.waitForTimeout(2000);
      ok = await p.evaluate(() => [...document.querySelectorAll("video")].some(v => v.readyState >= 2 && v.videoWidth > 0)).catch(() => false);
      if (!ok) await p.evaluate(() => document.querySelectorAll("video").forEach(v => { v.muted = true; v.play().catch(() => {}); })).catch(() => {});
    }
    const offline = await p.evaluate(() => /temporarily offline/i.test(document.body.innerText)).catch(() => false);
    if (!ok) { status.note = offline ? "camera says it is temporarily offline" : "video never started"; return; }
    status.online = true;
    for (let i = 0; i < FRAMES; i++) {
      // grab the video's own pixels at full resolution
      const data = await p.evaluate(() => {
        const v = [...document.querySelectorAll("video")].find(x => x.videoWidth > 0);
        const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext("2d").drawImage(v, 0, 0);
        try { return c.toDataURL("image/jpeg", 0.85); } catch (e) { return null; }
      });
      const f = `frame-${String(i).padStart(2, "0")}.jpg`;
      if (data) fs.writeFileSync(`cam-frames/${f}`, Buffer.from(data.split(",")[1], "base64"));
      else await (await p.$("video")).screenshot({path: `cam-frames/${f}`, type: "jpeg", quality: 85});
      status.frames.push(f);
      if (i < FRAMES - 1) await p.waitForTimeout(EVERY * 1000);
    }
  } catch (e) { status.note = "error: " + e.message; }
  finally {
    fs.writeFileSync("cam-frames/status.json", JSON.stringify(status, null, 1));
    console.log(JSON.stringify(status));
    await b.close();
  }
})();
