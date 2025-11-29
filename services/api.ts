import { LocationData, WeatherData, RouteAlternative, ElevationStats, PoiData } from "../types";

// Primary: Nominatim (OpenStreetMap) for POIs
// Fallback: Open-Meteo Geocoding for Cities (Reliable)
export const searchLocation = async (query: string): Promise<LocationData[]> => {
  if (query.length < 3) return [];

  const mapNominatimData = (data: any[]): LocationData[] => {
     return data.map((item: any) => {
        let name = item.name || item.display_name.split(',')[0];
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
    // 1. Try Nominatim (Best for POIs like "Benzinlik")
    // Note: Nominatim is strict about User-Agent/Referer. Browsers handle Referer.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout for primary

    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&accept-language=tr`, {
        signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`Nominatim status: ${res.status}`);
    const data = await res.json();
    
    if (!data || data.length === 0) throw new Error("Nominatim no results");
    
    return mapNominatimData(data);

  } catch (nominatimError) {
    console.warn("Nominatim search failed or timed out, switching to Open-Meteo fallback:", nominatimError);

    try {
        // 2. Fallback to Open-Meteo (Reliable for Cities)
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=tr&format=json`);
        if (!res.ok) throw new Error(`OpenMeteo status: ${res.status}`);
        
        const data = await res.json();
        if (!data.results) return [];

        return mapOpenMeteoData(data.results);

    } catch (fallbackError) {
        console.error("Search error: All providers failed", fallbackError);
        return [];
    }
  }
};

// Open-Meteo Reverse Geocoding / Nominatim Reverse
export const getCityNameFromCoords = async (lat: number, lng: number): Promise<string> => {
    try {
        // Try Nominatim reverse first for better formatting
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=tr`);
        if(res.ok) {
            const data = await res.json();
            return data.address.city || data.address.town || data.display_name.split(',')[0];
        }
        throw new Error("Nominatim reverse failed");
    } catch {
        // Fallback or simple formatted string
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
};

// IPAPI for fallback location
export const getIpLocation = async (): Promise<LocationData | null> => {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    if (data.error) return null;
    return {
      name: data.city,
      lat: data.latitude,
      lng: data.longitude,
      admin1: data.region
    };
  } catch (e) {
    console.error("IP Location error", e);
    return null;
  }
};

// OSRM Routing
export const getRouteAlternatives = async (start: LocationData, end: LocationData): Promise<RouteAlternative[]> => {
  
  const fetchProfile = async (type: 'fastest' | 'scenic'): Promise<RouteAlternative | null> => {
    let url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    
    if (type === 'scenic') {
        url += `&exclude=toll,motorway`;
    } else {
        url += `&alternatives=true`; 
    }

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("OSRM Fetch Failed");
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return null;
        
        const route = data.routes[0];
        return {
            type,
            name: type === 'fastest' ? 'Otoban / Hızlı' : 'Köy Yolu / Manzaralı',
            coordinates: route.geometry.coordinates,
            distance: route.distance,
            duration: route.duration,
            color: type === 'fastest' ? '#3b82f6' : '#10b981'
        };
    } catch (e) {
        console.warn(`Routing failed for ${type}`, e);
        return null;
    }
  };

  const [fastest, scenic] = await Promise.all([
      fetchProfile('fastest'),
      fetchProfile('scenic')
  ]);

  const results: RouteAlternative[] = [];
  if (fastest) results.push(fastest);
  if (scenic) {
      const isUnique = !fastest || Math.abs(fastest.distance - scenic.distance) > 500; 
      if (isUnique) results.push(scenic);
  }

  return results;
};

// New: Open-Meteo Elevation API
export const getElevationProfile = async (coordinates: [number, number][]): Promise<ElevationStats | null> => {
    if (coordinates.length < 2) return null;

    // Sample points to avoid API limits (Open-Meteo free tier has constraints on request size)
    // Take max 50 points evenly distributed
    const sampleSize = 50;
    const step = Math.ceil(coordinates.length / sampleSize);
    const sampledCoords = coordinates.filter((_, i) => i % step === 0);
    
    // Prepare Lat/Lng arrays for API
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
        
        // Calculate approx total gain (very rough estimation based on samples)
        let gain = 0;
        for(let i = 1; i < elevations.length; i++) {
            if (elevations[i] > elevations[i-1]) {
                gain += (elevations[i] - elevations[i-1]);
            }
        }

        return { min, max, avg, gain, points: elevations };

    } catch (e) {
        console.error("Elevation API error", e);
        return null;
    }
};

// Open-Meteo Weather
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
    console.error("Weather error", e);
    return { lat, lng, temp: 0, rain: 0, rainProb: 0, windSpeed: 0, windDirection: 0, weatherCode: 0, hourlyRainForecast: [] };
  }
};

// Overpass API for POIs
export const findPoisAlongRoute = async (coordinates: [number, number][], type: 'fuel' | 'food' | 'sight'): Promise<PoiData[]> => {
    // 1. Sample the route to avoid creating a massive query. 
    // Take one point roughly every ~20 points from OSRM result (assuming dense geometry)
    // OSRM usually returns plenty of points.
    
    if (!coordinates || coordinates.length === 0) return [];

    const sampleRate = Math.max(10, Math.floor(coordinates.length / 15)); // Target ~15 search bubbles
    const sampledCoords = coordinates.filter((_, i) => i % sampleRate === 0);
    
    // Add endpoint to ensure we search near destination
    sampledCoords.push(coordinates[coordinates.length - 1]);

    // 2. Build Overpass Query
    // Query format: (node[amenity=fuel](around:5000,lat,lon); ... ); out;
    // Radius: 3000 meters (3km)
    
    let filters = '';
    if (type === 'fuel') filters = '["amenity"="fuel"]';
    else if (type === 'food') filters = '["amenity"~"restaurant|cafe|fast_food"]';
    else if (type === 'sight') filters = '["tourism"~"viewpoint|attraction|museum"]["name"]';

    const radius = 3000;
    let queryBody = '';
    
    sampledCoords.forEach(c => {
        // Overpass uses (lat, lon), OSRM is [lng, lat]
        queryBody += `node${filters}(around:${radius},${c[1]},${c[0]});`;
    });

    const query = `[out:json][timeout:25];(${queryBody});out body 20;>;out skel qt;`; // Limit to 20 results total for performance

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
        console.warn("POI Fetch failed", e);
        return [];
    }
};