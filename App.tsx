import React, { useState, useEffect, useRef } from 'react';
import { Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, ArrowUp, Activity, RotateCcw, Mountain, Compass, Navigation, AlertTriangle, Gauge, Droplets, Thermometer, MapPin, Zap, Clock, Umbrella, Download } from 'lucide-react';
import { WeatherData, CoPilotAnalysis } from './types';
import { getWeatherForPoint, reverseGeocode } from './services/api';

// --- UTILS ---
const getWeatherIcon = (code: number, size = 32) => {
    if (code === 0) return <Sun size={size} className="text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]" />;
    if (code <= 3) return <Cloud size={size} className="text-slate-400" />;
    if (code <= 48) return <CloudFog size={size} className="text-slate-500" />;
    if (code <= 67) return <CloudRain size={size} className="text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]" />;
    if (code <= 77) return <Snowflake size={size} className="text-white" />;
    return <CloudRain size={size} className="text-indigo-400" />;
};

const analyzeConditions = (weather: WeatherData | null): CoPilotAnalysis => {
    if (!weather) return { status: 'caution', message: "Veri Bekleniyor...", roadCondition: "Bilinmiyor", color: "text-slate-400" };

    let score = 10;
    let msgs: string[] = [];
    
    // Rain Logic
    if (weather.rainProb > 60 || weather.rain > 1.0) { score -= 5; msgs.push("Islak Zemin"); }
    else if (weather.rainProb > 30) { score -= 2; msgs.push("Yağmur Riski"); }

    // Wind Logic
    if (weather.windSpeed > 40) { score -= 4; msgs.push("Şiddetli Rüzgar"); }
    else if (weather.windSpeed > 25) { score -= 2; msgs.push("Rüzgarlı"); }

    // Temp Logic
    if (weather.temp < 5) { score -= 3; msgs.push("Gizli Buzlanma?"); }
    else if (weather.temp > 35) { score -= 1; msgs.push("Sıcak Asfalt"); }

    if (score >= 9) return { 
        status: 'safe', 
        message: "Koşullar Mükemmel. Gazla.", 
        roadCondition: "Kuru & Yüksek Tutuş", 
        color: "text-emerald-400" 
    };
    
    if (score >= 5) return { 
        status: 'caution', 
        message: msgs.join(", "), 
        roadCondition: "Dikkatli Sür", 
        color: "text-amber-400" 
    };

    return { 
        status: 'danger', 
        message: msgs.join(" + ") || "Tehlikeli Koşullar", 
        roadCondition: "Zemin Riski Yüksek", 
        color: "text-rose-500" 
    };
};

// --- COMPONENTS ---

// 1. Digital Speedometer (Centerpiece - Responsive Size)
const Speedometer = ({ speed }: { speed: number }) => {
    // Dynamic color logic
    let colorClass = "text-white";
    let glowClass = "bg-cyan-500/5";
    
    if (speed > 50) glowClass = "bg-cyan-500/10";
    if (speed > 90) { colorClass = "text-white"; glowClass = "bg-amber-500/10"; }
    if (speed > 130) { colorClass = "text-rose-50 text-shadow-red"; glowClass = "bg-rose-600/20"; }

    return (
        <div className="flex flex-col items-center justify-center relative py-4 transition-colors duration-500 w-full flex-1 min-h-0">
            <div className={`absolute inset-0 blur-[60px] rounded-full transition-all duration-700 ${glowClass}`}></div>
            {/* Responsive Text Size using VH/VW clamps to fit any phone screen */}
            <div className={`font-black italic tracking-tighter leading-none drop-shadow-2xl tabular-nums z-10 transition-colors duration-300 ${colorClass}`} style={{ fontSize: 'clamp(80px, 18vh, 200px)' }}>
                {Math.round(speed)}
            </div>
            <div className="text-xl font-bold text-cyan-500 tracking-[0.3em] mt-0 z-10 opacity-80">KM/H</div>
        </div>
    );
};

// 2. Lean Angle & G-Force Visualizer
const LeanDashboard = ({ angle, maxLeft, maxRight, gForce, onReset }: { angle: number, maxLeft: number, maxRight: number, gForce: number, onReset: () => void }) => {
    const isLeft = angle < 0;
    const absAngle = Math.abs(angle);
    const barWidth = Math.min((absAngle / 50) * 100, 100);
    
    let colorClass = "bg-emerald-500";
    if (absAngle > 30) colorClass = "bg-amber-400";
    if (absAngle > 45) colorClass = "bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.8)]";

    return (
        <div className="w-full px-4 mb-2 shrink-0">
            <div className="flex justify-between items-end mb-2 px-1">
                <div className="text-center w-16">
                    <span className="text-[9px] text-slate-500 font-bold block mb-1">MAX SOL</span>
                    <span className="text-lg font-black text-slate-300 bg-slate-800/50 px-2 py-1 rounded-lg border border-slate-700/50">{Math.round(Math.abs(maxLeft))}°</span>
                </div>
                
                <div className="flex flex-col items-center cursor-pointer active:scale-95 transition-transform" onClick={onReset}>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-white italic tabular-nums">{Math.round(absAngle)}</span>
                        <span className="text-lg text-slate-500 italic">°</span>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded text-[10px] font-bold text-cyan-400 border border-slate-700">
                        <Zap size={10} fill="currentColor" />
                        {gForce.toFixed(1)} G
                    </div>
                </div>

                <div className="text-center w-16">
                    <span className="text-[9px] text-slate-500 font-bold block mb-1">MAX SAĞ</span>
                    <span className="text-lg font-black text-slate-300 bg-slate-800/50 px-2 py-1 rounded-lg border border-slate-700/50">{Math.round(maxRight)}°</span>
                </div>
            </div>
            
            <div className="flex gap-1 h-3 w-full bg-slate-900/50 rounded-full border border-slate-800 p-0.5 backdrop-blur-sm">
                <div className="flex-1 flex justify-end relative overflow-hidden rounded-l-full bg-slate-800/30">
                    <div className={`h-full transition-all duration-100 ease-out ${isLeft ? colorClass : 'bg-transparent'}`} style={{ width: isLeft ? `${barWidth}%` : '0%' }}></div>
                </div>
                <div className="w-0.5 bg-slate-600 h-full rounded-full opacity-50"></div>
                <div className="flex-1 flex justify-start relative overflow-hidden rounded-r-full bg-slate-800/30">
                     <div className={`h-full transition-all duration-100 ease-out ${!isLeft ? colorClass : 'bg-transparent'}`} style={{ width: !isLeft ? `${barWidth}%` : '0%' }}></div>
                </div>
            </div>
        </div>
    );
};

// 3. Environment Grid
const EnvGrid = ({ weather, analysis }: { weather: WeatherData | null, analysis: CoPilotAnalysis }) => {
    const rainWarning = weather && (weather.rainProb > 20 || weather.rain > 0.1);

    return (
        <div className="flex flex-col px-4 w-full mb-4 gap-2 shrink-0">
            {rainWarning && (
                <div className="w-full bg-cyan-900/40 border border-cyan-500/50 rounded-xl p-2 flex items-center justify-center gap-2 animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                    <Umbrella className="text-cyan-400 animate-bounce" size={20} />
                    <div className="text-center leading-none">
                        <div className="text-cyan-300 font-black tracking-widest text-sm">YAĞMUR BEKLENİYOR</div>
                        <div className="text-cyan-200/70 text-[9px] font-bold mt-0.5">EN YAKIN İSTASYONDA %{weather?.rainProb} İHTİMAL</div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-2 h-auto">
                {/* Weather Card */}
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-3 flex flex-col justify-between relative overflow-hidden shadow-lg h-28">
                    <div className="absolute top-2 right-2 opacity-30">{weather ? getWeatherIcon(weather.weatherCode, 28) : <Activity />}</div>
                    <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">SICAKLIK</span>
                        <div className="flex items-baseline gap-1 mt-0">
                            <span className="text-4xl font-black text-white tracking-tighter leading-none">{weather ? Math.round(weather.temp) : '--'}°</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                             <span className="text-[9px] font-bold text-slate-400">HİSSEDİLEN:</span>
                             <span className="text-sm font-bold text-cyan-400">{weather ? Math.round(weather.feelsLike) : '--'}°</span>
                        </div>
                    </div>
                    <div className="border-t border-slate-800/50 pt-1 mt-1">
                         <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase"><Wind size={10}/> RÜZGAR</div>
                         <div className="flex items-end gap-1">
                            <span className="text-xl font-black text-white leading-none">{weather ? Math.round(weather.windSpeed) : '-'}</span>
                            <span className="text-[9px] font-bold text-slate-400">KM/S</span>
                         </div>
                    </div>
                </div>

                {/* Analysis Card */}
                <div className={`bg-[#111827] border rounded-xl p-3 flex flex-col relative overflow-hidden shadow-lg transition-colors duration-500 h-28 ${analysis.status === 'danger' ? 'border-rose-900/50 bg-rose-900/10' : analysis.status === 'caution' ? 'border-amber-900/50 bg-amber-900/10' : 'border-slate-800'}`}>
                    <div className={`absolute -right-4 -top-4 w-16 h-16 blur-2xl rounded-full opacity-30 ${analysis.status === 'safe' ? 'bg-emerald-500' : analysis.status === 'danger' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">CO-PILOT</span>
                    <div className="flex-1 flex flex-col justify-center">
                        <div className={`text-lg font-black leading-tight italic ${analysis.color} line-clamp-2`}>{analysis.roadCondition}</div>
                        <div className="text-[9px] font-bold text-slate-400 mt-1 leading-tight opacity-90 line-clamp-2">{analysis.message}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 4. Footer Telemetry
const FooterTelemetry = ({ heading, altitude, locationName, accuracy }: any) => {
    const directions = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
    const compassDir = heading !== null ? directions[Math.round(heading / 45) % 8] : '--';

    return (
        <div className="w-full bg-[#0f1523] border-t border-slate-800 pt-3 pb-6 px-4 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20 mt-auto shrink-0">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700 shadow-inner">
                        <Navigation size={14} style={{ transform: `rotate(${heading || 0}deg)` }} className="text-cyan-500" />
                    </div>
                    <div>
                        <div className="text-lg font-black text-white leading-none">{compassDir}</div>
                        <div className="text-[8px] text-slate-500 font-bold mt-0.5">{Math.round(heading || 0)}° PUSULA</div>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 text-slate-400">
                        <span className="text-xl font-black text-white tabular-nums">{altitude ? Math.round(altitude) : 0}</span>
                        <span className="text-[8px] font-bold mt-1">METRE</span>
                    </div>
                    <div className="text-[8px] text-slate-600 font-bold">GPS ±{Math.round(accuracy)}m</div>
                </div>
            </div>
            <div className="flex items-center gap-1.5 opacity-60 bg-slate-800/30 p-1.5 rounded-lg border border-slate-800">
                <MapPin size={10} className="text-cyan-500 shrink-0" />
                <span className="text-[10px] font-bold text-slate-300 truncate">{locationName || "Konum Aranıyor..."}</span>
            </div>
        </div>
    );
};

const DigitalClock = () => {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="text-lg font-black text-white tracking-widest tabular-nums font-mono leading-none">
            {time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </div>
    );
};

const App: React.FC = () => {
  // Telemetry State
  const [speed, setSpeed] = useState(0);
  const [leanAngle, setLeanAngle] = useState(0);
  const [gForce, setGForce] = useState(0);
  const [maxLeft, setMaxLeft] = useState(0);
  const [maxRight, setMaxRight] = useState(0);
  const [heading, setHeading] = useState<number | null>(0);
  const [altitude, setAltitude] = useState<number | null>(0);
  const [accuracy, setAccuracy] = useState(0);
  
  // Environment State
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState<string>("");
  const [analysis, setAnalysis] = useState<CoPilotAnalysis>(analyzeConditions(null));
  const [gpsStatus, setGpsStatus] = useState<'searching' | 'ok' | 'error'>('searching');

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Wake Lock Ref
  const wakeLockRef = useRef<any>(null);
  const lastLocationUpdate = useRef<number>(0);

  // --- PWA INSTALL PROMPT HANDLER ---
  useEffect(() => {
      const handler = (e: any) => {
          e.preventDefault();
          setDeferredPrompt(e);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = () => {
      if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult: any) => {
              if (choiceResult.outcome === 'accepted') {
                  console.log('User accepted the install prompt');
              } else {
                  console.log('User dismissed the install prompt');
              }
              setDeferredPrompt(null);
          });
      }
  };

  // --- WAKE LOCK ---
  useEffect(() => {
    const requestWakeLock = async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            } catch (err: any) {
                if (err.name !== 'NotAllowedError') console.warn('Wake Lock failed:', err);
            }
        }
    };
    requestWakeLock();
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // --- SENSORS SETUP ---
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
        let raw = e.gamma || 0;
        if (raw > 90) raw = 90; if (raw < -90) raw = -90;
        setLeanAngle(prev => {
            const next = prev * 0.8 + raw * 0.2;
            if (next < maxLeft) setMaxLeft(next);
            if (next > maxRight) setMaxRight(next);
            return next;
        });
    };

    const handleMotion = (e: DeviceMotionEvent) => {
        if (e.acceleration) {
            const x = e.acceleration.x || 0;
            const y = e.acceleration.y || 0;
            const z = e.acceleration.z || 0;
            const totalAccel = Math.sqrt(x*x + y*y + z*z);
            setGForce(Math.abs(totalAccel / 9.8)); 
        }
    };

    const requestSensors = async () => {
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            try {
                const response = await (DeviceOrientationEvent as any).requestPermission();
                if (response === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation);
                    window.addEventListener('devicemotion', handleMotion);
                }
            } catch (e) { console.error(e); }
        } else {
            window.addEventListener('deviceorientation', handleOrientation);
            window.addEventListener('devicemotion', handleMotion);
        }
    };
    requestSensors();

    let watchId: number;
    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
            async (pos) => {
                setGpsStatus('ok');
                const { speed: spd, heading: hdg, altitude: alt, accuracy: acc, latitude, longitude } = pos.coords;
                const kmh = spd ? spd * 3.6 : 0;
                setSpeed(kmh < 2 ? 0 : kmh);
                setHeading(hdg);
                setAltitude(alt);
                setAccuracy(acc || 0);

                const now = Date.now();
                if (now - lastLocationUpdate.current > 300000) { 
                    lastLocationUpdate.current = now;
                    const [w, addr] = await Promise.all([
                        getWeatherForPoint(latitude, longitude),
                        reverseGeocode(latitude, longitude)
                    ]);
                    setWeather(w);
                    setLocationName(addr);
                    setAnalysis(analyzeConditions(w));
                }
            },
            (err) => {
                console.warn("GPS Error", err);
                setGpsStatus('error');
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    }

    return () => {
        window.removeEventListener('deviceorientation', handleOrientation);
        window.removeEventListener('devicemotion', handleMotion);
        if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const resetMaxLean = () => {
      setMaxLeft(0);
      setMaxRight(0);
  };

  return (
    <div className="dash-bg w-full h-[100dvh] flex flex-col relative text-slate-100 overflow-hidden font-sans select-none">
        
        {/* TOP BAR */}
        <div className="flex justify-between items-start px-4 pt-4 pb-2 z-20 shrink-0">
             <div className="flex items-center gap-3">
                 <div className={`w-2 h-2 rounded-full ${gpsStatus === 'ok' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 animate-pulse'}`}></div>
                 
                 {/* INSTALL BUTTON (Only shows if installable) */}
                 {deferredPrompt && (
                     <button 
                        onClick={handleInstallClick}
                        className="flex items-center gap-2 bg-cyan-600/20 border border-cyan-500/50 text-cyan-400 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse hover:bg-cyan-600/40 transition-colors"
                     >
                        <Download size={14} />
                        UYGULAMAYI YÜKLE
                     </button>
                 )}
                 {!deferredPrompt && (
                     <span className="text-[10px] font-bold text-slate-600 tracking-widest">MOTO ROTA</span>
                 )}
             </div>
             
             {/* Clock */}
             <div className="flex flex-col items-end">
                <DigitalClock />
             </div>
        </div>

        {/* MAIN DISPLAY - FLEX GROW TO FILL SPACE */}
        <div className="flex-1 flex flex-col justify-evenly items-center relative z-10 w-full min-h-0">
             <Speedometer speed={speed} />
             <LeanDashboard 
                angle={leanAngle} 
                maxLeft={maxLeft} 
                maxRight={maxRight}
                gForce={gForce}
                onReset={resetMaxLean}
             />
        </div>

        {/* INFO CLUSTER */}
        <EnvGrid weather={weather} analysis={analysis} />

        {/* FOOTER */}
        <FooterTelemetry heading={heading} altitude={altitude} locationName={locationName} accuracy={accuracy} />

    </div>
  );
};

export default App;