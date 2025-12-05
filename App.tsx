import React, { useState, useEffect, useRef } from 'react';
import { Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, ArrowUp, Activity, RotateCcw, Mountain, Compass, Navigation, AlertTriangle, Gauge, Droplets, Thermometer, MapPin, Zap, Clock, Umbrella, Download, Settings, RefreshCw, CheckCircle2 } from 'lucide-react';
import { WeatherData, CoPilotAnalysis } from './types';
import { getWeatherForPoint, reverseGeocode } from './services/api';

// --- MATH UTILS ---
const toRad = (deg: number) => deg * Math.PI / 180;

// Calculates the "Apparent Wind"
const calculateApparentWind = (
    bikeSpeedKmh: number, 
    bikeHeading: number, 
    windSpeedKmh: number, 
    windDirectionFrom: number
): number => {
    if (bikeSpeedKmh < 5) return windSpeedKmh;

    const inducedFlowDir = bikeHeading + 180;
    const inducedX = bikeSpeedKmh * Math.sin(toRad(inducedFlowDir));
    const inducedY = bikeSpeedKmh * Math.cos(toRad(inducedFlowDir));

    const trueFlowDir = windDirectionFrom + 180;
    const trueX = windSpeedKmh * Math.sin(toRad(trueFlowDir));
    const trueY = windSpeedKmh * Math.cos(toRad(trueFlowDir));

    const resX = inducedX + trueX;
    const resY = inducedY + trueY;

    const apparentSpeed = Math.sqrt(resX * resX + resY * resY);
    
    return Math.round(apparentSpeed);
};

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
    
    if (weather.rainProb > 60 || weather.rain > 1.0) { score -= 5; msgs.push("Islak Zemin"); }
    else if (weather.rainProb > 30) { score -= 2; msgs.push("Yağmur Riski"); }

    if (weather.windSpeed > 40) { score -= 4; msgs.push("Şiddetli Rüzgar"); }
    else if (weather.windSpeed > 25) { score -= 2; msgs.push("Rüzgarlı"); }

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

const Speedometer = ({ speed }: { speed: number }) => {
    let colorClass = "text-white";
    let glowClass = "bg-cyan-500/5";
    
    if (speed > 50) glowClass = "bg-cyan-500/10";
    if (speed > 90) { colorClass = "text-white"; glowClass = "bg-amber-500/10"; }
    if (speed > 130) { colorClass = "text-rose-50 text-shadow-red"; glowClass = "bg-rose-600/20"; }

    return (
        <div className="flex flex-col items-center justify-center relative py-6 transition-colors duration-500">
            <div className={`absolute inset-0 blur-[80px] rounded-full transition-all duration-700 ${glowClass}`}></div>
            <div className={`text-8xl sm:text-[9rem] font-black italic tracking-tighter leading-none drop-shadow-2xl tabular-nums z-10 transition-colors duration-300 ${colorClass}`}>
                {Math.round(speed)}
            </div>
            <div className="text-xl font-bold text-cyan-500 tracking-[0.3em] mt-0 z-10 opacity-80">KM/H</div>
        </div>
    );
};

const LeanDashboard = ({ angle, maxLeft, maxRight, gForce, onReset }: { angle: number, maxLeft: number, maxRight: number, gForce: number, onReset: () => void }) => {
    const isLeft = angle < 0;
    const absAngle = Math.abs(angle);
    const barWidth = Math.min((absAngle / 50) * 100, 100);
    
    let colorClass = "bg-emerald-500";
    if (absAngle > 30) colorClass = "bg-amber-400";
    if (absAngle > 45) colorClass = "bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.8)]";

    return (
        <div className="w-full px-6 mb-4">
            <div className="flex justify-between items-end mb-3 px-2">
                <div className="text-center w-20">
                    <span className="text-[9px] text-slate-500 font-bold block mb-1">MAX SOL</span>
                    <span className="text-xl font-black text-slate-300 bg-slate-800/50 px-3 py-1 rounded-lg border border-slate-700/50">{Math.round(Math.abs(maxLeft))}°</span>
                </div>
                
                <div className="flex flex-col items-center cursor-pointer active:scale-95 transition-transform" onClick={onReset}>
                    <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black text-white italic tabular-nums">{Math.round(absAngle)}</span>
                        <span className="text-xl text-slate-500 italic">°</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded text-[10px] font-bold text-cyan-400 border border-slate-700">
                        <Zap size={10} fill="currentColor" />
                        {gForce.toFixed(1)} G
                    </div>
                </div>

                <div className="text-center w-20">
                    <span className="text-[9px] text-slate-500 font-bold block mb-1">MAX SAĞ</span>
                    <span className="text-xl font-black text-slate-300 bg-slate-800/50 px-3 py-1 rounded-lg border border-slate-700/50">{Math.round(maxRight)}°</span>
                </div>
            </div>
            
            <div className="flex gap-1 h-5 w-full bg-slate-900/50 rounded-full border border-slate-800 p-1 backdrop-blur-sm">
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

const EnvGrid = ({ weather, analysis, bikeSpeed, bikeHeading }: { weather: WeatherData | null, analysis: CoPilotAnalysis, bikeSpeed: number, bikeHeading: number }) => {
    const rainWarning = weather && (weather.rainProb > 20 || weather.rain > 0.1);
    
    // Calculate Apparent Wind
    const apparentWind = weather 
        ? calculateApparentWind(bikeSpeed, bikeHeading, weather.windSpeed, weather.windDirection) 
        : 0;
    
    const isMoving = bikeSpeed > 10;

    return (
        <div className="flex flex-col px-4 w-full mb-6 gap-3">
            
            {rainWarning && (
                <div className="w-full bg-cyan-900/40 border border-cyan-500/50 rounded-xl p-3 flex items-center justify-center gap-3 animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                    <Umbrella className="text-cyan-400 animate-bounce" size={24} />
                    <div className="text-center">
                        <div className="text-cyan-300 font-black tracking-widest text-lg leading-none">YAĞMUR BEKLENİYOR</div>
                        <div className="text-cyan-200/70 text-[10px] font-bold">EN YAKIN İSTASYONDA %{weather?.rainProb} İHTİMAL</div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 flex flex-col relative overflow-hidden shadow-lg h-full">
                    <div className="absolute top-2 right-2 opacity-30">{weather ? getWeatherIcon(weather.weatherCode, 32) : <Activity />}</div>
                    
                    <div className="flex-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">SICAKLIK</span>
                        <div className="flex items-baseline gap-2 mt-0">
                            <span className="text-5xl font-black text-white tracking-tighter leading-none">{weather ? Math.round(weather.temp) : '--'}°</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                             <span className="text-[10px] font-bold text-slate-400">HİSSEDİLEN:</span>
                             <span className="text-xl font-bold text-cyan-400">{weather ? Math.round(weather.feelsLike) : '--'}°</span>
                        </div>
                    </div>

                    <div className="mt-3 border-t border-slate-800/50 pt-2">
                        <div className="flex justify-between items-end">
                            <div>
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Wind size={10}/> RÜZGAR</span>
                                <div className="flex items-end gap-1">
                                    <span className="text-2xl font-black text-white leading-none">{weather ? Math.round(weather.windSpeed) : '-'}</span>
                                    <span className="text-[9px] font-bold text-slate-400 mb-1">METEO</span>
                                </div>
                            </div>
                            <div className={`text-right ${isMoving ? 'opacity-100' : 'opacity-40'} transition-opacity duration-500`}>
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">BAĞIL</span>
                                <div className="flex items-end gap-1 justify-end">
                                    <span className={`text-3xl font-black leading-none ${apparentWind > 50 ? 'text-rose-500' : 'text-cyan-400'}`}>
                                        {apparentWind}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400 mb-1">KM/S</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`bg-[#111827] border rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden shadow-lg transition-colors duration-500 h-full ${analysis.status === 'danger' ? 'border-rose-900/50 bg-rose-900/10' : analysis.status === 'caution' ? 'border-amber-900/50 bg-amber-900/10' : 'border-slate-800'}`}>
                    <div className={`absolute -right-4 -top-4 w-20 h-20 blur-2xl rounded-full opacity-30 ${analysis.status === 'safe' ? 'bg-emerald-500' : analysis.status === 'danger' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">CO-PILOT</span>
                    <div className="mt-1 z-10 relative flex-1 flex flex-col justify-center">
                        <div className={`text-xl font-black leading-tight italic ${analysis.color}`}>{analysis.roadCondition}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-2 leading-tight opacity-90">{analysis.message}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 4. Footer Telemetry & Calibration
const FooterTelemetry = ({ heading, altitude, locationName, accuracy, isGpsHeading, onOpenCalibration }: any) => {
    const directions = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
    const compassDir = heading !== null ? directions[Math.round(heading / 45) % 8] : '--';

    return (
        <div className="w-full bg-[#0f1523] border-t border-slate-800 pt-4 pb-8 px-6 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20 shrink-0">
            <div className="flex items-center justify-between mb-3">
                {/* Compass & Heading */}
                <div className="flex items-center gap-3 active:scale-95 transition-transform cursor-pointer" onClick={onOpenCalibration}>
                    <div 
                        className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700 shadow-inner relative"
                    >
                        {/* Source Indicator Dot */}
                        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#0f1523] ${isGpsHeading ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                        <Navigation size={18} style={{ transform: `rotate(${heading || 0}deg)` }} className={isGpsHeading ? "text-cyan-500" : "text-amber-400"} />
                    </div>
                    <div>
                        <div className="text-xl font-black text-white leading-none flex items-center gap-2">
                            {compassDir}
                            <Settings size={14} className="text-slate-600" />
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold mt-0.5">
                            {Math.round(heading || 0)}° {isGpsHeading ? 'GPS' : 'MANYETİK'}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 text-slate-400">
                        <span className="text-2xl font-black text-white tabular-nums">{altitude ? Math.round(altitude) : 0}</span>
                        <span className="text-[10px] font-bold mt-1.5">METRE</span>
                    </div>
                    <div className="text-[9px] text-slate-600 font-bold">GPS ±{Math.round(accuracy)}m</div>
                </div>
            </div>
            <div className="flex items-center gap-2 opacity-60 bg-slate-800/30 p-2 rounded-lg border border-slate-800">
                <MapPin size={12} className="text-cyan-500 shrink-0" />
                <span className="text-xs font-bold text-slate-300 truncate">{locationName || "Konum Bekleniyor..."}</span>
            </div>
        </div>
    );
};

// 5. AUTO Calibration Modal (Replaced manual slider)
const CalibrationModal = ({ isOpen, onClose, offset }: any) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
                <div className="text-center mb-6">
                    <RefreshCw className="w-12 h-12 text-cyan-500 mx-auto mb-2 animate-spin-slow" />
                    <h2 className="text-xl font-black text-white">Akıllı Kalibrasyon</h2>
                </div>
                
                <div className="space-y-4 text-sm text-slate-300">
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                        <div className="flex items-center gap-2 mb-2 text-cyan-400 font-bold">
                            <Activity size={16} />
                            <span>Nasıl Çalışır?</span>
                        </div>
                        <p className="text-xs leading-relaxed opacity-80">
                            Uygulama, sürüş sırasında (20 km/s üzeri) GPS uydusundan alınan kesin yönü, telefonunun pusulası ile karşılaştırır. Aradaki farkı öğrenir ve durduğunda otomatik olarak uygular.
                        </p>
                    </div>

                    <div className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
                         <span className="text-xs font-bold text-slate-500">MEVCUT SAPMA</span>
                         <span className="text-xl font-black text-white">{offset}°</span>
                    </div>
                    
                    <div className="flex items-center gap-3 text-xs text-amber-500 bg-amber-900/10 p-3 rounded-lg border border-amber-900/30">
                        <AlertTriangle size={16} className="shrink-0" />
                        <span>Kalibre etmek için düz bir yolda 20 km/s üzerine çıkman yeterli.</span>
                    </div>
                </div>

                <div className="mt-6">
                    <button 
                        onClick={onClose}
                        className="w-full py-3 bg-cyan-600 text-white font-bold rounded-xl text-sm active:bg-cyan-700 shadow-[0_0_15px_rgba(8,145,178,0.4)]"
                    >
                        Tamam
                    </button>
                </div>
            </div>
        </div>
    );
}

const DigitalClock = () => {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="text-xl font-black text-white tracking-widest tabular-nums font-mono">
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
  
  // Heading State
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number>(0);
  const [compassOffset, setCompassOffset] = useState<number>(() => {
      const saved = localStorage.getItem('compassOffset');
      return saved ? parseInt(saved) : 0;
  });
  
  // Altitude & GPS
  const [altitude, setAltitude] = useState<number | null>(0);
  const [accuracy, setAccuracy] = useState(0);
  
  // Environment State
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState<string>("");
  const [analysis, setAnalysis] = useState<CoPilotAnalysis>(analyzeConditions(null));
  const [gpsStatus, setGpsStatus] = useState<'searching' | 'ok' | 'error'>('searching');

  // UI State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showCalibration, setShowCalibration] = useState(false);

  // Wake Lock Ref
  const wakeLockRef = useRef<any>(null);
  const lastLocationUpdate = useRef<number>(0);

  // --- AUTO CALIBRATION LOGIC ---
  useEffect(() => {
      // If we are moving fast enough (e.g. > 20 kmh) and have a valid GPS heading
      // we can assume GPS heading is TRUE NORTH.
      // We calculate the diff between GPS Heading and Magnetic Heading (deviceHeading)
      // and update the offset.
      if (speed > 20 && gpsHeading !== null && !isNaN(gpsHeading) && accuracy < 20) {
          // Normalize both to 0-360
          let diff = gpsHeading - deviceHeading;
          
          // Handle wrap around (e.g. GPS 5, Magnetic 355 -> Diff -350 -> Should be +10)
          while (diff < -180) diff += 360;
          while (diff > 180) diff -= 360;
          
          // Apply a smoothing factor or simple replacement? 
          // For simplicity in React loop, let's just update it.
          // Since this runs often, we might want to dampen it, but direct assignment is fastest fix.
          const roundedDiff = Math.round(diff);
          
          // Only update if it changed significantly to avoid render thrashing
          if (Math.abs(roundedDiff - compassOffset) > 1) {
              setCompassOffset(roundedDiff);
              localStorage.setItem('compassOffset', roundedDiff.toString());
          }
      }
  }, [speed, gpsHeading, deviceHeading, accuracy, compassOffset]);

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
        // Lean Angle (Gamma)
        let rawLean = e.gamma || 0;
        if (rawLean > 90) rawLean = 90; if (rawLean < -90) rawLean = -90;
        setLeanAngle(prev => {
            const next = prev * 0.8 + rawLean * 0.2; // Low pass filter
            if (next < maxLeft) setMaxLeft(next);
            if (next > maxRight) setMaxRight(next);
            return next;
        });

        // Magnetic Heading (Alpha)
        let rawHeading = 0;
        if ((e as any).webkitCompassHeading) {
            rawHeading = (e as any).webkitCompassHeading;
        } else if (e.alpha !== null) {
            rawHeading = 360 - e.alpha; 
        }
        setDeviceHeading(rawHeading);
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
                setGpsHeading(hdg); 
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

  // Determine which heading to use:
  // If moving > 5kmh and GPS has heading, use GPS (most accurate).
  // Otherwise use Device Compass + Offset.
  const isGpsHeadingUsed = speed > 5 && gpsHeading !== null && !isNaN(gpsHeading);
  
  // Calculated Magnetic Heading (with Auto Calibration Offset applied)
  const calibratedMagneticHeading = (deviceHeading + compassOffset + 360) % 360;

  // Effective Heading for Display
  const effectiveHeading = isGpsHeadingUsed ? (gpsHeading || 0) : calibratedMagneticHeading;

  return (
    <div className="dash-bg w-full h-[100dvh] flex flex-col relative text-slate-100 overflow-hidden font-sans select-none">
        
        {/* CALIBRATION MODAL */}
        <CalibrationModal 
            isOpen={showCalibration} 
            onClose={() => setShowCalibration(false)}
            offset={compassOffset}
        />

        {/* TOP BAR */}
        <div className="flex justify-between items-center px-6 pt-6 pb-2 z-20 shrink-0">
             <div className="flex items-center gap-3">
                 <div className={`w-2.5 h-2.5 rounded-full ${gpsStatus === 'ok' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 animate-pulse'}`}></div>
                 
                  {/* INSTALL BUTTON */}
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
                     <div className="flex flex-col">
                         <span className="text-[10px] font-black tracking-widest text-slate-400">UYDU</span>
                         <span className="text-[10px] font-bold text-slate-500">{gpsStatus === 'ok' ? 'BAĞLI' : 'ARANIYOR'}</span>
                     </div>
                 )}
             </div>
             
             {/* Clock */}
             <div className="flex flex-col items-end">
                <DigitalClock />
                <span className="text-[9px] font-bold text-cyan-600 tracking-widest">MOTO ROTA</span>
             </div>
        </div>

        {/* MAIN DISPLAY */}
        <div className="flex-1 flex flex-col justify-center items-center relative z-10 w-full min-h-0">
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
        <EnvGrid weather={weather} analysis={analysis} bikeSpeed={speed} bikeHeading={effectiveHeading} />

        {/* FOOTER */}
        <FooterTelemetry 
            heading={effectiveHeading} 
            altitude={altitude} 
            locationName={locationName} 
            accuracy={accuracy}
            isGpsHeading={isGpsHeadingUsed}
            onOpenCalibration={() => setShowCalibration(true)}
        />

    </div>
  );
};

export default App;