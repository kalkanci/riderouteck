import { LocationData, WeatherData, RouteAlternative } from "../types";

// Open-Meteo Geocoding Search (More reliable than Nominatim for demos)
export const searchLocation = async (query: string): Promise<LocationData[]> => {
  if (query.length < 3) return [];
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=tr&format=json`);
    const data = await res.json();
    
    if (!data || !data.results || data.results.length === 0) return [];
    
    return data.results.map((item: any) => ({
      name: item.name,
      lat: item.latitude,
      lng: item.longitude,
      admin1: item.admin1 || item.country
    }));
  } catch (e) {
    console.error("Search error", e);
    return [];
  }
};

// Open-Meteo Reverse Geocoding (Not natively supported in free tier efficiently, returning formatted coords for now)
export const getCityNameFromCoords = async (lat: number, lng: number): Promise<string> => {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
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

// OSRM Routing - Returns Multiple Options
export const getRouteAlternatives = async (start: LocationData, end: LocationData): Promise<RouteAlternative[]> => {
  
  const fetchProfile = async (type: 'fastest' | 'scenic'): Promise<RouteAlternative | null> => {
    let url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    
    if (type === 'scenic') {
        // Force backroads by excluding highways and tolls
        url += `&exclude=toll,motorway`;
    } else {
        // Standard routing
        url += `&alternatives=true`; 
    }

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return null;
        
        const route = data.routes[0];
        return {
            type,
            name: type === 'fastest' ? 'Otoban / Hızlı' : 'Köy Yolu / Manzaralı',
            coordinates: route.geometry.coordinates,
            distance: route.distance,
            duration: route.duration,
            color: type === 'fastest' ? '#3b82f6' : '#10b981' // Blue vs Green
        };
    } catch (e) {
        return null;
    }
  };

  // Parallel fetch for speed
  const [fastest, scenic] = await Promise.all([
      fetchProfile('fastest'),
      fetchProfile('scenic')
  ]);

  const results: RouteAlternative[] = [];
  if (fastest) results.push(fastest);
  
  // Only add scenic if it's different enough or exists
  if (scenic) {
      // Simple check to see if scenic is identical to fastest (rare but possible on short routes)
      const isUnique = !fastest || Math.abs(fastest.distance - scenic.distance) > 500; 
      if (isUnique) results.push(scenic);
  }

  return results;
};

// Open-Meteo Weather (Enriched)
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