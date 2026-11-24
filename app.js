/* ==========================================================================
   Sur les pas des exilés — Sanary-sur-Mer
   Moteur PWA multilingue (FR, UK, DE, NL, ES, IT) :
   - Accueil portraits d'écrivains à disposition aléatoire à chaque ouverture
   - Géolocalisation continue (technologie RandoTracker), carto Leaflet & geofencing
   - Audioguide MP3 multilingue avec fond Peer Gynt
   - Page de fin JLDApps 2026
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'sanary_exiles_state_v2';
  const ARRIVAL_RADIUS_M = 32;
  const WALK_SPEED_MPS = 1.15;
  const AUDIO_VER = 'v15';
  const RETURN_STEP_ID = 99;

  const FLAG_SVGS = {
    fr: '<svg class="flag-svg" viewBox="0 0 36 24"><rect width="12" height="24" fill="#002395"/><rect x="12" width="12" height="24" fill="#fff"/><rect x="24" width="12" height="24" fill="#ED2939"/></svg>',
    en: '<svg class="flag-svg" viewBox="0 0 36 24"><rect width="36" height="24" fill="#012169"/><path d="M0,0 L36,24 M36,0 L0,24" stroke="#fff" stroke-width="4.5"/><path d="M0,0 L36,24 M36,0 L0,24" stroke="#C8102E" stroke-width="2.2"/><path d="M18,0 V24 M0,12 H36" stroke="#fff" stroke-width="7"/><path d="M18,0 V24 M0,12 H36" stroke="#C8102E" stroke-width="4"/></svg>',
    de: '<svg class="flag-svg" viewBox="0 0 36 24"><rect width="36" height="8" fill="#111"/><rect y="8" width="36" height="8" fill="#DD0000"/><rect y="16" width="36" height="8" fill="#FFCE00"/></svg>',
    nl: '<svg class="flag-svg" viewBox="0 0 36 24"><rect width="36" height="8" fill="#AE1C28"/><rect y="8" width="36" height="8" fill="#fff"/><rect y="16" width="36" height="8" fill="#21468B"/></svg>',
    es: '<svg class="flag-svg" viewBox="0 0 36 24"><rect width="36" height="6" fill="#AA151B"/><rect y="6" width="36" height="12" fill="#F1BF00"/><rect y="18" width="36" height="6" fill="#AA151B"/><circle cx="11" cy="12" r="2.6" fill="#AA151B" opacity="0.85"/></svg>',
    it: '<svg class="flag-svg" viewBox="0 0 36 24"><rect width="12" height="24" fill="#009246"/><rect x="12" width="12" height="24" fill="#fff"/><rect x="24" width="12" height="24" fill="#CE2B37"/></svg>',
    pl: '<svg class="flag-svg" viewBox="0 0 36 24"><rect width="36" height="12" fill="#fff"/><rect y="12" width="36" height="12" fill="#DC143C"/></svg>',
    ko: '<svg class="flag-svg" viewBox="0 0 36 24"><rect width="36" height="24" fill="#fff"/><g transform="translate(18,12)"><path d="M-5.5,0 A5.5,5.5 0 0,1 5.5,0 A2.75,2.75 0 0,1 0,0 A2.75,2.75 0 0,0 -5.5,0 Z" fill="#CD2E3A"/><path d="M-5.5,0 A5.5,5.5 0 0,0 5.5,0 A2.75,2.75 0 0,1 0,0 A2.75,2.75 0 0,0 -5.5,0 Z" fill="#0047A0"/></g><g stroke="#111" stroke-width="1.3"><line x1="6" y1="5" x2="10" y2="8"/><line x1="5" y1="6.8" x2="9" y2="9.8"/><line x1="26" y1="8" x2="30" y2="5"/><line x1="27" y1="9.8" x2="31" y2="6.8"/><line x1="6" y1="19" x2="10" y2="16"/><line x1="5" y1="17.2" x2="9" y2="14.2"/><line x1="26" y1="16" x2="30" y2="19"/><line x1="27" y1="14.2" x2="31" y2="17.2"/></g></svg>'
  };

  const LANG_ORDER = ['fr', 'en', 'de', 'nl', 'es', 'it', 'pl', 'ko'];

  const ALL_STEPS = window.PARCOURS_ETAPES || [];
  const SEGMENTS = window.PARCOURS_SEGMENTS || {};
  const UI_DICT = window.I18N_UI || {};
  const STEPS_DICT = window.I18N_STEPS || {};

  // Portraits authentiques des écrivains exilés pour la mosaïque aléatoire d'accueil
  const WRITER_PORTRAITS = [
    { src: 'images/etape-08.jpg', name: 'Thomas Mann' },
    { src: 'images/etape-13.jpg', name: 'Aldous Huxley' },
    { src: 'images/etape-05.jpg', name: 'Stefan Zweig' },
    { src: 'images/etape-11.jpg', name: 'Lion Feuchtwanger' },
    { src: 'images/etape-03.jpg', name: 'Heinrich Mann' },
    { src: 'images/etape-02.jpg', name: 'Friedrich Wolf' },
    { src: 'images/etape-09.jpg', name: 'Bruno Frank' },
    { src: 'images/etape-12.jpg', name: 'René Schickele' }
  ];

  // ---------- État global ----------
  const state = {
    lang: 'fr', // 'fr' | 'en' | 'de' | 'nl' | 'es' | 'it'
    loop: 'full', // 'short' (1..6) | 'full' (1..13)
    currentStepId: 1,
    visitedIds: new Set(),
    notifiedArrivalIds: new Set(),
    mapLayer: 'ign',
    isFollowing: true,
    userPos: null,
    gpsWatchId: null,
    simMode: false,
    wakeLock: null,
    sheetCollapsed: false
  };

  let map = null;
  let tileLayer = null;
  let routeBgLayer = null;
  let routeActiveLayer = null;
  let returnLoopLayer = null;
  let liveGuideLine = null;
  let userMarker = null;
  let userAccuracyCircle = null;
  const stepMarkers = new Map();

  // ---------- Références DOM ----------
  const el = {
    welcomeScreen: document.getElementById('welcome-screen'),
    welcomeWall: document.getElementById('welcome-portraits-wall'),
    welcomeTag: document.getElementById('welcome-tag'),
    welcomeTitle: document.getElementById('welcome-title'),
    welcomeSubtitle: document.getElementById('welcome-subtitle'),
    welcomeIntro: document.getElementById('welcome-intro'),
    welcomeChooseLang: document.getElementById('welcome-choose-lang'),
    btnWelcomeLangTrigger: document.getElementById('btn-welcome-lang-trigger'),
    welcomeLangCurrentFlag: document.getElementById('welcome-lang-current-flag'),
    welcomeLangCurrentName: document.getElementById('welcome-lang-current-name'),
    welcomeLangCurrentCode: document.getElementById('welcome-lang-current-code'),
    langMenuOverlay: document.getElementById('lang-menu-overlay'),
    langMenuTitle: document.getElementById('lang-menu-title'),
    langMenuList: document.getElementById('lang-menu-list'),
    btnCloseLangMenu: document.getElementById('btn-close-lang-menu'),
    welcomeChooseLoop: document.getElementById('welcome-choose-loop'),
    welcomeLoopShort: document.getElementById('welcome-loop-short'),
    welcomeLoopFull: document.getElementById('welcome-loop-full'),
    welcomeLoopShortTitle: document.getElementById('welcome-loop-short-title'),
    welcomeLoopShortDesc: document.getElementById('welcome-loop-short-desc'),
    welcomeLoopFullTitle: document.getElementById('welcome-loop-full-title'),
    welcomeLoopFullDesc: document.getElementById('welcome-loop-full-desc'),
    btnStartWalk: document.getElementById('btn-start-walk'),
    welcomeStartLabel: document.getElementById('welcome-start-label'),

    btnOpenWelcome: document.getElementById('btn-open-welcome'),
    headerTitle: document.getElementById('header-title'),
    headerSubtitle: document.getElementById('header-subtitle'),
    btnHeaderLang: document.getElementById('btn-header-lang'),
    btnLoopShort: document.getElementById('btn-loop-short'),
    btnLoopFull: document.getElementById('btn-loop-full'),
    btnOpenList: document.getElementById('btn-open-list'),
    btnCloseList: document.getElementById('btn-close-list'),
    listModal: document.getElementById('list-modal'),
    listModalTitle: document.getElementById('list-modal-title'),
    stepsListContainer: document.getElementById('steps-list-container'),
    progressSummary: document.getElementById('progress-summary'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    btnResetProgress: document.getElementById('btn-reset-progress'),
    btnOpenEndFromList: document.getElementById('btn-open-end-from-list'),

    guidanceBadge: document.getElementById('guidance-badge'),
    guidanceLabel: document.getElementById('guidance-label'),
    guidanceTitle: document.getElementById('guidance-title'),
    guidanceArrow: document.getElementById('guidance-arrow'),
    guidanceDistance: document.getElementById('guidance-distance'),
    guidanceEta: document.getElementById('guidance-eta'),

    gpsPill: document.getElementById('gps-pill'),
    gpsPillText: document.getElementById('gps-pill-text'),
    arrivalToast: document.getElementById('arrival-toast'),
    arrivalToastTitle: document.getElementById('arrival-toast-title'),
    arrivalToastSub: document.getElementById('arrival-toast-sub'),
    arrivalToastClose: document.getElementById('arrival-toast-close'),

    btnRecenter: document.getElementById('btn-recenter'),
    btnLayer: document.getElementById('btn-layer'),
    layerPopover: document.getElementById('layer-popover'),
    popoverLayerTitle: document.getElementById('popover-layer-title'),
    layerOptIgn: document.getElementById('layer-opt-ign'),
    layerOptOsm: document.getElementById('layer-opt-osm'),
    layerOptEsri: document.getElementById('layer-opt-esri'),
    btnFitRoute: document.getElementById('btn-fit-route'),
    btnSimGps: document.getElementById('btn-sim-gps'),
    fabDemoLabel: document.getElementById('fab-demo-label'),

    stepSheet: document.getElementById('step-sheet'),
    sheetToggleBar: document.getElementById('sheet-toggle-bar'),
    sheetToggleHint: document.getElementById('sheet-toggle-hint'),
    stepSectorPill: document.getElementById('step-sector-pill'),
    stepVisitedPill: document.getElementById('step-visited-pill'),
    stepTitle: document.getElementById('step-title'),
    stepLocation: document.getElementById('step-location'),
    stepImage: document.getElementById('step-image'),
    stepImageCredit: document.getElementById('step-image-credit'),
    btnZoomPhoto: document.getElementById('btn-zoom-photo'),
    stepTags: document.getElementById('step-tags'),
    stepSummary: document.getElementById('step-summary'),
    stepNote: document.getElementById('step-note'),

    audioBox: document.querySelector('.audio-player-box'),
    audio: document.getElementById('audio-element'),
    btnPlay: document.getElementById('btn-audio-play'),
    btnPause: document.getElementById('btn-audio-pause'),
    btnReplay: document.getElementById('btn-audio-replay'),
    btnPauseLabel: document.getElementById('btn-pause-label'),
    btnReplayLabel: document.getElementById('btn-replay-label'),
    audioSeek: document.getElementById('audio-seek'),
    audioCurrentTime: document.getElementById('audio-current-time'),
    audioDuration: document.getElementById('audio-duration'),
    audioStatusLine: document.getElementById('audio-status-line'),

    btnPrevStep: document.getElementById('btn-prev-step'),
    btnNextStep: document.getElementById('btn-next-step'),

    endScreen: document.getElementById('end-screen'),
    endTag: document.getElementById('end-tag'),
    endTitle: document.getElementById('end-title'),
    endText: document.getElementById('end-text'),
    endPortraitsStrip: document.getElementById('end-portraits-strip'),
    endStats: document.getElementById('end-stats'),
    endSignatureSub: document.getElementById('end-signature-sub'),
    spiralStage: document.getElementById('spiral-credits-stage'),
    btnSpiralToggle: document.getElementById('btn-spiral-toggle'),
    btnEndBackMap: document.getElementById('btn-end-back-map'),
    btnEndRestart: document.getElementById('btn-end-restart'),

    photoLightbox: document.getElementById('photo-lightbox'),
    btnCloseLightbox: document.getElementById('btn-close-lightbox'),
    lightboxImg: document.getElementById('lightbox-img'),
    lightboxCaption: document.getElementById('lightbox-caption')
  };

  // ---------- Helpers I18N ----------
  function t(key, vars = {}) {
    const dict = UI_DICT[state.lang] || UI_DICT.fr || {};
    let str = dict[key] || (UI_DICT.fr && UI_DICT.fr[key]) || key;
    Object.keys(vars).forEach((k) => {
      str = str.replace(`{${k}}`, String(vars[k]));
    });
    return str;
  }

  function getLocalizedStep(step) {
    if (!step) return null;
    if (state.lang === 'fr') return step;
    const tr = STEPS_DICT[state.lang] && STEPS_DICT[state.lang][step.id];
    if (!tr) return step;
    return {
      ...step,
      secteurNom: tr.secteurNom || step.secteurNom,
      titre: tr.titre || step.titre,
      lieu: tr.lieu || step.lieu,
      resume: tr.resume || step.resume,
      notePratique: tr.notePratique || step.notePratique
    };
  }

  function getAudioUrlForStep(step) {
    const num = String(step.id).padStart(2, '0');
    if (state.lang === 'fr') {
      return `audio/etape-${num}.mp3?${AUDIO_VER}`;
    }
    return `audio/${state.lang}/etape-${num}.mp3?${AUDIO_VER}`;
  }

  // ---------- Mosaïque aléatoire de portraits à chaque ouverture ----------
  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function renderWelcomePortraits() {
    if (!el.welcomeWall) return;
    const layouts = ['', 'layout-b', 'layout-c'];
    const chosenLayout = layouts[Math.floor(Math.random() * layouts.length)];
    el.welcomeWall.className = `welcome-portraits-wall ${chosenLayout}`.trim();

    // 8 portraits uniques (aucun doublon), mélangés et inclinés aléatoirement à chaque ouverture
    const tiles = shuffleArray(WRITER_PORTRAITS);

    el.welcomeWall.innerHTML = '';
    tiles.forEach((p) => {
      const rot = (Math.random() * 14 - 7).toFixed(1);
      const tx = Math.round(Math.random() * 24 - 12);
      const ty = Math.round(Math.random() * 28 - 14);
      const sc = (0.94 + Math.random() * 0.1).toFixed(2);
      const fig = document.createElement('div');
      fig.className = 'portrait-tile';
      fig.style.setProperty('--rot', `${rot}deg`);
      fig.style.setProperty('--tx', `${tx}px`);
      fig.style.setProperty('--ty', `${ty}px`);
      fig.style.setProperty('--sc', sc);
      fig.innerHTML = `
        <img src="${p.src}" alt="${p.name}" loading="eager" />
        <span class="portrait-tile-caption">${p.name}</span>
      `;
      el.welcomeWall.appendChild(fig);
    });
  }

  function applyLanguageToUI() {
    document.documentElement.lang = state.lang;
    document.title = `${t('appTitle')} — Sanary-sur-Mer`;

    // Page d'accueil
    el.welcomeTag.textContent = t('welcomeTag');
    el.welcomeTitle.textContent = t('appTitle');
    el.welcomeSubtitle.textContent = t('appSubtitle');
    el.welcomeIntro.textContent = t('welcomeIntro');
    el.welcomeChooseLang.textContent = t('chooseLang');
    el.welcomeChooseLoop.textContent = t('chooseLoop');
    el.welcomeLoopShortTitle.textContent = t('loopShortTitle');
    el.welcomeLoopShortDesc.textContent = t('loopShortDesc');
    el.welcomeLoopFullTitle.textContent = t('loopFullTitle');
    el.welcomeLoopFullDesc.textContent = t('loopFullDesc');
    el.welcomeStartLabel.textContent = t('startBtn');

    // Met à jour la capsule moderne de langue (accueil + en-tête)
    const curFlagSvg = FLAG_SVGS[state.lang] || FLAG_SVGS.fr;
    const curLangName = (UI_DICT[state.lang] && UI_DICT[state.lang].langName) || 'Français';
    const curLangLabel = (UI_DICT[state.lang] && UI_DICT[state.lang].label) || 'FR';
    if (el.welcomeLangCurrentFlag) el.welcomeLangCurrentFlag.innerHTML = curFlagSvg;
    if (el.welcomeLangCurrentName) el.welcomeLangCurrentName.textContent = curLangName;
    if (el.welcomeLangCurrentCode) el.welcomeLangCurrentCode.textContent = curLangLabel;
    if (el.langMenuTitle) el.langMenuTitle.textContent = t('chooseLang');

    // En-tête
    el.headerTitle.textContent = t('appTitle');
    el.headerSubtitle.textContent = t('appSubtitle');
    el.btnOpenWelcome.title = t('homeTooltip');
    document.querySelectorAll('.btn-home-any').forEach((b) => {
      b.title = t('homeTooltip');
    });
    if (el.btnHeaderLang) {
      el.btnHeaderLang.innerHTML = `<span class="lang-circle-flag">${curFlagSvg}</span>`;
    }
    el.btnLoopShort.textContent = t('shortBtn');
    el.btnLoopFull.textContent = t('fullBtn');

    // Carte & contrôles
    el.fabDemoLabel.textContent = t('demoLabel');
    el.arrivalToastSub.textContent = t('arrivalSub');
    el.popoverLayerTitle.textContent = t('mapLayerTitle');
    el.layerOptIgn.textContent = t('layerIgn');
    el.layerOptOsm.textContent = t('layerOsm');
    el.layerOptEsri.textContent = t('layerEsri');

    // Fiche & audio
    el.sheetToggleHint.textContent = state.sheetCollapsed ? t('showSheet') : t('hideSheet');
    el.stepVisitedPill.textContent = t('visited');
    el.btnPauseLabel.textContent = t('pause');
    el.btnReplayLabel.textContent = t('replay');
    el.btnPrevStep.textContent = t('prevStep');

    // Liste
    el.listModalTitle.textContent = t('listTitle');
    el.btnResetProgress.textContent = t('resetProgress');

    // Page de fin JLDApps 2026
    el.endTag.textContent = t('endTag');
    el.endTitle.textContent = t('endTitle');
    el.endText.textContent = t('endText');
    el.endSignatureSub.textContent = t('endSignatureSub');
    el.btnEndBackMap.textContent = t('endBackMap');
    el.btnEndRestart.textContent = t('endRestart');
  }

  function setLanguage(langCode) {
    if (!UI_DICT[langCode]) return;
    state.lang = langCode;
    saveState();
    applyLanguageToUI();
    // Recharge l'étape active (texte + audio dans la nouvelle langue)
    selectStep(state.currentStepId, { openSheet: false, panToStep: false });
  }

  function openLangMenu() {
    if (!el.langMenuList) return;
    el.langMenuList.innerHTML = '';
    LANG_ORDER.forEach((code) => {
      const d = UI_DICT[code];
      if (!d) return;
      const isAct = code === state.lang;
      const btn = document.createElement('button');
      btn.className = `lang-menu-option${isAct ? ' active' : ''}`;
      btn.dataset.lang = code;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(isAct));
      btn.innerHTML = `
        <span class="lang-circle-flag">${FLAG_SVGS[code]}</span>
        <span class="lang-menu-option-text">
          <span class="lang-menu-option-name">${d.langName}</span>
          <span class="lang-menu-option-code">${d.label} • MP3</span>
        </span>
        ${isAct ? '<span class="lang-menu-check">✓</span>' : ''}
      `;
      btn.addEventListener('click', () => {
        setLanguage(code);
        el.langMenuOverlay.classList.add('hidden');
      });
      el.langMenuList.appendChild(btn);
    });
    el.langMenuOverlay.classList.remove('hidden');
  }

  // ---------- Helpers Parcours en boucle & Géodésie ----------
  function getReturnStep() {
    const start = ALL_STEPS[0];
    const isShort = state.loop === 'short';
    return {
      id: RETURN_STEP_ID,
      isReturn: true,
      secteur: isShort ? 1 : 3,
      secteurNom: t('returnTitle'),
      boucleCourte: true,
      titre: t('returnTitle'),
      lieu: isShort ? t('returnShortLieu') : t('returnFullLieu'),
      lat: start.lat,
      lon: start.lon,
      audio: null,
      image: 'images/etape-01.jpg',
      imageCredit: 'Port de Sanary-sur-Mer — Office de Tourisme',
      personnalites: [],
      resume: isShort ? t('returnShortResume') : t('returnFullResume'),
      notePratique: t('returnNote')
    };
  }

  function getActiveSteps() {
    const base = state.loop === 'short' ? ALL_STEPS.filter((s) => s.boucleCourte) : ALL_STEPS;
    return [...base, getReturnStep()];
  }

  function getStepById(id) {
    if (id === RETURN_STEP_ID) return getReturnStep();
    return ALL_STEPS.find((s) => s.id === id) || ALL_STEPS[0];
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function computeBearing(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function formatDistance(meters) {
    if (meters == null || Number.isNaN(meters)) return '-- m';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
  }

  function formatEta(meters) {
    if (meters == null || Number.isNaN(meters)) return 'GPS…';
    if (meters <= ARRIVAL_RADIUS_M) return t('onSite');
    const mins = Math.max(1, Math.round(meters / WALK_SPEED_MPS / 60));
    return `~${mins} min`;
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          lang: state.lang,
          loop: state.loop,
          currentStepId: state.currentStepId,
          visitedIds: Array.from(state.visitedIds),
          mapLayer: state.mapLayer
        })
      );
    } catch (_) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.lang && UI_DICT[saved.lang]) state.lang = saved.lang;
      if (saved.loop === 'short' || saved.loop === 'full') state.loop = saved.loop;
      if (Number.isInteger(saved.currentStepId) && saved.currentStepId !== RETURN_STEP_ID) {
        state.currentStepId = saved.currentStepId;
      } else {
        state.currentStepId = 1;
      }
      if (Array.isArray(saved.visitedIds)) state.visitedIds = new Set(saved.visitedIds);
      if (['ign', 'osm', 'esri'].includes(saved.mapLayer)) state.mapLayer = saved.mapLayer;
    } catch (_) {}
  }

  // ---------- Cartographie Leaflet (technologie RandoTracker) ----------
  const TILE_CONFIGS = {
    ign: {
      url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
      attribution: '© IGN France — Géoplateforme',
      maxZoom: 19
    },
    osm: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    },
    esri: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri World Imagery',
      maxZoom: 19
    }
  };

  function initMap() {
    const start = ALL_STEPS[0];
    map = L.map('map', {
      center: [start.lat, start.lon],
      zoom: 16,
      zoomControl: false,
      preferCanvas: true
    });

    setMapLayer(state.mapLayer);

    map.on('dragstart', () => {
      if (state.isFollowing) {
        state.isFollowing = false;
        updateRecenterButton();
      }
    });

    map.on('click', () => {
      el.layerPopover.classList.add('hidden');
    });

    renderRouteAndMarkers();
  }

  function setMapLayer(layerKey) {
    state.mapLayer = layerKey;
    const cfg = TILE_CONFIGS[layerKey] || TILE_CONFIGS.ign;
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      crossOrigin: true
    }).addTo(map);

    document.querySelectorAll('.layer-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.layer === layerKey);
    });
    saveState();
  }

  function renderRouteAndMarkers() {
    const storySteps = getActiveSteps().filter((s) => !s.isReturn);
    const maxId = storySteps[storySteps.length - 1].id;

    if (routeBgLayer) map.removeLayer(routeBgLayer);
    if (routeActiveLayer) map.removeLayer(routeActiveLayer);
    if (returnLoopLayer) map.removeLayer(returnLoopLayer);
    stepMarkers.forEach((m) => map.removeLayer(m));
    stepMarkers.clear();

    const allCoords = [];
    for (let i = 1; i < maxId; i++) {
      const seg = SEGMENTS[`${i}-${i + 1}`];
      if (seg && seg.coords) allCoords.push(seg.coords);
    }
    routeBgLayer = L.polyline(allCoords, {
      color: '#1a4b6e',
      weight: 4.5,
      opacity: 0.72,
      lineJoin: 'round'
    }).addTo(map);

    // Segment de retour en boucle vers le point de départ (Office de Tourisme)
    const retKey = state.loop === 'short' ? '6-1' : '13-1';
    if (SEGMENTS[retKey] && SEGMENTS[retKey].coords) {
      returnLoopLayer = L.polyline(SEGMENTS[retKey].coords, {
        color: '#3b7a57',
        weight: 4,
        opacity: 0.82,
        dashArray: '8 7'
      }).addTo(map);
    }

    storySteps.forEach((step) => {
      const marker = L.marker([step.lat, step.lon], {
        icon: createStepIcon(step.id),
        zIndexOffset: step.id === state.currentStepId ? 500 : 100
      }).addTo(map);

      marker.on('click', () => {
        selectStep(step.id, { openSheet: true, panToStep: true });
      });

      stepMarkers.set(step.id, marker);
    });

    highlightActiveSegment();
  }

  function createStepIcon(stepId) {
    const isCurrent = stepId === state.currentStepId || (stepId === 1 && state.currentStepId === RETURN_STEP_ID);
    const isVisited = state.visitedIds.has(stepId);
    const cls = ['step-marker-pin'];
    if (isVisited) cls.push('is-visited');
    if (isCurrent) cls.push('is-current');
    const size = isCurrent ? 38 : 32;
    const label =
      stepId === 1 && state.currentStepId === RETURN_STEP_ID
        ? '↺'
        : isVisited && !isCurrent
        ? '✓'
        : String(stepId);

    return L.divIcon({
      className: '',
      html: `<div class="${cls.join(' ')}">${label}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function refreshAllMarkerIcons() {
    stepMarkers.forEach((marker, id) => {
      marker.setIcon(createStepIcon(id));
      marker.setZIndexOffset(id === state.currentStepId ? 500 : 100);
    });
  }

  function highlightActiveSegment() {
    if (routeActiveLayer) {
      map.removeLayer(routeActiveLayer);
      routeActiveLayer = null;
    }
    const storySteps = getActiveSteps().filter((s) => !s.isReturn);
    const maxId = storySteps[storySteps.length - 1].id;
    let segKey = null;

    if (state.currentStepId === RETURN_STEP_ID) {
      segKey = state.loop === 'short' ? '6-1' : '13-1';
    } else if (state.currentStepId > 1) {
      segKey = `${state.currentStepId - 1}-${state.currentStepId}`;
    } else if (maxId >= 2) {
      segKey = '1-2';
    }

    if (segKey && SEGMENTS[segKey] && SEGMENTS[segKey].coords) {
      routeActiveLayer = L.polyline(SEGMENTS[segKey].coords, {
        color: state.currentStepId === RETURN_STEP_ID ? '#3b7a57' : '#b85d3b',
        weight: 6,
        opacity: 0.95,
        lineJoin: 'round'
      }).addTo(map);
    }
  }

  function fitMapToRoute() {
    const steps = getActiveSteps();
    const bounds = L.latLngBounds(steps.map((s) => [s.lat, s.lon]));
    if (state.userPos) bounds.extend([state.userPos.lat, state.userPos.lon]);
    state.isFollowing = false;
    updateRecenterButton();
    map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });
  }

  // ---------- Moteur GPS Continu (technologie RandoTracker) ----------
  function startGpsWatch() {
    if (!('geolocation' in navigator)) {
      setGpsStatus('gps-err', t('gpsUnavailable'));
      return;
    }

    setGpsStatus('', t('gpsSearching'));

    state.gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (state.simMode) return;
        onNewPosition(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy || 15,
          pos.coords.heading
        );
        setGpsStatus('gps-ok', `${t('gpsActive')} (±${Math.round(pos.coords.accuracy || 10)} m)`);
      },
      (err) => {
        if (state.simMode) return;
        const msg = err.code === 1 ? t('gpsAllow') : t('gpsWeak');
        setGpsStatus('gps-err', msg);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000
      }
    );
  }

  function setGpsStatus(cls, text) {
    el.gpsPill.className = `gps-pill ${cls}`.trim();
    el.gpsPillText.textContent = text;
  }

  function onNewPosition(lat, lon, accuracy = 12, heading = null) {
    state.userPos = { lat, lon, accuracy, heading };

    if (!userMarker) {
      userAccuracyCircle = L.circle([lat, lon], {
        radius: Math.min(accuracy, 80),
        color: '#1d70b8',
        fillColor: '#1d70b8',
        fillOpacity: 0.12,
        weight: 1
      }).addTo(map);

      userMarker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: '',
          html: '<div class="user-gps-marker"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        }),
        zIndexOffset: 900
      }).addTo(map);
    } else {
      userMarker.setLatLng([lat, lon]);
      userAccuracyCircle.setLatLng([lat, lon]);
      userAccuracyCircle.setRadius(Math.min(accuracy, 80));
    }

    if (state.isFollowing) {
      map.panTo([lat, lon], { animate: true, duration: 0.5 });
    }

    updateLiveGuidance();
    checkProximityGeofencing();
  }

  function updateLiveGuidance() {
    const rawTarget = getStepById(state.currentStepId);
    const target = getLocalizedStep(rawTarget);
    const badgeLabel = target.isReturn ? '↺' : String(target.id);
    el.guidanceBadge.textContent = badgeLabel;
    el.guidanceTitle.textContent = target.titre;

    if (!state.userPos) {
      el.guidanceLabel.textContent = target.isReturn
        ? t('returnTitle')
        : `${t('selectedStep')} ${target.id}`;
      el.guidanceLabel.classList.remove('arrived');
      el.guidanceBadge.classList.remove('arrived');
      el.guidanceDistance.textContent = '-- m';
      el.guidanceEta.textContent = t('waitingGps');
      return;
    }

    const dist = haversineMeters(state.userPos.lat, state.userPos.lon, target.lat, target.lon);
    const bearing = computeBearing(state.userPos.lat, state.userPos.lon, target.lat, target.lon);

    el.guidanceArrow.style.transform = `rotate(${Math.round(bearing)}deg)`;
    el.guidanceDistance.textContent = formatDistance(dist);
    el.guidanceEta.textContent = formatEta(dist);

    const arrived = dist <= ARRIVAL_RADIUS_M;
    el.guidanceBadge.classList.toggle('arrived', arrived);
    el.guidanceLabel.classList.toggle('arrived', arrived);
    if (target.isReturn) {
      el.guidanceLabel.textContent = arrived ? `${t('returnTitle')} ✓` : t('returnTitle');
    } else {
      el.guidanceLabel.textContent = arrived
        ? `${t('youAreAt')} ${target.id} !`
        : `${t('capTowards')} ${target.id}`;
    }

    if (liveGuideLine) {
      map.removeLayer(liveGuideLine);
      liveGuideLine = null;
    }
    if (!arrived) {
      liveGuideLine = L.polyline(
        [
          [state.userPos.lat, state.userPos.lon],
          [target.lat, target.lon]
        ],
        {
          color: '#b85d3b',
          weight: 2.5,
          opacity: 0.65,
          dashArray: '5 8'
        }
      ).addTo(map);
    }
  }

  function checkProximityGeofencing() {
    if (!state.userPos) return;
    const steps = getActiveSteps();
    const target = getStepById(state.currentStepId);
    const distTarget = haversineMeters(state.userPos.lat, state.userPos.lon, target.lat, target.lon);

    if (distTarget <= ARRIVAL_RADIUS_M && !state.notifiedArrivalIds.has(target.id)) {
      triggerArrival(getLocalizedStep(target));
      return;
    }

    for (const s of steps) {
      if (s.id === target.id || state.notifiedArrivalIds.has(s.id)) continue;
      const d = haversineMeters(state.userPos.lat, state.userPos.lon, s.lat, s.lon);
      if (d <= ARRIVAL_RADIUS_M) {
        selectStep(s.id, { openSheet: true, panToStep: false });
        triggerArrival(getLocalizedStep(s));
        break;
      }
    }
  }

  function triggerArrival(step) {
    state.notifiedArrivalIds.add(step.id);
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([120, 60, 120]);
      } catch (_) {}
    }
    setSheetCollapsed(false);
    el.arrivalToastTitle.textContent = `${t('arrivalTitle')} ${step.id} — ${step.titre}`;
    el.arrivalToastSub.textContent = t('arrivalSub');
    el.arrivalToast.classList.remove('hidden');
  }

  function updateRecenterButton() {
    el.btnRecenter.classList.toggle('is-following', state.isFollowing);
  }

  function toggleSimMode() {
    if (!state.simMode) {
      state.simMode = true;
      el.btnSimGps.classList.add('active');
      const current = getStepById(state.currentStepId);
      setGpsStatus('gps-sim', `${t('demoPos')} ${current.id}`);
      state.isFollowing = true;
      updateRecenterButton();
      state.notifiedArrivalIds.delete(current.id);
      onNewPosition(current.lat, current.lon, 8, 0);
    } else {
      state.simMode = false;
      el.btnSimGps.classList.remove('active');
      setGpsStatus('', t('gpsBack'));
    }
  }

  // ---------- Sélection & affichage d'une étape ----------
  function selectStep(stepId, opts = {}) {
    const steps = getActiveSteps();
    const exists = steps.some((s) => s.id === stepId);
    const rawTarget = exists ? getStepById(stepId) : steps[0];
    const target = getLocalizedStep(rawTarget);

    state.currentStepId = target.id;
    saveState();

    if (target.isReturn) {
      el.audio.pause();
      if (el.audioBox) el.audioBox.classList.add('hidden');
    } else {
      if (el.audioBox) el.audioBox.classList.remove('hidden');
      loadAudioForStep(target);
    }

    const storyCount = steps.filter((s) => !s.isReturn).length;
    const idx = steps.findIndex((s) => s.id === target.id) + 1;
    el.stepSectorPill.textContent = target.isReturn
      ? `↺ ${t('returnTitle')}`
      : `${t('sectorWord')} ${target.secteur} • ${t('stepWord')} ${idx} / ${storyCount}`;
    el.stepVisitedPill.classList.toggle('hidden', !state.visitedIds.has(target.id));
    el.stepTitle.textContent = target.titre;
    el.stepLocation.textContent = `📍 ${target.lieu}`;

    el.stepImage.src = target.image;
    el.stepImage.alt = target.titre;
    el.stepImageCredit.textContent = target.imageCredit || target.lieu;

    el.stepTags.innerHTML = '';
    (target.personnalites || []).forEach((p) => {
      const span = document.createElement('span');
      span.className = 'person-tag';
      span.textContent = p;
      el.stepTags.appendChild(span);
    });

    el.stepSummary.textContent = target.resume;
    el.stepNote.textContent = target.notePratique || '';

    el.btnPrevStep.disabled = idx <= 1;
    if (target.isReturn) {
      el.btnNextStep.textContent = t('finishWalk');
    } else if (steps[idx] && steps[idx].isReturn) {
      el.btnNextStep.textContent = t('returnBtn');
    } else {
      el.btnNextStep.textContent = t('nextStep', { n: steps[idx].id });
    }

    refreshAllMarkerIcons();
    highlightActiveSegment();
    updateLiveGuidance();
    renderStepsList();

    if (opts.openSheet) {
      setSheetCollapsed(false);
    }
    if (opts.panToStep && map) {
      state.isFollowing = false;
      updateRecenterButton();
      map.panTo([target.lat, target.lon], { animate: true });
    }
    if (state.simMode) {
      setGpsStatus('gps-sim', `${t('demoPos')} ${target.id}`);
      state.notifiedArrivalIds.delete(target.id);
      onNewPosition(target.lat, target.lon, 8, 0);
    }
  }

  function markStepVisited(stepId) {
    if (!state.visitedIds.has(stepId)) {
      state.visitedIds.add(stepId);
      saveState();
      refreshAllMarkerIcons();
      renderStepsList();
      if (state.currentStepId === stepId) {
        el.stepVisitedPill.classList.remove('hidden');
      }
    }
  }

  // ---------- Lecteur Audio MP3 multilingue ----------
  function loadAudioForStep(step) {
    el.audio.pause();
    el.audio.src = getAudioUrlForStep(step);
    el.audio.load();
    el.audioSeek.value = 0;
    el.audioCurrentTime.textContent = '0:00';
    el.audioDuration.textContent = '--:--';
    el.btnPlay.classList.remove('is-playing');
    el.btnPlay.querySelector('.btn-play-label').textContent = t('listen');
    el.btnPause.disabled = true;
    el.audioStatusLine.textContent = t('audioIdle');
  }

  function playAudio() {
    el.arrivalToast.classList.add('hidden');
    const p = el.audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        el.audioStatusLine.textContent = t('audioError');
      });
    }
  }

  function pauseAudio() {
    el.audio.pause();
  }

  function replayAudio() {
    el.audio.currentTime = 0;
    playAudio();
  }

  function initAudioEvents() {
    el.btnPlay.addEventListener('click', playAudio);
    el.btnPause.addEventListener('click', pauseAudio);
    el.btnReplay.addEventListener('click', replayAudio);

    el.audio.addEventListener('loadedmetadata', () => {
      el.audioDuration.textContent = formatTime(el.audio.duration);
    });

    el.audio.addEventListener('play', () => {
      el.btnPlay.classList.add('is-playing');
      el.btnPlay.querySelector('.btn-play-label').textContent = t('playing');
      el.btnPause.disabled = false;
      el.audioStatusLine.textContent = t('audioPlaying', { n: state.currentStepId });
    });

    el.audio.addEventListener('pause', () => {
      el.btnPlay.classList.remove('is-playing');
      el.btnPlay.querySelector('.btn-play-label').textContent = t('resume');
      el.btnPause.disabled = true;
      if (!el.audio.ended && el.audio.currentTime > 0) {
        el.audioStatusLine.textContent = t('audioPaused');
      }
    });

    el.audio.addEventListener('timeupdate', () => {
      if (!Number.isFinite(el.audio.duration) || el.audio.duration <= 0) return;
      const pct = (el.audio.currentTime / el.audio.duration) * 100;
      el.audioSeek.value = pct;
      el.audioCurrentTime.textContent = formatTime(el.audio.currentTime);
      if (pct >= 60) {
        markStepVisited(state.currentStepId);
      }
    });

    el.audio.addEventListener('ended', () => {
      markStepVisited(state.currentStepId);
      el.btnPlay.classList.remove('is-playing');
      el.btnPlay.querySelector('.btn-play-label').textContent = t('listen');
      el.btnPause.disabled = true;
      el.audioStatusLine.textContent = t('audioEnded');
    });

    el.audioSeek.addEventListener('input', () => {
      if (Number.isFinite(el.audio.duration) && el.audio.duration > 0) {
        el.audio.currentTime = (Number(el.audioSeek.value) / 100) * el.audio.duration;
      }
    });
  }

  // ---------- Liste des étapes & progression ----------
  function renderStepsList() {
    const steps = getActiveSteps();
    const storySteps = steps.filter((s) => !s.isReturn);
    const visitedCount = storySteps.filter((s) => state.visitedIds.has(s.id)).length;
    el.progressSummary.textContent = t('visitedSummary', { v: visitedCount, t: storySteps.length });
    el.progressBarFill.style.width = `${Math.round((visitedCount / storySteps.length) * 100)}%`;

    el.stepsListContainer.innerHTML = '';
    let lastSector = null;

    steps.forEach((rawStep) => {
      const step = getLocalizedStep(rawStep);
      const secKey = step.isReturn ? 'return' : step.secteur;
      if (secKey !== lastSector) {
        lastSector = secKey;
        const h = document.createElement('div');
        h.className = 'list-sector-heading';
        h.textContent = step.secteurNom;
        el.stepsListContainer.appendChild(h);
      }

      const btn = document.createElement('button');
      const isVisited = state.visitedIds.has(step.id);
      const isActive = step.id === state.currentStepId;
      btn.className = `step-list-item${isVisited ? ' is-visited' : ''}${isActive ? ' is-active' : ''}`;
      const numLabel = step.isReturn ? '↺' : isVisited && !isActive ? '✓' : step.id;
      btn.innerHTML = `
        <span class="step-list-num">${numLabel}</span>
        <div class="step-list-info">
          <div class="step-list-title">${step.titre}</div>
          <div class="step-list-sub">${step.lieu}</div>
        </div>
      `;
      btn.addEventListener('click', () => {
        el.listModal.classList.add('hidden');
        selectStep(step.id, { openSheet: true, panToStep: true });
      });
      el.stepsListContainer.appendChild(btn);
    });
  }

  // ---------- Génrique de fin 3D : ruban de texte sans boîtes sur cylindre vertical ----------
  const CYLINDER_SEGMENTS = [
    { text: '✦ JLDApps 2026 — SUR LES PAS DES EXILÉS • SANARY-SUR-MER (1933–1940)   ', accent: true },
    { text: 'SOURCES DES TEXTES : ', accent: true },
    { text: 'Synthèses historiques originales d’après les archives publiques et le parcours mémoriel de Sanary-sur-Mer (sans droits tiers)   •   ', accent: false },
    { text: 'MUSIQUE (DOMAINE PUBLIC / CC0) : ', accent: true },
    { text: 'Edvard Grieg (1843–1907), Peer Gynt Suite n° 1 Op. 46 (Au matin, Danse d’Anitra, La Mort d’Åse) — Musopen & Wikimedia Commons   •   ', accent: false },
    { text: 'PHOTOS DOMAINE PUBLIC : ', accent: true },
    { text: 'Wikimedia Commons — Friedrich Wolf (1926), Heinrich Mann, Stefan Zweig, Joseph Garibaldi (Port de Sanary), Thomas Mann (1929), Bruno Frank, Franz Hessel (1922), Lion Feuchtwanger, Aldous Huxley (1947)   •   ', accent: false },
    { text: 'PHOTOS LICENCE LIBRE : ', accent: true },
    { text: 'Port de Sanary (CC BY-SA 3.0), Walter Bondy (CC BY-SA 4.0), Le Moulin Gris (CC BY-SA 3.0), René Schickele (Licence Ouverte)   •   ', accent: false },
    { text: 'CARTOGRAPHIE & GPS : ', accent: true },
    { text: 'IGN France Géoplateforme, OpenStreetMap, Esri World Imagery • Technologie RandoTracker   •   ', accent: false }
  ];

  let spiralRafId = null;
  let spiralPaused = false;
  let spiralPhase = 0;
  let spiralLastTs = 0;
  let spiralGlyphs = [];

  function initSpiralCredits() {
    if (!el.spiralStage) return;
    stopSpiralCredits();
    el.spiralStage.innerHTML = '';
    spiralGlyphs = [];
    spiralPaused = false;
    spiralPhase = 0;
    spiralLastTs = 0;
    if (el.btnSpiralToggle) el.btnSpiralToggle.textContent = '⏸';

    const frag = document.createDocumentFragment();
    CYLINDER_SEGMENTS.forEach((seg) => {
      for (const ch of seg.text) {
        const span = document.createElement('span');
        span.className = `cyl-glyph${seg.accent ? ' is-accent' : ''}`;
        span.textContent = ch;
        frag.appendChild(span);
        spiralGlyphs.push({ node: span, accent: seg.accent });
      }
    });
    el.spiralStage.appendChild(frag);
    spiralRafId = requestAnimationFrame(tickSpiralCredits);
  }

  function tickSpiralCredits(ts) {
    if (!spiralLastTs) spiralLastTs = ts;
    const dt = Math.min(0.05, (ts - spiralLastTs) / 1000);
    spiralLastTs = ts;

    if (!spiralPaused) {
      spiralPhase += dt * 4.2; // Vitesse douce et très lisible (~4,2 caractères / seconde)
    }

    const n = spiralGlyphs.length;
    if (!n) return;

    const stageW = el.spiralStage.clientWidth || 440;
    const radius = Math.max(115, Math.min(168, stageW * 0.34));
    const degPerChar = 5.4; // ~67 caractères par tour complet de 360°
    const turnPitchY = 44; // Écart vertical entre deux spires (px)
    const yPerChar = turnPitchY / (360 / degPerChar);
    const totalH = n * yPerChar;
    const halfH = totalH / 2;

    for (let i = 0; i < n; i++) {
      const g = spiralGlyphs[i];
      // Position relative en caractères autour de la spirale en boucle infinie
      let rel = ((i - spiralPhase) % n + n) % n;
      if (rel > n / 2) rel -= n;

      const y = rel * yPerChar;
      if (Math.abs(y) > 152) {
        if (g.node.style.display !== 'none') g.node.style.display = 'none';
        continue;
      }
      if (g.node.style.display === 'none') g.node.style.display = '';

      const angleDeg = rel * degPerChar;
      const angleRad = (angleDeg * Math.PI) / 180;
      const cosA = Math.cos(angleRad); // +1 devant, -1 derrière (texte vu à l'envers)
      const isBack = cosA < 0;

      // Éclairage diminué à l'arrière-plan du cylindre, lumineux devant
      const edgeFade = Math.max(0, 1 - Math.abs(y) / 148);
      const light = isBack
        ? 0.16 + 0.16 * (cosA + 1) // 0.16 à 0.32 à l'arrière (texte à l'envers assombri)
        : 0.42 + 0.58 * cosA; // 0.42 sur les bords -> 1.00 plein face

      g.node.classList.toggle('is-back', isBack);
      g.node.style.opacity = (edgeFade * light).toFixed(3);
      // Enroulement authentique autour du cylindre vertical (backface-visibility: visible => texte à l'envers derrière)
      g.node.style.transform = `translate3d(0px, ${y.toFixed(1)}px, 0px) rotateY(${angleDeg.toFixed(1)}deg) translateZ(${radius.toFixed(1)}px)`;
    }

    spiralRafId = requestAnimationFrame(tickSpiralCredits);
  }

  function stopSpiralCredits() {
    if (spiralRafId) {
      cancelAnimationFrame(spiralRafId);
      spiralRafId = null;
    }
  }

  // ---------- Page de fin : JLDApps 2026 ----------
  function openEndScreen() {
    el.audio.pause();
    const storySteps = getActiveSteps().filter((s) => !s.isReturn);
    const visitedCount = storySteps.filter((s) => state.visitedIds.has(s.id)).length;
    el.endStats.textContent = t('endStats', { v: visitedCount, t: storySteps.length });

    // Bandeau aléatoire de 6 portraits d'écrivains
    el.endPortraitsStrip.innerHTML = '';
    shuffleArray(WRITER_PORTRAITS)
      .slice(0, 6)
      .forEach((p) => {
        const img = document.createElement('img');
        img.src = p.src;
        img.alt = p.name;
        img.className = 'end-portrait-mini';
        el.endPortraitsStrip.appendChild(img);
      });

    el.endScreen.classList.remove('hidden');
    initSpiralCredits();
  }

  function openWelcomeScreen() {
    el.audio.pause();
    stopSpiralCredits();
    el.endScreen.classList.add('hidden');
    el.listModal.classList.add('hidden');
    el.photoLightbox.classList.add('hidden');
    renderWelcomePortraits(); // Nouvelle disposition aléatoire à chaque ouverture !
    el.welcomeScreen.classList.remove('hidden');
  }

  function setSheetCollapsed(collapsed) {
    state.sheetCollapsed = collapsed;
    el.stepSheet.classList.toggle('collapsed', collapsed);
    el.sheetToggleHint.textContent = collapsed ? t('showSheet') : t('hideSheet');
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
    } catch (_) {}
  }

  // ---------- Événements UI ----------
  function initUIEvents() {
    function setLoop(loopType, fit = true) {
      state.loop = loopType;
      el.btnLoopShort.classList.toggle('active', loopType === 'short');
      el.btnLoopFull.classList.toggle('active', loopType === 'full');
      el.welcomeLoopShort.classList.toggle('active', loopType === 'short');
      el.welcomeLoopFull.classList.toggle('active', loopType === 'full');
      const steps = getActiveSteps();
      if (!steps.some((s) => s.id === state.currentStepId)) {
        state.currentStepId = steps[0].id;
      }
      if (map) {
        renderRouteAndMarkers();
        selectStep(state.currentStepId, { openSheet: false, panToStep: false });
        if (fit) fitMapToRoute();
      }
      saveState();
    }

    // Menu moderne de langue (depuis la page d'accueil ET depuis l'en-tête de la carte)
    if (el.btnWelcomeLangTrigger) {
      el.btnWelcomeLangTrigger.addEventListener('click', openLangMenu);
    }
    if (el.btnCloseLangMenu) {
      el.btnCloseLangMenu.addEventListener('click', () => el.langMenuOverlay.classList.add('hidden'));
    }
    if (el.langMenuOverlay) {
      el.langMenuOverlay.addEventListener('click', (e) => {
        if (e.target === el.langMenuOverlay) el.langMenuOverlay.classList.add('hidden');
      });
    }

    // Boucle sur l'écran d'accueil & dans l'en-tête
    el.welcomeLoopShort.addEventListener('click', () => setLoop('short', false));
    el.welcomeLoopFull.addEventListener('click', () => setLoop('full', false));
    el.btnLoopShort.addEventListener('click', () => setLoop('short', true));
    el.btnLoopFull.addEventListener('click', () => setLoop('full', true));

    // Démarrer depuis la page d'accueil
    el.btnStartWalk.addEventListener('click', () => {
      el.welcomeScreen.classList.add('hidden');
      if (state.currentStepId === RETURN_STEP_ID) {
        selectStep(1, { openSheet: true, panToStep: false });
      }
      if (map) {
        setTimeout(() => {
          map.invalidateSize();
          const cur = getStepById(state.currentStepId);
          map.setView([cur.lat, cur.lon], 16, { animate: true });
        }, 80);
      }
    });

    // Retour à l'accueil depuis l'en-tête, la liste, la fin et la lightbox (tous les boutons Home)
    el.btnOpenWelcome.addEventListener('click', openWelcomeScreen);
    el.btnHeaderLang.addEventListener('click', openLangMenu);
    document.querySelectorAll('.btn-home-any').forEach((btn) => {
      btn.addEventListener('click', openWelcomeScreen);
    });

    // Page de fin JLDApps 2026 & génrique 3D
    el.btnEndBackMap.addEventListener('click', () => {
      stopSpiralCredits();
      el.endScreen.classList.add('hidden');
    });
    el.btnEndRestart.addEventListener('click', openWelcomeScreen);
    if (el.btnSpiralToggle) {
      el.btnSpiralToggle.addEventListener('click', () => {
        spiralPaused = !spiralPaused;
        el.btnSpiralToggle.textContent = spiralPaused ? '▶' : '⏸';
      });
    }
    el.btnOpenEndFromList.addEventListener('click', () => {
      el.listModal.classList.add('hidden');
      openEndScreen();
    });

    // Tiroir fiche étape
    el.sheetToggleBar.addEventListener('click', () => {
      setSheetCollapsed(!state.sheetCollapsed);
    });

    // Précédente / Suivante / Fin
    el.btnPrevStep.addEventListener('click', () => {
      const steps = getActiveSteps();
      const idx = steps.findIndex((s) => s.id === state.currentStepId);
      if (idx > 0) {
        selectStep(steps[idx - 1].id, { openSheet: true, panToStep: true });
      }
    });

    el.btnNextStep.addEventListener('click', () => {
      markStepVisited(state.currentStepId);
      const steps = getActiveSteps();
      const idx = steps.findIndex((s) => s.id === state.currentStepId);
      if (idx < steps.length - 1) {
        selectStep(steps[idx + 1].id, { openSheet: true, panToStep: true });
      } else {
        openEndScreen();
      }
    });

    // FABs carte
    el.btnRecenter.addEventListener('click', () => {
      state.isFollowing = true;
      updateRecenterButton();
      if (state.userPos) {
        map.setView([state.userPos.lat, state.userPos.lon], Math.max(map.getZoom(), 16), { animate: true });
      } else {
        const cur = getStepById(state.currentStepId);
        map.setView([cur.lat, cur.lon], 16, { animate: true });
      }
    });

    el.btnLayer.addEventListener('click', (e) => {
      e.stopPropagation();
      el.layerPopover.classList.toggle('hidden');
    });

    document.querySelectorAll('.layer-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        setMapLayer(btn.dataset.layer);
        el.layerPopover.classList.add('hidden');
      });
    });

    el.btnFitRoute.addEventListener('click', fitMapToRoute);
    el.btnSimGps.addEventListener('click', toggleSimMode);
    el.arrivalToastClose.addEventListener('click', () => el.arrivalToast.classList.add('hidden'));

    // Modale liste
    el.btnOpenList.addEventListener('click', () => {
      renderStepsList();
      el.listModal.classList.remove('hidden');
    });
    el.btnCloseList.addEventListener('click', () => el.listModal.classList.add('hidden'));
    el.listModal.addEventListener('click', (e) => {
      if (e.target === el.listModal) el.listModal.classList.add('hidden');
    });
    el.btnResetProgress.addEventListener('click', () => {
      state.visitedIds.clear();
      state.notifiedArrivalIds.clear();
      saveState();
      selectStep(1, { openSheet: true, panToStep: true });
      el.listModal.classList.add('hidden');
    });

    // Lightbox photo plein écran
    function openLightbox() {
      const step = getLocalizedStep(getStepById(state.currentStepId));
      el.lightboxImg.src = step.image;
      el.lightboxImg.alt = step.titre;
      el.lightboxCaption.textContent = `${step.titre} — ${step.imageCredit || ''}`;
      el.photoLightbox.classList.remove('hidden');
    }
    el.btnZoomPhoto.addEventListener('click', openLightbox);
    el.stepImage.addEventListener('click', openLightbox);
    el.btnCloseLightbox.addEventListener('click', () => el.photoLightbox.classList.add('hidden'));
    el.photoLightbox.addEventListener('click', (e) => {
      if (e.target === el.photoLightbox) el.photoLightbox.classList.add('hidden');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal) {
      // En prévisualisation locale, désactive tout ancien SW pour éviter les décalages de cache CSS/JS
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      }).catch(() => {});
      return;
    }
    if (location.protocol === 'https:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  function boot() {
    loadState();
    renderWelcomePortraits(); // Disposition aléatoire des portraits dès l'ouverture
    applyLanguageToUI();

    el.btnLoopShort.classList.toggle('active', state.loop === 'short');
    el.btnLoopFull.classList.toggle('active', state.loop === 'full');
    el.welcomeLoopShort.classList.toggle('active', state.loop === 'short');
    el.welcomeLoopFull.classList.toggle('active', state.loop === 'full');

    initMap();
    initAudioEvents();
    initUIEvents();
    selectStep(state.currentStepId, { openSheet: true, panToStep: false });
    startGpsWatch();
    requestWakeLock();
    registerServiceWorker();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
