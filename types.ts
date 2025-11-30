// Global declaration for Leaflet loaded via CDN
declare global {
  interface Window {
    L: any;
  }
}

export interface LocationData {
  name: string;
  lat: number;
  lng: number;
  admin1?: string; // Province/State
  type?: string; // Type of location (city, amenity, etc.)
}

export interface WeatherData {
  lat: number;
  lng: number;
  temp: number;
  windSpeed: number;
  windDirection: number; // Added for Sail Effect
  rain: number;
  rainProb: number; // Probability %
  weatherCode: number;
  hourlyRainForecast?: number[]; // Array of probabilities for the next 24h
}

export interface PoiData {
  id: number;
  lat: number;
  lng: number;
  name: string;
  type: 'fuel' | 'food' | 'sight';
}

export interface RadioStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  tags: string;
  country: string;
}

export interface RouteSegment {
  name: string; // e.g. "İstanbul Çıkışı - Tem Otoyolu"
  description: string; // "Yoğun trafik, dikkatli şerit değişimi."
  risk: "Düşük" | "Orta" | "Yüksek";
}

export interface PitStop {
  type: string; // e.g. "Benzin & Kahve", "Manzara", "Yemek"
  locationDescription: string; // "Bolu Tüneli çıkışındaki tesisler"
  reason: string; // "Sıcak bir kahve ve motoru dinlendirmek için ideal."
}

export interface ElevationStats {
  min: number;
  max: number;
  avg: number;
  gain: number; // Total ascent
  points: number[]; // Array of heights for graphing
}

export interface RouteAnalysis {
  riskLevel: "Düşük" | "Orta" | "Yüksek";
  summary: string;
  elevationDetails: string;
  windWarning: string;
  gearAdvice: string;
  roadCondition: string; 
  scenicScore: string;
  // New Features
  segments: RouteSegment[];
  pitStops: PitStop[];
  playlistVibe: string; // Used for Radio Tag
  playlistTag: string; // Technical tag for API
  elevationStats?: ElevationStats; // Added structured data
}

export interface RouteAlternative {
  type: 'fastest' | 'scenic';
  name: string; // "Otoban / Hızlı" or "Köy Yolu / Manzaralı"
  coordinates: [number, number][];
  distance: number; // meters
  duration: number; // seconds
  color: string;
  summary?: string;
}

export interface RouteGeometry {
  coordinates: [number, number][]; // [lng, lat] from OSRM
  distance: number;
  duration: number;
  alternatives?: any[];
}