// One-off: check the time dimension of the radar and satellite WMS layers, and test fetching older frames.
const fs = require("fs");
(async () => {
  const show = (cap, layer) => {
    const i = cap.indexOf(`<Name>${layer}</Name>`);
    if (i < 0) return console.log(layer, "NOT FOUND");
    const chunk = cap.slice(i, i + 6000);
    const dim = chunk.match(/<Dimension[^>]*name="time"[^>]*>([^<]*)<\/Dimension>/);
    const tag = chunk.match(/<Dimension[^>]*name="time"[^>]*>/);
    console.log(layer, tag ? tag[0] : "no time dim", dim ? "EXTENT(first/last 300): " + dim[1].slice(0, 300) + " ... " + dim[1].slice(-300) : "");
  };
  const R = "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows";
  const rc = await (await fetch(R + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities")).text();
  show(rc, "conus_bref_qcd");
  const S = "https://nowcoast.noaa.gov/geoserver/satellite/wms";
  const sc = await (await fetch(S + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities")).text();
  show(sc, "goes_longwave_imagery");
  const box = "35.3834,-77.7646,38.2800,-74.1720";
  for (const ago of [0, 30, 60, 120, 180]) {
    const t = new Date(Date.now() - ago * 6e4); t.setUTCSeconds(0, 0); t.setUTCMinutes(t.getUTCMinutes() - t.getUTCMinutes() % 10);
    const iso = t.toISOString().replace(".000", "");
    for (const [name, u] of [["radar", `${R}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=conus_bref_qcd&STYLES=&CRS=EPSG:4326&BBOX=25,-125,50,-65&WIDTH=600&HEIGHT=260&FORMAT=image/png&TRANSPARENT=true&TIME=${iso}`],
                             ["sat", `${S}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=goes_longwave_imagery&STYLES=&CRS=EPSG:4326&BBOX=${box}&WIDTH=300&HEIGHT=300&FORMAT=image/png&TIME=${iso}`]]) {
      const r = await fetch(u); const b = Buffer.from(await r.arrayBuffer());
      console.log(name, iso, r.status, r.headers.get("content-type"), b.length, r.headers.get("content-type")?.includes("xml") ? b.toString().slice(0, 200) : "");
    }
  }
})();
