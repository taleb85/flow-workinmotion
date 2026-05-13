/**
 * Geofence per timbrature: coordinate da `geofence.json` (Storage) / cache locale, con fallback `.env`.
 * Abilitazione runtime: feature flag `geofence_punch` (vedi `featureFlags.ts`).
 */
import { haversineDistanceMeters, getCurrentPositionCoords, type GeolocationCoords } from './geo';

export type { GeolocationCoords };
export { haversineDistanceMeters, getCurrentPositionCoords };

export type GeofenceConfig = {
  lat: number;
  lng: number;
  /** Raggio accettato in metri dal centro */
  radiusM: number;
};

/** Legge config da .env / Vercel. Ritorna null se lat/lng non sono numeri validi. */
export function readGeofenceEnvConfig(): GeofenceConfig | null {
  const lat = Number.parseFloat(String(import.meta.env.VITE_RESTAURANT_LAT ?? ''));
  const lng = Number.parseFloat(String(import.meta.env.VITE_RESTAURANT_LNG ?? ''));
  const radiusRaw = Number.parseFloat(String(import.meta.env.VITE_GEOFENCE_RADIUS_M ?? '120'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const radiusM = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 120;
  return { lat, lng, radiusM };
}

/** Priorità: config persistita (Storage) se valida; altrimenti variabili `VITE_*`. */
export function resolveEffectiveGeofenceConfig(
  fromDisk: GeofenceConfig | null,
  fromEnv: GeofenceConfig | null
): GeofenceConfig | null {
  if (fromDisk && Number.isFinite(fromDisk.lat) && Number.isFinite(fromDisk.lng)) {
    const radiusM =
      Number.isFinite(fromDisk.radiusM) && fromDisk.radiusM > 0 ? fromDisk.radiusM : 120;
    return { lat: fromDisk.lat, lng: fromDisk.lng, radiusM };
  }
  return fromEnv;
}
