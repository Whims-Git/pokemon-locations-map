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

// Global state for markers and data
let allMarkers = [];
let pokemonData = {};
let locationsData = {};
let currentGame = 'Red';

// Add game filter control
const gameControl = L.control({ position: 'topright' });
gameControl.onAdd = function (map) {
  const div = L.DomUtil.create('div', 'game-control');
  div.style.background = 'white';
  div.style.padding = '10px';
  div.style.borderRadius = '5px';
  div.style.fontFamily = 'Arial, sans-serif';
  div.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';
  
  const label = L.DomUtil.create('label', '', div);
  label.style.display = 'block';
  label.style.marginBottom = '5px';
  label.style.fontWeight = 'bold';
  label.innerHTML = 'Game Version:';
  
  const select = L.DomUtil.create('select', '', div);
  select.style.padding = '5px';
  select.style.width = '100%';
  select.style.borderRadius = '3px';
  select.style.border = '1px solid #ccc';
  select.style.cursor = 'pointer';
  
  ['Red', 'Blue', 'Yellow'].forEach(game => {
    const option = L.DomUtil.create('option', '', select);
    option.value = game;
    option.innerHTML = game;
    if (game === 'Red') option.selected = true;
  });
  
  L.DomEvent.on(select, 'change', function () {
    currentGame = select.value;
    updateMarkers(currentGame);
  });
  
  return div;
};
gameControl.addTo(map);

// Load locations and pokemon data, then display markers
fetch('./pokemon_data_gen/gen1_kanto.json')
  .then(res => res.json())
  .then(data => {
    locationsData = data.locations.reduce((acc, loc) => {
      acc[loc.id] = loc;
      return acc;
    }, {});
    console.log('Loaded locations:', locationsData);
    return fetch('./pokemon_data_gen/pokemon_gen1.json');
  })
  .then(res => res.json())
  .then(data => {
    pokemonData = data.pokemon;
    console.log('Loaded pokemon:', pokemonData);
    // Show Red game markers by default
    updateMarkers('Red');
  })
  .catch(err => console.error('Error loading data:', err));

// Function to update markers based on selected game
function updateMarkers(game) {
  // Clear all existing markers
  allMarkers.forEach(marker => map.removeLayer(marker));
  allMarkers = [];
  
  console.log(`Updating markers for game: ${game}`);
  console.log('Pokemon data:', pokemonData);
  console.log('Locations data:', locationsData);
  
  // Iterate through all pokemon and add markers for their locations in the selected game
  pokemonData.forEach(poke => {
    const gameData = poke.games && poke.games[game];
    if (!gameData || !gameData.locations) {
      console.log(`${poke.name} - No ${game} locations`);
      return;
    }
    
    console.log(`${poke.name} - Found ${game} locations:`, gameData.locations);
    
    gameData.locations.forEach(locEntry => {
      const location = locationsData[locEntry.location_id];
      console.log(`Looking up location: ${locEntry.location_id}`, location);
      
      if (!location || !location.coordinates || location.coordinates.length < 2) {
        console.log(`Location ${locEntry.location_id} has no valid coordinates`);
        return;
      }
      
      const lat = location.coordinates[0];
      const lng = location.coordinates[1];
      console.log(`Adding marker for ${poke.name} at [${lat}, ${lng}]`);
      
      // Create marker with default Leaflet icon
      const marker = L.marker([lat, lng]).addTo(map);
      
      // Build popup text
      let popupText = `<strong>${poke.name}</strong><br>${location.name}`;
      if (locEntry.method) popupText += `<br>Method: ${locEntry.method}`;
      if (locEntry.level_range) {
        const levelStr = Array.isArray(locEntry.level_range) 
          ? locEntry.level_range.join('-') 
          : locEntry.level_range;
        popupText += `<br>Level: ${levelStr}`;
      }
      if (locEntry.appearance_rate) popupText += `<br>Rate: ${locEntry.appearance_rate}`;
      if (locEntry.notes) popupText += `<br>Notes: ${locEntry.notes}`;
      
      marker.bindPopup(popupText);
      allMarkers.push(marker);
    });
  });
  
  console.log(`Total markers added: ${allMarkers.length}`);
}