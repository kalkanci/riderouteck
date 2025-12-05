import React, { useState, useEffect, useRef } from 'react';
import { Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, ArrowUp, Activity, RotateCcw, Mountain, Compass, Navigation, AlertTriangle, Gauge, Droplets, Thermometer, MapPin, Zap, Clock, Umbrella, Download, Settings, RefreshCw, CheckCircle2, Moon, Maximize2, X, Battery, BatteryCharging, Timer, TrendingUp } from 'lucide-react';
import { WeatherData, CoPilotAnalysis } from './types';
import { getWeatherForPoint, reverseGeocode } from './services/api';

// --- MATH UTILS ---
const toRad = (deg: number) => deg * Math.PI / 180;

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
    return Math.round(Math.sqrt(resX * resX + resY * resY));
};

const getWeatherIcon = (code: number, size = 32, isDark = true) => {
    const shadowClass = isDark ? "drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]" : "";
    const rainShadow = isDark ? "drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]" : "";
    
    if (code === 0) return <Sun size={size} className={`text-amber-400 ${shadowClass}`} />;
    if (code <= 3) return <Cloud size={size} className={isDark ? "text-slate-400" : "text-slate-500"} />;
    if (code <= 48) return <CloudFog size={size} className={isDark ? "text-slate-500" : "text-slate-600"} />;
    if (code <= 67) return <CloudRain size={size} className={`text-cyan-400 ${rainShadow}`} />;
    if (code <= 77) return <Snowflake size={size} className={isDark ? "text-white" : "text-sky-600"} />;
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

    if (score >= 9) return { status: 'safe', message: "Koşullar Mükemmel. Gazla.", roadCondition: "Kuru & Yüksek Tutuş", color: "text-emerald-500" };
    if (score >= 5) return { status: 'caution', message: msgs.join(", "), roadCondition: "Dikkatli Sür", color: "text-amber-500" };
    return { status: 'danger', message: msgs.join(" + ") || "Tehlikeli Koşullar", roadCondition: "Zemin Riski Yüksek", color: "text-rose-600" };
};

// --- SUB-COMPONENTS ---

// 1. DETAIL MODAL (Expanded View)
const DetailOverlay = ({ type, data, onClose, theme }: any) => {
    if (!type) return null;
    const isDark = theme === 'dark';
    const bgClass = isDark ? "bg-[#0b0f19]/95" : "bg-slate-50/95";
    const textClass = isDark ? "text-white" : "text-slate-900";
    const subTextClass = isDark ? "text-slate-400" : "text-slate-500";
    const borderClass = isDark ? "border-slate-800" : "border-slate-200";

    return (
        <div className={`fixed inset-0 z-50 flex flex-col p-6 backdrop-blur-md animate-in slide-in-from-bottom-10 ${bgClass} ${textClass}`}>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black uppercase tracking-widest">{type === 'speed' ? 'Sürüş Özeti' : type === 'weather' ? 'Hava Detayı' : 'Yatış & G-Force'}</h2>
                <button onClick={(e) => { e.stopPropagation(); onClose(); }} className={`p-2 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                    <X size={24} />
                </button>
            </div>

            <div className="flex-1 flex flex-col gap-6 overflow-y-auto no-scrollbar">
                {type === 'speed' && (
                    <>
                        <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                            <div className="flex items-center gap-2 mb-2 opacity-70">
                                <TrendingUp size={20} className="text-cyan-500" />
                                <span className="text-xs font-bold uppercase">Maksimum Hız</span>
                            </div>
                            <div className="text-6xl font-black tabular-nums">{Math.round(data.maxSpeed)} <span className="text-xl">km/h</span></div>
                        </div>
                        <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                            <div className="flex items-center gap-2 mb-2 opacity-70">
                                <Timer size={20} className="text-amber-500" />
                                <span className="text-xs font-bold uppercase">Yapılan Yol</span>
                            </div>
                            <div className="text-6xl font-black tabular-nums">{data.tripDistance.toFixed(1)} <span className="text-xl">km</span></div>
                        </div>
                        <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                             <div className="flex items-center gap-2 mb-2 opacity-70">
                                <Activity size={20} className="text-emerald-500" />
                                <span className="text-xs font-bold uppercase">Ortalama Hız</span>
                            </div>
                            <div className="text-6xl font-black tabular-nums">{data.avgSpeed} <span className="text-xl">km/h</span></div>
                        </div>
                    </>
                )}

                {type === 'weather' && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div className={`p-4 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                                <span className="text-xs font-bold opacity-60 block mb-1">HİSSEDİLEN</span>
                                <span className="text-4xl font-black">{Math.round(data.weather?.feelsLike || 0)}°</span>
                            </div>
                            <div className={`p-4 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                                <span className="text-xs font-bold opacity-60 block mb-1">YAĞIŞ İHTİMALİ</span>
                                <span className="text-4xl font-black text-cyan-500">%{data.weather?.rainProb}</span>
                            </div>
                        </div>
                        <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                             <div className="flex items-center gap-2 mb-4 opacity-70">
                                <Wind size={24} />
                                <span className="text-sm font-bold uppercase">Rüzgar Analizi</span>
                            </div>
                            <div className="flex justify-between items-end border-b pb-4 border-dashed border-slate-700/50 mb-4">
                                <span>Gerçek</span>
                                <span className="text-2xl font-bold">{Math.round(data.weather?.windSpeed || 0)} km/s</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span>Hissedilen (Bağıl)</span>
                                <span className={`text-3xl font-black ${data.apparentWind > 50 ? 'text-rose-500' : 'text-cyan-500'}`}>{data.apparentWind} km/s</span>
                            </div>
                            <p className="mt-4 text-xs opacity-60">
                                Motosiklet üzerindeki hızınız rüzgar şiddetini artırır. Bu değer kaskınıza çarpan rüzgardır.
                            </p>
                        </div>
                    </>
                )}

                {type === 'lean' && (
                    <div className="flex flex-col gap-4 h-full justify-center text-center">
                        <div className="text-8xl font-black text-slate-300 opacity-20 rotate-90">((( )))</div>
                        <p className="text-lg font-bold opacity-80">G-Force ve Yatış Geçmişi</p>
                        <p className="text-sm opacity-50">Çok yakında bu ekranda viraj analizi ve g-force grafikleri yer alacak.</p>
                    </div>
                )}
            </div>
        </div>
    );
};


const Speedometer = ({ speed, onClick, isDark }: { speed: number, onClick: () => void, isDark: boolean }) => {
    let colorClass = isDark ? "text-white" : "text-slate-900";
    let glowClass = isDark ? "bg-cyan-500/5" : "bg-cyan-500/0";
    
    if (speed > 90) { 
        colorClass = isDark ? "text-white" : "text-slate-900"; 
        glowClass = isDark ? "bg-amber-500/10" : "";
    }
    if (speed > 130) { 
        colorClass = "text-rose-500"; 
        glowClass = "bg-rose-600/20"; 
    }

    return (
        <div onClick={onClick} className="flex flex-col items-center justify-center relative py-8 transition-colors duration-500 cursor-pointer active:scale-95 transform">
            <div className={`absolute inset-0 blur-[80px] rounded-full transition-all duration-700 ${glowClass}`}></div>
            <div className={`text-8xl sm:text-[9rem] font-black italic tracking-tighter leading-none drop-shadow-sm tabular-nums z-10 transition-colors duration-300 ${colorClass}`}>
                {Math.round(speed)}
            </div>
            <div className="text-xl font-bold text-cyan-500 tracking-[0.3em] mt-0 z-10 opacity-80 flex items-center gap-2">
                KM/H <Maximize2 size={12} className="opacity-50" />
            </div>
        </div>
    );
};

const LeanDashboard = ({ angle, maxLeft, maxRight, gForce, onReset, isDark, onExpand }: any) => {
    const isLeft = angle < 0;
    const absAngle = Math.abs(angle);
    const barWidth = Math.min((absAngle / 50) * 100, 100);
    
    let colorClass = "bg-emerald-500";
    if (absAngle > 30) colorClass = "bg-amber-500";
    if (absAngle > 45) colorClass = "bg-rose-500";

    const boxClass = isDark ? "bg-slate-800/50 border-slate-700/50 text-slate-300" : "bg-white border-slate-200 text-slate-700 shadow-sm";
    const barBgClass = isDark ? "bg-slate-800/30" : "bg-slate-200";

    return (
        <div className="w-full px-6 mb-4 cursor-pointer" onClick={onExpand}>
            <div className="flex justify-between items-end mb-3 px-2">
                <div className="text-center w-20">
                    <span className="text-[9px] font-bold block mb-1 opacity-60">MAX SOL</span>
                    <span className={`text-xl font-black px-3 py-1 rounded-lg border ${boxClass}`}>{Math.round(Math.abs(maxLeft))}°</span>
                </div>
                
                <div className="flex flex-col items-center active:scale-95 transition-transform">
                    <div className={`flex items-baseline gap-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        <span className="text-4xl font-black italic tabular-nums">{Math.round(absAngle)}</span>
                        <span className="text-xl opacity-50 italic">°</span>
                    </div>
                    <div className={`mt-1 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-cyan-600 border ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                        <Zap size={10} fill="currentColor" />
                        {gForce.toFixed(1)} G
                    </div>
                </div>

                <div className="text-center w-20">
                    <span className="text-[9px] font-bold block mb-1 opacity-60">MAX SAĞ</span>
                    <span className={`text-xl font-black px-3 py-1 rounded-lg border ${boxClass}`}>{Math.round(maxRight)}°</span>
                </div>
            </div>
            
            <div className={`flex gap-1 h-5 w-full rounded-full border p-1 backdrop-blur-sm ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
                <div className={`flex-1 flex justify-end relative overflow-hidden rounded-l-full ${barBgClass}`}>
                    <div className={`h-full transition-all duration-100 ease-out ${isLeft ? colorClass : 'bg-transparent'}`} style={{ width: isLeft ? `${barWidth}%` : '0%' }}></div>
                </div>
                <div className="w-0.5 bg-slate-400 h-full rounded-full opacity-30"></div>
                <div className={`flex-1 flex justify-start relative overflow-hidden rounded-r-full ${barBgClass}`}>
                     <div className={`h-full transition-all duration-100 ease-out ${!isLeft ? colorClass : 'bg-transparent'}`} style={{ width: !isLeft ? `${barWidth}%` : '0%' }}></div>
                </div>
            </div>
        </div>
    );
};

const EnvGrid = ({ weather, analysis, bikeSpeed, bikeHeading, isDark, onExpand }: any) => {
    const rainWarning = weather && (weather.rainProb > 20 || weather.rain > 0.1);
    const apparentWind = weather ? calculateApparentWind(bikeSpeed, bikeHeading, weather.windSpeed, weather.windDirection) : 0;
    const isMoving = bikeSpeed > 10;

    const cardClass = isDark ? "bg-[#111827] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900 shadow-sm";
    const labelClass = isDark ? "text-slate-500" : "text-slate-400";
    
    return (
        <div className="flex flex-col px-4 w-full mb-6 gap-3" onClick={onExpand}>
            
            {rainWarning && (
                <div className="w-full bg-cyan-900/40 border border-cyan-500/50 rounded-xl p-3 flex items-center justify-center gap-3 animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                    <Umbrella className="text-cyan-400 animate-bounce" size={24} />
                    <div className="text-center">
                        <div className="text-cyan-300 font-black tracking-widest text-lg leading-none">YAĞMUR BEKLENİYOR</div>
                        <div className="text-cyan-200/70 text-[10px] font-bold">EN YAKIN İSTASYONDA %{weather?.rainProb} İHTİMAL</div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 cursor-pointer">
                <div className={`${cardClass} border rounded-2xl p-4 flex flex-col relative overflow-hidden h-full`}>
                    <div className="absolute top-2 right-2 opacity-30">{weather ? getWeatherIcon(weather.weatherCode, 32, isDark) : <Activity />}</div>
                    
                    <div className="flex-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${labelClass}`}>SICAKLIK</span>
                        <div className="flex items-baseline gap-2 mt-0">
                            <span className="text-5xl font-black tracking-tighter leading-none">{weather ? Math.round(weather.temp) : '--'}°</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                             <span className={`text-[10px] font-bold ${labelClass}`}>HİSSEDİLEN:</span>
                             <span className="text-xl font-bold text-cyan-500">{weather ? Math.round(weather.feelsLike) : '--'}°</span>
                        </div>
                    </div>

                    <div className={`mt-3 border-t pt-2 ${isDark ? 'border-slate-800/50' : 'border-slate-100'}`}>
                        <div className="flex justify-between items-end">
                            <div>
                                <span className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${labelClass}`}><Wind size={10}/> RÜZGAR</span>
                                <div className="flex items-end gap-1">
                                    <span className="text-2xl font-black leading-none">{weather ? Math.round(weather.windSpeed) : '-'}</span>
                                    <span className={`text-[9px] font-bold mb-1 ${labelClass}`}>KM</span>
                                </div>
                            </div>
                            <div className={`text-right ${isMoving ? 'opacity-100' : 'opacity-40'} transition-opacity duration-500`}>
                                <span className={`text-[9px] font-bold uppercase tracking-wider ${labelClass}`}>BAĞIL</span>
                                <div className="flex items-end gap-1 justify-end">
                                    <span className={`text-3xl font-black leading-none ${apparentWind > 50 ? 'text-rose-500' : 'text-cyan-500'}`}>
                                        {apparentWind}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`${cardClass} border rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden transition-colors duration-500 h-full ${analysis.status === 'danger' ? 'border-rose-500/50 bg-rose-500/10' : analysis.status === 'caution' ? 'border-amber-500/50 bg-amber-500/10' : ''}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${labelClass}`}>CO-PILOT</span>
                    <div className="mt-1 z-10 relative flex-1 flex flex-col justify-center">
                        <div className={`text-xl font-black leading-tight italic ${analysis.color}`}>{analysis.roadCondition}</div>
                        <div className={`text-[10px] font-bold mt-2 leading-tight opacity-90 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{analysis.message}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const FooterTelemetry = ({ heading, altitude, locationName, accuracy, isGpsHeading, onOpenCalibration, isDark, theme }: any) => {
    const directions = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
    const compassDir = heading !== null ? directions[Math.round(heading / 45) % 8] : '--';
    
    const bgClass = isDark ? "bg-[#0f1523] border-slate-800" : "bg-white border-slate-200 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]";
    const textMain = isDark ? "text-white" : "text-slate-900";

    return (
        <div className={`w-full border-t pt-4 pb-8 px-6 rounded-t-3xl z-20 shrink-0 ${bgClass}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 active:scale-95 transition-transform cursor-pointer" onClick={onOpenCalibration}>
                    <div 
                        className={`w-10 h-10 rounded-full flex items-center justify-center border shadow-inner relative ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}
                    >
                        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 ${isGpsHeading ? 'bg-emerald-500' : 'bg-amber-500'} ${isDark ? 'border-[#0f1523]' : 'border-white'}`}></div>
                        <Navigation size={18} style={{ transform: `rotate(${heading || 0}deg)` }} className={isGpsHeading ? "text-cyan-500" : "text-amber-500"} />
                    </div>
                    <div>
                        <div className={`text-xl font-black leading-none flex items-center gap-2 ${textMain}`}>
                            {compassDir}
                            <Settings size={14} className="opacity-50" />
                        </div>
                        <div className="text-[10px] font-bold mt-0.5 opacity-60">
                            {Math.round(heading || 0)}° {isGpsHeading ? 'GPS' : 'MANYETİK'}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 opacity-60">
                        <span className={`text-2xl font-black tabular-nums ${textMain}`}>{altitude ? Math.round(altitude) : 0}</span>
                        <span className="text-[10px] font-bold mt-1.5">METRE</span>
                    </div>
                    <div className="text-[9px] font-bold opacity-50">GPS ±{Math.round(accuracy)}m</div>
                </div>
            </div>
            <div className={`flex items-center gap-2 p-2 rounded-lg border ${isDark ? 'bg-slate-800/30 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                <MapPin size={12} className="text-cyan-500 shrink-0" />
                <span className={`text-xs font-bold truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{locationName || "Konum Bekleniyor..."}</span>
            </div>
        </div>
    );
};

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
                    <button onClick={onClose} className="w-full py-3 bg-cyan-600 text-white font-bold rounded-xl text-sm active:bg-cyan-700">Tamam</button>
                </div>
            </div>
        </div>
    );
}

const DigitalClock = ({ isDark, toggleTheme }: { isDark: boolean, toggleTheme: () => void }) => {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="flex flex-col items-end">
            <div className={`text-xl font-black tracking-widest tabular-nums font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div onClick={toggleTheme} className="flex items-center gap-1 cursor-pointer active:scale-90 transition-transform">
                <span className="text-[9px] font-bold text-cyan-600 tracking-widest">MOTO ROTA</span>
                {isDark ? <Sun size={12} className="text-amber-400" /> : <Moon size={12} className="text-slate-600" />}
            </div>
        </div>
    );
};

// --- MAIN APP ---

const App: React.FC = () => {
  const [speed, setSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [tripDistance, setTripDistance] = useState(0);
  
  const [leanAngle, setLeanAngle] = useState(0);
  const [gForce, setGForce] = useState(0);
  const [maxLeft, setMaxLeft] = useState(0);
  const [maxRight, setMaxRight] = useState(0);
  
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number>(0);
  const [compassOffset, setCompassOffset] = useState<number>(() => parseInt(localStorage.getItem('compassOffset') || '0'));
  
  const [altitude, setAltitude] = useState<number | null>(0);
  const [accuracy, setAccuracy] = useState(0);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState<string>("");
  const [analysis, setAnalysis] = useState<CoPilotAnalysis>(analyzeConditions(null));
  const [gpsStatus, setGpsStatus] = useState<'searching' | 'ok' | 'error'>('searching');

  // UI State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [expandedView, setExpandedView] = useState<string | null>(null); // 'speed', 'lean', 'weather'

  const wakeLockRef = useRef<any>(null);
  const lastLocationUpdate = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // Auto Calibration Logic
  useEffect(() => {
      if (speed > 20 && gpsHeading !== null && !isNaN(gpsHeading) && accuracy < 20) {
          let diff = gpsHeading - deviceHeading;
          while (diff < -180) diff += 360;
          while (diff > 180) diff -= 360;
          const roundedDiff = Math.round(diff);
          if (Math.abs(roundedDiff - compassOffset) > 1) {
              setCompassOffset(roundedDiff);
              localStorage.setItem('compassOffset', roundedDiff.toString());
          }
      }
  }, [speed, gpsHeading, deviceHeading, accuracy, compassOffset]);

  // Install Prompt
  useEffect(() => {
      const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = () => {
      if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
      }
  };

  // Wake Lock
  useEffect(() => {
    const requestWakeLock = async () => {
        if ('wakeLock' in navigator) {
            try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (e) {}
        }
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') requestWakeLock(); });
  }, []);

  // Sensors
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
        let rawLean = e.gamma || 0;
        if (rawLean > 90) rawLean = 90; if (rawLean < -90) rawLean = -90;
        setLeanAngle(prev => {
            const next = prev * 0.8 + rawLean * 0.2;
            if (next < maxLeft) setMaxLeft(next);
            if (next > maxRight) setMaxRight(next);
            return next;
        });
        let rawHeading = 0;
        if ((e as any).webkitCompassHeading) rawHeading = (e as any).webkitCompassHeading;
        else if (e.alpha !== null) rawHeading = 360 - e.alpha; 
        setDeviceHeading(rawHeading);
    };

    const handleMotion = (e: DeviceMotionEvent) => {
        if (e.acceleration) {
            const totalAccel = Math.sqrt((e.acceleration.x||0)**2 + (e.acceleration.y||0)**2 + (e.acceleration.z||0)**2);
            setGForce(Math.abs(totalAccel / 9.8)); 
        }
    };

    const requestSensors = async () => {
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            try {
                const r = await (DeviceOrientationEvent as any).requestPermission();
                if (r === 'granted') { window.addEventListener('deviceorientation', handleOrientation); window.addEventListener('devicemotion', handleMotion); }
            } catch (e) {}
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
                const safeKmh = kmh < 2 ? 0 : kmh;
                
                // Trip & Max Logic
                const now = Date.now();
                const timeDelta = (now - lastTimeRef.current) / 1000; // seconds
                lastTimeRef.current = now;

                setSpeed(safeKmh);
                if (safeKmh > maxSpeed) setMaxSpeed(safeKmh);
                if (safeKmh > 5) {
                    // distance in km = speed(km/h) * time(h)
                    // time(h) = timeDelta / 3600
                    const distDelta = safeKmh * (timeDelta / 3600);
                    setTripDistance(prev => prev + distDelta);
                }

                setGpsHeading(hdg); 
                setAltitude(alt);
                setAccuracy(acc || 0);

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
            () => setGpsStatus('error'),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    }
    return () => {
        window.removeEventListener('deviceorientation', handleOrientation);
        window.removeEventListener('devicemotion', handleMotion);
        if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [maxSpeed]);

  const isGpsHeadingUsed = speed > 5 && gpsHeading !== null && !isNaN(gpsHeading);
  const calibratedMagneticHeading = (deviceHeading + compassOffset + 360) % 360;
  const effectiveHeading = isGpsHeadingUsed ? (gpsHeading || 0) : calibratedMagneticHeading;
  
  const isDark = theme === 'dark';
  const mainBg = isDark ? "bg-[#0b0f19] dash-bg" : "bg-slate-50";

  // Data for expanded view
  const expandedData = {
      maxSpeed,
      tripDistance,
      avgSpeed: tripDistance > 0 ? 0 : 0, // Simplified for now, real avg needs totalTime
      weather,
      apparentWind: weather ? calculateApparentWind(speed, effectiveHeading, weather.windSpeed, weather.windDirection) : 0
  };

  return (
    <div className={`${mainBg} w-full h-[100dvh] flex flex-col relative overflow-hidden font-sans select-none transition-colors duration-300`}>
        
        <CalibrationModal isOpen={showCalibration} onClose={() => setShowCalibration(false)} offset={compassOffset} />
        
        {/* Detail Modal */}
        {expandedView && (
            <DetailOverlay 
                type={expandedView} 
                data={expandedData} 
                onClose={() => setExpandedView(null)} 
                theme={theme}
            />
        )}

        {/* TOP BAR */}
        <div className="flex justify-between items-center px-6 pt-6 pb-2 z-20 shrink-0">
             <div className="flex items-center gap-3">
                 <div className={`w-2.5 h-2.5 rounded-full ${gpsStatus === 'ok' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 animate-pulse'}`}></div>
                 
                 {deferredPrompt && (
                     <button onClick={handleInstallClick} className="flex items-center gap-2 bg-cyan-600/20 border border-cyan-500/50 text-cyan-400 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse hover:bg-cyan-600/40 transition-colors">
                        <Download size={14} /> YÜKLE
                     </button>
                 )}
                 {!deferredPrompt && (
                     <div className="flex flex-col">
                         <span className="text-[10px] font-black tracking-widest opacity-50 text-slate-500">UYDU</span>
                         <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{gpsStatus === 'ok' ? 'BAĞLI' : 'ARANIYOR'}</span>
                     </div>
                 )}
             </div>
             
             <DigitalClock isDark={isDark} toggleTheme={toggleTheme} />
        </div>

        {/* MAIN DISPLAY */}
        <div className="flex-1 flex flex-col justify-center items-center relative z-10 w-full min-h-0">
             <Speedometer speed={speed} onClick={() => setExpandedView('speed')} isDark={isDark} />
             <LeanDashboard 
                angle={leanAngle} 
                maxLeft={maxLeft} 
                maxRight={maxRight}
                gForce={gForce}
                onReset={() => { setMaxLeft(0); setMaxRight(0); }}
                isDark={isDark}
                onExpand={() => setExpandedView('lean')}
             />
        </div>

        {/* INFO CLUSTER */}
        <EnvGrid 
            weather={weather} 
            analysis={analysis} 
            bikeSpeed={speed} 
            bikeHeading={effectiveHeading} 
            isDark={isDark}
            onExpand={() => setExpandedView('weather')}
        />

        {/* FOOTER */}
        <FooterTelemetry 
            heading={effectiveHeading} 
            altitude={altitude} 
            locationName={locationName} 
            accuracy={accuracy}
            isGpsHeading={isGpsHeadingUsed}
            onOpenCalibration={() => setShowCalibration(true)}
            isDark={isDark}
        />

    </div>
  );
};

export default App;