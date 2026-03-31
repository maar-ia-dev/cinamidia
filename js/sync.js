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

function buildValidationProxyUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  if (raw.startsWith('/api/proxy?url=')) return raw;

  try {
    const parsed = new URL(raw, window.location.href);
    if (parsed.pathname === '/api/proxy' && parsed.searchParams.has('url')) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch (e) { }

  return `/api/proxy?url=${encodeURIComponent(raw)}`;
}

function detectValidationStreamType(url) {
  const rawUrl = String(url || '');
  const lowerUrl = rawUrl.toLowerCase();
  let parsed = null;

  try {
    parsed = new URL(rawUrl, window.location.href);
  } catch (e) { }

  const pathname = (parsed?.pathname || rawUrl).toLowerCase();
  const output = (parsed?.searchParams.get('output') || '').toLowerCase();

  if (pathname.endsWith('.mpd') || lowerUrl.includes('.mpd')) return 'dash';
  if (output === 'ts' || pathname.endsWith('.ts') || lowerUrl.includes('output=ts')) return 'ts';
  if (output === 'hls' || pathname.endsWith('.m3u8') || lowerUrl.includes('.m3u8')) return 'hls';
  return 'other';
}

function looksLikeHtmlOrError(text) {
  const body = String(text || '').trim();
  return /<!doctype html|<html[\s>]/i.test(body) || (body.startsWith('{') && /"error"\s*:/i.test(body));
}

function hasMediaContentType(contentType) {
  const type = String(contentType || '').toLowerCase();
  if (!type) return true;
  if (type.includes('text/html')) return false;
  if (type.includes('application/json')) return false;
  return true;
}

async function fetchWithTimeout(url, init = {}, timeout = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function validateBinaryReachability(url, timeout = 6000) {
  try {
    const testUrl = buildValidationProxyUrl(url);
    const res = await fetchWithTimeout(testUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-2047' },
    }, timeout);

    if (!(res.ok || res.status === 206)) return false;
    return hasMediaContentType(res.headers.get('content-type'));
  } catch {
    return false;
  }
}

function getFirstDataLine(lines) {
  return lines.find(line => line && !line.startsWith('#')) || '';
}

function resolvePlaylistUrl(candidate, baseUrl) {
  const value = String(candidate || '').trim();
  if (!value) return '';
  if (value.startsWith('/api/proxy?url=')) return value;

  try {
    return new URL(value, baseUrl).toString();
  } catch (e) {
    return value;
  }
}

async function validateHlsUrl(url, timeout = 6000) {
  try {
    const playlistUrl = buildValidationProxyUrl(url);
    const res = await fetchWithTimeout(playlistUrl, {
      method: 'GET',
      headers: { Accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*' },
    }, timeout);
    if (!res.ok) return false;

    const text = await res.text();
    if (!text || looksLikeHtmlOrError(text)) return false;

    const hasM3u = /#EXTM3U/i.test(text);
    const hasStreamInf = /#EXT-X-STREAM-INF/i.test(text);
    const hasInf = /#EXTINF\s*:/i.test(text);
    if (!hasM3u || (!hasStreamInf && !hasInf)) return false;

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (hasStreamInf) {
      let childRef = '';
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^#EXT-X-STREAM-INF/i.test(lines[i])) {
          for (let j = i + 1; j < lines.length; j++) {
            if (!lines[j].startsWith('#')) {
              childRef = lines[j];
              break;
            }
          }
          if (childRef) break;
        }
      }

      if (!childRef) return false;
      const childUrl = resolvePlaylistUrl(childRef, playlistUrl);
      const childRes = await fetchWithTimeout(buildValidationProxyUrl(childUrl), { method: 'GET' }, timeout);
      if (!childRes.ok) return false;
      const childText = await childRes.text();
      if (!/#EXTINF\s*:/i.test(childText) || looksLikeHtmlOrError(childText)) return false;

      const childLines = childText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const firstSegment = getFirstDataLine(childLines);
      if (!firstSegment) return false;
      const segmentUrl = resolvePlaylistUrl(firstSegment, childUrl);
      return validateBinaryReachability(segmentUrl, timeout);
    }

    const firstSegment = getFirstDataLine(lines);
    if (!firstSegment) return false;
    const segmentUrl = resolvePlaylistUrl(firstSegment, playlistUrl);
    return validateBinaryReachability(segmentUrl, timeout);
  } catch {
    return false;
  }
}

async function validateDashUrl(url, timeout = 6000) {
  try {
    const res = await fetchWithTimeout(buildValidationProxyUrl(url), {
      method: 'GET',
      headers: { Accept: 'application/dash+xml,application/xml,text/xml,*/*' },
    }, timeout);
    if (!res.ok) return false;

    const text = await res.text();
    if (!text || looksLikeHtmlOrError(text)) return false;
    if (!/<MPD[\s>]/i.test(text)) return false;
    if (!/<Period[\s>]/i.test(text)) return false;
    return true;
  } catch {
    return false;
  }
}

async function testChannelUrl(url, timeout = 6000) {
  const type = detectValidationStreamType(url);

  if (type === 'hls') return validateHlsUrl(url, timeout);
  if (type === 'dash') return validateDashUrl(url, timeout);
  return validateBinaryReachability(url, timeout);
}

async function testChannelWithRetry(url) {
  if (await testChannelUrl(url, 6000)) return true;
  return testChannelUrl(url, 9000);
}

async function validateChannelsBatch(channels, onProgress) {
  const BATCH_SIZE = 12;
  const results = [];
  let tested = 0;

  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    const batch = channels.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async ch => {
      const ok = await testChannelWithRetry(ch.url);
      tested++;
      onProgress(tested, channels.length, ok ? 'ok' : 'fail', ch.name);
      return ok ? ch : null;
    });
    const batchResults = await Promise.all(promises);
    results.push(...batchResults.filter(Boolean));
  }
  return results;
}
