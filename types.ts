
export interface LocationData {
  name: string;
  lat: number;
  lng: number;
  admin1?: string;
}

export interface WeatherData {
  lat: number;
  lng: number;
  temp: number;
  feelsLike: number;
  windSpeed: number;
  windDirection: number;
  rain: number;
  rainProb: number;
  weatherCode: number;
}

export interface TelemetryData {
  speed: number;
  altitude: number;
  heading: number;
  accuracy: number;
  leanAngle: number;
  gForce?: number;
}

export interface CoPilotAnalysis {
  status: 'safe' | 'caution' | 'danger';
  message: string;
  roadCondition: string;
  color: string;
}

export interface ElevationStats {
  max: number;
  min: number;
  avg: number;
  gain: number;
}

export interface RouteSegment {
  name: string;
  description: string;
  risk: string;
}

export interface PitStop {
  type: string;
  locationDescription: string;
  reason: string;
}

export interface RouteAnalysis {
  riskLevel: "Düşük" | "Orta" | "Yüksek";
  summary: string;
  elevationDetails: string;
  windWarning: string;
  gearAdvice: string;
  roadCondition: string;
  scenicScore: string;
  segments: RouteSegment[];
  pitStops: PitStop[];
  playlistVibe: string;
  playlistTag: string;
  elevationStats?: ElevationStats;
  weatherInsight: string;
}
