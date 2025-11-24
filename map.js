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

// Filter state
const filters = {
  game: 'Red',
  obtainable: false,
  starter: false,
  gift: false,
  typeFilterEnabled: false,
  types: new Set(),
  methodFilterEnabled: false,
  method: 'Any'
};

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
  const div = L.DomUtil.create('div', 'filter-control');
  div.style.background = 'white';
  div.style.padding = '10px';
  div.style.borderRadius = '5px';
  div.style.fontFamily = 'Arial, sans-serif';
  div.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';
  div.style.maxWidth = '260px';

  // Build HTML for the control
  div.innerHTML = `
    <div style="font-weight:bold;margin-bottom:6px">Map Filters</div>
    <div style="margin-bottom:6px">
      <label style="font-weight:600">Game:</label>
      <select id="filter_game" style="width:100%;margin-top:4px;padding:4px">
        <option value="Red">Red</option>
        <option value="Blue">Blue</option>
        <option value="Yellow">Yellow</option>
      </select>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:6px">
      <label><input type="checkbox" id="filter_obtainable" /> Obtainable</label>
      <label><input type="checkbox" id="filter_starter" /> Starter</label>
      <label><input type="checkbox" id="filter_gift" /> Gift</label>
    </div>
    <div style="border-top:1px solid #eee;padding-top:6px;margin-top:6px">
      <label><input type="checkbox" id="filter_type_enable" /> Filter by Type</label>
      <div id="type_box" style="display:none;margin-top:6px;max-height:120px;overflow:auto;border:1px solid #f0f0f0;padding:6px">
      </div>
    </div>
    <div style="border-top:1px solid #eee;padding-top:6px;margin-top:6px">
      <label><input type="checkbox" id="filter_method_enable" /> Filter by Method</label>
      <select id="filter_method" style="width:100%;margin-top:6px;padding:4px;display:none">
        <option value="Any">Any</option>
        <option value="Walking">Walking</option>
        <option value="Fishing">Fishing</option>
        <option value="Surfing">Surfing</option>
        <option value="Gift">Gift</option>
        <option value="Trade">Trade</option>
      </select>
    </div>
    <div style="border-top:1px solid #eee;padding-top:6px;margin-top:6px">
      <div style="font-weight:600;margin-bottom:4px">Pokémon List</div>
      <div id="pokemon_list" style="max-height:220px;overflow:auto;border:1px solid #f6f6f6;padding:6px;background:#fff"></div>
    </div>
  `;

  // Add type checkboxes dynamically from typeColors keys
  const typeBox = div.querySelector('#type_box');
  Object.keys(typeColors).forEach(type => {
    const id = `type_${type}`;
    const row = document.createElement('div');
    row.style.marginBottom = '4px';
    row.innerHTML = `<label style="font-size:13px"><input type="checkbox" id="${id}" /> ${type}</label>`;
    typeBox.appendChild(row);
  });

  // Wire up events
  const gameSelect = div.querySelector('#filter_game');
  gameSelect.value = filters.game;
  gameSelect.addEventListener('change', () => {
    filters.game = gameSelect.value;
    updateMarkers(filters.game);
    renderPokemonList();
  });

  const obtainableChk = div.querySelector('#filter_obtainable');
  obtainableChk.addEventListener('change', () => {
    filters.obtainable = obtainableChk.checked;
    updateMarkers(filters.game);
    renderPokemonList();
  });

  const starterChk = div.querySelector('#filter_starter');
  starterChk.addEventListener('change', () => {
    filters.starter = starterChk.checked;
    updateMarkers(filters.game);
    renderPokemonList();
  });

  const giftChk = div.querySelector('#filter_gift');
  giftChk.addEventListener('change', () => {
    filters.gift = giftChk.checked;
    updateMarkers(filters.game);
    renderPokemonList();
  });

  const typeEnable = div.querySelector('#filter_type_enable');
  const methodEnable = div.querySelector('#filter_method_enable');
  const methodSelect = div.querySelector('#filter_method');

  typeEnable.addEventListener('change', () => {
    filters.typeFilterEnabled = typeEnable.checked;
    typeBox.style.display = typeEnable.checked ? 'block' : 'none';
    updateMarkers(filters.game);
    renderPokemonList();
  });

  // type checkboxes
  Object.keys(typeColors).forEach(type => {
    const el = div.querySelector(`#type_${type}`);
    el.addEventListener('change', () => {
      if (el.checked) filters.types.add(type);
      else filters.types.delete(type);
      updateMarkers(filters.game);
      renderPokemonList();
    });
  });

  methodEnable.addEventListener('change', () => {
    filters.methodFilterEnabled = methodEnable.checked;
    methodSelect.style.display = methodEnable.checked ? 'block' : 'none';
    updateMarkers(filters.game);
    renderPokemonList();
  });

  methodSelect.addEventListener('change', () => {
    filters.method = methodSelect.value;
    updateMarkers(filters.game);
    renderPokemonList();
  });

  return div;
};
gameControl.addTo(map);

// --- Pokémon list rendering for the filter panel ---
function pokemonMatchesFilters(poke) {
  const game = filters.game;
  const gameData = poke.games && poke.games[game];
  if (!gameData) return false;

  if (filters.obtainable && !gameData.obtainable) return false;
  if (filters.starter && !gameData.starter) return false;
  if (filters.gift && !gameData.gift) return false;

  if (filters.typeFilterEnabled && filters.types.size > 0) {
    const pokeTypes = Array.isArray(poke.types) ? poke.types : [];
    const hasType = pokeTypes.some(t => filters.types.has(t));
    if (!hasType) return false;
  }

  if (filters.methodFilterEnabled && filters.method !== 'Any') {
    // If any location entry for this game matches the method filter, allow it
    const kwsMap = {
      'Walking': ['grass', 'walk'],
      'Fishing': ['fish'],
      'Surfing': ['surf'],
      'Evolution': ['evolution'],
      'Trade': ['trade']
    };
    const kws = kwsMap[filters.method] || [filters.method.toLowerCase()];
    const matches = (gameData.locations || []).some(locEntry => {
      const methodText = (locEntry.method || '').toLowerCase();
      return kws.some(k => methodText.includes(k));
    });
    if (!matches) return false;
  }

  return true;
}

function renderPokemonList() {
  const container = document.getElementById('pokemon_list');
  if (!container) return;
  container.innerHTML = '';

  // Sort pokemon by regional_dex (fallback to id if missing)
  const sorted = (pokemonData || []).slice().sort((a, b) => {
    const da = (a.regional_dex || 9999);
    const db = (b.regional_dex || 9999);
    return da - db;
  });

  sorted.forEach(poke => {
    if (!pokemonMatchesFilters(poke)) return;

    const gameData = poke.games && poke.games[filters.game];
    const obtainable = gameData && !!gameData.obtainable;

    const row = document.createElement('div');
    row.className = 'filter-list-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '6px 4px';
    row.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
    row.style.fontSize = '13px';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '8px';
    left.style.minWidth = '0';

    const img = document.createElement('img');
    img.src = `./assets/sprites/gen_1_sprites/${poke.id}.png`;
    img.width = 28; img.height = 28;
    img.onerror = function() { this.style.opacity = .6; this.src = './assets/images/placeholder.png'; };

    const info = document.createElement('div');
    info.style.overflow = 'hidden';
    info.style.textOverflow = 'ellipsis';
    info.style.whiteSpace = 'nowrap';
    info.style.minWidth = '0';

    // Prepare a short locations preview for the selected game
    const locEntries = (gameData && gameData.locations) || [];
    const locNames = locEntries.map(le => (locationsData[le.location_id] && locationsData[le.location_id].name) || le.location_id);
    const locPreview = locNames.length === 0 ? '—' : (locNames.slice(0, 3).join(', ') + (locNames.length > 3 ? '...' : ''));

    info.innerHTML = `<strong style=\"font-weight:600\">${poke.regional_dex ? ('#'+poke.regional_dex) : ''} ${poke.name}</strong>` +
                     `<div style=\"font-size:11px;color:#333\">${obtainable ? 'Obtainable' : 'Not Obtainable'}</div>` +
                     `<div style=\"font-size:11px;color:#666;margin-top:2px;white-space:normal;overflow:hidden;text-overflow:ellipsis\">Locations: ${locPreview}</div>`;

    left.appendChild(img);
    left.appendChild(info);

    // Make the left area clickable to jump to the first listed location
    left.style.cursor = 'pointer';
    left.title = locNames.length ? `Jump to: ${locNames[0]}` : '';
    left.addEventListener('click', () => {
      if (locEntries.length > 0) {
        const firstLoc = locationsData[locEntries[0].location_id];
        if (firstLoc && firstLoc.coordinates && firstLoc.coordinates.length >= 2) {
          map.setView([firstLoc.coordinates[0], firstLoc.coordinates[1]], 0);
        }
      }
    });

    const cbWrap = document.createElement('div');
    const cbId = `chk_${filters.game}_${poke.id}`;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = cbId;
    cb.className = 'pokemon-checkbox';
    const stored = localStorage.getItem(cbId);
    cb.checked = stored === 'true';

    cb.addEventListener('change', (e) => {
      const v = e.target.checked;
      localStorage.setItem(cbId, v ? 'true' : 'false');
      updateAllCheckboxesWithId(cbId, v);
    });

    cbWrap.appendChild(cb);

    row.appendChild(left);
    row.appendChild(cbWrap);

    // Set opacity based on checkbox
    if (cb.checked) row.style.opacity = '0.5';

    container.appendChild(row);
  });
}

// Update all checkboxes with the same ID everywhere on the page
// This ensures that checking a Pokemon in one location checks it in all locations
function updateAllCheckboxesWithId(checkboxId, isChecked) {
  // Find all checkboxes on the page with this ID
  const allCheckboxes = document.querySelectorAll(`#${CSS.escape(checkboxId)}`);

  console.log(`Found ${allCheckboxes.length} checkboxes with ID ${checkboxId}`);

  // Update each checkbox state and adjust the UI for both popup rows and the
  // filter list rows. List rows use the class `filter-list-row` while popup
  // entries use `popup-row`.
  allCheckboxes.forEach(checkbox => {
    checkbox.checked = isChecked;

    // Try popup row first, then filter list row
    let row = checkbox.closest('.popup-row');
    if (!row) row = checkbox.closest('.filter-list-row');
    if (row) row.style.opacity = isChecked ? '0.5' : '1.0';
  });
}

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
    // Render pokemon list now that data is loaded
    renderPokemonList();
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

    // Apply game-level filters (obtainable/starter/gift) if they are enabled
    if (filters.obtainable && !gameData.obtainable) return;
    if (filters.starter && !gameData.starter) return;
    if (filters.gift && !gameData.gift) return;

    gameData.locations.forEach(locEntry => {
      // Apply method filter if enabled
      if (filters.methodFilterEnabled && filters.method !== 'Any') {
        const methodText = (locEntry.method || '').toLowerCase();
        const sel = filters.method;
        const keywords = {
          'Walking': ['grass', 'walk'],
          'Fishing': ['fish'],
          'Surfing': ['surf'],
          'Evolution': ['evolution'],
          'Trade': ['trade']
        };
        const kws = keywords[sel] || [sel.toLowerCase()];
        const matchesMethod = kws.some(k => methodText.includes(k));
        if (!matchesMethod) return; // skip this location entry
      }

      // Apply type filter if enabled
      if (filters.typeFilterEnabled && filters.types.size > 0) {
        const pokeTypes = Array.isArray(poke.types) ? poke.types : [];
        const hasType = pokeTypes.some(t => filters.types.has(t));
        if (!hasType) return; // skip this pokemon
      }

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
      
      // Use a simpler checkbox ID that only depends on the pokemon ID and game
      // This way, checking Pikachu in ANY location will affect ALL Pikachu instances
      const checkboxId = `chk_${game}_${poke.id}`;
      const stored = localStorage.getItem(checkboxId);
      const checkedAttr = stored === 'true' ? 'checked' : '';

      return `
        <div class="popup-row" data-poke-id="${poke.id}" data-game="${game}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.05)">
          <img src="${spritePath}" alt="${poke.name}" width="32" height="32" onerror="this.style.opacity=.6;this.src='./assets/images/placeholder.png'"/>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">${poke.name}</div>
            <div style="font-size:12px;color:#333">Lv: ${levelText} &nbsp; • &nbsp; ${rateText}</div>
          </div>
          <div>
            <input type="checkbox" id="${checkboxId}" class="pokemon-checkbox" ${checkedAttr} />
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

      // Get all checkboxes in this popup
      const inputs = popupEl.querySelectorAll('input.pokemon-checkbox');
      inputs.forEach(input => {
        const id = input.id;
        // id format: "chk_Red_pikachu"
        
        // Load the stored value from localStorage and set the checkbox
        const stored = localStorage.getItem(id);
        if (stored !== null) input.checked = stored === 'true';

        // Add a change event listener to this checkbox
        input.addEventListener('change', (evt) => {
          const isChecked = evt.target.checked;
          
          // Save the checkbox state to localStorage using the checkbox ID
          localStorage.setItem(id, isChecked ? 'true' : 'false');

          // Get the closest row element to fade it out
          const row = evt.target.closest('.popup-row');
          if (row) {
            row.style.opacity = isChecked ? '0.5' : '1.0';
          }

          // IMPORTANT: Update ALL checkboxes with the same ID across ALL popups
          // This is the key to making the global checkbox work
          updateAllCheckboxesWithId(id, isChecked);
        });
      });

      // Also, set initial row opacity based on stored checkbox state
      const rowsEls = popupEl.querySelectorAll('.popup-row');
      rowsEls.forEach(row => {
        const pokeId = row.getAttribute('data-poke-id');
        const gameAttr = row.getAttribute('data-game');
        // Reconstruct the checkbox ID
        const cbId = `chk_${gameAttr}_${pokeId}`;
        const val = localStorage.getItem(cbId);
        if (val === 'true') row.style.opacity = '0.5';
      });
    });
  });

  console.log(`Total location markers added: ${allMarkers.length}`);
}