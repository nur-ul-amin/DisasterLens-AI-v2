/**
 * ============================================================================
 * DisasterLens AI — Application Logic (app.js)
 * NDMA Flood Reporting PWA | Phase 1: Days 1–4
 * ============================================================================
 *
 * MODULES:
 * 1. Service Worker Registration
 * 2. Bilingual i18n Engine (EN ↔ UR)
 * 3. Leaflet Map Engine (OSM tiles, markers, click-to-pin)
 * 4. Geolocation Handler (GPS with high accuracy)
 * 5. Reverse Geocoder (Nominatim / OSM)
 * 6. Form State Manager (depth, vehicle, hazard selectors)
 * 7. Canvas Image Compressor (<200KB output)
 * 8. IndexedDB Offline Sync Queue
 * 9. Toast Notification System
 * 10. Network Status Monitor
 *
 * ARCHITECTURE NOTES:
 * - Phase 2 (NLP Backend): Reports will POST to FastAPI at API_BASE_URL.
 *   The NLP pipeline will classify Urdu/Roman Urdu text and extract
 *   severity, location mentions, and actionable routing data.
 * - Phase 3 (NEOC Dashboard): Real-time WebSocket feed from the backend
 *   will push validated reports to the dashboard for overlay on the
 *   national flood routing map.
 * ============================================================================
 */

// ─── CONFIGURATION ─────────────────────────────────────────────────────────
const CONFIG = {
  // Phase 2: Replace with actual FastAPI endpoint
  API_BASE_URL: '/api/v1/reports/submit',

  // Default map center: Islamabad, Pakistan
  MAP_CENTER: [33.6844, 73.0479],
  MAP_ZOOM: 6,        // Country-level view
  MAP_MAX_ZOOM: 18,
  MAP_MIN_ZOOM: 5,

  // Image compression settings
  MAX_IMAGE_WIDTH: 800,
  MAX_IMAGE_SIZE_KB: 200,
  JPEG_QUALITY_START: 0.6,

  // Nominatim reverse geocoding (free, 1 req/sec limit)
  NOMINATIM_URL: 'https://nominatim.openstreetmap.org/reverse',

  // IndexedDB settings
  DB_NAME: 'disasterlens_db',
  DB_VERSION: 1,
  STORE_NAME: 'pending_reports',
};


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 1: SERVICE WORKER REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register the service worker for offline caching.
 * The SW caches the app shell so the PWA works without connectivity.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[App] Service Worker registered, scope:', reg.scope);

          // Register background sync for pending reports (Phase 2)
          if ('sync' in reg) {
            reg.sync.register('sync-reports').catch(() => {
              console.log('[App] Background sync not supported');
            });
          }
        })
        .catch((err) => {
          console.error('[App] Service Worker registration failed:', err);
        });
    });
  }
}

registerServiceWorker();


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 2: BILINGUAL i18n ENGINE (English ↔ Urdu)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Translation strings for EN and UR.
 * Keys match data-i18n attributes in the HTML.
 * Phase 2: These can be extended with NLP-generated labels.
 */
const TRANSLATIONS = {
  en: {
    appTitle: 'DisasterLens AI',
    appSubtitle: 'NDMA Flood Reporting',
    offline: 'Offline',
    online: 'Online',
    pending: 'pending',
    detectLocation: 'Detect Location',
    reportHazard: 'Report Hazard',
    reportTitle: '⚠️ Flood Hazard Report',
    pinLocation: '📍 Pin Location',
    notSet: 'Not Set',
    locationSet: 'Set ✓',
    waterDepth: 'Water Depth Level',
    depthAnkle: 'Ankle-Deep',
    depthKnee: 'Knee-Deep',
    depthWaist: 'Waist-Deep',
    depthSubmerged: 'Submerged',
    vehiclePass: 'Vehicle Passability',
    vehPedestrian: 'Foot Only',
    veh4x4: '4x4 / Heavy Truck',
    vehBoat: 'Boat Required',
    vehBlocked: 'Impassable',
    hazardType: 'Hazard Type',
    hazSubmerged: 'Submerged Road',
    hazBridge: 'Bridge / Road Failure',
    hazLandslide: 'Landslide / Debris',
    hazElectrical: 'Electrical Hazard',
    obsNotes: 'Observation Notes',
    obsPlaceholder: 'Describe the situation (English or Roman Urdu)...',
    photoEvidence: 'Photo Evidence',
    tapToCapture: 'Tap to capture or select photo',
    autoCompress: 'Auto-compressed to <200KB for low bandwidth',
    remove: 'Remove',
    submitReport: 'Submit Hazard Report',
    // Toast messages
    toastOfflineSaved: 'Offline Mode: Report saved locally. Will sync when network returns.',
    toastSubmitted: 'Report submitted successfully!',
    toastSyncing: 'Syncing offline reports...',
    toastSynced: 'All pending reports synced!',
    toastGPSError: 'Could not detect location. Please enable GPS.',
    toastGPSDenied: 'Location access denied. Please allow GPS in settings.',
    toastNoLocation: 'Please set a location on the map first.',
    toastPhotoCompressed: 'Photo compressed to',
    toastReportSaved: 'Report saved!',
  },
  ur: {
    appTitle: 'ریزیلینٹ پاتھ',
    appSubtitle: 'این ڈی ایم اے سیلاب رپورٹنگ',
    offline: 'آف لائن',
    online: 'آن لائن',
    pending: 'زیر التوا',
    detectLocation: 'مقام معلوم کریں',
    reportHazard: 'خطرے کی اطلاع',
    reportTitle: '⚠️ سیلاب خطرے کی رپورٹ',
    pinLocation: '📍 پن مقام',
    notSet: 'سیٹ نہیں',
    locationSet: 'سیٹ ✓',
    waterDepth: 'پانی کی گہرائی',
    depthAnkle: 'ٹخنوں تک',
    depthKnee: 'گھٹنوں تک',
    depthWaist: 'کمر تک',
    depthSubmerged: 'مکمل ڈوبا ہوا',
    vehiclePass: 'گاڑی کی گزرگاہ',
    vehPedestrian: 'صرف پیدل',
    veh4x4: '4x4 / بھاری ٹرک',
    vehBoat: 'کشتی ضروری',
    vehBlocked: 'مکمل بند',
    hazardType: 'خطرے کی قسم',
    hazSubmerged: 'ڈوبی ہوئی سڑک',
    hazBridge: 'پل / سڑک ٹوٹ گئی',
    hazLandslide: 'لینڈ سلائیڈ / ملبہ',
    hazElectrical: 'بجلی کا خطرہ',
    obsNotes: 'مشاہدات',
    obsPlaceholder: '...صورتحال بیان کریں',
    photoEvidence: 'تصویری ثبوت',
    tapToCapture: 'تصویر لینے کے لیے ٹیپ کریں',
    autoCompress: '200KB سے کم میں خودکار کمپریس',
    remove: 'ہٹائیں',
    submitReport: 'رپورٹ جمع کریں',
    toastOfflineSaved: 'آف لائن: رپورٹ محفوظ۔ نیٹ ورک ملنے پر خودکار بھیجی جائے گی۔',
    toastSubmitted: '!رپورٹ کامیابی سے جمع ہو گئی',
    toastSyncing: '...آف لائن رپورٹس بھیجی جا رہی ہیں',
    toastSynced: '!تمام زیر التوا رپورٹس بھیج دی گئیں',
    toastGPSError: '.مقام معلوم نہیں ہو سکا۔ GPS آن کریں',
    toastGPSDenied: '.مقام کی اجازت دیں',
    toastNoLocation: '.پہلے نقشے پر مقام سیٹ کریں',
    toastPhotoCompressed: 'تصویر کمپریس ہو گئی',
    toastReportSaved: '!رپورٹ محفوظ',
  }
};

let currentLang = localStorage.getItem('rp_lang') || 'en';

/**
 * Apply translations to all elements with data-i18n attributes.
 */
function applyTranslations() {
  const strings = TRANSLATIONS[currentLang];

  // Update text content
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (strings[key]) {
      el.textContent = strings[key];
    }
  });

  // Update placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (strings[key]) {
      el.placeholder = strings[key];
    }
  });

  // Show/hide Urdu labels based on language
  document.querySelectorAll('[data-i18n-ur]').forEach((el) => {
    el.style.display = currentLang === 'ur' ? 'none' : 'inline';
  });

  // Update language toggle button
  const langBtn = document.getElementById('lang-toggle');
  langBtn.textContent = currentLang === 'en' ? 'UR' : 'EN';

  // Update document direction for Urdu
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ur' ? 'rtl' : 'ltr';
}

/**
 * Toggle between English and Urdu.
 */
function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'ur' : 'en';
  localStorage.setItem('rp_lang', currentLang);
  applyTranslations();
}

// Get translated string by key
function t(key) {
  return TRANSLATIONS[currentLang][key] || TRANSLATIONS['en'][key] || key;
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 3: LEAFLET MAP ENGINE
// ═══════════════════════════════════════════════════════════════════════════

let map;
let reportMarker = null;
let selectedLatLng = null;

/**
 * Initialize the Leaflet map with OSM tiles.
 * Centered on Pakistan with appropriate zoom for country overview.
 */
function initMap() {
  map = L.map('map', {
    center: CONFIG.MAP_CENTER,
    zoom: CONFIG.MAP_ZOOM,
    maxZoom: CONFIG.MAP_MAX_ZOOM,
    minZoom: CONFIG.MAP_MIN_ZOOM,
    zoomControl: true,
    attributionControl: true,
  });

  // OpenStreetMap tile layer — lightweight, free, no API key required
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | NDMA Pakistan',
    maxZoom: CONFIG.MAP_MAX_ZOOM,
  }).addTo(map);

  // Move zoom control to bottom-left on mobile for better reach
  map.zoomControl.setPosition('bottomleft');

  // Click/tap to place a marker
  map.on('click', (e) => {
    setMarker(e.latlng.lat, e.latlng.lng);
  });

  console.log('[Map] Initialized — centered on Pakistan');
}

/**
 * Place or move the report marker on the map.
 * The marker is draggable so users can refine their pin placement.
 */
function setMarker(lat, lng) {
  selectedLatLng = { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };

  if (reportMarker) {
    reportMarker.setLatLng([lat, lng]);
  } else {
    // Create a draggable marker with custom styling
    reportMarker = L.marker([lat, lng], {
      draggable: true,
      autoPan: true,
      title: 'Hazard Report Location',
    }).addTo(map);

    // Update coordinates when marker is dragged
    reportMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      selectedLatLng = { lat: parseFloat(pos.lat.toFixed(6)), lng: parseFloat(pos.lng.toFixed(6)) };
      updateCoordsDisplay();
      reverseGeocode(pos.lat, pos.lng);
    });
  }

  updateCoordsDisplay();
  reverseGeocode(lat, lng);
}

/**
 * Update the coordinate display and form location card.
 */
function updateCoordsDisplay() {
  if (!selectedLatLng) return;

  const coordsDisplay = document.getElementById('coords-display');
  const coordsText = document.getElementById('coords-text');
  const formCoords = document.getElementById('form-coords');
  const locStatus = document.getElementById('loc-status');

  coordsDisplay.style.display = 'block';
  coordsText.textContent = `${selectedLatLng.lat}, ${selectedLatLng.lng}`;
  formCoords.textContent = `${selectedLatLng.lat}, ${selectedLatLng.lng}`;

  locStatus.textContent = t('locationSet');
  locStatus.className = 'loc-status set';
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 4: GEOLOCATION HANDLER (GPS)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect the user's current GPS location using the browser API.
 * Uses high accuracy mode for field precision.
 */
function detectLocation() {
  if (!navigator.geolocation) {
    showToast(t('toastGPSError'), 'warning');
    return;
  }

  // Show loading spinner
  const spinner = document.getElementById('gps-spinner');
  const locateBtn = document.getElementById('btn-locate');
  spinner.classList.add('active');
  locateBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;

      // Fly to the detected location with animation
      map.flyTo([latitude, longitude], 15, { duration: 1.5 });
      setMarker(latitude, longitude);

      spinner.classList.remove('active');
      locateBtn.disabled = false;

      console.log(`[GPS] Location detected: ${latitude}, ${longitude}`);
    },
    (error) => {
      spinner.classList.remove('active');
      locateBtn.disabled = false;

      switch (error.code) {
        case error.PERMISSION_DENIED:
          showToast(t('toastGPSDenied'), 'warning');
          break;
        case error.POSITION_UNAVAILABLE:
        case error.TIMEOUT:
        default:
          showToast(t('toastGPSError'), 'warning');
          break;
      }
      console.error('[GPS] Error:', error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000, // Accept cached position up to 1 minute old
    }
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 5: REVERSE GEOCODER (Nominatim / OpenStreetMap)
// ═══════════════════════════════════════════════════════════════════════════

let geocodeTimeout = null;

/**
 * Reverse geocode coordinates to a human-readable place name.
 * Uses Nominatim API (free, 1 request/second rate limit).
 * Debounced to prevent spamming during marker drags.
 */
function reverseGeocode(lat, lng) {
  // Clear any pending geocode request (debounce)
  if (geocodeTimeout) clearTimeout(geocodeTimeout);

  const addressEl = document.getElementById('coords-address');
  const formAddressEl = document.getElementById('form-address');
  addressEl.textContent = 'Looking up address...';

  geocodeTimeout = setTimeout(() => {
    const url = `${CONFIG.NOMINATIM_URL}?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;

    fetch(url, {
      headers: { 'Accept-Language': currentLang === 'ur' ? 'ur,en' : 'en,ur' }
    })
      .then((res) => res.json())
      .then((data) => {
        const placeName = data.display_name
          ? data.display_name.split(',').slice(0, 3).join(', ')
          : 'Unknown area';

        addressEl.textContent = placeName;
        formAddressEl.textContent = placeName;
        console.log('[Geocode] Resolved:', placeName);
      })
      .catch(() => {
        addressEl.textContent = 'Address unavailable (offline)';
        formAddressEl.textContent = 'Address unavailable';
      });
  }, 500); // 500ms debounce to respect Nominatim rate limits
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 6: FORM STATE MANAGER
// ═══════════════════════════════════════════════════════════════════════════

// Form state object — collects all report data
const formState = {
  depth: null,
  vehicle: null,
  hazard: null,
  notes: '',
  photo: null,       // base64 compressed image
  photoSize: 0,      // compressed size in bytes
};

/**
 * Initialize selector card click handlers.
 * Each selector group (depth, vehicle, hazard) allows single selection.
 */
function initFormSelectors() {
  const selectorGroups = [
    { id: 'depth-selector', stateKey: 'depth' },
    { id: 'vehicle-selector', stateKey: 'vehicle' },
    { id: 'hazard-selector', stateKey: 'hazard' },
  ];

  selectorGroups.forEach(({ id, stateKey }) => {
    const container = document.getElementById(id);
    const cards = container.querySelectorAll('.selector-card');

    cards.forEach((card) => {
      card.addEventListener('click', () => {
        // Deselect all in this group
        cards.forEach((c) => c.classList.remove('selected'));
        // Select this card
        card.classList.add('selected');
        // Update form state
        formState[stateKey] = card.getAttribute('data-value');
      });
    });
  });
}

/**
 * Reset the form to its initial state.
 */
function resetForm() {
  formState.depth = null;
  formState.vehicle = null;
  formState.hazard = null;
  formState.notes = '';
  formState.photo = null;
  formState.photoSize = 0;

  // Deselect all cards
  document.querySelectorAll('.selector-card').forEach((c) => c.classList.remove('selected'));

  // Clear textarea
  document.getElementById('observation-notes').value = '';

  // Clear photo preview
  document.getElementById('upload-preview').classList.remove('visible');
  document.getElementById('preview-image').src = '';
  document.getElementById('photo-input').value = '';
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 7: CANVAS IMAGE COMPRESSOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compress an image file to under MAX_IMAGE_SIZE_KB using the Canvas API.
 *
 * Strategy:
 * 1. Load the image into an off-screen canvas
 * 2. Resize to max MAX_IMAGE_WIDTH pixels (maintaining aspect ratio)
 * 3. Export as JPEG at decreasing quality until under size limit
 *
 * This is critical for 2G/3G networks where uploading a 5MB photo
 * would take minutes. Target: <200KB per image.
 *
 * @param {File} file - The image file from the file input
 * @returns {Promise<{base64: string, sizeKB: number}>}
 */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Create off-screen canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate resize dimensions (maintain aspect ratio)
        let width = img.width;
        let height = img.height;

        if (width > CONFIG.MAX_IMAGE_WIDTH) {
          height = Math.round((height * CONFIG.MAX_IMAGE_WIDTH) / width);
          width = CONFIG.MAX_IMAGE_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw resized image
        ctx.drawImage(img, 0, 0, width, height);

        // Iteratively reduce quality until under size limit
        let quality = CONFIG.JPEG_QUALITY_START;
        let base64 = canvas.toDataURL('image/jpeg', quality);
        let sizeKB = Math.round((base64.length * 3) / 4 / 1024); // base64 → bytes → KB

        // Reduce quality in steps if still too large
        while (sizeKB > CONFIG.MAX_IMAGE_SIZE_KB && quality > 0.1) {
          quality -= 0.1;
          base64 = canvas.toDataURL('image/jpeg', quality);
          sizeKB = Math.round((base64.length * 3) / 4 / 1024);
        }

        console.log(`[Compressor] ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${sizeKB}KB (quality: ${quality.toFixed(1)})`);

        resolve({ base64, sizeKB });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Handle photo file selection — compress and show preview.
 */
function handlePhotoSelect(file) {
  if (!file || !file.type.startsWith('image/')) return;

  compressImage(file)
    .then(({ base64, sizeKB }) => {
      formState.photo = base64;
      formState.photoSize = sizeKB;

      // Show preview
      const preview = document.getElementById('upload-preview');
      const previewImg = document.getElementById('preview-image');
      const previewSize = document.getElementById('preview-size');

      previewImg.src = base64;
      previewSize.textContent = `${sizeKB}KB (${t('toastPhotoCompressed')})`;
      preview.classList.add('visible');

      showToast(`${t('toastPhotoCompressed')} ${sizeKB}KB`, 'success');
    })
    .catch((err) => {
      console.error('[Compressor] Error:', err);
      showToast('Failed to process image', 'warning');
    });
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 8: IndexedDB OFFLINE SYNC QUEUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * IndexedDB wrapper for storing pending reports when offline.
 *
 * ARCHITECTURE:
 * When the user submits a report without connectivity, the payload
 * (GPS coordinates, depth, passability, hazard type, notes, compressed
 * base64 photo) is stored in IndexedDB under 'pending_reports'.
 *
 * When connectivity returns (window 'online' event), the queue is
 * automatically flushed by POSTing each report to API_BASE_URL.
 *
 * Phase 2: The FastAPI backend will accept these POSTs and route them
 * through the NLP classification pipeline.
 */

let db = null;

/**
 * Open or create the IndexedDB database.
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(CONFIG.STORE_NAME)) {
        const store = database.createObjectStore(CONFIG.STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        // Index by timestamp for ordered retrieval
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[IDB] Created object store:', CONFIG.STORE_NAME);
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      console.log('[IDB] Database opened successfully');
      resolve(db);
    };

    request.onerror = (e) => {
      console.error('[IDB] Failed to open database:', e.target.error);
      reject(e.target.error);
    };
  });
}

/**
 * Save a report to IndexedDB.
 */
function saveReportToIDB(report) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const tx = db.transaction(CONFIG.STORE_NAME, 'readwrite');
    const store = tx.objectStore(CONFIG.STORE_NAME);
    const request = store.add(report);

    request.onsuccess = () => {
      console.log('[IDB] Report saved locally, ID:', request.result);
      resolve(request.result);
    };

    request.onerror = (e) => {
      console.error('[IDB] Failed to save report:', e.target.error);
      reject(e.target.error);
    };
  });
}

/**
 * Get all pending reports from IndexedDB.
 */
function getPendingReports() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve([]);
      return;
    }

    const tx = db.transaction(CONFIG.STORE_NAME, 'readonly');
    const store = tx.objectStore(CONFIG.STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete a report from IndexedDB after successful sync.
 */
function deleteReportFromIDB(id) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const tx = db.transaction(CONFIG.STORE_NAME, 'readwrite');
    const store = tx.objectStore(CONFIG.STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Count pending reports and update the badge.
 */
async function updatePendingCount() {
  try {
    const reports = await getPendingReports();
    const count = reports.length;
    const badge = document.getElementById('pending-badge');
    const syncStatus = document.getElementById('sync-status');
    const syncCount = document.getElementById('sync-count');

    if (count > 0) {
      badge.textContent = count;
      badge.classList.add('visible');
      syncStatus.classList.add('visible');
      syncCount.textContent = count;
    } else {
      badge.classList.remove('visible');
      syncStatus.classList.remove('visible');
    }
  } catch (err) {
    console.error('[IDB] Error counting pending reports:', err);
  }
}

/**
 * Flush all pending reports to the backend.
 * Called automatically when the device comes back online.
 *
 * Phase 2: This will POST to the FastAPI /api/reports endpoint.
 * For now, it logs the attempt and clears the queue on simulated success.
 */
async function flushPendingReports() {
  try {
    const reports = await getPendingReports();
    if (reports.length === 0) return;

    showToast(t('toastSyncing'), 'info');
    console.log(`[Sync] Flushing ${reports.length} pending reports...`);

    for (const report of reports) {
      try {
        // Phase 2: Actual POST to FastAPI backend
        // For PoC, we simulate a successful sync
        const response = await fetch(CONFIG.API_BASE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
        });

        if (response.ok) {
          await deleteReportFromIDB(report.id);
          console.log(`[Sync] Report ${report.id} synced successfully`);
        }
      } catch (fetchErr) {
        // Network still not reliable — keep in queue
        console.warn(`[Sync] Failed to sync report ${report.id}, will retry later`);
      }
    }

    await updatePendingCount();

    const remaining = await getPendingReports();
    if (remaining.length === 0) {
      showToast(t('toastSynced'), 'success');
    }
  } catch (err) {
    console.error('[Sync] Error flushing reports:', err);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 9: TOAST NOTIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Show a toast notification.
 * Types: 'success', 'warning', 'info', 'offline'
 */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: '✅',
    warning: '⚠️',
    info: 'ℹ️',
    offline: '📴',
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 10: NETWORK STATUS MONITOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Monitor online/offline status and update UI accordingly.
 * When the device comes back online, automatically flush pending reports.
 */
function initNetworkMonitor() {
  const offlineBadge = document.getElementById('offline-badge');
  const onlineBadge = document.getElementById('online-badge');

  function updateStatus() {
    if (navigator.onLine) {
      offlineBadge.classList.remove('visible');
      onlineBadge.classList.add('visible');
    } else {
      offlineBadge.classList.add('visible');
      onlineBadge.classList.remove('visible');
    }
  }

  // Initial state
  updateStatus();

  // Listen for connectivity changes
  window.addEventListener('online', () => {
    updateStatus();
    showToast('Connection restored! Syncing reports...', 'success');
    // Automatically flush pending reports when back online
    flushPendingReports();
  });

  window.addEventListener('offline', () => {
    updateStatus();
    showToast(t('toastOfflineSaved').replace('Report saved locally. ', ''), 'offline');
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// REPORT SUBMISSION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle form submission — build the report payload and either
 * POST it to the backend or store it in IndexedDB for later sync.
 */
async function handleSubmit(e) {
  e.preventDefault();

  // Validate location
  if (!selectedLatLng) {
    showToast(t('toastNoLocation'), 'warning');
    return;
  }

  // Collect notes from textarea
  formState.notes = document.getElementById('observation-notes').value.trim();

  // Build the report payload
  // This schema is designed to be compatible with Phase 2's FastAPI model
  const report = {
    timestamp: new Date().toISOString(),
    location: {
      lat: selectedLatLng.lat,
      lng: selectedLatLng.lng,
      address: document.getElementById('form-address').textContent || '',
    },
    assessment: {
      waterDepth: formState.depth,
      vehiclePassability: formState.vehicle,
      hazardType: formState.hazard,
    },
    notes: formState.notes,
    photo: formState.photo,          // base64 compressed JPEG
    photoSizeKB: formState.photoSize,
    metadata: {
      platform: 'disasterlens-pwa-v1',
      language: currentLang,
      userAgent: navigator.userAgent,
      connectivity: navigator.onLine ? 'online' : 'offline',
    },
  };

  console.log('[Submit] Report payload:', {
    ...report,
    photo: report.photo ? `[base64 image, ${report.photoSizeKB}KB]` : null,
  });

  if (navigator.onLine) {
    // Online: Try to POST directly
    try {
      const response = await fetch(CONFIG.API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });

      if (response.ok) {
        showToast(t('toastSubmitted'), 'success');
      } else {
        throw new Error('Server returned non-OK status');
      }
    } catch (err) {
      // POST failed (server not available yet in Phase 1) — save locally
      console.warn('[Submit] POST failed, saving to IndexedDB:', err.message);
      await saveReportToIDB(report);
      await updatePendingCount();
      showToast(t('toastReportSaved') + ' ' + t('toastOfflineSaved'), 'offline', 5000);
    }
  } else {
    // Offline: Save to IndexedDB
    await saveReportToIDB(report);
    await updatePendingCount();
    showToast(t('toastOfflineSaved'), 'offline', 5000);
  }

  // Reset form and close drawer
  resetForm();
  closeDrawer();
}


// ═══════════════════════════════════════════════════════════════════════════
// DRAWER CONTROLS (Open/Close)
// ═══════════════════════════════════════════════════════════════════════════

function openDrawer() {
  document.getElementById('report-drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('active');
  // Update location card if pin is set
  if (selectedLatLng) {
    updateCoordsDisplay();
  }
}

function closeDrawer() {
  document.getElementById('report-drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('active');
}


// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION — Wire everything together on DOM ready
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] DisasterLens AI — NDMA Flood Reporting PWA');
  console.log('[App] Phase 1: Days 1–4 | Initializing...');

  // 1. Initialize IndexedDB
  try {
    await openDatabase();
    await updatePendingCount();
  } catch (err) {
    console.error('[App] IndexedDB initialization failed:', err);
  }

  // 2. Initialize map
  initMap();

  // 3. Initialize form selectors
  initFormSelectors();

  // 4. Apply saved language preference
  applyTranslations();

  // 5. Start network monitor
  initNetworkMonitor();

  // ─── EVENT LISTENERS ─────────────────────────────────────────────────

  // Language toggle
  document.getElementById('lang-toggle').addEventListener('click', toggleLanguage);

  // Detect location button
  document.getElementById('btn-locate').addEventListener('click', detectLocation);

  // Report hazard button — open drawer
  document.getElementById('btn-report').addEventListener('click', openDrawer);

  // Close drawer
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);

  // Photo upload
  const photoInput = document.getElementById('photo-input');
  const uploadZone = document.getElementById('upload-zone');

  uploadZone.addEventListener('click', () => photoInput.click());

  photoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handlePhotoSelect(e.target.files[0]);
    }
  });

  // Remove photo
  document.getElementById('remove-image').addEventListener('click', () => {
    formState.photo = null;
    formState.photoSize = 0;
    document.getElementById('upload-preview').classList.remove('visible');
    document.getElementById('preview-image').src = '';
    document.getElementById('photo-input').value = '';
  });

  // Form submit
  document.getElementById('hazard-form').addEventListener('submit', handleSubmit);

  // ─── KEYBOARD SHORTCUTS (Desktop) ────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  console.log('[App] Initialization complete ✓');
});
