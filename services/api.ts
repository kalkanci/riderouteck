import { WeatherData, StationData } from "../types";

// --- OPEN METEO WEATHER (No Key Required) ---
export const getWeatherForPoint = async (lat: number, lng: number): Promise<WeatherData> => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,rain,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability,surface_pressure,visibility&elevation=nan`; 
    
    const res = await fetch(url);
    const data = await res.json();
    const current = data.current;
    
    const topoElevation = data.elevation || 0;

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
      humidity: current.relative_humidity_2m || 0,
      pressure: current.surface_pressure || 1013,
      visibility: current.visibility || 10000,
      elevation: topoElevation
    };
  } catch (e) {
    console.error("Weather fetch failed", e);
    return { lat, lng, temp: 0, feelsLike: 0, rain: 0, rainProb: 0, windSpeed: 0, windDirection: 0, weatherCode: 0, humidity: 0, pressure: 1013, visibility: 10000, elevation: 0 };
  }
};

// --- OPEN STREET MAP REVERSE GEOCODING (No Key Required) ---
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`);
        if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        
        const data = await res.json();
        const addr = data.address;
        
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

// --- GET REGIONAL STATIONS (Simulated by offsetting coordinates) ---
export const getNearbyStations = async (lat: number, lng: number): Promise<StationData[]> => {
    const offset = 0.08;
    const points = [
        { dir: "Kuzey", dLat: offset, dLng: 0 },
        { dir: "Güney", dLat: -offset, dLng: 0 },
        { dir: "Doğu", dLat: 0, dLng: offset },
        { dir: "Batı", dLat: 0, dLng: -offset },
    ];

    const stations: StationData[] = [];

    await Promise.all(points.map(async (p) => {
        const targetLat = lat + p.dLat;
        const targetLng = lng + p.dLng;
        
        try {
            const [weather, name] = await Promise.all([
                getWeatherForPoint(targetLat, targetLng),
                reverseGeocode(targetLat, targetLng)
            ]);
            
            stations.push({
                name: name,
                direction: p.dir,
                temp: weather.temp,
                windSpeed: weather.windSpeed,
                rainProb: weather.rainProb,
                weatherCode: weather.weatherCode
            });
        } catch (e) {
            // Silently fail for individual station
        }
    }));

    return stations;
};
