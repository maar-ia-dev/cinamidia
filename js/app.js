// ─── STATE ────────────────────────────────────────────────────────────────────
let allChannels = [];
let categories = [];
let activeCategory = null;
let activeShortcut = 'home';
let activeTopTab = 'home';
let senzaReady = false;
let senzaPlayer = null;
let searchQuery = '';
let searchPanelOpen = false;
let searchKeyRow = 0;
let searchKeyCol = 0;
const DEFAULT_HERO_IMAGES = [
  'src/hero/hero1.png',
  'src/hero/hero2.png',
  'src/hero/hero3.png',
  'src/hero/hero4.png',
  'src/hero/hero5.png',
];
let heroImages = [...DEFAULT_HERO_IMAGES];
let heroRotationTimer = null;
let currentHeroIndex = -1;

const SIDEBAR_SHORTCUTS = ['home', 'search'];
const TOP_TABS = ['home'];
const SEARCH_KEYBOARD_LAYOUT = [
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'],
  ['Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X'],
  ['Y', 'Z', '0', '1', '2', '3', '4', '5'],
  ['6', '7', '8', '9', 'SPACE', 'BACKSPACE', 'CLEAR'],
  ['APPLY', 'CLOSE'],
];

// Navigation/Grid state stored in glass (global)
let gridRows = []; // [{group, channels}]
window.rowRenderCounts = [];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getChannelCategory(channel) {
  const raw = String(channel?.group_title || channel?.groupTitle || 'Outros').trim();
  if (!raw) return 'Outros';
  const primary = raw.split(/[;|]/).map(item => item.trim()).find(Boolean);
  return primary || 'Outros';
}

function getChannelSearchText(channel) {
  return `${channel?.name || ''} ${channel?.group_title || ''} ${channel?.tvg_name || ''}`;
}

function getViewerChannelNumber(channel) {
  const value = Number(channel?.viewer_channel);
  if (Number.isInteger(value) && value > 0) return value;
  return null;
}

function formatViewerChannel(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '----';
  return String(Math.floor(n)).padStart(4, '0');
}

function normalizeSearchDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function matchesSearchQuery(channel, normalizedQuery, digitsQuery, numericOnly = false) {
  if (!normalizedQuery && !digitsQuery) return false;
  const viewer = getViewerChannelNumber(channel);
  let numberMatch = false;

  if (digitsQuery && viewer) {
    const viewerRaw = String(viewer);
    const viewerPadded = formatViewerChannel(viewer);
    const digitsNoLeading = String(Number.parseInt(digitsQuery, 10) || 0);
    numberMatch = (
      viewerPadded.startsWith(digitsQuery) ||
      viewerRaw.startsWith(digitsQuery) ||
      (digitsNoLeading !== '0' && viewerRaw.startsWith(digitsNoLeading))
    );
  }

  if (numericOnly) return numberMatch;
  if (numberMatch) return true;

  const haystack = normalizeText(getChannelSearchText(channel));
  return Boolean(normalizedQuery && haystack.includes(normalizedQuery));
}

function getTrendingScore(channel) {
  const haystack = normalizeText(getChannelSearchText(channel));
  let score = Number(channel?.id || 0);

  if (channel?.logo) score += 15;
  if (/(4k|uhd|fhd|1080)/.test(haystack)) score += 20;
  if (/(sport|esporte|news|noticia|filme|movie|serie|infantil|kids)/.test(haystack)) score += 8;
  return score;
}

function applyTopTabSort(channels) {
  const list = [...channels];
  if (activeTopTab === 'launches') {
    return list.sort((a, b) => (b.id || 0) - (a.id || 0));
  }
  if (activeTopTab === 'trending') {
    return list.sort((a, b) => {
      const diff = getTrendingScore(b) - getTrendingScore(a);
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });
  }
  return list;
}

function matchesShortcutFilter(channel) {
  void channel;
  return true;
}

function buildCategories(channels) {
  const map = {};
  channels.forEach(ch => {
    const group = getChannelCategory(ch);
    if (!map[group]) map[group] = { id: group, name: group, count: 0 };
    map[group].count++;
  });
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function getMinViewerChannel(channels) {
  let min = Number.MAX_SAFE_INTEGER;
  for (const channel of channels || []) {
    const number = getViewerChannelNumber(channel);
    if (number && number < min) min = number;
  }
  return min;
}

function needsViewerChannelNormalization(channels) {
  if (!Array.isArray(channels) || !channels.length) return false;
  const values = [];
  const seen = new Set();

  for (const channel of channels) {
    const number = getViewerChannelNumber(channel);
    if (!number) return true;
    if (seen.has(number)) return true;
    seen.add(number);
    values.push(number);
  }

  values.sort((a, b) => a - b);
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== i + 1) return true;
  }
  return false;
}

function normalizeViewerChannels(channels) {
  const ordered = [...channels].sort((a, b) => {
    const av = getViewerChannelNumber(a) ?? Number.MAX_SAFE_INTEGER;
    const bv = getViewerChannelNumber(b) ?? Number.MAX_SAFE_INTEGER;
    if (av !== bv) return av - bv;
    return (a?.id || 0) - (b?.id || 0);
  });

  return ordered.map((channel, index) => ({
    ...channel,
    viewer_channel: index + 1,
  }));
}

function getBaseChannels() {
  const scoped = allChannels.filter(matchesShortcutFilter);
  return applyTopTabSort(scoped);
}

async function loadHeroImages() {
  try {
    const res = await fetch('src/hero/heroes.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const entries = Array.isArray(data) ? data : Array.isArray(data?.images) ? data.images : [];
    if (!entries.length) return;

    const normalized = entries
      .filter(item => typeof item === 'string' && item.trim())
      .map(item => item.startsWith('src/') ? item : `src/hero/${item.replace(/^\.?\//, '')}`);

    if (normalized.length) heroImages = normalized;
  } catch (_) {
    // fallback silencioso para DEFAULT_HERO_IMAGES
  }
}

function pickRandomHeroIndex() {
  if (heroImages.length <= 1) return 0;
  let next = 0;
  do {
    next = Math.floor(Math.random() * heroImages.length);
  } while (next === currentHeroIndex);
  return next;
}

function renderRandomHero() {
  const heroEl = document.getElementById('heroBackdrop');
  if (!heroEl || !heroImages.length) return;

  const nextIndex = pickRandomHeroIndex();
  const nextSrc = heroImages[nextIndex];
  const img = new Image();
  img.onload = () => {
    currentHeroIndex = nextIndex;
    heroEl.style.backgroundImage = `url("${nextSrc}")`;
    heroEl.classList.add('is-ready');
  };
  img.src = nextSrc;
}

async function initHeroRotation() {
  if (!document.getElementById('heroBackdrop')) return;
  await loadHeroImages();
  renderRandomHero();
  clearInterval(heroRotationTimer);
  heroRotationTimer = setInterval(renderRandomHero, 45000);
}

// ─── SENZA INIT ───────────────────────────────────────────────────────────────
async function initSenza() {
  if (typeof window.cefQuery === 'undefined' || typeof senza === 'undefined') {
    console.info('[Senza] Modo browser — SDK ignorado');
    return;
  }
  try {
    await senza.init();
    senzaReady = true;
    const badge = document.getElementById('senzaBadge');
    if (badge) badge.style.display = 'inline';
    
    senza.lifecycle.addEventListener('statechange', () => {
      const bg = senza.lifecycle.state === senza.lifecycle.UiState.BACKGROUND;
      document.body.classList.toggle('background-mode', bg);
    });
    senza.uiReady();
    console.info('[Senza] Cloud Connector ativo');
  } catch (e) { console.warn('[Senza]', e.message); }
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  await initHeroRotation();
  await initSenza();
  if (typeof initUiScale === 'function') await initUiScale();
  await loadData();
  if (typeof syncValidateChannelsSetting === 'function') syncValidateChannelsSetting('main');
  setupNavigation();
  updateClock();
  setInterval(updateClock, 30000);

  ['xtreamHost', 'xtreamUser', 'xtreamPass', 'xtreamOutput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateXtreamPreview);
  });

  if (typeof checkAndOpenFirstRunPanel === 'function') {
    await checkAndOpenFirstRunPanel();
  } else {
    checkAutoSetup();
  }
});

async function checkAutoSetup() {
  const currentSources = await getStored(STORAGE_KEYS.sources);
  if (currentSources.length === 0) {
    console.log('[AutoSetup] Configurando listas padrão...');
    const valCheckbox = document.getElementById('validateChannels');
    if (valCheckbox) valCheckbox.checked = true;

    await handleDefaultUpload('br_categorizada.m3u', 'CinaMídia BR (Principal)');
    await handleDefaultUpload('dash_test.m3u', 'Teste DASH (Senza/Shaka)');
    showToast('🚀 Configuração inicial concluída!');
  }
}

function renderTopTabs() {
  const home = document.getElementById('topHome');
  const launches = document.getElementById('topLaunches');
  const trends = document.getElementById('topTrends');
  if (!home || !launches || !trends) return;

  home.classList.toggle('active', activeTopTab === 'home');
  launches.classList.toggle('active', activeTopTab === 'launches');
  trends.classList.toggle('active', activeTopTab === 'trending');
}

function renderSidebarShortcuts() {
  const home = document.getElementById('homeShortcut');
  const search = document.getElementById('searchShortcut');
  if (home) home.classList.toggle('active', activeShortcut === 'home' && !activeCategory);
  if (search) search.classList.toggle('active', activeShortcut === 'search');
}

function setTopTab(id) {
  const next = TOP_TABS.includes(id) ? id : 'home';
  if (activeTopTab === next) return;

  activeTopTab = next;
  NAV.rowIdx = 0;
  NAV.colIdx = 0;
  renderTopTabs();
  renderCatBar();
  renderContent();
  refreshNavFocus();
}

function setSidebarShortcut(id) {
  const next = SIDEBAR_SHORTCUTS.includes(id) ? id : 'home';
  if (next !== 'search' && searchPanelOpen) {
    closeSearchPanel(false);
  }
  activeShortcut = next;

  activeCategory = null;
  NAV.zone = 'categories';
  NAV.rowIdx = 0;
  NAV.colIdx = 0;
  renderSidebarShortcuts();
  renderCatBar();
  renderContent();
  NAV.catIdx = getActiveSidebarIndex();
  refreshNavFocus();
}

function isSearchPanelOpen() {
  return searchPanelOpen;
}

function getSearchKeyLabel(key) {
  if (key === 'SPACE') return 'Espaco';
  if (key === 'BACKSPACE') return 'Apagar';
  if (key === 'CLEAR') return 'Limpar';
  if (key === 'APPLY') return 'Buscar';
  if (key === 'CLOSE') return 'Fechar';
  return key;
}

function updateSearchInputDisplay() {
  const inputEl = document.getElementById('searchInputDisplay');
  if (!inputEl) return;
  inputEl.textContent = searchQuery || 'Digite para buscar...';
  inputEl.classList.toggle('is-empty', !searchQuery);
}

function setSearchQuery(value, shouldRender = true) {
  searchQuery = String(value || '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, 42);
  updateSearchInputDisplay();
  if (shouldRender && activeShortcut === 'search') {
    NAV.rowIdx = 0;
    NAV.colIdx = 0;
    renderContent();
  }
}

function appendSearchChar(char) {
  if (!char) return;
  setSearchQuery(`${searchQuery}${char}`, true);
}

function backspaceSearchChar() {
  if (!searchQuery) return;
  setSearchQuery(searchQuery.slice(0, -1), true);
}

function clearSearchQuery() {
  setSearchQuery('', true);
}

function getSearchKeyboardRows() {
  return [...document.querySelectorAll('#searchKeyboard .search-key-row')].map((row) => [...row.querySelectorAll('.search-key')]);
}

function syncSearchCursorBounds() {
  const rows = getSearchKeyboardRows();
  if (!rows.length) {
    searchKeyRow = 0;
    searchKeyCol = 0;
    return rows;
  }

  if (searchKeyRow < 0) searchKeyRow = rows.length - 1;
  if (searchKeyRow >= rows.length) searchKeyRow = 0;
  const cols = rows[searchKeyRow].length || 1;
  if (searchKeyCol < 0) searchKeyCol = cols - 1;
  if (searchKeyCol >= cols) searchKeyCol = 0;
  return rows;
}

function refreshSearchKeyFocus() {
  const rows = syncSearchCursorBounds();
  rows.flat().forEach((key) => key.classList.remove('focused'));
  const target = rows?.[searchKeyRow]?.[searchKeyCol];
  if (target) {
    target.classList.add('focused');
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
}

function renderSearchKeyboard() {
  const keyboard = document.getElementById('searchKeyboard');
  if (!keyboard) return;

  keyboard.innerHTML = SEARCH_KEYBOARD_LAYOUT.map((row, rowIdx) => `
<div class="search-key-row">
${row.map((key, colIdx) => `
  <button
    type="button"
    class="search-key ${key.length > 1 ? 'search-key-action' : ''}"
    data-row="${rowIdx}"
    data-col="${colIdx}"
    data-key="${h(key)}"
    onclick="handleSearchVirtualKey('${js(key)}')"
  >${h(getSearchKeyLabel(key))}</button>
`).join('')}
</div>`).join('');

  refreshSearchKeyFocus();
}

function navigateSearchKeyboard(direction) {
  if (!searchPanelOpen) return false;
  const rows = getSearchKeyboardRows();
  if (!rows.length) return false;

  if (direction === 'left') {
    searchKeyCol--;
  } else if (direction === 'right') {
    searchKeyCol++;
  } else if (direction === 'up') {
    searchKeyRow--;
  } else if (direction === 'down') {
    searchKeyRow++;
  }

  syncSearchCursorBounds();
  const rowLen = rows[searchKeyRow]?.length || 1;
  if (searchKeyCol >= rowLen) searchKeyCol = rowLen - 1;
  refreshSearchKeyFocus();
  return true;
}

function triggerSearchFocusedKey() {
  if (!searchPanelOpen) return false;
  const rows = getSearchKeyboardRows();
  const key = rows?.[searchKeyRow]?.[searchKeyCol];
  if (!key) return false;
  key.click();
  return true;
}

function applySearchAndClose() {
  activeShortcut = 'search';
  activeCategory = null;
  NAV.rowIdx = 0;
  NAV.colIdx = 0;
  renderSidebarShortcuts();
  renderCatBar();
  renderContent();
  closeSearchPanel(false);
  if (gridRows.length) {
    NAV.zone = 'grid';
  } else {
    NAV.zone = 'categories';
    NAV.catIdx = getActiveSidebarIndex();
  }
  refreshNavFocus();
}

function handleSearchVirtualKey(key) {
  switch (key) {
    case 'SPACE':
      appendSearchChar(' ');
      break;
    case 'BACKSPACE':
      backspaceSearchChar();
      break;
    case 'CLEAR':
      clearSearchQuery();
      break;
    case 'APPLY':
      applySearchAndClose();
      break;
    case 'CLOSE':
      closeSearchPanel();
      break;
    default:
      appendSearchChar(key);
      break;
  }
  refreshSearchKeyFocus();
}

function openSearchPanel() {
  const panel = document.getElementById('searchPanel');
  if (!panel) return;
  activeShortcut = 'search';
  activeCategory = null;
  renderSidebarShortcuts();
  renderCatBar();
  renderContent();

  searchPanelOpen = true;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  NAV.zone = 'search';
  searchKeyRow = 0;
  searchKeyCol = 0;
  updateSearchInputDisplay();
  renderSearchKeyboard();
}

function closeSearchPanel(restoreFocus = true) {
  const panel = document.getElementById('searchPanel');
  if (panel) {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }
  searchPanelOpen = false;
  if (restoreFocus) {
    NAV.zone = 'categories';
    NAV.catIdx = getActiveSidebarIndex();
    refreshNavFocus();
  }
}

async function loadData() {
  allChannels = await getStored(STORAGE_KEYS.channels);
  if (needsViewerChannelNormalization(allChannels)) {
    allChannels = normalizeViewerChannels(allChannels);
    await setStored(STORAGE_KEYS.channels, allChannels);
  }

  const counter = document.getElementById('channelCounter');
  if (counter) counter.textContent = allChannels.length ? `${allChannels.length} canais` : '';

  categories = buildCategories(getBaseChannels());
  renderTopTabs();
  renderSidebarShortcuts();
  renderCatBar();
  renderContent();
}

// ─── CATEGORY & CONTENT RENDER ───────────────────────────────────────────────
function renderCatBar() {
  const bar = document.getElementById('catBar');
  if (!bar) return;
  categories = buildCategories(getBaseChannels());
  if (activeCategory && !categories.some(c => c.id === activeCategory)) {
    activeCategory = null;
  }

  const totalCats = categories.length;
  bar.classList.toggle('cat-list-compact', totalCats > 14);
  bar.classList.toggle('cat-list-dense', totalCats > 24);

  renderSidebarShortcuts();

  bar.innerHTML = `
${categories.map(c => `
  <div class="cat-item ${activeCategory === c.id ? 'active' : ''}" data-cat="${h(c.id)}" onclick="selectCategory('${js(c.id)}')"><span class="material-symbols-outlined cat-icon" aria-hidden="true">tv</span><span class="cat-text">${h(c.name)}</span></div>
`).join('')}
  `;
}

function selectCategory(id) {
  if (searchPanelOpen) closeSearchPanel(false);
  activeShortcut = 'home';
  activeCategory = id;
  NAV.rowIdx = 0; NAV.colIdx = 0;
  renderCatBar();
  renderContent();
  refreshNavFocus();
}

function getAvatarChar(name) {
  const clean = String(name || '').trim();
  const first = clean.match(/[0-9A-Za-zÀ-ÖØ-öø-ÿ]/);
  const firstAscii = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[0-9A-Za-z]/);
  return (firstAscii ? firstAscii[0] : first ? first[0] : '?').toUpperCase();
}

function getNoLogoHTML(name) {
  const safeName = h(name || 'Canal');
  const avatar = h(getAvatarChar(name));
  return `<div class="no-logo"><span class="ch-avatar" aria-hidden="true">${avatar}</span><span class="ch-name">${safeName}</span></div>`;
}

function getChannelCardHTML(ri, ci, ch) {
  const fallback = getNoLogoHTML(ch.name);
  const viewerChannel = formatViewerChannel(getViewerChannelNumber(ch));
  const media = ch.logo
    ? `<img src="${h(ch.logo)}" alt="${h(ch.name)}" loading="lazy" onerror="this.outerHTML=getNoLogoHTML('${js(ch.name)}')"/>`
    : fallback;

  return `
    <div class="card" data-row="${ri}" data-col="${ci}" data-id="${ch.id}">
      <div class="card-number">${viewerChannel}</div>
      ${media}
      <div class="play-overlay">
        <div class="play-icon"><svg width="18" height="18" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg></div>
      </div>
      <div class="card-label">${viewerChannel} | ${h(ch.name)}</div>
    </div>`;
}

function getCardHTML(ri, ci, ch) {
  return getChannelCardHTML(ri, ci, ch);
}

function loadMoreCards(ri) {
  const row = gridRows[ri];
  const container = document.getElementById('rowScroll' + ri);
  if (!container || !row) return;

  const current = window.rowRenderCounts[ri] || 0;
  const next = Math.min(row.channels.length, current + 100);
  if (next > current) {
    let html = '';
    for (let i = current; i < next; i++) {
       html += getChannelCardHTML(ri, i, row.channels[i]);
    }
    container.insertAdjacentHTML('beforeend', html);
    window.rowRenderCounts[ri] = next;
  }
}

function renderContent() {
  const baseChannels = getBaseChannels();
  categories = buildCategories(baseChannels);
  if (activeCategory && !categories.some(c => c.id === activeCategory)) {
    activeCategory = null;
  }

  const normalizedQuery = normalizeText(searchQuery).trim();
  const digitsQuery = normalizeSearchDigits(searchQuery);
  const numericOnlyQuery = /^\d+$/.test(String(searchQuery || '').trim());

  let scoped = baseChannels;
  if (activeShortcut === 'search') {
    scoped = normalizedQuery
      ? baseChannels.filter(channel => matchesSearchQuery(channel, normalizedQuery, digitsQuery, numericOnlyQuery))
      : [];
  }

  const filtered = activeCategory
    ? scoped.filter(c => getChannelCategory(c) === activeCategory)
    : scoped;

  const contentEl = document.getElementById('content');
  if (!contentEl) return;

  if (!filtered.length) {
    let emptyText = allChannels.length
      ? 'Nenhum canal nesta selecao.'
      : 'Nenhuma fonte configurada.<br/>Pressione <kbd>M</kbd> para adicionar uma playlist M3U.';

    if (activeShortcut === 'search' && !normalizedQuery) {
      emptyText = 'Busca vazia.<br/>Selecione <b>Buscar</b> no menu e digite o numero ou nome do canal.';
    } else if (activeShortcut === 'search' && normalizedQuery) {
      emptyText = `Nenhum canal encontrado para <b>"${h(searchQuery)}"</b>.`;
    }

    contentEl.innerHTML = `
  <div class="empty">
    <div class="big">📺</div>
    <p>${emptyText}</p>
  </div>`;
    gridRows = [];
    return;
  }

  if (activeShortcut === 'search') {
    const sorted = [...filtered].sort((a, b) => {
      const av = getViewerChannelNumber(a) || Number.MAX_SAFE_INTEGER;
      const bv = getViewerChannelNumber(b) || Number.MAX_SAFE_INTEGER;
      if (av !== bv) return av - bv;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR');
    });
    gridRows = [{ group: `Busca: ${searchQuery}`, channels: sorted }];
  } else {
    const grouped = {};
    filtered.forEach(ch => {
      const g = getChannelCategory(ch);
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(ch);
    });

    const groupedEntries = Object.entries(grouped);
    if (!activeCategory && activeShortcut === 'home' && activeTopTab === 'home') {
      groupedEntries.sort((a, b) => {
        const minA = getMinViewerChannel(a[1]);
        const minB = getMinViewerChannel(b[1]);
        if (minA !== minB) return minA - minB;
        return a[0].localeCompare(b[0], 'pt-BR');
      });
    } else {
      groupedEntries.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'pt-BR'));
    }

    gridRows = groupedEntries.map(([group, channels]) => ({ group, channels }));
  }

  window.rowRenderCounts = gridRows.map(() => 100); 

  contentEl.innerHTML = gridRows.map((row, ri) => {
    if (activeShortcut !== 'search' && !activeCategory && ri > 34) return '';
    const subset = row.channels.slice(0, window.rowRenderCounts[ri]);
    let html = `
<div class="row" data-row="${ri}">
  <div class="row-header">
    <span class="row-title">${h(row.group)}</span>
    <span class="row-count">${row.channels.length} canais</span>
  </div>
  <div class="row-scroll ${activeCategory || activeShortcut === 'search' ? 'grid-mode' : ''}" id="rowScroll${ri}">`;
    html += subset.map((ch, ci) => getChannelCardHTML(ri, ci, ch)).join('');
    html += `</div></div>`;
    return html;
  }).join('');

  requestAnimationFrame(() => {
    document.querySelectorAll('.row-scroll').forEach(el => {
      el.addEventListener('scroll', (e) => {
        const ri = parseInt(e.target.closest('.row').dataset.row);
        if (e.target.scrollLeft + e.target.clientWidth >= e.target.scrollWidth - 1400) {
          loadMoreCards(ri);
        }
      });
    });
  });

  NAV.rowIdx = Math.min(NAV.rowIdx, gridRows.length - 1);
  NAV.colIdx = Math.min(NAV.colIdx, (gridRows[NAV.rowIdx]?.channels.length || 1) - 1);
  refreshNavFocus();
}
