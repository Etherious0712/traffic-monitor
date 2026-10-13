// The map: OpenFreeMap base map, TomTom traffic-flow colours, and incidents drawn as lines/points coloured by cause.
// `maplibregl` is the global from the MapLibre script tag in index.html.
import { CAUSE, esc, chip, roadName, delayText, evidence } from './util.js';

const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const map = new maplibregl.Map({
  container: 'map',
  style: `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`,
  center: [101.62, 3.1],
  zoom: 10.5,
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');

let ready = false; // base map style loaded, our layers added
let incidents = []; // latest incidents, for popups
let traffic = false; // the server has a TomTom key, so flow tiles exist

// MapLibre "match" expression: cause id -> colour.
const colorExpr = ['match', ['get', 'cause'], ...Object.entries(CAUSE).flatMap(([k, [, c]]) => [k, c]), '#8d8d8d'];

// Once the base map has loaded: add the incident layers and make them clickable.
map.on('load', () => {
  map.addSource('incidents', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'inc-lines',
    type: 'line',
    source: 'incidents',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': colorExpr, 'line-width': ['+', 3, ['get', 'magnitude']], 'line-opacity': 0.85 },
  });
  map.addLayer({
    id: 'inc-points',
    type: 'circle',
    source: 'incidents',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-color': colorExpr, 'circle-radius': 7, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
  });
  for (const layer of ['inc-lines', 'inc-points']) {
    map.on('click', layer, (e) => showPopup(e.features[0].properties.id, e.lngLat));
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }
  ready = true;
  draw();
});

// Draw the latest data. The TomTom flow layer is added the first time traffic data is available,
// underneath the incident lines.
function draw() {
  if (!ready) return;
  if (traffic && !map.getSource('flow')) {
    map.addSource('flow', {
      type: 'raster',
      tiles: [`${location.origin}/tiles/flow/{z}/{x}/{y}.png`],
      tileSize: 256,
      attribution: '© TomTom',
    });
    map.addLayer({ id: 'flow', type: 'raster', source: 'flow', paint: { 'raster-opacity': 0.8 } }, 'inc-lines');
  }
  map.getSource('incidents').setData({
    type: 'FeatureCollection',
    features: incidents
      .filter((i) => i.geometry)
      .map((i) => ({
        type: 'Feature',
        geometry: i.geometry,
        properties: { id: i.id, cause: i.cause.cause, magnitude: i.magnitudeOfDelay ?? 0 },
      })),
  });
}

// Show the latest incidents (all cities) on the map.
export function setIncidents(list, hasTraffic) {
  incidents = list;
  traffic = hasTraffic;
  draw();
}

// Popup for one incident: road, cause, delay, where the cause came from and its sources.
function showPopup(id, lngLat) {
  const i = incidents.find((x) => x.id === id);
  if (!i) return;
  new maplibregl.Popup({ maxWidth: '300px' })
    .setLngLat(lngLat)
    .setHTML(
      `<strong>${esc(roadName(i))}</strong><br>${chip(i.cause.cause)} ${esc(delayText(i))}
       <div class="summary">${esc(i.cause.summary)}</div>
       <small>${esc(i.cause.source)} · ${esc(i.cause.confidence)} confidence${evidence(i.cause)}</small>`,
    )
    .addTo(map);
}

// Fly to an incident (from the sidebar list) and open its popup. `at` is its midpoint, sent by the server.
export function focusIncident(i) {
  if (!i?.at.length) return;
  map.flyTo({ center: i.at, zoom: 14 });
  showPopup(i.id, i.at);
}

// Zoom to a city's box. Waits for the map if it hasn't loaded yet.
export function fitRegion(r) {
  if (!r) return;
  if (!ready) return map.once('load', () => fitRegion(r));
  const [w, s, e, n] = r.bbox;
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding: 20, duration: 800 },
  );
}
