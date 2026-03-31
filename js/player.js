// ─── PLAYER ───────────────────────────────────────────────────────────────────
let currentPlayingIndex = -1; // index in currentPlaylist
let currentPlaylist = [];     // flat list for channel switching
let hudTimer = null;
let zapHideTimer = null;
let zapCommitTimer = null;
let zapPendingIndex = -1;
let infoPanelVisible = false;
let infoPanelTimer = null;
let channelInputBuffer = '';
let channelInputTimer = null;
let channelInputOverlayHideTimer = null;
let playerVideoListenersBound = false;
const ENABLE_EXPERIMENTAL_SENZA_HLS = true;
const ZAP_VISIBLE_ITEMS = 5;
const ZAP_COMMIT_DELAY_MS = 3000;
const ZAP_HIDE_DELAY_MS = 2400;
const INFO_PANEL_HIDE_DELAY_MS = 5000;
const CHANNEL_INPUT_DELAY_MS = 1800;
const CHANNEL_INPUT_OVERLAY_HIDE_MS = 1400;
const PLAYER_PREFS_KEY = 'cinamidia_player_prefs';
const DIAG_UPDATE_INTERVAL_MS = 1000;

const PLAYER_ERROR_DEFAULT_HTML = 'Nao foi possivel carregar este canal.<br />O servidor pode estar offline ou bloquear CORS.';
const DIAG_NO_ERROR_LABEL = 'Nenhum';

let diagPanelVisible = false;
let diagTimer = null;
let diagStreamType = '-';
let diagManifestLatencyMs = null;
let diagStallCount = 0;
let diagFatalErrorCount = 0;
let diagLastError = DIAG_NO_ERROR_LABEL;
let diagErrorHistory = [];

function clampVolume(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function loadPlayerPrefs() {
  try {
    const raw = localStorage.getItem(PLAYER_PREFS_KEY);
    if (!raw) return { volume: 1, muted: false };
    const parsed = JSON.parse(raw);
    return {
      volume: Number.isFinite(parsed?.volume) ? clampVolume(parsed.volume) : 1,
      muted: Boolean(parsed?.muted),
    };
  } catch (e) {
    return { volume: 1, muted: false };
  }
}

let playerPrefs = loadPlayerPrefs();

function getPreferredRemoteVolume() {
  return playerPrefs.muted ? 0 : clampVolume(playerPrefs.volume);
}

function savePlayerPrefs() {
  try {
    localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify(playerPrefs));
  } catch (e) { }
}

function savePlayerPrefsFromVideo(video) {
  if (!video) return;
  playerPrefs = {
    volume: clampVolume(video.volume),
    muted: Boolean(video.muted),
  };
  savePlayerPrefs();
}

function applyPreferredVolumeToVideo(video) {
  if (!video) return;
  video.volume = clampVolume(playerPrefs.volume);
  video.muted = Boolean(playerPrefs.muted);
}

function stripHtmlTags(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function resetDiagnosticsState(streamType = '-') {
  diagStreamType = (streamType || '-').toUpperCase();
  diagManifestLatencyMs = null;
  diagStallCount = 0;
  diagFatalErrorCount = 0;
  diagLastError = DIAG_NO_ERROR_LABEL;
  diagErrorHistory = [];
}

function pushDiagnosticsErrorHistory(message) {
  const clean = stripHtmlTags(message) || 'Erro de playback';
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const entry = `${hh}:${mm} ${clean}`;
  diagErrorHistory.unshift(entry);
  if (diagErrorHistory.length > 5) {
    diagErrorHistory = diagErrorHistory.slice(0, 5);
  }
}

function registerDiagnosticsError(message, fatal = false) {
  const clean = stripHtmlTags(message) || 'Erro de playback';
  diagLastError = clean;
  pushDiagnosticsErrorHistory(clean);
  if (fatal) diagFatalErrorCount++;
}

function getBufferedAheadSeconds(video) {
  if (!video || !video.buffered || !video.buffered.length) return 0;
  const t = video.currentTime;
  for (let i = 0; i < video.buffered.length; i++) {
    const start = video.buffered.start(i);
    const end = video.buffered.end(i);
    if (t >= start && t <= end) return Math.max(0, end - t);
  }
  return 0;
}

function getDroppedFrames(video) {
  if (!video) return { dropped: 0, total: 0 };

  if (typeof video.getVideoPlaybackQuality === 'function') {
    const q = video.getVideoPlaybackQuality();
    return {
      dropped: Number(q?.droppedVideoFrames || 0),
      total: Number(q?.totalVideoFrames || 0),
    };
  }

  const dropped = Number(video.webkitDroppedFrameCount || 0);
  const total = Number(video.webkitDecodedFrameCount || 0);
  return { dropped, total };
}

function getShakaStats(video) {
  const player = video?._shakaInstance;
  if (!player || typeof player.getStats !== 'function') return null;
  try {
    return player.getStats();
  } catch (e) {
    return null;
  }
}

function getDiagnosticsStatus(snapshot) {
  if (diagFatalErrorCount > 0) return 'Ruim';
  if (!snapshot.playing) return 'Pausado';
  if (snapshot.bufferSec < 0.4) return 'Ruim';
  if (snapshot.bufferSec < 1.5) return 'Media';
  if (snapshot.dropRatio > 0.08) return 'Media';
  return 'Boa';
}

function getDiagnosticsStatusClass(status) {
  if (status === 'Boa') return 'diag-status-good';
  if (status === 'Media' || status === 'Pausado') return 'diag-status-medium';
  return 'diag-status-bad';
}

function buildDiagnosticsSnapshot() {
  const video = document.getElementById('videoEl');
  const hls = video?._hlsInstance;
  const hlsMetrics = video?._hlsMetrics || {};
  const shakaStats = getShakaStats(video);
  const droppedInfo = getDroppedFrames(video);
  const totalFrames = Math.max(1, droppedInfo.total);
  const dropRatio = droppedInfo.dropped / totalFrames;
  const bufferSec = getBufferedAheadSeconds(video);

  let bitrateKbps = Number(hlsMetrics.lastBitrateKbps || 0);
  let bandwidthKbps = Number(hlsMetrics.bandwidthKbps || 0);
  let latencyMs = Number(hlsMetrics.manifestLatencyMs || 0);

  if (shakaStats) {
    bitrateKbps = Number(shakaStats?.streamBandwidth || shakaStats?.estimatedBandwidth || 0) / 1000;
    bandwidthKbps = Number(shakaStats?.estimatedBandwidth || 0) / 1000;
    if (Number.isFinite(shakaStats?.loadLatency)) latencyMs = Number(shakaStats.loadLatency) * 1000;
  }

  const width = Number(video?.videoWidth || 0);
  const height = Number(video?.videoHeight || 0);

  return {
    playing: !!video && !video.paused && !video.ended,
    resolution: width > 0 && height > 0 ? `${width}x${height}` : '-',
    bufferSec,
    dropRatio,
    dropped: droppedInfo.dropped,
    totalFrames: droppedInfo.total,
    bitrateKbps: Number.isFinite(bitrateKbps) && bitrateKbps > 0 ? bitrateKbps : 0,
    bandwidthKbps: Number.isFinite(bandwidthKbps) && bandwidthKbps > 0 ? bandwidthKbps : 0,
    latencyMs: Number.isFinite(latencyMs) && latencyMs > 0 ? latencyMs : Number(diagManifestLatencyMs || 0),
    stalls: diagStallCount,
    lastError: diagLastError || DIAG_NO_ERROR_LABEL,
    errorHistory: diagErrorHistory.slice(0, 5),
    status: '',
    type: diagStreamType || '-',
    level: (hls && hls.currentLevel >= 0) ? String(hls.currentLevel) : '-',
  };
}

function updateDiagnosticsPanel() {
  if (!diagPanelVisible) return;

  const panel = document.getElementById('playerDiagPanel');
  if (!panel) return;

  const snapshot = buildDiagnosticsSnapshot();
  snapshot.status = getDiagnosticsStatus(snapshot);

  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  const statusEl = document.getElementById('diagStatus');
  if (statusEl) {
    statusEl.textContent = snapshot.status;
    statusEl.classList.remove('diag-status-good', 'diag-status-medium', 'diag-status-bad');
    statusEl.classList.add(getDiagnosticsStatusClass(snapshot.status));
  }
  setValue('diagType', snapshot.type);
  setValue('diagResolution', snapshot.resolution);
  setValue('diagBitrate', snapshot.bitrateKbps ? `${Math.round(snapshot.bitrateKbps)} kbps` : '-');
  setValue('diagBandwidth', snapshot.bandwidthKbps ? `${Math.round(snapshot.bandwidthKbps)} kbps` : '-');
  setValue('diagBuffer', `${snapshot.bufferSec.toFixed(2)} s`);
  setValue('diagStalls', String(snapshot.stalls));
  setValue('diagDropped', `${snapshot.dropped}/${snapshot.totalFrames}`);
  setValue('diagLatency', snapshot.latencyMs ? `${Math.round(snapshot.latencyMs)} ms` : '-');
  setValue('diagLastError', snapshot.lastError || DIAG_NO_ERROR_LABEL);
  setValue('diagErrorHistory', snapshot.errorHistory.length ? snapshot.errorHistory.join(' | ') : '-');
}

function showPlayerDiagnosticsPanel() {
  const panel = document.getElementById('playerDiagPanel');
  if (!panel) return;
  hidePlayerInfoPanel();
  panel.classList.add('show');
  diagPanelVisible = true;
  clearInterval(diagTimer);
  updateDiagnosticsPanel();
  diagTimer = setInterval(updateDiagnosticsPanel, DIAG_UPDATE_INTERVAL_MS);
}

function hidePlayerDiagnosticsPanel() {
  const panel = document.getElementById('playerDiagPanel');
  panel?.classList.remove('show');
  diagPanelVisible = false;
  clearInterval(diagTimer);
}

function togglePlayerDiagnosticsPanel() {
  if (diagPanelVisible) hidePlayerDiagnosticsPanel();
  else showPlayerDiagnosticsPanel();
}

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
  registerDiagnosticsError(message, true);
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
  const onVolumeChange = () => savePlayerPrefsFromVideo(video);
  const onWaiting = () => {
    diagStallCount++;
    if (diagPanelVisible) updateDiagnosticsPanel();
  };
  ['playing', 'canplay', 'canplaythrough', 'loadeddata', 'timeupdate'].forEach(evt => {
    video.addEventListener(evt, onPlayable);
  });
  video.addEventListener('volumechange', onVolumeChange);
  video.addEventListener('waiting', onWaiting);
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
  video._hlsMetrics = null;

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
  const loadStartedAt = performance.now();

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
  diagManifestLatencyMs = performance.now() - loadStartedAt;
  await applyPreferredAudioLanguage(player);
  await video.play();
  maybeHidePlayerErrorWhilePlaying(video);
}

function loadWithHls(video, streamUrls, options = {}) {
  const urls = [...new Set((Array.isArray(streamUrls) ? streamUrls : [streamUrls]).filter(Boolean))];
  let urlIndex = 0;
  const hlsMetrics = {
    manifestLatencyMs: null,
    lastBitrateKbps: 0,
    bandwidthKbps: 0,
    lastError: '',
  };
  video._hlsMetrics = hlsMetrics;

  const start = () => {
    const currentUrl = urls[urlIndex];
    const requestStartedAt = performance.now();
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
        hlsMetrics.manifestLatencyMs = performance.now() - requestStartedAt;
        diagManifestLatencyMs = hlsMetrics.manifestLatencyMs;
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

    hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      const level = Number(data?.level);
      if (Number.isFinite(level)) {
        hlsMetrics.level = level;
      }
      const bw = Number(hls.bandwidthEstimate || 0);
      if (bw > 0) hlsMetrics.bandwidthKbps = bw / 1000;
    });

    hls.on(Hls.Events.FRAG_BUFFERED, (_event, data) => {
      const totalBytes = Number(data?.stats?.total || 0);
      const durationSec = Number(data?.frag?.duration || 0);
      if (totalBytes > 0 && durationSec > 0) {
        hlsMetrics.lastBitrateKbps = (totalBytes * 8) / durationSec / 1000;
      }
      const bw = Number(hls.bandwidthEstimate || 0);
      if (bw > 0) hlsMetrics.bandwidthKbps = bw / 1000;
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (options.logPrefix) {
        console.error(`${options.logPrefix} error:`, data);
      }
      hlsMetrics.lastError = String(data?.details || data?.type || 'Erro HLS');
      registerDiagnosticsError(hlsMetrics.lastError, Boolean(data?.fatal));
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
        applyPreferredVolumeToVideo(video);
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
  applyPreferredVolumeToVideo(video);
  await video.play();
  maybeHidePlayerErrorWhilePlaying(video);
  logVideoState(video, 'native hls play');
  showToast('HLS nativo em foreground');
}

function getChannelViewerNumber(channel, fallbackIndex = 0) {
  const number = Number(channel?.viewer_channel);
  if (Number.isInteger(number) && number > 0) return number;
  return (fallbackIndex || 0) + 1;
}

function formatChannelNumber(number) {
  const parsed = Number(number);
  if (!Number.isFinite(parsed) || parsed <= 0) return '----';
  return String(Math.floor(parsed)).padStart(4, '0');
}

function getGlobalPlaylist() {
  return [...(allChannels || [])].sort((a, b) => {
    const av = getChannelViewerNumber(a, 0);
    const bv = getChannelViewerNumber(b, 0);
    if (av !== bv) return av - bv;
    return (a?.id || 0) - (b?.id || 0);
  });
}

function findPlaylistIndexByViewerChannel(viewerChannelNumber) {
  const target = Number(viewerChannelNumber);
  if (!Number.isInteger(target) || target <= 0) return -1;
  return currentPlaylist.findIndex((channel, index) => getChannelViewerNumber(channel, index) === target);
}

function showChannelInputOverlay(value) {
  const overlay = document.getElementById('channelInputOverlay');
  const valueEl = document.getElementById('channelInputValue');
  if (!overlay || !valueEl) return;

  valueEl.textContent = String(value || '0000').padStart(4, '0');
  overlay.classList.add('show');
  clearTimeout(channelInputOverlayHideTimer);
}

function hideChannelInputOverlay(delayMs = 0) {
  const overlay = document.getElementById('channelInputOverlay');
  if (!overlay) return;

  clearTimeout(channelInputOverlayHideTimer);
  if (delayMs > 0) {
    channelInputOverlayHideTimer = setTimeout(() => {
      overlay.classList.remove('show');
    }, delayMs);
    return;
  }
  overlay.classList.remove('show');
}

function clearChannelInputBuffer() {
  clearTimeout(channelInputTimer);
  channelInputBuffer = '';
}

function commitChannelNumberInput() {
  const typedValue = Number.parseInt(channelInputBuffer, 10);
  if (!Number.isInteger(typedValue) || typedValue <= 0) {
    clearChannelInputBuffer();
    return;
  }

  const targetIdx = findPlaylistIndexByViewerChannel(typedValue);
  if (targetIdx === -1) {
    showToast(`Canal ${formatChannelNumber(typedValue)} nao encontrado`);
    showChannelInputOverlay(formatChannelNumber(typedValue));
    hideChannelInputOverlay(CHANNEL_INPUT_OVERLAY_HIDE_MS);
    clearChannelInputBuffer();
    return;
  }

  zapPendingIndex = targetIdx;
  commitZapSelection(true);
  showToast(`Canal ${formatChannelNumber(typedValue)} sintonizado`);
  showChannelInputOverlay(formatChannelNumber(typedValue));
  hideChannelInputOverlay(CHANNEL_INPUT_OVERLAY_HIDE_MS);
  clearChannelInputBuffer();
}

function appendChannelInputDigit(digit) {
  if (!/^\d$/.test(String(digit))) return;
  if (!currentPlaylist.length) return;

  if (channelInputBuffer.length >= 4) {
    channelInputBuffer = '';
  }

  channelInputBuffer += String(digit);
  showChannelInputOverlay(channelInputBuffer.padStart(4, '0'));

  clearTimeout(channelInputTimer);
  channelInputTimer = setTimeout(() => commitChannelNumberInput(), CHANNEL_INPUT_DELAY_MS);
}

function updatePlayerInfoPanel(channel, streamType = null) {
  const nameEl = document.getElementById('infoChannelName');
  const catEl = document.getElementById('infoChannelCategory');
  const typeEl = document.getElementById('infoChannelType');
  const urlEl = document.getElementById('infoChannelUrl');
  if (!nameEl || !catEl || !typeEl || !urlEl) return;
  if (!channel) return;

  const resolvedType = (streamType || classifyStream(channel.stream_url || '') || 'other').toUpperCase();
  const channelNumber = formatChannelNumber(getChannelViewerNumber(channel, currentPlayingIndex));
  nameEl.textContent = `${channelNumber} | ${channel.name || '-'}`;
  catEl.textContent = channel.group_title || '-';
  typeEl.textContent = resolvedType;
  urlEl.textContent = channel.stream_url || '-';
}

function showPlayerInfoPanel() {
  const panel = document.getElementById('playerInfoPanel');
  if (!panel) return;
  hidePlayerDiagnosticsPanel();
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
    return `<div class="zap-item ${activeClass}">${formatChannelNumber(getChannelViewerNumber(ch, realIdx))}</div>`;
  }).join('');

  const selected = currentPlaylist[selectedIndex];
  channelEl.textContent = `${formatChannelNumber(getChannelViewerNumber(selected, selectedIndex))} | ${selected.name}`;
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

  currentPlaylist = getGlobalPlaylist();
  currentPlayingIndex = currentPlaylist.findIndex(c => c.id === channelId);
  if (currentPlayingIndex < 0) currentPlayingIndex = 0;
  zapPendingIndex = -1;
  clearChannelInputBuffer();
  hideChannelInputOverlay();
  hideZapOverlay(false);
  hidePlayerInfoPanel();

  loadChannel(currentPlaylist[currentPlayingIndex]);
}

async function loadChannel(ch) {
  const overlay = document.getElementById('playerOverlay');
  overlay.classList.add('open');
  ensurePlayerVideoListeners();

  document.getElementById('playerName').textContent = `${formatChannelNumber(getChannelViewerNumber(ch, currentPlayingIndex))} | ${ch.name}`;
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
  applyPreferredVolumeToVideo(video);

  const originalStreamUrl = ch.stream_url;
  const streamType = classifyStream(originalStreamUrl);
  const streamUrl = getPlaybackUrl(originalStreamUrl, streamType);
  const isHLS = streamType === 'hls';
  resetDiagnosticsState(streamType);
  updatePlayerInfoPanel(ch, streamType);
  if (diagPanelVisible) updateDiagnosticsPanel();

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
        
        try { await senza.remotePlayer.setVolume(getPreferredRemoteVolume()); } catch (e) { }

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
  clearChannelInputBuffer();
  hideChannelInputOverlay();
  zapPendingIndex = -1;
  hideZapOverlay(false);
  hidePlayerInfoPanel();
  hidePlayerDiagnosticsPanel();
  document.getElementById('playerOverlay').classList.remove('open');
  const video = document.getElementById('videoEl');
  await cleanupPlayers(video);
  updateFocus();
}

function changeChannel(dir) {
  if (currentPlaylist.length === 0) return;
  clearChannelInputBuffer();
  hideChannelInputOverlay();
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
