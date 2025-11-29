import { LocationData, WeatherData, RouteGeometry, RouteOptions } from "../types";

// OpenStreetMap Nominatim Search
export const searchLocation = async (query: string): Promise<LocationData[]> => {
  if (query.length < 3) return [];
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=tr`);
    const data = await res.json();
    
    if (!data || data.length === 0) return [];
    
    return data.map((item: any) => {
      const name = item.name || item.address?.amenity || item.address?.road || "";
      const district = item.address?.suburb || item.address?.town || item.address?.city_district || "";
      const city = item.address?.province || item.address?.city || item.address?.state || "";
      
      const displayName = name ? name : district;
      const adminName = city ? (district ? `${district}, ${city}` : city) : "";

      return {
        name: displayName || adminName,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        admin1: adminName
      };
    });
  } catch (e) {
    console.error("Search error", e);
    return [];
  }
};

// Open-Meteo Reverse Geocoding
export const getCityNameFromCoords = async (lat: number, lng: number): Promise<string> => {
    return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
};

// IPAPI for fallback location
export const getIpLocation = async (): Promise<LocationData | null> => {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
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

// OSRM Routing (Fixed for Paid/Free distinction)
export const getRoute = async (start: LocationData, end: LocationData, options: RouteOptions): Promise<{ geometry: RouteGeometry | null, usedFallback: boolean }> => {
  const fetchRoute = async (avoidTolls: boolean) => {
    let url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    
    // Aggressive exclusion to force a different route
    if (avoidTolls) {
        // Exclude both 'toll' and 'motorway' to force state roads (D-roads)
        url += `&exclude=toll,motorway`;
    } else {
        // Standard route with alternatives
        url += `&alternatives=true`;
    }

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return null;
        return data;
    } catch (e) {
        return null;
    }
  };

  // 1. Try with user preference
  let data = await fetchRoute(options.avoidTolls);
  
  // 2. Fallback: If strict avoidance failed (no route found without highways), try standard
  if (!data && options.avoidTolls) {
      console.warn("Preferred route failed, falling back to standard.");
      data = await fetchRoute(false);
      if (data) {
          const route = data.routes[0];
          return {
              geometry: {
                  coordinates: route.geometry.coordinates,
                  distance: route.distance,
                  duration: route.duration,
                  alternatives: data.routes
              },
              usedFallback: true
          };
      }
  }

  if (data) {
      // If we didn't use fallback but requested alternatives, OSRM puts the best one first.
      const route = data.routes[0];
      return {
          geometry: {
              coordinates: route.geometry.coordinates,
              distance: route.distance,
              duration: route.duration,
              alternatives: data.routes
          },
          usedFallback: false
      };
  }

  return { geometry: null, usedFallback: false };
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
    
    return {
      lat,
      lng,
      temp: current.temperature_2m,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      rain: current.rain,
      rainProb: rainProb,
      weatherCode: current.weather_code
    };
  } catch (e) {
    console.error("Weather error", e);
    return { lat, lng, temp: 0, rain: 0, rainProb: 0, windSpeed: 0, windDirection: 0, weatherCode: 0 };
  }
};
