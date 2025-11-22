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
  'Grass': '#1fc91fff',
  'Poison': '#670063ff',
  'Bug': '#A0A020',
  'Normal': '#afafafff',
  'Flying': '#A890F0',
  'Fire': '#e22b1aff',
  'Water': '#2e68efff',
  'Psychic': '#c107b7ff',
  'Rock': '#7e420aff',
  'Ground': '#c16d07ff',
  'Ghost': '#d581e4ff',
  'Ice': '#23bde8ff',
  'Dragon': '#2c00f2ff',
  'Fighting': '#ffa641ff'
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
  // Clear all existing groups (each group contains a marker + its circle)
  allMarkers.forEach(group => {
    if (map.hasLayer(group)) map.removeLayer(group);
  });
  allMarkers = [];

  console.log(`Updating markers for game: ${game}`);

  // Build a map of location_id => array of { poke, locEntry }
  const locationMap = {}; // { locationId: [{poke, locEntry}, ...] }

  pokemonData.forEach(poke => {
    const gameData = poke.games && poke.games[game];
    if (!gameData || !gameData.locations) return;

    gameData.locations.forEach(locEntry => {
      // Expect locEntry.location_id to reference locationsData
      const locationId = locEntry.location_id;
      if (!locationMap[locationId]) locationMap[locationId] = [];
      locationMap[locationId].push({ poke, locEntry });
    });
  });

  // For each location that has at least one pokemon, create a single marker with popup listing
  Object.keys(locationMap).forEach(locationId => {
    const location = locationsData[locationId];
    if (!location || !location.coordinates || location.coordinates.length < 2) {
      console.log(`Skipping location ${locationId} - no coords`);
      return;
    }

    const lat = location.coordinates[0];
    const lng = location.coordinates[1];

    // Build popup HTML with a list of pokemon rows
    // Each row: icon, name, level(s), rate, checkbox
    const rows = locationMap[locationId].map(({ poke, locEntry }) => {
      const spritePath = `./assets/sprites/gen_1_sprites/${poke.id}.png`;
      // Determine level text
      let levelText = '';
      if (locEntry.level_range) {
        levelText = Array.isArray(locEntry.level_range) ? `${locEntry.level_range[0]}-${locEntry.level_range[1]}` : `${locEntry.level_range}`;
      }
      const rateText = locEntry.appearance_rate || locEntry.appearance || '';
      const checkboxId = `chk_${game}_${poke.id}_${locationId}`;
      const stored = localStorage.getItem(checkboxId);
      const checkedAttr = stored === 'true' ? 'checked' : '';

      return `
        <div class="popup-row" data-poke-id="${poke.id}" data-location-id="${locationId}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.05)">
          <img src="${spritePath}" alt="${poke.name}" width="32" height="32" onerror="this.style.opacity=.6;this.src='./assets/images/placeholder.png'"/>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">${poke.name}</div>
            <div style="font-size:12px;color:#333">Lvl ${levelText} &nbsp; • &nbsp; ${rateText}</div>
          </div>
          <div>
            <input type="checkbox" id="${checkboxId}" ${checkedAttr} />
          </div>
        </div>
      `;
    }).join('');

    const popupHtml = `
      <div style="min-width:240px">
        <div style="font-weight:bold;margin-bottom:6px">${location.name}</div>
        ${rows}
      </div>
    `;

    const marker = L.marker([lat, lng], {
      title: location.name,
      riseOnHover: true
    });

    marker.bindPopup(popupHtml, { maxWidth: 400 });

    // Create visibility circle for this location (kept under markers via pane)
    let circle = null;
    try {
      circle = L.circleMarker([lat, lng], {
        pane: 'pokemonCirclePane',
        radius: 16,
        color: '#000',
        weight: 2,
        fillColor: '#ffe066',
        fillOpacity: 0.9,
        interactive: false
      });
    } catch (err) {
      console.warn('Failed to create circle for', locationId, err);
      circle = null;
    }

    // Putting both the circle and the marker into a single group for easy removal
    const layers = [];
    if (circle) layers.push(circle);
    layers.push(marker);
    const group = L.layerGroup(layers).addTo(map);
    allMarkers.push(group);

    // Attach event handler to bind checkbox behavior once popup is opened
    marker.on('popupopen', (e) => {

      const popupEl = e.popup.getElement();
      if (!popupEl) return;

      const inputs = popupEl.querySelectorAll('input[type="checkbox"]');
      inputs.forEach(input => {
        const id = input.id;

        const stored = localStorage.getItem(id);
        if (stored !== null) input.checked = stored === 'true';

        input.addEventListener('change', (evt) => {
          const isChecked = evt.target.checked;
          localStorage.setItem(id, isChecked ? 'true' : 'false');

          const row = evt.target.closest('.popup-row');
          if (row) {
            row.style.opacity = isChecked ? '0.5' : '1.0';
          }

        });
      });

      // Also, set initial row opacity based on stored checkbox state
      const rowsEls = popupEl.querySelectorAll('.popup-row');
      rowsEls.forEach(row => {
        const pokeId = row.getAttribute('data-poke-id');
        const locId = row.getAttribute('data-location-id');
        const cbId = `chk_${game}_${pokeId}_${locId}`;
        const val = localStorage.getItem(cbId);
        if (val === 'true') row.style.opacity = '0.5';
      });
    });
  });

  console.log(`Total location markers added: ${allMarkers.length}`);
}