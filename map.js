// Define map bounds
const mapWidth = 6388;
const mapHeight = 7502;
const mapBounds = [[0, 0], [mapHeight, mapWidth]];

// Create the map object
const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -2,
  maxZoom: 2
});

// Load PNG as an overlay
const image = L.imageOverlay('assets/images/gen1_map.png', mapBounds).addTo(map);

// Set the map view to fit the image
map.fitBounds(mapBounds);

// Add coordinate display on mouse move
const coordinateDisplay = L.control({ position: 'topleft' });
coordinateDisplay.onAdd = function (map) {
  const div = L.DomUtil.create('div', 'coordinate-display');
  div.style.background = 'white';
  div.style.padding = '10px';
  div.style.borderRadius = '5px';
  div.style.fontSize = '14px';
  div.style.fontFamily = 'monospace';
  div.innerHTML = 'Coordinates: [0, 0]';
  return div;
};
coordinateDisplay.addTo(map);

// Update coordinates on mouse move
map.on('mousemove', function(e) {
  const coords = e.latlng;
  document.querySelector('.coordinate-display').innerHTML = 
    `Coordinates: [${Math.round(coords.lat)}, ${Math.round(coords.lng)}]`;
});

// Create a pane for Pokémon visibility circles so they sit under markers
map.createPane('pokemonCirclePane');
map.getPane('pokemonCirclePane').style.zIndex = 400;
map.getPane('pokemonCirclePane').style.pointerEvents = 'none';

// Define a custom icon for Weedle
const weedleIcon = L.icon({
  iconUrl: 'assets/sprites/gen_1_sprites/gen1_weedle.png',
  iconSize: [48, 48],
  // anchor so the bottom center of the icon points to the map coordinate
  iconAnchor: [24, 44],
  popupAnchor: [0, -40],
  className: 'pokemon-icon'
});

// Coordinates for Weedle in Viridian Forest
const weedleCoords = [4516, 1832];

// Add a circle under the icon to improve visibility
const weedleCircle = L.circleMarker(weedleCoords, {
  pane: 'pokemonCirclePane',
  radius: 14,
  color: '#000000',
  weight: 2,
  fillColor: '#ffe066',
  fillOpacity: 0.9,
  interactive: false
}).addTo(map);

// Add the Weedle marker using the custom icon
const weedleMarker = L.marker(weedleCoords, { icon: weedleIcon }).addTo(map);
weedleMarker.bindPopup('<strong>Weedle</strong><br>Viridian Forest');
