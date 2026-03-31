// ─── ADMIN ────────────────────────────────────────────────────────────────────
let sources = [];
let activeTab = 'm3u';
let publicBrOptions = [];
let firstRunOpen = false;

function isFirstRunPanelOpen() {
  return firstRunOpen;
}

function openFirstRunPanel() {
  const panel = document.getElementById('firstRunPanel');
  if (!panel) return;

  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  firstRunOpen = true;
  NAV.zone = 'first-run';

  const valMain = document.getElementById('validateChannels');
  const valFirstRun = document.getElementById('validateChannelsFirstRun');
  if (valMain && valFirstRun) {
    valFirstRun.checked = !!valMain.checked || valFirstRun.checked;
  }

  refreshPublicBrChecklist('firstRunChecklist');
  setTimeout(() => {
    const first = document.querySelector('#firstRunPanel button, #firstRunPanel input');
    if (first) first.focus();
  }, 80);
}

function closeFirstRunPanel() {
  const panel = document.getElementById('firstRunPanel');
  if (!panel) return;

  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  firstRunOpen = false;
  if (NAV.zone === 'first-run') {
    NAV.zone = gridRows.length ? 'grid' : 'categories';
  }
}

function openAdminFromFirstRun() {
  closeFirstRunPanel();
  if (!document.getElementById('adminPanel').classList.contains('open')) {
    toggleAdmin();
  }
  switchTab('default');
}

function toggleAdmin() {
  const panel = document.getElementById('adminPanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    if (firstRunOpen) closeFirstRunPanel();
    NAV.zone = 'admin';
    loadSources();
    refreshPublicBrChecklist();
    setTimeout(() => {
      const first = document.querySelector('#adminPanel .admin-tab.active, #adminPanel button, #adminPanel input');
      if (first) first.focus();
    }, 100);
  } else {
    NAV.zone = 'categories';
    NAV.catIdx = 0;
    document.activeElement?.blur();
    updateCatFocus([...document.querySelectorAll('.cat-item')]);
  }
}

async function loadSources() {
  sources = await getStored(STORAGE_KEYS.sources);
  renderSources();
}

function renderSources() {
  document.getElementById('sourceList').innerHTML = sources.map(s => `
<div class="source-item">
  <div class="source-item-info">
    <span class="source-item-label"><span class="status-dot ${s.lastSyncAt ? 'synced' : ''}"></span>${h(s.label)}</span>
    <span class="source-item-meta">${s.channelCount ? `${s.channelCount} canais` : 'Não sincronizado'}${s.lastSyncAt ? ` • ${new Date(s.lastSyncAt).toLocaleDateString('pt-BR')}` : ''}</span>
  </div>
  <div class="source-actions">
    <button class="btn btn-secondary" style="padding:8px 14px;font-size:13px" onclick="syncSource(${s.id})">↺ Sync</button>
    <button class="btn btn-danger" style="padding:8px 14px;font-size:13px" onclick="deleteSource(${s.id})">✕</button>
  </div>
</div>
`).join('') || '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px">Nenhuma fonte cadastrada</p>';
}

function switchTab(tab) {
  activeTab = tab;

  const panelMap = {
    m3u: 'panelM3u',
    xtream: 'panelXtream',
    file: 'panelFile',
    default: 'panelDefault',
    app: 'panelApp',
  };

  Object.entries(panelMap).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = tab === key ? '' : 'none';
  });

  const tabMap = {
    m3u: 'tabM3u',
    xtream: 'tabXtream',
    file: 'tabFile',
    default: 'tabDefault',
    app: 'tabApp',
  };

  Object.entries(tabMap).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', tab === key);
  });

  const primaryActions = document.getElementById('adminPrimaryActions');
  if (primaryActions) primaryActions.style.display = tab === 'app' ? 'none' : '';

  if (tab === 'default') {
    refreshPublicBrChecklist();
  }
}

function resolveLocalSourceUrl(filename) {
  const clean = String(filename || '').replace(/^\.?\//, '');
  if (window.location.protocol === 'file:') return `./${clean}`;
  const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
  return `${base}${clean}`;
}

function parsePublicBrList(raw) {
  const seenUrls = new Set();
  const parsed = [];

  String(raw || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const clean = line.trim();
      if (!clean || clean.startsWith('#')) return;

      const separator = clean.indexOf(',');
      if (separator < 0) return;

      const label = clean.slice(0, separator).trim();
      const url = clean.slice(separator + 1).trim();
      if (!label || !/^https?:\/\//i.test(url) || seenUrls.has(url)) return;

      seenUrls.add(url);
      parsed.push({ label, url });
    });

  return parsed;
}

async function refreshPublicBrChecklist(containerId = 'publicBrChecklist') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<p class="public-br-empty">Carregando lista publica...</p>';

  try {
    const fileUrl = resolveLocalSourceUrl('m3u_list.txt');
    const response = await fetch(fileUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const txt = await response.text();
    publicBrOptions = parsePublicBrList(txt);

    if (!publicBrOptions.length) {
      container.innerHTML = '<p class="public-br-empty">Nenhuma lista valida encontrada em m3u_list.txt.</p>';
      return;
    }

    const storedSources = await getStored(STORAGE_KEYS.sources);
    const existingUrls = new Set((storedSources || []).map((s) => String(s.url || '')));

    container.innerHTML = publicBrOptions.map((item, idx) => {
      const inputId = `${containerId}Item${idx}`;
      const exists = existingUrls.has(item.url);
      return `
<label class="public-br-item ${exists ? 'existing' : ''}" for="${inputId}">
  <input id="${inputId}" type="checkbox" name="publicBrSource" value="${h(item.url)}" ${exists ? 'disabled' : ''} />
  <div class="public-br-item-main">
    <span class="public-br-name">${h(item.label)}</span>
    <span class="public-br-url">${h(item.url)}</span>
  </div>
  <span class="public-br-status">${exists ? 'Ja adicionada' : 'Nova'}</span>
</label>`;
    }).join('');
  } catch (error) {
    console.warn('[PublicBR] Falha ao carregar m3u_list.txt:', error.message);
    publicBrOptions = [];
    container.innerHTML = '<p class="public-br-empty">Nao foi possivel ler m3u_list.txt.</p>';
  }
}

function togglePublicBrSelection(checked, containerId = 'publicBrChecklist') {
  const container = document.getElementById(containerId);
  if (!container) return;

  document
    .querySelectorAll(`#${containerId} input[name="publicBrSource"]:not(:disabled)`)
    .forEach((input) => {
      input.checked = !!checked;
    });
}

async function syncSelectedPublicBrLists() {
  const selectedInputs = [...document.querySelectorAll('#publicBrChecklist input[name="publicBrSource"]:checked:not(:disabled)')];
  if (!selectedInputs.length) {
    showToast('⚠️ Selecione pelo menos uma lista publica');
    return;
  }

  const selectedUrls = selectedInputs.map((input) => String(input.value || '').trim()).filter(Boolean);
  const byUrl = new Map(publicBrOptions.map((item) => [item.url, item]));

  const storedSources = await getStored(STORAGE_KEYS.sources);
  sources = Array.isArray(storedSources) ? [...storedSources] : [];

  const added = [];
  let skipped = 0;
  let nextId = sources.length ? Math.max(...sources.map((s) => s.id)) + 1 : 1;

  selectedUrls.forEach((url) => {
    if (sources.some((s) => s.url === url)) {
      skipped++;
      return;
    }

    const item = byUrl.get(url);
    const label = item ? `Lista Publica BR - ${item.label}` : 'Lista Publica BR';
    const source = { id: nextId++, label, url, channelCount: 0, lastSyncAt: null };
    sources.push(source);
    added.push(source);
  });

  if (!added.length) {
    showToast('⚠️ Todas as listas selecionadas ja estao cadastradas');
    await refreshPublicBrChecklist();
    return;
  }

  await setStored(STORAGE_KEYS.sources, sources);
  renderSources();

  for (const source of added) {
    await syncSource(source.id);
  }

  await refreshPublicBrChecklist();
  if (skipped > 0) {
    showToast(`✅ ${added.length} lista(s) sincronizada(s) (${skipped} ja existia[m])`);
  } else {
    showToast(`✅ ${added.length} lista(s) sincronizada(s)`);
  }
}

function updateXtreamPreview() {
  const host = document.getElementById('xtreamHost')?.value.trim().replace(/\/+$/, '');
  const user = document.getElementById('xtreamUser')?.value.trim();
  const pass = document.getElementById('xtreamPass')?.value.trim();
  const output = document.getElementById('xtreamOutput')?.value || 'hls';
  const preview = document.getElementById('xtreamPreview');
  if (!preview) return;
  if (host && user && pass) {
    preview.textContent = `${host}/get.php?username=${user}&password=${pass}&type=m3u_plus&output=${output}`;
  } else {
    preview.textContent = 'Preencha os campos acima...';
  }
}

function buildXtreamUrl() {
  const hostEl = document.getElementById('xtreamHost');
  const userEl = document.getElementById('xtreamUser');
  const passEl = document.getElementById('xtreamPass');
  const outputEl = document.getElementById('xtreamOutput');
  if (!hostEl || !userEl || !passEl || !outputEl) return null;

  const host = hostEl.value.trim().replace(/\/+$/, '');
  const user = userEl.value.trim();
  const pass = passEl.value.trim();
  const output = outputEl.value;
  if (!host || !user || !pass) return null;
  return `${host}/get.php?username=${user}&password=${pass}&type=m3u_plus&output=${output}`;
}

async function addSource() {
  let label, url;

  if (activeTab === 'file') return handleFileUpload();
  if (activeTab === 'default') return syncSelectedPublicBrLists();
  if (activeTab === 'app') { showToast('Esta aba é apenas para configuração do app'); return; }

  if (activeTab === 'xtream') {
    label = document.getElementById('xtreamLabel').value.trim();
    url = buildXtreamUrl();
    const output = document.getElementById('xtreamOutput').value;
    if (!label) { showToast('⚠️ Preencha o nome da fonte'); return; }
    if (!url) { showToast('⚠️ Preencha servidor, usuário e senha'); return; }
  } else {
    label = document.getElementById('sourceLabel').value.trim();
    url = document.getElementById('sourceUrl').value.trim();
    if (!label || !url) { showToast('⚠️ Preencha todos os campos'); return; }
  }

  showToast('⏳ Adicionando...');
  try {
    const newId = sources.length ? Math.max(...sources.map(s => s.id)) + 1 : 1;
    sources.push({ id: newId, label, url, channelCount: 0, lastSyncAt: null });
    await setStored(STORAGE_KEYS.sources, sources);
    await syncSource(newId);
    ['sourceLabel', 'sourceUrl', 'xtreamLabel', 'xtreamHost', 'xtreamUser', 'xtreamPass'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    updateXtreamPreview();
  } catch (e) { showToast('❌ ' + e.message); }
}

async function handleDefaultUpload(filename = 'br_categorizada.m3u', labelPrefix = 'CinaMídia BR (Pública)') {
  const label = labelPrefix;
  const url = /^https?:\/\//i.test(filename) ? filename : resolveLocalSourceUrl(filename);

  const currentSources = await getStored(STORAGE_KEYS.sources);
  sources = Array.isArray(currentSources) ? [...currentSources] : [];
  if (sources.some(s => s.url === url)) {
     console.log(`[AutoSetup] Lista ${filename} já existe. Pulando.`);
     return;
  }

  const newId = sources.length ? Math.max(...sources.map(s => s.id)) + 1 : 1;
  sources.push({ id: newId, label, url, channelCount: 0, lastSyncAt: null });
  await setStored(STORAGE_KEYS.sources, sources);
  await syncSource(newId);
  renderSources();
  await refreshPublicBrChecklist();
}

async function handleFileUpload() {
  const label = document.getElementById('fileLabel').value.trim();
  const file = document.getElementById('fileInput').files[0];
  if (!label || !file) { showToast('⚠️ Informe nome e arquivo'); return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const newId = sources.length ? Math.max(...sources.map(s => s.id)) + 1 : 1;
    sources.push({ id: newId, label, url: 'file://local', channelCount: 0, lastSyncAt: Date.now() });
    await setStored(STORAGE_KEYS.sources, sources);
    await processM3UContent(newId, e.target.result);
    document.getElementById('fileLabel').value = '';
    document.getElementById('fileInput').value = '';
    renderSources();
  };
  reader.readAsText(file);
}

async function syncSource(id) {
  const source = sources.find(s => s.id === id);
  if (!source) return;
  if (source.url === 'file://local') {
    showToast('⚠️ Arquivos locais não podem ser sincronizados automaticamente. Faça upload novamente.');
    return;
  }

  showToast('⏳ Baixando playlist...');
  try {
    let content = '';
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(source.url)}`);
      if (!res.ok) throw new Error(`Proxy: ${res.status}`);
      content = await res.text();
      if (content.startsWith('{') && content.includes('"error"')) throw new Error(content);
    } catch (proxyErr) {
      console.warn('[proxy]', proxyErr.message);
      const res = await fetch(source.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      content = await res.text();
    }
    await processM3UContent(id, content);
  } catch (e) { showToast('❌ ' + e.message); }
}

async function deleteSource(id) {
   console.log('[Admin] Requesting delete for source ID:', id);
   customConfirm('Remover esta fonte e todos os seus canais?', async (yes) => {
     console.log('[Admin] Confirmation response:', yes);
     if (!yes) return;
     sources = sources.filter(s => s.id !== id);
     await setStored(STORAGE_KEYS.sources, sources);
     await setStored(STORAGE_KEYS.channels, (await getStored(STORAGE_KEYS.channels)).filter(ch => ch.source_id !== id));
     showToast('🗑️ Removida'); await loadSources(); await loadData();
   });
}
