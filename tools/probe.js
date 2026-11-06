// One-off: screenshot the beach cam pages so their current view can be checked.
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  fs.mkdirSync("probe-out", {recursive: true});
  const b = await chromium.launch();
  const cams = [
    ["surfline-24th", "https://www.vbsurfrescuemuseum.org/surfline-cam"],
    ["surfchex-pier", "https://surfchex.com/cams/virginia-beach-web-cam/"],
  ];
  for (const [name, url] of cams) {
    try {
      const p = await b.newPage({viewport: {width: 1280, height: 900}});
      await p.goto(url, {waitUntil: "domcontentloaded", timeout: 45000});
      await p.waitForTimeout(20000);
      await p.screenshot({path: `probe-out/${name}.png`});
      // also try to grab just the video element if there is one
      const v = await p.$("video, iframe");
      if (v) { await v.scrollIntoViewIfNeeded(); await p.waitForTimeout(3000); await v.screenshot({path: `probe-out/${name}-player.png`}).catch(e => console.log(name, "player shot failed", e.message)); }
      console.log(name, "ok", await p.title());
      await p.close();
    } catch (e) { console.log(name, "failed", e.message); }
  }
  await b.close();
})();
