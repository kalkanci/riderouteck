import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, ArrowUp, Zap, Droplets, Gauge, FlaskConical, Thermometer, TrendingUp, AlertTriangle, ShieldCheck, Mountain, Compass, Signal, Timer, Activity } from 'lucide-react';
import { LocationData, WeatherData, RouteAlternative } from './types';
import { searchLocation, getRouteAlternatives, getWeatherForPoint, reverseGeocode } from './services/api';

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

// Sample points evenly
const sampleRoutePoints = (coords: [number, number][], intervalKm: number = 20) => {
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

const GPSSignalIndicator = ({ accuracy }: { accuracy: number }) => {
    // accuracy is in meters. Lower is better.
    let bars = 1;
    let color = "text-red-500";
    
    if (accuracy <= 10) { bars = 4; color = "text-emerald-400"; }
    else if (accuracy <= 25) { bars = 3; color = "text-cyan-400"; }
    else if (accuracy <= 50) { bars = 2; color = "text-amber-400"; }

    return (
        <div className="flex flex-col items-end">
            <div className="flex items-end gap-0.5 h-4">
                <div className={`w-1 rounded-sm ${bars >= 1 ? color : 'bg-slate-700'} h-[25%]`}></div>
                <div className={`w-1 rounded-sm ${bars >= 2 ? color : 'bg-slate-700'} h-[50%]`}></div>
                <div className={`w-1 rounded-sm ${bars >= 3 ? color : 'bg-slate-700'} h-[75%]`}></div>
                <div className={`w-1 rounded-sm ${bars >= 4 ? color : 'bg-slate-700'} h-[100%]`}></div>
            </div>
            <span className="text-[9px] text-slate-500 font-mono mt-0.5">±{Math.round(accuracy)}m</span>
        </div>
    );
};

// 1. DASHBOARD HEADER (Telemetry Cockpit)
const DashboardHeader = ({ 
    speed, 
    isDriving, 
    onToggleDrive, 
    altitude, 
    heading, 
    accuracy,
    tripTime 
}: { 
    speed: number, 
    isDriving: boolean, 
    onToggleDrive: () => void,
    altitude: number | null,
    heading: number | null,
    accuracy: number,
    tripTime: string
}) => (
    <div className="flex-none bg-[#0b0f19] border-b border-slate-800 pb-4 pt-4 px-6 z-50 shadow-2xl relative overflow-hidden">
        {/* Ambient Glow */}
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-1/2 bg-cyan-500/10 blur-3xl rounded-full transition-opacity duration-700 ${isDriving ? 'opacity-100' : 'opacity-0'}`}></div>

        <div className="flex items-center justify-between relative z-10">
            
            {/* LEFT: SPEED & MAIN METRIC */}
            <div className="flex items-center gap-6">
                <div className="relative">
                    <div className="flex items-baseline">
                        <span className="text-[5rem] font-black text-white leading-none tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                            {speed}
                        </span>
                        <span className="text-sm font-black text-cyan-500 ml-2 mb-2 tracking-widest">KMH</span>
                    </div>
                    {/* RPM Bar Simulation */}
                    <div className="w-full h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                         <div className="h-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-red-500 transition-all duration-300" style={{ width: `${Math.min((speed / 180) * 100, 100)}%` }}></div>
                    </div>
                </div>

                {/* Vertical Divider */}
                <div className="h-16 w-[1px] bg-gradient-to-b from-transparent via-slate-700 to-transparent"></div>

                {/* SECONDARY METRICS (Altitude & Heading) */}
                <div className="flex flex-col justify-center space-y-2">
                    {/* Altitude */}
                    <div className="flex items-center gap-2 text-slate-400">
                        <Mountain size={16} className={altitude && altitude > 500 ? "text-amber-400" : "text-slate-500"} />
                        <span className="text-sm font-bold font-mono text-white">{altitude ? Math.round(altitude) : '---'}</span>
                        <span className="text-[9px] font-bold">M</span>
                    </div>
                    {/* Heading */}
                    <div className="flex items-center gap-2 text-slate-400">
                        <Compass size={16} style={{ transform: `rotate(${heading || 0}deg)` }} className="text-cyan-500 transition-transform duration-500" />
                        <span className="text-sm font-bold font-mono text-white">{heading ? Math.round(heading) : '---'}°</span>
                        <span className="text-[9px] font-bold">YÖN</span>
                    </div>
                </div>
            </div>

            {/* RIGHT: CONTROLS & STATUS */}
            <div className="flex flex-col items-end gap-2">
                 <div className="flex items-center gap-3 bg-slate-900/50 p-1.5 pr-3 pl-3 rounded-full border border-slate-800">
                     <GPSSignalIndicator accuracy={accuracy} />
                     <div className="w-[1px] h-4 bg-slate-700"></div>
                     <div className={`w-2 h-2 rounded-full ${isDriving ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`}></div>
                 </div>

                 <button 
                    onClick={onToggleDrive} 
                    className={`h-12 px-6 rounded-xl flex items-center justify-center gap-2 transition-all font-bold tracking-wide shadow-lg ${
                        isDriving 
                        ? 'bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500/20' 
                        : 'bg-cyan-500 text-slate-900 hover:bg-cyan-400 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                    }`}
                >
                    {isDriving ? (
                        <>
                           <Timer size={18} />
                           <span className="font-mono">{tripTime}</span>
                        </>
                    ) : (
                        <>
                           <Zap size={18} fill="currentColor" />
                           BAŞLA
                        </>
                    )}
                </button>
            </div>
        </div>
    </div>
);

// 2. ASPHALT CONDITION CARD
const ConditionCard = ({ weatherData }: { weatherData: WeatherData[] }) => {
    if (!weatherData.length) return null;

    const avgTemp = weatherData.reduce((acc, curr) => acc + curr.temp, 0) / weatherData.length;
    const maxRainProb = Math.max(...weatherData.map(w => w.rainProb));
    const maxWind = Math.max(...weatherData.map(w => w.windSpeed));
    
    // Tire Temp Simulation Logic
    let tireStatus = "SOĞUK";
    let tireColor = "text-blue-400";
    if (avgTemp > 15) { tireStatus = "İDEAL"; tireColor = "text-emerald-400"; }
    if (avgTemp > 30) { tireStatus = "YÜKSEK"; tireColor = "text-amber-400"; }
    if (maxRainProb > 30) { tireStatus = "DÜŞÜK TUTUŞ"; tireColor = "text-cyan-400"; }

    let conditionTitle = "ZEMİN İYİ";
    let conditionColor = "text-emerald-400";
    let conditionIcon = <ShieldCheck size={32} className="text-emerald-400" />;

    if (maxRainProb > 40) {
        conditionTitle = "ISLAK ZEMİN";
        conditionColor = "text-cyan-400";
        conditionIcon = <CloudRain size={32} className="text-cyan-400" />;
    } else if (maxWind > 35) {
        conditionTitle = "RÜZGARLI";
        conditionColor = "text-amber-400";
        conditionIcon = <Wind size={32} className="text-amber-400" />;
    }

    return (
        <div className="mx-4 mt-4 p-0 rounded-3xl bg-slate-900/80 border border-slate-700 shadow-xl overflow-hidden backdrop-blur-sm">
             {/* Gradient Top Line */}
             <div className={`h-1 w-full bg-gradient-to-r from-transparent via-${conditionColor.split('-')[1]}-500 to-transparent opacity-70`}></div>
             
             <div className="p-5 flex items-center justify-between">
                 <div className="flex items-center gap-4">
                     <div className="p-3 bg-slate-800 rounded-2xl border border-slate-700 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                         {conditionIcon}
                     </div>
                     <div>
                         <h3 className={`text-xl font-black italic tracking-wide ${conditionColor}`}>{conditionTitle}</h3>
                         <div className="flex items-center gap-2 mt-1">
                             <Activity size={12} className={tireColor} />
                             <span className={`text-[10px] font-bold ${tireColor} uppercase tracking-wider`}>LASTİK: {tireStatus}</span>
                         </div>
                     </div>
                 </div>
                 
                 <div className="flex gap-4 items-center">
                     <div className="text-right">
                         <div className="text-xl font-bold text-white tabular-nums">{Math.round(avgTemp)}°</div>
                         <div className="text-[9px] text-slate-500 font-bold uppercase">HAVA</div>
                     </div>
                     <div className="w-[1px] h-8 bg-slate-700"></div>
                     <div className="text-right">
                         <div className="text-xl font-bold text-white tabular-nums">{maxRainProb}%</div>
                         <div className="text-[9px] text-slate-500 font-bold uppercase">YAĞIŞ</div>
                     </div>
                 </div>
             </div>
        </div>
    );
};

// 3. ROADBOOK ROW
const RoadbookRow = ({ dist, weather, isLast }: { dist: number, weather: WeatherData, isLast: boolean }) => {
    const isWet = weather.rainProb > 40 || weather.rain > 0.5;
    
    return (
        <div className="flex gap-4 relative pl-4 pr-4">
            {/* Timeline Line */}
            <div className="absolute left-[5.5rem] top-0 bottom-0 w-0.5 bg-slate-800 -z-10"></div>
            
            {/* Distance Pill */}
            <div className="w-16 py-4 flex flex-col items-center justify-center shrink-0 z-10 bg-[#0b0f19] my-2">
                 <div className="text-xl font-black text-white font-mono">{dist}</div>
                 <div className="text-[9px] text-slate-500 font-bold">KM</div>
            </div>

            {/* Connection Dot */}
            <div className={`w-3 h-3 rounded-full mt-7 ml-[0.35rem] shrink-0 border-2 border-[#0b0f19] z-20 ${isWet ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'bg-slate-600'}`}></div>

            {/* Content Card */}
            <div className={`flex-1 mb-3 rounded-xl p-4 border flex items-center justify-between shadow-lg transition-all ${
                isWet 
                ? 'bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-900/20 border-cyan-900/50' 
                : 'bg-slate-800/50 border-slate-700/50'
            }`}>
                 <div className="flex items-center gap-4">
                     {getWeatherIcon(weather.weatherCode, 28)}
                     <div>
                         <div className="flex items-baseline gap-1">
                             <span className="text-lg font-bold text-white">{Math.round(weather.temp)}°</span>
                         </div>
                         <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                             <Wind size={10} /> {Math.round(weather.windSpeed)}
                             {getWindDirectionArrow(weather.windDirection)}
                         </div>
                     </div>
                 </div>
                 
                 {isWet && <div className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-[10px] text-cyan-400 font-bold uppercase">KAYGAN</div>}
            </div>
        </div>
    );
};

const App: React.FC = () => {
  // --- STATE ---
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationData[]>([]);
  const [activeSearchField, setActiveSearchField] = useState<'start' | 'end' | null>(null);
  
  const [startLoc, setStartLoc] = useState<LocationData | null>(null);
  const [endLoc, setEndLoc] = useState<LocationData | null>(null);
  const [radarPoints, setRadarPoints] = useState<{dist: number, weather: WeatherData}[]>([]);
  
  // Driving State
  const [isDriving, setIsDriving] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [altitude, setAltitude] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number>(0);
  const [tripTime, setTripTime] = useState("00:00");
  
  const [isLoading, setIsLoading] = useState(false);
  
  // Refs
  const watchIdRef = useRef<number | null>(null);
  const tripStartRef = useRef<number | null>(null);
  const timerRef = useRef<any>(null);

  // --- INIT LOCATION ---
  useEffect(() => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            setStartLoc({ name: addr, lat: pos.coords.latitude, lng: pos.coords.longitude });
            setStartQuery(addr);
        });
    }
  }, []);

  // --- SEARCH ---
  useEffect(() => {
      const q = activeSearchField === 'start' ? startQuery : endQuery;
      if (q.length < 3) { setSearchResults([]); return; }
      const t = setTimeout(async () => setSearchResults(await searchLocation(q)), 400);
      return () => clearTimeout(t);
  }, [startQuery, endQuery]);

  const handleSelectLoc = (loc: LocationData) => {
      if (activeSearchField === 'start') { setStartLoc(loc); setStartQuery(loc.name); }
      else { setEndLoc(loc); setEndQuery(loc.name); }
      setActiveSearchField(null);
      setSearchResults([]);
  };

  const calculateRoute = async (s: LocationData, e: LocationData) => {
      setIsLoading(true);
      try {
          const alts = await getRouteAlternatives(s, e);
          if (alts.length > 0) {
              const route = alts[0];
              const points = sampleRoutePoints(route.coordinates.map(c=>[c[1], c[0]]), 20);
              const weatherData = await Promise.all(points.map(p => getWeatherForPoint(p.coord[0], p.coord[1])));
              setRadarPoints(points.map((p, i) => ({ dist: p.dist, weather: weatherData[i] })));
          } else {
              alert("Rota bulunamadı.");
          }
      } catch (err) { alert("Hata: " + err); } finally { setIsLoading(false); }
  };

  const runDemo = async () => {
      const demoStart: LocationData = { name: "Barbaros, Tekirdağ", lat: 40.9250, lng: 27.4750 };
      const demoEnd: LocationData = { name: "42 Maslak, İstanbul", lat: 41.1141, lng: 29.0235 };
      setStartLoc(demoStart); setStartQuery(demoStart.name);
      setEndLoc(demoEnd); setEndQuery(demoEnd.name);
      await calculateRoute(demoStart, demoEnd);
  };

  // --- ADVANCED GPS LOGIC ---
  const toggleDriveMode = () => {
      if (isDriving) {
          // Stop
          setIsDriving(false);
          if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          setCurrentSpeed(0);
          setAltitude(null);
          setHeading(null);
          setAccuracy(0);
          setTripTime("00:00");
      } else {
          // Start
          setIsDriving(true);
          tripStartRef.current = Date.now();
          
          // Trip Timer
          timerRef.current = setInterval(() => {
              if (tripStartRef.current) {
                  const diff = Math.floor((Date.now() - tripStartRef.current) / 1000);
                  const m = Math.floor(diff / 60).toString().padStart(2, '0');
                  const s = (diff % 60).toString().padStart(2, '0');
                  setTripTime(`${m}:${s}`);
              }
          }, 1000);

          if (navigator.geolocation) {
              watchIdRef.current = navigator.geolocation.watchPosition(
                  pos => {
                      const { speed, altitude, heading, accuracy } = pos.coords;
                      
                      // Speed Smoothing (Weighted Average to reduce jitter)
                      const kmh = speed ? speed * 3.6 : 0;
                      setCurrentSpeed(prev => {
                          // Ignore crazy jumps (e.g. GPS glitch 0 -> 100 instantly without logic)
                          if (Math.abs(kmh - prev) > 40 && prev > 10) return prev; 
                          // Smooth filter
                          return Math.round(prev * 0.6 + kmh * 0.4); 
                      });

                      setAltitude(altitude);
                      setHeading(heading);
                      setAccuracy(accuracy || 0);
                  },
                  err => console.warn("GPS Error", err),
                  { 
                      enableHighAccuracy: true, // Forces GPS chip usage over Wifi triangulation
                      maximumAge: 0, // No cached positions, real-time only
                      timeout: 5000 // Wait 5s for high accuracy lock
                  }
              );
          }
      }
  };

  return (
    <div className="dash-bg w-full h-[100dvh] flex flex-col relative text-slate-100 overflow-hidden font-sans">
      
      {/* 1. COCKPIT HEADER */}
      <DashboardHeader 
        speed={currentSpeed} 
        isDriving={isDriving} 
        onToggleDrive={toggleDriveMode} 
        altitude={altitude}
        heading={heading}
        accuracy={accuracy}
        tripTime={tripTime}
      />

      {/* 2. CONTENT */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
          
          {/* SETUP SCREEN */}
          {radarPoints.length === 0 && (
              <div className="flex-1 flex flex-col justify-center px-6 max-w-lg mx-auto w-full space-y-6 animate-in fade-in zoom-in duration-300">
                   <div className="text-center mb-4">
                       <h1 className="text-3xl font-black italic tracking-tighter text-white drop-shadow-lg">ROTA ANALİZİ</h1>
                       <p className="text-slate-500 text-sm mt-2">Sürüş öncesi asfalt ve hava durumu raporu.</p>
                   </div>

                   <div className="space-y-4">
                       <div className="group relative">
                           <div className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-500"><MapPin /></div>
                           <input 
                              value={startQuery}
                              onChange={e => setStartQuery(e.target.value)}
                              onFocus={() => setActiveSearchField('start')}
                              placeholder="Neredesin?"
                              className="w-full bg-slate-800/80 border-2 border-slate-700 rounded-2xl h-16 pl-14 pr-4 text-lg font-bold text-white focus:border-cyan-500 outline-none transition-all placeholder:text-slate-600"
                           />
                       </div>
                       <div className="group relative">
                           <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500"><Navigation /></div>
                           <input 
                              value={endQuery}
                              onChange={e => setEndQuery(e.target.value)}
                              onFocus={() => setActiveSearchField('end')}
                              placeholder="Hedef neresi?"
                              className="w-full bg-slate-800/80 border-2 border-slate-700 rounded-2xl h-16 pl-14 pr-4 text-lg font-bold text-white focus:border-amber-500 outline-none transition-all placeholder:text-slate-600"
                           />
                       </div>
                       {searchResults.length > 0 && (
                           <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden max-h-48 overflow-y-auto z-50 shadow-2xl">
                               {searchResults.map((r, i) => (
                                   <div key={i} onClick={() => handleSelectLoc(r)} className="p-4 border-b border-slate-700 hover:bg-slate-700 cursor-pointer flex justify-between items-center">
                                       <span className="font-bold text-white">{r.name}</span>
                                       <span className="text-xs text-slate-400">{r.admin1}</span>
                                   </div>
                               ))}
                           </div>
                       )}
                   </div>

                   <div className="pt-4 space-y-3">
                       <button 
                         onClick={() => { if(startLoc && endLoc) calculateRoute(startLoc, endLoc); }}
                         disabled={isLoading || !startLoc || !endLoc}
                         className="w-full h-16 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-black text-xl text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                       >
                           {isLoading ? "ANALİZ YAPILIYOR..." : "HESAPLA"}
                           {!isLoading && <TrendingUp size={24} />}
                       </button>

                       <button onClick={runDemo} disabled={isLoading} className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 font-bold hover:bg-slate-700 hover:text-white transition-all flex items-center justify-center gap-2 text-sm">
                           <FlaskConical size={16} /> TEST ET
                       </button>
                   </div>
              </div>
          )}

          {/* ACTIVE ROUTE SCREEN */}
          {radarPoints.length > 0 && (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <ConditionCard weatherData={radarPoints.map(p => p.weather)} />
                  <div className="mt-6 px-6 pb-2 flex justify-between items-end border-b border-slate-800 mx-4">
                      <h2 className="text-xs font-black text-slate-500 tracking-[0.2em] uppercase">Yol Planı</h2>
                      <button onClick={() => setRadarPoints([])} className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-wider mb-1 px-2 py-1 bg-red-900/10 rounded">
                          Sıfırla
                      </button>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-20 fade-mask">
                      <div className="space-y-0 mt-4">
                          {radarPoints.map((point, i) => (
                              <RoadbookRow key={i} dist={point.dist} weather={point.weather} isLast={i === radarPoints.length - 1} />
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