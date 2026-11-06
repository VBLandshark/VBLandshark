// One-off: inspect nowCOAST satellite images over Virginia Beach (transparency and colors).
const zlib = require("zlib");
function decode(buf) {
  let pos = 8, w = 0, h = 0, type = 0, depth = 0, plte = null, trns = null; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString("ascii", pos + 4, pos + 8), d = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; }
    else if (kind === "PLTE") plte = d; else if (kind === "tRNS") trns = d; else if (kind === "IDAT") idat.push(d);
    pos += 12 + len;
  }
  if (depth !== 8) return {w, h, type, depth};
  const bpp = {6: 4, 2: 3, 3: 1, 0: 1, 4: 2}[type], stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  let prev = Buffer.alloc(stride); const px = [];
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
    for (let x = 0; x < w; x++) {
      let r, g, bb, al;
      if (type === 6) [r, g, bb, al] = line.subarray(x * 4, x * 4 + 4);
      else if (type === 2) { [r, g, bb] = line.subarray(x * 3, x * 3 + 3); al = 255; }
      else if (type === 3) { const k = line[x]; r = plte[k * 3]; g = plte[k * 3 + 1]; bb = plte[k * 3 + 2]; al = trns && k < trns.length ? trns[k] : 255; }
      else if (type === 4) { r = g = bb = line[x * 2]; al = line[x * 2 + 1]; }
      else { r = g = bb = line[x]; al = 255; }
      px.push([r, g, bb, al]);
    }
    prev = line;
  }
  return {w, h, type, px};
}
(async () => {
  const B = "https://nowcoast.noaa.gov/geoserver/satellite/wms";
  for (const n of ["goes_longwave_imagery", "goes_visible_imagery", "global_longwave_imagery_mosaic"]) {
    const u = `${B}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${n}&STYLES=&CRS=EPSG:4326&BBOX=35.38,-77.75,38.28,-74.18&WIDTH=200&HEIGHT=200&FORMAT=image/png&TRANSPARENT=true`;
    const d = decode(Buffer.from(await (await fetch(u)).arrayBuffer()));
    if (!d.px) { console.log(n, "unsupported", d); continue; }
    const transp = d.px.filter(p => p[3] === 0).length, partial = d.px.filter(p => p[3] > 0 && p[3] < 255).length;
    const hist = {}; d.px.forEach(p => { const k = p.map(v => Math.round(v / 32) * 32).join(","); hist[k] = (hist[k] || 0) + 1; });
    const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join("  ");
    console.log(n, `type ${d.type}`, `transparent ${transp}/${d.px.length}`, `partial ${partial}`, "top colors (r,g,b,a):", top);
  }
  const st = await (await fetch(B + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetStyles&LAYERS=goes_longwave_imagery")).text();
  console.log("STYLES", st.slice(0, 1500).replace(/\s+/g, " "));
})();
