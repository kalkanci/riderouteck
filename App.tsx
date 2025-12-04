import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, ArrowUp, Zap, Droplets, Gauge, Thermometer, TrendingUp, ShieldCheck, Mountain, Compass, Timer, Activity, Locate, RotateCcw, Crosshair } from 'lucide-react';
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

// --- NEW COMPONENT: LEAN ANGLE GAUGE ---
const LeanGauge = ({ angle, maxLeft, maxRight }: { angle: number, maxLeft: number, maxRight: number }) => {
    // angle: negative is left, positive is right (usually)
    // We visualize it as a curved bar or rotating element
    
    // Clamp visual angle to avoid UI breaking (max 60 degrees usually for street bikes)
    const visualAngle = Math.max(-55, Math.min(55, angle));

    return (
        <div className="relative flex flex-col items-center justify-center w-full h-24 mt-2">
             {/* Background Arc */}
             <div className="absolute top-4 w-48 h-24 border-t-[6px] border-r-[6px] border-l-[6px] border-slate-800 rounded-t-full"></div>
             
             {/* Tick Marks */}
             <div className="absolute top-4 w-48 h-24 rounded-t-full overflow-hidden opacity-30">
                 <div className="absolute top-0 left-1/2 w-0.5 h-3 bg-white -translate-x-1/2"></div> {/* 0 */}
                 <div className="absolute top-2 left-[20%] w-0.5 h-2 bg-white -rotate-45 origin-bottom"></div> {/* Left 45 */}
                 <div className="absolute top-2 right-[20%] w-0.5 h-2 bg-white rotate-45 origin-bottom"></div> {/* Right 45 */}
             </div>

             {/* Dynamic Needle / Bike Indicator */}
             <div 
                className="absolute top-6 w-1 h-16 origin-bottom transition-transform duration-100 ease-out z-10"
                style={{ transform: `rotate(${visualAngle}deg)` }}
             >
                 <div className="w-full h-full bg-gradient-to-t from-transparent via-cyan-500 to-cyan-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>
                 {/* Bike Icon at tip */}
                 <div className="absolute -top-4 -left-3 text-cyan-400 transform -rotate-180">
                     <Navigation size={28} fill="currentColor" />
                 </div>
             </div>

             {/* Digital Readout */}
             <div className="absolute -bottom-2 flex justify-between w-full px-8 text-xs font-bold font-mono">
                 <div className="text-left">
                     <div className="text-slate-500 text-[9px]">MAX L</div>
                     <div className="text-emerald-400">{Math.round(maxLeft)}°</div>
                 </div>
                 
                 <div className="text-center z-20 bg-[#0b0f19] px-2 -mt-4">
                      <div className="text-2xl font-black text-white">{Math.abs(Math.round(angle))}°</div>
                 </div>

                 <div className="text-right">
                     <div className="text-slate-500 text-[9px]">MAX R</div>
                     <div className="text-emerald-400">{Math.round(maxRight)}°</div>
                 </div>
             </div>
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
    tripTime,
    leanAngle,
    maxLean
}: { 
    speed: number, 
    isDriving: boolean, 
    onToggleDrive: () => void,
    altitude: number | null,
    heading: number | null,
    accuracy: number,
    tripTime: string,
    leanAngle: number,
    maxLean: { left: number, right: number }
}) => (
    <div className="flex-none bg-[#0b0f19] border-b border-slate-800 pb-2 pt-4 px-4 z-50 shadow-2xl relative overflow-hidden">
        {/* Ambient Glow */}
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-1/2 bg-cyan-500/10 blur-3xl rounded-full transition-opacity duration-700 ${isDriving ? 'opacity-100' : 'opacity-0'}`}></div>

        <div className="grid grid-cols-3 gap-2 relative z-10 items-start">
            
            {/* LEFT: SPEED */}
            <div className="col-span-1 flex flex-col justify-start pt-2">
                <div className="flex items-baseline">
                    <span className="text-6xl font-black text-white leading-none tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                        {speed}
                    </span>
                </div>
                <div className="text-xs font-black text-cyan-500 tracking-widest mt-1">KM/H</div>
                
                <div className="mt-4 flex flex-col space-y-1">
                     <div className="flex items-center gap-2 text-slate-400">
                        <Mountain size={14} className={altitude && altitude > 500 ? "text-amber-400" : "text-slate-500"} />
                        <span className="text-xs font-bold font-mono text-white">{altitude ? Math.round(altitude) : '0'}m</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                        <Compass size={14} style={{ transform: `rotate(${heading || 0}deg)` }} className="text-cyan-500 transition-transform duration-500" />
                        <span className="text-xs font-bold font-mono text-white">{heading ? Math.round(heading) : '0'}°</span>
                    </div>
                </div>
            </div>

            {/* CENTER: LEAN ANGLE (NEW) */}
            <div className="col-span-1 flex justify-center">
                <LeanGauge angle={leanAngle} maxLeft={maxLean.left} maxRight={maxLean.right} />
            </div>

            {/* RIGHT: CONTROLS */}
            <div className="col-span-1 flex flex-col items-end gap-3 pt-1">
                 <div className="flex items-center gap-2 bg-slate-900/80 p-1 pr-2 pl-2 rounded-full border border-slate-800">
                     <div className="flex flex-col items-end">
                         <div className="flex gap-0.5 h-2">
                             {[1,2,3,4].map(b => (
                                 <div key={b} className={`w-1 rounded-sm ${accuracy > 0 && accuracy <= (50/b) ? 'bg-emerald-400' : 'bg-slate-700'}`}></div>
                             ))}
                         </div>
                     </div>
                     <div className={`w-2 h-2 rounded-full ${isDriving ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`}></div>
                 </div>

                 <button 
                    onClick={onToggleDrive} 
                    className={`h-14 w-full rounded-2xl flex flex-col items-center justify-center transition-all font-bold tracking-wide shadow-lg ${
                        isDriving 
                        ? 'bg-red-500/10 border border-red-500/50 text-red-500 active:bg-red-500/20' 
                        : 'bg-cyan-500 text-slate-900 hover:bg-cyan-400 active:scale-95 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                    }`}
                >
                    {isDriving ? (
                        <>
                           <span className="text-lg font-mono leading-none">{tripTime}</span>
                           <span className="text-[9px] opacity-70">DURDUR</span>
                        </>
                    ) : (
                        <>
                           <Zap size={20} fill="currentColor" className="mb-1" />
                           <span className="text-[10px] leading-none">BAŞLA</span>
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

const RoadbookRow = ({ dist, weather, isLast }: { dist: number, weather: WeatherData, isLast: boolean }) => {
    const isWet = weather.rainProb > 40 || weather.rain > 0.5;
    return (
        <div className="flex gap-4 relative pl-4 pr-4">
            <div className="absolute left-[5.5rem] top-0 bottom-0 w-0.5 bg-slate-800 -z-10"></div>
            <div className="w-16 py-4 flex flex-col items-center justify-center shrink-0 z-10 bg-[#0b0f19] my-2">
                 <div className="text-xl font-black text-white font-mono">{dist}</div>
                 <div className="text-[9px] text-slate-500 font-bold">KM</div>
            </div>
            <div className={`w-3 h-3 rounded-full mt-7 ml-[0.35rem] shrink-0 border-2 border-[#0b0f19] z-20 ${isWet ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'bg-slate-600'}`}></div>
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
  
  // Sensor State
  const [leanAngle, setLeanAngle] = useState(0);
  const [maxLean, setMaxLean] = useState({ left: 0, right: 0 });
  
  const [isLoading, setIsLoading] = useState(false);
  
  // Refs
  const watchIdRef = useRef<number | null>(null);
  const tripStartRef = useRef<number | null>(null);
  const timerRef = useRef<any>(null);

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

  // --- LOCATION HELPER ---
  const handleUseCurrentLocation = (field: 'start' | 'end') => {
      if (!navigator.geolocation) { alert("GPS desteklenmiyor."); return; }
      
      setIsLoading(true);
      navigator.geolocation.getCurrentPosition(async (pos) => {
          try {
            const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            const loc = { name: addr, lat: pos.coords.latitude, lng: pos.coords.longitude };
            
            if (field === 'start') { setStartLoc(loc); setStartQuery(addr); }
            else { setEndLoc(loc); setEndQuery(addr); }
          } catch(e) { alert("Konum alınamadı"); }
          finally { setIsLoading(false); }
      }, (err) => {
          setIsLoading(false);
          alert("Konum izni verilmeli.");
      });
  };

  // --- SENSORS & GPS ---
  
  // Orientation Handler
  const handleOrientation = (event: DeviceOrientationEvent) => {
      // Gamma is usually Left/Right tilt (-90 to 90) in Landscape/Portrait
      // We assume standard landscape mounting for now or portrait. 
      // Gamma is left/right tilt around Y axis.
      let angle = event.gamma || 0;
      
      // Simple smoothing could be added here, but direct feed is responsive
      // Clamp for UI safety
      if (angle > 90) angle = 90;
      if (angle < -90) angle = -90;

      setLeanAngle(angle);

      // Track Max
      setMaxLean(prev => ({
          left: angle < 0 ? Math.max(prev.left, Math.abs(angle)) : prev.left,
          right: angle > 0 ? Math.max(prev.right, angle) : prev.right
      }));
  };

  const toggleDriveMode = () => {
      if (isDriving) {
          // Stop
          setIsDriving(false);
          if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          window.removeEventListener('deviceorientation', handleOrientation);
          
          setCurrentSpeed(0);
          setAltitude(null);
          setHeading(null);
          setAccuracy(0);
          setTripTime("00:00");
      } else {
          // Start
          // Request Sensor Permissions (iOS 13+)
          if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
              (DeviceOrientationEvent as any).requestPermission()
                  .then((permissionState: string) => {
                      if (permissionState === 'granted') {
                          window.addEventListener('deviceorientation', handleOrientation);
                      }
                  })
                  .catch(console.error);
          } else {
              // Non-iOS 13+ devices
              window.addEventListener('deviceorientation', handleOrientation);
          }

          setIsDriving(true);
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
              watchIdRef.current = navigator.geolocation.watchPosition(
                  pos => {
                      const { speed, altitude, heading, accuracy } = pos.coords;
                      const kmh = speed ? speed * 3.6 : 0;
                      setCurrentSpeed(prev => {
                          if (Math.abs(kmh - prev) > 40 && prev > 10) return prev; 
                          return Math.round(prev * 0.6 + kmh * 0.4); 
                      });
                      setAltitude(altitude);
                      setHeading(heading);
                      setAccuracy(accuracy || 0);
                  },
                  err => console.warn("GPS Error", err),
                  { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
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
        leanAngle={leanAngle}
        maxLean={maxLean}
      />

      {/* 2. CONTENT */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
          
          {/* SETUP SCREEN */}
          {radarPoints.length === 0 && (
              <div className="flex-1 flex flex-col justify-center px-6 max-w-lg mx-auto w-full space-y-6 animate-in fade-in zoom-in duration-300">
                   <div className="text-center mb-4">
                       <h1 className="text-3xl font-black italic tracking-tighter text-white drop-shadow-lg">ROTA ANALİZİ</h1>
                       <p className="text-slate-500 text-sm mt-2">Mekan, AVM veya Şehir arayın.</p>
                   </div>

                   <div className="space-y-4">
                       {/* START INPUT */}
                       <div className="group relative">
                           <div className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-500"><MapPin /></div>
                           <input 
                              value={startQuery}
                              onChange={e => setStartQuery(e.target.value)}
                              onFocus={() => setActiveSearchField('start')}
                              placeholder="Çıkış noktası..."
                              className="w-full bg-slate-800/80 border-2 border-slate-700 rounded-2xl h-16 pl-14 pr-14 text-lg font-bold text-white focus:border-cyan-500 outline-none transition-all placeholder:text-slate-600"
                           />
                           <button onClick={() => handleUseCurrentLocation('start')} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-700/50 hover:bg-cyan-500 text-slate-300 hover:text-white transition-all">
                               <Crosshair size={20} />
                           </button>
                       </div>

                       {/* END INPUT */}
                       <div className="group relative">
                           <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500"><Navigation /></div>
                           <input 
                              value={endQuery}
                              onChange={e => setEndQuery(e.target.value)}
                              onFocus={() => setActiveSearchField('end')}
                              placeholder="Hedef (Örn: Starbucks, Bodrum)"
                              className="w-full bg-slate-800/80 border-2 border-slate-700 rounded-2xl h-16 pl-14 pr-14 text-lg font-bold text-white focus:border-amber-500 outline-none transition-all placeholder:text-slate-600"
                           />
                           <button onClick={() => handleUseCurrentLocation('end')} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-700/50 hover:bg-amber-500 text-slate-300 hover:text-white transition-all">
                               <Crosshair size={20} />
                           </button>
                       </div>

                       {searchResults.length > 0 && (
                           <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden max-h-48 overflow-y-auto z-50 shadow-2xl">
                               {searchResults.map((r, i) => (
                                   <div key={i} onClick={() => handleSelectLoc(r)} className="p-4 border-b border-slate-700 hover:bg-slate-700 cursor-pointer flex justify-between items-center">
                                       <span className="font-bold text-white truncate max-w-[70%]">{r.name}</span>
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
                           {isLoading ? "ANALİZ YAPILIYOR..." : "ROTAYI HESAPLA"}
                           {!isLoading && <TrendingUp size={24} />}
                       </button>
                   </div>
              </div>
          )}

          {/* ACTIVE ROUTE SCREEN */}
          {radarPoints.length > 0 && (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <ConditionCard weatherData={radarPoints.map(p => p.weather)} />
                  <div className="mt-4 px-6 pb-2 flex justify-between items-end border-b border-slate-800 mx-4">
                      <h2 className="text-xs font-black text-slate-500 tracking-[0.2em] uppercase">Yol Planı</h2>
                      <button onClick={() => { setRadarPoints([]); setLeanAngle(0); setMaxLean({left:0, right:0}); }} className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-wider mb-1 px-2 py-1 bg-red-900/10 rounded flex items-center gap-1">
                          <RotateCcw size={10} /> Çıkış
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