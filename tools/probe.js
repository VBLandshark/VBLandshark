// One-off: figure out how the Surfchex Virginia Beach Pier cam plays, and grab frames across its sweep.
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  fs.mkdirSync("probe-out", {recursive: true});
  const b = await chromium.launch({args: ["--autoplay-policy=no-user-gesture-required"]});
  const p = await b.newPage({viewport: {width: 1280, height: 900}});
  const media = new Set();
  p.on("request", r => { const u = r.url(); if (/m3u8|\.ts\b|\.mp4|stream|hls|rtsp|wowza|ipcam|\.jpg\?|snapshot/i.test(u)) media.add(r.resourceType() + " " + u.slice(0, 200)); });
  await p.goto("https://surfchex.com/cams/virginia-beach-web-cam/", {waitUntil: "domcontentloaded", timeout: 45000});
  await p.waitForTimeout(8000);
  const info = await p.evaluate(() => [...document.querySelectorAll("video, iframe, img")].filter(e => e.offsetWidth > 300).map(e => `${e.tagName} ${e.src || e.currentSrc || ""} ${e.tagName === "VIDEO" ? "paused=" + e.paused + " ready=" + e.readyState : ""} ${e.offsetWidth}x${e.offsetHeight}`));
  console.log("ELEMENTS\n" + info.join("\n"));
  for (const f of p.frames()) console.log("FRAME", f.url().slice(0, 200));
  // try to start it: click the player area, and call play() on any video
  const box = await p.$("video") || await p.$("iframe");
  if (box) { await box.scrollIntoViewIfNeeded(); await box.click({force: true}).catch(() => {}); }
  for (const f of p.frames()) await f.evaluate(() => document.querySelectorAll("video").forEach(v => { v.muted = true; v.play().catch(() => {}); })).catch(() => {});
  await p.waitForTimeout(8000);
  const state = [];
  for (const f of p.frames()) state.push(...await f.evaluate(() => [...document.querySelectorAll("video")].map(v => `paused=${v.paused} ready=${v.readyState} t=${v.currentTime.toFixed(1)} ${v.videoWidth}x${v.videoHeight} src=${(v.currentSrc || "").slice(0, 150)}`)).catch(() => []));
  console.log("VIDEO STATE\n" + state.join("\n"));
  // frames across the sweep
  for (let i = 0; i < 6; i++) {
    const el = await p.$("video") || await p.$("iframe");
    if (el) await el.screenshot({path: `probe-out/pier-${i}.png`}).catch(e => console.log("shot", e.message));
    await p.waitForTimeout(10000);
  }
  console.log("MEDIA REQUESTS\n" + [...media].slice(0, 30).join("\n"));
  await b.close();
})();
