// ─── PLAYER ───────────────────────────────────────────────────────────────────
let currentPlayingIndex = -1; // index in currentPlaylist
let currentPlaylist = [];     // flat list for channel switching
let hudTimer = null;
let zapHideTimer = null;
let zapCommitTimer = null;
let zapPendingIndex = -1;
let infoPanelVisible = false;
let infoPanelTimer = null;
let playerVideoListenersBound = false;
const ENABLE_EXPERIMENTAL_SENZA_HLS = true;
const ZAP_VISIBLE_ITEMS = 5;
const ZAP_COMMIT_DELAY_MS = 3000;
const ZAP_HIDE_DELAY_MS = 2400;
const INFO_PANEL_HIDE_DELAY_MS = 5000;

const PLAYER_ERROR_DEFAULT_HTML = 'Nao foi possivel carregar este canal.<br />O servidor pode estar offline ou bloquear CORS.';

function resetPlayerError() {
  const errorEl = document.getElementById('playerError');
  if (!errorEl) return;
  errorEl.classList.remove('show');
  const messageEl = errorEl.querySelector('p');
  if (messageEl) messageEl.innerHTML = PLAYER_ERROR_DEFAULT_HTML;
}

function showPlayerError(message = PLAYER_ERROR_DEFAULT_HTML) {
  const errorEl = document.getElementById('playerError');
  if (!errorEl) return;
  const messageEl = errorEl.querySelector('p');
  if (messageEl) messageEl.innerHTML = message;
  errorEl.classList.add('show');
}

function maybeHidePlayerErrorWhilePlaying(video) {
  if (!video) return;
  if (video.paused || video.ended) return;
  if (video.readyState < 2) return;
  if (!video.currentSrc) return;

  const errorEl = document.getElementById('playerError');
  if (errorEl?.classList.contains('show')) {
    resetPlayerError();
  }
}

function ensurePlayerVideoListeners() {
  if (playerVideoListenersBound) return;
  const video = document.getElementById('videoEl');
  if (!video) return;

  const onPlayable = () => maybeHidePlayerErrorWhilePlaying(video);
  ['playing', 'canplay', 'canplaythrough', 'loadeddata', 'timeupdate'].forEach(evt => {
    video.addEventListener(evt, onPlayable);
  });
  playerVideoListenersBound = true;
}

function isSenzaEnvironment() {
  return senzaReady && typeof senza !== 'undefined';
}

function isHttpUrl(url) {
  return /^http:\/\//i.test(url || '');
}

function isHttpsUrl(url) {
  return /^https:\/\//i.test(url || '');
}

function buildProxyUrl(url) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function normalizeLanguage(language) {
  return String(language || '').toLowerCase();
}

function classifyStream(url) {
  const rawUrl = String(url || '');
  const lowerUrl = rawUrl.toLowerCase();
  let parsedUrl = null;

  try {
    parsedUrl = new URL(rawUrl, window.location.href);
  } catch (e) { }

  const pathname = (parsedUrl?.pathname || rawUrl).toLowerCase();
  const output = (parsedUrl?.searchParams.get('output') || '').toLowerCase();

  if (pathname.endsWith('.mpd') || lowerUrl.includes('.mpd')) return 'dash';
  if (output === 'ts' || pathname.endsWith('.ts') || lowerUrl.includes('output=ts')) return 'ts';
  if (output === 'hls' || pathname.endsWith('.m3u8') || lowerUrl.includes('.m3u8')) return 'hls';
  return 'other';
}

function getPlaybackUrl(streamUrl, streamType) {
  if (streamType === 'hls') return buildProxyUrl(streamUrl);
  if ((streamType === 'ts' || streamType === 'other') && isHttpUrl(streamUrl)) return buildProxyUrl(streamUrl);
  return streamUrl;
}

async function cleanupPlayers(video) {
  video.pause();
  video.removeAttribute('src');
  video.load();

  if (video._hlsInstance) {
    video._hlsInstance.destroy();
    video._hlsInstance = null;
  }

  if (video._shakaInstance) {
    try {
      await video._shakaInstance.destroy();
    } catch (e) { }
    video._shakaInstance = null;
  }

  if (senzaPlayer) {
    try {
      await senzaPlayer.destroy();
    } catch (e) { }
    senzaPlayer = null;
  }
}

async function cleanupRemotePlayer() {
  if (!isSenzaEnvironment() || !senza.remotePlayer) return;

  try {
    await senza.remotePlayer.unload?.();
    return;
  } catch (e) { }

  try {
    await senza.remotePlayer.stop?.();
  } catch (e) { }
}

function findPreferredAudioLanguage(player) {
  if (!player?.getAudioLanguages) return null;

  let languages = [];
  try {
    languages = player.getAudioLanguages() || [];
  } catch (e) {
    return null;
  }

  const uniqueLanguages = [...new Set(languages.filter(Boolean))];
  if (!uniqueLanguages.length) return null;

  console.info('[Player] Audio languages:', uniqueLanguages);

  const browserLanguage = normalizeLanguage(navigator.language);
  const browserBaseLanguage = browserLanguage.split('-')[0];
  const preferredLanguages = [
    browserLanguage,
    browserBaseLanguage,
    'pt-br',
    'pt',
    'por',
  ].filter(Boolean);

  const languageMap = new Map(uniqueLanguages.map(language => [normalizeLanguage(language), language]));
  const match = preferredLanguages.find(language => languageMap.has(normalizeLanguage(language)));
  return match ? languageMap.get(normalizeLanguage(match)) : null;
}

async function applyPreferredAudioLanguage(player) {
  if (!player?.selectAudioLanguage) return;

  const preferredLanguage = findPreferredAudioLanguage(player);
  if (!preferredLanguage) return;

  try {
    await player.selectAudioLanguage(preferredLanguage);
  } catch (e) {
    console.warn('[Player] Audio language selection failed:', e.message);
  }
}

async function loadWithShaka(video, PlayerClass, streamUrl, useSenzaPlayer = false) {
  const player = new PlayerClass();
  video._shakaInstance = player;
  if (useSenzaPlayer) senzaPlayer = player;

  if (player.attach) {
    await player.attach(video);
  }

  if (player.addEventListener) {
    player.addEventListener('trackschanged', () => {
      applyPreferredAudioLanguage(player);
    });
    player.addEventListener('loading', () => console.log('[Player] Loading...'));
  }

  await player.load(streamUrl);
  await applyPreferredAudioLanguage(player);
  await video.play();
  maybeHidePlayerErrorWhilePlaying(video);
}

function loadWithHls(video, streamUrls, options = {}) {
  const urls = [...new Set((Array.isArray(streamUrls) ? streamUrls : [streamUrls]).filter(Boolean))];
  let urlIndex = 0;

  const start = () => {
    const currentUrl = urls[urlIndex];
    const hls = new Hls({
      enableWorker: false,
      lowLatencyMode: false,
      ...(options.hlsConfig || {}),
    });

    video._hlsInstance = hls;
    hls.loadSource(currentUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, async () => {
      try {
        if (options.beforePlay) options.beforePlay();
        await video.play();
        maybeHidePlayerErrorWhilePlaying(video);
        if (options.onManifestParsed) options.onManifestParsed(currentUrl);
      } catch (e) {
        console.error('[HLS] play falhou:', e);
        showPlayerError(options.playErrorMessage || PLAYER_ERROR_DEFAULT_HTML);
      }
    });

    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
      if (options.logPrefix) {
        console.log(`${options.logPrefix} audio tracks:`, data?.audioTracks || []);
      }

      if ((data?.audioTracks || []).length > 0) {
        try {
          hls.audioTrack = 0;
          if (options.logPrefix) {
            console.log(`${options.logPrefix} forced audioTrack=0`, data.audioTracks[0]);
          }
        } catch (e) {
          if (options.logPrefix) {
            console.warn(`${options.logPrefix} failed to force audio track:`, e);
          }
        }
      }
    });

    hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
      if (options.logPrefix) {
        console.log(`${options.logPrefix} audio track switched:`, data);
      }
    });

    hls.on(Hls.Events.AUDIO_TRACK_LOADED, (_event, data) => {
      if (options.logPrefix) {
        console.log(`${options.logPrefix} audio track loaded:`, data);
      }
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (options.logPrefix) {
        console.error(`${options.logPrefix} error:`, data);
      }
      logVideoState(video, `${options.logPrefix || '[HLS]'} fatal=${Boolean(data?.fatal)}`);

      if (!data?.fatal) return;

      try {
        hls.destroy();
      } catch (e) { }

      if (video._hlsInstance === hls) {
        video._hlsInstance = null;
      }

      if (urlIndex + 1 < urls.length) {
        urlIndex += 1;
        start();
        return;
      }

      showPlayerError(options.errorMessage || PLAYER_ERROR_DEFAULT_HTML);
    });
  };

  start();
}

function logVideoState(video, label) {
  const mediaError = video.error
    ? {
        code: video.error.code,
        message: video.error.message || '',
      }
    : null;

  console.log(`[Video] ${label}`, {
    currentSrc: video.currentSrc,
    readyState: video.readyState,
    networkState: video.networkState,
    paused: video.paused,
    ended: video.ended,
    muted: video.muted,
    volume: video.volume,
    error: mediaError,
  });
}

async function loadExperimentalSenzaHls(video, originalStreamUrl, fallbackStreamUrl) {
  await senza.lifecycle.moveToForeground();

  const hlsUrls = [fallbackStreamUrl, originalStreamUrl];
  console.log('[HLS foreground] candidate URLs:', hlsUrls.filter(Boolean));

  if (window.Hls && window.Hls.isSupported()) {
    loadWithHls(video, hlsUrls, {
      logPrefix: '[HLS foreground]',
      beforePlay: () => {
        video.muted = false;
        video.volume = 1;
        logVideoState(video, 'before play');
      },
      onManifestParsed: currentUrl => {
        logVideoState(video, `manifest parsed (${currentUrl})`);
        showToast('HLS experimental em foreground');
      },
      playErrorMessage: 'HLS carregou, mas o play falhou em foreground.',
      errorMessage: 'Falha ao reproduzir HLS em foreground no Senza.',
    });
    return;
  }

  video.src = originalStreamUrl || fallbackStreamUrl;
  video.muted = false;
  video.volume = 1;
  await video.play();
  maybeHidePlayerErrorWhilePlaying(video);
  logVideoState(video, 'native hls play');
  showToast('HLS nativo em foreground');
}

function formatChannelNumber(index) {
  return String((index || 0) + 1).padStart(4, '0');
}

function updatePlayerInfoPanel(channel, streamType = null) {
  const nameEl = document.getElementById('infoChannelName');
  const catEl = document.getElementById('infoChannelCategory');
  const typeEl = document.getElementById('infoChannelType');
  const urlEl = document.getElementById('infoChannelUrl');
  if (!nameEl || !catEl || !typeEl || !urlEl) return;
  if (!channel) return;

  const resolvedType = (streamType || classifyStream(channel.stream_url || '') || 'other').toUpperCase();
  const channelNumber = currentPlayingIndex >= 0 ? formatChannelNumber(currentPlayingIndex) : '----';
  nameEl.textContent = `${channelNumber} | ${channel.name || '-'}`;
  catEl.textContent = channel.group_title || '-';
  typeEl.textContent = resolvedType;
  urlEl.textContent = channel.stream_url || '-';
}

function showPlayerInfoPanel() {
  const panel = document.getElementById('playerInfoPanel');
  if (!panel) return;
  const current = currentPlaylist[currentPlayingIndex];
  if (current) updatePlayerInfoPanel(current);
  panel.classList.add('show');
  infoPanelVisible = true;
  clearTimeout(infoPanelTimer);
  infoPanelTimer = setTimeout(() => hidePlayerInfoPanel(), INFO_PANEL_HIDE_DELAY_MS);
}

function hidePlayerInfoPanel() {
  clearTimeout(infoPanelTimer);
  const panel = document.getElementById('playerInfoPanel');
  panel?.classList.remove('show');
  infoPanelVisible = false;
}

function togglePlayerInfoPanel() {
  if (infoPanelVisible) hidePlayerInfoPanel();
  else showPlayerInfoPanel();
}

function togglePlayerPause() {
  const video = document.getElementById('videoEl');
  if (!video) return;

  if (isZapMenuVisible()) {
    clearTimeout(zapCommitTimer);
    zapPendingIndex = -1;
    hideZapOverlay(false);
  }

  if (video.paused || video.ended) {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => showPlayerError('Nao foi possivel retomar a reprodução.'));
      playPromise.then(() => maybeHidePlayerErrorWhilePlaying(video)).catch(() => {});
    }
    showToast('▶ Reproduzindo');
  } else {
    video.pause();
    showToast('⏸ Pausado');
  }

  showHud();
}

function isZapMenuVisible() {
  return document.getElementById('zapOverlay')?.classList.contains('show') ?? false;
}

function getZapSelectedIndex() {
  return zapPendingIndex >= 0 ? zapPendingIndex : currentPlayingIndex;
}

function scheduleZapHide() {
  clearTimeout(zapHideTimer);
  zapHideTimer = setTimeout(() => hideZapOverlay(), ZAP_HIDE_DELAY_MS);
}

function renderZapOverlay(selectedIndex) {
  const overlay = document.getElementById('zapOverlay');
  const listEl = document.getElementById('zapList');
  const channelEl = document.getElementById('zapChannelLabel');
  const titleEl = document.getElementById('zapProgramTitle');
  const timeEl = document.getElementById('zapProgramTime');
  if (!overlay || !listEl || !channelEl || !titleEl || !timeEl) return;
  if (!currentPlaylist.length || selectedIndex < 0 || selectedIndex >= currentPlaylist.length) return;

  const half = Math.floor(ZAP_VISIBLE_ITEMS / 2);
  let start = Math.max(0, selectedIndex - half);
  let end = Math.min(currentPlaylist.length, start + ZAP_VISIBLE_ITEMS);
  start = Math.max(0, end - ZAP_VISIBLE_ITEMS);

  listEl.innerHTML = currentPlaylist.slice(start, end).map((ch, idx) => {
    const realIdx = start + idx;
    const activeClass = realIdx === selectedIndex ? 'active' : '';
    return `<div class="zap-item ${activeClass}">${formatChannelNumber(realIdx)}</div>`;
  }).join('');

  const selected = currentPlaylist[selectedIndex];
  channelEl.textContent = `${formatChannelNumber(selectedIndex)} | ${selected.name}`;
  titleEl.textContent = selected.group_title || 'Canal ao vivo';
  timeEl.textContent = 'Ao vivo agora';

  overlay.classList.add('show');
}

function showZapOverlay(selectedIndex) {
  renderZapOverlay(selectedIndex);
  document.getElementById('playerHud')?.classList.add('hidden');
  scheduleZapHide();
}

function hideZapOverlay(restoreHud = true) {
  clearTimeout(zapHideTimer);
  const overlay = document.getElementById('zapOverlay');
  overlay?.classList.remove('show');
  if (restoreHud && document.getElementById('playerOverlay')?.classList.contains('open')) {
    showHud();
  }
}

function commitZapSelection(hideNow = false) {
  clearTimeout(zapCommitTimer);
  const targetIdx = getZapSelectedIndex();
  const shouldSwitch = targetIdx >= 0 && targetIdx !== currentPlayingIndex && currentPlaylist[targetIdx];
  zapPendingIndex = -1;

  if (shouldSwitch) {
    currentPlayingIndex = targetIdx;
    loadChannel(currentPlaylist[currentPlayingIndex]);
  }

  if (hideNow) hideZapOverlay();
  else scheduleZapHide();
}

function confirmZapSelection() {
  commitZapSelection(true);
}

async function openPlayer(channelId) {
  const ch = allChannels.find(c => c.id === channelId);
  if (!ch) return;

  currentPlaylist = gridRows.flatMap(r => r.channels);
  currentPlayingIndex = currentPlaylist.findIndex(c => c.id === channelId);
  zapPendingIndex = -1;
  hideZapOverlay(false);
  hidePlayerInfoPanel();

  loadChannel(ch);
}

async function loadChannel(ch) {
  const overlay = document.getElementById('playerOverlay');
  overlay.classList.add('open');
  ensurePlayerVideoListeners();

  document.getElementById('playerName').textContent = ch.name;
  document.getElementById('playerCat').textContent = ch.group_title || '';
  const logo = document.getElementById('playerLogo');
  logo.src = ch.logo || '';
  logo.style.display = ch.logo ? 'block' : 'none';
  resetPlayerError();
  if (!isZapMenuVisible()) showHud();

  if (isSenzaEnvironment()) {
    try { await senza.lifecycle.moveToForeground(); } catch (e) { }
  }

  const video = document.getElementById('videoEl');
  await cleanupPlayers(video);

  const originalStreamUrl = ch.stream_url;
  const streamType = classifyStream(originalStreamUrl);
  const streamUrl = getPlaybackUrl(originalStreamUrl, streamType);
  const isHLS = streamType === 'hls';
  updatePlayerInfoPanel(ch, streamType);

  if (isSenzaEnvironment() && ENABLE_EXPERIMENTAL_SENZA_HLS && streamType === 'hls') {
    try {
      await loadExperimentalSenzaHls(video, originalStreamUrl, streamUrl);
      return;
    } catch (e) {
      console.error('[Senza foreground HLS] erro:', e);
      showPlayerError(`Erro no modo HLS foreground: ${e.message || e}`);
      return;
    }
  }

  // Lógica de Player para Senza SDK (Smart TVs)
  if (isSenzaEnvironment()) {
    if (streamType === 'ts') {
      showPlayerError('MPEG-TS e muito propenso a falhar no Senza.<br />Teste HLS .m3u8 ou DASH .mpd.');
      return;
    }

    if (streamType !== 'dash') {
      showPlayerError('Este canal usa um formato nao suportado pelo Senza.<br />Prefira MPEG-DASH com fMP4 e audio AAC.');
      showToast('⚠️ No Senza, use canais DASH/fMP4');
      return;
    }

    if (!isHttpsUrl(originalStreamUrl) && !originalStreamUrl.startsWith('/')) {
      showPlayerError('Este canal DASH nao esta em HTTPS.<br />No Senza, o playback remoto exige HTTPS/TLS compativel.');
      showToast('⚠️ DASH no Senza precisa de HTTPS');
      return;
    }

    const SenzaPlayerClass = senza.ShakaPlayer || (senza.shaka && senza.shaka.Player) || (window.shaka && window.shaka.Player);
    if (SenzaPlayerClass) {
      try {
        // Se for HLS, o SDK da Senza recomenda estar em Foreground para processar localmente
        
        // Força volume máximo no hardware
        try { await senza.remotePlayer.setVolume(1.0); } catch (e) { }

        senzaPlayer = new (SenzaPlayerClass); 
        // Shaka Player do Senza se vincula ao video via .attach(videoEl)
        if (senzaPlayer.attach) {
           await senzaPlayer.attach(video);
        }

        // Garante trilha de áudio conforme sample banner.js
        const trackHandler = () => {
          try {
            if (senzaPlayer) {
              applyPreferredAudioLanguage(senzaPlayer);
            }
          } catch(e) {}
        };
        
        if (senzaPlayer.addEventListener) {
          senzaPlayer.addEventListener('trackschanged', trackHandler);
          senzaPlayer.addEventListener('loading', () => console.log('[Player] Loading...'));
        }

        await senzaPlayer.load(streamUrl);
        await applyPreferredAudioLanguage(senzaPlayer);
        video.play().then(() => maybeHidePlayerErrorWhilePlaying(video)).catch(e => console.error('[Video] Play Error', e));
        showToast('📡 Senza SDK: DASH remoto sincronizado');
        return;
      } catch (e) {
        console.error('[SenzaPlayer] Load failed', e.message);
        showPlayerError('Falha ao carregar o stream DASH no Senza.<br />Confira manifesto, HTTPS e compatibilidade fMP4/AAC.');
        return;
      }
    }
  }

  if (streamType === 'dash') {
    if (!isHttpsUrl(originalStreamUrl) && !originalStreamUrl.startsWith('/')) {
      showPlayerError('Este canal DASH nao esta em HTTPS.<br />Abra via HTTPS ou use uma origem compativel com Shaka.');
      return;
    }

    const WebShakaPlayerClass = window.shaka && window.shaka.Player;
    if (!WebShakaPlayerClass) {
      showPlayerError('O player DASH nao foi carregado no navegador.');
      return;
    }

    try {
      await loadWithShaka(video, WebShakaPlayerClass, streamUrl);
      return;
    } catch (e) {
      console.error('[Shaka] Load failed', e.message);
      showPlayerError('Nao foi possivel carregar este canal DASH.<br />Confira manifesto, codec e CORS.');
      return;
    }
  }

  // Fallback Hls.js ou Nativo
  if (isHLS && Hls.isSupported()) {
    loadWithHls(video, [streamUrl, originalStreamUrl], {
      logPrefix: '[HLS browser]',
      errorMessage: 'Falha ao reproduzir HLS.',
    });
  } else {
    video.src = streamUrl;
    video.play().then(() => maybeHidePlayerErrorWhilePlaying(video)).catch(() => showPlayerError());
  }
}

async function closePlayer() {
  clearTimeout(zapCommitTimer);
  clearTimeout(zapHideTimer);
  zapPendingIndex = -1;
  hideZapOverlay(false);
  hidePlayerInfoPanel();
  document.getElementById('playerOverlay').classList.remove('open');
  const video = document.getElementById('videoEl');
  await cleanupPlayers(video);
  updateFocus();
}

function changeChannel(dir) {
  if (currentPlaylist.length === 0) return;
  const startIdx = getZapSelectedIndex();
  const nextIdx = (startIdx + dir + currentPlaylist.length) % currentPlaylist.length;
  zapPendingIndex = nextIdx;
  showZapOverlay(nextIdx);

  clearTimeout(zapCommitTimer);
  zapCommitTimer = setTimeout(() => commitZapSelection(false), ZAP_COMMIT_DELAY_MS);
}

function showHud() {
  const hud = document.getElementById('playerHud');
  hud.classList.remove('hidden');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => hud.classList.add('hidden'), 5000);
}
