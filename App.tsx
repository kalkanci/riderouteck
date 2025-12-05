import React, { useState, useEffect, useRef } from 'react';
import { Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, ArrowUp, Activity, RotateCcw, Mountain, Compass, Navigation, AlertTriangle, Gauge, Droplets, Thermometer, MapPin, Zap, Clock, Umbrella, Download, Settings, RefreshCw, CheckCircle2, Moon, Maximize2, X, Battery, BatteryCharging, Timer, TrendingUp, Shield, ShieldAlert, ShieldCheck, Bike, Bluetooth, Smartphone, Radio, Play, Pause, SkipForward, Music, Headphones } from 'lucide-react';
import { WeatherData, CoPilotAnalysis } from './types';
import { getWeatherForPoint, reverseGeocode } from './services/api';

// --- RADIO STATIONS ---
// Updated to reliable direct streams
const RADIO_STATIONS = [
    { name: "Power FM", url: "https://listen.powerapp.com.tr/powerfm/icecast.audio" },
    { name: "Fenomen", url: "https://listen.radyofenomen.com/fenomen/128/icecast.audio" },
    { name: "Number1", url: "https://n10101m.mediatriple.net/numberone" }
];

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
    const borderClass = isDark ? "border-slate-800" : "border-slate-200";

    return (
        <div className={`fixed inset-0 z-50 flex flex-col p-6 backdrop-blur-md animate-in slide-in-from-bottom-10 ${bgClass} ${textClass}`}>
            <div className="flex justify-between items-center mb-6 shrink-0">
                <h2 className="text-2xl font-black uppercase tracking-widest">
                    {type === 'speed' ? 'Sürüş Özeti' : 
                     type === 'weather' ? 'Hava Detayı' : 
                     type === 'copilot' ? 'Taktiksel Analiz' : 'Performans Telemetrisi'}
                </h2>
                <button onClick={(e) => { e.stopPropagation(); onClose(); }} className={`p-2 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                    <X size={24} />
                </button>
            </div>

            <div className="flex-1 flex flex-col gap-4 overflow-y-auto no-scrollbar pb-10">
                {type === 'speed' && (
                    <>
                        <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'}`}>
                            <div className="flex items-center gap-2 mb-2 opacity-70">
                                <TrendingUp size={20} className="text-cyan-500" />
                                <span className="text-xs font-bold uppercase">Maksimum Hız</span>
                            </div>
                            <div className="text-6xl font-black tabular-nums">{Math.round(data.maxSpeed)} <span className="text-xl">km/h</span></div>
                        </div>
                        <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'}`}>
                            <div className="flex items-center gap-2 mb-2 opacity-70">
                                <Timer size={20} className="text-amber-500" />
                                <span className="text-xs font-bold uppercase">Yapılan Yol</span>
                            </div>
                            <div className="text-6xl font-black tabular-nums">{data.tripDistance.toFixed(1)} <span className="text-xl">km</span></div>
                        </div>
                        <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'}`}>
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
                            <div className={`p-4 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'}`}>
                                <span className="text-xs font-bold opacity-60 block mb-1">HİSSEDİLEN</span>
                                <span className="text-4xl font-black">{Math.round(data.weather?.feelsLike || 0)}°</span>
                            </div>
                            <div className={`p-4 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'}`}>
                                <span className="text-xs font-bold opacity-60 block mb-1">YAĞIŞ İHTİMALİ</span>
                                <span className="text-4xl font-black text-cyan-500">%{data.weather?.rainProb}</span>
                            </div>
                        </div>
                        <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'}`}>
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
                            <p className="mt-4 text-xs opacity-60 leading-relaxed">
                                Motosiklet üzerindeki hızınız rüzgar şiddetini artırır. Bu değer kaskınıza ve göğsünüze çarpan rüzgardır.
                            </p>
                        </div>
                    </>
                )}

                {type === 'copilot' && (
                    <div className="flex flex-col gap-4">
                        <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'} flex items-center gap-4`}>
                             {data.analysis.status === 'safe' ? <ShieldCheck size={48} className="text-emerald-500" /> : 
                              data.analysis.status === 'caution' ? <Shield size={48} className="text-amber-500" /> : 
                              <ShieldAlert size={48} className="text-rose-500" />}
                             <div>
                                 <h3 className={`text-xl font-black italic ${data.analysis.color}`}>{data.analysis.roadCondition}</h3>
                                 <p className="text-sm opacity-70">{data.analysis.message}</p>
                             </div>
                        </div>

                        <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'}`}>
                            <div className="flex items-center gap-2 mb-4 opacity-70">
                                <Bike size={20} />
                                <span className="text-xs font-bold uppercase">Sürüş Tavsiyeleri</span>
                            </div>
                            <ul className="space-y-3 text-sm">
                                <li className="flex gap-3 items-start">
                                    <span className="bg-cyan-500/20 text-cyan-500 p-1 rounded">1</span>
                                    <span>{data.weather?.temp < 15 ? "Lastikler soğuk olabilir, agresif yatıştan kaçın." : "Asfalt sıcaklığı ideal, lastik tutuşu yüksek."}</span>
                                </li>
                                <li className="flex gap-3 items-start">
                                    <span className="bg-cyan-500/20 text-cyan-500 p-1 rounded">2</span>
                                    <span>{data.weather?.windSpeed > 20 ? "Rüzgar hamlelerine karşı depo ile bütünleş, gidonu sıkma." : "Rüzgar stabil, konforlu sürüş."}</span>
                                </li>
                                <li className="flex gap-3 items-start">
                                    <span className="bg-cyan-500/20 text-cyan-500 p-1 rounded">3</span>
                                    <span>{data.weather?.rainProb > 20 ? "Yağmurluk erişilebilir bir yerde olsun." : "Yağış beklenmiyor, keyfini çıkar."}</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                )}

                {type === 'lean' && (
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-3 gap-3">
                            {/* Braking G */}
                            <div className={`p-3 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'} flex flex-col items-center justify-center`}>
                                <div className="mb-2 p-2 rounded-full bg-rose-500/20">
                                    <ArrowUp size={20} className="text-rose-500 rotate-180" />
                                </div>
                                <span className="text-[10px] font-bold uppercase opacity-60">Frenleme</span>
                                <span className="text-2xl font-black text-rose-500">{data.maxBrakeG.toFixed(1)}G</span>
                            </div>
                             {/* Corner G */}
                             <div className={`p-3 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'} flex flex-col items-center justify-center`}>
                                <div className="mb-2 p-2 rounded-full bg-cyan-500/20">
                                    <Activity size={20} className="text-cyan-500" />
                                </div>
                                <span className="text-[10px] font-bold uppercase opacity-60">Viraj</span>
                                <span className="text-2xl font-black text-cyan-500">{data.maxCornerG.toFixed(1)}G</span>
                            </div>
                            {/* Accel G */}
                            <div className={`p-3 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'} flex flex-col items-center justify-center`}>
                                <div className="mb-2 p-2 rounded-full bg-emerald-500/20">
                                    <ArrowUp size={20} className="text-emerald-500" />
                                </div>
                                <span className="text-[10px] font-bold uppercase opacity-60">İvmelenme</span>
                                <span className="text-2xl font-black text-emerald-500">{data.maxAccelG.toFixed(1)}G</span>
                            </div>
                        </div>

                        {/* Analysis Text */}
                        <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-md'} space-y-4`}>
                             <div className="flex gap-3">
                                 <span className="text-rose-500 font-black whitespace-nowrap">Frenleme G:</span>
                                 <p className="text-xs opacity-70">Fren yaparken oluşan öne yığılma kuvveti. 0.8G üzeri sert frenleme, 1.0G üzeri genellikle ABS sınırıdır.</p>
                             </div>
                             <div className="flex gap-3">
                                 <span className="text-cyan-500 font-black whitespace-nowrap">Viraj G:</span>
                                 <p className="text-xs opacity-70">Lastiklerin yana doğru tutunma kuvveti. Cadde lastikleriyle 1.0G üzeri risklidir, pist lastikleriyle 1.3G'ye çıkabilir.</p>
                             </div>
                             <div className="flex gap-3">
                                 <span className="text-emerald-500 font-black whitespace-nowrap">Hızlanma G:</span>
                                 <p className="text-xs opacity-70">Gaz açtığında seni geriye iten kuvvet. 0.5G üzeri, özellikle ıslak zeminde arka lastiğin kaymasına neden olabilir.</p>
                             </div>
                        </div>
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
        <div onClick={onClick} className="flex flex-col items-center justify-center relative py-6 transition-colors duration-500 cursor-pointer active:scale-95 transform">
            <div className={`absolute inset-0 blur-[80px] rounded-full transition-all duration-700 ${glowClass}`}></div>
            <div className={`text-8xl sm:text-[9rem] font-black italic tracking-tighter leading-none drop-shadow-sm tabular-nums z-10 transition-colors duration-300 ${colorClass}`}>
                {Math.round(speed)}
            </div>
            <div className="text-xl font-bold text-cyan-500 tracking-[0.3em] mt-2 z-10 opacity-80 flex items-center gap-2">
                KM/H <Maximize2 size={12} className="opacity-50" />
            </div>
        </div>
    );
};

const LeanDashboard = ({ angle, maxLeft, maxRight, gForce, onReset, isDark, onExpand }: any) => {
    // VISIBILITY LOGIC: Only show if angle > 30 OR historic max > 30 (so you can see your record when stopped)
    const isRelevant = Math.abs(angle) > 30 || Math.abs(maxLeft) > 30 || Math.abs(maxRight) > 30;
    
    // If not relevant, don't render anything to keep the UI clean
    if (!isRelevant) return <div className="h-4 w-full"></div>;

    const isLeft = angle < 0;
    const absAngle = Math.abs(angle);
    const barWidth = Math.min((absAngle / 50) * 100, 100);
    
    let colorClass = "bg-emerald-500";
    if (absAngle > 30) colorClass = "bg-amber-500";
    if (absAngle > 45) colorClass = "bg-rose-500";

    const boxClass = isDark ? "bg-slate-800/50 border-slate-700/50 text-slate-300" : "bg-white border-slate-200 text-slate-700 shadow-sm";
    const barBgClass = isDark ? "bg-slate-800/30" : "bg-slate-200";

    return (
        <div className="w-full px-6 mb-4 cursor-pointer animate-in fade-in slide-in-from-bottom-4 duration-500" onClick={onExpand}>
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

const MiniRadio = ({ isDark }: { isDark: boolean }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [stationIdx, setStationIdx] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Watch for station changes or play toggle
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        // Note: When stationIdx changes, React updates the src prop below.
        // We just need to ensure play state is respected.
        if (isPlaying) {
             const playPromise = audio.play();
             if (playPromise !== undefined) {
                 playPromise.catch(error => {
                     console.error("Playback failed/interrupted:", error);
                     setIsPlaying(false);
                 });
             }
        } else {
            audio.pause();
        }
    }, [stationIdx, isPlaying]);

    const togglePlay = () => setIsPlaying(!isPlaying);
    
    const nextStation = () => {
        setStationIdx((prev) => (prev + 1) % RADIO_STATIONS.length);
        setIsPlaying(true); // Auto-play next station
    };

    return (
        <div className={`mt-2 flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-sm transition-all duration-300 ${isDark ? 'bg-slate-800/40 border-slate-700 text-slate-300' : 'bg-white/60 border-slate-200 text-slate-700'}`}>
            <audio 
                ref={audioRef} 
                src={RADIO_STATIONS[stationIdx].url}
                className="hidden" 
                crossOrigin="anonymous"
                preload="none"
                onEnded={() => setIsPlaying(false)}
                onError={(e) => {
                    console.error("Audio error", e);
                    setIsPlaying(false);
                }}
            />
            <div className="flex items-center gap-2 pr-2 border-r border-slate-500/20">
                <Radio size={12} className={isPlaying ? "text-cyan-500 animate-pulse" : "opacity-50"} />
                <span className="text-[10px] font-bold w-16 truncate">{RADIO_STATIONS[stationIdx].name}</span>
            </div>
            <button onClick={togglePlay} className="active:scale-90 transition-transform">
                {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            </button>
            <button onClick={nextStation} className="active:scale-90 transition-transform">
                <SkipForward size={12} />
            </button>
        </div>
    );
};

const EnvGrid = ({ weather, analysis, bikeSpeed, bikeHeading, altitude, tripTime, tripDistance, isDark, onExpand }: any) => {
    const apparentWind = weather ? calculateApparentWind(bikeSpeed, bikeHeading, weather.windSpeed, weather.windDirection) : 0;
    
    const cardClass = isDark ? "bg-[#111827] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900 shadow-md";
    const labelClass = isDark ? "text-slate-500" : "text-slate-500 font-semibold";

    // Format time HH:MM
    const hours = Math.floor(tripTime / 3600);
    const mins = Math.floor((tripTime % 3600) / 60);
    const timeStr = `${hours}s ${mins}dk`;
    
    return (
        <div className="flex flex-col px-4 w-full mb-6 mt-auto gap-4 pb-8">
            <div className="grid grid-cols-2 gap-4">
                {/* WEATHER CARD */}
                <div onClick={() => onExpand('weather')} className={`${cardClass} border rounded-2xl p-4 flex flex-col relative overflow-hidden h-28 active:scale-95 transition-transform cursor-pointer`}>
                    <div className="absolute top-2 right-2 opacity-30">{weather ? getWeatherIcon(weather.weatherCode, 24, isDark) : <Activity size={24}/>}</div>
                    
                    <div className="flex-1 flex flex-col justify-center">
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${labelClass}`}>HAVA</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-3xl font-black tracking-tighter leading-none">{weather ? Math.round(weather.temp) : '--'}°</span>
                            <span className="text-[10px] opacity-60">{weather ? Math.round(weather.windSpeed) : '-'} km/s</span>
                        </div>
                    </div>
                </div>

                {/* CO-PILOT CARD */}
                <div onClick={() => onExpand('copilot')} className={`${cardClass} border rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden h-28 active:scale-95 cursor-pointer ${analysis.status === 'danger' ? 'border-rose-500/50 bg-rose-500/10' : analysis.status === 'caution' ? 'border-amber-500/50 bg-amber-500/10' : ''}`}>
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${labelClass}`}>DURUM</span>
                    <div className="mt-1 z-10 relative flex-1 flex flex-col justify-center">
                        <div className={`text-sm font-black leading-tight italic ${analysis.color}`}>{analysis.roadCondition}</div>
                        <div className={`text-[9px] font-bold mt-1 leading-tight opacity-70 truncate ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{analysis.message}</div>
                    </div>
                </div>

                {/* ALTIMETER CARD */}
                <div className={`${cardClass} border rounded-2xl p-4 flex flex-col relative overflow-hidden h-28`}>
                    <div className="absolute top-2 right-2 opacity-30"><Mountain size={24} /></div>
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${labelClass}`}>RAKIM</span>
                    <div className="flex items-baseline gap-1 mt-auto">
                        <span className="text-3xl font-black tracking-tighter leading-none">{altitude ? Math.round(altitude) : 0}</span>
                        <span className="text-[10px] opacity-60 font-bold">METRE</span>
                    </div>
                </div>

                {/* TRIP CARD */}
                <div onClick={() => onExpand('speed')} className={`${cardClass} border rounded-2xl p-4 flex flex-col relative overflow-hidden h-28 active:scale-95 cursor-pointer`}>
                     <div className="absolute top-2 right-2 opacity-30"><Timer size={24} /></div>
                     <span className={`text-[9px] font-bold uppercase tracking-wider ${labelClass}`}>YOLCULUK</span>
                     <div className="flex flex-col mt-auto">
                        <span className="text-2xl font-black tracking-tighter leading-none">{timeStr}</span>
                        <span className="text-[10px] opacity-60 font-bold mt-1">{tripDistance.toFixed(1)} km</span>
                     </div>
                </div>
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

const DigitalClock = ({ isDark, toggleTheme, batteryLevel }: { isDark: boolean, toggleTheme: () => void, batteryLevel: number }) => {
    const [time, setTime] = useState(new Date());
    const [btDeviceName, setBtDeviceName] = useState<string | null>(() => localStorage.getItem('lastBtDevice'));

    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const handleConnectBluetooth = async () => {
        if (!(navigator as any).bluetooth) {
            // Fallback for browsers without Web Bluetooth
            const names = ["INTERCOM", "SENA", "CARDO", "AIRPODS"];
            const current = names.indexOf(btDeviceName || "") + 1;
            const next = names[current % names.length];
            setBtDeviceName(next);
            localStorage.setItem('lastBtDevice', next);
            return;
        }

        try {
            const device = await (navigator as any).bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['battery_service']
            });
            if (device && device.name) {
                setBtDeviceName(device.name);
                localStorage.setItem('lastBtDevice', device.name);
            }
        } catch (e) {
            console.log("Bluetooth cancelled", e);
        }
    };

    return (
        <div className="flex items-center gap-4">
             {/* Device Info */}
            <div className={`flex flex-col items-end ${isDark ? 'opacity-50' : 'opacity-70'}`}>
                <div 
                    onClick={handleConnectBluetooth} 
                    className="flex items-center gap-1 cursor-pointer active:scale-95 transition-transform hover:text-cyan-400"
                    title="Cihaz Eşleştir"
                >
                    {btDeviceName ? (
                        <>
                            <Headphones size={12} className="text-cyan-500" />
                            <span className="text-[10px] font-bold max-w-[60px] truncate">{btDeviceName}</span>
                        </>
                    ) : (
                        <>
                            <Bluetooth size={12} className={isDark ? "text-slate-500" : "text-slate-400"} />
                            <span className="text-[10px] font-bold">EŞLEŞTİR</span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                    <div className="text-[10px] font-bold">{Math.round(batteryLevel)}%</div>
                    <Battery size={12} className={batteryLevel < 20 ? 'text-rose-500' : 'text-emerald-500'} />
                </div>
            </div>

            <div className="flex flex-col items-end">
                <div className={`text-xl font-black tracking-widest tabular-nums font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div onClick={toggleTheme} className="flex items-center gap-1 cursor-pointer active:scale-90 transition-transform">
                    <span className="text-[9px] font-bold text-cyan-600 tracking-widest">MOTO ROTA</span>
                    {isDark ? <Sun size={12} className="text-amber-400" /> : <Moon size={12} className="text-slate-600" />}
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP ---

const App: React.FC = () => {
  const [speed, setSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [tripDistance, setTripDistance] = useState(0);
  const [startTime] = useState<number>(Date.now());
  const [tripDuration, setTripDuration] = useState(0);
  
  const [leanAngle, setLeanAngle] = useState(0);
  const [gForce, setGForce] = useState(0);
  
  // Specific G-Forces
  const [maxLeft, setMaxLeft] = useState(0);
  const [maxRight, setMaxRight] = useState(0);
  const [maxAccelG, setMaxAccelG] = useState(0);
  const [maxBrakeG, setMaxBrakeG] = useState(0);
  const [maxCornerG, setMaxCornerG] = useState(0);

  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number>(0);
  const [compassOffset, setCompassOffset] = useState<number>(() => parseInt(localStorage.getItem('compassOffset') || '0'));
  
  const [altitude, setAltitude] = useState<number | null>(0);
  const [accuracy, setAccuracy] = useState(0);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState<string>("");
  const [analysis, setAnalysis] = useState<CoPilotAnalysis>(analyzeConditions(null));
  const [gpsStatus, setGpsStatus] = useState<'searching' | 'ok' | 'error'>('searching');
  const [batteryLevel, setBatteryLevel] = useState(100);

  // UI State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [expandedView, setExpandedView] = useState<string | null>(null); 

  const wakeLockRef = useRef<any>(null);
  const lastLocationUpdate = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());
  const lastSpeedRef = useRef<number>(0);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // Trip Timer
  useEffect(() => {
      const t = setInterval(() => {
          setTripDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(t);
  }, [startTime]);

  // Battery Status
  useEffect(() => {
    if ((navigator as any).getBattery) {
        (navigator as any).getBattery().then((battery: any) => {
            setBatteryLevel(battery.level * 100);
            battery.addEventListener('levelchange', () => setBatteryLevel(battery.level * 100));
        });
    }
  }, []);

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
            const x = e.acceleration.x || 0;
            const y = e.acceleration.y || 0;
            const z = e.acceleration.z || 0;
            const totalAccel = Math.sqrt(x*x + y*y + z*z);
            const currentG = Math.abs(totalAccel / 9.8);
            
            setGForce(currentG); 
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

                if (timeDelta > 0) {
                    const deltaV_ms = (safeKmh - lastSpeedRef.current) / 3.6;
                    const accel_ms2 = deltaV_ms / timeDelta;
                    const g = accel_ms2 / 9.81;
                    
                    if (g > 0) {
                        if (g > maxAccelG) setMaxAccelG(g);
                    } else {
                        const brakingG = Math.abs(g);
                        if (brakingG > maxBrakeG) setMaxBrakeG(brakingG);
                    }
                }
                lastSpeedRef.current = safeKmh;

                setSpeed(safeKmh);
                if (safeKmh > maxSpeed) setMaxSpeed(safeKmh);
                if (safeKmh > 5) {
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
  }, [maxSpeed, maxAccelG, maxBrakeG]);

  useEffect(() => {
     if (Math.abs(leanAngle) > 15 && gForce > maxCornerG) {
         setMaxCornerG(gForce);
     }
  }, [gForce, leanAngle, maxCornerG]);

  const isGpsHeadingUsed = speed > 5 && gpsHeading !== null && !isNaN(gpsHeading);
  const calibratedMagneticHeading = (deviceHeading + compassOffset + 360) % 360;
  const effectiveHeading = isGpsHeadingUsed ? (gpsHeading || 0) : calibratedMagneticHeading;
  
  const isDark = theme === 'dark';
  const mainBg = isDark ? "bg-[#0b0f19] dash-bg" : "bg-slate-50";

  const expandedData = {
      maxSpeed,
      tripDistance,
      avgSpeed: tripDistance > 0 ? (tripDistance / (tripDuration/3600)).toFixed(1) : 0, 
      weather,
      apparentWind: weather ? calculateApparentWind(speed, effectiveHeading, weather.windSpeed, weather.windDirection) : 0,
      analysis,
      maxAccelG,
      maxBrakeG,
      maxCornerG
  };

  const showRainWarning = weather && (weather.rainProb > 20 || weather.rain > 0.1);

  return (
    <div className={`${mainBg} w-full h-[100dvh] flex flex-col relative overflow-hidden font-sans select-none transition-colors duration-300`}>
        
        <CalibrationModal isOpen={showCalibration} onClose={() => setShowCalibration(false)} offset={compassOffset} />
        
        {expandedView && (
            <DetailOverlay 
                type={expandedView} 
                data={expandedData} 
                onClose={() => setExpandedView(null)} 
                theme={theme}
            />
        )}

        {/* TOP BAR */}
        <div className="flex justify-between items-start px-6 pt-6 pb-2 z-20 shrink-0">
             <div className="flex flex-col gap-2">
                 <div className="flex items-center gap-3 active:scale-95 transition-transform" onClick={() => setShowCalibration(true)}>
                     <div className={`w-2.5 h-2.5 rounded-full ${gpsStatus === 'ok' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 animate-pulse'}`}></div>
                     
                     {deferredPrompt && (
                         <button onClick={handleInstallClick} className="flex items-center gap-2 bg-cyan-600/20 border border-cyan-500/50 text-cyan-400 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse hover:bg-cyan-600/40 transition-colors">
                            <Download size={14} /> YÜKLE
                         </button>
                     )}
                     {!deferredPrompt && (
                         <div className="flex flex-col">
                             <div className="flex items-center gap-1">
                                 <Navigation size={12} className={isDark ? 'text-slate-400' : 'text-slate-600'} style={{ transform: `rotate(${effectiveHeading || 0}deg)` }} />
                                 <span className={`text-xs font-bold truncate max-w-[120px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{locationName || "Konum Aranıyor..."}</span>
                             </div>
                         </div>
                     )}
                 </div>
                 
                 {/* RADIO PLAYER */}
                 <MiniRadio isDark={isDark} />
             </div>
             
             <DigitalClock isDark={isDark} toggleTheme={toggleTheme} batteryLevel={batteryLevel} />
        </div>

        {/* Floating Rain Warning */}
        {showRainWarning && (
            <div className="w-full px-6 mt-2 mb-0 z-30">
                <div className="w-full bg-cyan-900/60 backdrop-blur-md border border-cyan-500/50 rounded-full py-2 px-4 flex items-center justify-center gap-3 animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                    <Umbrella className="text-cyan-400" size={16} />
                    <span className="text-cyan-200 text-xs font-bold tracking-widest">YAĞIŞ BEKLENİYOR (%{weather?.rainProb})</span>
                </div>
            </div>
        )}

        {/* MAIN DISPLAY */}
        <div className="flex-1 flex flex-col justify-center items-center relative z-10 w-full min-h-0">
             <Speedometer speed={speed} onClick={() => setExpandedView('speed')} isDark={isDark} />
             
             {/* LEAN DASHBOARD - DYNAMIC VISIBILITY */}
             <LeanDashboard 
                angle={leanAngle} 
                maxLeft={maxLeft} 
                maxRight={maxRight}
                gForce={gForce}
                onReset={() => { setMaxLeft(0); setMaxRight(0); setMaxAccelG(0); setMaxBrakeG(0); setMaxCornerG(0); }}
                isDark={isDark}
                onExpand={() => setExpandedView('lean')}
             />
        </div>

        {/* INFO CLUSTER GRID (2x2) */}
        <EnvGrid 
            weather={weather} 
            analysis={analysis} 
            bikeSpeed={speed} 
            bikeHeading={effectiveHeading}
            altitude={altitude}
            tripTime={tripDuration}
            tripDistance={tripDistance}
            isDark={isDark}
            onExpand={(type: string) => setExpandedView(type)}
        />

    </div>
  );
};

export default App;