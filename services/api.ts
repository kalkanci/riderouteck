import { LocationData, WeatherData, RouteAlternative, ElevationStats, PoiData, RadioStation, RouteStep } from "../types";

// --- RADIO BROWSER API ---
export const getRadioStations = async (tag: string): Promise<RadioStation[]> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`https://de1.api.radio-browser.info/json/stations/bytag/${encodeURIComponent(tag)}?limit=15&order=votes&reverse=true&hidebroken=true`, {
             signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error("Radio fetch failed");
        return await res.json();
    } catch (e) {
        console.warn("Radio API error, trying general fallback", e);
        if (tag !== 'pop') return getRadioStations('pop');
        return [];
    }
};

// --- REVERSE GEOCODING ---
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=tr`);
        if (!res.ok) throw new Error("Reverse geo failed");
        
        const data = await res.json();
        const addr = data.address;
        
        if (!addr) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

        const parts: string[] = [];
        if (addr.suburb) parts.push(addr.suburb);
        if (addr.neighbourhood) parts.push(addr.neighbourhood);
        if (addr.road) parts.push(addr.road);
        if (addr.town) parts.push(addr.town);
        if (addr.district) parts.push(addr.district);
        if (addr.city) parts.push(addr.city);
        else if (addr.province) parts.push(addr.province);

        const uniqueParts = [...new Set(parts)];
        return uniqueParts.join(', ') || data.display_name.split(',')[0];

    } catch (e) {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
};

// --- LOCATION SEARCH ---
export const searchLocation = async (query: string): Promise<LocationData[]> => {
  if (query.length < 3) return [];

  const lowerQ = query.toLowerCase();
  let finalQuery = query;

  const keywords: Record<string, string> = {
      'benzin': 'fuel',
      'petrol': 'fuel',
      'akaryakıt': 'fuel',
      'avm': 'mall',
      'alışveriş': 'mall',
      'yemek': 'restaurant',
      'eczane': 'pharmacy',
      'otel': 'hotel',
      'market': 'supermarket',
      'tamir': 'motorcycle_repair'
  };

  if (keywords[lowerQ]) {
      finalQuery = keywords[lowerQ];
  }

  const mapNominatimData = (data: any[]): LocationData[] => {
     return data.map((item: any) => {
        let name = item.name; 
        
        if (!name && item.address) {
            if (item.address.amenity) name = item.address.amenity;
            else if (item.address.shop) name = item.address.shop;
            else if (item.address.tourism) name = item.address.tourism;
            else if (item.address.leisure) name = item.address.leisure;
            else if (item.address.building) name = item.address.building;
        }

        if (!name) name = item.display_name.split(',')[0];

        let admin = item.address.state || item.address.province || item.address.city || item.address.town || item.display_name.split(',').slice(1,3).join(',');
        
        return {
          name: name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          admin1: admin,
          type: item.type 
        };
    });
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); 

    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(finalQuery)}&format=json&addressdetails=1&limit=8&accept-language=tr&dedupe=1`, {
        signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`Nominatim status: ${res.status}`);
    const data = await res.json();
    
    if (!data || data.length === 0) throw new Error("Nominatim no results");
    return mapNominatimData(data);

  } catch (nominatimError) {
     return [];
  }
};

export const getIpLocation = async (): Promise<LocationData | null> => {
  try {
    const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
    if (!res.ok) throw new Error("GeoJS failed");
    
    const data = await res.json();
    return {
      name: data.city,
      lat: parseFloat(data.latitude),
      lng: parseFloat(data.longitude),
      admin1: data.region
    };
  } catch (e) {
    return null;
  }
};

const getInstruction = (step: any): string => {
    if (!step || !step.maneuver) return "İlerle";
    
    const m = step.maneuver;
    const type = m.type;
    const mod = m.modifier;
    const name = step.name ? `(${step.name})` : "";
    
    // Basitleştirilmiş Türkçe yönlendirmeler
    if (type === 'depart') return `Rotaya başla`;
    if (type === 'arrive') return `Hedefe ulaştın`;
    if (type === 'roundabout') return `Kavşaktan ${m.exit}. çıkış`;
    if (mod === 'left') return `Sola dön`;
    if (mod === 'right') return `Sağa dön`;
    if (mod === 'slight left') return `Hafif sola`;
    if (mod === 'slight right') return `Hafif sağa`;
    if (mod === 'sharp left') return `Keskin sola`;
    if (mod === 'sharp right') return `Keskin sağa`;
    if (mod === 'uturn') return `U dönüşü`;

    return `Devam et ${name}`;
};

// --- ROBUST ROUTING STRATEGY ---
export const getRouteAlternatives = async (start: LocationData, end: LocationData): Promise<RouteAlternative[]> => {
  
  // Helper to format the route object
  const mapRoute = (route: any, category: 'fastest' | 'toll_free' | 'scenic'): RouteAlternative => {
     let name = "Rota";
     let color = "#94a3b8";
     let tags: string[] = [];
     let description = "";
     let type: 'fastest' | 'scenic' = 'fastest';

     const durMins = Math.round(route.duration / 60);
     const distKm = (route.distance / 1000).toFixed(1);

     if (category === 'fastest') {
         name = "En Hızlı (Otoban)";
         color = "#3b82f6"; // Blue
         tags = ["Hızlı", "Standart"];
         description = `${durMins} dk • ${distKm} km • Trafik akışı normal.`;
         type = 'fastest';
     } else if (category === 'toll_free') {
         name = "Ücretsiz / Ekonomik";
         color = "#f59e0b"; // Orange
         tags = ["Gişesiz", "Ekonomik"];
         description = `${durMins} dk • ${distKm} km • Ücretli yollardan kaçınır.`;
         type = 'fastest';
     } else {
         name = "Manzara / Köy Yolu";
         color = "#10b981"; // Emerald
         tags = ["Virajlı", "Sakin"];
         description = `${durMins} dk • ${distKm} km • Otobandan uzak.`;
         type = 'scenic';
     }

     const steps: RouteStep[] = route.legs[0].steps ? route.legs[0].steps.map((s: any) => ({
         maneuver: s.maneuver,
         name: s.name,
         duration: s.duration,
         distance: s.distance,
         instruction: getInstruction(s)
     })) : [];

     return {
        type,
        name,
        coordinates: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration,
        color,
        tags,
        description,
        steps
     };
  };

  try {
      const baseUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&steps=true`;
      
      // PARALLEL EXECUTION STRATEGY
      // We fire 3 distinct requests to force OSRM to give us different paths.
      const promises = [
          // 1. FASTEST (Standard)
          fetch(`${baseUrl}&alternatives=true`).then(r => r.json()).then(d => ({ type: 'fastest', data: d })),
          
          // 2. NO TOLLS (Explicitly avoid tolls)
          fetch(`${baseUrl}&exclude=tolls`).then(r => r.json()).then(d => ({ type: 'toll_free', data: d })),
          
          // 3. SCENIC (Explicitly avoid motorways)
          fetch(`${baseUrl}&exclude=motorway`).then(r => r.json()).then(d => ({ type: 'scenic', data: d }))
      ];

      const results = await Promise.allSettled(promises);
      const candidates: RouteAlternative[] = [];

      // Helper to check for duplicates based on geometry similarity
      const isDuplicate = (route: any) => {
          return candidates.some(c => {
              const distDiff = Math.abs(c.distance - route.distance);
              const durDiff = Math.abs(c.duration - route.duration);
              // Consider duplicate if length differs by less than 500m AND time by less than 2 mins
              return distDiff < 500 && durDiff < 120;
          });
      };

      // Process results
      for (const result of results) {
          if (result.status === 'fulfilled') {
              const { type, data } = result.value;
              if (data && data.code === 'Ok' && data.routes && data.routes.length > 0) {
                  // OSRM returns routes sorted by relevance. Usually route[0] is the best for that criteria.
                  const primaryRoute = data.routes[0];
                  
                  if (!isDuplicate(primaryRoute)) {
                      candidates.push(mapRoute(primaryRoute, type as any));
                  }
                  
                  // Sometimes "Fastest" request actually returns a 2nd alternative in the same payload
                  if (type === 'fastest' && data.routes.length > 1) {
                      const secondary = data.routes[1];
                      if (!isDuplicate(secondary)) {
                          // If we found a secondary route in "Fastest", label it vaguely as Alternative
                          const altRoute = mapRoute(secondary, 'toll_free'); 
                          altRoute.name = "Alternatif Rota";
                          altRoute.tags = ["Alternatif"];
                          candidates.push(altRoute);
                      }
                  }
              }
          }
      }

      if (candidates.length === 0) {
          throw new Error("Hiçbir rota bulunamadı. Mesafe çok uzak olabilir.");
      }

      // Sort: Fastest first, then Toll Free, then Scenic
      const order = { 'fastest': 1, 'toll_free': 2, 'scenic': 3 };
      // Note: We used mapped type names in mapRoute. Re-sorting might rely on matching types.
      // Actually, let's just keep the discovery order but prioritizing Fastest if it exists.
      
      return candidates;

  } catch (e) {
      console.error("Routing error", e);
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