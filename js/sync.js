// ─── SYNC & VALIDATION ────────────────────────────────────────────────────────
async function processM3UContent(sourceId, content) {
  const source = sources.find(s => s.id === sourceId);
  const shouldValidate = document.getElementById('validateChannels')?.checked ?? false;
  const progressEl = document.getElementById('syncProgress');
  const barEl = document.getElementById('syncProgressBar');
  const statusEl = document.getElementById('syncStatus');

  let parsed = parseM3U(content);
  
  if (!parsed.length && source && source.url && (source.url.toLowerCase().includes('.mpd') || source.url.toLowerCase().includes('.m3u8'))) {
    parsed = [{
      name: source.label || 'Canal Importado',
      logo: '',
      groupTitle: 'Importados',
      url: source.url
    }];
  }

  if (!parsed.length) { showToast('⚠️ Nenhum canal encontrado no arquivo'); return; }

  showToast(`📋 ${parsed.length} canais encontrados`);

  if (shouldValidate) {
    progressEl?.classList.add('active');
    document.getElementById('globalSyncBar')?.classList.add('active');
    let okCount = 0, failCount = 0;

    parsed = await validateChannelsBatch(parsed, (done, total, status, name) => {
      if (status === 'ok') okCount++; else failCount++;
      const pct = Math.round((done / total) * 100);
      if (barEl) barEl.style.width = pct + '%';
      if (statusEl) statusEl.textContent = `Validando: ${done}/${total} — ✅ ${okCount} ❌ ${failCount} — ${name}`;
      
      const gBar = document.getElementById('globalSyncInner');
      const gLab = document.getElementById('globalSyncLabel');
      if (gBar) gBar.style.width = pct + '%';
      if (gLab) gLab.textContent = `Validando Canais: ${pct}% (${done}/${total})`;
    });

    progressEl?.classList.remove('active');
    document.getElementById('globalSyncBar')?.classList.remove('active');
    if (statusEl) statusEl.textContent = '';

    if (!parsed.length) { 
      showToast('⚠️ Nenhum canal válido encontrado. Mantendo originais.'); 
    } else {
      await saveChannelsToStorage(sourceId, parsed);
      const cats = new Set(parsed.map(c => c.groupTitle)).size;
      showToast(`✅ ${parsed.length} canais validados e salvos`);
      await loadSources(); await loadData();
    }
  } else {
    await saveChannelsToStorage(sourceId, parsed);
    showToast(`✅ ${parsed.length} canais carregados`);
    await loadSources(); await loadData();
  }
}

async function saveChannelsToStorage(sourceId, parsedList) {
  let storedFull = await getStored(STORAGE_KEYS.channels);
  let storedFiltered = storedFull.filter(ch => ch.source_id !== sourceId);
  let nextId = storedFull.length ? Math.max(0, ...storedFull.map(c => c.id)) + 1 : 1;
  
  const newChannels = parsedList.map(ch => ({
    id: nextId++, 
    name: ch.name, 
    logo: ch.logo || null,
    group_title: ch.groupTitle, 
    stream_url: ch.url,
    tvg_id: ch.tvgId || null, 
    tvg_name: ch.tvgName || null, 
    source_id: sourceId,
  }));

  storedFiltered = storedFiltered.concat(newChannels);
  await setStored(STORAGE_KEYS.channels, storedFiltered);

  const currentSources = await getStored(STORAGE_KEYS.sources);
  const source = currentSources.find(s => s.id === sourceId);
  if (source) {
    source.channelCount = parsedList.length;
    source.lastSyncAt = new Date().toISOString();
    await setStored(STORAGE_KEYS.sources, currentSources);
  }
}

async function testChannelUrl(url, timeout = 4000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let testUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    let res;
    try {
      res = await fetch(testUrl, { method: 'HEAD', signal: controller.signal });
    } catch {
      res = await fetch(testUrl, {
        method: 'GET', signal: controller.signal,
        headers: { 'Range': 'bytes=0-0' }
      });
    }
    clearTimeout(timer);
    return res.ok || res.status === 206;
  } catch { return false; }
}

async function validateChannelsBatch(channels, onProgress) {
  const BATCH_SIZE = 25;
  const results = [];
  let tested = 0;

  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    const batch = channels.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async ch => {
      const ok = await testChannelUrl(ch.url);
      tested++;
      onProgress(tested, channels.length, ok ? 'ok' : 'fail', ch.name);
      return ok ? ch : null;
    });
    const batchResults = await Promise.all(promises);
    results.push(...batchResults.filter(Boolean));
  }
  return results;
}
