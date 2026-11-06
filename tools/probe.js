// One-off: dump the GOES infrared image over Virginia Beach as base64 so it can be viewed.
(async () => {
  const u = "https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=goes_longwave_imagery&STYLES=&CRS=EPSG:4326&BBOX=35.3834,-77.7646,38.2800,-74.1720&WIDTH=300&HEIGHT=300&FORMAT=image/png";
  const b = Buffer.from(await (await fetch(u)).arrayBuffer()).toString("base64");
  console.log("B64START");
  for (let i = 0; i < b.length; i += 900) console.log("B64 " + b.slice(i, i + 900));
  console.log("B64END");
})();
