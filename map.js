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

// Global state for markers and data
let allMarkers = [];
let pokemonData = {};
let locationsData = {};
let currentGame = 'Red';
let pokemonIcons = {}; // Cache for pokemon icons

// Color map for different pokemon types
const typeColors = {
  'Electric': '#FFD700',
  'Grass': '#90EE90',
  'Poison': '#DA70D6',
  'Bug': '#A0A020',
  'Normal': '#A8A878',
  'Flying': '#A890F0',
  'Fire': '#F08030',
  'Water': '#6890F0'
};

// Function to create a custom icon for a pokemon
function createPokemonIcon(pokemonId, types = []) {
  if (pokemonIcons[pokemonId]) {
    return pokemonIcons[pokemonId];
  }
  
  // Get color based on primary type
  const color = typeColors[types[0]] || '#A8A878';
  
  // Try to load sprite; if it fails, use SVG fallback
  const spriteUrl = `./assets/sprites/gen_1_sprites/${pokemonId}.png`;
  const fallbackSvg = `<svg width="48" height="48" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="20" fill="${color}" stroke="#000" stroke-width="2"/>
    <text x="24" y="30" font-size="20" font-weight="bold" font-family="Arial" text-anchor="middle" fill="#000">${pokemonId.charAt(0).toUpperCase()}</text>
  </svg>`;
  const fallbackUrl = 'data:image/svg+xml;base64,' + btoa(fallbackSvg);
  
  const icon = L.icon({
    iconUrl: spriteUrl,
    iconSize: [48, 48],
    iconAnchor: [24, 44],
    popupAnchor: [0, -40],
    className: 'pokemon-icon'
  });
  
  // Add error handler to use fallback if sprite doesn't load
  const img = new Image();
  img.onerror = function() {
    icon.options.iconUrl = fallbackUrl;
  };
  img.src = spriteUrl;
  
  pokemonIcons[pokemonId] = icon;
  return icon;
}

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
      
      // Add visibility circle underneath marker
      L.circleMarker([lat, lng], {
        pane: 'pokemonCirclePane',
        radius: 14,
        color: '#000',
        weight: 2,
        fillColor: '#ffe066',
        fillOpacity: 0.9,
        interactive: false
      }).addTo(map);
      
      // Create marker with custom pokemon icon
      const pokemonIcon = createPokemonIcon(poke.id);
      const marker = L.marker([lat, lng], { icon: pokemonIcon }).addTo(map);
      
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