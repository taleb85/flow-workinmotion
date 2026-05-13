/**
 * Calcoli geospaziali per geofencing timbrature (Haversine, controllo raggio).
 * La configurazione centro+raggio arriva dal contesto app: geofence.json (Storage) con fallback .env — vedi `geofencePunch.resolveEffectiveGeofenceConfig`.
 */

export type RestaurantGeofenceCenter = {
  lat: number;
  lng: number;
  /** Raggio in metri dal centro */
  radiusM: number;
};

const EARTH_RADIUS_M = 6371000;

/** Distanza in metri tra due punti WGS84 (formula di Haversine). */
export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * True se la posizione utente è entro il raggio dal centro locale.
 * `center` deve essere già risolto (Storage / cache / env); questo modulo non legge AppContext per evitare dipendenze circolari.
 */
export function isUserInRestaurantRange(
  userLat: number,
  userLng: number,
  center: RestaurantGeofenceCenter
): { inRange: boolean; distanceM: number; radiusM: number } {
  const distanceM = haversineDistanceMeters(userLat, userLng, center.lat, center.lng);
  const radiusM =
    Number.isFinite(center.radiusM) && center.radiusM > 0 ? center.radiusM : 120;
  return {
    inRange: distanceM <= radiusM,
    distanceM,
    radiusM,
  };
}

export type GeolocationCoords = { lat: number; lng: number };

export function getCurrentPositionCoords(): Promise<GeolocationCoords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(Object.assign(new Error('NO_GEO_API'), { code: 2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err: GeolocationPositionError) => reject(err),
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
    );
  });
}
