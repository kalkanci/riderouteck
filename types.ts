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
}

export interface RouteAnalysis {
  riskLevel: "Düşük" | "Orta" | "Yüksek";
  summary: string;
  elevationDetails: string; // New: Specific elevation analysis
  windWarning: string;
  gearAdvice: string;
  roadCondition: string; 
  scenicScore: string;   
}

export interface RouteGeometry {
  coordinates: [number, number][]; // [lng, lat] from OSRM
  distance: number;
  duration: number;
  alternatives?: any[];
}

export interface RouteOptions {
  avoidTolls: boolean; // Simplified option
}
