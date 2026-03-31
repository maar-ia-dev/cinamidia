// Extra admin behaviors for first-run setup and dynamic public list sync.
let firstRunItems = [];
let firstRunSelectedUrls = new Set();
let firstRunFocusedItemIndex = 0;

function isFirstRunPanelOpen() {
  const panel = document.getElementById('firstRunPanel');
  return !!(panel && panel.classList.contains('open'));
}

function getFirstRunSourceButtons() {
  return [...document.querySelectorAll('#firstRunChecklist .first-run-source')];
}

function focusFirstRunListItem(index = 0) {
  const items = getFirstRunSourceButtons();
  if (!items.length) return;
  const safeIndex = Math.max(0, Math.min(index, items.length - 1));
  firstRunFocusedItemIndex = safeIndex;
  items[safeIndex].focus();
}

function focusFirstRunAddButton() {
  document.getElementById('firstRunAddBtn')?.focus();
}

function updateFirstRunFooterSummary() {
  const summary = document.getElementById('firstRunSummary');
  if (!summary) return;
  const totalNew = firstRunItems.filter((item) => !item.exists).length;
  const selected = firstRunSelectedUrls.size;
  summary.textContent = `${selected} de ${totalNew} listas selecionadas`;
}

function renderFirstRunPublicList() {
  const container = document.getElementById('firstRunChecklist');
  if (!container) return;

  if (!firstRunItems.length) {
    container.innerHTML = '<p class="public-br-empty">Nenhuma lista publica disponivel.</p>';
    updateFirstRunFooterSummary();
    return;
  }

  container.innerHTML = firstRunItems.map((item, index) => {
    const selected = firstRunSelectedUrls.has(item.url);
    const status = item.exists ? 'Ja adicionada' : (selected ? 'Selecionada' : 'Nao selecionada');
    return `
<button
  type="button"
  class="first-run-source ${item.exists ? 'is-existing' : ''} ${selected ? 'is-selected' : ''}"
  data-idx="${index}"
  data-url="${h(item.url)}"
  onclick="toggleFirstRunItem('${js(item.url)}')"
>
  <span class="first-run-source-mark">${selected ? '✓' : (item.exists ? '•' : '+')}</span>
  <span class="first-run-source-main">
    <span class="first-run-source-name">${h(item.label)}</span>
    <span class="first-run-source-url">${h(item.url)}</span>
  </span>
  <span class="first-run-source-status">${status}</span>
</button>`;
  }).join('');

  updateFirstRunFooterSummary();
}

async function loadFirstRunPublicList() {
  const container = document.getElementById('firstRunChecklist');
  if (!container) return;

  container.innerHTML = '<p class="public-br-empty">Carregando lista publica...</p>';

  try {
    const fileUrl = resolveLocalSourceUrl('m3u_list.txt');
    const response = await fetch(fileUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const txt = await response.text();
    const parsed = parsePublicBrList(txt);
    publicBrOptions = parsed;

    const storedSources = await getStored(STORAGE_KEYS.sources);
    const existingUrls = new Set((storedSources || []).map((s) => String(s.url || '')));

    firstRunItems = parsed.map((item) => ({
      label: item.label,
      url: item.url,
      exists: existingUrls.has(item.url),
    }));

    firstRunSelectedUrls = new Set(firstRunItems.filter((item) => !item.exists).map((item) => item.url));
    firstRunFocusedItemIndex = 0;
    renderFirstRunPublicList();
  } catch (error) {
    console.warn('[FirstRun] Falha ao carregar m3u_list.txt:', error.message);
    firstRunItems = [];
    firstRunSelectedUrls = new Set();
    container.innerHTML = '<p class="public-br-empty">Nao foi possivel ler m3u_list.txt.</p>';
    updateFirstRunFooterSummary();
  }
}

function toggleFirstRunItem(url) {
  const item = firstRunItems.find((entry) => entry.url === url);
  if (!item || item.exists) return;

  if (firstRunSelectedUrls.has(url)) firstRunSelectedUrls.delete(url);
  else firstRunSelectedUrls.add(url);

  renderFirstRunPublicList();
  const index = firstRunItems.findIndex((entry) => entry.url === url);
  focusFirstRunListItem(index >= 0 ? index : 0);
}

function setFirstRunSelection(selectAll) {
  if (selectAll) {
    firstRunSelectedUrls = new Set(firstRunItems.filter((item) => !item.exists).map((item) => item.url));
  } else {
    firstRunSelectedUrls = new Set();
  }
  renderFirstRunPublicList();
}

async function addAndSyncPublicBrUrls(selectedUrls) {
  const urls = (selectedUrls || []).map((url) => String(url || '').trim()).filter(Boolean);
  if (!urls.length) {
    showToast('Selecione pelo menos uma lista publica');
    return 0;
  }

  const byUrl = new Map((publicBrOptions || []).map((item) => [item.url, item]));
  const storedSources = await getStored(STORAGE_KEYS.sources);
  sources = Array.isArray(storedSources) ? [...storedSources] : [];

  const added = [];
  let skipped = 0;
  let nextId = sources.length ? Math.max(...sources.map((s) => s.id)) + 1 : 1;

  urls.forEach((url) => {
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
    showToast('Todas as listas selecionadas ja estao cadastradas');
    await refreshPublicBrChecklist('publicBrChecklist');
    await loadFirstRunPublicList();
    return 0;
  }

  await setStored(STORAGE_KEYS.sources, sources);
  renderSources();

  for (const source of added) {
    await syncSource(source.id);
  }

  await refreshPublicBrChecklist('publicBrChecklist');
  await loadFirstRunPublicList();

  if (skipped > 0) showToast(`${added.length} lista(s) sincronizada(s) (${skipped} ja existia)`);
  else showToast(`${added.length} lista(s) sincronizada(s)`);

  return added.length;
}

function openFirstRunPanel() {
  const panel = document.getElementById('firstRunPanel');
  if (!panel) return;

  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  if (typeof firstRunOpen !== 'undefined') firstRunOpen = true;
  if (typeof NAV !== 'undefined') NAV.zone = 'first-run';

  const adminPanel = document.getElementById('adminPanel');
  if (adminPanel?.classList.contains('open')) adminPanel.classList.remove('open');

  const valMain = document.getElementById('validateChannels');
  const valFirstRun = document.getElementById('validateChannelsFirstRun');
  if (valMain && valFirstRun) valFirstRun.checked = !!valMain.checked || !!valFirstRun.checked;

  loadFirstRunPublicList();
  setTimeout(() => {
    const first = document.getElementById('firstRunGoAddBtn') || document.querySelector('#firstRunPanel button');
    if (first) first.focus();
  }, 80);
}

function closeFirstRunPanel() {
  const panel = document.getElementById('firstRunPanel');
  if (!panel) return;

  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  if (typeof firstRunOpen !== 'undefined') firstRunOpen = false;

  if (typeof NAV !== 'undefined' && NAV.zone === 'first-run') {
    NAV.zone = (typeof gridRows !== 'undefined' && gridRows.length) ? 'grid' : 'categories';
  }
}

function openAdminFromFirstRun() {
  closeFirstRunPanel();
  const adminPanel = document.getElementById('adminPanel');
  if (adminPanel && !adminPanel.classList.contains('open')) toggleAdmin();
  switchTab('default');
}

async function checkAndOpenFirstRunPanel() {
  const currentSources = await getStored(STORAGE_KEYS.sources);
  if (!currentSources.length) openFirstRunPanel();
  else closeFirstRunPanel();
}

async function syncSelectedPublicBrLists() {
  const selectedInputs = [...document.querySelectorAll('#publicBrChecklist input[name="publicBrSource"]:checked:not(:disabled)')];
  const selectedUrls = selectedInputs.map((input) => String(input.value || '').trim()).filter(Boolean);
  return addAndSyncPublicBrUrls(selectedUrls);
}

async function syncFirstRunSelection() {
  const valMain = document.getElementById('validateChannels');
  const valFirstRun = document.getElementById('validateChannelsFirstRun');
  if (valMain && valFirstRun) valMain.checked = !!valFirstRun.checked;

  const added = await addAndSyncPublicBrUrls([...firstRunSelectedUrls]);
  const currentSources = await getStored(STORAGE_KEYS.sources);
  if (added > 0 || currentSources.length > 0) {
    closeFirstRunPanel();
    await loadData();
  }
}

async function checkAutoSetup() {
  await checkAndOpenFirstRunPanel();
}
