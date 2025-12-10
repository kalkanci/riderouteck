
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

// Real Spotify Types
export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  duration_ms: number;
  uri: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  images: { url: string }[];
  uri: string;
}

export interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: SpotifyTrack;
  };
}
