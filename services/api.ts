import { LocationData, WeatherData, RouteAlternative, ElevationStats, PoiData, RadioStation, RouteStep } from "../types";

// --- NEW: Radio Browser API (Public APIs) ---
export const getRadioStations = async (tag: string): Promise<RadioStation[]> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`https://de1.api.radio-browser.info/json/stations/bytag/${encodeURIComponent(tag)}?limit=15&order=votes&reverse=true`, {
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

// --- NEW: Reverse Geocoding (Coords -> Address) ---
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
        // Using Nominatim for reverse geocoding
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=tr`);
        if (!res.ok) throw new Error("Reverse geo failed");
        
        const data = await res.json();
        const addr = data.address;
        
        if (!addr) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

        // Construct readable address: Mahalle, İlçe, İl
        const parts: string[] = [];

        // 1. Mahalle / Semt
        if (addr.suburb) parts.push(addr.suburb);
        else if (addr.neighbourhood) parts.push(addr.neighbourhood);
        else if (addr.quarter) parts.push(addr.quarter);
        else if (addr.road) parts.push(addr.road); // Fallback to road if no neighborhood

        // 2. İlçe
        if (addr.town) parts.push(addr.town);
        else if (addr.district) parts.push(addr.district);
        else if (addr.county) parts.push(addr.county);
        else if (addr.municipality) parts.push(addr.municipality);

        // 3. İl
        if (addr.city) parts.push(addr.city);
        else if (addr.province) parts.push(addr.province);
        else if (addr.state) parts.push(addr.state);

        // Remove duplicates (sometimes town and city are same) and join
        const uniqueParts = [...new Set(parts)];
        
        return uniqueParts.join(', ') || data.display_name.split(',')[0];

    } catch (e) {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
};

export const searchLocation = async (query: string): Promise<LocationData[]> => {
  if (query.length < 3) return [];

  const mapNominatimData = (data: any[]): LocationData[] => {
     return data.map((item: any) => {
        let name = item.name || item.display_name.split(',')[0];
        let admin = item.address.state || item.address.province || item.address.city || item.address.town || item.display_name.split(',').slice(1,3).join(',');
        
        if (item.address.road && item.address.house_number) {
            name = `${item.address.road} ${item.address.house_number}`;
        } else if (item.address.road) {
             name = `${item.address.road}`;
        }

        return {
          name: name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          admin1: admin,
          type: item.type 
        };
    });
  };

  const mapOpenMeteoData = (data: any[]): LocationData[] => {
      return data.map((item: any) => ({
        name: item.name,
        lat: item.latitude,
        lng: item.longitude,
        admin1: item.admin1 || item.country,
        type: 'city'
      }));
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); 

    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=8&accept-language=tr`, {
        signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`Nominatim status: ${res.status}`);
    const data = await res.json();
    
    if (!data || data.length === 0) throw new Error("Nominatim no results");
    return mapNominatimData(data);

  } catch (nominatimError) {
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=tr&format=json`);
        if (!res.ok) throw new Error(`OpenMeteo status: ${res.status}`);
        
        const data = await res.json();
        if (!data.results) return [];
        return mapOpenMeteoData(data.results);
    } catch (fallbackError) {
        return [];
    }
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
    console.error("IP Location error", e);
    return null;
  }
};

// Helper to generate Turkish instruction
const getInstruction = (step: any): string => {
    if (!step || !step.maneuver) return "İlerle";
    
    const m = step.maneuver;
    const type = m.type;
    const mod = m.modifier;
    const name = step.name ? `(${step.name})` : "";
    
    if (type === 'depart') return `Yola çık ve ilerle`;
    if (type === 'arrive') return `Hedefe ulaştınız`;
    if (type === 'roundabout') return `Döner kavşaktan ${m.exit || 1}. çıkıştan çık`;
    if (type === 'merge') return `Yola katıl ${name}`;
    if (type === 'on ramp') return `Bağlantı yoluna gir ${name}`;
    if (type === 'off ramp') return `Çıkıştan çık ${name}`;
    if (type === 'fork') return `Çataldan ${mod?.includes('left') ? 'sola' : 'sağa'} devam et`;

    let dir = "devam et";
    if (mod === 'left') dir = "sola dön";
    else if (mod === 'right') dir = "sağa dön";
    else if (mod === 'slight left') dir = "hafif sola";
    else if (mod === 'slight right') dir = "hafif sağa";
    else if (mod === 'sharp left') dir = "tam sola";
    else if (mod === 'sharp right') dir = "tam sağa";
    else if (mod === 'uturn') dir = "U dönüşü yap";

    return `${dir} ${name}`;
};

// --- OPTIMIZED ROUTING: Force Diversity ---
export const getRouteAlternatives = async (start: LocationData, end: LocationData): Promise<RouteAlternative[]> => {
  
  // Helper to map OSRM response to our type
  const mapRoute = (route: any, category: 'fastest' | 'toll_free' | 'scenic'): RouteAlternative => {
     let name = "Rota";
     let color = "#94a3b8";
     let tags: string[] = [];
     let description = "";
     let type: 'fastest' | 'scenic' = 'fastest';

     if (category === 'fastest') {
         name = "Otoban / Ekspres";
         color = "#3b82f6"; // Blue
         tags = ["En Hızlı", "Ücretli"];
         description = "Trafik akışı hızlı, ücretli geçiş içerebilir.";
         type = 'fastest';
     } else if (category === 'toll_free') {
         name = "Devlet Yolu (D-100)";
         color = "#f59e0b"; // Orange
         tags = ["Alternatif", "Ücretsiz"];
         description = "Otoyol ücreti yok, yerleşim yerlerinden geçebilir.";
         type = 'fastest'; // Still paved/fast, just not highway
     } else {
         name = "Manzara / Köy Yolu";
         color = "#10b981"; // Emerald
         tags = ["Virajlı", "Sakin"];
         description = "Daha düşük hız, doğa ile iç içe.";
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
      // 1. STRATEGY: Sequential requests to avoid OSRM 429 Too Many Requests
      const baseUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
      
      // Try fetching fastest route WITH steps first
      let resFast;
      try {
        const fetchUrl = `${baseUrl}&steps=true&alternatives=true`;
        resFast = await fetch(fetchUrl).then(r => r.json());
      } catch (e) {
          console.warn("Fastest route with steps failed, retrying without steps...");
      }

      // If 'steps' caused timeout (common on long routes), try without steps
      if (!resFast || resFast.code !== 'Ok') {
          resFast = await fetch(`${baseUrl}&steps=false`).then(r => r.json()).catch(() => null);
      }

      if (!resFast || resFast.code !== 'Ok') {
          throw new Error("Rota sunucusu yanıt vermiyor.");
      }

      const candidates: RouteAlternative[] = [];

      // Add Primary Route
      if (resFast.routes[0]) {
          candidates.push(mapRoute(resFast.routes[0], 'fastest'));
      }

      // Add Alternative from OSRM if available
      if (resFast.routes[1]) {
          const alt = mapRoute(resFast.routes[1], 'toll_free');
          alt.name = "Alternatif Rota";
          candidates.push(alt);
      }

      // Only if we really need another one, try a separate call for 'scenic' (avoid motorways)
      // But only if distance isn't massive to avoid rate limit
      if (candidates.length < 2) {
           try {
               await new Promise(r => setTimeout(r, 500)); // Small delay to be polite
               const resScenic = await fetch(`${baseUrl}&exclude=motorway&steps=false`).then(r => r.json());
               if (resScenic && resScenic.code === 'Ok' && resScenic.routes[0]) {
                   const sRoute = mapRoute(resScenic.routes[0], 'scenic');
                   // Check duplicate
                   const isDup = candidates.some(c => Math.abs(c.distance - sRoute.distance) < 500);
                   if (!isDup) candidates.push(sRoute);
               }
           } catch (e) {
               // Ignore scenic failure
           }
      }

      return candidates;

  } catch (e) {
      console.error("Routing error", e);
      return [];
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

export const findPoisAlongRoute = async (coordinates: [number, number][], type: 'fuel' | 'food' | 'sight'): Promise<PoiData[]> => {
    if (!coordinates || coordinates.length === 0) return [];

    const sampleRate = Math.max(10, Math.floor(coordinates.length / 15)); 
    const sampledCoords = coordinates.filter((_, i) => i % sampleRate === 0);
    sampledCoords.push(coordinates[coordinates.length - 1]);

    let filters = '';
    if (type === 'fuel') filters = '["amenity"="fuel"]';
    else if (type === 'food') filters = '["amenity"~"restaurant|cafe|fast_food"]';
    else if (type === 'sight') filters = '["tourism"~"viewpoint|attraction|museum"]["name"]';

    const radius = 3000;
    let queryBody = '';
    
    sampledCoords.forEach(c => {
        queryBody += `node${filters}(around:${radius},${c[1]},${c[0]});`;
    });

    const query = `[out:json][timeout:25];(${queryBody});out body 20;>;out skel qt;`;

    try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });

        if (!res.ok) throw new Error("Overpass API error");
        const data = await res.json();
        
        return data.elements.map((el: any) => ({
            id: el.id,
            lat: el.lat,
            lng: el.lon,
            name: el.tags.name || (type === 'fuel' ? 'Akaryakıt İstasyonu' : 'Mekan'),
            type: type
        }));

    } catch (e) {
        return [];
    }
};

export const findNearbyPois = async (lat: number, lng: number, type: 'fuel' | 'food' | 'shop', radius: number = 3000): Promise<PoiData[]> => {
    let filters = '';
    if (type === 'fuel') filters = '["amenity"="fuel"]';
    else if (type === 'food') filters = '["amenity"~"restaurant|cafe"]';
    else if (type === 'shop') filters = '["shop"~"motorcycle|car_repair"]';

    const query = `[out:json][timeout:15];node${filters}(around:${radius},${lat},${lng});out body 5;>;out skel qt;`;

    try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });

        if (!res.ok) throw new Error("Overpass API error");
        const data = await res.json();
        
        return data.elements.map((el: any) => ({
            id: el.id,
            lat: el.lat,
            lng: el.lon,
            name: el.tags.name || el.tags.brand || (type === 'fuel' ? 'İstasyon' : type === 'food' ? 'Kafe' : 'Servis'),
            type: type
        }));
    } catch (e) {
        return [];
    }
};