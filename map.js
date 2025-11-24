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
    // Build a quick lookup map by pokemon id
    pokemonData = data.pokemon.reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {});
    console.log('Loaded pokemon metadata:', pokemonData);
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

  Object.values(locationsData).forEach(location => {
    const encounters = location.encounters || [];
    
    const allRows = (location.encounters || []).concat(location.gifts || []);
    // Then iterate allRows the same way

    // Build popup rows for this game version only
    const rows = allRows
      .map(enc => {
        const gameData = enc.games && enc.games[game];
        if (!gameData) return null; // Pokemon not in this game version at this location
        
        const poke = pokemonData[enc.pokemon_id];
        if (!poke) {
          console.warn(`Pokemon ${enc.pokemon_id} not found in metadata`);
          return null;
        }
        const sprite = `./assets/sprites/gen_1_sprites/${enc.pokemon_id}.png`;
        const levelText = gameData.min_level !== undefined && gameData.max_level !== undefined
          ? `${gameData.min_level}-${gameData.max_level}`
          : (gameData.level || '');
        const rateText = gameData.rate || '';
        const checkboxId = `chk_${game}_${enc.pokemon_id}_${location.id}`;
        const checked = localStorage.getItem(checkboxId) === 'true' ? 'checked' : '';

        return `
          <div class="popup-row" data-poke-id="${enc.pokemon_id}" data-location-id="${location.id}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.05)">
            <img src="${sprite}" alt="${poke.name}" width="32" height="32" onerror="this.style.opacity=.6;this.src='./assets/images/placeholder.png'"/>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600">${poke.name}</div>
              <div style="font-size:12px;color:#333">Lv: ${levelText} &nbsp; • &nbsp; ${rateText}</div>
            </div>
            <div>
              <input type="checkbox" id="${checkboxId}" ${checked} />
            </div>
          </div>
        `;
      })
      .filter(row => row !== null) // Remove null entries (Pokemon not in this game)
      .join('');

    if (rows.length === 0) return; // Skip location if no encounters for this game

    const popupHtml = `
      <div style="min-width:240px">
        <div style="font-weight:bold;margin-bottom:6px">${location.name}</div>
        ${rows}
      </div>
    `;

    // Create marker + circle as before...
    const marker = L.marker([location.coordinates[0], location.coordinates[1]], {
      title: location.name,
      riseOnHover: true
    });

    marker.bindPopup(popupHtml, { maxWidth: 400 });

    let circle = null;
    try {
      circle = L.circleMarker([location.coordinates[0], location.coordinates[1]], {
        pane: 'pokemonCirclePane',
        radius: 16,
        color: '#000',
        weight: 2,
        fillColor: '#ffe066',
        fillOpacity: 0.9,
        interactive: false
      });
    } catch (err) {
      console.warn('Failed to create circle for', location.id, err);
    }

    const layers = [];
    if (circle) layers.push(circle);
    layers.push(marker);
    const group = L.layerGroup(layers).addTo(map);
    allMarkers.push(group);

    // Attach checkbox handlers (same as before)...
    marker.on('popupopen', (e) => {
      const popupEl = e.popup.getElement();
      if (!popupEl) return;

      const inputs = popupEl.querySelectorAll('input[type="checkbox"]');
      inputs.forEach(input => {
        const id = input.id;
        const stored = localStorage.getItem(id);
        if (stored !== null) input.checked = stored === 'true';

        input.addEventListener('change', (evt) => {
          localStorage.setItem(id, evt.target.checked ? 'true' : 'false');
          const row = evt.target.closest('.popup-row');
          if (row) row.style.opacity = evt.target.checked ? '0.5' : '1.0';
        });
      });

      const rowsEls = popupEl.querySelectorAll('.popup-row');
      rowsEls.forEach(row => {
        const pokeId = row.getAttribute('data-poke-id');
        const locId = row.getAttribute('data-location-id');
        const cbId = `chk_${game}_${pokeId}_${locId}`;
        if (localStorage.getItem(cbId) === 'true') row.style.opacity = '0.5';
      });
    });
  });

  console.log(`Total location markers added: ${allMarkers.length}`);
}