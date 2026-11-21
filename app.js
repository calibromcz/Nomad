/**
 * app.js — Nomad (00 Work Indie Suite)
 * Principal Front-End Architect & Product Designer
 * 100% Airplane-Mode First, Local-First, Liquid Glass Emerald/Forest Cupertino PWA
 */

import {
  getDB,
  getAllFromStore,
  getById,
  putToStore,
  deleteFromStore,
  clearStore,
  processAndStoreFile,
  compressImageToWebP,
  ensureStoragePersistence,
  DEFAULT_PACKING_TEMPLATES,
  getDemoTrip,
  DEFAULT_SURVIVAL_PHRASES
} from './db.js?v=33';

import * as fflate from 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';

/* ==========================================================================
   STATO GLOBALE DELL'APPLICAZIONE
   ========================================================================== */
const state = {
  currentTripId: localStorage.getItem('nomad_active_trip_id') || null,
  activeTrip: null,
  allTrips: [],
  walletFiles: [],
  activeTab: 'dashboard',         // 'dashboard' | 'trip' | 'wallet' | 'expenses' | 'profile'
  currentDayIndex: 0,
  tripSubView: 'plan',            // 'plan' | 'map'
  activeWalletFilter: 'Tutti',    // 'Tutti' | 'flight' | 'hotel' | 'train' | 'event' | 'documents' | 'other'
  walletSubView: 'docs',          // 'docs' | 'vault'
  vaultUnlocked: false,
  privacyCodesHidden: true,
  budgetHidden: localStorage.getItem('nomad_budget_hidden') === 'true',
  wakeLockSentinel: null,
  currentGateDocBlobUrl: null,
  homeCurrency: localStorage.getItem('nomad_home_currency') || 'EUR',
  homeTimeZone: localStorage.getItem('nomad_home_timezone') || 'Europe/Rome',
  theme: localStorage.getItem('nomad_theme') || 'dark',

  // Stato Mappa & Bussola Radar Offline
  leafletMap: null,
  dashLeafletMap: null,
  dashMapMarkersGroup: null,
  userLocationMarker: null,
  mapMarkersGroup: null,
  guidanceLine: null,
  userCoords: null,
  guidanceTarget: null,
  deviceAlphaHeading: 0,
  watchPositionId: null,

  // Timer Countdown Live Dashboard
  liveCountdownInterval: null,
  dashConvInverted: false,
  activeGateFileRecord: null,

  // Stato Calcolatrice iOS
  calcCurrentVal: '0',
  calcPrevVal: null,
  calcOperator: null,
  calcWaitNext: false
};

/* ==========================================================================
   INIZIALIZZAZIONE & SERVICE WORKER
   ========================================================================== */
window.addEventListener('DOMContentLoaded', async () => {
  // Pre-render immediato della Dashboard per azzerare qualsiasi ritardo asincrono
  try {
    renderDashboard();
  } catch (e) {
    console.warn('Pre-render dashboard warning:', e);
  }
  await initAppSafely();
  try {
    renderDashboard();
  } catch (e) {
    console.error('Post-init renderDashboard error:', e);
  }
});

export async function init() {
  return await initAppSafely();
}

async function initAppSafely() {
  try {
    initTheme();
  } catch (e) {
    console.error('Init Theme error:', e);
  }

  try {
    setupServiceWorker();
  } catch (e) {
    console.warn('Init ServiceWorker error:', e);
  }

  try {
    ensureStoragePersistence();
  } catch (e) {
    console.warn('Storage persistence error:', e);
  }

  try {
    setupNavigation();
  } catch (e) {
    console.error('Navigation setup error:', e);
  }

  try {
    setupEventListeners();
  } catch (e) {
    console.error('Event listeners setup error:', e);
  }

  try {
    setupNetworkStatusMonitor();
  } catch (e) {
    console.warn('Network status monitor error:', e);
  }

  try {
    setupCompassListener();
  } catch (e) {
    console.warn('Compass listener error:', e);
  }

  try {
    loadVoices();
  } catch (e) {
    console.warn('SpeechSynthesis loadVoices error:', e);
  }

  // 1. Inizializzazione DB protetta con fallback immediato a dati demo
  try {
    await initializeDatabaseData();
  } catch (e) {
    console.error('Database data initialization error, applying demo fallback in memory:', e);
    if (!state.activeTrip) {
      state.activeTrip = (typeof getDemoTrip === "function" ? getDemoTrip() : null) || DEFAULT_DEMO_TRIP;
      state.currentTripId = state.activeTrip.id;
    }
  }

  // 2. Refresh & rendering garantito della Dashboard
  try {
    await refreshApplicationData();
  } catch (e) {
    console.error('Application data refresh error, forcing fallback dashboard render:', e);
    if (!state.activeTrip) {
      state.activeTrip = (typeof getDemoTrip === "function" ? getDemoTrip() : null) || DEFAULT_DEMO_TRIP;
    }
  }

  // Chiamata esplicita garantita a renderDashboard per sicurezza assoluta
  try {
    if (state.activeTab === 'dashboard') {
      renderDashboard();
    }
  } catch (e) {
    console.error('Explicit renderDashboard error:', e);
  }

  try {
    setInterval(updateLiveClocks, 1000);
  } catch (e) {}

  // Sincronizzazione opportunistica tasso di cambio all'avvio e al ritorno online
  try {
    opportunisticRateSync(false);
    window.addEventListener('online', () => {
      opportunisticRateSync(false);
    });
  } catch (e) {}
}

function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const iconSun = document.getElementById('themeIconSun');
  if (!iconSun) return;
  if (state.theme === 'dark') {
    iconSun.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
  } else {
    iconSun.innerHTML = `
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    `;
  }
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('nomad_theme', state.theme);
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();
  showToast(state.theme === 'dark' ? 'Tema Scuro (Verde/Nero)' : 'Tema Chiaro (Smeraldo)');
}

function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('Nomad ServiceWorker registrato (scope: ' + reg.scope + ')');
      }).catch((err) => {
        console.warn('Errore ServiceWorker:', err);
      });
    } else {
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
      if ('caches' in window) {
        caches.keys().then((keys) => {
          for (const key of keys) {
            if (key.startsWith('nomad-static-') || key.startsWith('nomad-v')) {
              caches.delete(key);
            }
          }
        });
      }
    }
  }
}

function setupNetworkStatusMonitor() {
  const badge = document.getElementById('networkStatusBadge');
  const dot = document.getElementById('networkDot');
  const text = document.getElementById('networkText');

  const update = () => {
    const isOnline = navigator.onLine;
    if (dot && text) {
      if (isOnline) {
        dot.classList.remove('offline');
        text.textContent = 'Online';
      } else {
        dot.classList.add('offline');
        text.textContent = 'Offline';
      }
    }
  };

  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

/* ==========================================================================
   RECUPERO LIVE TASSO DI CAMBIO & SINCRONIZZAZIONE OPPORTUNISTICA
   ========================================================================== */
function roundExchangeRate(rate) {
  if (rate < 1) return parseFloat(rate.toFixed(4));
  if (rate >= 10) return parseFloat(rate.toFixed(2));
  return parseFloat(rate.toFixed(3));
}

async function fetchLiveExchangeRate(fromCurrency, toCurrency) {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return 1;
  if (!navigator.onLine) throw new Error('Dispositivo offline');

  // Primario: open.er-api.com
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && data.rates[to]) return roundExchangeRate(data.rates[to]);
    }
  } catch (err) {
    console.warn('Endpoint primario fallito o timeout:', err.message);
  }

  // Fallback: jsdelivr currency-api
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const fromL = from.toLowerCase();
    const toL = to.toLowerCase();
    const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${fromL}.json`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && data[fromL] && data[fromL][toL]) return roundExchangeRate(data[fromL][toL]);
    }
  } catch (fallbackErr) {
    console.warn('Endpoint fallback fallito:', fallbackErr.message);
  }

  throw new Error('Impossibile recuperare il tasso aggiornato');
}

async function opportunisticRateSync(force = false) {
  if (!state.activeTrip) return;
  const trip = state.activeTrip;
  const from = state.homeCurrency;
  const to = trip.destCurrency || from;
  if (from === to) return;

  const now = Date.now();
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  const isExpired = !trip.rateUpdatedAt || (now - trip.rateUpdatedAt > twelveHoursMs);
  const isManual = trip.rateSource === 'manual';

  if (!force && (isManual || !isExpired)) return;
  if (!navigator.onLine && !force) return;

  try {
    const newRate = await fetchLiveExchangeRate(from, to);
    trip.exchangeRate = newRate;
    trip.rateUpdatedAt = Date.now();
    trip.rateSource = 'auto';

    await putToStore('trips_store', trip);
    if (state.activeTab === 'expenses' || state.activeTab === 'dashboard') {
      renderActiveTab();
    }
    if (force) showToast(`Tasso aggiornato: 1 ${from} = ${newRate} ${to}`);
  } catch (e) {
    if (force) showToast("Offline: mantengo l'ultimo tasso salvato");
  }
}

function formatRateMeta(trip) {
  const isOnline = navigator.onLine;
  const source = trip.rateSource || 'auto';
  const updatedAt = trip.rateUpdatedAt;

  if (source === 'manual') return 'Tasso manuale';
  if (!updatedAt) return isOnline ? 'Tasso stimato' : 'Tasso salvato · Offline';

  const d = new Date(updatedAt);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return `Aggiornato oggi, ${timeStr}${!isOnline ? ' · Offline' : ''}`;
  } else {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `Ultimo sync: ${day}/${month}${!isOnline ? ' · Offline' : ''}`;
  }
}

function formatRateMetaShort(trip) {
  const source = trip.rateSource || 'auto';
  const updatedAt = trip.rateUpdatedAt;
  if (source === 'manual') return 'Manuale';
  if (!updatedAt) return 'Stimato';

  const d = new Date(updatedAt);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return `Oggi ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  }
}

/* ==========================================================================
   POPOLAMENTO DATI & SEEDING DEMO AL PRIMO AVVIO
   ========================================================================== */
async function initializeDatabaseData() {
  const trips = await getAllFromStore('trips_store');
  const templates = await getAllFromStore('templates_store');

  if (!templates || templates.length === 0) {
    for (const t of DEFAULT_PACKING_TEMPLATES) {
      await putToStore('templates_store', t);
    }
  }

  // Se nessun viaggio presente o viaggio corrotto/incompleto, forza subito il viaggio demo completo
  const isValidTrip = (t) => t && t.id && t.name && t.destination && t.startDate && Array.isArray(t.packingList) && t.packingList.length > 0 && Array.isArray(t.expenses) && t.expenses.length > 0;

  if (!trips || trips.length === 0 || !trips.some(isValidTrip)) {
    const demoTrip = getDemoTrip();
    await putToStore('trips_store', demoTrip);
    state.currentTripId = demoTrip.id;
    state.activeTrip = demoTrip;
    localStorage.setItem('nomad_active_trip_id', demoTrip.id);
    await createDemoWalletPass(demoTrip.id);
  } else {
    if (!state.currentTripId || !trips.some(t => t.id === state.currentTripId && isValidTrip(t))) {
      const validTrip = trips.find(isValidTrip) || trips[0];
      state.currentTripId = validTrip.id;
      localStorage.setItem('nomad_active_trip_id', state.currentTripId);
    }
  }
}

async function createDemoWalletPass(tripId) {
  const svgPass = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100" viewBox="0 0 800 1100" style="background:#ffffff; font-family:-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;">
      <defs>
        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#15803D"/>
          <stop offset="100%" stop-color="#34D399"/>
        </linearGradient>
      </defs>
      <rect width="800" height="220" fill="url(#headerGrad)"/>
      <text x="50" y="90" fill="#ffffff" font-size="34" font-weight="800" letter-spacing="2">AIR FRANCE</text>
      <text x="50" y="140" fill="#ffffff" font-size="22" font-weight="500" opacity="0.9">BOARDING PASS • VOLO AF 116</text>
      <rect x="620" y="60" width="130" height="100" rx="16" fill="rgba(255,255,255,0.2)"/>
      <text x="685" y="105" fill="#ffffff" font-size="16" text-anchor="middle" font-weight="600">ZONE</text>
      <text x="685" y="145" fill="#ffffff" font-size="36" text-anchor="middle" font-weight="800">2</text>
      
      <g transform="translate(50, 290)">
        <text x="0" y="0" fill="#888888" font-size="16" font-weight="700">FROM</text>
        <text x="0" y="55" fill="#000000" font-size="54" font-weight="800">CDG</text>
        <text x="0" y="90" fill="#444444" font-size="20">PARIS CHARLES DE GAULLE</text>
        
        <text x="450" y="0" fill="#888888" font-size="16" font-weight="700">TO</text>
        <text x="450" y="55" fill="#000000" font-size="54" font-weight="800">PVG</text>
        <text x="450" y="90" fill="#444444" font-size="20">SHANGHAI PUDONG</text>
      </g>
      
      <line x1="50" y1="430" x2="750" y2="430" stroke="#e0e0e0" stroke-width="2" stroke-dasharray="8 8"/>
      
      <g transform="translate(50, 490)">
        <text x="0" y="0" fill="#888888" font-size="16" font-weight="700">PASSEGGERO</text>
        <text x="0" y="32" fill="#000000" font-size="26" font-weight="700">ROSSI / MARCO MR</text>

        <text x="350" y="0" fill="#888888" font-size="16" font-weight="700">PNR</text>
        <text x="350" y="32" fill="#000000" font-size="26" font-weight="700">K89X4P</text>

        <text x="560" y="0" fill="#888888" font-size="16" font-weight="700">POSTO</text>
        <text x="560" y="38" fill="#15803D" font-size="36" font-weight="800">14A</text>
      </g>

      <g transform="translate(50, 600)">
        <text x="0" y="0" fill="#888888" font-size="16" font-weight="700">GATE</text>
        <text x="0" y="38" fill="#000000" font-size="36" font-weight="800">K43</text>

        <text x="350" y="0" fill="#888888" font-size="16" font-weight="700">IMBARCO</text>
        <text x="350" y="38" fill="#000000" font-size="36" font-weight="800">22:45</text>
      </g>

      <g transform="translate(200, 720)">
        <rect width="400" height="240" fill="#f8f8f8" rx="20" stroke="#eeeeee" stroke-width="2"/>
        <text x="200" y="60" text-anchor="middle" font-size="14" fill="#666666" font-weight="600">SCANSIONA AL GATE (AZZT8910)</text>
        <rect x="130" y="90" width="140" height="110" fill="#222222" rx="8"/>
        <rect x="150" y="110" width="100" height="70" fill="#ffffff" rx="4"/>
        <rect x="170" y="125" width="60" height="40" fill="#222222"/>
      </g>
      <text x="400" y="1030" text-anchor="middle" font-size="14" fill="#999999">Nomad 00 Work • 100% Offline Gate Mode Compatible</text>
    </svg>
  `;

  const blob = new Blob([svgPass], { type: 'image/svg+xml' });
  const fileRecord = {
    id: 'pass_demo_af116',
    name: 'Carta Imbarco AF116.svg',
    type: 'image/svg+xml',
    size: blob.size,
    lastModified: Date.now(),
    tripId: tripId,
    category: 'flight',
    title: 'Carta d\'Imbarco AF116 (Parigi → Shanghai)',
    notes: 'Gate K43 • Posto 14A • Terminal 2E',
    isPinned: true, // Pinnato di default per popolare subito il widget in Dashboard
    blob: blob
  };
  await putToStore('files_store', fileRecord);
}

/* ==========================================================================
   REFRESH STATO & RENDERING PRINCIPALE
   ========================================================================== */
async function refreshApplicationData() {
  state.allTrips = await getAllFromStore('trips_store');
  
  if (state.allTrips && state.allTrips.length > 0) {
    if (!state.currentTripId || !state.allTrips.some(t => t.id === state.currentTripId)) {
      state.currentTripId = state.allTrips[0].id;
      localStorage.setItem('nomad_active_trip_id', state.currentTripId);
    }
    state.activeTrip = state.allTrips.find(t => t.id === state.currentTripId) || state.allTrips[0];
  } else {
    // Se non ci sono viaggi, applica e salva subito il viaggio demo completo
    const demoTrip = getDemoTrip();
    state.allTrips = [demoTrip];
    state.currentTripId = demoTrip.id;
    state.activeTrip = demoTrip;
    localStorage.setItem('nomad_active_trip_id', demoTrip.id);
    await putToStore('trips_store', demoTrip);
    await createDemoWalletPass(demoTrip.id);
  }

  const topBarName = document.getElementById('topBarTripName');
  if (topBarName) {
    topBarName.textContent = state.activeTrip ? state.activeTrip.name : 'Nessun Viaggio';
  }

  const allFiles = await getAllFromStore('files_store');
  state.walletFiles = state.activeTrip ? allFiles.filter(f => f.tripId === state.activeTrip.id) : [];

  // Se non ci sono pass nel wallet per il viaggio attivo, genera il pass dimostrativo pinnato
  if (state.walletFiles.length === 0 && state.activeTrip) {
    await createDemoWalletPass(state.activeTrip.id);
    const updatedFiles = await getAllFromStore('files_store');
    state.walletFiles = updatedFiles.filter(f => f.tripId === state.activeTrip.id);
  }

  // Mappa retrocompatibile vecchie categorie wallet
  state.walletFiles.forEach(f => {
    if (f.category === 'Voli/Treni' || f.category === 'transport') f.category = 'flight';
    if (f.category === 'Alloggi') f.category = 'accommodation';
    if (f.category === 'Documenti') f.category = 'documents';
  });

  // Aggiorna badge e indicatori delle 5 Utility Icon nella Top Bar
  updateTopBarUtilityBadges();

  renderActiveTab();
}

/**
 * Aggiorna i badge delle 5 utility icon nella Top Bar:
 * - Mappa offline: pallino verde se ci sono tasselli in 'nomad-map-tiles-v1', grigio se vuoto
 * - Notifiche: badge numerico con le tappe di oggi
 */
async function updateTopBarUtilityBadges() {
  // 1. Badge Mappa Offline
  const mapDot = document.getElementById('topMapStatusDot');
  if (mapDot && 'caches' in window) {
    try {
      const tileCache = await caches.open('nomad-map-tiles-v1');
      const keys = await tileCache.keys();
      if (keys.length > 0) {
        mapDot.classList.add('active');
        mapDot.title = `${keys.length} tasselli scaricati offline`;
      } else {
        mapDot.classList.remove('active');
        mapDot.title = 'Nessun tassello offline';
      }
    } catch (e) {
      mapDot.classList.remove('active');
    }
  }

  // 2. Badge Notifiche Tappe del Giorno
  const planBadge = document.getElementById('topPlanBadgeCount');
  if (planBadge && state.activeTrip) {
    const todayEvents = getTodayTripEvents();
    if (todayEvents.length > 0) {
      planBadge.textContent = todayEvents.length;
      planBadge.classList.remove('hidden');
    } else {
      planBadge.textContent = '0';
      planBadge.classList.add('hidden');
    }
  }
}

function getTodayTripEvents() {
  if (!state.activeTrip || !state.activeTrip.itineraryDays) return [];
  const todayStr = new Date().toISOString().split('T')[0];
  const todayDay = state.activeTrip.itineraryDays.find(d => d.date === todayStr);

  if (todayDay && todayDay.events && todayDay.events.length > 0) {
    return todayDay.events;
  }
  // Se il viaggio è futuro o non c'è oggi, prendi il primo giorno come anteprima
  if (state.activeTrip.itineraryDays.length > 0 && state.activeTrip.itineraryDays[0].events) {
    return state.activeTrip.itineraryDays[0].events;
  }
  return [];
}

function populateDayPlanNotificationSheet() {
  const container = document.getElementById('dayPlanEventsContainer');
  const titleEl = document.getElementById('dayPlanSheetTitle');
  if (!container || !state.activeTrip) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const isOngoing = state.activeTrip.startDate <= todayStr && state.activeTrip.endDate >= todayStr;
  
  if (titleEl) {
    titleEl.textContent = isOngoing ? 'Tappe di Oggi' : `Tappe: ${state.activeTrip.itineraryDays[0]?.title || 'Giorno 1'}`;
  }

  const events = getTodayTripEvents();
  if (events.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px; color:var(--text-secondary); font-size:13.5px;">
        Nessuna tappa in programma per questa giornata.
      </div>
    `;
    return;
  }

  let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
  events.forEach(ev => {
    html += `
      <div class="glass-card" style="padding:12px 14px; margin-bottom:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span class="tabular-nums" style="font-size:13px; font-weight:800; color:var(--accent);">${escapeHTML(ev.time)}</span>
          <span class="category-tag">${escapeHTML(ev.category || 'Tappa')}</span>
        </div>
        <div style="font-size:14.5px; font-weight:700; color:var(--text-primary); margin-bottom:2px;">
          ${escapeHTML(ev.title)}
        </div>
        ${ev.notes ? `<div style="font-size:12px; color:var(--text-secondary);">${escapeHTML(ev.notes)}</div>` : ''}
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

/* ==========================================================================
   CALCOLATRICE DA VIAGGIO IN STILE iOS
   ========================================================================== */
function resetCalculator() {
  state.calcCurrentVal = '0';
  state.calcPrevVal = null;
  state.calcOperator = null;
  state.calcWaitNext = false;
  updateCalcDisplay();
}

function updateCalcDisplay() {
  const d = document.getElementById('calcDisplay');
  if (d) d.textContent = state.calcCurrentVal;
}

function setupCalculatorKeypad() {
  const keypad = document.querySelector('.calc-keypad');
  if (!keypad) return;

  keypad.addEventListener('click', (e) => {
    const btn = e.target.closest('.calc-btn');
    if (!btn) return;
    const val = btn.getAttribute('data-calc');
    handleCalcButton(val);
  });
}

function handleCalcButton(key) {
  if (key >= '0' && key <= '9') {
    if (state.calcWaitNext || state.calcCurrentVal === '0') {
      state.calcCurrentVal = key;
      state.calcWaitNext = false;
    } else {
      if (state.calcCurrentVal.length < 10) {
        state.calcCurrentVal += key;
      }
    }
    updateCalcDisplay();
    return;
  }

  if (key === ',') {
    if (state.calcWaitNext) {
      state.calcCurrentVal = '0,';
      state.calcWaitNext = false;
    } else if (!state.calcCurrentVal.includes(',')) {
      state.calcCurrentVal += ',';
    }
    updateCalcDisplay();
    return;
  }

  if (key === 'C') {
    resetCalculator();
    return;
  }

  if (key === '+/-') {
    if (state.calcCurrentVal !== '0') {
      state.calcCurrentVal = state.calcCurrentVal.startsWith('-')
        ? state.calcCurrentVal.slice(1)
        : '-' + state.calcCurrentVal;
      updateCalcDisplay();
    }
    return;
  }

  if (key === '%') {
    const num = parseFloat(state.calcCurrentVal.replace(',', '.')) / 100;
    state.calcCurrentVal = String(num).replace('.', ',');
    updateCalcDisplay();
    return;
  }

  if (['+', '-', '*', '/'].includes(key)) {
    const currentNum = parseFloat(state.calcCurrentVal.replace(',', '.'));
    if (state.calcOperator && !state.calcWaitNext) {
      const prevNum = state.calcPrevVal;
      const res = executeCalcOp(prevNum, currentNum, state.calcOperator);
      state.calcCurrentVal = String(res).replace('.', ',');
      state.calcPrevVal = res;
      updateCalcDisplay();
    } else {
      state.calcPrevVal = currentNum;
    }
    state.calcOperator = key;
    state.calcWaitNext = true;
    return;
  }

  if (key === '=') {
    if (state.calcOperator && state.calcPrevVal !== null) {
      const currentNum = parseFloat(state.calcCurrentVal.replace(',', '.'));
      const res = executeCalcOp(state.calcPrevVal, currentNum, state.calcOperator);
      state.calcCurrentVal = String(Number(res.toFixed(6))).replace('.', ',');
      state.calcPrevVal = null;
      state.calcOperator = null;
      state.calcWaitNext = true;
      updateCalcDisplay();
    }
  }
}

function executeCalcOp(a, b, op) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b !== 0 ? a / b : 0;
    default: return b;
  }
}

export function renderDashboard() {
  renderTabDashboard();
}

function renderActiveTab() {
  if (!state.activeTrip && state.activeTab !== 'profile') {
    state.activeTrip = getDemoTrip();
    state.currentTripId = state.activeTrip.id;
  }

  switch (state.activeTab) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'trip':
      renderTabTrip();
      break;
    case 'wallet':
      renderTabWallet();
      break;
    case 'expenses':
      renderTabExpenses();
      break;
    case 'profile':
      renderTabProfile();
      break;
  }
}

function renderEmptyState() {
  const container = document.getElementById('dashboardTabContent');
  if (container) {
    container.innerHTML = `
      <div class="glass-card" style="text-align:center; padding: 40px 20px;">
        <h3 style="font-size:20px; font-weight:700; margin-bottom:8px;">Nessun Viaggio Selezionato</h3>
        <p style="color:var(--text-secondary); font-size:14px; margin-bottom:20px;">Crea il tuo prossimo viaggio per sbloccare la Dashboard, l'itinerario e la mappa tattica offline.</p>
        <button id="btnEmptyCreateTrip" class="btn-glass-pill accent">Crea Nuovo Viaggio</button>
      </div>
    `;
    document.getElementById('btnEmptyCreateTrip')?.addEventListener('click', () => {
      openSheet('sheetEditTrip');
    });
  }
}

/* ==========================================================================
   TAB 1: DASHBOARD (Ricostruita da Capo — 6 Widget Ordinati)
   1. Banner "In Arrivo" Compatto + Countdown Live (GG : HH : MM : SS)
   2. Card Valigia & Checklist
   3. Widget Budget (Stile Flow) + Mini-Splitwise ("Dividi Conto")
   4. Widget Convertitore Valute Live (Con Tendine Eleganti)
   5. Widget Documenti Pinnati (dal Wallet)
   6. Widget Mappa Offline Integrata
   ========================================================================== */

export const DEFAULT_DEMO_TRIP = {
  id: 'trip_shanghai_yiwu',
  name: 'Shanghai & Yiwu Express',
  destination: 'Shanghai, Cina',
  startDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  endDate: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  status: 'active',
  homeCurrency: 'EUR',
  destCurrency: 'CNY',
  exchangeRate: 7.82,
  rateUpdatedAt: Date.now() - (2 * 60 * 60 * 1000),
  rateSource: 'auto',
  homeTimeZone: 'Europe/Rome',
  destTimeZone: 'Asia/Shanghai',
  accommodation: {
    name: 'The PuLi Hotel & Spa',
    nameLocal: '璞丽酒店 (静安区常德路1号)',
    address: "1 Changde Rd, Jing'an District, Shanghai",
    addressLocal: '上海市静安区常德路1号（近延安中路）',
    checkIn: '14:00',
    checkOut: '12:00',
    phone: '+86 21 3203 9999',
    lat: 31.2235,
    lng: 121.4475
  },
  codes: {
    pnr: 'AF116-K89X4P',
    lockbox: 'A-7492#',
    wifi: 'PuLi_Guest / SilkRoad2026',
    insurance: 'Allianz Global Care — Polizza #IT-948190',
    emergencyPhone: '+39 02 2660 9999'
  },
  preTripChecklist: [
    { id: 'pt_1', text: 'Scaricare mappe offline Shanghai (Amap / Organic Maps)', checked: true },
    { id: 'pt_2', text: 'Configurare Alipay / WeChat Pay con carta Revolut', checked: true },
    { id: 'pt_3', text: 'Attivare eSIM dati Roaming Asia', checked: false },
    { id: 'pt_4', text: 'Caricare powerbank e cavi da viaggio', checked: false },
    { id: 'pt_5', text: 'Verificare validità passaporto (>6 mesi)', checked: true }
  ],
  packingList: [
    { id: 'pk_1', category: 'Documenti', text: 'Passaporto originale con visto Cinese', checked: true },
    { id: 'pk_2', category: 'Documenti', text: 'Modulo sbarco / Arrival Card compilato', checked: false },
    { id: 'pk_3', category: 'Tech', text: 'Adattatore spina tipo A/I per prese cinesi', checked: true },
    { id: 'pk_4', category: 'Tech', text: 'Powerbank Anker 20.000 mAh (con scritta Wh visibile per controlli)', checked: true },
    { id: 'pk_5', category: 'Tech', text: 'Cavo di scorta USB-C to Lightning', checked: false }
  ],
  itineraryDays: [
    {
      id: 'day_1',
      date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      title: 'Arrivo a Pudong & Check-in',
      events: [
        {
          id: 'ev_1_1',
          time: '11:30',
          title: 'Atterraggio Volo AF116 @ PVG Terminal 2',
          category: 'Volo/Treno',
          notes: 'Ritiro bagagli nastro 6, controllo impronte digitali',
          location: 'Shanghai Pudong Airport Terminal 2',
          mapsQuery: 'Shanghai Pudong International Airport',
          lat: 31.1443,
          lng: 121.8083
        },
        {
          id: 'ev_1_2',
          time: '13:00',
          title: 'Treno Maglev fino a Longyang Road',
          category: 'Volo/Treno',
          notes: "Biglietto 50 RMB mostrando carta d'imbarco. Velocità 430 km/h!",
          location: 'Maglev Station Longyang Rd',
          mapsQuery: 'Longyang Road Station Shanghai',
          lat: 31.2039,
          lng: 121.5577
        }
      ]
    }
  ],
  expenses: [
    {
      id: 'exp_1',
      date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      time: '12:45',
      amountLocal: 100,
      amountHome: 12.79,
      category: 'Trasporti',
      notes: '2x Biglietti Shanghai Maglev Express',
      currency: 'CNY',
      isSplit: true,
      paidBy: 'Io',
      splitWith: ['Io', 'Marco'],
      splitShares: { 'Io': 6.40, 'Marco': 6.39 }
    },
    {
      id: 'exp_2',
      date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      time: '19:40',
      amountLocal: 88,
      amountHome: 11.25,
      category: 'Cibo',
      notes: 'Cena ravioli Jia Jia Tang Bao & té al gelsomino',
      currency: 'CNY',
      isSplit: true,
      paidBy: 'Marco',
      splitWith: ['Io', 'Marco'],
      splitShares: { 'Io': 5.62, 'Marco': 5.63 }
    },
    {
      id: 'exp_3',
      date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      time: '21:15',
      amountLocal: 45,
      amountHome: 5.75,
      category: 'Shopping',
      notes: 'Adattatore da viaggio e acqua minerale in minimarket',
      currency: 'CNY',
      isSplit: false,
      paidBy: 'Io',
      splitWith: ['Io'],
      splitShares: { 'Io': 5.75 }
    }
  ],
  participants: ['Io', 'Marco', 'Giulia'],
  budgetHome: 1500
};

export const SUPPORTED_CURRENCIES = [
  { code: 'EUR', label: '🇪🇺 EUR — Euro', symbol: '€' },
  { code: 'CNY', label: '🇨🇳 CNY — Yuan Cinese', symbol: '¥' },
  { code: 'USD', label: '🇺🇸 USD — Dollaro USA', symbol: '$' },
  { code: 'JPY', label: '🇯🇵 JPY — Yen Giapponese', symbol: '¥' },
  { code: 'GBP', label: '🇬🇧 GBP — Sterlina Britannica', symbol: '£' },
  { code: 'CHF', label: '🇨🇭 CHF — Franco Svizzero', symbol: 'CHF' },
  { code: 'THB', label: '🇹🇭 THB — Baht Thailandese', symbol: '฿' },
  { code: 'AED', label: '🇦🇪 AED — Dirham EAU', symbol: 'AED' },
  { code: 'KRW', label: '🇰🇷 KRW — Won Sudcoreano', symbol: '₩' },
  { code: 'AUD', label: '🇦🇺 AUD — Dollaro Australiano', symbol: 'A$' },
  { code: 'CAD', label: '🇨🇦 CAD — Dollaro Canadese', symbol: 'C$' },
  { code: 'BRL', label: '🇧🇷 BRL — Real Brasiliano', symbol: 'R$' }
];

function getFirstUpcomingEventTitle(trip) {
  if (!trip || !Array.isArray(trip.itineraryDays) || trip.itineraryDays.length === 0) {
    return "Nessuna tappa in programma";
  }

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // 1. Cerca una tappa futura oggi o nei giorni successivi
  for (const day of trip.itineraryDays) {
    if (!day || !Array.isArray(day.events) || day.events.length === 0) continue;

    if (day.date > todayStr) {
      const ev = day.events[0];
      return (ev.time ? ev.time + " — " : "") + (ev.title || "Nuova Tappa");
    } else if (day.date === todayStr) {
      for (const ev of day.events) {
        if (!ev) continue;
        if (ev.time) {
          const parts = ev.time.split(":");
          if (parts.length >= 2) {
            const evMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            if (evMinutes >= nowMinutes) {
              return ev.time + " — " + (ev.title || "Nuova Tappa");
            }
          }
        }
      }
      const lastEv = day.events[day.events.length - 1];
      if (lastEv) {
        return (lastEv.time ? lastEv.time + " — " : "") + (lastEv.title || "Nuova Tappa");
      }
    }
  }

  for (const day of trip.itineraryDays) {
    if (day && Array.isArray(day.events) && day.events.length > 0) {
      const firstEv = day.events[0];
      return (firstEv.time ? firstEv.time + " — " : "") + (firstEv.title || "Nuova Tappa");
    }
  }

  return "Nessuna tappa in programma";
}

function calculateGroupBalances(trip) {
  if (!trip) return { balances: {}, myNet: 0, myNetFormatted: '0,00 €', statusText: 'Nessuna spesa condivisa', statusType: 'settled' };
  const participants = trip.participants || ['Io'];
  const balances = {};
  participants.forEach(p => { balances[p] = 0; });
  if (!balances['Io']) balances['Io'] = 0;

  const expenses = trip.expenses || [];
  expenses.forEach(exp => {
    if (exp.isSplit) {
      const payer = exp.paidBy || 'Io';
      const shares = exp.splitShares || {};
      const totalAmount = exp.amountHome || 0;
      
      if (balances[payer] === undefined) balances[payer] = 0;
      balances[payer] += totalAmount;

      Object.entries(shares).forEach(([person, share]) => {
        if (balances[person] === undefined) balances[person] = 0;
        balances[person] -= share;
      });
    }
  });

  const myNet = balances['Io'] || 0;
  const homeCurr = trip.homeCurrency || 'EUR';
  let statusText = 'Conti in pari';
  let statusType = 'settled';

  if (myNet > 0.05) {
    statusText = `Ti devono +${formatMoney(myNet, homeCurr)}`;
    statusType = 'credit';
  } else if (myNet < -0.05) {
    statusText = `Devi ${formatMoney(Math.abs(myNet), homeCurr)}`;
    statusType = 'debt';
  }

  return {
    balances,
    myNet,
    statusText,
    statusType
  };
}


/* ==========================================================================
   METEO DESTINAZIONE: WMO CODES & OPEN-METEO SYNC
   ========================================================================== */
function getWeatherInfoFromWMO(code) {
  const c = Number(code);
  if (c === 0) return { icon: '☀️', label: 'Sereno', isRain: false };
  if (c === 1) return { icon: '🌤️', label: 'Preval. Sereno', isRain: false };
  if (c === 2) return { icon: '⛅', label: 'Parz. Nuvoloso', isRain: false };
  if (c === 3) return { icon: '☁️', label: 'Coperto', isRain: false };
  if (c === 45 || c === 48) return { icon: '🌫️', label: 'Nebbia', isRain: false };
  if (c >= 51 && c <= 57) return { icon: '🌧️', label: 'Pioviggine', isRain: true };
  if (c >= 61 && c <= 67) return { icon: '🌧️', label: 'Pioggia', isRain: true };
  if (c >= 71 && c <= 77) return { icon: '🌨️', label: 'Neve', isRain: true };
  if (c >= 80 && c <= 82) return { icon: '🌦️', label: 'Rovesci', isRain: true };
  if (c >= 85 && c <= 86) return { icon: '🌨️', label: 'Tormenta', isRain: true };
  if (c >= 95 && c <= 99) return { icon: '⛈️', label: 'Temporale', isRain: true };
  return { icon: '⛅', label: 'Variabile', isRain: false };
}

function getTripCoordinates(trip) {
  if (trip.accommodation && trip.accommodation.lat && trip.accommodation.lng) {
    return { lat: trip.accommodation.lat, lng: trip.accommodation.lng };
  }
  const days = trip.itineraryDays || [];
  for (const day of days) {
    for (const ev of (day.events || [])) {
      if (ev.lat && ev.lng) {
        return { lat: ev.lat, lng: ev.lng };
      }
    }
  }
  // Default Shanghai coordinates
  return { lat: 31.2235, lng: 121.4475 };
}

async function fetchWeatherForTrip(trip, force = false) {
  if (!trip) return null;
  const now = Date.now();
  // Se i dati meteo sono freschi (meno di 3 ore) e non forzato, usa la cache
  if (!force && trip.weatherData && trip.weatherUpdatedAt && (now - trip.weatherUpdatedAt < 3 * 60 * 60 * 1000)) {
    return trip.weatherData;
  }

  const coords = getTripCoordinates(trip);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`Meteo HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.current_weather) {
      trip.weatherData = {
        current: data.current_weather,
        daily: data.daily || null
      };
      trip.weatherUpdatedAt = Date.now();
      await putToStore('trips_store', trip);
      return trip.weatherData;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('Meteo sync offline o timeout, mantengo cache:', err);
  }

  // Fallback cache se presente
  if (trip.weatherData) return trip.weatherData;

  // Fallback demo di emergenza
  trip.weatherData = {
    current: { temp: 22, weathercode: 1, time: new Date().toISOString() },
    daily: {
      time: [
        new Date().toISOString().split('T')[0],
        new Date(Date.now() + 86400000).toISOString().split('T')[0],
        new Date(Date.now() + 172800000).toISOString().split('T')[0],
        new Date(Date.now() + 259200000).toISOString().split('T')[0],
        new Date(Date.now() + 345600000).toISOString().split('T')[0]
      ],
      weathercode: [1, 2, 0, 61, 1],
      temperature_2m_max: [24, 25, 23, 20, 22],
      temperature_2m_min: [16, 17, 15, 14, 15]
    }
  };
  trip.weatherUpdatedAt = Date.now() - 3600000;
  return trip.weatherData;
}

function openWeatherForecastSheet() {
  const trip = state.activeTrip;
  if (!trip) return;
  const content = document.getElementById('sheetWeatherContent');
  if (!content) return;

  const renderSheetContent = () => {
    const wData = trip.weatherData || {};
    const current = wData.current || { temp: 22, weathercode: 1 };
    const daily = wData.daily || null;
    const currentInfo = getWeatherInfoFromWMO(current.weathercode);
    const city = (trip.destination || 'Destinazione').split(',')[0].trim();

    let daysHtml = '';
    if (daily && daily.time && daily.time.length > 0) {
      const count = Math.min(7, daily.time.length);
      for (let i = 0; i < count; i++) {
        const dateStr = daily.time[i];
        const dObj = new Date(dateStr + 'T00:00:00');
        const dayName = i === 0 ? 'Oggi' : dObj.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
        const code = daily.weathercode ? daily.weathercode[i] : 1;
        const info = getWeatherInfoFromWMO(code);
        const maxT = daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[i]) : '--';
        const minT = daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[i]) : '--';

        daysHtml += `
          <div class="weather-forecast-row">
            <div class="weather-forecast-day">${dayName}</div>
            <div class="weather-forecast-condition">
              <span style="font-size:22px;">${info.icon}</span>
              <span>${info.label}</span>
            </div>
            <div class="weather-forecast-temps tabular-nums">
              <span style="color:var(--text-primary); font-weight:700;">${maxT}°</span>
              <span style="color:var(--text-tertiary);">${minT}°</span>
            </div>
          </div>
        `;
      }
    } else {
      daysHtml = '<p style="color:var(--text-tertiary); font-size:13px; text-align:center; padding:16px;">Previsioni estese non disponibili offline.</p>';
    }

    const updatedMinutes = trip.weatherUpdatedAt ? Math.max(1, Math.round((Date.now() - trip.weatherUpdatedAt) / 60000)) : null;
    const updatedText = updatedMinutes ? (updatedMinutes < 60 ? `Aggiornato ${updatedMinutes}m fa` : `Aggiornato ${Math.round(updatedMinutes/60)}h fa`) : 'Dati salvati offline';

    content.innerHTML = `
      <!-- Header Meteo Attuale + Tasto ↻ Aggiorna -->
      <div class="glass-card" style="padding:16px; margin-bottom:14px; text-align:center; position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">
            ${escapeHTML(city)} • Attuale
          </div>
          <button id="btnSheetRefreshWeather" class="btn-glass-pill" style="padding:4px 10px; font-size:11.5px; gap:4px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:13px;height:13px;">
              <path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            ↻ Aggiorna
          </button>
        </div>

        <div style="font-size:48px; margin:4px 0; line-height:1;">${currentInfo.icon}</div>
        <div style="font-size:38px; font-weight:800; color:var(--text-primary); line-height:1; margin-top:4px;" class="tabular-nums">
          ${Math.round(current.temperature || current.temp || 22)}°C
        </div>
        <div style="font-size:14px; font-weight:600; color:${currentInfo.isRain ? '#60A5FA' : '#FB923C'}; margin-top:4px;">
          ${currentInfo.label}
        </div>
        <div style="font-size:11.5px; color:var(--text-tertiary); margin-top:6px;" id="sheetWeatherUpdatedLabel">
          ${updatedText}
        </div>
      </div>

      <div style="font-size:13px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin-bottom:8px; padding-left:2px; display:flex; justify-content:space-between;">
        <span>Meteo della Settimana (7 Giorni)</span>
        <span style="font-size:11.5px; color:var(--accent);">Offline Cache</span>
      </div>
      <div class="weather-forecast-list">
        ${daysHtml}
      </div>
    `;

    // Bind refresh button inside sheet
    document.getElementById('btnSheetRefreshWeather')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnSheetRefreshWeather');
      if (btn) {
        btn.textContent = 'Aggiorno...';
        btn.disabled = true;
      }
      try {
        const fresh = await fetchWeatherForTrip(trip, true);
        if (fresh) {
          showToast('Meteo 7 giorni aggiornato!');
          renderSheetContent();
          renderTabDashboard();
        }
      } catch (err) {
        showToast('Offline: mantengo meteo salvato');
      } finally {
        if (btn) {
          btn.textContent = '↻ Aggiorna';
          btn.disabled = false;
        }
      }
    });
  };

  renderSheetContent();
  openSheet('sheetWeatherForecast');
}

function openTaxiCodesSheet() {
  const trip = state.activeTrip;
  if (!trip) return;
  const content = document.getElementById('sheetTaxiCodesContent');
  if (!content) return;

  const hotel = trip.accommodation || {};
  const codes = trip.codes || {
    pnr: 'AF116-K89X4P',
    lockbox: 'A-7492#',
    wifi: 'PuLi_Guest / SilkRoad2026',
    insurance: 'Allianz Global Care — Polizza #IT-948190',
    emergencyPhone: '+39 02 2660 9999'
  };

  content.innerHTML = `
    <!-- Tasto Diretto Taxi Card a Schermo Intero -->
    <button class="taxi-quick-card-btn" id="btnSheetOpenTaxiFull">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:20px;height:20px;">
        <rect x="2" y="3" width="20" height="18" rx="3"></rect>
        <path d="M7 8h10M7 12h10M7 16h6"></path>
      </svg>
      Mostra Taxi Card Schermo Intero
    </button>

    <!-- Info Indirizzo Locale Sintetico -->
    <div class="glass-card" style="padding:12px 14px; margin-bottom:14px;">
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--accent); margin-bottom:4px;">Destinazione Taxi</div>
      <div style="font-size:15px; font-weight:700; color:var(--text-primary); margin-bottom:2px;">${escapeHTML(hotel.nameLocal || hotel.name || 'Alloggio')}</div>
      <div style="font-size:12.5px; color:var(--text-secondary);">${escapeHTML(hotel.addressLocal || hotel.address || '')}</div>
    </div>

    <div style="font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; padding-left:2px;">
      Codici Rapidi (Tocca per Copiare)
    </div>

    <!-- Lista Codici Rapidi con Tap-to-Copy -->
    <div class="code-quick-list">
      <div class="code-quick-item" data-copy-val="${escapeHTML(codes.pnr || 'AF116-K89X4P')}" data-copy-desc="Codice PNR Volo">
        <div class="code-quick-info">
          <span class="code-quick-label">PNR Volo / Biglietto</span>
          <span class="code-quick-val tabular-nums">${escapeHTML(codes.pnr || 'AF116-K89X4P')}</span>
        </div>
        <span class="code-quick-copy-badge">Copia</span>
      </div>

      <div class="code-quick-item" data-copy-val="${escapeHTML(codes.lockbox || 'A-7492#')}" data-copy-desc="Codice Lockbox / Chiave">
        <div class="code-quick-info">
          <span class="code-quick-label">Lockbox / Porta</span>
          <span class="code-quick-val tabular-nums">${escapeHTML(codes.lockbox || 'A-7492#')}</span>
        </div>
        <span class="code-quick-copy-badge">Copia</span>
      </div>

      <div class="code-quick-item" data-copy-val="${escapeHTML(codes.wifi || 'PuLi_Guest / SilkRoad2026')}" data-copy-desc="Password Wi-Fi">
        <div class="code-quick-info">
          <span class="code-quick-label">Wi-Fi Hotel / Alloggio</span>
          <span class="code-quick-val">${escapeHTML(codes.wifi || 'PuLi_Guest / SilkRoad2026')}</span>
        </div>
        <span class="code-quick-copy-badge">Copia</span>
      </div>

      <div class="code-quick-item" data-copy-val="${escapeHTML(codes.insurance || 'Allianz Global Care — #IT-948190')}" data-copy-desc="Polizza Assicurazione">
        <div class="code-quick-info">
          <span class="code-quick-label">Assicurazione Viaggio</span>
          <span class="code-quick-val">${escapeHTML(codes.insurance || 'Allianz Global Care — #IT-948190')}</span>
        </div>
        <span class="code-quick-copy-badge">Copia</span>
      </div>

      ${codes.emergencyPhone ? `
        <a href="tel:${codes.emergencyPhone.replace(/\s+/g, '')}" class="code-quick-item" style="text-decoration:none;">
          <div class="code-quick-info">
            <span class="code-quick-label" style="color:#F87171;">Pronto Intervento / Emergenza</span>
            <span class="code-quick-val tabular-nums" style="color:#F87171;">${escapeHTML(codes.emergencyPhone)}</span>
          </div>
          <span class="code-quick-copy-badge" style="color:#F87171; background:rgba(248, 113, 113, 0.15);">Chiama</span>
        </a>
      ` : ''}
    </div>
  `;

  // Bind click per aprire Taxi Card
  document.getElementById('btnSheetOpenTaxiFull')?.addEventListener('click', () => {
    closeAllSheets();
    openTaxiCard();
  });

  // Bind tap-to-copy
  content.querySelectorAll('.code-quick-item[data-copy-val]').forEach(item => {
    item.addEventListener('click', () => {
      const val = item.getAttribute('data-copy-val');
      const desc = item.getAttribute('data-copy-desc') || 'Codice';
      if (val) {
        copyToClipboard(val, `${desc} copiato!`);
        const badge = item.querySelector('.code-quick-copy-badge');
        if (badge) {
          const orig = badge.textContent;
          badge.textContent = 'Copiato ✓';
          setTimeout(() => { badge.textContent = orig; }, 1500);
        }
      }
    });
  });

  openSheet('sheetTaxiCodes');
}


/* ==========================================================================
   HELPER BUDGET MODAL & EVENT DELEGATION
   ========================================================================== */
function openBudgetEditModal() {
  const trip = state.activeTrip;
  const input = document.getElementById('inputEditBudgetVal');
  if (input) {
    const curBudget = (trip && trip.budget !== undefined && trip.budget !== null) 
      ? trip.budget 
      : ((trip && trip.budgetHome !== undefined && trip.budgetHome !== null) ? trip.budgetHome : '');
    input.value = (curBudget !== '' && curBudget > 0) ? curBudget : '';
    setTimeout(() => {
      try { input.focus(); input.select(); } catch (e) {}
    }, 150);
  }
  openSheet('sheetEditBudget');
}

async function saveTripBudget(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const trip = state.activeTrip;
  if (!trip) return;
  const input = document.getElementById('inputEditBudgetVal');
  const val = input ? input.value.trim() : '';
  const newCap = (val === '' || isNaN(parseFloat(val))) ? 0 : Math.max(0, parseFloat(val));
  
  trip.budget = newCap;
  trip.budgetHome = newCap;
  state.activeTrip.budget = newCap;
  state.activeTrip.budgetHome = newCap;

  // Aggiorna anche nell'array allTrips
  if (state.allTrips && Array.isArray(state.allTrips)) {
    const tIndex = state.allTrips.findIndex(t => t.id === trip.id);
    if (tIndex !== -1) {
      state.allTrips[tIndex].budget = newCap;
      state.allTrips[tIndex].budgetHome = newCap;
    }
  }

  // Persistenza garantita su IndexedDB
  await putToStore('trips_store', state.activeTrip);
  
  closeAllSheets();
  const homeCurr = state.homeCurrency || trip.homeCurrency || 'EUR';
  showToast(newCap > 0 ? ('Budget impostato: ' + formatMoney(newCap, homeCurr)) : 'Budget azzerato');
  
  // Re-render immediato di Dashboard ed Expenses
  renderTabDashboard();
  if (state.activeTab === 'expenses') {
    renderTabExpenses();
  }
}

// ==========================================================================
// COUNTDOWN LIVE VIAGGIO (FASCIA DASHBOARD)
// ==========================================================================
let countdownInterval = null;

function startLiveCountdownLoop(startDate, endDate, isOngoing) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (state.liveCountdownInterval) {
    clearInterval(state.liveCountdownInterval);
    state.liveCountdownInterval = null;
  }
  if (window.countdownInterval) {
    clearInterval(window.countdownInterval);
    window.countdownInterval = null;
  }

  const updateCountdownUI = () => {
    const el = document.getElementById('dashLiveCountdownText');
    if (!el) return;

    const trip = state.activeTrip;
    if (!trip) {
      el.textContent = '--';
      return;
    }

    const now = new Date();
    let sDate = startDate instanceof Date && !isNaN(startDate.getTime())
      ? startDate 
      : (trip.startDate ? new Date(trip.startDate + 'T00:00:00') : null);
    let eDate = endDate instanceof Date && !isNaN(endDate.getTime())
      ? endDate 
      : (trip.endDate ? new Date(trip.endDate + 'T23:59:59') : null);

    if (!sDate || isNaN(sDate.getTime())) {
      el.textContent = 'Data n/d';
      return;
    }

    const msDiffStart = sDate.getTime() - now.getTime();

    if (msDiffStart > 0) {
      // Viaggio futuro: countdown giorni, ore, minuti
      const days = Math.floor(msDiffStart / (1000 * 60 * 60 * 24));
      const hours = Math.floor((msDiffStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((msDiffStart % (1000 * 60 * 60)) / (1000 * 60));

      const dStr = days > 0 ? `${days}g ` : '';
      const hStr = `${String(hours).padStart(2, '0')}h `;
      const mStr = `${String(minutes).padStart(2, '0')}m`;
      el.textContent = `${dStr}${hStr}${mStr}`;
    } else {
      // Viaggio iniziato o concluso
      if (eDate && !isNaN(eDate.getTime()) && now <= eDate) {
        const msElapsed = now.getTime() - sDate.getTime();
        const currentDay = Math.max(1, Math.floor(msElapsed / (1000 * 60 * 60 * 24)) + 1);
        const totalDays = Math.max(1, Math.ceil((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)));
        el.textContent = `Giorno ${currentDay}/${totalDays}`;
      } else {
        el.textContent = 'Completato';
      }
    }
  };

  // Esegui subito al mount
  updateCountdownUI();

  // Aggiorna ogni 30 secondi
  countdownInterval = setInterval(updateCountdownUI, 30000);
  state.liveCountdownInterval = countdownInterval;
  window.countdownInterval = countdownInterval;
}

function renderTabDashboard() {
  const container = document.getElementById("dashboardTabContent");
  if (!container) return;
  if (!state.activeTrip) {
    state.activeTrip = (typeof getDemoTrip === "function" ? getDemoTrip() : null) || DEFAULT_DEMO_TRIP;
    state.currentTripId = state.activeTrip.id;
  }
  // Assicura tab dashboard attiva
  if (state.activeTab === "dashboard") {
    const pane = document.getElementById("tab-dashboard");
    if (pane && !pane.classList.contains("active")) {
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      pane.classList.add("active");
    }
    const dashBtn = document.querySelector('.nav-tab-btn[data-tab="dashboard"]');
    if (dashBtn && !dashBtn.classList.contains("active")) {
      document.querySelectorAll(".nav-tab-btn").forEach(b => b.classList.remove("active"));
      dashBtn.classList.add("active");
    }
  }

  // Igiene timer countdown
  if (state.liveCountdownInterval) {
    clearInterval(state.liveCountdownInterval);
    state.liveCountdownInterval = null;
  }
  if (window.countdownInterval) {
    clearInterval(window.countdownInterval);
    window.countdownInterval = null;
  }

  const trip = state.activeTrip;
  const now = new Date();

  // Calcolo date e durata viaggio con fallback a 7 giorni
  let startDate = trip.startDate ? new Date(trip.startDate + "T00:00:00") : null;
  let endDate = trip.endDate ? new Date(trip.endDate + "T23:59:59") : null;

  if (!startDate || isNaN(startDate.getTime())) {
    startDate = new Date();
  }
  if (!endDate || isNaN(endDate.getTime())) {
    endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  const isFuture = now < startDate;
  const isOngoing = now >= startDate && now <= endDate;
  const isConcluded = now > endDate;

  // Calcolo Bussola Giornaliera & Budget Flow (legge sia budget che budgetHome)
  const homeCurr = state.homeCurrency || trip.homeCurrency || "EUR";
  const destCurr = trip.destCurrency || homeCurr;
  const expenses = trip.expenses || [];
  const totalSpent = expenses.reduce((acc, curr) => acc + (Number(curr.amountHome) || 0), 0);
  
  const rawBudget = (trip.budget !== undefined && trip.budget !== null) 
    ? Number(trip.budget) 
    : ((trip.budgetHome !== undefined && trip.budgetHome !== null) ? Number(trip.budgetHome) : 0);
  
  const hasBudgetSet = !isNaN(rawBudget) && rawBudget > 0;
  const budgetCap = hasBudgetSet ? rawBudget : 0;
  const remainingBudget = Math.max(0, budgetCap - totalSpent);

  // Giorni rimanenti del viaggio
  let remainingDays = 7;
  const msPerDay = 1000 * 60 * 60 * 24;
  if (isFuture) {
    remainingDays = Math.max(1, Math.ceil((endDate - startDate) / msPerDay));
  } else if (isOngoing) {
    remainingDays = Math.max(1, Math.ceil((endDate - now) / msPerDay));
  } else {
    remainingDays = 1;
  }

  // Bussola Giornaliera
  const dailyBudget = hasBudgetSet ? (remainingBudget / remainingDays) : 0;
  const exchangeRate = Number(trip.exchangeRate) || 1;
  const dailyBudgetDest = dailyBudget * exchangeRate;

  const budgetUsagePercent = budgetCap > 0 ? Math.round((totalSpent / budgetCap) * 100) : 0;
  let budgetColorClass = "progress-green";
  if (budgetUsagePercent > 95) {
    budgetColorClass = "progress-red";
  } else if (budgetUsagePercent >= 75) {
    budgetColorClass = "progress-amber";
  }

  // Mini-Splitwise bilancio
  const splitGroup = calculateGroupBalances(trip);

  // Documenti Pinnati
  let pinnedDocs = (state.walletFiles || []).filter(f => Boolean(f.isPinned));
  if (pinnedDocs.length === 0 && (!state.walletFiles || state.walletFiles.length === 0)) {
    pinnedDocs = [
      {
        id: "pass_demo_af116",
        title: "Carta d'Imbarco AF116 (Parigi → Shanghai)",
        category: "flight",
        type: "image/svg+xml",
        notes: "Gate K43 • Posto 14A • Terminal 2E",
        isPinned: true
      },
      {
        id: "pass_demo_hotel",
        title: "The PuLi Hotel & Spa (Check-in)",
        category: "hotel",
        type: "image/svg+xml",
        notes: "Prenotazione #PL-88391 • 1 Changde Rd",
        isPinned: true
      }
    ];
  }

  let html = `
    <!-- 1) FASCIA UNICA VIAGGIO + COUNTDOWN LIVE -->
    <div class="glass-card dash-single-trip-bar" style="margin-bottom:0;">
      <button id="dashBtnSelectTrip" class="dash-trip-left-btn" aria-label="Cambia o Seleziona Viaggio">
        <span style="font-size:15px;">📍</span>
        <span class="dash-trip-dest-name">${escapeHTML(trip.name || trip.destination)}</span>
        <span style="font-size:11px; color:var(--text-tertiary); margin-left:2px;">▾</span>
      </button>
      <div class="dash-countdown-pill-compact tabular-nums" id="dashLiveCountdownText">
        Caricamento...
      </div>
    </div>

    <!-- 2) FASCIA METEO COMPATTA (SOPRA I DOCUMENTI PINNATI) -->
    <div class="dash-weather-slim-bar" id="dashWidgetWeather" title="Tocca per vedere il Meteo della Settimana (7 Giorni)">
      <div class="dash-weather-slim-left">
        <span class="dash-weather-slim-icon" id="dashWeatherIcon">🌤️</span>
        <span class="dash-weather-slim-temp tabular-nums" id="dashWeatherTemp">22°C</span>
        <span class="dash-weather-slim-hilo tabular-nums" id="dashWeatherHiLo">H:24° / L:16°</span>
      </div>
      <div class="dash-weather-slim-right">
        <span id="dashWeatherCity">${escapeHTML((trip.destination || 'Destinazione').split(',')[0].trim())}</span>
        <span style="color:var(--text-tertiary);">•</span>
        <span id="dashWeatherUpdated" style="color:var(--text-tertiary);">Offline</span>
        <button class="exchange-refresh-btn" id="dashBtnRefreshWeather" aria-label="Aggiorna meteo" style="width:22px; height:22px; margin-left:4px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- 3) DOCUMENTI PINNATI: PASS APPLE WALLET VISIBILI -->
    <div class="dash-pass-carousel-section">
      ${pinnedDocs.length > 0 ? `
        <div class="dash-pass-carousel">
          ${pinnedDocs.map(doc => {
            let catLabel = 'Documento';
            let catIcon = '📄';
            if (doc.category === 'flight') { catLabel = 'Volo'; catIcon = '✈️'; }
            else if (doc.category === 'hotel') { catLabel = 'Alloggio'; catIcon = '🏨'; }
            else if (doc.category === 'train') { catLabel = 'Treno'; catIcon = '🚆'; }
            else if (doc.category === 'documents') { catLabel = 'Passaporto/Visto'; catIcon = '🛂'; }

            const isDoc = doc.category === 'documents';

            return `
              <div class="dash-pass-card" data-gate-id="${doc.id}">
                <div>
                  <div class="dash-pass-card-header">
                    <span class="dash-pass-badge">
                      <span>${catIcon}</span>
                      <span>${catLabel}</span>
                    </span>
                    <span class="dash-pass-gate-tag">Modalità Gate ↗</span>
                  </div>
                  <div class="dash-pass-title ${isDoc ? 'blurred' : ''}">
                    ${escapeHTML(doc.title)}
                  </div>
                  <div class="dash-pass-notes">
                    ${escapeHTML(doc.notes || 'Tocca per aprire a schermo intero ad alta luminosità')}
                  </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:11px; color:var(--text-tertiary);">
                  <span>Offline First</span>
                  <span style="color:#38BDF8; font-weight:700;">Apri Pass →</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="dash-pass-empty-card" id="dashEmptyGoWallet">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">🎟️</span>
            <div>
              <div style="font-weight:700; color:var(--text-primary); font-size:13.5px;">Nessun biglietto pinnato</div>
              <div style="font-size:11.5px; color:var(--text-secondary);">Aggiungi i tuoi pass per averli a portata di tap al Gate</div>
            </div>
          </div>
          <button class="btn-glass-pill accent" style="padding:6px 12px; font-size:12px;">Scegli biglietti dal Wallet</button>
        </div>
      `}
    </div>

    <!-- 4) CONVERTITORE VALUTE: FULL-WIDTH SENZA SOVRAPPOSIZIONI -->
    <div class="glass-card dash-converter-card">
      <!-- Riga 1: Header dedicato (Titolo a sinistra, Tasso + Tasto ↻ a destra) -->
      <div class="dash-conv-header-row">
        <div class="dash-conv-header-left">
          <div class="bento-mini-icon-badge icon-badge-converter" style="width:26px; height:26px; font-size:13px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:15px;height:15px;">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>
              <path d="M12 18V6"></path>
            </svg>
          </div>
          <span style="font-size:14px; font-weight:700; color:var(--text-primary);">Convertitore Valute</span>
        </div>
        <div class="dash-conv-header-right">
          <span style="font-size:11px; color:var(--text-tertiary);" id="dashCurrMetaText">${formatRateMeta(trip)}</span>
          <button class="exchange-refresh-btn" id="dashBtnRefreshRate" aria-label="Aggiorna tasso di cambio" style="width:24px; height:24px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- Riga 2: Selettori Valuta (Grid 3 colonne distanziata) -->
      <div class="dash-conv-selects-grid">
        <select id="dashSelectFromCurr" class="dash-conv-select">
          ${SUPPORTED_CURRENCIES.map(c => `
            <option value="${c.code}" ${c.code === (trip.destCurrency || "CNY") ? "selected" : ""}>${c.code} (${c.symbol})</option>
          `).join("")}
        </select>
        <button id="dashBtnSwapCurr" class="dash-conv-swap-btn" aria-label="Inverti valute">⇄</button>
        <select id="dashSelectToCurr" class="dash-conv-select">
          ${SUPPORTED_CURRENCIES.map(c => `
            <option value="${c.code}" ${c.code === homeCurr ? "selected" : ""}>${c.code} (${c.symbol})</option>
          `).join("")}
        </select>
      </div>

      <!-- Riga 3: Importo & Risultato + 3 Mini-Chip Rapidi -->
      <div class="dash-conv-calc-row">
        <div>
          <input type="number" step="any" id="dashFromCurrInput" class="dash-conv-input tabular-nums" placeholder="100">
        </div>
        <div class="dash-conv-result tabular-nums" id="dashToCurrOutput">
          0.00
        </div>
      </div>

      <div class="dash-conv-chips-strip">
        <button class="dash-conv-chip-btn" data-quick-amt="10">10</button>
        <button class="dash-conv-chip-btn" data-quick-amt="50">50</button>
        <button class="dash-conv-chip-btn" data-quick-amt="100">100</button>
      </div>
    </div>

    <!-- 5) WIDGET BUDGET VIAGGIO + BUSSOLA GIORNALIERA (MOBILE-FIRST 360-430px) -->
    <div class="glass-card dash-widget-card" style="padding:16px;">
      <!-- Riga 1: Header (Titolo a sinistra, Bottoni allineati orizzontalmente a destra con Icona Occhio Privacy) -->
      <div class="dash-budget-header-mobile">
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="dash-widget-icon-badge icon-badge-budget" style="width:26px; height:26px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px; height:15px;">
              <rect x="2" y="6" width="20" height="12" rx="2"></rect>
              <circle cx="12" cy="12" r="2"></circle>
              <path d="M6 12h.01M18 12h.01"></path>
            </svg>
          </div>
          <div class="dash-budget-title-mobile">Budget Viaggio</div>
        </div>
        <div class="dash-budget-actions-mobile">
          <button id="dashBtnToggleBudgetPrivacy" class="btn-privacy-toggle ${state.budgetHidden ? 'active' : ''}" aria-label="Attiva/Disattiva Privacy Budget" title="${state.budgetHidden ? 'Mostra importi' : 'Nascondi importi (Privacy)'}">
            ${state.budgetHidden ? `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:16px;height:16px;">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            ` : `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:16px;height:16px;">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            `}
          </button>
          <button id="btn-edit-budget" class="btn-edit-budget-pill" onclick="openBudgetEditModal()" aria-label="Modifica Budget">
            ${hasBudgetSet ? '✎ Modifica' : 'Imposta budget'}
          </button>
          <button id="dashBtnAddExpense" class="btn-plus-compact" aria-label="Registra nuova spesa">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
      </div>

      ${hasBudgetSet ? `
        <!-- Riga 2: Box Bussola Giornaliera Dedicata -->
        <div class="dash-compass-card-mobile ${state.budgetHidden ? 'privacy-masked' : ''}">
          <div class="dash-compass-tag-mobile">
            <span>🧭 Bussola Giornaliera</span>
            <span style="font-size:0.72rem; color:#A8B8C0; text-transform:none;">${remainingDays} ${remainingDays === 1 ? 'giorno rimasto' : 'giorni rimasti'}</span>
          </div>
          <div class="dash-compass-val-mobile tabular-nums">
            ${formatMoney(dailyBudget, homeCurr)} / giorno
          </div>
          <div class="dash-compass-subval-mobile tabular-nums">
            ≈ ${formatMoney(dailyBudgetDest, destCurr)} / gg
          </div>
        </div>

        <!-- Riga 3: Barra di progresso -->
        <div class="dash-budget-progress-mobile ${state.budgetHidden ? 'privacy-masked' : ''}">
          <div class="flow-progress-bar ${budgetColorClass}" style="width: ${Math.min(100, budgetUsagePercent)}%;"></div>
        </div>

        <!-- Riga 4: Griglia Dati 3 Colonne -->
        <div class="dash-budget-3col-mobile tabular-nums ${state.budgetHidden ? 'privacy-masked' : ''}">
          <div>
            <div class="budget-col-label">Speso</div>
            <div class="budget-col-val">${formatMoney(totalSpent, homeCurr)}</div>
          </div>
          <div id="dashColBudgetCapClick" onclick="openBudgetEditModal()" style="cursor:pointer;" title="Clicca per modificare budget">
            <div class="budget-col-label" style="color:var(--accent); font-weight:700;">Budget ✎</div>
            <div class="budget-col-val" style="text-decoration:underline; text-decoration-color:rgba(52,211,153,0.4); text-underline-offset:3px;">
              ${formatMoney(budgetCap, homeCurr)}
            </div>
          </div>
          <div>
            <div class="budget-col-label">Residuo</div>
            <div class="budget-col-val" style="color:${remainingBudget >= 0 ? "#34D399" : "#F87171"};">
              ${formatMoney(remainingBudget, homeCurr)}
            </div>
          </div>
        </div>
      ` : `
        <!-- Se il budget non è ancora impostato: invito esplicito e pulsante grande -->
        <div style="text-align:center; padding:18px 12px; background:var(--bg-card-subtle); border:1px dashed var(--border-subtle); border-radius:16px; margin: 10px 0;">
          <div style="font-size:14px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">Nessun budget impostato</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">Imposta un budget per calcolare la tua bussola giornaliera</div>
          <button id="btnSetBudgetEmpty" onclick="openBudgetEditModal()" class="btn-glass-pill accent" style="padding:8px 18px; font-size:13px; font-weight:700; margin:0 auto;">
            + Imposta Budget
          </button>
        </div>
      `}

      <!-- Riga 5: Pillola Mini-Splitwise -->
      <div class="split-summary-pill dash-split-pill-mobile" id="dashSplitSummaryPill" style="cursor:pointer;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">👥</span>
          <div>
            <div style="font-size:12.5px; font-weight:700; color:var(--text-primary);">Saldi Gruppo</div>
            <div style="font-size:11px; color:var(--text-secondary);">${(trip.participants || ["Io"]).length} partecipanti</div>
          </div>
        </div>
        <span class="split-status-badge ${splitGroup.statusType === "credit" ? "split-status-credit" : (splitGroup.statusType === "debt" ? "split-status-debt" : "split-status-settled")} tabular-nums ${state.budgetHidden ? 'privacy-masked' : ''}">
          ${splitGroup.statusText}
        </span>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // 1. Avvia Countdown Live compatto
  startLiveCountdownLoop(startDate, endDate, isOngoing);

  // 2. Selettore Viaggio al tap sul nome destinazione
  document.getElementById("dashBtnSelectTrip")?.addEventListener("click", () => {
    renderTripsSheetList();
    openSheet("sheetTrips");
  });

  // 3. Modifica Budget al volo & Toggle Privacy (Event Delegation blindata sul container + listener specifici)
  container.addEventListener("click", (e) => {
    if (e.target.closest("#dashBtnToggleBudgetPrivacy")) {
      e.stopPropagation();
      state.budgetHidden = !state.budgetHidden;
      localStorage.setItem('nomad_budget_hidden', state.budgetHidden ? 'true' : 'false');
      renderTabDashboard();
      return;
    }
    if (e.target.closest("#btn-edit-budget") || e.target.closest("#dashColBudgetCapClick") || e.target.closest("#btnSetBudgetEmpty")) {
      e.stopPropagation();
      openBudgetEditModal();
      return;
    }
    if (e.target.closest("#dashBtnAddExpense")) {
      e.stopPropagation();
      openAddExpenseSheet();
      return;
    }
    if (e.target.closest("#dashSplitSummaryPill")) {
      e.stopPropagation();
      switchTab("expenses");
      return;
    }
  });

  document.getElementById("dashBtnToggleBudgetPrivacy")?.addEventListener("click", (e) => {
    e.stopPropagation();
    state.budgetHidden = !state.budgetHidden;
    localStorage.setItem('nomad_budget_hidden', state.budgetHidden ? 'true' : 'false');
    renderTabDashboard();
  });

  document.getElementById("btn-edit-budget")?.addEventListener("click", openBudgetEditModal);
  document.getElementById("dashColBudgetCapClick")?.addEventListener("click", openBudgetEditModal);
  document.getElementById("btnSetBudgetEmpty")?.addEventListener("click", openBudgetEditModal);

  // Form edit budget & Save Budget
  document.getElementById("formEditBudget")?.addEventListener("submit", saveTripBudget);
  const saveBtn = document.getElementById("btnSaveBudgetConfirm");
  if (saveBtn) {
    saveBtn.onclick = saveTripBudget;
  }

  // 4. Tap documenti pinnati -> Gate Mode
  container.querySelectorAll("[data-gate-id]").forEach(el => {
    el.addEventListener("click", () => {
      const docId = el.getAttribute("data-gate-id");
      const doc = pinnedDocs.find(d => d.id === docId);
      if (doc) openGateMode(doc);
    });
  });

  // 5. Meteo Slim Bar: tap apre 7 giorni, pulsante ↻ aggiorna
  document.getElementById("dashWidgetWeather")?.addEventListener("click", (e) => {
    if (e.target.closest("#dashBtnRefreshWeather")) return;
    openWeatherForecastSheet();
  });

  const updateWeatherUI = (wData) => {
    if (!wData) return;
    const current = wData.current || {};
    const daily = wData.daily || {};
    const info = getWeatherInfoFromWMO(current.weathercode || 1);
    
    const iconEl = document.getElementById("dashWeatherIcon");
    const tempEl = document.getElementById("dashWeatherTemp");
    const hiloEl = document.getElementById("dashWeatherHiLo");
    const updEl = document.getElementById("dashWeatherUpdated");

    if (iconEl) iconEl.textContent = info.icon;
    if (tempEl) tempEl.textContent = Math.round(current.temperature || current.temp || 22) + "°C";
    if (hiloEl && daily.temperature_2m_max && daily.temperature_2m_max[0] !== undefined) {
      hiloEl.textContent = "H:" + Math.round(daily.temperature_2m_max[0]) + "° / L:" + Math.round(daily.temperature_2m_min[0]) + "°";
    }
    if (updEl && trip.weatherUpdatedAt) {
      const mins = Math.max(1, Math.round((Date.now() - trip.weatherUpdatedAt) / 60000));
      updEl.textContent = mins < 60 ? "Agg. " + mins + "m fa" : "Agg. " + Math.round(mins/60) + "h fa";
    }
  };

  if (trip.weatherData) {
    updateWeatherUI(trip.weatherData);
  }

  fetchWeatherForTrip(trip, false).then(w => {
    if (w) updateWeatherUI(w);
  });

  document.getElementById("dashBtnRefreshWeather")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const btn = document.getElementById("dashBtnRefreshWeather");
    if (btn) btn.classList.add("rotating");
    try {
      const freshW = await fetchWeatherForTrip(trip, true);
      if (freshW) updateWeatherUI(freshW);
      showToast("Meteo aggiornato!");
    } catch (err) {
      showToast("Offline: mantengo meteo salvato");
    } finally {
      setTimeout(() => btn?.classList.remove("rotating"), 500);
    }
  });

  // Navigazione Wallet & Spese
  document.getElementById("dashEmptyGoWallet")?.addEventListener("click", () => switchTab("wallet"));
  document.getElementById("dashSplitSummaryPill")?.addEventListener("click", () => switchTab("expenses"));

  document.getElementById("dashBtnAddExpense")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openAddExpenseSheet();
  });

  // Setup Convertitore Valute Elegante full-width con 3 chip rapidi
  setupDashAdvancedConverter(trip);
  recalcConverter();
}

// ==========================================================================
// CONVERTITORE VALUTE CON TASSI DI FALLBACK E CALCOLO ISOLATO
// ==========================================================================
const DEFAULT_RATES = {
  EUR: 1,
  USD: 1.08,
  CNY: 7.80,
  JPY: 165,
  GBP: 0.85,
  CHF: 0.94,
  THB: 37.5,
  AUD: 1.65,
  CAD: 1.50
};

// Mantiene i tassi correnti aggiornabili via API
let CURRENT_CONVERTER_RATES = { ...DEFAULT_RATES };

function recalcConverter() {
  const input = document.getElementById('dashFromCurrInput');
  const selectFrom = document.getElementById('dashSelectFromCurr');
  const selectTo = document.getElementById('dashSelectToCurr');
  const output = document.getElementById('dashToCurrOutput');
  const rateLabel = document.getElementById('dashCurrRateLabel');
  const metaText = document.getElementById('dashCurrMetaText');

  if (!input || !selectFrom || !selectTo || !output) return;

  const rawVal = input.value !== '' ? parseFloat(input.value) : 100;
  const amount = (!isNaN(rawVal) && rawVal >= 0) ? rawVal : 0;
  const fromCurr = selectFrom.value || 'CNY';
  const toCurr = selectTo.value || 'EUR';

  // Leggi tasso o fallback da DEFAULT_RATES
  const rates = CURRENT_CONVERTER_RATES;
  const rateFrom = rates[fromCurr] || DEFAULT_RATES[fromCurr] || 1;
  const rateTo = rates[toCurr] || DEFAULT_RATES[toCurr] || 1;

  // Formula garantita (mai NaN): (amount / rateFrom) * rateTo
  const result = (amount / rateFrom) * rateTo;
  const unitRate = (1 / rateFrom) * rateTo;

  output.textContent = `${result.toFixed(2)} ${toCurr}`;
  if (rateLabel) {
    rateLabel.textContent = `1 ${fromCurr} = ${unitRate >= 10 ? unitRate.toFixed(2) : unitRate.toFixed(4)} ${toCurr}`;
  }
  if (metaText) {
    metaText.textContent = `1 ${fromCurr} = ${unitRate >= 10 ? unitRate.toFixed(2) : unitRate.toFixed(4)} ${toCurr}`;
  }
}

function setupDashAdvancedConverter(trip) {
  const input = document.getElementById('dashFromCurrInput');
  const selectFrom = document.getElementById('dashSelectFromCurr');
  const selectTo = document.getElementById('dashSelectToCurr');
  const swapBtn = document.getElementById('dashBtnSwapCurr');
  const btnRefresh = document.getElementById('dashBtnRefreshRate');
  const btnQuickSave = document.getElementById('dashBtnSaveConvertedQuick');

  if (!input || !selectFrom || !selectTo) return;

  // Inizializza con tasso del viaggio se disponibile
  if (trip && trip.destCurrency && trip.exchangeRate && trip.exchangeRate > 0) {
    CURRENT_CONVERTER_RATES[trip.destCurrency] = trip.exchangeRate;
  }

  // 1. input sull'importo -> ricalcola
  input.addEventListener('input', recalcConverter);

  // 2. change sulle due tendine valuta -> ricalcola
  selectFrom.addEventListener('change', recalcConverter);
  selectTo.addEventListener('change', recalcConverter);

  // 3. click sul tasto ⇄ (Swap) -> scambia e ricalcola
  swapBtn?.addEventListener('click', () => {
    const temp = selectFrom.value;
    selectFrom.value = selectTo.value;
    selectTo.value = temp;
    recalcConverter();
  });

  // 4. click sui chip rapidi 10, 50, 100 -> imposta e ricalcola
  document.querySelectorAll('.dash-conv-chip-btn[data-quick-amt], .bento-conv-chip[data-quick-amt]').forEach(chip => {
    chip.addEventListener('click', () => {
      const amt = chip.getAttribute('data-quick-amt');
      if (amt && input) {
        input.value = amt;
        recalcConverter();
      }
    });
  });

  // 5. click sul tasto ↻ (Aggiorna) -> fetch open.er-api.com/v6/latest/EUR con timeout 4s
  btnRefresh?.addEventListener('click', async () => {
    btnRefresh.classList.add('rotating');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch('https://open.er-api.com/v6/latest/EUR', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.rates) {
          CURRENT_CONVERTER_RATES = {
            ...CURRENT_CONVERTER_RATES,
            ...data.rates
          };
          if (state.activeTrip && state.activeTrip.destCurrency) {
            const destCurr = state.activeTrip.destCurrency;
            if (data.rates[destCurr]) {
              state.activeTrip.exchangeRate = data.rates[destCurr];
              state.activeTrip.rateUpdatedAt = Date.now();
              state.activeTrip.rateSource = 'auto';
              await putToStore('trips_store', state.activeTrip);
            }
          }
          showToast('Tassi aggiornati online');
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      showToast('Offline: mantengo tassi salvati');
    } finally {
      setTimeout(() => btnRefresh.classList.remove('rotating'), 500);
      recalcConverter();
    }
  });

  // Tasto salva spesa rapida opzionale
  btnQuickSave?.addEventListener('click', () => {
    const val = parseFloat(input.value);
    if (!val || val <= 0) {
      showToast('Inserisci prima un importo');
      return;
    }
    openAddExpenseSheet({
      amount: val,
      currency: selectFrom.value
    });
  });

  // Calcolo iniziale immediato
  recalcConverter();
}

function initDashLeafletMapInstance() {
  if (typeof L === 'undefined') return;
  const mapElem = document.getElementById('dashLeafletMap');
  if (!mapElem) return;

  if (state.dashLeafletMap) {
    try {
      state.dashLeafletMap.remove();
    } catch (e) {}
    state.dashLeafletMap = null;
  }

  const hotel = state.activeTrip?.accommodation;
  const defaultCenter = (hotel && hotel.lat && hotel.lng) ? [hotel.lat, hotel.lng] : [31.2235, 121.4475];

  // Anti-blocco scroll: dragging e scrollWheelZoom disabilitati di default su mobile touch
  let isDragEnabled = !L.Browser.touch;
  const map = L.map('dashLeafletMap', {
    zoomControl: false,
    attributionControl: false,
    dragging: isDragEnabled,
    scrollWheelZoom: false,
    tap: false
  }).setView(defaultCenter, 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(map);

  state.dashMapMarkersGroup = L.layerGroup().addTo(map);
  state.dashLeafletMap = map;

  // Toggle Sblocca Mappa
  const toggleBtn = document.getElementById('dashBtnToggleMapDrag');
  toggleBtn?.addEventListener('click', () => {
    isDragEnabled = !isDragEnabled;
    if (isDragEnabled) {
      map.dragging.enable();
      toggleBtn.classList.add('active');
      toggleBtn.textContent = 'Mappa sbloccata';
    } else {
      map.dragging.disable();
      toggleBtn.classList.remove('active');
      toggleBtn.textContent = 'Sblocca mappa';
    }
  });

  // Popola marker hotel e tappe
  if (hotel && hotel.lat && hotel.lng) {
    L.circleMarker([hotel.lat, hotel.lng], {
      radius: 7,
      fillColor: '#00E676',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1
    }).addTo(state.dashMapMarkersGroup);
  }

  const days = state.activeTrip?.itineraryDays || [];
  days.forEach(day => {
    (day.events || []).forEach(ev => {
      if (ev.lat && ev.lng) {
        L.circleMarker([ev.lat, ev.lng], {
          radius: 5,
          fillColor: '#00E676',
          color: '#03120A',
          weight: 1.5,
          fillOpacity: 0.9
        }).addTo(state.dashMapMarkersGroup);
      }
    });
  });

  // Pallino GPS utente se disponibile
  if (state.userCoords) {
    L.circleMarker([state.userCoords.lat, state.userCoords.lng], {
      radius: 6,
      fillColor: '#0284c7',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1
    }).addTo(state.dashMapMarkersGroup);
  }

  // Risolve rendering di tasselli grigi
  setTimeout(() => {
    if (map && typeof map.invalidateSize === "function") map.invalidateSize();
  }, 100);
}


/* ==========================================================================
   TAB 2: VIAGGIO (Piano + Alloggio + Mappa Offline)
   ========================================================================== */
function renderTabTrip() {
  const container = document.getElementById('tripTabContent');
  if (!container || !state.activeTrip) return;

  const trip = state.activeTrip;
  if (!state.tripSubView) state.tripSubView = 'plan';

  let html = `
    <!-- Header compatto Alloggio -->
    <div class="glass-card" style="padding:14px 16px; margin-bottom:12px;">
      <div class="card-title-row" style="margin-bottom:6px;">
        <span style="font-size:12px; font-weight:700; color:var(--accent); text-transform:uppercase;">Alloggio</span>
        ${trip.accommodation?.checkIn ? `<span style="font-size:11.5px; color:var(--text-tertiary);">In: ${trip.accommodation.checkIn} / Out: ${trip.accommodation.checkOut || '11:00'}</span>` : ''}
      </div>
      <div style="font-size:16px; font-weight:700; color:var(--text-primary); margin-bottom:2px;">
        ${escapeHTML(trip.accommodation?.name || 'Alloggio non impostato')}
      </div>
      <div style="font-size:12.5px; color:var(--text-secondary); margin-bottom:10px;">
        ${escapeHTML(trip.accommodation?.address || 'Nessun indirizzo')}
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn-glass-pill" id="btnTripCopyHotel" style="flex:1; padding:6px 12px; font-size:12.5px;">
          Copia Indirizzo
        </button>
        <button class="btn-glass-pill accent" id="btnTripOpenTaxi" style="flex:1; padding:6px 12px; font-size:12.5px;">
          Taxi Card
        </button>
      </div>
    </div>

    <!-- Segmented Control Apple Style a 3 segmenti (Piano | Mappa | Valigia) -->
    <div class="segmented-control-bar">
      <button class="segmented-control-btn ${state.tripSubView === 'plan' ? 'active' : ''}" id="btnSegmentPlan">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        Piano
      </button>
      <button class="segmented-control-btn ${state.tripSubView === 'map' ? 'active' : ''}" id="btnSegmentMap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>
        Mappa
      </button>
      <button class="segmented-control-btn ${state.tripSubView === 'packing' ? 'active' : ''}" id="btnSegmentPacking">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="15" rx="3"></rect><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        Valigia
      </button>
    </div>

    <div id="tripSubViewContainer"></div>
  `;

  container.innerHTML = html;

  // Bind Alloggio buttons
  document.getElementById('btnTripCopyHotel')?.addEventListener('click', () => {
    if (trip.accommodation?.address) {
      copyToClipboard(trip.accommodation.address, 'Indirizzo hotel copiato');
    }
  });
  document.getElementById('btnTripOpenTaxi')?.addEventListener('click', openTaxiCard);

  // Segmented Control Bindings
  document.getElementById('btnSegmentPlan')?.addEventListener('click', () => {
    state.tripSubView = 'plan';
    renderTabTrip();
  });
  document.getElementById('btnSegmentMap')?.addEventListener('click', () => {
    state.tripSubView = 'map';
    renderTabTrip();
  });
  document.getElementById('btnSegmentPacking')?.addEventListener('click', () => {
    state.tripSubView = 'packing';
    renderTabTrip();
  });

  if (state.tripSubView === 'plan') {
    renderPlanSubView();
  } else if (state.tripSubView === 'map') {
    renderMapSubView();
  } else if (state.tripSubView === 'packing') {
    renderPackingSubView();
  }
}


/* ==========================================================================
   SOTTO-VISTA VALIGIA & CHECKLIST NELLA TAB VIAGGIO
   ========================================================================== */
function renderPackingSubView() {
  const container = document.getElementById('tripSubViewContainer');
  if (!container || !state.activeTrip) return;

  const trip = state.activeTrip;
  const preTrip = trip.preTripChecklist || [];
  const items = trip.packingList || [];
  const totalItems = preTrip.length + items.length;
  const checkedItems = preTrip.filter(i => i.checked).length + items.filter(i => i.checked).length;
  const progressPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  let html = `
    <!-- Card Avanzamento & Template Rapidi -->
    <div class="glass-card packing-progress-bar-container" style="margin-bottom:14px; padding:16px;">
      <div class="progress-info-row" style="margin-bottom:8px;">
        <span style="font-weight:700; color:var(--text-primary); font-size:14px;">Preparativi di Viaggio</span>
        <span class="tabular-nums" style="color:var(--accent); font-weight:800; font-size:14px;">${checkedItems}/${totalItems} (${progressPercent}%)</span>
      </div>
      <div class="progress-track" style="margin-bottom:12px;">
        <div class="progress-fill" style="width: ${progressPercent}%;"></div>
      </div>

      <!-- Template Rapidi Viaggio -->
      <div style="font-size:11.5px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin-bottom:8px;">
        Template Rapidi
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn-glass-pill" id="btnApplyTemplateWeekend" style="padding:6px 12px; font-size:12px;">
          🧳 Weekend
        </button>
        <button class="btn-glass-pill" id="btnApplyTemplateLong" style="padding:6px 12px; font-size:12px;">
          ✈️ Viaggio Lungo
        </button>
        <button class="btn-glass-pill" id="btnApplyTemplateWork" style="padding:6px 12px; font-size:12px;">
          💼 Trasferta
        </button>
        <button class="btn-glass-pill" id="btnTripOpenAllTemplates" style="padding:6px 12px; font-size:12px;">
          Tutti i Template →
        </button>
      </div>
    </div>

    <!-- Prima di Partire (Checklist Preliminare) -->
    <div class="glass-card pre-trip-section" style="margin-bottom:14px; padding:14px 16px;">
      <div class="card-title-label" style="margin-bottom:12px; font-weight:700; color:var(--accent); display:flex; align-items:center; gap:6px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        <span>Prima di partire</span>
      </div>
      <div class="accordion-body">
  `;

  preTrip.forEach(item => {
    html += `
      <div class="check-item-row ${item.checked ? 'checked' : ''}" data-pre-trip-id="${item.id}">
        <div class="check-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <span class="check-text">${escapeHTML(item.text)}</span>
      </div>
    `;
  });

  html += `</div></div>`;

  // Categorie Valigia
  const categories = ['Documenti', 'Tech', 'Abbigliamento', 'Farmaci', 'Extra'];
  categories.forEach(cat => {
    const catItems = items.filter(i => i.category === cat);
    html += `
      <div class="checklist-accordion-group" style="margin-bottom:10px;">
        <div class="accordion-header" data-toggle-cat="${cat}">
          <span>${cat} <span style="font-size:12px; font-weight:600; color:var(--text-tertiary);">(${catItems.filter(i => i.checked).length}/${catItems.length})</span></span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div class="accordion-body" id="sub_cat_body_${cat}">
    `;

    catItems.forEach(item => {
      html += `
        <div class="check-item-row ${item.checked ? 'checked' : ''}" data-sub-item-id="${item.id}">
          <div class="check-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <span class="check-text">${escapeHTML(item.text)}</span>
          <button class="check-delete-btn" data-sub-del-id="${item.id}">✕</button>
        </div>
      `;
    });

    html += `
        <div style="display:flex; gap:8px; margin-top:8px;">
          <input type="text" class="form-input input-sub-quick-add" data-cat="${cat}" placeholder="+ Aggiungi a ${cat}..." style="padding:8px 12px; font-size:13px; flex:1;">
          <button class="btn-glass-pill btn-sub-quick-add" data-cat="${cat}" style="padding:8px 14px;">Aggiungi</button>
        </div>
      </div>
    </div>`;
  });

  container.innerHTML = html;

  // Bind checklist pre-trip
  container.querySelectorAll('[data-pre-trip-id]').forEach(row => {
    row.addEventListener('click', async () => {
      const id = row.getAttribute('data-pre-trip-id');
      const target = trip.preTripChecklist.find(i => i.id === id);
      if (target) {
        target.checked = !target.checked;
        await putToStore('trips_store', trip);
        renderPackingSubView();
      }
    });
  });

  // Bind packing items
  container.querySelectorAll('[data-sub-item-id]').forEach(row => {
    row.addEventListener('click', async (e) => {
      if (e.target.closest('.check-delete-btn')) return;
      const id = row.getAttribute('data-sub-item-id');
      const target = trip.packingList.find(i => i.id === id);
      if (target) {
        target.checked = !target.checked;
        await putToStore('trips_store', trip);
        renderPackingSubView();
      }
    });
  });

  // Bind packing item delete
  container.querySelectorAll('[data-sub-del-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-sub-del-id');
      trip.packingList = trip.packingList.filter(i => i.id !== id);
      await putToStore('trips_store', trip);
      renderPackingSubView();
    });
  });

  // Bind quick add item
  container.querySelectorAll('.btn-sub-quick-add').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cat = btn.getAttribute('data-cat');
      const input = container.querySelector(`.input-sub-quick-add[data-cat="${cat}"]`);
      if (input && input.value.trim()) {
        trip.packingList = trip.packingList || [];
        trip.packingList.push({
          id: 'pk_' + Date.now(),
          category: cat,
          text: input.value.trim(),
          checked: false
        });
        await putToStore('trips_store', trip);
        renderPackingSubView();
      }
    });
  });

  // Accordion toggle
  container.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const cat = header.getAttribute('data-toggle-cat');
      const b = document.getElementById(`sub_cat_body_${cat}`);
      if (b) {
        b.classList.toggle('hidden');
        header.classList.toggle('collapsed');
      }
    });
  });

  // Template Quick Buttons
  const applyPredefinedTemplate = async (itemsToAdd) => {
    trip.packingList = trip.packingList || [];
    let addedCount = 0;
    itemsToAdd.forEach(it => {
      if (!trip.packingList.some(p => p.text.toLowerCase() === it.text.toLowerCase())) {
        trip.packingList.push({
          id: 'pk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          category: it.category,
          text: it.text,
          checked: false
        });
        addedCount++;
      }
    });
    await putToStore('trips_store', trip);
    showToast(`Aggiunti ${addedCount} oggetti alla valigia!`);
    renderPackingSubView();
  };

  document.getElementById('btnApplyTemplateWeekend')?.addEventListener('click', () => {
    applyPredefinedTemplate([
      { category: 'Abbigliamento', text: '3x Cambi intimi e calze' },
      { category: 'Abbigliamento', text: '2x T-shirt / polo' },
      { category: 'Abbigliamento', text: 'Giacca leggera anti-vento' },
      { category: 'Tech', text: 'Caricatore compatto USB-C' },
      { category: 'Farmaci', text: 'Pillole da viaggio essenziali' }
    ]);
  });

  document.getElementById('btnApplyTemplateLong')?.addEventListener('click', () => {
    applyPredefinedTemplate([
      { category: 'Abbigliamento', text: '7x Cambi completi e intimi' },
      { category: 'Abbigliamento', text: 'Giacca impermeabile' },
      { category: 'Tech', text: 'Adattatore universale da viaggio' },
      { category: 'Tech', text: 'Powerbank 20000mAh' },
      { category: 'Farmaci', text: 'Kit primo soccorso completo' },
      { category: 'Documenti', text: 'Fotocopie passaporto e visti' }
    ]);
  });

  document.getElementById('btnApplyTemplateWork')?.addEventListener('click', () => {
    applyPredefinedTemplate([
      { category: 'Tech', text: 'Laptop e caricatore aziendale' },
      { category: 'Tech', text: 'Cuffie con cancellazione rumore' },
      { category: 'Abbigliamento', text: 'Camicia e abito elegante' },
      { category: 'Documenti', text: 'Biglietti da visita e badge' },
      { category: 'Tech', text: 'Cavo HDMI / adattatore display' }
    ]);
  });

  document.getElementById('btnTripOpenAllTemplates')?.addEventListener('click', () => {
    renderTemplatesSheetList();
    openSheet('sheetPackingTemplates');
  });
}

function renderPlanSubView() {
  const container = document.getElementById('tripSubViewContainer');
  if (!container || !state.activeTrip) return;

  const trip = state.activeTrip;
  const days = trip.itineraryDays || [];

  if (state.currentDayIndex >= days.length) {
    state.currentDayIndex = Math.max(0, days.length - 1);
  }

  let stripHtml = `<div class="days-horizontal-strip">`;
  days.forEach((day, idx) => {
    const dObj = new Date(day.date + 'T00:00:00');
    const dayName = dObj.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
    const isActive = idx === state.currentDayIndex;
    stripHtml += `
      <button class="day-pill-item ${isActive ? 'active' : ''}" data-day-index="${idx}">
        ${dayName}
      </button>
    `;
  });
  stripHtml += `
    <button class="day-pill-item" id="btnAddDayPill" style="border-style:dashed;">
      + Giorno
    </button>
  </div>`;

  const activeDay = days[state.currentDayIndex];
  let timelineHtml = '';

  if (activeDay) {
    timelineHtml += `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <h3 style="font-size:17px; font-weight:700;">${escapeHTML(activeDay.title || 'Itinerario del Giorno')}</h3>
        <button class="btn-glass-pill accent" id="btnOpenAddEvent">
          + Aggiungi Tappa
        </button>
      </div>
    `;

    if (activeDay.events && activeDay.events.length > 0) {
      timelineHtml += `<div class="timeline-list">`;
      const sortedEvents = [...activeDay.events].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      sortedEvents.forEach((ev) => {
        const mapsUrl = ev.location ? getNativeMapsUrl(ev.location) : '#';
        const hasCoords = ev.lat && ev.lng;
        timelineHtml += `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="glass-card timeline-content-card">
              <div class="event-time-category">
                <span class="event-time tabular-nums">${escapeHTML(ev.time)}</span>
                <span class="category-tag">${escapeHTML(ev.category || 'Tappa')}</span>
              </div>
              <div class="event-title">${escapeHTML(ev.title)}</div>
              ${ev.notes ? `<div class="event-notes">${escapeHTML(ev.notes)}</div>` : ''}
              
              <div class="event-actions">
                ${ev.location ? `
                  <button class="btn-mini-action btn-copy-event-loc" data-loc="${escapeHTML(ev.location)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copia
                  </button>
                  <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-mini-action">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
                    Apri Mappe
                  </a>
                ` : ''}

                ${hasCoords ? `
                  <button class="btn-mini-action btn-show-on-map" data-lat="${ev.lat}" data-lng="${ev.lng}" data-title="${escapeHTML(ev.title)}" style="color:var(--accent); font-weight:600;">
                    📍 Mostra su Mappa
                  </button>
                ` : ''}

                <button class="btn-mini-action btn-delete-event" data-event-id="${ev.id}" style="margin-left:auto; color:var(--text-quaternary);">
                  ✕
                </button>
              </div>
            </div>
          </div>
        `;
      });
      timelineHtml += `</div>`;
    } else {
      timelineHtml += `
        <div class="glass-card" style="text-align:center; padding:30px 16px;">
          <p style="color:var(--text-secondary); font-size:14px; margin-bottom:12px;">Nessuna tappa per questo giorno.</p>
          <button class="btn-glass-pill accent" id="btnEmptyAddEvent">+ Crea la prima tappa</button>
        </div>
      `;
    }
  }

  container.innerHTML = stripHtml + timelineHtml;

  // Bind giorni
  container.querySelectorAll('.day-pill-item[data-day-index]').forEach(pill => {
    pill.addEventListener('click', () => {
      state.currentDayIndex = parseInt(pill.getAttribute('data-day-index'), 10);
      renderPlanSubView();
    });
  });

  document.getElementById('btnAddDayPill')?.addEventListener('click', handleAddNewDay);
  document.getElementById('btnOpenAddEvent')?.addEventListener('click', openAddEventSheet);
  document.getElementById('btnEmptyAddEvent')?.addEventListener('click', openAddEventSheet);

  container.querySelectorAll('.btn-copy-event-loc').forEach(btn => {
    btn.addEventListener('click', () => {
      const loc = btn.getAttribute('data-loc');
      copyToClipboard(loc, `Indirizzo copiato: ${loc}`);
    });
  });

  container.querySelectorAll('.btn-show-on-map').forEach(btn => {
    btn.addEventListener('click', () => {
      const lat = parseFloat(btn.getAttribute('data-lat'));
      const lng = parseFloat(btn.getAttribute('data-lng'));
      const title = btn.getAttribute('data-title');
      state.tripSubView = 'map';
      renderTabTrip();
      setTimeout(() => {
        if (state.leafletMap) {
          state.leafletMap.flyTo([lat, lng], 15);
          startGuidanceRadar(title, lat, lng);
        }
      }, 300);
    });
  });

  container.querySelectorAll('.btn-delete-event').forEach(btn => {
    btn.addEventListener('click', async () => {
      const evId = btn.getAttribute('data-event-id');
      await deleteEvent(evId);
    });
  });
}

/* ==========================================================================
   VISTA MAPPA OFFLINE + GPS REALE + BUSSOLA RADAR
   ========================================================================== */
function renderMapSubView() {
  const container = document.getElementById('tripSubViewContainer');
  if (!container || !state.activeTrip) return;

  const html = `
    <div class="map-view-wrapper">
      <div class="map-control-overlay-row">
        <button id="btnDownloadTiles" class="btn-glass-pill" style="font-size:12px; gap:4px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Scarica area offline
        </button>
        <button id="btnCenterGPS" class="btn-glass-pill accent" style="font-size:12px; gap:4px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
          Centra su di me
        </button>
      </div>

      <!-- Barra di progresso download tasselli -->
      <div id="tileDownloadProgressBox" style="display:none; margin-top:2px;">
        <div class="progress-track" style="height:4px;">
          <div class="progress-fill" id="tileProgressFill" style="width:0%;"></div>
        </div>
        <div style="font-size:11px; color:var(--text-tertiary); margin-top:3px; text-align:right;" id="tileProgressLabel">0 / 0</div>
      </div>

      <!-- Barra Radar Direzionale AirTag (Attiva quando si seleziona "Guidami") -->
      <div id="radarCompassBar" class="glass-card radar-compass-card" style="display:none; margin-bottom:0;">
        <div class="radar-arrow-circle" id="radarArrowCircle">
          <!-- Freccia Bussola Verde Smeraldo rivolta in alto -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </div>
        <div class="radar-info-box">
          <div class="radar-target-title" id="radarTargetTitle">Destinazione</div>
          <div class="radar-distance-val tabular-nums" id="radarDistanceVal">-- m</div>
        </div>
        <button id="btnStopRadar" class="btn-mini-action" style="color:var(--status-danger);">Chiudi</button>
      </div>

      <!-- Mappa Leaflet -->
      <div class="map-container-box">
        <div id="leafletMap"></div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Inizializza Leaflet Map
  setTimeout(initLeafletMapInstance, 100);

  document.getElementById('btnCenterGPS')?.addEventListener('click', centerMapOnUser);
  document.getElementById('btnDownloadTiles')?.addEventListener('click', downloadOfflineTilesForCurrentBounds);
  document.getElementById('btnStopRadar')?.addEventListener('click', stopGuidanceRadar);
}

function initLeafletMapInstance() {
  if (typeof L === 'undefined') {
    console.warn('Leaflet library non ancora caricata');
    return;
  }

  const mapElem = document.getElementById('leafletMap');
  if (!mapElem) return;

  if (state.leafletMap) {
    try {
      state.leafletMap.remove();
    } catch (e) {}
    state.leafletMap = null;
  }

  const hotel = state.activeTrip?.accommodation;
  const defaultCenter = (hotel && hotel.lat && hotel.lng) ? [hotel.lat, hotel.lng] : [31.2235, 121.4475];

  const map = L.map('leafletMap', {
    zoomControl: false,
    attributionControl: false
  }).setView(defaultCenter, 13);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Layer OpenStreetMap (con cache-first Service Worker)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(map);

  state.mapMarkersGroup = L.layerGroup().addTo(map);
  state.leafletMap = map;

  // Aggiungi marker Alloggio e Tappe
  populateMapTripMarkers();

  // Avvia GPS watchPosition reale
  startGPSWatching();
}

function populateMapTripMarkers() {
  if (!state.leafletMap || !state.mapMarkersGroup || !state.activeTrip) return;
  state.mapMarkersGroup.clearLayers();

  const hotel = state.activeTrip.accommodation;
  if (hotel && hotel.lat && hotel.lng) {
    const hotelMarker = L.circleMarker([hotel.lat, hotel.lng], {
      radius: 9,
      fillColor: '#15803D',
      color: '#ffffff',
      weight: 3,
      fillOpacity: 1
    }).addTo(state.mapMarkersGroup);

    hotelMarker.bindPopup(`
      <div style="font-family:inherit;">
        <strong>🏨 ${escapeHTML(hotel.name || 'Alloggio')}</strong><br>
        <span style="font-size:12px; color:#555;">${escapeHTML(hotel.address || '')}</span><br>
        <button style="margin-top:6px; background:#15803D; color:#fff; border:none; padding:4px 10px; border-radius:12px; font-weight:700; cursor:pointer;" onclick="window._nomadStartGuidance('${escapeHTML(hotel.name)}', ${hotel.lat}, ${hotel.lng})">Guidami 🧭</button>
      </div>
    `);
  }

  const days = state.activeTrip.itineraryDays || [];
  days.forEach(day => {
    (day.events || []).forEach(ev => {
      if (ev.lat && ev.lng) {
        const evMarker = L.circleMarker([ev.lat, ev.lng], {
          radius: 7,
          fillColor: '#34D399',
          color: '#15803D',
          weight: 2,
          fillOpacity: 0.95
        }).addTo(state.mapMarkersGroup);

        evMarker.bindPopup(`
          <div style="font-family:inherit;">
            <strong>📍 ${escapeHTML(ev.title)}</strong><br>
            <span style="font-size:12px; color:#555;">${ev.time} • ${escapeHTML(ev.category || '')}</span><br>
            <button style="margin-top:6px; background:#15803D; color:#fff; border:none; padding:4px 10px; border-radius:12px; font-weight:700; cursor:pointer;" onclick="window._nomadStartGuidance('${escapeHTML(ev.title)}', ${ev.lat}, ${ev.lng})">Guidami 🧭</button>
          </div>
        `);
      }
    });
  });
}

// Handler globale richiamabile dai popup Leaflet
window._nomadStartGuidance = (title, lat, lng) => {
  startGuidanceRadar(title, lat, lng);
};

/* ==========================================================================
   GPS REALE & RADAR GUIDAMI (Bussola + Bearing Haversine)
   ========================================================================== */
function startGPSWatching() {
  if (!('geolocation' in navigator)) return;

  if (state.watchPositionId !== null) {
    navigator.geolocation.clearWatch(state.watchPositionId);
  }

  state.watchPositionId = navigator.geolocation.watchPosition(
    (pos) => {
      state.userCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };

      updateUserMapMarker();
      updateGuidanceCalculations();
    },
    (err) => {
      console.warn('Geolocation watch error:', err.message);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
  );
}

function updateUserMapMarker() {
  if (!state.leafletMap || !state.userCoords) return;

  const latLng = [state.userCoords.lat, state.userCoords.lng];

  if (!state.userLocationMarker) {
    state.userLocationMarker = L.circleMarker(latLng, {
      radius: 8,
      fillColor: '#0284c7',
      color: '#ffffff',
      weight: 3,
      fillOpacity: 1
    }).addTo(state.leafletMap);
  } else {
    state.userLocationMarker.setLatLng(latLng);
  }
}

function centerMapOnUser() {
  if (!state.leafletMap) return;
  if (state.userCoords) {
    state.leafletMap.flyTo([state.userCoords.lat, state.userCoords.lng], 16);
    showToast('Mappa centrata sulla tua posizione GPS');
  } else {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        updateUserMapMarker();
        state.leafletMap.flyTo([state.userCoords.lat, state.userCoords.lng], 16);
        showToast('Posizione GPS acquisita');
      },
      () => showToast('Posizione GPS non disponibile offline')
    );
  }
}

function setupCompassListener() {
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (e) => {
      // In iOS webkitCompassHeading, in Android alpha
      if (e.webkitCompassHeading !== undefined) {
        state.deviceAlphaHeading = e.webkitCompassHeading;
      } else if (e.alpha !== null) {
        state.deviceAlphaHeading = 360 - e.alpha;
      }
      updateGuidanceCalculations();
    }, true);
  }
}

function startGuidanceRadar(title, targetLat, targetLng) {
  state.guidanceTarget = { title, lat: targetLat, lng: targetLng };

  const bar = document.getElementById('radarCompassBar');
  const titleElem = document.getElementById('radarTargetTitle');
  if (bar && titleElem) {
    titleElem.textContent = title;
    bar.style.display = 'flex';
  }

  // Se non abbiamo ancora il GPS, tenta una lettura immediata
  if (!state.userCoords) {
    navigator.geolocation.getCurrentPosition((pos) => {
      state.userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      updateUserMapMarker();
      drawGuidanceLine();
      updateGuidanceCalculations();
    });
  } else {
    drawGuidanceLine();
    updateGuidanceCalculations();
  }

  showToast(`Radar attivo verso: ${title}`);
}

function drawGuidanceLine() {
  if (!state.leafletMap || !state.userCoords || !state.guidanceTarget) return;

  if (state.guidanceLine) {
    state.leafletMap.removeLayer(state.guidanceLine);
    state.guidanceLine = null;
  }

  state.guidanceLine = L.polyline(
    [
      [state.userCoords.lat, state.userCoords.lng],
      [state.guidanceTarget.lat, state.guidanceTarget.lng]
    ],
    {
      color: '#15803D',
      weight: 4,
      dashArray: '8, 8'
    }
  ).addTo(state.leafletMap);
}

function stopGuidanceRadar() {
  state.guidanceTarget = null;
  const bar = document.getElementById('radarCompassBar');
  if (bar) bar.style.display = 'none';

  if (state.guidanceLine && state.leafletMap) {
    state.leafletMap.removeLayer(state.guidanceLine);
    state.guidanceLine = null;
  }
}

function updateGuidanceCalculations() {
  if (!state.guidanceTarget || !state.userCoords) return;

  const distMeters = calculateHaversineDistance(
    state.userCoords.lat,
    state.userCoords.lng,
    state.guidanceTarget.lat,
    state.guidanceTarget.lng
  );

  const distElem = document.getElementById('radarDistanceVal');
  if (distElem) {
    if (distMeters < 1000) {
      distElem.textContent = `${Math.round(distMeters)} m`;
    } else {
      distElem.textContent = `${(distMeters / 1000).toFixed(1)} km`;
    }
  }

  // Calcola bearing geografico dalla posizione utente alla meta
  const bearing = calculateBearing(
    state.userCoords.lat,
    state.userCoords.lng,
    state.guidanceTarget.lat,
    state.guidanceTarget.lng
  );

  // Differenza rispetto all'orientamento bussola del telefono
  const arrowAngle = (bearing - state.deviceAlphaHeading + 360) % 360;
  const arrow = document.getElementById('radarArrowCircle');
  if (arrow) {
    arrow.style.transform = `rotate(${arrowAngle}deg)`;
  }

  // Aggiorna tracciato linea su mappa
  if (state.guidanceLine) {
    state.guidanceLine.setLatLngs([
      [state.userCoords.lat, state.userCoords.lng],
      [state.guidanceTarget.lat, state.guidanceTarget.lng]
    ]);
  }
}

// Formula di Haversine per distanza in metri
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Bearing azimutale in gradi (0-360)
function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

/**
 * Download tasselli offline per l'area inquadrata (zoom 12-16)
 * Salvataggio diretto nella cache 'nomad-map-tiles-v1'
 */
async function downloadOfflineTilesForCurrentBounds() {
  if (!state.leafletMap) return;
  if (!navigator.onLine) {
    showToast('Connettiti a internet per scaricare la mappa offline');
    return;
  }

  const bounds = state.leafletMap.getBounds();
  const minZoom = 12;
  const maxZoom = 15; // Zoom ottimale per area cittadina senza saturare memoria

  const progressBox = document.getElementById('tileDownloadProgressBox');
  const progressFill = document.getElementById('tileProgressFill');
  const progressLabel = document.getElementById('tileProgressLabel');

  if (progressBox) progressBox.style.display = 'block';

  // Calcola le coordinate dei tasselli
  const tileUrls = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const minTile = latLngToTileXY(bounds.getNorth(), bounds.getWest(), z);
    const maxTile = latLngToTileXY(bounds.getSouth(), bounds.getEast(), z);

    for (let x = Math.min(minTile.x, maxTile.x); x <= Math.max(minTile.x, maxTile.x); x++) {
      for (let y = Math.min(minTile.y, maxTile.y); y <= Math.max(minTile.y, maxTile.y); y++) {
        tileUrls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
      }
    }
  }

  // Limite sicurezza per non saturare la memoria in caso di zoom troppo ampio
  const urlsToDownload = tileUrls.slice(0, 350);
  let downloaded = 0;

  try {
    const cache = await caches.open('nomad-map-tiles-v1');
    for (const url of urlsToDownload) {
      try {
        const match = await cache.match(url);
        if (!match) {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res);
        }
      } catch (e) {}
      downloaded++;
      const pct = Math.round((downloaded / urlsToDownload.length) * 100);
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (progressLabel) progressLabel.textContent = `${downloaded} / ${urlsToDownload.length}`;
    }

    showToast(`Mappa offline salvata (${downloaded} tasselli in cache)!`);
  } catch (err) {
    showToast('Errore durante il download dei tasselli');
  } finally {
    setTimeout(() => {
      if (progressBox) progressBox.style.display = 'none';
    }, 2000);
  }
}

function latLngToTileXY(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

/* ==========================================================================
   TAB 3: WALLET (7 Categorie & Gate Mode)
   ========================================================================== */
/* ==========================================================================
   TAB 3: WALLET APPLE STYLE (3 BLOCCHI: TAXI & CODICI, DOCS, CASSAFORTE)
   ========================================================================== */
let vaultEnteredPin = '';

async function hashPinCode(pin) {
  if (window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode('nomad_vault_salt_' + pin);
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback se SubtleCrypto non è attivo (es. contesti http non sicuri)
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) - h) + pin.charCodeAt(i);
    h |= 0;
  }
  return 'fallback_' + h;
}

function getCategoryBadgeData(cat) {
  switch (cat) {
    case 'flight': return { label: '✈️ Volo', cls: 'badge-cat-flight' };
    case 'hotel':
    case 'accommodation': return { label: '🏨 Hotel', cls: 'badge-cat-hotel' };
    case 'train':
    case 'bus':
    case 'ferry': return { label: '🚆 Trasporti', cls: 'badge-cat-transport' };
    case 'event': return { label: '🎟️ Evento', cls: 'badge-cat-event' };
    case 'documents': return { label: '🛂 Visto / Assicurazione', cls: 'badge-cat-doc' };
    default: return { label: '📄 Altro', cls: 'badge-cat-doc' };
  }
}

function renderTabWallet() {
  const container = document.getElementById('walletTabContent');
  if (!container || !state.activeTrip) return;

  const trip = state.activeTrip;
  const hotel = trip.accommodation || {};
  const codes = trip.codes || {
    pnr: 'AF116-K89X4P',
    lockbox: 'A-7492#',
    wifi: 'PuLi_Guest / SilkRoad2026',
    insurance: 'Allianz Global Care — Polizza #IT-948190'
  };

  const files = state.walletFiles || [];
  const vaultPinHash = localStorage.getItem('nomad_vault_pin_hash');
  const isVaultTab = state.walletSubView === 'vault';

  // 1. BLOCCO 1: HEADER + PULSANTE AGGIUNGI
  let html = `
    <div class="wallet-header-row">
      <div>
        <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-primary); margin:0;">Apple Wallet</h2>
        <span style="font-size:12px; color:var(--text-secondary);">Pass, biglietti e documenti 100% offline</span>
      </div>
      <button class="wallet-add-btn-circle" id="btnOpenUploadFile" title="Aggiungi Documento" aria-label="Aggiungi Documento">
        +
      </button>
    </div>

    <!-- 2. BLOCCO 2: CARD RAPIDA TAXI & CODICI -->
    <div class="wallet-taxi-card">
      <div class="wallet-taxi-header">
        <div class="wallet-taxi-title">
          <span>🚕</span>
          <span>Taxi Card & Codici Rapidi</span>
        </div>
        <button id="btnWalletEditTripCodes" class="btn-glass-pill" style="padding:4px 10px; font-size:11.5px; font-weight:600;">
          ✎ Modifica
        </button>
      </div>

      <div class="wallet-taxi-address">
        <strong>${escapeHTML(hotel.nameLocal || hotel.name || 'Alloggio Principale')}</strong>
        ${hotel.addressLocal ? `<div style="font-size:13px; font-weight:600; color:var(--text-primary); margin-top:2px;">${escapeHTML(hotel.addressLocal)}</div>` : ''}
        ${hotel.address ? `<div style="font-size:11.5px; color:var(--text-tertiary);">${escapeHTML(hotel.address)}</div>` : ''}
      </div>

      <div class="wallet-taxi-actions">
        <button id="btnWalletOpenTaxiCard" class="btn-glass-pill accent" style="width:100%; justify-content:center; padding:9px 14px; font-size:13px; font-weight:700;">
          🚕 Apri Taxi Card (Schermo Intero)
        </button>
      </div>

      <div class="wallet-taxi-codes-grid">
        ${codes.pnr ? `
          <div class="wallet-code-chip" data-copy-val="${escapeHTML(codes.pnr)}" data-copy-desc="PNR Volo">
            <div class="wallet-code-info">
              <span class="wallet-code-label">PNR Volo</span>
              <span class="wallet-code-val tabular-nums">${escapeHTML(codes.pnr)}</span>
            </div>
            <span style="font-size:12px; color:var(--text-tertiary);">📋</span>
          </div>
        ` : ''}
        ${codes.lockbox ? `
          <div class="wallet-code-chip" data-copy-val="${escapeHTML(codes.lockbox)}" data-copy-desc="Codice Porta">
            <div class="wallet-code-info">
              <span class="wallet-code-label">Lockbox</span>
              <span class="wallet-code-val tabular-nums">${escapeHTML(codes.lockbox)}</span>
            </div>
            <span style="font-size:12px; color:var(--text-tertiary);">📋</span>
          </div>
        ` : ''}
        ${codes.wifi ? `
          <div class="wallet-code-chip" data-copy-val="${escapeHTML(codes.wifi)}" data-copy-desc="Password Wi-Fi">
            <div class="wallet-code-info">
              <span class="wallet-code-label">Wi-Fi</span>
              <span class="wallet-code-val">${escapeHTML(codes.wifi)}</span>
            </div>
            <span style="font-size:12px; color:var(--text-tertiary);">📋</span>
          </div>
        ` : ''}
      </div>
    </div>

    <!-- 3. BLOCCO 3: SEGMENTED CONTROL (DOCUMENTI | CASSAFORTE) -->
    <div style="margin-bottom:14px;">
      <div class="trans-segmented-bar">
        <button class="trans-segmented-btn ${!isVaultTab ? 'active' : ''}" id="btnWalletTabDocs">
          📄 Documenti (${files.filter(f => !f.inVault).length})
        </button>
        <button class="trans-segmented-btn ${isVaultTab ? 'active' : ''}" id="btnWalletTabVault">
          🔒 Cassaforte (${files.filter(f => f.inVault).length})
        </button>
      </div>
    </div>
  `;

  // CONTENUTO TAB DOCUMENTI NORMALI
  if (!isVaultTab) {
    const filterCategories = [
      { id: 'Tutti', label: 'Tutti', icon: '🗂️' },
      { id: 'flight', label: 'Volo', icon: '✈️' },
      { id: 'hotel', label: 'Hotel', icon: '🏨' },
      { id: 'train', label: 'Trasporti', icon: '🚆' },
      { id: 'event', label: 'Eventi', icon: '🎟️' },
      { id: 'documents', label: 'Visti/Assicurazione', icon: '🛂' }
    ];

    html += `<div class="wallet-filter-strip">`;
    filterCategories.forEach(c => {
      const isActive = state.activeWalletFilter === c.id;
      html += `
        <button class="wallet-filter-item ${isActive ? 'active' : ''}" data-filter="${c.id}">
          <span>${c.icon}</span>
          <span>${c.label}</span>
        </button>
      `;
    });
    html += `</div>`;

    const docFiles = files.filter(f => !f.inVault);
    const filteredFiles = docFiles.filter(f => {
      if (state.activeWalletFilter === 'Tutti') return true;
      if (state.activeWalletFilter === 'train') return f.category === 'train' || f.category === 'bus' || f.category === 'ferry';
      if (state.activeWalletFilter === 'hotel') return f.category === 'hotel' || f.category === 'accommodation';
      return f.category === state.activeWalletFilter;
    });

    if (filteredFiles.length > 0) {
      html += `<div class="wallet-grid">`;
      filteredFiles.forEach(file => {
        const isPdf = file.type === 'application/pdf';
        const badge = getCategoryBadgeData(file.category);

        html += `
          <div class="glass-card wallet-card" data-file-id="${file.id}">
            <div class="wallet-preview-box">
              ${isPdf ? `
                <div class="wallet-pdf-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                  <span style="font-size:11px; font-weight:700;">PDF DOCUMENT</span>
                </div>
              ` : `
                <img class="wallet-preview-img" id="thumb_${file.id}" alt="${escapeHTML(file.title)}">
              `}
            </div>

            <div style="margin-bottom:4px;">
              <span class="taxi-badge ${badge.cls}" style="font-size:10px; padding:2px 6px;">${badge.label}</span>
            </div>
            <div class="wallet-card-title">${escapeHTML(file.title)}</div>
            ${file.notes ? `<div style="font-size:11px; color:var(--text-tertiary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px;">${escapeHTML(file.notes)}</div>` : ''}
            <div style="font-size:10.5px; color:var(--text-quaternary);">${formatFileSize(file.size)}</div>

            <!-- Azioni Rapide sulla Card -->
            <div class="wallet-card-actions">
              <button class="wallet-action-btn ${file.isPinned ? 'active' : ''}" data-action="pin" data-file-id="${file.id}" title="${file.isPinned ? 'Rimuovi da Dashboard' : 'Pinna in Dashboard'}" aria-label="Pin">
                📌
              </button>
              <button class="wallet-action-btn" data-action="toggle-vault" data-file-id="${file.id}" title="Sposta in Cassaforte" aria-label="Cassaforte">
                🔒
              </button>
              <button class="wallet-action-btn" data-action="gate" data-file-id="${file.id}" title="Modalità Gate" aria-label="Gate">
                ⛶
              </button>
              <button class="wallet-action-btn" data-action="delete" data-file-id="${file.id}" title="Elimina" aria-label="Elimina" style="color:#EF4444;">
                🗑
              </button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    } else {
      html += `
        <div class="glass-card" style="text-align:center; padding:32px 16px; border-radius:14px;">
          <p style="color:var(--text-secondary); font-size:13.5px; margin-bottom:12px;">Nessun pass o documento in questa sezione.</p>
          <button class="btn-glass-pill accent" id="btnEmptyUploadFile">+ Aggiungi Documento</button>
        </div>
      `;
    }
  } else {
    // CONTENUTO TAB CASSAFORTE 🔒
    const vaultFiles = files.filter(f => f.inVault);

    if (!state.vaultUnlocked) {
      // Schermata di sblocco PIN
      html += `
        <div class="glass-card vault-pin-container">
          <div style="font-size:38px; margin-bottom:8px;">🔒</div>
          <h3 style="font-size:16px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">
            ${vaultPinHash ? 'Cassaforte Protetta' : 'Imposta il tuo PIN'}
          </h3>
          <p style="font-size:12.5px; color:var(--text-secondary); max-width:280px; margin-bottom:6px;">
            ${vaultPinHash ? 'Inserisci il PIN a 4 cifre per accedere ai tuoi documenti sensibili.' : 'Crea un PIN a 4 cifre per proteggere passaporto, carte e visti.'}
          </p>

          <div class="vault-pin-dots">
            <div class="vault-pin-dot ${vaultEnteredPin.length >= 1 ? 'filled' : ''}"></div>
            <div class="vault-pin-dot ${vaultEnteredPin.length >= 2 ? 'filled' : ''}"></div>
            <div class="vault-pin-dot ${vaultEnteredPin.length >= 3 ? 'filled' : ''}"></div>
            <div class="vault-pin-dot ${vaultEnteredPin.length >= 4 ? 'filled' : ''}"></div>
          </div>

          <div class="vault-keypad">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => `
              <button class="vault-key-btn" data-key="${num}">${num}</button>
            `).join('')}
            <button class="vault-key-btn" data-key="clear" style="font-size:15px; color:var(--text-tertiary);">✕</button>
            <button class="vault-key-btn" data-key="0">0</button>
            <button class="vault-key-btn" data-key="backspace" style="font-size:18px;">⌫</button>
          </div>
        </div>
      `;
    } else {
      // Cassaforte SBLOCCATA
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding:10px 14px; border-radius:12px; background:rgba(16, 185, 129, 0.10); border:1px solid rgba(16, 185, 129, 0.25);">
          <div style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:var(--accent);">
            <span>🔓</span>
            <span>Cassaforte Sbloccata</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button id="btnVaultChangePin" style="background:none; border:none; color:var(--text-secondary); font-size:11.5px; cursor:pointer; text-decoration:underline;">
              Cambia PIN
            </button>
            <button id="btnVaultLockNow" class="btn-glass-pill" style="padding:4px 10px; font-size:11.5px; font-weight:700;">
              🔒 Blocca ora
            </button>
          </div>
        </div>
      `;

      if (vaultFiles.length > 0) {
        html += `<div class="wallet-grid">`;
        vaultFiles.forEach(file => {
          const isPdf = file.type === 'application/pdf';
          const badge = getCategoryBadgeData(file.category);

          html += `
            <div class="glass-card wallet-card" data-file-id="${file.id}">
              <div class="wallet-preview-box">
                ${isPdf ? `
                  <div class="wallet-pdf-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                    <span style="font-size:11px; font-weight:700;">PDF PROTETTO</span>
                  </div>
                ` : `
                  <img class="wallet-preview-img" id="thumb_${file.id}" alt="${escapeHTML(file.title)}">
                `}
              </div>

              <div style="margin-bottom:4px;">
                <span class="taxi-badge ${badge.cls}" style="font-size:10px; padding:2px 6px;">${badge.label}</span>
              </div>
              <div class="wallet-card-title">${escapeHTML(file.title)}</div>
              ${file.notes ? `<div style="font-size:11px; color:var(--text-tertiary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px;">${escapeHTML(file.notes)}</div>` : ''}
              <div style="font-size:10.5px; color:var(--text-quaternary);">${formatFileSize(file.size)}</div>

              <!-- Azioni Rapide sulla Card -->
              <div class="wallet-card-actions">
                <button class="wallet-action-btn ${file.isPinned ? 'active' : ''}" data-action="pin" data-file-id="${file.id}" title="${file.isPinned ? 'Rimuovi da Dashboard' : 'Pinna in Dashboard'}" aria-label="Pin">
                  📌
                </button>
                <button class="wallet-action-btn active" data-action="toggle-vault" data-file-id="${file.id}" title="Rimuovi da Cassaforte" aria-label="Togli da Cassaforte">
                  🔓
                </button>
                <button class="wallet-action-btn" data-action="gate" data-file-id="${file.id}" title="Modalità Gate" aria-label="Gate">
                  ⛶
                </button>
                <button class="wallet-action-btn" data-action="delete" data-file-id="${file.id}" title="Elimina" aria-label="Elimina" style="color:#EF4444;">
                  🗑
                </button>
              </div>
            </div>
          `;
        });
        html += `</div>`;
      } else {
        html += `
          <div class="glass-card" style="text-align:center; padding:32px 16px; border-radius:14px;">
            <p style="color:var(--text-secondary); font-size:13.5px; margin-bottom:12px;">Nessun documento in cassaforte.</p>
            <button class="btn-glass-pill accent" id="btnEmptyUploadVaultFile">+ Aggiungi Documento Protetto</button>
          </div>
        `;
      }
    }
  }

  container.innerHTML = html;

  // Caricamento miniature asincrono
  files.forEach(file => {
    if (!file.type.includes('pdf')) {
      const imgElem = document.getElementById(`thumb_${file.id}`);
      if (imgElem && file.blob) {
        const url = URL.createObjectURL(file.blob);
        imgElem.src = url;
        imgElem.onload = () => URL.revokeObjectURL(url);
      }
    }
  });

  // BINDING EVENTI
  // Toggle Tab Documenti / Cassaforte
  document.getElementById('btnWalletTabDocs')?.addEventListener('click', () => {
    state.walletSubView = 'docs';
    renderTabWallet();
  });
  document.getElementById('btnWalletTabVault')?.addEventListener('click', () => {
    state.walletSubView = 'vault';
    vaultEnteredPin = '';
    renderTabWallet();
  });

  // Apri Taxi Card e Modifica Alloggio
  document.getElementById('btnWalletOpenTaxiCard')?.addEventListener('click', () => openTaxiCard());
  document.getElementById('btnWalletEditTripCodes')?.addEventListener('click', () => {
    openEditTripSheet(state.activeTrip);
  });

  // Copia codici rapidi
  container.querySelectorAll('.wallet-code-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const val = chip.getAttribute('data-copy-val');
      const desc = chip.getAttribute('data-copy-desc') || 'Codice';
      if (val) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(val);
          }
          showToast(`${desc} copiato!`);
        } catch (e) {
          showToast(`Copiato: ${val}`);
        }
      }
    });
  });

  // Filtri pillola Documenti
  container.querySelectorAll('.wallet-filter-item').forEach(pill => {
    pill.addEventListener('click', () => {
      state.activeWalletFilter = pill.getAttribute('data-filter');
      renderTabWallet();
    });
  });

  // Tasti Aggiungi Documento
  document.getElementById('btnOpenUploadFile')?.addEventListener('click', () => openWalletUploadModal(false));
  document.getElementById('btnEmptyUploadFile')?.addEventListener('click', () => openWalletUploadModal(false));
  document.getElementById('btnEmptyUploadVaultFile')?.addEventListener('click', () => openWalletUploadModal(true));

  // Azioni sulle card (Pin, Toggle Vault, Gate, Delete)
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const fileId = btn.getAttribute('data-file-id');
      const file = files.find(f => f.id === fileId);
      if (!file) return;

      if (action === 'pin') {
        file.isPinned = !file.isPinned;
        await putToStore('files_store', file);
        await refreshApplicationData();
        showToast(file.isPinned ? 'Pinnato in Dashboard' : 'Rimosso dalla Dashboard');
      } else if (action === 'toggle-vault') {
        file.inVault = !file.inVault;
        await putToStore('files_store', file);
        await refreshApplicationData();
        showToast(file.inVault ? 'Spostato in Cassaforte 🔒' : 'Spostato in Documenti standard');
      } else if (action === 'gate') {
        openGateMode(file);
      } else if (action === 'delete') {
        if (confirm(`Eliminare definitivamente "${file.title}"?`)) {
          await deleteFromStore('files_store', file.id);
          await refreshApplicationData();
          showToast('Documento eliminato');
        }
      }
    });
  });

  // Tap su card intera -> Modalità Gate
  container.querySelectorAll('.wallet-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      const fileId = card.getAttribute('data-file-id');
      const file = files.find(f => f.id === fileId);
      if (file) openGateMode(file);
    });
  });

  // Tasti Cassaforte (Sblocco, Tastierino PIN, Cambio PIN)
  if (isVaultTab && !state.vaultUnlocked) {
    container.querySelectorAll('.vault-key-btn').forEach(keyBtn => {
      keyBtn.addEventListener('click', async () => {
        const k = keyBtn.getAttribute('data-key');
        if (k === 'clear') {
          vaultEnteredPin = '';
          renderTabWallet();
        } else if (k === 'backspace') {
          vaultEnteredPin = vaultEnteredPin.slice(0, -1);
          renderTabWallet();
        } else if (vaultEnteredPin.length < 4) {
          vaultEnteredPin += k;
          renderTabWallet();

          if (vaultEnteredPin.length === 4) {
            setTimeout(async () => {
              const currentHash = localStorage.getItem('nomad_vault_pin_hash');
              const enteredHash = await hashPinCode(vaultEnteredPin);

              if (!currentHash) {
                // Primo setup PIN
                localStorage.setItem('nomad_vault_pin_hash', enteredHash);
                state.vaultUnlocked = true;
                vaultEnteredPin = '';
                showToast('PIN Cassaforte impostato con successo!');
                renderTabWallet();
              } else if (currentHash === enteredHash) {
                // PIN corretto
                state.vaultUnlocked = true;
                vaultEnteredPin = '';
                showToast('Cassaforte sbloccata');
                renderTabWallet();
              } else {
                // PIN errato
                vaultEnteredPin = '';
                showToast('PIN errato, riprova');
                renderTabWallet();
              }
            }, 120);
          }
        }
      });
    });
  }

  // Blocca ora / Cambia PIN
  document.getElementById('btnVaultLockNow')?.addEventListener('click', () => {
    state.vaultUnlocked = false;
    showToast('Cassaforte bloccata');
    renderTabWallet();
  });

  document.getElementById('btnVaultChangePin')?.addEventListener('click', async () => {
    const oldPin = prompt('Inserisci il PIN attuale a 4 cifre:');
    if (!oldPin) return;
    const currentHash = localStorage.getItem('nomad_vault_pin_hash');
    const oldHash = await hashPinCode(oldPin);
    if (oldHash !== currentHash) {
      showToast('PIN attuale errato');
      return;
    }
    const newPin = prompt('Inserisci il NUOVO PIN a 4 cifre:');
    if (newPin && newPin.length === 4 && /^\d+$/.test(newPin)) {
      const newHash = await hashPinCode(newPin);
      localStorage.setItem('nomad_vault_pin_hash', newHash);
      showToast('Nuovo PIN impostato!');
    } else {
      showToast('PIN non valido (richieste 4 cifre)');
    }
  });
}

/* ==========================================================================
   OVERLAY: TAXI CARD & GATE MODE
   ========================================================================== */
async function openTaxiCard() {
  const overlay = document.getElementById('taxiCardOverlay');
  if (!overlay || !state.activeTrip) return;

  const hotel = state.activeTrip.accommodation || {};
  document.getElementById('taxiHotelName').textContent = hotel.name || 'Alloggio';
  document.getElementById('taxiHotelLocal').textContent = hotel.nameLocal || hotel.addressLocal || hotel.address || 'Indirizzo non impostato';
  document.getElementById('taxiHotelLatin').textContent = hotel.address || '';

  const callBtn = document.getElementById('taxiCallBtn');
  if (hotel.phone) {
    callBtn.href = `tel:${hotel.phone.replace(/\s+/g, '')}`;
    callBtn.style.display = 'flex';
    document.getElementById('taxiCallText').textContent = `Chiama Alloggio (${hotel.phone})`;
  } else {
    callBtn.style.display = 'none';
  }

  overlay.classList.add('active');
  await acquireWakeLock();
}

function closeTaxiCard() {
  const overlay = document.getElementById('taxiCardOverlay');
  if (overlay) overlay.classList.remove('active');
  releaseWakeLock();
}

async function openGateMode(fileRecord) {
  state.activeGateFileRecord = fileRecord;
  const overlay = document.getElementById('gateModeOverlay');
  const container = document.getElementById('gateContentContainer');
  if (!overlay || !container || !fileRecord.blob) return;

  if (state.currentGateDocBlobUrl) {
    URL.revokeObjectURL(state.currentGateDocBlobUrl);
    state.currentGateDocBlobUrl = null;
  }

  state.currentGateDocBlobUrl = URL.createObjectURL(fileRecord.blob);
  document.getElementById('gateDocTitle').textContent = fileRecord.title;

  // Stato icona Pin in header Gate Mode
  const pinBtn = document.getElementById('btnGateTogglePin');
  if (pinBtn) {
    pinBtn.style.color = fileRecord.isPinned ? 'var(--accent)' : '#888';
    pinBtn.onclick = async () => {
      fileRecord.isPinned = !fileRecord.isPinned;
      await putToStore('files_store', fileRecord);
      pinBtn.style.color = fileRecord.isPinned ? 'var(--accent)' : '#888';
      await refreshApplicationData();
      showToast(fileRecord.isPinned ? 'Pinnato in Dashboard' : 'Rimosso dalla Dashboard');
    };
  }

  if (fileRecord.type === 'application/pdf') {
    container.innerHTML = `<iframe src="${state.currentGateDocBlobUrl}" class="gate-pdf-iframe"></iframe>`;
  } else {
    container.innerHTML = `<img src="${state.currentGateDocBlobUrl}" class="gate-image" id="gateImageEl" alt="${escapeHTML(fileRecord.title)}">`;
    const imgEl = document.getElementById('gateImageEl');
    imgEl?.addEventListener('click', () => {
      imgEl.classList.toggle('zoomed');
    });
  }

  const btnZoom = document.getElementById('btnGateZoom');
  if (btnZoom) {
    btnZoom.onclick = () => {
      const imgEl = document.getElementById('gateImageEl');
      if (imgEl) imgEl.classList.toggle('zoomed');
    };
  }

  const btnDownload = document.getElementById('btnGateDownload');
  btnDownload.onclick = () => {
    const a = document.createElement('a');
    a.href = state.currentGateDocBlobUrl;
    a.download = fileRecord.name || 'document';
    a.click();
    showToast('Download avviato');
  };

  const btnDelete = document.getElementById('btnGateDelete');
  btnDelete.onclick = async () => {
    if (confirm('Eliminare questo documento dal wallet?')) {
      await deleteFromStore('files_store', fileRecord.id);
      closeGateMode();
      await refreshApplicationData();
      showToast('Documento eliminato');
    }
  };

  overlay.classList.add('active');
  await acquireWakeLock();
}

function closeGateMode() {
  const overlay = document.getElementById('gateModeOverlay');
  if (overlay) overlay.classList.remove('active');

  if (state.currentGateDocBlobUrl) {
    URL.revokeObjectURL(state.currentGateDocBlobUrl);
    state.currentGateDocBlobUrl = null;
  }
  document.getElementById('gateContentContainer').innerHTML = '';
  releaseWakeLock();
}

async function acquireWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      state.wakeLockSentinel = await navigator.wakeLock.request('screen');
      state.wakeLockSentinel.addEventListener('release', () => {
        state.wakeLockSentinel = null;
      });
    } catch (err) {
      console.warn('Wake Lock non disponibile o rifiutato:', err);
    }
  }
}

function releaseWakeLock() {
  if (state.wakeLockSentinel) {
    state.wakeLockSentinel.release().catch(() => {});
    state.wakeLockSentinel = null;
  }
}

/* ==========================================================================
   TAB 4: SPESE (Budget, Cronologia & Mini-Splitwise "Saldi Gruppo")
   ========================================================================== */
function renderTabExpenses() {
  const container = document.getElementById('expensesTabContent');
  if (!container || !state.activeTrip) return;

  const trip = state.activeTrip;
  const expenses = trip.expenses || [];
  const homeCurr = state.homeCurrency || trip.homeCurrency || 'EUR';
  const destCurr = trip.destCurrency || homeCurr;
  const rate = trip.exchangeRate || 1;

  const totalHomeSpent = expenses.reduce((acc, curr) => acc + (Number(curr.amountHome) || 0), 0);
  const budget = trip.budgetHome || 0;
  const budgetPercent = budget > 0 ? Math.min(100, Math.round((totalHomeSpent / budget) * 100)) : 0;

  // Calcolo Saldi Mini-Splitwise
  const splitGroup = calculateGroupBalances(trip);
  const participants = trip.participants || ['Io'];

  let html = `
    <!-- Header Budget & Tasso di Cambio con Refresh Smeraldo -->
    <div class="glass-card budget-summary-card">
      <div class="budget-metric-row">
        <div>
          <span style="font-size:12px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase;">Totale Spese</span>
          <div class="spent-total-amount tabular-nums">${formatMoney(totalHomeSpent, homeCurr)}</div>
        </div>
        <div class="exchange-header-wrapper">
          <div class="exchange-pill-actions">
            <button class="exchange-pill-editable" id="btnEditExchangeRate">
              1 ${homeCurr} = ${rate} ${destCurr} ✎
            </button>
            <button class="exchange-refresh-btn" id="btnRefreshExchangeRate" aria-label="Aggiorna tasso online">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 4v6h-6"></path>
                <path d="M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
          </div>
          <div class="exchange-meta-subtitle">
            ${formatRateMeta(trip)}
          </div>
        </div>
      </div>

      ${budget > 0 ? `
        <div class="progress-info-row" style="margin-top:10px;">
          <span style="font-size:12px; color:var(--text-secondary);">Budget: ${formatMoney(budget, homeCurr)}</span>
          <span class="tabular-nums" style="font-size:12px; color:var(--accent); font-weight:700;">${budgetPercent}%</span>
        </div>
        <div class="progress-track" style="height:5px;">
          <div class="progress-fill" style="width:${budgetPercent}%;"></div>
        </div>
      ` : ''}

      <div style="display:flex; justify-content:flex-end; margin-top:14px;">
        <button id="btnOpenAddExpenseFromTab" class="btn-glass-pill accent" style="padding:8px 16px;">
          + Nuova Spesa
        </button>
      </div>
    </div>

    <!-- SEZIONE MINI-SPLITWISE: SALDI GRUPPO ("Chi deve a chi") -->
    <div class="glass-card group-balances-section">
      <div class="card-title-row" style="margin-bottom:10px;">
        <div class="card-title-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          Saldi Gruppo (Chi deve a chi)
        </div>
        <button id="btnManageParticipants" class="btn-mini-action" style="color:var(--accent); font-weight:700; font-size:12px;">
          Gestisci Persone (${participants.length}) ⚙
        </button>
      </div>

      <div class="group-balances-list">
        ${participants.filter(p => p !== 'Io').length > 0 ? `
          ${participants.filter(p => p !== 'Io').map(person => {
            const balance = splitGroup.balances[person] || 0;
            // balance > 0 => person paid more, so "Io" owes person
            // balance < 0 => person owes "Io"
            const owesMe = -balance;
            const isSettled = Math.abs(owesMe) < 0.05;

            return `
              <div class="balance-item-row">
                <div class="balance-item-info">
                  <span class="balance-name">${escapeHTML(person)}</span>
                  <span class="balance-desc">
                    ${isSettled ? `
                      <span style="color:var(--text-tertiary);">In pari</span>
                    ` : (owesMe > 0 ? `
                      <span class="balance-credit-text tabular-nums">Ti deve ${formatMoney(owesMe, homeCurr)}</span>
                    ` : `
                      <span class="balance-debt-text tabular-nums">Devi a ${escapeHTML(person)} ${formatMoney(Math.abs(owesMe), homeCurr)}</span>
                    `)}
                  </span>
                </div>
                <div>
                  ${!isSettled ? `
                    <button class="btn-settle-balance" data-settle-person="${escapeHTML(person)}" data-owes-amount="${owesMe}">
                      Salda
                    </button>
                  ` : `
                    <span class="badge-tag" style="background:var(--bg-glass-input);">Pari</span>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        ` : `
          <div style="text-align:center; padding:12px; font-size:12.5px; color:var(--text-secondary);">
            Nessun compagno registrato oltre a te. 
            <button id="btnQuickAddCompanion" style="background:none; border:none; color:var(--accent); font-weight:700; cursor:pointer;">Aggiungi compagno</button>
          </div>
        `}
      </div>
    </div>

    <!-- Cronologia Spese & Esporta CSV -->
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <h3 style="font-size:17px; font-weight:700;">Cronologia Spese (${expenses.length})</h3>
      <button class="btn-glass-pill" id="btnExportCsv">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Esporta CSV
      </button>
    </div>
  `;

  if (expenses.length > 0) {
    const sortedExpenses = [...expenses].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    sortedExpenses.forEach(exp => {
      html += `
        <div class="expense-row-item">
          <div class="expense-left">
            <div class="expense-title-cat">
              <span class="category-tag">${escapeHTML(exp.category || 'Spesa')}</span>
              <span class="expense-title">${escapeHTML(exp.notes || exp.category)}</span>
              ${exp.isSplit ? `<span class="badge-tag" style="background:rgba(0,230,118,0.15); color:var(--accent); font-weight:700;">👥 Dividi conto (${escapeHTML(exp.paidBy || 'Io')})</span>` : ''}
            </div>
            <div class="expense-date-time tabular-nums">${exp.date} • ${exp.time || ''}</div>
          </div>
          <div class="expense-right">
            <span class="expense-amount-home tabular-nums">${formatMoney(exp.amountHome, homeCurr)}</span>
            ${exp.currency !== homeCurr ? `<span class="expense-amount-local tabular-nums">${exp.amountLocal} ${exp.currency}</span>` : ''}
          </div>
        </div>
      `;
    });
  } else {
    html += `
      <div class="glass-card" style="text-align:center; padding:30px 16px;">
        <p style="color:var(--text-secondary); font-size:14px;">Nessuna spesa registrata per questo viaggio.</p>
      </div>
    `;
  }

  container.innerHTML = html;

  // Bind Spese
  document.getElementById('btnOpenAddExpenseFromTab')?.addEventListener('click', () => openAddExpenseSheet());
  document.getElementById('btnManageParticipants')?.addEventListener('click', openParticipantsSheet);
  document.getElementById('btnQuickAddCompanion')?.addEventListener('click', openParticipantsSheet);

  document.getElementById('btnEditExchangeRate')?.addEventListener('click', () => {
    document.getElementById('lblExchangeFormula').textContent = `1 ${homeCurr} = X ${destCurr}`;
    document.getElementById('fieldManualRate').value = rate;
    openSheet('sheetExchangeRate');
  });

  const btnRefresh = document.getElementById('btnRefreshExchangeRate');
  btnRefresh?.addEventListener('click', async () => {
    btnRefresh.classList.add('rotating');
    try {
      await opportunisticRateSync(true);
    } finally {
      setTimeout(() => btnRefresh.classList.remove('rotating'), 500);
    }
  });

  document.getElementById('btnExportCsv')?.addEventListener('click', () => {
    exportExpensesToCSV(trip);
  });

  // Salda debito riga
  container.querySelectorAll('[data-settle-person]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const person = btn.getAttribute('data-settle-person');
      const owesAmount = parseFloat(btn.getAttribute('data-owes-amount')) || 0;
      await settleDebtWithPerson(person, owesAmount);
    });
  });
}

async function settleDebtWithPerson(person, owesAmount) {
  if (!state.activeTrip) return;
  const trip = state.activeTrip;
  const homeCurr = state.homeCurrency || trip.homeCurrency || 'EUR';
  const now = new Date();

  // Se person mi deve soldi (owesAmount > 0): person mi ripaga (Payer: person, SplitWith: ['Io'])
  // Se io devo soldi a person (owesAmount < 0): io ripago person (Payer: 'Io', SplitWith: [person])
  const absAmount = Math.abs(owesAmount);
  const isIoPayer = owesAmount < 0;

  const settlementExpense = {
    id: 'exp_settle_' + Date.now(),
    date: now.toISOString().split('T')[0],
    time: now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
    amountLocal: parseFloat(absAmount.toFixed(2)),
    amountHome: parseFloat(absAmount.toFixed(2)),
    currency: homeCurr,
    category: 'Extra',
    notes: `Salda debito con ${person}`,
    isSplit: true,
    paidBy: isIoPayer ? 'Io' : person,
    splitWith: isIoPayer ? [person] : ['Io'],
    splitShares: isIoPayer ? { [person]: absAmount } : { 'Io': absAmount }
  };

  trip.expenses = trip.expenses || [];
  trip.expenses.push(settlementExpense);
  await putToStore('trips_store', trip);
  showToast(`Debito con ${person} saldato con successo!`);
  await refreshApplicationData();
}

function openAddExpenseSheet(prefill = {}) {
  const trip = state.activeTrip;
  if (!trip) return;

  const form = document.getElementById('formAddExpense');
  if (form) form.reset();

  const amountInput = document.getElementById('fieldExpenseAmount');
  if (amountInput) amountInput.value = prefill.amount || '';

  const currSelect = document.getElementById('fieldExpenseCurrency');
  if (currSelect) {
    const home = state.homeCurrency || trip.homeCurrency || 'EUR';
    const dest = trip.destCurrency || home;
    const currs = Array.from(new Set([home, dest, 'EUR', 'USD', 'JPY', 'CNY', 'GBP']));
    currSelect.innerHTML = currs.map(c => `
      <option value="${c}" ${(prefill.currency === c || (!prefill.currency && c === dest)) ? 'selected' : ''}>${c}</option>
    `).join('');
  }

  // Sezione Splitwise
  const splitToggle = document.getElementById('fieldExpenseIsSplit');
  const detailsSection = document.getElementById('splitwiseDetailsSection');
  const payerSelect = document.getElementById('fieldExpensePaidBy');
  const chipsContainer = document.getElementById('splitParticipantsChips');
  const previewBanner = document.getElementById('splitPreviewBanner');

  const participants = trip.participants || ['Io'];

  if (payerSelect) {
    payerSelect.innerHTML = participants.map(p => `
      <option value="${escapeHTML(p)}">${escapeHTML(p)}</option>
    `).join('');
  }

  // Selected participants for split (default: tutti)
  let selectedParticipants = [...participants];

  const updateSplitPreview = () => {
    const amount = parseFloat(amountInput.value) || 0;
    const n = selectedParticipants.length;
    const share = n > 0 ? (amount / n).toFixed(2) : '0.00';
    if (previewBanner) {
      previewBanner.textContent = `Quota a testa (${n} persone): ${share} ${currSelect.value}`;
    }
  };

  const renderChips = () => {
    if (!chipsContainer) return;
    chipsContainer.innerHTML = participants.map(p => {
      const isSel = selectedParticipants.includes(p);
      return `<button type="button" class="split-chip ${isSel ? 'selected' : ''}" data-person="${escapeHTML(p)}">${escapeHTML(p)}</button>`;
    }).join('');

    chipsContainer.querySelectorAll('.split-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const p = chip.getAttribute('data-person');
        if (selectedParticipants.includes(p)) {
          if (selectedParticipants.length > 1) {
            selectedParticipants = selectedParticipants.filter(x => x !== p);
          } else {
            showToast('Almeno una persona deve partecipare');
          }
        } else {
          selectedParticipants.push(p);
        }
        renderChips();
        updateSplitPreview();
      });
    });
  };

  renderChips();
  updateSplitPreview();

  if (splitToggle && detailsSection) {
    splitToggle.checked = false;
    detailsSection.style.display = 'none';

    splitToggle.onchange = () => {
      detailsSection.style.display = splitToggle.checked ? 'block' : 'none';
      updateSplitPreview();
    };
  }

  amountInput?.addEventListener('input', updateSplitPreview);
  currSelect?.addEventListener('change', updateSplitPreview);

  // Submit Handler
  form.onsubmit = async (e) => {
    e.preventDefault();
    const amountVal = parseFloat(amountInput.value);
    if (!amountVal || amountVal <= 0) {
      showToast('Inserisci un importo valido');
      return;
    }

    const curr = currSelect.value;
    const cat = document.getElementById('fieldExpenseCategory').value;
    const notes = document.getElementById('fieldExpenseNotes').value.trim();
    const isSplit = splitToggle.checked;
    const paidBy = payerSelect.value;
    const now = new Date();

    // Calcolo controvalore in valuta di casa
    const rate = trip.exchangeRate || 1;
    const homeCurr = state.homeCurrency || trip.homeCurrency || 'EUR';
    let amountHome = amountVal;

    if (curr !== homeCurr) {
      if (curr === trip.destCurrency && rate > 0) {
        amountHome = parseFloat((amountVal / rate).toFixed(2));
      } else {
        amountHome = parseFloat(amountVal.toFixed(2));
      }
    }

    const splitShares = {};
    if (isSplit && selectedParticipants.length > 0) {
      const sharePerPerson = parseFloat((amountHome / selectedParticipants.length).toFixed(2));
      selectedParticipants.forEach(p => {
        splitShares[p] = sharePerPerson;
      });
    }

    const newExpense = {
      id: 'exp_' + Date.now(),
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      amountLocal: amountVal,
      amountHome: amountHome,
      currency: curr,
      category: cat,
      notes: notes,
      isSplit: isSplit,
      paidBy: paidBy,
      splitWith: isSplit ? selectedParticipants : [paidBy],
      splitShares: splitShares
    };

    trip.expenses = trip.expenses || [];
    trip.expenses.push(newExpense);
    await putToStore('trips_store', trip);
    closeAllSheets();
    await refreshApplicationData();
    showToast(`Spesa registrata: ${formatMoney(amountHome, homeCurr)}`);
  };

  openSheet('sheetAddExpense');
}

function openParticipantsSheet() {
  const trip = state.activeTrip;
  if (!trip) return;

  const container = document.getElementById('participantsListContainer');
  if (!container) return;

  trip.participants = trip.participants || ['Io'];

  const render = () => {
    container.innerHTML = trip.participants.map(p => `
      <div class="settings-row" style="cursor:default;">
        <span class="settings-main-label">${escapeHTML(p)} ${p === 'Io' ? '(Tu)' : ''}</span>
        ${p !== 'Io' ? `
          <button class="check-delete-btn" data-del-person="${escapeHTML(p)}" style="display:block;">✕</button>
        ` : '<span class="badge-tag">Principale</span>'}
      </div>
    `).join('');

    container.querySelectorAll('[data-del-person]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const personToDel = btn.getAttribute('data-del-person');
        trip.participants = trip.participants.filter(p => p !== personToDel);
        await putToStore('trips_store', trip);
        render();
        renderTabExpenses();
        renderTabDashboard();
        showToast(`${personToDel} rimosso`);
      });
    });
  };

  render();

  const addBtn = document.getElementById('btnAddParticipant');
  const input = document.getElementById('fieldNewParticipantName');
  if (addBtn && input) {
    addBtn.onclick = async () => {
      const name = input.value.trim();
      if (!name) return;
      if (trip.participants.includes(name)) {
        showToast('Persona già presente');
        return;
      }
      trip.participants.push(name);
      await putToStore('trips_store', trip);
      input.value = '';
      render();
      renderTabExpenses();
      renderTabDashboard();
      showToast(`${name} aggiunto al gruppo`);
    };
  }

  openSheet('sheetParticipants');
}


/* ==========================================================================
   TAB 5: PROFILO (Impostazioni, Gestione Spazio Cache & Backup)
   ========================================================================== */
async function renderTabProfile() {
  const container = document.getElementById('profileTabContent');
  if (!container) return;

  // Stima memoria usata
  let storageEstimateStr = 'Calcolo in corso...';
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(1);
      storageEstimateStr = `${usedMB} MB utilizzati sul dispositivo`;
    } catch (e) {
      storageEstimateStr = 'Spazio non rilevato';
    }
  }

  let html = `
    <!-- Preferenze di Casa -->
    <div class="settings-section-title">Preferenze di Casa</div>
    <div class="settings-card-group" style="margin-bottom:16px;">
      <div class="settings-row">
        <div class="settings-label-sub">
          <span class="settings-main-label">Valuta di Casa</span>
          <span class="settings-sub-label">Usata per calcolare totali e controvalori</span>
        </div>
        <input type="text" id="profHomeCurrency" class="form-input" style="width: 80px; text-align:center; padding: 6px;" value="${escapeHTML(state.homeCurrency)}" maxlength="4">
      </div>
      <div class="settings-row">
        <div class="settings-label-sub">
          <span class="settings-main-label">Fuso Orario di Casa</span>
          <span class="settings-sub-label">Default Europe/Rome</span>
        </div>
        <input type="text" id="profHomeTimeZone" class="form-input" style="width: 140px; text-align:center; padding: 6px;" value="${escapeHTML(state.homeTimeZone)}">
      </div>
      <div class="settings-row" id="profThemeRow">
        <div class="settings-label-sub">
          <span class="settings-main-label">Tema Interfaccia</span>
          <span class="settings-sub-label">${state.theme === 'dark' ? 'Dark Mode (Nero & Smeraldo)' : 'Light Mode (Verde Salvia)'}</span>
        </div>
        <span class="badge-tag">Cambia</span>
      </div>
    </div>

    <!-- Gestione Spazio Offline -->
    <div class="settings-section-title">Spazio & Cache Offline</div>
    <div class="settings-card-group" style="margin-bottom:16px;">
      <div class="settings-row">
        <div class="settings-label-sub">
          <span class="settings-main-label">Storage Locale PWA</span>
          <span class="settings-sub-label" id="profStorageLabel">${storageEstimateStr}</span>
        </div>
        <span class="badge-tag">Persistente</span>
      </div>
      <div class="settings-row" id="profClearMapTiles">
        <div class="settings-label-sub">
          <span class="settings-main-label">Svuota Tasselli Mappa Offline</span>
          <span class="settings-sub-label">Libera la cache 'nomad-map-tiles-v1'</span>
        </div>
        <span class="badge-tag" style="color:var(--status-danger);">Svuota</span>
      </div>
    </div>

    <!-- Backup & Ripristino (Zero Cloud) -->
    <div class="settings-section-title">Backup & Ripristino (Zero Cloud)</div>
    <div class="settings-card-group" style="margin-bottom:16px;">
      <div class="settings-row" id="profExportJson">
        <div class="settings-label-sub">
          <span class="settings-main-label">Esporta Backup Leggero (.json)</span>
          <span class="settings-sub-label">Viaggi, itinerari, valigie, spese (senza file binari)</span>
        </div>
        <span class="badge-tag">JSON</span>
      </div>

      <label class="settings-row" style="margin-bottom:0;">
        <div class="settings-label-sub">
          <span class="settings-main-label">Importa Backup Leggero (.json)</span>
          <span class="settings-sub-label">Ripristina i dati da un file JSON</span>
        </div>
        <span class="badge-tag">Sfoglia</span>
        <input type="file" id="profInputImportJson" accept=".json" style="display:none;">
      </label>

      <div class="settings-row" id="profExportZip">
        <div class="settings-label-sub">
          <span class="settings-main-label">Esporta Backup Completo (.zip)</span>
          <span class="settings-sub-label">Include data.json + tutti i passaporti, PDF e foto</span>
        </div>
        <span class="badge-tag">ZIP</span>
      </div>

      <label class="settings-row" style="margin-bottom:0;">
        <div class="settings-label-sub">
          <span class="settings-main-label">Importa Backup Completo (.zip)</span>
          <span class="settings-sub-label">Ripristina tutto tramite fflate</span>
        </div>
        <span class="badge-tag">Sfoglia</span>
        <input type="file" id="profInputImportZip" accept=".zip" style="display:none;">
      </label>
    </div>

    <!-- Info App -->
    <div class="glass-card" style="text-align:center; padding:18px 14px; margin-bottom:8px;">
      <div style="font-weight:700; font-size:15px; margin-bottom:4px; color:var(--text-primary);">
        Nomad · 00 Work Suite
      </div>
      <div style="font-size:12px; color:var(--text-tertiary); line-height:1.4;">
        100% Local-First. Zero tracking, zero account, zero server esterni.<br>I tuoi dati viaggiano esclusivamente con te.
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Bind impostazioni
  const homeCurrInput = document.getElementById('profHomeCurrency');
  homeCurrInput?.addEventListener('change', () => {
    state.homeCurrency = (homeCurrInput.value || 'EUR').trim().toUpperCase();
    localStorage.setItem('nomad_home_currency', state.homeCurrency);
    showToast(`Valuta di casa impostata su ${state.homeCurrency}`);
    refreshApplicationData();
  });

  const homeTzInput = document.getElementById('profHomeTimeZone');
  homeTzInput?.addEventListener('change', () => {
    state.homeTimeZone = (homeTzInput.value || 'Europe/Rome').trim();
    localStorage.setItem('nomad_home_timezone', state.homeTimeZone);
    showToast(`Fuso di casa impostato: ${state.homeTimeZone}`);
    refreshApplicationData();
  });

  document.getElementById('profThemeRow')?.addEventListener('click', toggleTheme);

  // Svuota cache tasselli mappa
  document.getElementById('profClearMapTiles')?.addEventListener('click', async () => {
    if (confirm('Vuoi eliminare i tasselli della mappa offline per liberare spazio?')) {
      await caches.delete('nomad-map-tiles-v1');
      showToast('Cache mappa offline svuotata');
      renderTabProfile();
    }
  });

  // Backup listeners
  document.getElementById('profExportJson')?.addEventListener('click', exportLightweightJSON);
  document.getElementById('profInputImportJson')?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) importLightweightJSON(e.target.files[0]);
  });
  document.getElementById('profExportZip')?.addEventListener('click', exportFullZIP);
  document.getElementById('profInputImportZip')?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) importFullZIP(e.target.files[0]);
  });
}

/* ==========================================================================
   CHECKLIST VALIGIA & TEMPLATE (Sheet Dedicato da Dashboard)
   ========================================================================== */
function openFullPackingSheet() {
  const trip = state.activeTrip;
  if (!trip) return;

  const body = document.getElementById('packingSheetBody');
  if (!body) return;

  const preTrip = trip.preTripChecklist || [];
  const items = trip.packingList || [];
  const totalItems = preTrip.length + items.length;
  const checkedItems = preTrip.filter(i => i.checked).length + items.filter(i => i.checked).length;
  const progressPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  let html = `
    <!-- Avanzamento e Template -->
    <div class="glass-card packing-progress-bar-container" style="margin-bottom:12px;">
      <div class="progress-info-row">
        <span>Pronti per la partenza</span>
        <span class="tabular-nums" style="color:var(--accent);">${checkedItems}/${totalItems} (${progressPercent}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${progressPercent}%;"></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
        <span style="font-size:12px; color:var(--text-tertiary);">Resta organizzato offline</span>
        <button class="btn-glass-pill" id="btnOpenTemplatesSheet">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          Template
        </button>
      </div>
    </div>

    <!-- Prima di Partire -->
    <div class="glass-card pre-trip-section" style="margin-bottom:12px;">
      <div class="card-title-label" style="margin-bottom:10px; font-weight:700; color:var(--accent);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        Prima di partire
      </div>
      <div class="accordion-body">
  `;

  preTrip.forEach(item => {
    html += `
      <div class="check-item-row ${item.checked ? 'checked' : ''}" data-pre-trip-id="${item.id}">
        <div class="check-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <span class="check-text">${escapeHTML(item.text)}</span>
      </div>
    `;
  });

  html += `</div></div>`;

  const categories = ['Documenti', 'Tech', 'Abbigliamento', 'Farmaci', 'Extra'];
  categories.forEach(cat => {
    const catItems = items.filter(i => i.category === cat);
    html += `
      <div class="checklist-accordion-group">
        <div class="accordion-header" data-toggle-cat="${cat}">
          <span>${cat} <span style="font-size:12px; font-weight:500; color:var(--text-tertiary);">(${catItems.filter(i => i.checked).length}/${catItems.length})</span></span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div class="accordion-body" id="cat_body_${cat}">
    `;

    catItems.forEach(item => {
      html += `
        <div class="check-item-row ${item.checked ? 'checked' : ''}" data-item-id="${item.id}">
          <div class="check-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <span class="check-text">${escapeHTML(item.text)}</span>
          <button class="check-delete-btn" data-del-item-id="${item.id}">✕</button>
        </div>
      `;
    });

    html += `
        <div style="display:flex; gap:8px; margin-top:4px;">
          <input type="text" class="form-input input-quick-add" data-cat="${cat}" placeholder="+ Aggiungi a ${cat}..." style="padding:8px 12px; font-size:13px;">
          <button class="btn-glass-pill btn-quick-add" data-cat="${cat}" style="padding:8px 14px;">Aggiungi</button>
        </div>
      </div>
    </div>`;
  });

  body.innerHTML = html;

  // Bind checklist
  body.querySelectorAll('[data-pre-trip-id]').forEach(row => {
    row.addEventListener('click', async () => {
      const id = row.getAttribute('data-pre-trip-id');
      const target = trip.preTripChecklist.find(i => i.id === id);
      if (target) {
        target.checked = !target.checked;
        await putToStore('trips_store', trip);
        openFullPackingSheet();
        renderTabDashboard();
      }
    });
  });

  body.querySelectorAll('[data-item-id]').forEach(row => {
    row.addEventListener('click', async (e) => {
      if (e.target.closest('.check-delete-btn')) return;
      const id = row.getAttribute('data-item-id');
      const target = trip.packingList.find(i => i.id === id);
      if (target) {
        target.checked = !target.checked;
        await putToStore('trips_store', trip);
        openFullPackingSheet();
        renderTabDashboard();
      }
    });
  });

  body.querySelectorAll('[data-del-item-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-del-item-id');
      trip.packingList = trip.packingList.filter(i => i.id !== id);
      await putToStore('trips_store', trip);
      openFullPackingSheet();
      renderTabDashboard();
    });
  });

  body.querySelectorAll('.btn-quick-add').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cat = btn.getAttribute('data-cat');
      const input = body.querySelector(`.input-quick-add[data-cat="${cat}"]`);
      if (input && input.value.trim()) {
        trip.packingList = trip.packingList || [];
        trip.packingList.push({
          id: 'pk_' + Date.now(),
          category: cat,
          text: input.value.trim(),
          checked: false
        });
        await putToStore('trips_store', trip);
        openFullPackingSheet();
        renderTabDashboard();
      }
    });
  });

  body.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const cat = header.getAttribute('data-toggle-cat');
      const b = document.getElementById(`cat_body_${cat}`);
      if (b) {
        b.classList.toggle('hidden');
        header.classList.toggle('collapsed');
      }
    });
  });

  document.getElementById('btnOpenTemplatesSheet')?.addEventListener('click', () => {
    renderTemplatesSheetList();
    openSheet('sheetPackingTemplates');
  });

  openSheet('sheetPackingFull');
}

async function renderTemplatesSheetList() {
  const container = document.getElementById('packingTemplatesList');
  if (!container) return;
  const templates = await getAllFromStore('templates_store');

  let html = '';
  templates.forEach(t => {
    html += `
      <div class="settings-row btn-apply-template" data-template-id="${t.id}">
        <div class="settings-label-sub">
          <span class="settings-main-label">${escapeHTML(t.name)}</span>
          <span class="settings-sub-label">${t.items ? t.items.length : 0} oggetti inclusi</span>
        </div>
        <span class="badge-tag">Carica</span>
      </div>
    `;
  });
  container.innerHTML = html;

  container.querySelectorAll('.btn-apply-template').forEach(row => {
    row.addEventListener('click', async () => {
      const id = row.getAttribute('data-template-id');
      const template = templates.find(t => t.id === id);
      if (template && state.activeTrip) {
        const currentList = state.activeTrip.packingList || [];
        for (const item of template.items) {
          currentList.push({
            id: 'pk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            category: item.category,
            text: item.text,
            checked: false
          });
        }
        state.activeTrip.packingList = currentList;
        await putToStore('trips_store', state.activeTrip);
        closeAllSheets();
        renderTabDashboard();
        showToast(`Template "${template.name}" caricato!`);
      }
    });
  });
}

/* ==========================================================================
   BACKUP & RIPRISTINO (JSON Leggero & ZIP Completo fflate)
   ========================================================================== */
async function exportLightweightJSON() {
  const trips = await getAllFromStore('trips_store');
  const templates = await getAllFromStore('templates_store');

  const payload = {
    app: 'Nomad',
    version: '2.0.0',
    exportDate: new Date().toISOString(),
    homeCurrency: state.homeCurrency,
    homeTimeZone: state.homeTimeZone,
    trips,
    templates
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nomad_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup JSON esportato');
}

async function importLightweightJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (data.trips && Array.isArray(data.trips)) {
      for (const t of data.trips) await putToStore('trips_store', t);
    }
    if (data.templates && Array.isArray(data.templates)) {
      for (const tmpl of data.templates) await putToStore('templates_store', tmpl);
    }

    await refreshApplicationData();
    closeAllSheets();
    showToast('Dati ripristinati con successo!');
  } catch (err) {
    console.error('Errore ripristino JSON:', err);
    showToast('File JSON non valido');
  }
}

async function exportFullZIP() {
  showToast('Creazione archivio ZIP...');
  const trips = await getAllFromStore('trips_store');
  const templates = await getAllFromStore('templates_store');
  const files = await getAllFromStore('files_store');

  const filesMeta = files.map(f => ({
    id: f.id,
    name: f.name,
    type: f.type,
    size: f.size,
    tripId: f.tripId,
    category: f.category,
    title: f.title,
    notes: f.notes,
    isPinned: Boolean(f.isPinned)
  }));

  const dataJson = {
    app: 'Nomad',
    version: '2.0.0',
    exportDate: new Date().toISOString(),
    homeCurrency: state.homeCurrency,
    homeTimeZone: state.homeTimeZone,
    trips,
    templates,
    filesMeta
  };

  const zipData = {};
  const enc = new TextEncoder();
  zipData['data.json'] = enc.encode(JSON.stringify(dataJson, null, 2));

  for (const file of files) {
    if (file.blob) {
      const buffer = await file.blob.arrayBuffer();
      zipData[`wallet/${file.id}_${file.name}`] = new Uint8Array(buffer);
    }
  }

  fflate.zip(zipData, (err, out) => {
    if (err) {
      console.error('Errore zip fflate:', err);
      showToast('Errore durante la creazione dello ZIP');
      return;
    }
    const blob = new Blob([out], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nomad_full_backup_${new Date().toISOString().split('T')[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup ZIP completo scaricato!');
  });
}

async function importFullZIP(file) {
  try {
    showToast('Ripristino archivio ZIP...');
    const buffer = await file.arrayBuffer();
    const unzipped = fflate.unzipSync(new Uint8Array(buffer));

    const dataJsonBytes = unzipped['data.json'];
    if (!dataJsonBytes) {
      showToast('data.json non trovato nello ZIP');
      return;
    }

    const dec = new TextDecoder();
    const meta = JSON.parse(dec.decode(dataJsonBytes));

    if (meta.trips) {
      for (const t of meta.trips) await putToStore('trips_store', t);
    }
    if (meta.templates) {
      for (const tmpl of meta.templates) await putToStore('templates_store', tmpl);
    }

    if (meta.filesMeta && Array.isArray(meta.filesMeta)) {
      for (const fm of meta.filesMeta) {
        const zipKey = `wallet/${fm.id}_${fm.name}`;
        const binary = unzipped[zipKey];
        if (binary) {
          const blob = new Blob([binary], { type: fm.type });
          await putToStore('files_store', { ...fm, blob });
        }
      }
    }

    await refreshApplicationData();
    closeAllSheets();
    showToast('Archivio ZIP ripristinato con successo!');
  } catch (err) {
    console.error('Errore import zip:', err);
    showToast('Errore lettura archivio ZIP');
  }
}

/* ==========================================================================
   NAVIGATION & BOTTOM SHEETS LOGIC
   ========================================================================== */
function setupNavigation() {
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  // Pulisci eventuale countdown live precedente se si esce da dashboard
  if (state.activeTab === 'dashboard' && tabName !== 'dashboard') {
    if (state.liveCountdownInterval) {
      clearInterval(state.liveCountdownInterval);
      state.liveCountdownInterval = null;
    }
  }

  // Auto-blocco Cassaforte quando si cambia tab
  if (state.activeTab === 'wallet' && tabName !== 'wallet') {
    state.vaultUnlocked = false;
  }

  state.activeTab = tabName;

  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const activePane = document.getElementById(`tab-${tabName}`);
  if (activePane) activePane.classList.add('active');

  const viewport = document.getElementById('mainContainer');
  if (viewport) viewport.scrollTop = 0;

  if (tabName === 'dashboard') {
    renderDashboard();
  } else {
    renderActiveTab();
  }

  // InvalidateSize mappa se si entra in Dashboard o Viaggio per evitare aree grigie
  if (tabName === 'trip' && state.tripSubView === 'map') {
    setTimeout(() => {
      if (state.leafletMap) state.leafletMap.invalidateSize();
    }, 200);
  }
}

function openSheet(sheetId) {
  closeAllSheets(false);
  const backdrop = document.getElementById('sheetBackdrop');
  const sheet = document.getElementById(sheetId);
  if (backdrop && sheet) {
    backdrop.classList.add('active');
    sheet.classList.add('active');
  }
}

function closeAllSheets(hideBackdrop = true) {
  document.querySelectorAll('.bottom-sheet').forEach(sheet => {
    sheet.classList.remove('active');
  });
  if (hideBackdrop) {
    const backdrop = document.getElementById('sheetBackdrop');
    if (backdrop) backdrop.classList.remove('active');
  }
}

/* ==========================================================================
   EVENT LISTENERS GENERALI & FORMS
   ========================================================================== */

/* ==========================================================================
   MANUALE DI VIAGGIO: TRADUTTORE IBRIDO & FRASARIO OFFLINE
   ========================================================================== */
// ==========================================================================
// SEZIONE TRADUTTORE & FRASARIO SCHERMO INTERO (APPLE TRANSLATE / iOS STYLE)
// ==========================================================================

const LANG_MAP = {
  it: { name: 'Italiano', flag: '🇮🇹', api: 'it', tts: 'it-IT' },
  en: { name: 'Inglese', flag: '🇬🇧', api: 'en', tts: 'en-US' },
  zh: { name: 'Cinese Mandarino', flag: '🇨🇳', api: 'zh-CN', tts: 'zh-CN' },
  ja: { name: 'Giapponese', flag: '🇯🇵', api: 'ja', tts: 'ja-JP' },
  es: { name: 'Spagnolo', flag: '🇪🇸', api: 'es', tts: 'es-ES' },
  fr: { name: 'Francese', flag: '🇫🇷', api: 'fr', tts: 'fr-FR' },
  de: { name: 'Tedesco', flag: '🇩🇪', api: 'de', tts: 'de-DE' },
  pt: { name: 'Portoghese', flag: '🇵🇹', api: 'pt', tts: 'pt-PT' },
  th: { name: 'Thailandese', flag: '🇹🇭', api: 'th', tts: 'th-TH' },
  ko: { name: 'Coreano', flag: '🇰🇷', api: 'ko', tts: 'ko-KR' },
  ar: { name: 'Arabo', flag: '🇸🇦', api: 'ar', tts: 'ar-SA' },
  vi: { name: 'Vietnamita', flag: '🇻🇳', api: 'vi', tts: 'vi-VN' },
  tr: { name: 'Turco', flag: '🇹🇷', api: 'tr', tts: 'tr-TR' },
  el: { name: 'Greco', flag: '🇬🇷', api: 'el', tts: 'el-GR' }
};

let currentBigOverlayData = null;
let cachedVoices = [];
let activeSpeechRecognition = null;
let selectedPhrasebookCategory = 'all';
let phrasebookSearchQuery = '';

function loadVoices() {
  if (!('speechSynthesis' in window)) return [];
  cachedVoices = window.speechSynthesis.getVoices() || [];
  return cachedVoices;
}

if ('speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function getBestVoice(bcp47Lang) {
  if (!('speechSynthesis' in window)) return null;
  const voices = (cachedVoices && cachedVoices.length > 0) ? cachedVoices : loadVoices();
  if (!voices || voices.length === 0) return null;

  const targetLang = (bcp47Lang || 'en-US').toLowerCase();
  const targetPrefix = targetLang.split('-')[0];
  const isOffline = !navigator.onLine;

  const compatible = voices.filter(v => {
    const vLang = (v.lang || '').toLowerCase();
    return vLang === targetLang || vLang.startsWith(targetPrefix);
  });

  if (compatible.length === 0) return null;

  const scoreVoice = (v) => {
    let score = 0;
    const name = (v.name || '').toLowerCase();
    const vLang = (v.lang || '').toLowerCase();

    // In modalità offline, favorisci voci scaricate localmente ed escludi/penalizza voci remote Online
    if (isOffline) {
      if (v.localService === true) score += 200;
      if (name.includes('online')) score -= 500;
    } else {
      if (name.includes('online')) score += 80;
    }

    if (name.includes('natural')) score += 120;
    if (name.includes('neural')) score += 110;
    if (name.includes('premium')) score += 100;
    if (name.includes('enhanced')) score += 90;
    if (name.includes('siri')) score += 75;
    if (name.includes('google')) score += 70;

    if (vLang === targetLang) {
      score += 40;
    } else if (vLang.startsWith(targetPrefix)) {
      score += 20;
    }

    if (v.localService) score += 10;

    if (name.includes('compact')) score -= 50;
    if (name.includes('espeak')) score -= 60;
    if (name.includes('fred') || name.includes('zarvox') || name.includes('junior') || name.includes('albert')) score -= 80;

    return score;
  };

  compatible.sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return compatible[0];
}

function speakText(text, langKey, rate = 0.95) {
  if (!('speechSynthesis' in window) || !text) {
    showToast('Sintesi vocale non supportata');
    return;
  }

  try {
    // FIX iOS Safari: cancella SOLO se c'è un audio attivo o in coda, per non bloccare il sintetizzatore
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const langInfo = LANG_MAP[langKey] || LANG_MAP['en'];
    const ttsCode = langInfo.tts || 'en-US';

    utterance.lang = ttsCode;
    utterance.rate = rate;
    utterance.pitch = 1.0;

    const bestVoice = getBestVoice(ttsCode);
    if (bestVoice) {
      utterance.voice = bestVoice;
    } else {
      utterance.voice = null;
    }

    // Chiamata immediata e sincrona per non perdere il contesto del tocco utente su iOS Safari
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
  }
}

// ==========================================================================
// MONITORAGGIO STATO ONLINE / OFFLINE NEL TRADUTTORE
// ==========================================================================
function updateTranslatorOnlineStatus() {
  const banner = document.getElementById('transOfflineBanner');
  const isOnline = navigator.onLine;

  if (banner) {
    banner.style.display = isOnline ? 'none' : 'flex';
  }
}

window.addEventListener('online', updateTranslatorOnlineStatus);
window.addEventListener('offline', updateTranslatorOnlineStatus);

// ==========================================================================
// APERTURA & CHIUSURA PAGINA TRADUTTORE FULLSCREEN
// ==========================================================================
function openTravelManualPage() {
  const page = document.getElementById('pageTravelManual');
  if (!page) return;

  populateLanguageSelects();
  renderSavedTranslationsList();
  updateTranslatorOnlineStatus();

  const langSelect = document.getElementById('phrasebookTargetLang');
  renderSurvivalPhrasebook(langSelect ? langSelect.value : 'zh');

  page.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeTravelManualPage() {
  const page = document.getElementById('pageTravelManual');
  if (page) page.classList.remove('active');
  document.body.style.overflow = '';

  if (activeSpeechRecognition) {
    try { activeSpeechRecognition.abort(); } catch (e) {}
    activeSpeechRecognition = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// ==========================================================================
// DETTATURA VOCALE SPEECH RECOGNITION
// ==========================================================================
function startSpeechRecognition({ langKey, onStart, onResult, onEnd, onError }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Dettatura vocale non disponibile su questo browser/offline');
    if (onError) onError(new Error('NOT_SUPPORTED'));
    return null;
  }

  try {
    if (activeSpeechRecognition) {
      try { activeSpeechRecognition.abort(); } catch (e) {}
      activeSpeechRecognition = null;
    }

    const recognition = new SpeechRecognition();
    const langInfo = LANG_MAP[langKey] || LANG_MAP['it'];
    recognition.lang = langInfo.tts || 'it-IT';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      activeSpeechRecognition = recognition;
      if (onStart) onStart();
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript && onResult) {
        onResult(transcript);
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        showToast('Dettatura non riuscita: ' + (event.error || 'errore'));
      }
      if (onError) onError(event);
    };

    recognition.onend = () => {
      activeSpeechRecognition = null;
      if (onEnd) onEnd();
    };

    recognition.start();
    return recognition;
  } catch (err) {
    console.warn('Failed to start speech recognition:', err);
    showToast('Dettatura vocale non disponibile su questo browser/offline');
    if (onError) onError(err);
    return null;
  }
}

// ==========================================================================
// OVERLAY SCHERMO INTERO TESTO GIGANTE
// ==========================================================================
function openPhraseBigOverlay(targetText, italianText, categoryName, langKey = 'zh', phoneticText = '') {
  const overlay = document.getElementById('phraseBigOverlay');
  const targetEl = document.getElementById('phraseBigTarget');
  const itaEl = document.getElementById('phraseBigItalian');
  const catEl = document.getElementById('phraseBigCategory');
  const phonEl = document.getElementById('phraseBigPhonetic');
  if (!overlay || !targetEl) return;

  targetEl.textContent = targetText || '';
  if (itaEl) itaEl.textContent = italianText ? `"${italianText}"` : '';
  if (catEl) catEl.textContent = categoryName || 'Frase / Traduzione';

  if (phonEl) {
    if (phoneticText && phoneticText.trim()) {
      phonEl.textContent = phoneticText.trim();
      phonEl.style.display = 'block';
    } else {
      phonEl.textContent = '';
      phonEl.style.display = 'none';
    }
  }

  currentBigOverlayData = {
    text: targetText || '',
    langKey: langKey || 'zh'
  };

  overlay.classList.add('active');
  acquireWakeLock();
}

function closePhraseBigOverlay() {
  const overlay = document.getElementById('phraseBigOverlay');
  if (overlay) overlay.classList.remove('active');
  currentBigOverlayData = null;
  releaseWakeLock();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// ==========================================================================
// CHIAMATA TRADUZIONE MYMEMORY ONLINE
// ==========================================================================
async function translateTextOnline(text, fromLang, toLang) {
  const fromInfo = LANG_MAP[fromLang.toLowerCase()] || { api: fromLang.toLowerCase() };
  const toInfo = LANG_MAP[toLang.toLowerCase()] || { api: toLang.toLowerCase() };

  const fromApi = fromInfo.api;
  const toApi = toInfo.api;

  if (fromApi === toApi) {
    throw new Error('SAME_LANG');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromApi}|${toApi}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data && data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
      return data.responseData.translatedText;
    }
    if (data && data.responseData && data.responseData.translatedText) {
      return data.responseData.translatedText;
    }
    throw new Error(data?.responseDetails || 'Risposta non valida');
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ==========================================================================
// CRONOLOGIA AUTOMATICA OFFLINE (ULTIME 20 TRADUZIONI FIFO)
// ==========================================================================
async function saveToTranslationHistory(translationObj) {
  if (!translationObj || !translationObj.original || !translationObj.translated) return;
  const trip = state.activeTrip;
  if (!trip) return;

  trip.savedTranslations = trip.savedTranslations || [];

  const first = trip.savedTranslations[0];
  if (first && first.original === translationObj.original && first.toLang === translationObj.toLang) {
    return;
  }

  trip.savedTranslations = trip.savedTranslations.filter(
    t => !(t.original === translationObj.original && t.toLang === translationObj.toLang)
  );

  trip.savedTranslations.unshift(translationObj);

  if (trip.savedTranslations.length > 20) {
    trip.savedTranslations = trip.savedTranslations.slice(0, 20);
  }

  await putToStore('trips_store', trip);
  renderSavedTranslationsList();
}

function renderSavedTranslationsList() {
  const trip = state.activeTrip;
  const listEl = document.getElementById('transSavedList');
  const countEl = document.getElementById('transSavedCount');
  if (!listEl || !trip) return;

  const saved = trip.savedTranslations || [];
  if (countEl) countEl.textContent = saved.length;

  if (saved.length === 0) {
    listEl.innerHTML = '<div style="font-size:12px; color:var(--text-tertiary); text-align:center; padding:12px; background:var(--bg-card-subtle); border-radius:12px;">Nessuna traduzione recente salvata.</div>';
    return;
  }

  listEl.innerHTML = saved.slice(0, 20).map((item, idx) => {
    const toKey = (item.toLang || 'zh').toLowerCase();
    const toInfo = LANG_MAP[toKey] || { flag: '🌐', name: toKey.toUpperCase() };

    return `
      <div class="trans-recent-row-card" data-saved-idx="${idx}">
        <div class="trans-recent-text-group">
          <div class="trans-recent-main-val">
            ${toInfo.flag} ${escapeHTML(item.translated)}
          </div>
          <div class="trans-recent-sub-val">
            "${escapeHTML(item.original)}" (${item.fromLang?.toUpperCase() || 'IT'} ➔ ${item.toLang?.toUpperCase() || 'ZH'})
          </div>
        </div>
        <div class="trans-recent-actions">
          <button class="trip-action-icon-btn btn-speak-saved" data-idx="${idx}" title="Ascolta pronuncia" aria-label="Ascolta" style="width:34px; height:34px; font-size:14px;">
            🔊
          </button>
          <button class="trip-action-icon-btn btn-show-saved-big" data-idx="${idx}" title="Schermo intero" aria-label="Schermo Intero" style="width:34px; height:34px; font-size:13px; color:var(--accent);">
            ⛶
          </button>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.btn-speak-saved').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const item = saved[idx];
      if (item) speakText(item.translated, (item.toLang || 'zh').toLowerCase(), 0.95);
    });
  });

  listEl.querySelectorAll('.btn-show-saved-big').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const item = saved[idx];
      if (item) {
        openPhraseBigOverlay(item.translated, item.original, `Frase Recente (${item.toLang.toUpperCase()})`, (item.toLang || 'zh').toLowerCase());
      }
    });
  });
}

// ==========================================================================
// FRASARIO OFFLINE CON CATEGORIE A PILLOLA SCROLLABILE E RICERCA RAPIDA
// ==========================================================================
function renderSurvivalPhrasebook(targetLang = 'zh') {
  const container = document.getElementById('phrasebookContainer');
  const trip = state.activeTrip;
  if (!container) return;

  const phrases = (typeof DEFAULT_SURVIVAL_PHRASES !== 'undefined' ? DEFAULT_SURVIVAL_PHRASES : []);
  const customPhrases = (trip?.savedPhrases || []);
  const allPhrases = [...phrases, ...customPhrases];

  const langKey = targetLang.toLowerCase();

  let filtered = (selectedPhrasebookCategory === 'all')
    ? allPhrases
    : allPhrases.filter(p => p.category === selectedPhrasebookCategory);

  if (phrasebookSearchQuery && phrasebookSearchQuery.trim()) {
    const q = phrasebookSearchQuery.trim().toLowerCase();
    filtered = filtered.filter(p => {
      const itMatch = (p.it || '').toLowerCase().includes(q);
      const catMatch = (p.category || '').toLowerCase().includes(q);
      const trMatch = ((p.translations && p.translations[langKey]) || '').toLowerCase().includes(q);
      const enMatch = ((p.translations && p.translations['en']) || '').toLowerCase().includes(q);
      return itMatch || catMatch || trMatch || enMatch;
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="font-size:12.5px; color:var(--text-tertiary); text-align:center; padding:24px 16px; background:var(--bg-card-subtle); border-radius:14px; margin-top:8px;">
        ${phrasebookSearchQuery ? `Nessuna frase trovata per "<strong>${escapeHTML(phrasebookSearchQuery)}</strong>".` : 'Nessuna frase in questa categoria.'}
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(p => {
    const tr = (p.translations && p.translations[langKey]) || p.translations?.['en'] || p.it;
    const phon = (p.phonetics && p.phonetics[langKey]) || '';

    html += `
      <div class="phrasebook-card-item" data-target-text="${escapeHTML(tr)}" data-ita-text="${escapeHTML(p.it)}" data-cat="${escapeHTML(p.category || 'Frasario')}" data-lang="${langKey}" data-phonetic="${escapeHTML(phon)}">
        <div class="phrasebook-card-main">
          <div class="phrasebook-ita-text">${escapeHTML(p.it)}</div>
          <div class="phrasebook-target-text">${escapeHTML(tr)}</div>
          ${phon ? `<div class="phrasebook-phonetic-text">${escapeHTML(phon)}</div>` : ''}
        </div>
        <div class="phrasebook-actions-right">
          <button class="phrasebook-show-btn" data-target-text="${escapeHTML(tr)}" data-ita-text="${escapeHTML(p.it)}" data-cat="${escapeHTML(p.category || 'Frasario')}" data-lang="${langKey}" data-phonetic="${escapeHTML(phon)}" title="Mostra a schermo intero" aria-label="Mostra a schermo intero">
            ⛶ Mostra
          </button>
          <button class="phrasebook-speak-circle-btn btn-speak-phrase-row" data-speak-text="${escapeHTML(tr)}" data-lang="${langKey}" title="Ascolta pronuncia" aria-label="Ascolta pronuncia">
            🔊
          </button>
        </div>
      </div>
    `;
  });

  html += `
    <div style="font-size:11px; color:var(--text-tertiary); text-align:center; padding:12px 14px 6px 14px; line-height:1.4;">
      💡 <em>Tocca <strong>⛶ Mostra</strong> o la card per visualizzarla a <strong>Schermo Intero</strong>. L'audio usa le voci native del dispositivo (funziona offline).</em>
    </div>
  `;

  container.innerHTML = html;

  container.querySelectorAll('.btn-speak-phrase-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const txt = btn.getAttribute('data-speak-text');
      const l = btn.getAttribute('data-lang') || langKey;
      speakText(txt, l, 0.95);
    });
  });

  container.querySelectorAll('.phrasebook-show-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetText = btn.getAttribute('data-target-text');
      const itaText = btn.getAttribute('data-ita-text');
      const cat = btn.getAttribute('data-cat');
      const l = btn.getAttribute('data-lang') || langKey;
      const phon = btn.getAttribute('data-phonetic') || '';
      openPhraseBigOverlay(targetText, itaText, cat, l, phon);
    });
  });

  container.querySelectorAll('.phrasebook-card-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.btn-speak-phrase-row') || e.target.closest('.phrasebook-show-btn')) return;
      const targetText = el.getAttribute('data-target-text');
      const itaText = el.getAttribute('data-ita-text');
      const cat = el.getAttribute('data-cat');
      const l = el.getAttribute('data-lang') || langKey;
      const phon = el.getAttribute('data-phonetic') || '';
      openPhraseBigOverlay(targetText, itaText, cat, l, phon);
    });
  });
}

function populateLanguageSelects() {
  const sFrom = document.getElementById('transLangFrom');
  const sTo = document.getElementById('transLangTo');
  const sPhrase = document.getElementById('phrasebookTargetLang');

  const curFrom = sFrom ? sFrom.value : 'it';
  const curTo = sTo ? sTo.value : 'zh';
  const curPhrase = sPhrase ? sPhrase.value : 'zh';

  const keys = Object.keys(LANG_MAP);

  if (sFrom) {
    sFrom.innerHTML = keys.map(k => `
      <option value="${k}" ${k === curFrom ? 'selected' : ''}>${LANG_MAP[k].flag} ${LANG_MAP[k].name}</option>
    `).join('');
  }

  if (sTo) {
    sTo.innerHTML = keys.map(k => `
      <option value="${k}" ${k === curTo ? 'selected' : ''}>${LANG_MAP[k].flag} ${LANG_MAP[k].name}</option>
    `).join('');
  }

  if (sPhrase) {
    sPhrase.innerHTML = keys.map(k => `
      <option value="${k}" ${k === curPhrase ? 'selected' : ''}>${LANG_MAP[k].flag} ${LANG_MAP[k].name} (${k.toUpperCase()})</option>
    `).join('');
  }
}

// ==========================================================================
// SETUP COMPLETO INTERFACCIA TRADUTTORE & FRASARIO FULLSCREEN
// ==========================================================================
function setupTravelManualSheet() {
  const tabTrans = document.getElementById('tabBtnTranslator');
  const tabPhrase = document.getElementById('tabBtnPhrasebook');
  const secTrans = document.getElementById('sectionTranslator');
  const secPhrase = document.getElementById('sectionPhrasebook');

  populateLanguageSelects();

  // Toggle Tab Segmented
  tabTrans?.addEventListener('click', () => {
    tabTrans.classList.add('active');
    tabPhrase?.classList.remove('active');
    if (secTrans) secTrans.style.display = 'flex';
    if (secPhrase) secPhrase.style.display = 'none';
  });

  tabPhrase?.addEventListener('click', () => {
    tabPhrase.classList.add('active');
    tabTrans?.classList.remove('active');
    if (secTrans) secTrans.style.display = 'none';
    if (secPhrase) secPhrase.style.display = 'flex';
    const langSelect = document.getElementById('phrasebookTargetLang');
    renderSurvivalPhrasebook(langSelect ? langSelect.value : 'zh');
  });

  // Pillole Categorie Frasario
  document.querySelectorAll('#phrasebookCatStrip .phrasebook-cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#phrasebookCatStrip .phrasebook-cat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedPhrasebookCategory = pill.getAttribute('data-cat') || 'all';
      const langSelect = document.getElementById('phrasebookTargetLang');
      renderSurvivalPhrasebook(langSelect ? langSelect.value : 'zh');
    });
  });

  // Selettore lingua Frasario
  document.getElementById('phrasebookTargetLang')?.addEventListener('change', (e) => {
    renderSurvivalPhrasebook(e.target.value);
  });

  // Ricerca Rapida Frasario
  const searchInput = document.getElementById('inputSearchPhrasebook');
  const clearSearchBtn = document.getElementById('btnClearPhraseSearch');

  searchInput?.addEventListener('input', (e) => {
    phrasebookSearchQuery = e.target.value || '';
    if (clearSearchBtn) {
      clearSearchBtn.style.display = phrasebookSearchQuery ? 'block' : 'none';
    }
    const langSelect = document.getElementById('phrasebookTargetLang');
    renderSurvivalPhrasebook(langSelect ? langSelect.value : 'zh');
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
      phrasebookSearchQuery = '';
      clearSearchBtn.style.display = 'none';
      searchInput.focus();
    }
    const langSelect = document.getElementById('phrasebookTargetLang');
    renderSurvivalPhrasebook(langSelect ? langSelect.value : 'zh');
  });

  // Swap lingue Traduttore
  document.getElementById('btnTransSwapLang')?.addEventListener('click', () => {
    const sFrom = document.getElementById('transLangFrom');
    const sTo = document.getElementById('transLangTo');
    if (sFrom && sTo) {
      const temp = sFrom.value;
      sFrom.value = sTo.value;
      sTo.value = temp;
    }
  });

  // Cancella input testo
  document.getElementById('btnTransClearInput')?.addEventListener('click', () => {
    const input = document.getElementById('transInputText');
    if (input) {
      input.value = '';
      input.focus();
    }
  });

  // Funzione unificata di esecuzione traduzione
  let lastTranslation = null;
  const executeTranslation = async () => {
    const inputEl = document.getElementById('transInputText');
    const text = inputEl ? inputEl.value.trim() : '';
    if (!text) {
      showToast('Inserisci del testo da tradurre');
      return;
    }

    const sFrom = document.getElementById('transLangFrom');
    const sTo = document.getElementById('transLangTo');
    const fromL = (sFrom ? sFrom.value : 'it').toLowerCase();
    const toL = (sTo ? sTo.value : 'zh').toLowerCase();

    if (fromL === toL) {
      showToast('Seleziona due lingue diverse');
      return;
    }

    const resBox = document.getElementById('transResultBox');
    const origEl = document.getElementById('transResultOriginal');
    const transEl = document.getElementById('transResultTranslated');
    const badgeEl = document.getElementById('transResultLangBadge');
    const btnTranslate = document.getElementById('btnDoTranslate');

    if (btnTranslate) {
      btnTranslate.textContent = 'Traduzione...';
      btnTranslate.disabled = true;
    }

    try {
      const translated = await translateTextOnline(text, fromL, toL);
      lastTranslation = {
        original: text,
        translated: translated,
        fromLang: fromL,
        toLang: toL,
        timestamp: Date.now()
      };

      if (resBox) resBox.style.display = 'flex';
      const toName = LANG_MAP[toL]?.name || toL.toUpperCase();
      const fromName = LANG_MAP[fromL]?.name || fromL.toUpperCase();
      if (badgeEl) badgeEl.textContent = `${LANG_MAP[toL]?.flag || '🌐'} ${toName}`;
      if (origEl) origEl.textContent = `"${text}" (${fromName})`;
      if (transEl) transEl.textContent = translated;

      await saveToTranslationHistory(lastTranslation);
    } catch (err) {
      console.warn('Errore traduttore online:', err);
      if (err.message === 'SAME_LANG') {
        showToast('Seleziona due lingue diverse');
      } else {
        showToast('Sei offline — usa il Frasario salvato');
      }
      if (resBox) resBox.style.display = 'flex';
      if (origEl) origEl.textContent = text;
      if (transEl) transEl.textContent = (err.message === 'SAME_LANG') ? 'Seleziona due lingue diverse' : 'Impossibile tradurre online (Offline)';
    } finally {
      if (btnTranslate) {
        btnTranslate.textContent = 'Traduci';
        btnTranslate.disabled = false;
      }
    }
  };

  document.getElementById('btnDoTranslate')?.addEventListener('click', executeTranslation);

  // Dettatura Vocale
  const micBtn = document.getElementById('btnTransVoiceInput');
  micBtn?.addEventListener('click', () => {
    const sFrom = document.getElementById('transLangFrom');
    const fromL = (sFrom ? sFrom.value : 'it').toLowerCase();

    startSpeechRecognition({
      langKey: fromL,
      onStart: () => {
        micBtn.classList.add('is-listening');
        micBtn.textContent = '🔴 In ascolto...';
      },
      onResult: (transcript) => {
        const inputEl = document.getElementById('transInputText');
        if (inputEl) {
          inputEl.value = transcript;
          executeTranslation();
        }
      },
      onEnd: () => {
        micBtn.classList.remove('is-listening');
        micBtn.textContent = '🎤 Parla';
      },
      onError: () => {
        micBtn.classList.remove('is-listening');
        micBtn.textContent = '🎤 Parla';
      }
    });
  });

  // Azioni Risultato
  const getCurrentTranslation = () => {
    const transEl = document.getElementById('transResultTranslated');
    const origEl = document.getElementById('transResultOriginal');
    const sTo = document.getElementById('transLangTo');
    const sFrom = document.getElementById('transLangFrom');

    const toL = (sTo ? sTo.value : 'zh').toLowerCase();
    const fromL = (sFrom ? sFrom.value : 'it').toLowerCase();
    const textTrans = transEl ? transEl.textContent.trim() : '';
    const textOrig = origEl ? origEl.textContent.replace(/^"|"(\s*\(.*\))?$/g, '').trim() : '';

    if (lastTranslation && lastTranslation.translated === textTrans) {
      return lastTranslation;
    }
    if (textTrans && textTrans !== 'Impossibile tradurre online (Offline)' && textTrans !== 'Seleziona due lingue diverse') {
      return {
        translated: textTrans,
        original: textOrig || textTrans,
        toLang: toL,
        fromLang: fromL
      };
    }
    return lastTranslation;
  };

  document.getElementById('btnTransSpeakNormal')?.addEventListener('click', () => {
    const cur = getCurrentTranslation();
    if (!cur || !cur.translated) {
      showToast('Nessuna traduzione da ascoltare');
      return;
    }
    speakText(cur.translated, cur.toLang, 0.95);
  });

  document.getElementById('btnTransSpeakSlow')?.addEventListener('click', () => {
    const cur = getCurrentTranslation();
    if (!cur || !cur.translated) {
      showToast('Nessuna traduzione da ascoltare');
      return;
    }
    speakText(cur.translated, cur.toLang, 0.72);
  });

  const btnCopy = document.getElementById('btnTransCopy');
  btnCopy?.addEventListener('click', async () => {
    const cur = getCurrentTranslation();
    if (!cur || !cur.translated) {
      showToast('Nessuna traduzione da copiare');
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cur.translated);
      } else {
        const ta = document.createElement('textarea');
        ta.value = cur.translated;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      const labelSpan = btnCopy.querySelector('.action-label');
      if (labelSpan) {
        const orig = labelSpan.textContent;
        labelSpan.textContent = 'Copiato!';
        labelSpan.style.color = '#34D399';
        setTimeout(() => {
          labelSpan.textContent = orig;
          labelSpan.style.color = '';
        }, 1500);
      }
    } catch (e) {
      showToast('Copiato');
    }
  });

  document.getElementById('btnTransSaveOffline')?.addEventListener('click', async () => {
    const cur = getCurrentTranslation();
    if (!cur || !cur.translated) {
      showToast('Nessuna traduzione da salvare');
      return;
    }
    await saveToTranslationHistory(cur);
    showToast('Frase salvata!');
  });

  document.getElementById('btnTransShowBig')?.addEventListener('click', () => {
    const cur = getCurrentTranslation();
    if (!cur || !cur.translated) {
      showToast('Nessuna traduzione da visualizzare');
      return;
    }
    const toName = LANG_MAP[cur.toLang]?.name || cur.toLang.toUpperCase();
    openPhraseBigOverlay(cur.translated, cur.original, `Traduzione (${toName})`, cur.toLang);
  });

  document.getElementById('btnClearTranslationHistory')?.addEventListener('click', async () => {
    if (!state.activeTrip) return;
    if (confirm('Vuoi cancellare la cronologia delle traduzioni recenti?')) {
      state.activeTrip.savedTranslations = [];
      await putToStore('trips_store', state.activeTrip);
      renderSavedTranslationsList();
      showToast('Cronologia svuotata');
    }
  });

  // Audio nello Schermo Intero
  document.getElementById('btnBigSpeakNormal')?.addEventListener('click', () => {
    if (!currentBigOverlayData) return;
    speakText(currentBigOverlayData.text, currentBigOverlayData.langKey, 0.95);
  });

  document.getElementById('btnBigSpeakSlow')?.addEventListener('click', () => {
    if (!currentBigOverlayData) return;
    speakText(currentBigOverlayData.text, currentBigOverlayData.langKey, 0.72);
  });

  document.getElementById('btnClosePhraseBig')?.addEventListener('click', closePhraseBigOverlay);

  // Chiusura pagina principale
  document.getElementById('btnCloseTravelPage')?.addEventListener('click', closeTravelManualPage);
}


function setupEventListeners() {
  document.getElementById('btnThemeToggle')?.addEventListener('click', toggleTheme);

  // Top Bar 5 Utility Buttons
  // 1. Selettore Viaggi (Luggage SF Symbol)
  document.getElementById('btnTopTrips')?.addEventListener('click', () => {
    renderTripsSheetList();
    openSheet('sheetTrips');
  });

  // Mantenimento retrocompatibile Taxi & Codici Rapidi
  document.getElementById('btnTopTaxiCodes')?.addEventListener('click', () => {
    openTaxiCodesSheet();
  });
  document.getElementById('btnTopCalc')?.addEventListener('click', () => {
    openTaxiCodesSheet();
  });

  document.getElementById('btnTopMap')?.addEventListener('click', () => {
    state.tripSubView = 'map';
    switchTab('trip');
  });

  document.getElementById('btnTopDayPlan')?.addEventListener('click', () => {
    populateDayPlanNotificationSheet();
    openSheet('sheetDayPlanNotification');
  });

  document.getElementById('btnTopManual')?.addEventListener('click', () => {
    openTravelManualPage();
  });

  document.getElementById('btnGoToFullPlan')?.addEventListener('click', () => {
    closeAllSheets();
    state.tripSubView = 'plan';
    switchTab('trip');
  });

  // Setup Calcolatrice Keypad
  setupCalculatorKeypad();
  setupTravelManualSheet();

  document.getElementById('btnTripSelector')?.addEventListener('click', () => {
    renderTripsSheetList();
    openSheet('sheetTrips');
  });

  document.getElementById('sheetBackdrop')?.addEventListener('click', () => closeAllSheets());
  document.querySelectorAll('[data-close-sheet]').forEach(btn => {
    btn.addEventListener('click', () => closeAllSheets());
  });

  document.getElementById('btnCloseTaxiCard')?.addEventListener('click', closeTaxiCard);
  document.getElementById('btnCloseGateMode')?.addEventListener('click', closeGateMode);

  document.getElementById('formEvent')?.addEventListener('submit', saveEventFromForm);

  // Trigger fotocamera / file picker per Wallet Upload
  document.getElementById('btnPickCamera')?.addEventListener('click', () => {
    const input = document.getElementById('fieldWalletCamera');
    if (input) input.click();
  });

  document.getElementById('btnPickFile')?.addEventListener('click', () => {
    const input = document.getElementById('fieldWalletFile');
    if (input) input.click();
  });

  document.getElementById('fieldWalletCamera')?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSelectedWalletFile(e.target.files[0]);
    }
  });

  document.getElementById('fieldWalletFile')?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSelectedWalletFile(e.target.files[0]);
    }
  });

  document.getElementById('formWalletUpload')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('fieldWalletTitle').value.trim();
    const category = document.getElementById('fieldWalletCategory').value;
    const notes = document.getElementById('fieldWalletNotes').value.trim();
    const isPinned = Boolean(document.getElementById('fieldWalletPin')?.checked);
    const inVault = Boolean(document.getElementById('fieldWalletVault')?.checked);

    const file = selectedWalletFile;

    if (!file) {
      showToast('Seleziona o scatta una foto del documento');
      return;
    }

    // Controllo dimensione max 10MB per PDF
    if (file.type === 'application/pdf' && file.size > 10 * 1024 * 1024) {
      showToast('Il file PDF supera la dimensione massima di 10MB');
      return;
    }

    showToast('Salvataggio offline in corso...');

    await processAndStoreFile(file, {
      tripId: state.activeTrip.id,
      title,
      category,
      notes,
      isPinned,
      inVault
    });

    clearWalletUploadFile();
    closeAllSheets();
    await refreshApplicationData();
    showToast(inVault ? 'Documento salvato in Cassaforte 🔒' : 'Documento archiviato nel Wallet!');
  });

  document.getElementById('formExchangeRate')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newRate = parseFloat(document.getElementById('fieldManualRate').value);
    if (newRate && newRate > 0 && state.activeTrip) {
      state.activeTrip.exchangeRate = newRate;
      state.activeTrip.rateSource = 'manual';
      state.activeTrip.rateUpdatedAt = Date.now();
      await putToStore('trips_store', state.activeTrip);
      closeAllSheets();
      renderTabExpenses();
      showToast('Tasso aggiornato manualmente');
    }
  });

  document.getElementById('btnSaveCurrentAsTemplate')?.addEventListener('click', async () => {
    const input = document.getElementById('fieldNewTemplateName');
    const name = input.value.trim();
    if (!name) {
      showToast('Inserisci un nome per il template');
      return;
    }
    const currentItems = state.activeTrip?.packingList || [];
    const newTemplate = {
      id: 'tmpl_' + Date.now(),
      name,
      items: currentItems.map(i => ({ category: i.category, text: i.text, checked: false }))
    };
    await putToStore('templates_store', newTemplate);
    input.value = '';
    renderTemplatesSheetList();
    showToast('Nuovo template salvato!');
  });

  document.getElementById('btnAddNewTripOpen')?.addEventListener('click', () => {
    openEditTripSheet(null);
  });

  document.getElementById('formTrip')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTripFromForm();
  });
}

let selectedWalletFile = null;

function clearWalletUploadFile() {
  selectedWalletFile = null;
  const cameraInput = document.getElementById('fieldWalletCamera');
  const fileInput = document.getElementById('fieldWalletFile');
  if (cameraInput) cameraInput.value = '';
  if (fileInput) fileInput.value = '';

  const previewContainer = document.getElementById('walletFilePreviewContainer');
  const pickerGrid = document.getElementById('walletPickerGrid');
  if (previewContainer) {
    previewContainer.innerHTML = '';
    previewContainer.style.display = 'none';
  }
  if (pickerGrid) {
    pickerGrid.style.display = 'grid';
  }
}

function handleSelectedWalletFile(file) {
  if (!file) return;
  selectedWalletFile = file;

  // Auto-compila titolo se vuoto
  const titleInput = document.getElementById('fieldWalletTitle');
  if (titleInput && !titleInput.value.trim()) {
    const cleanName = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'Documento';
    titleInput.value = cleanName;
  }

  const previewContainer = document.getElementById('walletFilePreviewContainer');
  const pickerGrid = document.getElementById('walletPickerGrid');
  if (!previewContainer) return;

  const sizeKb = (file.size / 1024).toFixed(1);
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  const sizeText = file.size >= 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

  const isImg = file.type.startsWith('image/');
  let thumbHtml = '';
  if (isImg) {
    const url = URL.createObjectURL(file);
    thumbHtml = `<img src="${url}" class="wallet-preview-thumb" alt="Anteprima">`;
  } else {
    thumbHtml = `<div class="wallet-preview-file-icon">📄</div>`;
  }

  previewContainer.innerHTML = `
    <div class="wallet-preview-card">
      ${thumbHtml}
      <div class="wallet-preview-info">
        <div class="wallet-preview-name">${escapeHTML(file.name || 'Documento')}</div>
        <div class="wallet-preview-size">${escapeHTML(file.type || 'file')} • ${sizeText}</div>
      </div>
      <button type="button" class="wallet-preview-remove-btn" id="btnRemoveWalletPreview" title="Rimuovi file" aria-label="Rimuovi file">✕</button>
    </div>
  `;

  previewContainer.style.display = 'block';
  if (pickerGrid) pickerGrid.style.display = 'none';

  document.getElementById('btnRemoveWalletPreview')?.addEventListener('click', () => {
    clearWalletUploadFile();
  });
}

function openWalletUploadModal(presetVault = false) {
  clearWalletUploadFile();
  const form = document.getElementById('formWalletUpload');
  if (form) form.reset();

  const vaultCheckbox = document.getElementById('fieldWalletVault');
  if (vaultCheckbox) vaultCheckbox.checked = Boolean(presetVault);

  openSheet('sheetWalletUpload');
}

function openEditTripSheet(tripToEdit = null) {
  const form = document.getElementById('formTrip');
  if (form) form.reset();

  const titleEl = document.getElementById('editTripSheetTitle');
  if (tripToEdit) {
    if (titleEl) titleEl.textContent = 'Modifica Viaggio';
    document.getElementById('fieldTripId').value = tripToEdit.id || '';
    document.getElementById('fieldTripName').value = tripToEdit.name || '';
    document.getElementById('fieldTripDestination').value = tripToEdit.destination || '';
    document.getElementById('fieldTripStartDate').value = tripToEdit.startDate || '';
    document.getElementById('fieldTripEndDate').value = tripToEdit.endDate || '';
    
    const currSelect = document.getElementById('fieldTripDestCurrency');
    if (currSelect) currSelect.value = tripToEdit.destCurrency || 'CNY';

    const budgetInput = document.getElementById('fieldTripBudget');
    if (budgetInput) budgetInput.value = (tripToEdit.budget || tripToEdit.budgetHome || '');

    const rateInput = document.getElementById('fieldTripExchangeRate');
    if (rateInput) rateInput.value = tripToEdit.exchangeRate || '';

    const tzInput = document.getElementById('fieldTripDestTimeZone');
    if (tzInput) tzInput.value = tripToEdit.destTimeZone || 'Asia/Shanghai';

    const hotel = tripToEdit.accommodation || {};
    document.getElementById('fieldTripHotelName').value = hotel.name || '';
    document.getElementById('fieldTripHotelAddress').value = hotel.address || '';
    const hotelLocal = document.getElementById('fieldTripHotelAddressLocal');
    if (hotelLocal) hotelLocal.value = hotel.addressLocal || hotel.nameLocal || '';
    const checkin = document.getElementById('fieldTripHotelCheckIn');
    if (checkin) checkin.value = hotel.checkIn || '';
    const phone = document.getElementById('fieldTripHotelPhone');
    if (phone) phone.value = hotel.phone || '';

    const codes = tripToEdit.codes || {};
    document.getElementById('fieldTripPnr').value = codes.pnr || '';
    document.getElementById('fieldTripLockbox').value = codes.lockbox || '';
    document.getElementById('fieldTripWifi').value = codes.wifi || '';
    const ins = document.getElementById('fieldTripInsurance');
    if (ins) ins.value = codes.insurance || '';

    const partInput = document.getElementById('fieldTripParticipants');
    if (partInput) {
      partInput.value = (tripToEdit.participants && Array.isArray(tripToEdit.participants)) 
        ? tripToEdit.participants.join(', ') 
        : 'Io';
    }
  } else {
    if (titleEl) titleEl.textContent = 'Nuovo Viaggio';
    document.getElementById('fieldTripId').value = '';
    const currSelect = document.getElementById('fieldTripDestCurrency');
    if (currSelect) currSelect.value = 'CNY';
    const rateInput = document.getElementById('fieldTripExchangeRate');
    if (rateInput) rateInput.value = '7.85';
    const partInput = document.getElementById('fieldTripParticipants');
    if (partInput) partInput.value = 'Io';
  }

  openSheet('sheetEditTrip');
}

function renderTripsSheetList() {
  const container = document.getElementById('tripsListContainer');
  if (!container) return;

  if (!state.allTrips || state.allTrips.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px 12px; color:var(--text-secondary); font-size:13px;">
        Nessun viaggio salvato. Tocca il pulsante in basso per crearne uno.
      </div>
    `;
    return;
  }

  let html = '<div style="margin-bottom:14px; display:flex; flex-direction:column; gap:8px;">';
  state.allTrips.forEach(t => {
    const isSelected = t.id === state.currentTripId;
    const destCurr = t.destCurrency || 'EUR';
    const budgetInfo = (t.budget || t.budgetHome) ? `${formatMoney(t.budget || t.budgetHome, 'EUR')}` : 'Nessun budget';

    html += `
      <div class="trip-item-card ${isSelected ? 'is-active-trip' : ''}" data-trip-id="${t.id}">
        <div class="trip-item-main" data-action="select-trip" data-trip-id="${t.id}">
          <div class="trip-item-title-row">
            <span class="trip-item-title">${escapeHTML(t.name || t.destination)}</span>
            ${isSelected ? '<span class="trip-badge-active">● Attivo</span>' : ''}
          </div>
          <div class="trip-item-subtitle">
            📍 ${escapeHTML(t.destination)} • ${t.startDate || 'Data n/d'} • ${budgetInfo} (${destCurr})
          </div>
        </div>
        <div class="trip-item-actions">
          <button class="trip-action-icon-btn btn-edit-trip" data-action="edit-trip" data-trip-id="${t.id}" title="Modifica viaggio" aria-label="Modifica viaggio">
            ✎
          </button>
          <button class="trip-action-icon-btn btn-delete-trip" data-action="delete-trip" data-trip-id="${t.id}" title="Elimina viaggio" aria-label="Elimina viaggio">
            🗑
          </button>
        </div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;

  // Event delegation sui viaggi
  container.onclick = async (e) => {
    const editBtn = e.target.closest('[data-action="edit-trip"]');
    if (editBtn) {
      e.stopPropagation();
      const tripId = editBtn.getAttribute('data-trip-id');
      const tripObj = state.allTrips.find(x => x.id === tripId);
      if (tripObj) {
        openEditTripSheet(tripObj);
      }
      return;
    }

    const delBtn = e.target.closest('[data-action="delete-trip"]');
    if (delBtn) {
      e.stopPropagation();
      const tripId = delBtn.getAttribute('data-trip-id');
      const tripObj = state.allTrips.find(x => x.id === tripId);
      const tripName = tripObj ? (tripObj.name || tripObj.destination) : 'questo viaggio';
      if (confirm(`Sei sicuro di voler eliminare "${tripName}"? L'operazione non può essere annullata.`)) {
        await deleteFromStore('trips_store', tripId);
        state.allTrips = state.allTrips.filter(x => x.id !== tripId);
        if (state.currentTripId === tripId) {
          if (state.allTrips.length > 0) {
            state.currentTripId = state.allTrips[0].id;
            state.activeTrip = state.allTrips[0];
          } else {
            state.activeTrip = (typeof getDemoTrip === "function" ? getDemoTrip() : null) || DEFAULT_DEMO_TRIP;
            state.allTrips = [state.activeTrip];
            state.currentTripId = state.activeTrip.id;
            await putToStore('trips_store', state.activeTrip);
          }
          localStorage.setItem('nomad_active_trip_id', state.currentTripId);
        }
        showToast('Viaggio eliminato');
        renderTripsSheetList();
        renderTabDashboard();
        if (state.activeTab === 'expenses') renderTabExpenses();
      }
      return;
    }

    const selectRow = e.target.closest('.trip-item-card');
    if (selectRow) {
      const tripId = selectRow.getAttribute('data-trip-id');
      if (tripId && tripId !== state.currentTripId) {
        state.currentTripId = tripId;
        const found = state.allTrips.find(x => x.id === tripId);
        if (found) state.activeTrip = found;
        localStorage.setItem('nomad_active_trip_id', tripId);
        closeAllSheets();
        await refreshApplicationData();
        showToast('Viaggio selezionato');
        opportunisticRateSync(false);
      } else {
        closeAllSheets();
      }
    }
  };
}

async function saveTripFromForm() {
  const tripId = document.getElementById('fieldTripId').value || ('trip_' + Date.now());
  const name = document.getElementById('fieldTripName').value.trim();
  const destination = document.getElementById('fieldTripDestination').value.trim();
  const startDate = document.getElementById('fieldTripStartDate').value;
  const endDate = document.getElementById('fieldTripEndDate').value;
  
  const destCurrencyEl = document.getElementById('fieldTripDestCurrency');
  const destCurrency = (destCurrencyEl ? destCurrencyEl.value : 'CNY').trim().toUpperCase();

  const budgetEl = document.getElementById('fieldTripBudget');
  const rawBudget = budgetEl ? parseFloat(budgetEl.value) : 0;
  const budgetVal = (!isNaN(rawBudget) && rawBudget >= 0) ? rawBudget : 0;

  const rateEl = document.getElementById('fieldTripExchangeRate');
  const exchangeRate = (rateEl && !isNaN(parseFloat(rateEl.value))) ? parseFloat(rateEl.value) : 1;

  const tzEl = document.getElementById('fieldTripDestTimeZone');
  const destTimeZone = (tzEl && tzEl.value.trim()) ? tzEl.value.trim() : 'Europe/Rome';

  const hotelName = document.getElementById('fieldTripHotelName')?.value.trim() || '';
  const hotelAddress = document.getElementById('fieldTripHotelAddress')?.value.trim() || '';
  const hotelAddressLocal = document.getElementById('fieldTripHotelAddressLocal')?.value.trim() || '';
  const hotelCheckIn = document.getElementById('fieldTripHotelCheckIn')?.value.trim() || '';
  const hotelPhone = document.getElementById('fieldTripHotelPhone')?.value.trim() || '';

  const pnr = document.getElementById('fieldTripPnr')?.value.trim() || '';
  const lockbox = document.getElementById('fieldTripLockbox')?.value.trim() || '';
  const wifi = document.getElementById('fieldTripWifi')?.value.trim() || '';
  const insurance = document.getElementById('fieldTripInsurance')?.value.trim() || '';

  // Compagni di viaggio
  const partInput = document.getElementById('fieldTripParticipants');
  let participants = ['Io'];
  if (partInput && partInput.value.trim()) {
    participants = partInput.value.split(',').map(s => s.trim()).filter(Boolean);
    if (!participants.includes('Io')) participants.unshift('Io');
  }

  const existingTrip = state.allTrips.find(t => t.id === tripId) || {};

  // Auto-geocodifica alloggio via Nominatim se online
  let hotelLat = existingTrip.accommodation?.lat || null;
  let hotelLng = existingTrip.accommodation?.lng || null;
  if (hotelAddress && navigator.onLine && (!hotelLat || !hotelLng)) {
    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(hotelAddress)}&limit=1`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
          hotelLat = parseFloat(geoData[0].lat);
          hotelLng = parseFloat(geoData[0].lon);
        }
      }
    } catch (e) {}
  }

  const newTrip = {
    ...existingTrip,
    id: tripId,
    name: name || destination,
    destination,
    startDate,
    endDate,
    budget: budgetVal,
    budgetHome: budgetVal,
    status: 'active',
    homeCurrency: state.homeCurrency || 'EUR',
    destCurrency,
    exchangeRate,
    rateUpdatedAt: existingTrip.rateUpdatedAt || Date.now(),
    rateSource: existingTrip.rateSource || 'auto',
    homeTimeZone: state.homeTimeZone || 'Europe/Rome',
    destTimeZone,
    participants,
    accommodation: {
      name: hotelName,
      nameLocal: hotelAddressLocal || hotelName,
      address: hotelAddress,
      addressLocal: hotelAddressLocal || hotelAddress,
      checkIn: hotelCheckIn,
      phone: hotelPhone,
      lat: hotelLat,
      lng: hotelLng
    },
    codes: { pnr, lockbox, wifi, insurance },
    preTripChecklist: existingTrip.preTripChecklist || [
      { id: 'pt_1', text: 'Scaricare mappa offline', checked: false },
      { id: 'pt_2', text: 'Verificare passaporto', checked: false },
      { id: 'pt_3', text: 'Caricare powerbank', checked: false }
    ],
    packingList: existingTrip.packingList || [],
    itineraryDays: existingTrip.itineraryDays || [
      { id: 'day_1', date: startDate, title: 'Giorno 1', events: [] }
    ],
    expenses: existingTrip.expenses || []
  };

  await putToStore('trips_store', newTrip);
  state.currentTripId = newTrip.id;
  state.activeTrip = newTrip;
  
  if (!state.allTrips) state.allTrips = [];
  const existingIdx = state.allTrips.findIndex(x => x.id === newTrip.id);
  if (existingIdx !== -1) {
    state.allTrips[existingIdx] = newTrip;
  } else {
    state.allTrips.push(newTrip);
  }

  localStorage.setItem('nomad_active_trip_id', newTrip.id);

  closeAllSheets();
  await refreshApplicationData();
  showToast('Viaggio salvato!');
  opportunisticRateSync(false);
}

function openAddEventSheet() {
  const form = document.getElementById('formEvent');
  if (form) form.reset();
  const day = state.activeTrip.itineraryDays[state.currentDayIndex];
  if (!day) return;
  document.getElementById('fieldEventDayId').value = day.id;
  document.getElementById('fieldEventTime').value = '10:00';
  document.getElementById('fieldEventLat').value = '';
  document.getElementById('fieldEventLng').value = '';
  openSheet('sheetEvent');
}

async function saveEventFromForm(e) {
  e.preventDefault();
  const dayId = document.getElementById('fieldEventDayId').value;
  const time = document.getElementById('fieldEventTime').value;
  const category = document.getElementById('fieldEventCategory').value;
  const title = document.getElementById('fieldEventTitle').value.trim();
  const location = document.getElementById('fieldEventLocation').value.trim();
  const notes = document.getElementById('fieldEventNotes').value.trim();

  let lat = document.getElementById('fieldEventLat').value ? parseFloat(document.getElementById('fieldEventLat').value) : null;
  let lng = document.getElementById('fieldEventLng').value ? parseFloat(document.getElementById('fieldEventLng').value) : null;

  // Auto-geocodifica tappa se online
  if (location && navigator.onLine && (!lat || !lng)) {
    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
          lat = parseFloat(geoData[0].lat);
          lng = parseFloat(geoData[0].lon);
        }
      }
    } catch (e) {}
  }

  const day = state.activeTrip.itineraryDays.find(d => d.id === dayId);
  if (!day) return;

  const newEvent = {
    id: 'ev_' + Date.now(),
    time,
    category,
    title,
    location,
    notes,
    lat,
    lng
  };

  day.events = day.events || [];
  day.events.push(newEvent);

  await putToStore('trips_store', state.activeTrip);
  closeAllSheets();
  renderTabTrip();
  showToast('Tappa salvata nell\'itinerario');
}

async function handleAddNewDay() {
  if (!state.activeTrip) return;
  const days = state.activeTrip.itineraryDays || [];
  let newDateStr = new Date().toISOString().split('T')[0];
  if (days.length > 0) {
    const lastDay = new Date(days[days.length - 1].date);
    lastDay.setDate(lastDay.getDate() + 1);
    newDateStr = lastDay.toISOString().split('T')[0];
  }

  const newDay = {
    id: 'day_' + Date.now(),
    date: newDateStr,
    title: `Giorno ${days.length + 1}`,
    events: []
  };

  days.push(newDay);
  state.activeTrip.itineraryDays = days;
  await putToStore('trips_store', state.activeTrip);
  state.currentDayIndex = days.length - 1;
  renderTabTrip();
  showToast('Nuovo giorno aggiunto');
}

async function deleteEvent(eventId) {
  const day = state.activeTrip.itineraryDays[state.currentDayIndex];
  if (!day) return;
  day.events = day.events.filter(e => e.id !== eventId);
  await putToStore('trips_store', state.activeTrip);
  renderTabTrip();
  showToast('Tappa rimossa');
}

/* ==========================================================================
   UTILITY & TOAST
   ========================================================================== */
function getNativeMapsUrl(query) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const encoded = encodeURIComponent(query);
  if (isIOS) return `maps://maps.apple.com/?q=${encoded}`;
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

function showToast(message) {
  const toast = document.getElementById('toastNotification');
  const toastMsg = document.getElementById('toastMessage');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  toast.classList.add('visible');

  clearTimeout(showToast._timeout);
  showToast._timeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2400);
}

function copyToClipboard(text, successMsg = 'Copiato!') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(successMsg)).catch(() => fallbackCopy(text, successMsg));
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast(successMsg);
  } catch (err) {
    showToast('Impossibile copiare');
  }
  document.body.removeChild(textArea);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(amount, currency = 'EUR') {
  const num = Number(amount) || 0;
  return num.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' ' + currency;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}


// Esponi per inline onclick ed event delegation
window.openBudgetEditModal = openBudgetEditModal;
window.saveTripBudget = saveTripBudget;

window.openEditTripSheet = openEditTripSheet;

window.recalcConverter = recalcConverter;
