import { LocationData, WeatherData } from "../types";

// --- OPEN METEO WEATHER (No Key Required) ---
export const getWeatherForPoint = async (lat: number, lng: number): Promise<WeatherData> => {
  try {
    // Added apparent_temperature to the query
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,rain,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    const current = data.current;
    
    return {
      lat,
      lng,
      temp: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      rain: current.rain,
      rainProb: current.precipitation_probability || 0,
      weatherCode: current.weather_code,
    };
  } catch (e) {
    console.error("Weather fetch failed", e);
    // Default fallback
    return { lat, lng, temp: 0, feelsLike: 0, rain: 0, rainProb: 0, windSpeed: 0, windDirection: 0, weatherCode: 0 };
  }
};

// --- OPEN STREET MAP REVERSE GEOCODING (No Key Required) ---
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
        // Using Nominatim (OSM). Note: Requires User-Agent header in real apps, browser handles it usually.
        // limit to 1 result, zoom 10 for city/district level
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`);
        if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        
        const data = await res.json();
        const addr = data.address;
        
        // Try to construct a meaningful short address
        const district = addr.suburb || addr.neighbourhood || addr.district;
        const city = addr.city || addr.province || addr.state;
        
        if (district && city) return `${district}, ${city}`;
        if (city) return city;
        if (addr.town || addr.village) return addr.town || addr.village;
        
        return data.display_name.split(',')[0];
    } catch (e) {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
};
