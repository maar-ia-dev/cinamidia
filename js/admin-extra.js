// Extra admin behaviors for first-run setup and dynamic public list sync.

function isFirstRunPanelOpen() {
  const panel = document.getElementById('firstRunPanel');
  return !!(panel && panel.classList.contains('open'));
}

function openFirstRunPanel() {
  const panel = document.getElementById('firstRunPanel');
  if (!panel) return;

  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  if (typeof firstRunOpen !== 'undefined') firstRunOpen = true;
  if (typeof NAV !== 'undefined') NAV.zone = 'first-run';

  const adminPanel = document.getElementById('adminPanel');
  if (adminPanel?.classList.contains('open')) {
    adminPanel.classList.remove('open');
  }

  const valMain = document.getElementById('validateChannels');
  const valFirstRun = document.getElementById('validateChannelsFirstRun');
  if (valMain && valFirstRun) {
    valFirstRun.checked = !!valMain.checked || !!valFirstRun.checked;
  }

  refreshPublicBrChecklist('firstRunChecklist');
  setTimeout(() => {
    const first = document.querySelector('#firstRunPanel button, #firstRunPanel input');
    if (first) first.focus();
  }, 100);
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
  if (adminPanel && !adminPanel.classList.contains('open')) {
    toggleAdmin();
  }
  switchTab('default');
}

async function checkAndOpenFirstRunPanel() {
  const currentSources = await getStored(STORAGE_KEYS.sources);
  if (!currentSources.length) {
    openFirstRunPanel();
  } else {
    closeFirstRunPanel();
  }
}

async function syncPublicBrSelectionFrom(containerId = 'publicBrChecklist') {
  const selectedInputs = [...document.querySelectorAll(`#${containerId} input[name="publicBrSource"]:checked:not(:disabled)`)];
  if (!selectedInputs.length) {
    showToast('Selecione pelo menos uma lista publica');
    return 0;
  }

  const selectedUrls = selectedInputs.map((input) => String(input.value || '').trim()).filter(Boolean);
  const byUrl = new Map((publicBrOptions || []).map((item) => [item.url, item]));

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
    showToast('Todas as listas selecionadas ja estao cadastradas');
    await refreshPublicBrChecklist('publicBrChecklist');
    await refreshPublicBrChecklist('firstRunChecklist');
    return 0;
  }

  await setStored(STORAGE_KEYS.sources, sources);
  renderSources();

  for (const source of added) {
    await syncSource(source.id);
  }

  await refreshPublicBrChecklist('publicBrChecklist');
  await refreshPublicBrChecklist('firstRunChecklist');

  if (skipped > 0) {
    showToast(`${added.length} lista(s) sincronizada(s) (${skipped} ja existia)`);
  } else {
    showToast(`${added.length} lista(s) sincronizada(s)`);
  }

  return added.length;
}

async function syncSelectedPublicBrLists() {
  return syncPublicBrSelectionFrom('publicBrChecklist');
}

async function syncFirstRunSelection() {
  const valMain = document.getElementById('validateChannels');
  const valFirstRun = document.getElementById('validateChannelsFirstRun');
  if (valMain && valFirstRun) {
    valMain.checked = !!valFirstRun.checked;
  }

  const added = await syncPublicBrSelectionFrom('firstRunChecklist');
  const currentSources = await getStored(STORAGE_KEYS.sources);
  if (added > 0 || currentSources.length > 0) {
    closeFirstRunPanel();
    await loadData();
  }
}

async function checkAutoSetup() {
  await checkAndOpenFirstRunPanel();
}
