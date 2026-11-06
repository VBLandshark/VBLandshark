// One-off: list nowCOAST satellite WMS layers and test a map image over Virginia Beach.
(async () => {
  const B = "https://nowcoast.noaa.gov/geoserver/satellite/wms";
  const cap = await (await fetch(B + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities")).text();
  const names = [...cap.matchAll(/<Layer[^>]*>\s*<Name>([^<]+)<\/Name>\s*<Title>([^<]*)<\/Title>/g)].map(m => m[1] + " | " + m[2]);
  console.log("LAYERS", names.join("\n"));
  console.log("4326?", cap.includes("EPSG:4326"));
  for (const t of [...cap.matchAll(/<Dimension name="time"[^>]*default="([^"]*)"/g)].slice(0, 8)) console.log("time default", t[1]);
  for (const n of names.map(s => s.split(" | ")[0])) {
    const u = `${B}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${n}&STYLES=&CRS=EPSG:4326&BBOX=35.38,-77.75,38.28,-74.18&WIDTH=300&HEIGHT=300&FORMAT=image/png&TRANSPARENT=true`;
    const r = await fetch(u); const b = Buffer.from(await r.arrayBuffer());
    console.log("GETMAP", n, r.status, r.headers.get("content-type"), b.length, r.headers.get("access-control-allow-origin"));
  }
})();
