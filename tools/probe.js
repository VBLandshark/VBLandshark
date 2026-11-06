// One-off: save the GOES infrared image and the USGS base map over Virginia Beach into probe-out/.
const fs = require("fs");
(async () => {
  fs.mkdirSync("probe-out", {recursive: true});
  const box = "35.3834,-77.7646,38.2800,-74.1720";
  const get = async (u, f) => fs.writeFileSync("probe-out/" + f, Buffer.from(await (await fetch(u)).arrayBuffer()));
  await get(`https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=goes_longwave_imagery&STYLES=&CRS=EPSG:4326&BBOX=${box}&WIDTH=600&HEIGHT=600&FORMAT=image/png`, "ir.png");
  await get(`https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=goes_longwave_imagery&STYLES=&CRS=EPSG:4326&BBOX=25,-90,45,-65&WIDTH=600&HEIGHT=480&FORMAT=image/png`, "ir-east.png");
  await get(`https://basemap.nationalmap.gov/arcgis/services/USGSTopo/MapServer/WmsServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=0&STYLES=&CRS=EPSG:4326&BBOX=${box}&WIDTH=600&HEIGHT=600&FORMAT=image/png`, "topo.png");
  console.log(fs.readdirSync("probe-out").map(f => f + " " + fs.statSync("probe-out/" + f).size).join("\n"));
})();
