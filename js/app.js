// ─── STATE ────────────────────────────────────────────────────────────────────
let allChannels = [];
let categories = [];
let activeCategory = null;
let activeShortcut = 'home';
let activeTopTab = 'home';
let senzaReady = false;
let senzaPlayer = null;
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

const SIDEBAR_SHORTCUTS = ['home', 'movies', 'series'];
const TOP_TABS = ['home', 'launches', 'trending'];

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

function isMovieChannel(channel) {
  const haystack = normalizeText(getChannelSearchText(channel));
  return /(filme|movie|cinema|cine|documentario|longa|curta)/.test(haystack);
}

function isSeriesChannel(channel) {
  const haystack = normalizeText(getChannelSearchText(channel));
  return /(serie|series|show|sitcom|novela|minisserie|anime|kids|infantil)/.test(haystack);
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
  if (activeShortcut === 'movies') return isMovieChannel(channel);
  if (activeShortcut === 'series') return isSeriesChannel(channel);
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
  await loadData();
  setupNavigation();
  updateClock();
  setInterval(updateClock, 30000);

  ['xtreamHost', 'xtreamUser', 'xtreamPass', 'xtreamOutput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateXtreamPreview);
  });

  checkAutoSetup(); 
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
  const movies = document.getElementById('moviesShortcut');
  const series = document.getElementById('seriesShortcut');
  if (!home || !movies || !series) return;

  home.classList.toggle('active', activeShortcut === 'home');
  movies.classList.toggle('active', activeShortcut === 'movies');
  series.classList.toggle('active', activeShortcut === 'series');
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
  activeShortcut = next;

  activeCategory = null;
  NAV.zone = 'categories';
  NAV.catIdx = 0;
  NAV.rowIdx = 0;
  NAV.colIdx = 0;
  renderSidebarShortcuts();
  renderCatBar();
  renderContent();
  refreshNavFocus();
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
  <div class="cat-item ${activeCategory === c.id ? 'active' : ''}" data-cat="${h(c.id)}" onclick="selectCategory('${js(c.id)}')">${h(c.name)}</div>
`).join('')}
  `;
}

function selectCategory(id) {
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

  const filtered = activeCategory
    ? baseChannels.filter(c => getChannelCategory(c) === activeCategory)
    : baseChannels;

  const contentEl = document.getElementById('content');
  if (!contentEl) return;

  if (!filtered.length) {
    contentEl.innerHTML = `
  <div class="empty">
    <div class="big">📺</div>
    <p>${allChannels.length ? 'Nenhum canal nesta selecao.' : 'Nenhuma fonte configurada.<br/>Pressione <kbd>M</kbd> para adicionar uma playlist M3U.'}</p>
  </div>`;
    gridRows = [];
    return;
  }

  const grouped = {};
  filtered.forEach(ch => {
    const g = getChannelCategory(ch);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(ch);
  });

  gridRows = Object.entries(grouped)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([group, channels]) => ({ group, channels }));
  window.rowRenderCounts = gridRows.map(() => 100); 

  contentEl.innerHTML = gridRows.map((row, ri) => {
    if (!activeCategory && ri > 34) return '';
    const subset = row.channels.slice(0, window.rowRenderCounts[ri]);
    let html = `
<div class="row" data-row="${ri}">
  <div class="row-header">
    <span class="row-title">${h(row.group)}</span>
    <span class="row-count">${row.channels.length} canais</span>
  </div>
  <div class="row-scroll ${activeCategory ? 'grid-mode' : ''}" id="rowScroll${ri}">`;
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
