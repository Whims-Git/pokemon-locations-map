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
let pokemonById = {}; // lookup map filled after pokemon data load
let notObtainableByGame = {}; // optional map: { "Yellow": ["weedle", ...] }

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

// FILTER PANEL: game + additional filters
// We'll create a single control with options for Game, Obtainable, Starter, Gift,
// Type filter (enable + multi-select) and Method filter (enable + dropdown).
const filters = {
  game: 'Red',
  obtainable: false,
  starter: false,
  gift: false,
  typeFilterEnabled: false,
  types: new Set(),
  methodFilterEnabled: false,
  method: 'Any',
  rod: 'Old'
};

const filterControl = L.control({ position: 'topright' });
filterControl.onAdd = function () {
  const div = L.DomUtil.create('div', 'filter-control');
  div.style.background = 'white';
  div.style.padding = '10px';
  div.style.borderRadius = '5px';
  div.style.fontFamily = 'Arial, sans-serif';
  div.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';
  div.style.maxWidth = '260px';

  // Build HTML for the control. We keep markup simple so it's easy to read.
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
        <option value="Evolution">Evolution</option>
        <option value="Trade">Trade</option>
      </select>
    </div>
    <div id="rod_container" style="border-top:1px solid #eee;padding-top:6px;margin-top:6px;display:none">
      <label for="filter_rod">Rod:</label>
      <select id="filter_rod" style="width:100%;margin-top:4px;padding:4px">
        <option value="Old">Old Rod</option>
        <option value="Good">Good Rod</option>
        <option value="Super">Super Rod</option>
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
    row.innerHTML = `<label style="font-size:13px"><input type=\"checkbox\" id=\"${id}\" /> ${type}</label>`;
    typeBox.appendChild(row);
  });

  // Wire up events
  const gameSelect = div.querySelector('#filter_game');
  gameSelect.value = filters.game;
  gameSelect.addEventListener('change', () => {
    filters.game = gameSelect.value;
    // Always apply game selection when changed
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
  const rodSelect = div.querySelector('#filter_rod');
  const rodContainer = div.querySelector('#rod_container');
  rodSelect.addEventListener('change', () => {
    filters.rod = rodSelect.value;
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
    // Show rod selector only when method filter is enabled and Fishing is selected
    if (rodContainer) rodContainer.style.display = (methodEnable.checked && methodSelect.value === 'Fishing') ? 'block' : 'none';
    updateMarkers(filters.game);
    renderPokemonList();
  });
  methodSelect.addEventListener('change', () => {
    filters.method = methodSelect.value;
    // Show rod selector only when method filter is enabled and Fishing is selected
    if (rodContainer) rodContainer.style.display = (methodEnable.checked && methodSelect.value === 'Fishing') ? 'block' : 'none';
    updateMarkers(filters.game);
    renderPokemonList();
  });

  // Default: only game is selected (others inactive)
  obtainableChk.checked = false;
  starterChk.checked = false;
  giftChk.checked = false;
  typeEnable.checked = false;
  methodEnable.checked = false;
  // Ensure rod container hidden by default (safety)
  if (rodContainer) rodContainer.style.display = 'none';

  return div;
};
filterControl.addTo(map);

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
    pokemonData = data.pokemon || [];
    // Load optional unobtainable lists if provided in the pokemon JSON
    notObtainableByGame = data.not_obtainable_by_game || data.notObtainableByGame || data.not_obtainable || {};
    // Build lookup map by id for quick access
    pokemonById = (pokemonData || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
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
  // Iterate through all locations and build markers for ones that have matching entries
  Object.values(locationsData || {}).forEach(location => {
    if (!location || !location.coordinates || location.coordinates.length < 2) return;
    const lat = location.coordinates[0];
    const lng = location.coordinates[1];

    // Collect all raw entries from this location
    const rawEntries = [];
    if (Array.isArray(location.encounters)) location.encounters.forEach(e => rawEntries.push(Object.assign({}, e, { source: 'encounter' })));
    if (Array.isArray(location.gifts)) location.gifts.forEach(e => rawEntries.push(Object.assign({}, e, { source: 'gift' })));

    // Filter and map entries into rows that will be displayed for this location
    const rowsData = [];
    rawEntries.forEach(entry => {
      // Determine pokemon id
      const pid = entry.pokemon_id || entry.poke_id || entry.pokemon || entry.id || entry.poke;
      if (!pid) return;

      // If entry has a `games` object and doesn't include this game, skip
      if (entry.games && !entry.games[game]) return;

      // Merge per-game fields if present
      const perGame = (entry.games && entry.games[game]) || {};
      const merged = Object.assign({}, entry, perGame);

      // Apply global filters
        if (filters.obtainable && !isPokemonObtainableInGame(pid, game)) return;
      if (filters.starter && !merged.starter) return;
      if (filters.gift && !(merged.source === 'gift' || merged.gift)) return;

      // Type filter
      if (filters.typeFilterEnabled && filters.types.size > 0) {
        const poke = pokemonById[pid];
        if (!poke) return;
        const pokeTypes = Array.isArray(poke.types) ? poke.types : [];
        if (!pokeTypes.some(t => filters.types.has(t))) return;
      }

      // Method filter
      if (filters.methodFilterEnabled && filters.method !== 'Any') {
        const methodText = ((merged.method || entry.method) || '').toLowerCase();
        const keywords = {
          'Walking': ['grass', 'walk'],
          'Fishing': ['fish'],
          'Surfing': ['surf'],
          'Evolution': ['evolution'],
          'Trade': ['trade']
        };
        const kws = keywords[filters.method] || [filters.method.toLowerCase()];
        const matchesMethod = kws.some(k => methodText.includes(k));
        if (!matchesMethod) return;
      }

      // Add filter for rod choice (Old/Good/Super) when fishing is selected
      if (filters.methodFilterEnabled && filters.method === 'Fishing' && filters.rod) {
        const rodText = (merged.rod || entry.rod || '').toLowerCase();
        const desired = filters.rod.toLowerCase();
        const matchesRod = rodText.includes(desired);
        if (!matchesRod) return;
      }

      const poke = pokemonById[pid];
      if (!poke) return;

      rowsData.push({ poke, entry: merged });
    });

    if (rowsData.length === 0) return;

    // Build popup HTML
    const rowsHtml = rowsData.map(({ poke, entry }) => {
      const spritePath = `./assets/sprites/gen_1_sprites/${poke.id}.png`;
      // Level text: support min_level/max_level or level_range
      let levelText = '';
      if (entry.level_range) {
        levelText = Array.isArray(entry.level_range) ? `${entry.level_range[0]}-${entry.level_range[1]}` : `${entry.level_range}`;
      } else if (entry.min_level !== undefined || entry.max_level !== undefined) {
        if (entry.min_level !== undefined && entry.max_level !== undefined) levelText = `${entry.min_level}-${entry.max_level}`;
        else if (entry.min_level !== undefined) levelText = `${entry.min_level}`;
        else levelText = `${entry.max_level}`;
      }

      // Rate text: support multiple field names
      const rateText = entry.appearance_rate || entry.appearance || entry.rate || entry.appearance || '';
      const methodText = entry.method || (entry.source === 'gift' ? 'Gift' : '') || '';
      const checkboxId = `chk_${game}_${poke.id}`;
      const stored = localStorage.getItem(checkboxId);
      const checkedAttr = stored === 'true' ? 'checked' : '';

      return `\n        <div class="popup-row" data-poke-id="${poke.id}" data-game="${game}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.05)">\n          <img src="${spritePath}" alt="${poke.name}" width="32" height="32" onerror="this.style.opacity=.6;this.src='./assets/images/placeholder.png'"/>\n          <div style="flex:1;min-width:0">\n            <div style="font-weight:600">${poke.name}</div>\n            <div style="font-size:12px;color:#333">Lv: ${levelText || '—'} &nbsp; • &nbsp; ${rateText || '—'}${methodText ? ' • ' + methodText : ''}</div>\n          </div>\n          <div>\n            <input type="checkbox" id="${checkboxId}" class="pokemon-checkbox" ${checkedAttr} />\n          </div>\n        </div>\n      `;
    }).join('');

    const popupHtml = `\n      <div style="min-width:240px">\n        <div style="font-weight:bold;margin-bottom:6px">${location.name}</div>\n        ${rowsHtml}\n      </div>\n    `;

    const marker = L.marker([lat, lng], { title: location.name, riseOnHover: true });
    marker.bindPopup(popupHtml, { maxWidth: 400 });

    // circle
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
      console.warn('Failed to create circle for', location.id, err);
      circle = null;
    }

    const layers = [];
    if (circle) layers.push(circle);
    layers.push(marker);
    const group = L.layerGroup(layers).addTo(map);
    allMarkers.push(group);

    marker.on('popupopen', (e) => {
      const popupEl = e.popup.getElement();
      if (!popupEl) return;
      const inputs = popupEl.querySelectorAll('input.pokemon-checkbox');
      inputs.forEach(input => {
        const id = input.id;
        const stored = localStorage.getItem(id);
        if (stored !== null) input.checked = stored === 'true';
        input.addEventListener('change', (evt) => {
          const isChecked = evt.target.checked;
          localStorage.setItem(id, isChecked ? 'true' : 'false');
          const row = evt.target.closest('.popup-row');
          if (row) row.style.opacity = isChecked ? '0.5' : '1.0';
          updateAllCheckboxesWithId(id, isChecked);
        });
      });
      const rowsEls = popupEl.querySelectorAll('.popup-row');
      rowsEls.forEach(row => {
        const pokeId = row.getAttribute('data-poke-id');
        const gameAttr = row.getAttribute('data-game');
        const cbId = `chk_${gameAttr}_${pokeId}`;
        const val = localStorage.getItem(cbId);
        if (val === 'true') row.style.opacity = '0.5';
      });
    });
  });

  console.log(`Total location markers added: ${allMarkers.length}`);
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

// --- Pokémon list rendering for the filter panel ---
// Helper: gather all entries (encounters + gifts) for a given pokemon id and game
function getEntriesForPokemonAndGame(pokeId, game) {
  const results = [];
  Object.values(locationsData || {}).forEach(loc => {
    const baseInfo = { location_id: loc.id, location_name: loc.name };

    const pushEntry = (entry, isGift = false) => {
      // Try several possible keys for pokemon id
      const id = entry.pokemon_id || entry.poke_id || entry.pokemon || entry.id || entry.poke;
      if (!id) return;
      if (String(id) !== String(pokeId)) return;

      // Determine per-game data if present
      // If the entry has per-game data and does not include the selected game, skip it
      if (entry.games && !entry.games[game]) return;
      const perGame = (entry.games && entry.games[game]) || {};

      // Merge fields from entry and perGame falling back to entry
      const merged = Object.assign({}, entry, perGame, baseInfo);
      merged.isGift = isGift || !!perGame.gift || !!entry.gift || false;
      results.push(merged);
    };

    if (Array.isArray(loc.encounters)) loc.encounters.forEach(e => pushEntry(e, false));
    if (Array.isArray(loc.gifts)) loc.gifts.forEach(e => pushEntry(e, true));
  });
  return results;
}

function pokemonMatchesFilters(poke) {
  const game = filters.game;
  // Get all entries for this pokemon in the selected game
  const entries = getEntriesForPokemonAndGame(poke.id, game);
  if (!entries || entries.length === 0) return false;

  // If any entry passes the active filters, the pokemon matches
  return entries.some(entry => {
    // Obtainable: use global unobtainable list + presence of entries
    if (filters.obtainable && !isPokemonObtainableInGame(poke.id, game)) return false;
    // Starter/Gift (entry-level)
    if (filters.starter && !entry.starter) return false;
    if (filters.gift && !entry.isGift) return false;

    // Type filter
    if (filters.typeFilterEnabled && filters.types.size > 0) {
      const pokeTypes = Array.isArray(poke.types) ? poke.types : [];
      const hasType = pokeTypes.some(t => filters.types.has(t));
      if (!hasType) return false;
    }

    // Compute method and rod text once (safe for rod filtering)
    const methodText = ((entry.method || entry.method || '')).toLowerCase();
    const rodText = ((entry.rod || entry.rod || '')).toLowerCase();

    // Method filter
    if (filters.methodFilterEnabled && filters.method !== 'Any') {
      const kwsMap = {
        'Walking': ['grass', 'walk'],
        'Fishing': ['fish'],
        'Surfing': ['surf'],
        'Evolution': ['evolution'],
        'Trade': ['trade']
      };
      const kws = kwsMap[filters.method] || [filters.method.toLowerCase()];
      const matchesMethod = kws.some(k => methodText.includes(k));
      if (!matchesMethod) return false;
    }

    // Rod Filter (only when fishing selected)
    if (filters.methodFilterEnabled && filters.method === 'Fishing' && filters.rod) {
      const rodKeywords = {
        'Old': ['old rod', 'old'],
        'Good': ['good rod', 'good'],
        'Super': ['super rod', 'super']
      };
      const rodKws = rodKeywords[filters.rod] || [];
      const matchesRod = rodKws.length === 0 ? true : (rodKws.some(k => rodText.includes(k)) || rodKws.some(k => methodText.includes(k)));
      if (!matchesRod) return false;
    }

    return true;
  });
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

    const entries = getEntriesForPokemonAndGame(poke.id, filters.game);
    const obtainable = isPokemonObtainableInGame(poke.id, filters.game);

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

    // Build a location selector instead of text preview
    const locEntries = entries || [];
    const locNames = locEntries.map(le => (locationsData[le.location_id] && locationsData[le.location_id].name) || le.location_id);

    info.innerHTML = `<strong style=\"font-weight:600\">${poke.regional_dex ? ('#'+poke.regional_dex) : ''} ${poke.name}</strong>` +
             `<div style=\"font-size:11px;color:#333\">${obtainable ? 'Obtainable' : 'Not Obtainable'}</div>` +
             `<div style=\"margin-top:4px\">` +
             `<select class=\"loc-select\" style=\"max-width:160px\">` +
             `${locNames.length ? locNames.map((n, i) => `<option value=\"${i}\">${n}</option>`).join('') : `<option value=\"-1\">No locations</option>`}` +
             `</select>` +
             `</div>`;

    left.appendChild(img);
    left.appendChild(info);

    // Wire location selector to jump to chosen location
    const locSelect = info.querySelector('select.loc-select');
    if (locSelect) {
      locSelect.addEventListener('change', (e) => {
        const idx = parseInt(e.target.value, 10);
        if (!isNaN(idx) && locEntries[idx]) {
          const firstLoc = locationsData[locEntries[idx].location_id];
          if (firstLoc && firstLoc.coordinates && firstLoc.coordinates.length >= 2) {
            map.setView([firstLoc.coordinates[0], firstLoc.coordinates[1]], 0);
          }
        }
      });
    }

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

// Determine if a pokemon is obtainable in a given game.
// Rules:
// - If `notObtainableByGame[game]` lists the pokemon id, return false.
// - Otherwise, return true if there are any entries for the pokemon in that game.
function isPokemonObtainableInGame(pokeId, game) {
  const notList = (notObtainableByGame && notObtainableByGame[game]) || [];
  try {
    if (Array.isArray(notList) && notList.some(id => String(id) === String(pokeId))) return false;
  } catch (err) {
    // ignore and continue
  }
  const entries = getEntriesForPokemonAndGame(pokeId, game);
  return (entries && entries.length > 0);
}