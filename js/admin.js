// ─── ADMIN ────────────────────────────────────────────────────────────────────
let sources = [];
let activeTab = 'm3u';

function toggleAdmin() {
  const panel = document.getElementById('adminPanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    NAV.zone = 'admin';
    loadSources();
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
  document.getElementById('panelM3u').style.display = tab === 'm3u' ? '' : 'none';
  document.getElementById('panelXtream').style.display = tab === 'xtream' ? '' : 'none';
  document.getElementById('panelFile').style.display = tab === 'file' ? '' : 'none';
  document.getElementById('panelDefault').style.display = tab === 'default' ? '' : 'none';

  document.getElementById('tabM3u').classList.toggle('active', tab === 'm3u');
  document.getElementById('tabXtream').classList.toggle('active', tab === 'xtream');
  document.getElementById('tabFile').classList.toggle('active', tab === 'file');
  document.getElementById('tabDefault').classList.toggle('active', tab === 'default');
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
  const host = document.getElementById('xtreamHost').value.trim().replace(/\/+$/, '');
  const user = document.getElementById('xtreamUser').value.trim();
  const pass = document.getElementById('xtreamPass').value.trim();
  const output = document.getElementById('xtreamOutput').value;
  if (!host || !user || !pass) return null;
  return `${host}/get.php?username=${user}&password=${pass}&type=m3u_plus&output=${output}`;
}

async function addSource() {
  let label, url;

  if (activeTab === 'file') return handleFileUpload();
  if (activeTab === 'default') return handleDefaultUpload();

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
  const isLocalFile = window.location.protocol === 'file:';
  const url = isLocalFile ? `./${filename}` : window.location.origin + window.location.pathname.replace('index.html', '') + filename;

  const currentSources = await getStored(STORAGE_KEYS.sources);
  if (currentSources.some(s => s.url === url)) {
     console.log(`[AutoSetup] Lista ${filename} já existe. Pulando.`);
     return;
  }

  const newId = sources.length ? Math.max(...sources.map(s => s.id)) + 1 : 1;
  sources.push({ id: newId, label, url, channelCount: 0, lastSyncAt: null });
  await setStored(STORAGE_KEYS.sources, sources);
  await syncSource(newId);
  renderSources();
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
