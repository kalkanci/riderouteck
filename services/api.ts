import { LocationData, WeatherData, RouteAlternative, ElevationStats, RadioStation, RouteStep } from "../types";

// --- API KEY MANAGEMENT ---
// 1. Try to get key from environment (Vite/Process)
const getEnv = (key: string): string => {
    let value = '';
    try {
        // @ts-ignore
        if (import.meta && import.meta.env && import.meta.env[key]) {
            // @ts-ignore
            value = import.meta.env[key];
        }
    } catch (e) {}

    if (!value) {
        try {
            if (typeof process !== 'undefined' && process.env && process.env[key]) {
                value = process.env[key];
            }
        } catch (e) {}
    }
    return value || '';
};

// Internal variable to store the key (starts with Env, can be updated manually)
let CURRENT_GOOGLE_API_KEY = getEnv('VITE_GOOGLE_MAPS_KEY');

// Load from LocalStorage if available (persistence for manual entry)
try {
    const stored = localStorage.getItem('MOTO_ROTA_API_KEY');
    if (stored) CURRENT_GOOGLE_API_KEY = stored;
} catch (e) {}

// Export function to set key manually from UI
export const setManualApiKey = (key: string) => {
    CURRENT_GOOGLE_API_KEY = key;
    try {
        localStorage.setItem('MOTO_ROTA_API_KEY', key);
    } catch (e) {}
    // Force reload/re-check might be handled by UI state
};

// Helper to check validity
export const hasApiKey = () => !!CURRENT_GOOGLE_API_KEY && CURRENT_GOOGLE_API_KEY.length > 10;

// --- UTILS: Polyline Decoder ---
const decodePolyline = (encoded: string): [number, number][] => {
    const points: [number, number][] = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;

    while (index < len) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        points.push([lng * 1e-5, lat * 1e-5]);
    }
    return points;
};

// --- RADIO BROWSER API ---
export const getRadioStations = async (tag: string): Promise<RadioStation[]> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`https://de1.api.radio-browser.info/json/stations/bytag/${encodeURIComponent(tag)}?limit=15&order=votes&reverse=true&hidebroken=true`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error("Radio fetch failed");
        return await res.json();
    } catch (e) {
        if (tag !== 'pop') return getRadioStations('pop');
        return [];
    }
};

// --- GOOGLE REVERSE GEOCODING ---
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    if (!CURRENT_GOOGLE_API_KEY) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${CURRENT_GOOGLE_API_KEY}&language=tr`);
        const data = await res.json();
        
        if (data.status === 'OK' && data.results?.[0]) {
            const result = data.results[0];
            let neighborhood = "";
            let locality = "";

            result.address_components.forEach((comp: any) => {
                if (comp.types.includes("neighborhood") || comp.types.includes("sublocality")) neighborhood = comp.long_name;
                if (comp.types.includes("locality") || comp.types.includes("administrative_area_level_1")) locality = comp.long_name;
            });

            if (neighborhood && locality) return `${neighborhood}, ${locality}`;
            return result.formatted_address.split(',')[0];
        }
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (e) {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
};

// --- GOOGLE PLACES SEARCH ---
export const searchLocation = async (query: string): Promise<LocationData[]> => {
  if (query.length < 3) return [];
  
  if (!CURRENT_GOOGLE_API_KEY) {
      console.warn("Google API Key eksik. Arama yapılamıyor.");
      return [];
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': CURRENT_GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.types'
        },
        body: JSON.stringify({
            textQuery: query,
            languageCode: 'tr',
            maxResultCount: 8
        })
    });

    const data = await res.json();
    if (!data.places) return [];

    return data.places.map((p: any) => ({
        name: p.displayName?.text || query,
        lat: p.location.latitude,
        lng: p.location.longitude,
        admin1: p.formattedAddress?.split(',').slice(-2)[0]?.trim() || "",
        type: p.types?.[0] || 'location'
    }));

  } catch (e) {
     console.error("Google Places Error:", e);
     return [];
  }
};

// --- GOOGLE ROUTES API ---
const mapGoogleManeuver = (maneuver: string): string => {
    const map: Record<string, string> = {
        'TURN_LEFT': 'Sola dön',
        'TURN_RIGHT': 'Sağa dön',
        'TURN_SLIGHT_LEFT': 'Hafif sola',
        'TURN_SLIGHT_RIGHT': 'Hafif sağa',
        'TURN_SHARP_LEFT': 'Keskin sola',
        'TURN_SHARP_RIGHT': 'Keskin sağa',
        'U_TURN': 'U Dönüşü',
        'STRAIGHT': 'Düz devam et',
        'RAMP_LEFT': 'Bağlantıdan sola',
        'RAMP_RIGHT': 'Bağlantıdan sağa',
        'MERGE': 'Yola katıl',
        'FORK_LEFT': 'Çataldan sola',
        'FORK_RIGHT': 'Çataldan sağa',
        'FERRY': 'Feribota bin',
        'ROUNDABOUT_LEFT': 'Kavşaktan dön',
        'ROUNDABOUT_RIGHT': 'Kavşaktan dön'
    };
    return map[maneuver] || 'İlerle';
};

export const getRouteAlternatives = async (start: LocationData, end: LocationData): Promise<RouteAlternative[]> => {
  if (!CURRENT_GOOGLE_API_KEY) {
      throw new Error("API Anahtarı Eksik! Lütfen ayarlardan anahtarı giriniz.");
  }

  const fetchRoute = async (mode: 'fastest' | 'toll_free' | 'scenic') => {
      const modifiers: any = {
          avoidTolls: mode === 'toll_free',
          avoidHighways: mode === 'scenic',
          avoidFerries: false
      };

      const body = {
          origin: { location: { latLng: { latitude: start.lat, longitude: start.lng } } },
          destination: { location: { latLng: { latitude: end.lat, longitude: end.lng } } },
          travelMode: 'TWO_WHEELER', 
          routingPreference: 'TRAFFIC_AWARE',
          computeAlternativeRoutes: mode === 'fastest',
          routeModifiers: modifiers,
          languageCode: 'tr',
          units: 'METRIC'
      };

      const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': CURRENT_GOOGLE_API_KEY,
              'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description,routes.legs,routes.routeLabels'
          },
          body: JSON.stringify(body)
      });
      return res.json();
  };

  try {
      const results = await Promise.allSettled([
          fetchRoute('fastest').then(d => ({ mode: 'fastest', data: d })),
          fetchRoute('toll_free').then(d => ({ mode: 'toll_free', data: d })),
          fetchRoute('scenic').then(d => ({ mode: 'scenic', data: d }))
      ]);

      const candidates: RouteAlternative[] = [];

      const processGoogleRoute = (route: any, mode: string) => {
           if (!route.polyline?.encodedPolyline) return;

           const points = decodePolyline(route.polyline.encodedPolyline);
           const distKm = (route.distanceMeters / 1000).toFixed(1);
           const durMins = Math.round(parseInt(route.duration) / 60);

           let name = "Rota";
           let color = "#94a3b8";
           let tags: string[] = [];
           let description = "";
           let type: 'fastest' | 'scenic' = 'fastest';

           if (mode === 'fastest') {
               name = "En Hızlı (Moto)";
               color = "#3b82f6";
               tags = ["Trafik", "Hızlı"];
               description = `${durMins} dk • ${distKm} km • Trafik hesaba katıldı.`;
               type = 'fastest';
           } else if (mode === 'toll_free') {
               name = "Ekonomik Rota";
               color = "#f59e0b";
               tags = ["Gişesiz", "Ucuz"];
               description = `${durMins} dk • ${distKm} km • Ücretli geçiş yok.`;
               type = 'fastest';
           } else {
               name = "Manzara / D-Yolu";
               color = "#10b981";
               tags = ["Virajlı", "Sakin"];
               description = `${durMins} dk • ${distKm} km • Otobandan kaçınıldı.`;
               type = 'scenic';
           }

           const steps: RouteStep[] = [];
           route.legs?.forEach((leg: any) => {
               leg.steps?.forEach((step: any) => {
                   steps.push({
                       maneuver: { location: [step.startLocation.latLng.latitude, step.startLocation.latLng.longitude], type: 'move' },
                       name: "",
                       duration: parseInt(step.staticDuration) || 0,
                       distance: step.lengthMeters,
                       instruction: step.navigationInstruction ? 
                           (mapGoogleManeuver(step.navigationInstruction.maneuver) + ' ' + (step.navigationInstruction.instructions || '')) 
                           : "İlerle"
                   });
               });
           });

           candidates.push({
               type,
               name,
               coordinates: points,
               distance: route.distanceMeters,
               duration: parseInt(route.duration),
               color,
               tags,
               description,
               steps
           });
      };

      results.forEach(res => {
          if (res.status === 'fulfilled' && res.value.data.routes) {
              const { mode, data } = res.value;
              data.routes.forEach((r: any) => processGoogleRoute(r, mode));
          }
      });

      const uniqueCandidates = candidates.filter((v, i, a) => 
          a.findIndex(t => (
             Math.abs(t.distance - v.distance) < 500 && Math.abs(t.duration - v.duration) < 120
          )) === i
      );

      if (uniqueCandidates.length === 0) throw new Error("Google Rota bulamadı.");
      
      return uniqueCandidates.slice(0, 4); 

  } catch (e) {
      console.error("Google Routing Error:", e);
      throw e;
  }
};

export const getElevationProfile = async (coordinates: [number, number][]): Promise<ElevationStats | null> => {
    if (coordinates.length < 2) return null;
    const sampleSize = 50;
    const step = Math.ceil(coordinates.length / sampleSize);
    const sampledCoords = coordinates.filter((_, i) => i % step === 0);
    const lats = sampledCoords.map(c => c[1]).join(',');
    const lngs = sampledCoords.map(c => c[0]).join(',');

    try {
        const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`);
        const data = await res.json();
        if (!data.elevation || data.elevation.length === 0) return null;

        const elevations = data.elevation as number[];
        const min = Math.min(...elevations);
        const max = Math.max(...elevations);
        const avg = elevations.reduce((a, b) => a + b, 0) / elevations.length;
        
        let gain = 0;
        for(let i = 1; i < elevations.length; i++) {
            if (elevations[i] > elevations[i-1]) gain += (elevations[i] - elevations[i-1]);
        }

        return { min, max, avg, gain, points: elevations };

    } catch (e) {
        return null;
    }
};

export const getWeatherForPoint = async (lat: number, lng: number): Promise<WeatherData> => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,rain,weather_code,wind_speed_10m,wind_direction_10m&hourly=precipitation_probability&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    const data = await res.json();
    const current = data.current;
    
    const currentHour = new Date().getHours();
    const rainProb = data.hourly?.precipitation_probability?.[currentHour] || 0;
    const hourlyRainForecast = data.hourly?.precipitation_probability || [];

    return {
      lat,
      lng,
      temp: current.temperature_2m,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      rain: current.rain,
      rainProb: rainProb,
      weatherCode: current.weather_code,
      hourlyRainForecast: hourlyRainForecast
    };
  } catch (e) {
    return { lat, lng, temp: 0, rain: 0, rainProb: 0, windSpeed: 0, windDirection: 0, weatherCode: 0, hourlyRainForecast: [] };
  }
};