// offlineCache.js - Simple localStorage caching for offline support

const CACHE_VERSION = 'v1';
const CACHE_KEYS = {
  positions: `tankpos_positions_${CACHE_VERSION}`,
  cargoes: `tankpos_cargoes_${CACHE_VERSION}`,
  notes: `tankpos_notes_${CACHE_VERSION}`,
  calendar: `tankpos_calendar_${CACHE_VERSION}`,
  timestamp: (key) => `${key}_timestamp`
};

// Save data to localStorage cache
export function saveCache(key, data) {
  try {
    const cacheKey = CACHE_KEYS[key];
    if (!cacheKey) return;
    
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(CACHE_KEYS.timestamp(cacheKey), Date.now().toString());
    console.log(`💾 Cached ${data.length || 0} ${key} items`);
  } catch (err) {
    console.warn('Cache save failed:', err);
    // If localStorage is full, clear old data
    if (err.name === 'QuotaExceededError') {
      clearOldCache();
    }
  }
}

// Load data from localStorage cache
export function loadCache(key) {
  try {
    const cacheKey = CACHE_KEYS[key];
    if (!cacheKey) return null;
    
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    
    const timestamp = localStorage.getItem(CACHE_KEYS.timestamp(cacheKey));
    const age = timestamp ? Date.now() - parseInt(timestamp) : 0;
    const ageHours = Math.floor(age / (1000 * 60 * 60));
    
    console.log(`📂 Loaded cached ${key} (${ageHours}h old)`);
    return JSON.parse(cached);
  } catch (err) {
    console.warn('Cache load failed:', err);
    return null;
  }
}

// Check if we're online
export function isOnline() {
  return navigator.onLine;
}

// Get cache age in hours
export function getCacheAge(key) {
  try {
    const cacheKey = CACHE_KEYS[key];
    const timestamp = localStorage.getItem(CACHE_KEYS.timestamp(cacheKey));
    if (!timestamp) return null;
    
    const age = Date.now() - parseInt(timestamp);
    return Math.floor(age / (1000 * 60 * 60));
  } catch {
    return null;
  }
}

// Clear old cache
export function clearOldCache() {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('tankpos_') && !key.includes(CACHE_VERSION)) {
      localStorage.removeItem(key);
    }
  });
}

// Fetch with offline fallback
export async function fetchWithCache(key, fetchFn) {
  const online = isOnline();
  
  if (online) {
    try {
      // Try to fetch from network
      const data = await fetchFn();
      if (data) {
        // Save to cache for offline use
        saveCache(key, data);
        return { data, source: 'network' };
      }
    } catch (err) {
      console.warn(`Network fetch failed for ${key}, using cache:`, err);
    }
  }
  
  // Fallback to cache (offline or network failed)
  const cached = loadCache(key);
  if (cached) {
    return { data: cached, source: 'cache' };
  }
  
  return { data: null, source: 'none' };
}
