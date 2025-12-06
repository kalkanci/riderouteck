import React, { useState, useEffect, useRef } from 'react';
import { Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, ArrowUp, Activity, RotateCcw, Mountain, Compass, Navigation, AlertTriangle, Gauge, Droplets, Thermometer, MapPin, Zap, Clock, Umbrella, Download, Settings, RefreshCw, CheckCircle2, Moon, Maximize2, X, Battery, BatteryCharging, Timer, TrendingUp, Shield, ShieldAlert, ShieldCheck, Bike, Bluetooth, Smartphone, Radio, Play, Pause, SkipForward, Music, Headphones, Crosshair, Move, Volume2, VolumeX, StopCircle, BarChart3, RadioReceiver, Mic } from 'lucide-react';
import { WeatherData, CoPilotAnalysis } from './types';
import { getWeatherForPoint, reverseGeocode } from './services/api';

// --- RADIO STATIONS ---
// Updated with StreamTheWorld (Karnaval) & Fenomen MP3 streams for maximum browser compatibility.
const RADIO_STATIONS = [
    { name: "Süper FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/SUPER_FM_SC" },
    { name: "Joy Türk", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/JOY_TURK_SC" },
    { name: "Metro FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/METRO_FM_SC" },
    { name: "Virgin Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/VIRGIN_RADIO_TR_SC" },
    { name: "Joy FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/JOY_FM_SC" },
    { name: "Fenomen", url: "https://listen.radyofenomen.com/fenomen/128/icecast.audio" }
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

const getCardinalDirection = (angle: number) => {
    const directions = ['KUZEY', 'K.DOĞU', 'DOĞU', 'G.DOĞU', 'GÜNEY', 'G.BATI', 'BATI', 'K.BATI'];
    return directions[Math.round(angle / 45) % 8];
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
    
    if (weather.rainProb > 60 || weather.rain > 1.0) { score -= 5; msgs.push("Zemin Islak"); }
    else if (weather.rainProb > 30) { score -= 2; msgs.push("Yağmur Başlayabilir"); }
    if (weather.windSpeed > 40) { score -= 4; msgs.push("Şiddetli Yan Rüzgar"); }
    else if (weather.windSpeed > 25) { score -= 2; msgs.push("Rüzgarlı"); }
    if (weather.temp < 5) { score -= 3; msgs.push("Gizli Buzlanma Riski"); }
    else if (weather.temp > 35) { score -= 1; msgs.push("Asfalt Kayganlaşabilir"); }

    if (score >= 9) return { status: 'safe', message: "Yol Açık, Keyfini Çıkar.", roadCondition: "Zemin Mükemmel", color: "text-emerald-500" };
    if (score >= 5) return { status: 'caution', message: msgs.join(", "), roadCondition: "Dikkatli Sür", color: "text-amber-500" };
    return { status: 'danger', message: msgs.join(" ve ") || "Tehlikeli Koşullar", roadCondition: "Yavaşla", color: "text-rose-600" };
};

// --- SUB-COMPONENTS ---

// 1. DETAIL MODAL
const DetailOverlay = ({ type, data, onClose, theme, radioHandlers }: any) => {
    if (!type) return null;
    const isDark = theme === 'dark';
    const bgClass = isDark ? "bg-[#111827]" : "bg-white";
    const textClass = isDark ? "text-white" : "text-slate-900";
    const borderClass = isDark ? "border-slate-700" : "border-slate-200";

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div 
                className={`w-full max-w-md max-h-[85vh] rounded-3xl shadow-2xl flex flex-col border overflow-hidden animate-in zoom-in-95 duration-200 ${bgClass} ${borderClass} ${textClass}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`p-5 flex justify-between items-center shrink-0 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                    <h2 className="text-xl font-black uppercase tracking-wider flex items-center gap-2">
                        {type === 'radio' && <Radio className="text-cyan-500" />}
                        {type === 'speed' && <TrendingUp className="text-cyan-500" />}
                        {type === 'weather' && <Cloud className="text-cyan-500" />}
                        {type === 'copilot' && <ShieldCheck className="text-cyan-500" />}
                        {type === 'lean' && <Activity className="text-cyan-500" />}
                        <span>
                            {type === 'speed' ? 'Sürüş Özeti' : 
                             type === 'weather' ? 'Hava Detayı' : 
                             type === 'copilot' ? 'Taktiksel Analiz' : 
                             type === 'radio' ? 'Radyo Paneli' :
                             'Telemetri'}
                        </span>
                    </h2>
                    <button onClick={onClose} className={`p-2 rounded-full transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-100 hover:bg-slate-200'}`}>
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto no-scrollbar p-5">
                    {type === 'radio' && (
                        <div className="flex flex-col gap-4">
                            <span className="text-xs font-bold opacity-50 px-1">
                                {radioHandlers.isPlaying ? 'KANAL DEĞİŞTİRMEK İÇİN SEÇİN' : 'BİR KANAL SEÇİN'}
                            </span>
                            
                            {/* Grid Layout for Cards */}
                            <div className="grid grid-cols-2 gap-3">
                                {RADIO_STATIONS.map((station: any, idx: number) => {
                                    const isActive = radioHandlers.currentStation === idx && radioHandlers.isPlaying;
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => radioHandlers.play(idx)}
                                            className={`relative p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all active:scale-95 aspect-square
                                                ${isActive 
                                                    ? 'border-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.2)]' 
                                                    : `border-transparent ${isDark ? 'bg-slate-800 hover:bg-slate-750' : 'bg-slate-50 hover:bg-slate-100'} border-slate-700/30`
                                                }`}
                                        >
                                            {isActive && (
                                                <span className="absolute top-3 right-3 flex h-3 w-3">
                                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                                                </span>
                                            )}
                                            
                                            <div className={`p-4 rounded-full transition-colors ${isActive ? 'bg-cyan-500 text-white' : 'bg-slate-700/30 text-slate-400'}`}>
                                                <Music size={28} />
                                            </div>
                                            <span className={`text-sm font-black text-center leading-tight ${isActive ? 'text-cyan-400' : ''}`}>{station.name}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {type === 'speed' && (
                        <div className="space-y-4">
                            <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                                <div className="flex items-center gap-2 mb-2 opacity-70">
                                    <TrendingUp size={20} className="text-cyan-500" />
                                    <span className="text-xs font-bold uppercase">Maksimum Hız</span>
                                </div>
                                <div className="text-6xl font-black tabular-nums">{Math.round(data.maxSpeed)} <span className="text-xl">km/h</span></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className={`p-4 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                                    <div className="flex items-center gap-2 mb-2 opacity-70">
                                        <Timer size={16} className="text-amber-500" />
                                        <span className="text-[10px] font-bold uppercase">Yol</span>
                                    </div>
                                    <div className="text-2xl font-black tabular-nums">{data.tripDistance.toFixed(1)} <span className="text-sm">km</span></div>
                                </div>
                                <div className={`p-4 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                                     <div className="flex items-center gap-2 mb-2 opacity-70">
                                        <Activity size={16} className="text-emerald-500" />
                                        <span className="text-[10px] font-bold uppercase">Ortalama</span>
                                    </div>
                                    <div className="text-2xl font-black tabular-nums">{data.avgSpeed} <span className="text-sm">km/h</span></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {type === 'weather' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className={`p-4 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                                    <span className="text-xs font-bold opacity-60 block mb-1">HİSSEDİLEN</span>
                                    <span className="text-4xl font-black">{Math.round(data.weather?.feelsLike || 0)}°</span>
                                </div>
                                <div className={`p-4 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                                    <span className="text-xs font-bold opacity-60 block mb-1">YAĞIŞ RİSKİ</span>
                                    <span className="text-4xl font-black text-cyan-500">%{data.weather?.rainProb}</span>
                                </div>
                            </div>
                            <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                                 <div className="flex items-center gap-2 mb-4 opacity-70">
                                    <Wind size={24} />
                                    <span className="text-sm font-bold uppercase">Rüzgar Analizi</span>
                                </div>
                                <div className="flex justify-between items-end border-b pb-4 border-dashed border-slate-700/50 mb-4">
                                    <span>Gerçek Hız</span>
                                    <span className="text-2xl font-bold">{Math.round(data.weather?.windSpeed || 0)} km/s</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm opacity-80">Sürüşte Hissedilen</span>
                                    <span className={`text-3xl font-black ${data.apparentWind > 50 ? 'text-rose-500' : 'text-cyan-500'}`}>{data.apparentWind} km/s</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {type === 'copilot' && (
                        <div className="flex flex-col gap-4">
                            <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'} flex items-center gap-4`}>
                                 {data.analysis.status === 'safe' ? <ShieldCheck size={48} className="text-emerald-500" /> : 
                                  data.analysis.status === 'caution' ? <Shield size={48} className="text-amber-500" /> : 
                                  <ShieldAlert size={48} className="text-rose-500" />}
                                 <div>
                                     <h3 className={`text-lg font-black italic ${data.analysis.color}`}>{data.analysis.roadCondition}</h3>
                                     <p className="text-xs opacity-70 mt-1">{data.analysis.message}</p>
                                 </div>
                            </div>

                            <div className={`p-6 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                                <div className="flex items-center gap-2 mb-4 opacity-70">
                                    <Bike size={20} />
                                    <span className="text-xs font-bold uppercase">Sürüş Tavsiyeleri</span>
                                </div>
                                <ul className="space-y-3 text-sm">
                                    <li className="flex gap-3 items-start">
                                        <span className="bg-cyan-500/20 text-cyan-500 px-2 py-0.5 rounded text-xs font-bold">1</span>
                                        <span>{data.weather?.temp < 15 ? "Lastikler soğuk olabilir, agresif yatıştan kaçın." : "Asfalt sıcaklığı ideal, lastik tutuşu yüksek."}</span>
                                    </li>
                                    <li className="flex gap-3 items-start">
                                        <span className="bg-cyan-500/20 text-cyan-500 px-2 py-0.5 rounded text-xs font-bold">2</span>
                                        <span>{data.weather?.windSpeed > 20 ? "Rüzgar hamlelerine karşı depo ile bütünleş." : "Rüzgar stabil, konforlu sürüş."}</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {type === 'lean' && (
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-3 gap-2">
                                {/* Braking G */}
                                <div className={`p-3 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'} flex flex-col items-center justify-center`}>
                                    <span className="text-[9px] font-bold uppercase opacity-60 mb-1">Fren</span>
                                    <span className="text-xl font-black text-rose-500">{data.maxBrakeG.toFixed(1)}G</span>
                                </div>
                                 {/* Corner G */}
                                 <div className={`p-3 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'} flex flex-col items-center justify-center`}>
                                    <span className="text-[9px] font-bold uppercase opacity-60 mb-1">Viraj</span>
                                    <span className="text-xl font-black text-cyan-500">{data.maxCornerG.toFixed(1)}G</span>
                                </div>
                                {/* Accel G */}
                                <div className={`p-3 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'} flex flex-col items-center justify-center`}>
                                    <span className="text-[9px] font-bold uppercase opacity-60 mb-1">Gaz</span>
                                    <span className="text-xl font-black text-emerald-500">{data.maxAccelG.toFixed(1)}G</span>
                                </div>
                            </div>
                            
                             <div className={`p-4 rounded-2xl border ${borderClass} ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                                <div className="flex items-center gap-2 mb-2 opacity-70">
                                    <BarChart3 size={16} />
                                    <span className="text-xs font-bold uppercase">G-Kuvveti Bilgisi</span>
                                </div>
                                <p className="text-xs opacity-60 leading-relaxed">
                                    Motosiklet lastiklerinin yanal tutuş limiti genellikle 1.0G - 1.2G arasındadır. 0.8G üzeri değerler agresif sürüşe işaret eder.
                                </p>
                             </div>
                        </div>
                    )}
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

const DigitalClock = ({ isDark, toggleTheme, batteryLevel, isVoiceEnabled, toggleVoice }: any) => {
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

            {/* Voice Toggle */}
            <button 
                onClick={toggleVoice} 
                className={`p-2 rounded-full transition-colors active:scale-90 ${isVoiceEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-500'}`}
                title="Sesli Asistan"
            >
                {isVoiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

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

// --- NEW COMPONENTS ---

const Speedometer = ({ speed, onClick, isDark }: any) => {
    const textColor = isDark ? "text-white" : "text-slate-900";
    const subTextColor = isDark ? "text-slate-500" : "text-slate-400";
    return (
        <div onClick={onClick} className="flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform z-10 py-10">
            <div className="relative">
                <div className={`text-[160px] leading-none font-black tracking-tighter tabular-nums ${textColor} drop-shadow-2xl`}>
                    {Math.round(speed)}
                </div>
                <div className={`absolute -bottom-4 right-2 text-2xl font-black ${subTextColor} tracking-widest`}>
                    KM/H
                </div>
            </div>
        </div>
    );
};

const LeanDashboard = ({ angle, maxLeft, maxRight, gForce, onReset, isDark, onExpand }: any) => {
    const textColor = isDark ? "text-white" : "text-slate-900";
    const borderColor = isDark ? "border-slate-800" : "border-slate-200";

    return (
        <div className="w-full max-w-sm px-6 pb-6 flex flex-col items-center gap-4">
            {/* Visual Lean Indicator */}
            <div className="relative w-64 h-8 rounded-full bg-slate-800/50 backdrop-blur overflow-hidden border border-white/10">
                <div 
                    className="absolute top-0 bottom-0 w-2 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)] transition-all duration-100 ease-out rounded-full"
                    style={{ 
                        left: `${50 + (angle * 1.5)}%`, 
                        transform: 'translateX(-50%)'
                    }}
                />
                <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/20 -translate-x-1/2" />
            </div>

            <div className="w-full grid grid-cols-3 gap-3">
                <div className={`p-3 rounded-2xl border ${borderColor} ${isDark ? 'bg-slate-900/80' : 'bg-white/80'} backdrop-blur flex flex-col items-center`}>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">SOL MAX</span>
                    <span className={`text-2xl font-black ${textColor}`}>{Math.abs(Math.round(maxLeft))}°</span>
                </div>
                <div onClick={onExpand} className={`p-3 rounded-2xl border ${borderColor} ${isDark ? 'bg-slate-800' : 'bg-slate-100'} flex flex-col items-center justify-center cursor-pointer active:scale-95`}>
                     <RotateCcw size={20} className="text-cyan-500 mb-1" />
                     <span className={`text-xl font-black ${textColor}`}>{Math.abs(Math.round(angle))}°</span>
                </div>
                <div className={`p-3 rounded-2xl border ${borderColor} ${isDark ? 'bg-slate-900/80' : 'bg-white/80'} backdrop-blur flex flex-col items-center`}>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">SAĞ MAX</span>
                    <span className={`text-2xl font-black ${textColor}`}>{Math.round(maxRight)}°</span>
                </div>
            </div>
             <button 
                onClick={(e) => { e.stopPropagation(); onReset(); }}
                className="text-xs font-bold text-slate-500 hover:text-cyan-400 transition-colors py-2 flex items-center gap-1"
            >
                <RefreshCw size={12} /> SIFIRLA
            </button>
        </div>
    );
};

const EnvGrid = ({ weather, analysis, bikeSpeed, bikeHeading, altitude, tripTime, tripDistance, maxLeft, maxRight, accuracy, longitudinalG, gForce, radioState, isDark, onExpand }: any) => {
    const cardBg = isDark ? "bg-[#111827] border-slate-800" : "bg-white border-slate-200 shadow-sm";
    const textMain = isDark ? "text-white" : "text-slate-900";
    
    const WindArrow = ({ dir }: {dir: number}) => (
        <div className="relative w-8 h-8 flex items-center justify-center">
            <Navigation 
                size={24} 
                className={isDark ? "text-slate-400" : "text-slate-600"} 
                style={{ transform: `rotate(${dir}deg)` }} 
            />
        </div>
    );

    return (
        <div className="grid grid-cols-2 gap-3 w-full px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] shrink-0 max-w-lg mx-auto">
            <div onClick={() => onExpand('copilot')} className={`p-4 rounded-3xl border ${cardBg} flex flex-col justify-between aspect-[4/3] relative overflow-hidden active:scale-95 transition-transform`}>
                <div className="flex justify-between items-start z-10">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black tracking-widest opacity-50 uppercase">COPILOT</span>
                        <span className={`text-lg font-black leading-tight ${analysis.color}`}>
                            {analysis.status === 'safe' ? 'GÜVENLİ' : analysis.status === 'caution' ? 'DİKKATLİ OL' : 'RİSKLİ'}
                        </span>
                    </div>
                    {analysis.status === 'safe' ? <ShieldCheck className="text-emerald-500" size={24} /> : analysis.status === 'caution' ? <Shield className="text-amber-500" size={24} /> : <ShieldAlert className="text-rose-500" size={24} />}
                </div>
                <div className="z-10 mt-2">
                    <p className={`text-xs font-bold leading-snug opacity-80 line-clamp-2 ${textMain}`}>{analysis.message}</p>
                </div>
                 <div className={`absolute -right-4 -bottom-4 opacity-5 pointer-events-none`}><Shield size={80} /></div>
            </div>
            <div onClick={() => onExpand('weather')} className={`p-4 rounded-3xl border ${cardBg} flex flex-col justify-between aspect-[4/3] active:scale-95 transition-transform relative overflow-hidden`}>
                 <div className="flex justify-between items-start z-10">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black tracking-widest opacity-50 uppercase">HAVA</span>
                        <div className="flex items-center gap-1"><span className={`text-3xl font-black ${textMain}`}>{Math.round(weather?.temp || 0)}°</span></div>
                    </div>
                    {getWeatherIcon(weather?.weatherCode || 0, 28, isDark)}
                </div>
                <div className="flex items-end justify-between z-10">
                     <div className="flex flex-col"><span className="text-[10px] font-bold opacity-60">RÜZGAR</span><span className={`text-sm font-black ${textMain}`}>{Math.round(weather?.windSpeed || 0)} km/s</span></div>
                     <WindArrow dir={(weather?.windDirection || 0) - (bikeHeading || 0) + 180} />
                </div>
            </div>
            <div onClick={() => onExpand('radio')} className={`p-4 rounded-3xl border ${cardBg} flex flex-col justify-between aspect-[4/3] active:scale-95 transition-transform relative overflow-hidden group`}>
                <div className="flex justify-between items-start z-10">
                    <span className="text-[10px] font-black tracking-widest opacity-50 uppercase">RADYO</span>
                    {radioState.isPlaying ? <Volume2 className="text-cyan-500 animate-pulse" size={20} /> : <Radio className="opacity-40" size={20} />}
                </div>
                <div className="z-10">
                    {radioState.isPlaying ? (<><div className="text-xs font-bold text-cyan-500 mb-1">ÇALIYOR</div><div className={`text-sm font-black leading-tight line-clamp-1 ${textMain}`}>{RADIO_STATIONS[radioState.currentStation].name}</div></>) : (<div className="flex items-center justify-center h-full pb-4 opacity-40 font-bold text-xs">KAPALI</div>)}
                </div>
            </div>
            <div onClick={() => onExpand('speed')} className={`p-4 rounded-3xl border ${cardBg} flex flex-col justify-between aspect-[4/3] active:scale-95 transition-transform`}>
                <div className="flex justify-between items-start"><span className="text-[10px] font-black tracking-widest opacity-50 uppercase">İRTİFA</span><Mountain size={20} className="opacity-40" /></div>
                <div className="flex items-baseline gap-1"><span className={`text-2xl font-black ${textMain}`}>{Math.round(altitude || 0)}</span><span className="text-xs font-bold opacity-50">m</span></div>
                <div className="w-full bg-slate-200/20 rounded-full h-1.5 overflow-hidden mt-2"><div className="h-full bg-emerald-500 w-1/2"></div></div>
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
  const [longitudinalG, setLongitudinalG] = useState(0); // For accel/brake detection
  
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

  // Radio State
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [currentStation, setCurrentStation] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // UI State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [expandedView, setExpandedView] = useState<string | null>(null); 
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);

  const wakeLockRef = useRef<any>(null);
  const lastLocationUpdate = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());
  const lastSpeedRef = useRef<number>(0);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // NEW: Voice Assistant Logic
  const speak = (text: string) => {
      if (!isVoiceEnabled || !('speechSynthesis' in window)) return;
      
      // Cancel existing speech to avoid queue buildup
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'tr-TR';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
  };

  // Announce dangerous conditions
  useEffect(() => {
      if (analysis.status === 'danger' && isVoiceEnabled) {
          speak(`Dikkat. ${analysis.message}. ${analysis.roadCondition}`);
      } else if (analysis.status === 'caution' && isVoiceEnabled && Math.random() > 0.7) {
          // Occasional caution warnings
          speak(`Dikkat. ${analysis.message}`);
      }
  }, [analysis.status, analysis.message, isVoiceEnabled]);

  // Radio Logic: Effect for playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (radioPlaying) {
        const targetUrl = RADIO_STATIONS[currentStation].url;
        if (audio.src !== targetUrl) {
            audio.src = targetUrl;
            audio.load();
        }
        
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                if (error.name !== 'AbortError') {
                    console.error("Radio playback error:", error);
                    setRadioPlaying(false);
                }
            });
        }
    } else {
        audio.pause();
    }
  }, [radioPlaying, currentStation]);

  const handleRadioPlay = (idx: number) => {
      setCurrentStation(idx);
      setRadioPlaying(true);
  };

  const handleRadioStop = () => {
      setRadioPlaying(false);
  };

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
                    
                    setLongitudinalG(g); // Store directional G

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

  // NATIVE BACK BUTTON HANDLING (For APK/Android)
  useEffect(() => {
      const handlePopState = () => {
          if (expandedView) {
              setExpandedView(null);
          }
      };

      if (expandedView) {
          window.history.pushState({ modal: true }, "", "");
          window.addEventListener('popstate', handlePopState);
      }

      return () => {
          window.removeEventListener('popstate', handlePopState);
      };
  }, [expandedView]);

  const handleCloseModal = () => {
     window.history.back();
  };

  return (
    <div className={`${mainBg} w-full h-[100dvh] flex flex-col relative overflow-hidden font-sans select-none transition-colors duration-300`}>
        
        {/* HEADLESS AUDIO PLAYER */}
        <audio 
            ref={audioRef}
            onError={(e) => {
                const target = e.currentTarget as HTMLAudioElement;
                console.error("Radio Error:", target.error ? target.error.message : "Unknown", target.src);
                setRadioPlaying(false);
            }}
            onEnded={() => setRadioPlaying(false)}
            className="hidden"
            // Removed crossOrigin="anonymous" to allow opaque responses from radio servers (fixes format errors)
            preload="none"
        />

        <CalibrationModal isOpen={showCalibration} onClose={() => setShowCalibration(false)} offset={compassOffset} />
        
        {expandedView && (
            <DetailOverlay 
                type={expandedView} 
                data={expandedData} 
                onClose={handleCloseModal} 
                theme={theme}
                radioHandlers={{
                    isPlaying: radioPlaying,
                    currentStation: currentStation,
                    play: handleRadioPlay,
                    stop: handleRadioStop
                }}
            />
        )}

        {/* TOP BAR WITH SAFE AREA PADDING */}
        <div className="flex justify-between items-start px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 z-20 shrink-0">
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
             </div>
             
             <DigitalClock 
                 isDark={isDark} 
                 toggleTheme={toggleTheme} 
                 batteryLevel={batteryLevel} 
                 isVoiceEnabled={isVoiceEnabled} 
                 toggleVoice={() => {
                     const next = !isVoiceEnabled;
                     setIsVoiceEnabled(next);
                     if(next) speak("Sesli asistan aktif.");
                 }}
            />
        </div>

        {/* ACTIVE RADIO CONTROL - MAIN PAGE - NEW ADDITION */}
        {radioPlaying && !expandedView && (
            <div className="w-full px-6 mt-2 z-30 animate-in slide-in-from-top-4 fade-in duration-300">
                <button 
                    onClick={handleRadioStop}
                    className="w-full bg-slate-900/90 backdrop-blur-md border-l-4 border-rose-500 rounded-r-xl rounded-l-sm p-4 flex items-center justify-between shadow-2xl group active:bg-slate-800 transition-colors"
                >
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="relative shrink-0">
                             <span className="absolute inset-0 rounded-full animate-ping bg-rose-500/50"></span>
                             <div className="relative bg-slate-800 p-2 rounded-full text-rose-500">
                                <Volume2 size={20} className="animate-pulse" />
                             </div>
                        </div>
                        <div className="flex flex-col items-start overflow-hidden">
                            <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">CANLI YAYIN</span>
                            <span className="text-white font-black text-lg truncate leading-none">{RADIO_STATIONS[currentStation].name}</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 bg-rose-600/10 px-3 py-1.5 rounded-lg border border-rose-600/20 group-hover:bg-rose-600 group-hover:text-white transition-colors text-rose-500">
                        <span className="text-xs font-bold">DURDUR</span>
                        <StopCircle size={18} fill="currentColor" />
                    </div>
                </button>
            </div>
        )}

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
            maxLeft={maxLeft}
            maxRight={maxRight}
            accuracy={accuracy}
            longitudinalG={longitudinalG}
            gForce={gForce}
            radioState={{ isPlaying: radioPlaying, currentStation, stop: handleRadioStop }}
            isDark={isDark}
            onExpand={(type: string) => {
                setExpandedView(type);
                // Trigger voice explanation if Copilot is clicked and voice is enabled
                if(type === 'copilot' && isVoiceEnabled) {
                    speak(`${analysis.message}. ${analysis.roadCondition}`);
                }
            }}
        />

    </div>
  );
};

export default App;