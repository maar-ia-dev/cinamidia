import * as senza from "senza-sdk";
import Stopwatch from "./stopwatch.js";

let options = {
  "url": getParam("url", "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd"),
  "licenseServer": getParam("licenseServer", null),
  "autoBackground": getParam("autoBackground", "true") == "true",
  "timeout": Number(getParam("timeout", 15)),
  "autoSuspend": getParam("autoSuspend", "false") == "true",
  "suspendTimeout": Number(getParam("suspendTimeout", 60)),
  "maxHeight": Number(getParam("maxHeight", 1080)),
  "time": Number(getParam("time", 0)),
  "audio": getParam("audio", null),
  "text": getParam("text", null),
}

let player;
let stopwatch;

window.addEventListener("load", async () => {
  try {
    await senza.init();

    stopwatch = new Stopwatch();

    let remoteTime = senza.remotePlayer.currentTime;

    player = new senza.ShakaPlayer();
    player.configure(playerConfig());
    await player.attach(video);
    await player.load(options.url);
    await video.play();

    if (remoteTime) {
      video.currentTime = remoteTime;
    } else if (options.time) {
      video.currentTime = options.time;
    }

    senza.lifecycle.configure(lifecycleConfig());
    senza.lifecycle.addEventListener("onstatechange", updateBanner);
    senza.remotePlayer.addEventListener("tracksupdate", updateTracks);

    senza.uiReady();
  } catch (error) {
    console.error(error);
  }
});

document.addEventListener("keydown", async function (event) {
  switch (event.key) {
    case "Enter": await toggleBackground(); break;
    case "Escape": await playPause(); break;
    case "ArrowLeft": await skip(-30); break;
    case "ArrowRight": await skip(30); break;
    case "ArrowUp": break;
    case "ArrowDown": break;
    default: return;
  }
  event.preventDefault();
});

async function toggleBackground() {
  if (senza.lifecycle.state == senza.lifecycle.UiState.BACKGROUND) {
    await senza.lifecycle.moveToForeground();
  } else {
    await senza.lifecycle.moveToBackground();
  }
}

async function playPause() {
  if (video.paused) {
    await video.play();
  } else {
    await video.pause();
  }
}

async function skip(seconds) {
  await moveToForegroundIfNeeded();
  video.currentTime = video.currentTime + seconds;
}

async function moveToForegroundIfNeeded() {
  if (senza.lifecycle.state == senza.lifecycle.UiState.BACKGROUND) {
    await senza.lifecycle.moveToForeground();
  }  
}

function updateBanner() {
  console.log("onstatechange", senza.lifecycle.state);
  banner.style.opacity = senza.lifecycle.state === senza.lifecycle.UiState.IN_TRANSITION_TO_BACKGROUND ? 0.5 : 0.9;
}

function getParam(name, defaultValue = null) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has(name) ? urlParams.get(name) : defaultValue;
}

function updateTracks() {
  if (options.audio) player.selectAudioLanguage(options.audio);
  if (options.text) player.selectTextLanguage(options.text);
  if (options.text) banner.style.opacity = 0;
  player.setTextTrackVisibility(options.text != null);
}

function lifecycleConfig() {
  return {
    autoBackground: {
      enabled: options.autoBackground,
      timeout: {playing: options.timeout, idle: options.timeout}
    },
    autoSuspend: {
      enabled: options.autoSuspend,
      timeout: {playing: options.suspendTimeout, idle: options.suspendTimeout}
    }
  };
}

function playerConfig() {
  let config = {abr: {restrictions: {maxHeight: options.maxHeight}}};
  if (options.licenseServer) {
    config.drm = {servers: {"com.widevine.alpha": options.licenseServer}};
  }
  return config;
}

