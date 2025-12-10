
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
  humidity: number;
  pressure: number;
  visibility: number;
  elevation: number;
}

export interface StationData {
  name: string;
  direction: string;
  temp: number;
  windSpeed: number;
  rainProb: number;
  weatherCode: number;
}

export interface CoPilotAnalysis {
  status: 'safe' | 'caution' | 'danger';
  message: string;
  roadCondition: string;
  color: string;
}

export interface RadioStation {
  name: string;
  url: string;
}
