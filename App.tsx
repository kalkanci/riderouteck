import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, ArrowUp, Zap, Droplets, Gauge, Thermometer, TrendingUp, ShieldCheck, Mountain, Compass, Timer, Activity, Locate, RotateCcw, Crosshair, ChevronsRight, Split, Target, MoveUpRight, MoveDownRight, Minus, Music, Volume2, Pause, Play, Radio, AlertTriangle, Key } from 'lucide-react';
import { LocationData, WeatherData, RouteAlternative, ElevationStats, RadioStation } from './types';
import { searchLocation, getRouteAlternatives, getWeatherForPoint, getElevationProfile, getRadioStations, hasApiKey, setManualApiKey } from './services/api';

// --- UTILS ---
const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; const dLat = (lat2-lat1)*(Math.PI/180); const dLon = (lon2-lon1)*(Math.PI/180);
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*(Math.PI/180))*Math.cos(lat2*(Math.PI/180)) * Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const getWeatherIcon = (code: number, size = 32) => {
    if (code === 0) return <Sun size={size} className="text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]" />;
    if (code <= 3) return <Cloud size={size} className="text-slate-400" />;
    if (code <= 48) return <CloudFog size={size} className="text-slate-500" />;
    if (code <= 67) return <CloudRain size={size} className="text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]" />;
    if (code <= 77) return <Snowflake size={size} className="text-white" />;
    return <CloudRain size={size} className="text-indigo-400" />;
};

const getWindDirectionArrow = (deg: number) => (
    <ArrowUp size={18} className="text-slate-400" style={{ transform: `rotate(${deg}deg)` }} />
);

const sampleRoutePoints = (coords: [number, number][], intervalKm: number = 10) => {
    if (!coords.length) return [];
    const points = [{ coord: coords[0], dist: 0 }];
    let last = coords[0];
    let totalDist = 0;
    for (let i = 1; i < coords.length; i++) {
        const d = getDistanceFromLatLonInKm(last[1], last[0], coords[i][1], coords[i][0]);
        if (d >= intervalKm) {
            totalDist += d;
            points.push({ coord: coords[i], dist: Math.round(totalDist) });
            last = coords[i];
        }
    }
    const lastCoord = coords[coords.length - 1];
    points.push({ coord: lastCoord, dist: Math.round(totalDist + getDistanceFromLatLonInKm(last[1], last[0], lastCoord[1], lastCoord[0])) });
    return points;
};

// --- COMPONENTS ---

const ApiKeyModal = ({ onClose }: { onClose: () => void }) => {
    const [key, setKey] = useState("");
    
    const handleSave = () => {
        if(key.length > 10) {
            setManualApiKey(key);
            onClose();
        } else {
            alert("Lütfen geçerli bir Google Maps API Anahtarı giriniz.");
        }
    };

    return (
        <div className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-12 h-12 bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mb-2">
                        <Key size={24} />
                    </div>
                    <h2 className="text-xl font-bold text-white">Google Maps API Anahtarı Gerekli</h2>
                    <p className="text-sm text-slate-400">
                        Uygulamanın çalışması için geçerli bir API anahtarı girilmelidir. Bu anahtar sadece tarayıcınızda saklanır.
                    </p>
                    <input 
                        type="text" 
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder="AIzaSy..." 
                        className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3 text-white font-mono text-sm focus:border-cyan-500 outline-none"
                    />
                    <button 
                        onClick={handleSave}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl transition-all"
                    >
                        Anahtarı Kaydet ve Başla
                    </button>
                    <div className="text-[10px] text-slate-500 mt-2">
                        Routes API, Places API ve Geocoding API aktif olmalıdır.
                    </div>
                </div>
            </div>
        </div>
    );
};

const LiveMiniMap = ({ coordinates, color, userPos }: { coordinates: [number, number][], color: string, userPos: [number, number] | null }) => {
    if (!coordinates || coordinates.length < 2) return null;

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    coordinates.forEach(c => {
        const [lng, lat] = c;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    });

    const latPad = (maxLat - minLat) * 0.1; const lngPad = (maxLng - minLng) * 0.1;
    minLat -= latPad; maxLat += latPad; minLng -= lngPad; maxLng += lngPad;
    const width = 300; const height = 120;

    const mapX = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * width;
    const mapY = (lat: number) => height - ((lat - minLat) / (maxLat - minLat)) * height;

    const points = coordinates.map(c => `${mapX(c[0])},${mapY(c[1])}`).join(' ');

    return (
        <div className="w-full h-32 bg-slate-900/50 rounded-xl overflow-hidden relative border border-slate-700/50 mt-3">
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="opacity-80">
                <polyline points={points} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
                {userPos && (
                    <circle cx={mapX(userPos[1])} cy={mapY(userPos[0])} r="6" fill="#ef4444" stroke="white" strokeWidth="2" className="animate-pulse" />
                )}
            </svg>
            <div className="absolute top-2 left-2 text-[9px] text-slate-500 font-bold uppercase tracking-widest bg-slate-900/80 px-2 py-0.5 rounded">Canlı Takip</div>
        </div>
    );
};

// Simplified Lean Gauge (Just Angle & Wings)
const LeanGauge = ({ angle, onCalibrate }: { angle: number, onCalibrate: () => void }) => {
    const absAngle = Math.abs(angle);
    const isLeft = angle < 0;
    const fillPercent = Math.min(absAngle / 50, 1) * 100;
    
    let barColor = "bg-emerald-500";
    if (absAngle > 25) barColor = "bg-amber-400";
    if (absAngle > 40) barColor = "bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.8)]";

    return (
        <div className="relative flex flex-col items-center justify-center w-full h-24 z-10">
             {/* Center Readout */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20">
                 <div className="text-4xl font-black text-white italic tracking-tighter tabular-nums drop-shadow-md">
                     {absAngle.toFixed(0)}<span className="text-sm text-slate-400 not-italic">°</span>
                 </div>
                 <div onClick={onCalibrate} className="text-[9px] text-slate-600 font-bold uppercase tracking-widest cursor-pointer active:text-cyan-400 hover:text-white transition-colors">
                     SIFIRLA
                 </div>
             </div>

             {/* Wings Container */}
             <div className="w-full flex justify-between items-center px-2 opacity-90">
                 <div className="flex-1 h-3 bg-slate-800 rounded-l-full relative overflow-hidden transform skew-x-12 mr-2 border border-slate-700">
                     <div className={`absolute top-0 bottom-0 right-0 ${isLeft ? barColor : 'bg-transparent'} transition-all duration-100 ease-out`} style={{ width: isLeft ? `${fillPercent}%` : '0%' }}></div>
                 </div>
                 <div className="w-20"></div>
                 <div className="flex-1 h-3 bg-slate-800 rounded-r-full relative overflow-hidden transform -skew-x-12 ml-2 border border-slate-700">
                     <div className={`absolute top-0 bottom-0 left-0 ${!isLeft ? barColor : 'bg-transparent'} transition-all duration-100 ease-out`} style={{ width: !isLeft ? `${fillPercent}%` : '0%' }}></div>
                 </div>
             </div>
        </div>
    );
};

// --- CO-PILOT HUD CARD (Redesigned) ---
interface NextSegmentStats {
    asphalt: 'dry' | 'wet' | 'slippery';
    elevation: 'flat' | 'climb' | 'descent';
    slope: number;
    weatherCode: number;
    windSpeed: number;
}

const CoPilotCard = ({ stats }: { stats: NextSegmentStats | null }) => {
    if (!stats) return (
        <div className="mx-4 mt-2 h-20 bg-slate-900/50 rounded-xl flex items-center justify-center border border-slate-800">
            <span className="text-xs text-slate-500 animate-pulse">SONRAKİ 5KM ANALİZ EDİLİYOR...</span>
        </div>
    );

    const isRisky = stats.asphalt !== 'dry' || stats.windSpeed > 30;
    const asphaltColor = stats.asphalt === 'dry' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    const windColor = stats.windSpeed > 25 ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-slate-800 text-slate-300 border-slate-700';

    return (
        <div className="mx-4 mt-2 grid grid-cols-12 gap-2">
            {/* Header / Distance */}
            <div className="col-span-3 bg-slate-800 rounded-xl flex flex-col justify-center items-center border border-slate-700">
                <span className="text-[9px] text-slate-500 font-bold tracking-widest">ÖNÜNDEKİ</span>
                <span className="text-2xl font-black text-white italic">5 KM</span>
            </div>

            {/* Asphalt (Critical) */}
            <div className={`col-span-9 rounded-xl border flex items-center px-4 relative overflow-hidden ${asphaltColor}`}>
                <div className="z-10 flex items-center gap-3">
                    {stats.asphalt === 'dry' ? <Activity size={24} /> : <Droplets size={24} />}
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold opacity-70 uppercase tracking-wider">ZEMİN DURUMU</span>
                        <span className="text-xl font-black italic uppercase leading-none">
                            {stats.asphalt === 'dry' ? 'KURU VE TEMİZ' : stats.asphalt === 'wet' ? 'ISLAK ZEMİN' : 'DİKKAT KAYGAN'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Secondary Stats Row */}
            <div className={`col-span-6 rounded-xl border flex items-center justify-between px-3 py-2 ${windColor}`}>
                <div className="flex flex-col">
                     <span className="text-[9px] font-bold opacity-70 uppercase">RÜZGAR</span>
                     <span className="text-lg font-black leading-none">{Math.round(stats.windSpeed)} <span className="text-[10px]">KM/H</span></span>
                </div>
                {getWeatherIcon(stats.weatherCode, 24)}
            </div>

            <div className="col-span-6 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between px-3 py-2 text-slate-300">
                <div className="flex flex-col">
                     <span className="text-[9px] font-bold opacity-70 uppercase">EĞİM</span>
                     <span className="text-lg font-black leading-none text-white">%{stats.slope} <span className="text-[10px]">{stats.elevation === 'climb' ? 'ÇIKIŞ' : stats.elevation === 'descent' ? 'İNİŞ' : 'DÜZ'}</span></span>
                </div>
                {stats.elevation === 'climb' ? <MoveUpRight size={24} /> : stats.elevation === 'descent' ? <MoveDownRight size={24} /> : <Minus size={24} />}
            </div>
        </div>
    );
};

// --- MOTO RADIO PLAYER ---
const MotoRadio = ({ routeType }: { routeType: 'fastest' | 'scenic' | null }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [station, setStation] = useState<RadioStation | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(0.8);

    useEffect(() => {
        if (!routeType) return;
        const tag = routeType === 'scenic' ? 'chillout' : 'house';
        
        getRadioStations(tag).then(stations => {
            if (stations.length > 0) {
                // Pick a random station from top 5
                const rand = Math.floor(Math.random() * Math.min(5, stations.length));
                setStation(stations[rand]);
            }
        });
    }, [routeType]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(e => console.error("Playback failed", e));
        }
        setIsPlaying(!isPlaying);
    };

    if (!station) return null;

    return (
        <div className="absolute bottom-6 right-6 z-50 flex flex-col items-end animate-in fade-in slide-in-from-bottom duration-700">
            <audio ref={audioRef} src={station.url_resolved} crossOrigin="anonymous" loop={false} />
            <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-700 backdrop-blur-md p-2 pl-4 rounded-full shadow-2xl">
                 <div className="flex flex-col items-end mr-1">
                     <span className="text-[8px] font-bold text-cyan-400 uppercase tracking-widest">MOTO FM</span>
                     <span className="text-xs font-bold text-white truncate max-w-[100px]">{station.name}</span>
                 </div>
                 <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-cyan-500 hover:bg-cyan-400 flex items-center justify-center text-slate-900 shadow-[0_0_15px_rgba(6,182,212,0.6)] transition-all active:scale-95">
                     {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                 </button>
            </div>
        </div>
    );
};

// 1. DASHBOARD HEADER (UPDATED)
const DashboardHeader = ({ speed, altitude, heading, accuracy, tripTime, leanAngle, onCalibrate, next5kmStats }: any) => (
    <div className="flex-none bg-[#0b0f19] border-b border-slate-800 pb-0 pt-2 z-50 shadow-2xl relative overflow-hidden">
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-1/2 bg-cyan-500/10 blur-3xl rounded-full opacity-60`}></div>
        
        {/* TOP ROW: Speed & Lean */}
        <div className="grid grid-cols-3 gap-2 relative z-10 items-center px-4 pb-2">
            {/* Speed */}
            <div className="col-span-1 flex flex-col justify-start">
                <div className="flex items-baseline"><span className="text-5xl font-black text-white leading-none tracking-tighter tabular-nums">{speed}</span></div>
                <div className="text-[10px] font-black text-cyan-500 tracking-widest mt-0.5">KM/H</div>
            </div>

            {/* Lean Gauge (Center) */}
            <div className="col-span-1 flex justify-center -mt-2">
                <LeanGauge angle={leanAngle} onCalibrate={onCalibrate} />
            </div>

            {/* Stats (Right) */}
            <div className="col-span-1 flex flex-col items-end gap-1">
                 <div className="flex items-center gap-1 bg-slate-800/50 px-2 py-1 rounded">
                     <Mountain size={12} className="text-slate-400"/>
                     <span className="text-xs font-mono font-bold text-white">{altitude ? Math.round(altitude) : 0}m</span>
                 </div>
                 <div className="flex items-center gap-1 bg-slate-800/50 px-2 py-1 rounded">
                     <Timer size={12} className="text-slate-400"/>
                     <span className="text-xs font-mono font-bold text-white">{tripTime}</span>
                 </div>
            </div>
        </div>

        {/* BOTTOM ROW: Co-Pilot Prediction */}
        <div className="bg-[#0f1523] border-t border-slate-800/50 pb-3 pt-1">
            <CoPilotCard stats={next5kmStats} />
        </div>
    </div>
);

const RoadbookRow: React.FC<{ dist: number, weather: WeatherData }> = ({ dist, weather }) => {
    const isWet = weather.rainProb > 40 || weather.rain > 0.5;
    return (
        <div className="flex gap-4 relative pl-4 pr-4">
            <div className="absolute left-[5.5rem] top-0 bottom-0 w-0.5 bg-slate-800 -z-10"></div>
            <div className="w-16 py-4 flex flex-col items-center justify-center shrink-0 z-10 bg-[#0b0f19] my-2">
                 <div className="text-xl font-black text-white font-mono">{dist}</div>
                 <div className="text-[9px] text-slate-500 font-bold">KM</div>
            </div>
            <div className={`w-3 h-3 rounded-full mt-7 ml-[0.35rem] shrink-0 border-2 border-[#0b0f19] z-20 ${isWet ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'bg-slate-600'}`}></div>
            <div className={`flex-1 mb-3 rounded-xl p-4 border flex items-center justify-between shadow-lg transition-all ${isWet ? 'bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-900/20 border-cyan-900/50' : 'bg-slate-800/50 border-slate-700/50'}`}>
                 <div className="flex items-center gap-4">
                     {getWeatherIcon(weather.weatherCode, 28)}
                     <div><div className="flex items-baseline gap-1"><span className="text-lg font-bold text-white">{Math.round(weather.temp)}°</span></div>
                         <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400"><Wind size={10} /> {Math.round(weather.windSpeed)} {getWindDirectionArrow(weather.windDirection)}</div>
                     </div>
                 </div>
                 {isWet && <div className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-[10px] text-cyan-400 font-bold uppercase">KAYGAN</div>}
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [endQuery, setEndQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationData[]>([]);
  
  const [startLoc, setStartLoc] = useState<LocationData | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'searching' | 'found' | 'error'>('searching');
  const [locationErrorMsg, setLocationErrorMsg] = useState("");

  const [endLoc, setEndLoc] = useState<LocationData | null>(null);
  
  const [routeOptions, setRouteOptions] = useState<RouteAlternative[]>([]);
  const [radarPoints, setRadarPoints] = useState<{dist: number, weather: WeatherData}[]>([]);
  const [activeRouteCoords, setActiveRouteCoords] = useState<[number, number][] | null>(null);
  const [activeRouteType, setActiveRouteType] = useState<'fastest' | 'scenic' | null>(null);
  const [routeElevation, setRouteElevation] = useState<ElevationStats | null>(null);
  
  // Telemetry
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [altitude, setAltitude] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number>(0);
  const [tripTime, setTripTime] = useState("00:00");
  const [leanAngle, setLeanAngle] = useState(0);
  const [calibrationOffset, setCalibrationOffset] = useState(0); // Added for Tare functionality
  const [next5kmStats, setNext5kmStats] = useState<NextSegmentStats | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isRerouting, setIsRerouting] = useState(false);
  
  const [showKeyModal, setShowKeyModal] = useState(false);

  // Refs
  const watchIdRef = useRef<number | null>(null);
  const tripStartRef = useRef<number | null>(null);
  const timerRef = useRef<any>(null);
  const lastRerouteTime = useRef<number>(0);

  // --- CHECK API KEY ON MOUNT ---
  useEffect(() => {
      // Small delay to let everything hydrate
      setTimeout(() => {
          if (!hasApiKey()) {
              setShowKeyModal(true);
          }
      }, 1000);
  }, []);

  // --- ANALYZE NEXT 5 KM ---
  const analyzeNext5Km = (currentLat: number, currentLng: number, coords: [number, number][], elevations: ElevationStats | null, radar: {dist: number, weather: WeatherData}[]) => {
      if (!coords.length) return;

      let closestIdx = 0;
      let minD = 99999;
      for (let i = 0; i < coords.length; i+=5) {
          const d = getDistanceFromLatLonInKm(currentLat, currentLng, coords[i][1], coords[i][0]);
          if (d < minD) { minD = d; closestIdx = i; }
      }

      const lookAheadIdx = Math.min(coords.length - 1, closestIdx + 50);
      
      let elevStatus: 'flat' | 'climb' | 'descent' = 'flat';
      let slope = 0;

      if (elevations && elevations.points.length > 0) {
          const eIdx1 = Math.floor((closestIdx / coords.length) * elevations.points.length);
          const eIdx2 = Math.floor((lookAheadIdx / coords.length) * elevations.points.length);
          
          if (eIdx2 < elevations.points.length && eIdx1 < eIdx2) {
              const h1 = elevations.points[eIdx1];
              const h2 = elevations.points[eIdx2];
              const distKm = 5; 
              const rise = h2 - h1;
              slope = Math.round((rise / (distKm * 1000)) * 100); 

              if (slope > 2) elevStatus = 'climb';
              else if (slope < -2) elevStatus = 'descent';
              else elevStatus = 'flat';
          }
      }

      const targetCoord = coords[lookAheadIdx];
      let nearestWeather = radar[0]?.weather;
      let minWD = 9999;
      
      for(const p of radar) {
          const d = getDistanceFromLatLonInKm(targetCoord[1], targetCoord[0], p.weather.lat, p.weather.lng);
          if (d < minWD) { minWD = d; nearestWeather = p.weather; }
      }

      let asphalt: 'dry' | 'wet' | 'slippery' = 'dry';
      if (nearestWeather) {
          if (nearestWeather.rainProb > 40 || nearestWeather.rain > 0.5) asphalt = 'wet';
          if (nearestWeather.temp < 4 && nearestWeather.rainProb > 20) asphalt = 'slippery';
      }

      setNext5kmStats({
          asphalt,
          elevation: elevStatus,
          slope: Math.abs(slope),
          weatherCode: nearestWeather ? nearestWeather.weatherCode : 0,
          windSpeed: nearestWeather ? nearestWeather.windSpeed : 0
      });
  };

  // --- AUTO START GPS & LOCATION ---
  useEffect(() => {
    tripStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
        if (tripStartRef.current) {
            const diff = Math.floor((Date.now() - tripStartRef.current) / 1000);
            const m = Math.floor(diff / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');
            setTripTime(`${m}:${s}`);
        }
    }, 1000);

    if (navigator.geolocation) {
        setLocationStatus('searching');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = { name: "Mevcut Konum", lat: pos.coords.latitude, lng: pos.coords.longitude, admin1: "GPS" };
                setStartLoc(loc);
                setUserPos([pos.coords.latitude, pos.coords.longitude]);
                setLocationStatus('found');
            },
            (err) => {
                console.error("Geolocation error:", err);
                setLocationStatus('error');
                let msg = "GPS Hatası";
                if (err.code === 1) msg = "Konum İzni Reddedildi";
                else if (err.code === 2) msg = "Konum Bulunamadı (GPS Kapalı?)";
                else if (err.code === 3) msg = "Zaman Aşımı";
                setLocationErrorMsg(msg);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );

        watchIdRef.current = navigator.geolocation.watchPosition(
            pos => {
                const { latitude, longitude, speed, altitude, heading, accuracy } = pos.coords;
                setUserPos([latitude, longitude]);
                
                const kmh = speed ? speed * 3.6 : 0;
                setCurrentSpeed(prev => {
                    if (Math.abs(kmh - prev) > 40 && prev > 10) return prev; 
                    return Math.round(prev * 0.7 + kmh * 0.3); 
                });
                setAltitude(altitude); setHeading(heading); setAccuracy(accuracy || 0);

                if (activeRouteCoords && radarPoints.length > 0) {
                     analyzeNext5Km(latitude, longitude, activeRouteCoords, routeElevation, radarPoints);
                }

                if (activeRouteCoords && endLoc && !isRerouting && Date.now() - lastRerouteTime.current > 10000) {
                     let minD = 9999;
                     for(let i=0; i<activeRouteCoords.length; i+=10) {
                         const d = getDistanceFromLatLonInKm(latitude, longitude, activeRouteCoords[i][1], activeRouteCoords[i][0]);
                         if(d < minD) minD = d;
                     }
                     if (minD > 0.5) triggerReroute(latitude, longitude);
                }
            },
            err => console.warn(err),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
    } else {
        setLocationStatus('error');
        setLocationErrorMsg("Tarayıcı Desteklemiyor");
    }
    
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission().then((s: string) => { 
            if (s === 'granted') window.addEventListener('deviceorientation', handleOrientation); 
        }).catch(console.error);
    } else { 
        window.addEventListener('deviceorientation', handleOrientation); 
    }

    return () => {
        if(watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        if(timerRef.current) clearInterval(timerRef.current);
        window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [activeRouteCoords, routeElevation, radarPoints]); 

  const triggerReroute = async (lat: number, lng: number) => {
      if(!endLoc) return;
      setIsRerouting(true);
      lastRerouteTime.current = Date.now();
      try {
          const newStart: LocationData = { name: "Current", lat, lng };
          const alts = await getRouteAlternatives(newStart, endLoc);
          if (alts.length > 0) selectRoute(alts[0]);
      } catch(e) { console.error("Reroute failed", e); } finally { setIsRerouting(false); }
  };

  const handleOrientation = (event: DeviceOrientationEvent) => {
      let rawAngle = event.gamma || 0; 
      if (rawAngle > 90) rawAngle = 90; if (rawAngle < -90) rawAngle = -90;
      setLeanAngle(prev => prev * 0.8 + rawAngle * 0.2);
  };

  // --- CALIBRATE: Sets current angle as "0" ---
  const calibrateLean = () => {
      setCalibrationOffset(leanAngle);
  };

  // --- SEARCH ---
  useEffect(() => {
      if (endQuery.length < 3) { setSearchResults([]); return; }
      const t = setTimeout(async () => setSearchResults(await searchLocation(endQuery)), 400);
      return () => clearTimeout(t);
  }, [endQuery]);

  const handleSelectLoc = (loc: LocationData) => {
      setEndLoc(loc); setEndQuery(loc.name); setSearchResults([]);
  };

  const handleSearchRoutes = async () => {
      if (!startLoc) {
          alert("Konum henüz bulunamadı. Lütfen GPS'in aktif olduğundan emin olun.");
          return;
      }
      if (!endLoc) {
          alert("Lütfen bir hedef seçin.");
          return;
      }
      
      // Dynamic Check
      if (!hasApiKey()) {
          setShowKeyModal(true);
          return;
      }

      setIsLoading(true); setRouteOptions([]); setRadarPoints([]);
      try {
          const alts = await getRouteAlternatives(startLoc, endLoc);
          if (alts.length > 0) setRouteOptions(alts);
          else alert("Rota bulunamadı.");
      } catch (err: any) { alert("Hata: " + err.message); } finally { setIsLoading(false); }
  };

  const selectRoute = async (route: RouteAlternative) => {
      setIsLoading(true);
      try {
          const elev = await getElevationProfile(route.coordinates);
          setRouteElevation(elev);

          const points = sampleRoutePoints(route.coordinates.map(c=>[c[1], c[0]]), 10);
          const weatherData = await Promise.all(points.map(p => getWeatherForPoint(p.coord[0], p.coord[1])));
          setRadarPoints(points.map((p, i) => ({ dist: p.dist, weather: weatherData[i] })));
          setActiveRouteCoords(route.coordinates);
          setActiveRouteType(route.type);
          setRouteOptions([]); 
      } catch(e) {
          alert("Analiz hatası");
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="dash-bg w-full h-[100dvh] flex flex-col relative text-slate-100 overflow-hidden font-sans">
      
      {showKeyModal && <ApiKeyModal onClose={() => setShowKeyModal(false)} />}

      <DashboardHeader 
        speed={currentSpeed} 
        altitude={altitude} 
        heading={heading} 
        accuracy={accuracy} 
        tripTime={tripTime} 
        leanAngle={leanAngle - calibrationOffset} 
        onCalibrate={calibrateLean}
        next5kmStats={next5kmStats}
      />
      
      {!hasApiKey() && !showKeyModal && (
          <button onClick={() => setShowKeyModal(true)} className="bg-red-600/90 hover:bg-red-500 text-white text-xs font-bold text-center py-1 absolute top-0 w-full z-[100] flex items-center justify-center gap-2 cursor-pointer transition-colors">
              <AlertTriangle size={14} /> API ANAHTARI YOK - TIKLA VE GİR
          </button>
      )}

      {isRerouting && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-xl z-[60] animate-pulse flex items-center gap-2 border border-red-400">
              <RotateCcw className="animate-spin" size={20} /> ROTA YENİLENİYOR...
          </div>
      )}

      {/* MOTO RADIO */}
      {radarPoints.length > 0 && <MotoRadio routeType={activeRouteType} />}

      <div className="flex-1 overflow-hidden relative flex flex-col">
          
          {/* STATE 1: INPUT SCREEN */}
          {radarPoints.length === 0 && routeOptions.length === 0 && (
              <div className="flex-1 flex flex-col justify-center px-6 max-w-lg mx-auto w-full space-y-6 animate-in fade-in zoom-in duration-300">
                   <div className="text-center mb-4"><h1 className="text-3xl font-black italic tracking-tighter text-white drop-shadow-lg">ROTA ANALİZİ</h1><p className="text-slate-500 text-sm mt-2">Mekan, AVM veya Benzinlik.</p></div>
                   <div className="space-y-4">
                       <div className="group relative opacity-70">
                           <div className={`absolute left-4 top-1/2 -translate-y-1/2 ${locationStatus === 'found' ? 'text-emerald-500' : locationStatus === 'error' ? 'text-red-500' : 'text-cyan-500'}`}>
                               {locationStatus === 'searching' ? <RotateCcw className="animate-spin" /> : locationStatus === 'error' ? <AlertTriangle /> : <MapPin />}
                           </div>
                           <input 
                             disabled 
                             value={locationStatus === 'searching' ? "Konum Bekleniyor..." : locationStatus === 'error' ? locationErrorMsg : "Mevcut Konum (GPS Aktif)"} 
                             className={`w-full bg-slate-800/50 border rounded-2xl h-14 pl-14 pr-4 text-lg font-bold transition-all ${locationStatus === 'error' ? 'border-red-500/50 text-red-400' : 'border-slate-700 text-slate-400'}`} 
                           />
                           {locationStatus === 'found' && <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 animate-pulse"><Crosshair size={20} /></div>}
                       </div>
                       
                       <div className="group relative">
                           <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500"><Navigation /></div>
                           <input value={endQuery} onChange={e => setEndQuery(e.target.value)} placeholder="Nereye sürüyoruz? (Örn: Benzin, AVM)" className="w-full bg-slate-800/80 border-2 border-slate-700 rounded-2xl h-16 pl-14 pr-14 text-lg font-bold text-white focus:border-amber-500 outline-none transition-all placeholder:text-slate-600" />
                       </div>
                       {searchResults.length > 0 && (
                           <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden max-h-48 overflow-y-auto z-50 shadow-2xl">
                               {searchResults.map((r, i) => (
                                   <div key={i} onClick={() => handleSelectLoc(r)} className="p-4 border-b border-slate-700 hover:bg-slate-700 cursor-pointer flex justify-between items-center"><span className="font-bold text-white truncate max-w-[70%]">{r.name}</span><span className="text-xs text-slate-400">{r.admin1}</span></div>
                               ))}
                           </div>
                       )}
                   </div>
                   <div className="pt-4 space-y-3">
                       <button onClick={handleSearchRoutes} disabled={isLoading || !endLoc} className="w-full h-16 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-black text-xl text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                           {isLoading ? "ROTA ARANIYOR..." : "ROTALARI BUL"} {!isLoading && <Split size={24} />}
                       </button>
                   </div>
              </div>
          )}

          {/* STATE 2: ROUTE SELECTION */}
          {routeOptions.length > 0 && radarPoints.length === 0 && (
              <div className="flex-1 flex flex-col p-6 animate-in slide-in-from-right duration-300">
                   <div className="flex items-center justify-between mb-4">
                       <div><h2 className="text-2xl font-black italic text-white">ROTA SEÇİMİ</h2><p className="text-slate-400 text-sm">Sürüş tarzına uygun rotayı seç.</p></div>
                       <button onClick={() => setRouteOptions([])} className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"><RotateCcw size={20} /></button>
                   </div>
                   <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-20">
                       {routeOptions.map((opt, i) => (
                           <div key={i} onClick={() => selectRoute(opt)} className="group relative bg-slate-800/80 border-2 border-slate-700 hover:border-cyan-500 rounded-3xl p-5 cursor-pointer transition-all active:scale-[0.99] overflow-hidden">
                               <div className="flex justify-between items-start z-10 relative">
                                   <div>
                                       <div className="flex gap-2 mb-2">
                                           {opt.tags.map(t => (<span key={t} className="px-2 py-0.5 rounded-md bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-400 border border-slate-700">{t}</span>))}
                                       </div>
                                       <h3 className="text-xl font-bold text-white mb-1">{opt.name}</h3>
                                       <p className="text-xs text-slate-400 leading-relaxed max-w-[80%]">{opt.description}</p>
                                   </div>
                                   <div className="text-right">
                                       <div className="text-2xl font-black text-cyan-400">{(opt.duration / 60).toFixed(0)}dk</div>
                                       <div className="text-xs font-bold text-slate-500">{(opt.distance / 1000).toFixed(1)} km</div>
                                   </div>
                               </div>
                               <LiveMiniMap coordinates={opt.coordinates} color={opt.color} userPos={userPos} />
                               <div className="absolute bottom-4 right-4 bg-cyan-500 text-slate-900 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-20"><ChevronsRight size={24} /></div>
                           </div>
                       ))}
                   </div>
              </div>
          )}

          {/* STATE 3: DASHBOARD */}
          {radarPoints.length > 0 && (
              <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in zoom-in duration-500">
                  <div className="mt-4 px-6 pb-2 flex justify-between items-end border-b border-slate-800 mx-4">
                      <h2 className="text-xs font-black text-slate-500 tracking-[0.2em] uppercase">CANLI YOL BİLGİSİ</h2>
                      <button onClick={() => { setRadarPoints([]); setActiveRouteCoords(null); setLeanAngle(0); setCalibrationOffset(0); }} className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-wider mb-1 px-2 py-1 bg-red-900/10 rounded flex items-center gap-1"><RotateCcw size={10} /> Çıkış</button>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-20 fade-mask">
                      <div className="space-y-0 mt-4">
                          {radarPoints.map((point, i) => (
                              <RoadbookRow key={i} dist={point.dist} weather={point.weather} />
                          ))}
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default App;