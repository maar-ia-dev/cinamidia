// ─── STATE ────────────────────────────────────────────────────────────────────
let allChannels = [];
let categories = [];
let activeCategory = null;
let senzaReady = false;
let senzaPlayer = null;

// Navigation/Grid state stored in glass (global)
let gridRows = []; // [{group, channels}]
window.rowRenderCounts = [];

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

async function loadData() {
  allChannels = await getStored(STORAGE_KEYS.channels);
  const catMap = {};
  allChannels.forEach(ch => {
    const g = ch.group_title || 'Outros';
    if (!catMap[g]) catMap[g] = { id: g, name: g, count: 0 };
    catMap[g].count++;
  });
  categories = Object.values(catMap).sort((a, b) => a.name.localeCompare(b.name));

  const counter = document.getElementById('channelCounter');
  if (counter) counter.textContent = allChannels.length ? `${allChannels.length} canais` : '';

  renderCatBar();
  renderContent();
}

// ─── CATEGORY & CONTENT RENDER ───────────────────────────────────────────────
function renderCatBar() {
  const bar = document.getElementById('catBar');
  if (!bar) return;
  bar.innerHTML = `
<div class="cat-item ${!activeCategory ? 'active' : ''}" data-cat="" onclick="selectCategory(null)">Todos</div>
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

function getCardHTML(ri, ci, ch) {
  return `
    <div class="card" data-row="${ri}" data-col="${ci}" data-id="${ch.id}">
      ${ch.logo
        ? `<img src="${h(ch.logo)}" alt="${h(ch.name)}" loading="lazy" onerror="this.outerHTML='<div class=\\'no-logo\\'><span class=\\'ch-icon\\'>📺</span><span class=\\'ch-name\\'>${h(ch.name)}</span></div>'"/>`
        : `<div class="no-logo"><span class="ch-icon">📺</span><span class="ch-name">${h(ch.name)}</span></div>`}
      <div class="play-overlay">
        <div class="play-icon"><svg width="18" height="18" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg></div>
      </div>
      <div class="card-label">${h(ch.name)}</div>
    </div>`;
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
       html += getCardHTML(ri, i, row.channels[i]);
    }
    container.insertAdjacentHTML('beforeend', html);
    window.rowRenderCounts[ri] = next;
  }
}

function renderContent() {
  if (!activeCategory && allChannels.length > 2000 && categories.length > 0) {
    activeCategory = categories[0].id;
    renderCatBar();
  }

  const filtered = activeCategory
    ? allChannels.filter(c => (c.group_title || 'Outros') === activeCategory)
    : allChannels;

  const contentEl = document.getElementById('content');
  if (!contentEl) return;

  if (!filtered.length) {
    contentEl.innerHTML = `
  <div class="empty">
    <div class="big">📺</div>
    <p>${allChannels.length ? 'Nenhum canal nessa categoria.' : 'Nenhuma fonte configurada.<br/>Pressione <kbd>M</kbd> para adicionar uma playlist M3U.'}</p>
  </div>`;
    gridRows = [];
    return;
  }

  const grouped = {};
  filtered.forEach(ch => {
    const g = ch.group_title || 'Outros';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(ch);
  });

  gridRows = Object.entries(grouped).map(([group, channels]) => ({ group, channels }));
  window.rowRenderCounts = gridRows.map(() => 100); 

  contentEl.innerHTML = gridRows.map((row, ri) => {
    if (!activeCategory && ri > 30) return '';
    const subset = row.channels.slice(0, window.rowRenderCounts[ri]);
    let html = `
<div class="row" data-row="${ri}">
  <div class="row-header">
    <span class="row-title">${h(row.group)}</span>
    <span class="row-count">${row.channels.length} canais</span>
  </div>
  <div class="row-scroll ${activeCategory ? 'grid-mode' : ''}" id="rowScroll${ri}">`;
    html += subset.map((ch, ci) => getCardHTML(ri, ci, ch)).join('');
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
