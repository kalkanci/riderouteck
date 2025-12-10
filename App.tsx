import React, { useState, useEffect, useRef } from 'react';
import { Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, Navigation, Umbrella, Download, X, Battery, Shield, ShieldAlert, ShieldCheck, Bluetooth, Music, Headphones, Radar, ThermometerSnowflake, Glasses, Map, Play, Pause, SkipForward, SkipBack, User, Shuffle, Repeat, ArrowUp, ArrowDown, Radio, Signal, MapPin, Droplets, Navigation2 } from 'lucide-react';
import { WeatherData, CoPilotAnalysis, StationData, RadioStation } from './types';
import { getWeatherForPoint, reverseGeocode, getNearbyStations } from './services/api';

// --- RADIO STATIONS DATA ---
const RADIO_STATIONS: RadioStation[] = [
    { id: '1', name: 'Power FM', category: 'Yabancı Pop', streamUrl: 'https://listen.powerapp.com.tr/powerfm/mpeg/icecast.audio', color: 'bg-red-600' },
    { id: '2', name: 'Power Türk', category: 'Türkçe Pop', streamUrl: 'https://listen.powerapp.com.tr/powerturk/mpeg/icecast.audio', color: 'bg-red-700' },
    { id: '3', name: 'Fenomen', category: 'Hit Müzik', streamUrl: 'https://listen.radyofenomen.com/fenomen/128/icecast.audio', color: 'bg-purple-600' },
    { id: '4', name: 'Fenomen Türk', category: 'Türkçe Hit', streamUrl: 'https://listen.radyofenomen.com/fenomenturk/128/icecast.audio', color: 'bg-purple-700' },
    { id: '5', name: 'Metro FM', category: 'Yabancı Hit', streamUrl: 'https://stream.karnaval.com/metrofm', color: 'bg-blue-600' },
    { id: '6', name: 'Joy Türk', category: 'Slow Türkçe', streamUrl: 'https://stream.karnaval.com/joyturk', color: 'bg-orange-500' },
    { id: '7', name: 'Virgin Radio', category: 'Yabancı Pop', streamUrl: 'https://stream.karnaval.com/virginradio', color: 'bg-red-500' },
    { id: '8', name: 'Number 1', category: 'Hit', streamUrl: 'https://n10101m.mediatriple.net/numberoneturk', color: 'bg-blue-500' },
    { id: '9', name: 'Kral Pop', category: 'Türkçe Pop', streamUrl: 'https://moondigitalv2.radyotvonline.net/kralpop/playlist.m3u8', color: 'bg-orange-600' },
    { id: '10', name: 'Alem FM', category: 'Türkçe Pop', streamUrl: 'https://turkmedya.radyotvonline.com/turkmedya/alemfm.stream/playlist.m3u8', color: 'bg-cyan-600' },
    { id: '11', name: 'Best FM', category: 'Türkçe', streamUrl: 'https://bestfm.radyotvonline.net/bestfm/playlist.m3u8', color: 'bg-blue-800' },
    { id: '12', name: 'Show Radyo', category: 'Türkçe Pop', streamUrl: 'https://showradyo.radyotvonline.net/showradyo/playlist.m3u8', color: 'bg-yellow-500' },
];

// --- MATH UTILS ---
const toRad = (deg: number) => deg * Math.PI / 180;
const toDeg = (rad: number) => rad * 180 / Math.PI;

const calculateDestination = (lat: number, lng: number, bearing: number, distanceKm: number = 10): {lat: number, lng: number} => {
    const R = 6371; 
    const radDist = distanceKm / R;
    const radLat = toRad(lat);
    const radLng = toRad(lng);
    const radBearing = toRad(bearing);

    const newLat = Math.asin(Math.sin(radLat) * Math.cos(radDist) + 
                    Math.cos(radLat) * Math.sin(radDist) * Math.cos(radBearing));
    
    const newLng = radLng + Math.atan2(Math.sin(radBearing) * Math.sin(radDist) * Math.cos(radLat),
                            Math.cos(radDist) - Math.sin(radLat) * Math.sin(newLat));
    
    return {
        lat: toDeg(newLat),
        lng: toDeg(newLng)
    };
};

const calculateApparentWind = (
    bikeSpeedKmh: number, 
    bikeHeading: number, 
    windSpeedKmh: number, 
    windDirectionFrom: number
): number => {
    if (bikeSpeedKmh < 2) return windSpeedKmh; 
    const inducedDirRad = toRad(bikeHeading + 180);
    const inducedX = bikeSpeedKmh * Math.sin(inducedDirRad);
    const inducedY = bikeSpeedKmh * Math.cos(inducedDirRad);
    const trueDirRad = toRad(windDirectionFrom + 180); 
    const trueX = windSpeedKmh * Math.sin(trueDirRad);
    const trueY = windSpeedKmh * Math.cos(trueDirRad);
    const resX = inducedX + trueX;
    const resY = inducedY + trueY;
    return Math.round(Math.sqrt(resX * resX + resY * resY));
};

const calculateWindChill = (tempC: number, apparentWindKmh: number): number => {
    if (tempC > 25) return tempC; 
    const V = Math.max(apparentWindKmh, 5);
    const T = tempC;
    const vPow = Math.pow(V, 0.16);
    const chill = 13.12 + (0.6215 * T) - (11.37 * vPow) + (0.3965 * T * vPow);
    return Math.round(chill);
};

const getWeatherIcon = (code: number, size = 32, isDark = true) => {
    if (code === 0) return <Sun size={size} className="text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.8)]" />;
    if (code <= 3) return <Cloud size={size} className="text-slate-400" />;
    if (code <= 48) return <CloudFog size={size} className="text-slate-500" />;
    if (code <= 67) return <CloudRain size={size} className="text-cyan-500 drop-shadow-[0_0_15px_rgba(6,182,212,0.8)]" />;
    if (code <= 77) return <Snowflake size={size} className="text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]" />;
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

// --- SUB COMPONENTS ---

const WindRadar = ({ windSpeed, apparentWind, windDirection, bikeHeading, windChill }: any) => {
    // Relative angle: Where wind comes FROM relative to bike nose (0deg)
    // Formula: (WindDir - BikeHeading + 180) % 360 puts the source in correct position relative to "Up"
    const relativeWindAngle = (windDirection - bikeHeading + 180) % 360;
    
    // Determine impact direction for text
    const getImpactText = (angle: number) => {
        if (angle >= 315 || angle < 45) return "ÖNDEN ESİYOR";
        if (angle >= 45 && angle < 135) return "SAĞDAN ESİYOR";
        if (angle >= 135 && angle < 225) return "ARKADAN ESİYOR";
        return "SOLDAN ESİYOR";
    };

    const impactText = getImpactText(relativeWindAngle);

    const getColor = (speed: number) => {
        if (speed < 15) return "text-emerald-400";
        if (speed < 30) return "text-amber-400";
        return "text-rose-500";
    };

    const colorClass = getColor(apparentWind);
    const isHighWind = apparentWind > 25;

    return (
        <div className="relative flex flex-col items-center justify-between w-full h-full p-2 overflow-hidden">
            {/* Background Grids */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <div className="w-full h-px bg-white"></div>
                <div className="h-full w-px bg-white absolute"></div>
            </div>

            {/* Main Visual */}
            <div className="flex-1 w-full relative flex items-center justify-center">
                 {/* Bike Icon (Fixed Center) */}
                <div className="absolute z-10 p-2 bg-[#18181b] rounded-full border border-white/20 shadow-[0_0_15px_rgba(0,0,0,0.8)]">
                    <Navigation2 size={24} className="text-white fill-white stroke-[3px]" />
                </div>
                
                {/* Wind Flow Indicators (Rotating) */}
                <div 
                    className="absolute inset-0 flex items-center justify-center transition-transform duration-700 ease-out"
                    style={{ transform: `rotate(${relativeWindAngle}deg)` }}
                >
                    {/* The "Source" Arrow */}
                    <div className="absolute -top-4 flex flex-col items-center gap-1">
                         <div className={`w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[12px] ${apparentWind > 25 ? 'border-t-rose-500 animate-pulse' : 'border-t-cyan-400'}`}></div>
                         <div className={`w-0.5 h-6 bg-gradient-to-b ${apparentWind > 25 ? 'from-rose-500' : 'from-cyan-400'} to-transparent opacity-50`}></div>
                    </div>

                    {/* Streamlines representing wind hitting the bike */}
                    <div className="absolute -top-1 w-20 h-20 opacity-30 animate-pulse">
                         <div className={`w-full h-full border-t-4 rounded-full ${colorClass}`} style={{ clipPath: 'polygon(0 0, 100% 0, 50% 50%)'}}></div>
                    </div>
                </div>
            </div>

            {/* Impact Text */}
            <div className="absolute top-2 w-full text-center">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-black/40 border ${isHighWind ? 'border-rose-500/50 text-rose-400' : 'border-white/10 text-white/60'}`}>
                    {impactText}
                </span>
            </div>

            {/* Data Footer */}
            <div className="w-full flex justify-between items-end z-20 mt-1 px-1">
                 <div className="flex flex-col items-start">
                     <div className={`text-3xl font-bold leading-none tabular-nums tracking-tighter ${colorClass} drop-shadow-lg`}>{apparentWind}</div>
                     <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider">KM/S</div>
                 </div>
                 <div className="flex flex-col items-end">
                     <div className={`text-xl font-bold leading-none tabular-nums ${windChill < 10 ? 'text-cyan-300' : 'text-white'}`}>{windChill}°</div>
                     <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider">HİSSEDİLEN</div>
                 </div>
            </div>
        </div>
    );
};

const VisorTrigger = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className="group relative flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden transition-all duration-300 active:scale-95 hover:bg-white/10">
        <Glasses size={16} className="text-cyan-400" />
        <span className="text-xs font-bold text-white/90 tracking-widest uppercase">VİZÖR</span>
    </button>
);

const CompactRadioPlayer = ({ station, isPlaying, onToggle, onExpand }: any) => (
    <div onClick={onExpand} className="mx-6 mt-1 mb-2 bg-[#18181b]/80 backdrop-blur-md rounded-2xl p-2 flex items-center gap-3 border border-white/10 active:scale-95 transition-all shadow-lg animate-in slide-in-from-top-2">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${station ? station.color : 'bg-white/5'}`}>
            <Radio size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="text-xs font-bold text-white truncate">{station ? station.name : "Radyo Kapalı"}</div>
            <div className="text-[10px] text-white/50 truncate flex items-center gap-1">
                {station && isPlaying && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>}
                {station ? (isPlaying ? "Çalıyor..." : "Duraklatıldı") : "Bir istasyon seçin"}
            </div>
        </div>
        {station ? (
            <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="w-9 h-9 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg">
                {isPlaying ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" className="ml-0.5" />}
            </button>
        ) : (
            <div className="mr-2 text-white/20"><SkipForward size={16} /></div>
        )}
    </div>
);

const VisorOverlay = ({ windChill, apparentWind, rainProb, onClose, windDir, speed }: any) => {
    return (
        <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col items-center justify-between p-6 sm:p-8 font-mono select-none animate-in fade-in duration-300">
            {/* Top Bar */}
            <div className="w-full flex justify-between items-start z-50">
                <div className="text-neon-green flex flex-col">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">VİZÖR MODU</span>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                        <span className="text-xs font-bold text-white/80">CANLI</span>
                    </div>
                </div>
                <button onClick={onClose} className="p-3 bg-white/10 rounded-full active:bg-white/30 transition-colors"><X size={24} className="text-white" /></button>
            </div>

            <div className="flex flex-col items-center justify-center flex-1 w-full gap-0 -mt-8">
                <div className="flex flex-col items-center justify-center">
                    <span className="text-[40vw] sm:text-[15rem] font-['Chakra_Petch'] font-black leading-[0.85] text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)] tracking-tighter">
                        {Math.round(speed)}
                    </span>
                    <span className="text-sm sm:text-lg font-bold uppercase tracking-[0.5em] text-white/40 mt-0">KM/H</span>
                </div>
                <div className="flex items-center gap-4 mt-8 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                    <div className="flex flex-col items-end border-r border-white/10 pr-4">
                        <span className="text-3xl font-bold text-green-400 leading-none">{windChill}°</span>
                        <span className="text-[10px] uppercase tracking-wide text-white/50">HİSSEDİLEN</span>
                    </div>
                    <div className="flex flex-col items-start">
                        <span className="text-3xl font-bold text-cyan-400 leading-none">{apparentWind}</span>
                        <span className="text-[10px] uppercase tracking-wide text-white/50">RÜZGAR (KM)</span>
                    </div>
                </div>
            </div>
            <div className="w-full grid grid-cols-2 gap-4">
                 <div className="flex items-center justify-start gap-2 opacity-60">
                     <Navigation size={16} style={{transform: `rotate(${windDir}deg)`}}/>
                     <span className="text-xs font-bold uppercase">RÜZGAR YÖNÜ</span>
                 </div>
                 <div className="flex items-center justify-end gap-2">
                     <Umbrella size={16} className={rainProb > 0 ? "text-rose-400" : "text-white/30"} />
                     <span className={`text-xs font-bold uppercase ${rainProb > 0 ? "text-rose-400" : "text-white/30"}`}>YAĞIŞ %{rainProb}</span>
                 </div>
            </div>
        </div>
    );
};

const DetailOverlay = ({ type, data, onClose, radioHandlers }: any) => {
    if (!type) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all duration-300" onClick={onClose}>
            <div className={`w-full max-w-sm ${type === 'radio' ? 'h-auto max-h-[70vh]' : 'h-auto max-h-[85vh]'} rounded-3xl shadow-2xl flex flex-col overflow-hidden bg-[#18181b] border border-white/10 text-white transform transition-all duration-300 animate-in fade-in zoom-in-95`} onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-4 flex justify-between items-center shrink-0 border-b border-white/5 bg-white/5">
                    <h2 className="text-base font-bold tracking-tight flex items-center gap-2 text-white/90">
                         {type === 'radio' && <><Radio size={18} className="text-cyan-400"/> <span>Radyo Listesi</span></>}
                         {type === 'ahead' && <><Navigation size={18} className="text-emerald-400"/> <span>Rota Tahmini (10km)</span></>}
                         {type === 'weather' && <><Cloud size={18} className="text-blue-400"/> <span>Hava Detayı</span></>}
                         {type === 'copilot' && <><ShieldCheck size={18} className="text-amber-400"/> <span>Co-Pilot Analizi</span></>}
                         {type === 'speed' && <><Navigation size={18} className="text-purple-400"/> <span>Sürüş Özeti</span></>}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"><X size={20} /></button>
                </div>
                
                <div className={`flex-1 overflow-y-auto no-scrollbar ${type === 'radio' ? 'p-0' : 'p-4'}`}>
                     {type === 'radio' && (
                        <div className="flex flex-col bg-[#121214]">
                             <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 p-2">
                                 {RADIO_STATIONS.map((station) => (
                                     <button 
                                        key={station.id} 
                                        onClick={() => { radioHandlers.playStation(station); onClose(); }}
                                        className={`w-full p-3 rounded-xl border transition-all flex items-center gap-3 group ${radioHandlers.currentStation?.id === station.id ? 'bg-white/10 border-white/20' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                                     >
                                         <div className={`w-10 h-10 rounded-lg ${station.color} flex items-center justify-center text-white font-bold shadow-lg shrink-0`}>
                                             {station.name.substring(0,1)}
                                         </div>
                                         <div className="flex flex-col items-start flex-1 min-w-0">
                                             <span className={`text-sm font-bold truncate w-full text-left ${radioHandlers.currentStation?.id === station.id ? 'text-white' : 'text-white/80'}`}>{station.name}</span>
                                             <span className="text-[10px] text-white/40">{station.category}</span>
                                         </div>
                                         {radioHandlers.currentStation?.id === station.id && radioHandlers.isPlaying && (
                                              <div className="flex gap-[2px] items-end h-3 mr-2">
                                                 <span className="w-[2px] bg-cyan-400 animate-[bounce_1s_infinite]"></span>
                                                 <span className="w-[2px] bg-cyan-400 animate-[bounce_1.5s_infinite]"></span>
                                                 <span className="w-[2px] bg-cyan-400 animate-[bounce_0.8s_infinite]"></span>
                                              </div>
                                         )}
                                     </button>
                                 ))}
                             </div>
                        </div>
                     )}
                     {type === 'copilot' && <div className="p-4 bg-white/5 border border-white/10 rounded-2xl"><p className="text-base font-medium leading-relaxed text-white/90">{data.analysis.message}</p><p className="mt-2 text-sm text-white/50">{data.analysis.roadCondition}</p></div>}
                     {type === 'weather' && (
                         <div className="space-y-3">
                             <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center">
                                {getWeatherIcon(data.weather?.weatherCode || 0, 48, true)}
                                <div className="text-5xl font-thin tracking-tighter mt-2">{Math.round(data.weather?.temp || 0)}°</div>
                             </div>
                             <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-400/20">
                                    <div className="text-[10px] font-bold text-cyan-400 uppercase">HİSSEDİLEN</div>
                                    <div className="text-2xl font-bold">{data.windChill}°</div>
                                </div>
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                                    <div className="text-[10px] font-bold opacity-50 uppercase">RÜZGAR</div>
                                    <div className="text-2xl font-bold">{data.apparentWind} <span className="text-xs font-normal">km</span></div>
                                </div>
                             </div>
                         </div>
                     )}
                     {type === 'ahead' && (
                         <div className="space-y-4">
                             <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-900/40 to-emerald-900/10 border border-emerald-500/30 flex flex-col items-center justify-center">
                                <h3 className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-2">10 KM Sonra Tahmin</h3>
                                {data.aheadWeather ? (
                                    <>
                                        {getWeatherIcon(data.aheadWeather.weatherCode, 56, true)}
                                        <div className="text-5xl font-bold tracking-tighter mt-2">{Math.round(data.aheadWeather.temp)}°</div>
                                        <div className="flex gap-4 mt-2">
                                            <span className={`text-sm font-bold ${data.aheadWeather.rainProb > 20 ? 'text-blue-300' : 'text-white/50'}`}>%{data.aheadWeather.rainProb} Yağış</span>
                                            <span className="text-sm font-bold text-white/50">{Math.round(data.aheadWeather.windSpeed)} km/s Rüzgar</span>
                                        </div>
                                    </>
                                ) : ( <span className="text-white/50">Hesaplanıyor...</span> )}
                             </div>
                         </div>
                     )}
                     {type === 'speed' && (
                         <div className="grid grid-cols-2 gap-3">
                             <div className="bg-white/5 border border-white/10 p-4 rounded-2xl"><div className="text-[10px] font-bold opacity-40 mb-1">MAX HIZ</div><div className="text-3xl font-light tracking-tighter">{Math.round(data.maxSpeed)}</div></div>
                             <div className="bg-white/5 border border-white/10 p-4 rounded-2xl"><div className="text-[10px] font-bold opacity-40 mb-1">MESAFE</div><div className="text-3xl font-light tracking-tighter">{data.tripDistance.toFixed(1)} <span className="text-base opacity-50">km</span></div></div>
                         </div>
                     )}
                </div>
            </div>
        </div>
    );
};

const CalibrationModal = ({ isOpen, onClose, offset, setOffset }: any) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-[#1e1e20] p-6 rounded-3xl w-full max-w-sm border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Pusula Kalibrasyonu</h2>
                <div className="flex items-center justify-between mb-6 bg-black/20 p-4 rounded-xl">
                    <button onClick={() => setOffset((p: number) => p - 1)} className="p-4 bg-white/5 rounded-full hover:bg-white/10 active:scale-95"><ArrowDown size={24} className="-rotate-90" /></button>
                    <div className="flex flex-col items-center">
                        <span className="text-3xl font-mono font-bold">{offset}°</span>
                        <span className="text-xs opacity-50 uppercase">SAPMA</span>
                    </div>
                    <button onClick={() => setOffset((p: number) => p + 1)} className="p-4 bg-white/5 rounded-full hover:bg-white/10 active:scale-95"><ArrowUp size={24} className="rotate-90" /></button>
                </div>
                <div className="text-xs text-white/50 mb-6 text-center leading-relaxed">
                    Telefonunuzun manyetik sensörü montaj açısına göre sapma gösterebilir. GPS yönü ile eşleşmesi için ayarlayın.
                </div>
                <button onClick={() => { localStorage.setItem('compassOffset', offset.toString()); onClose(); }} className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl transition-colors">KAYDET</button>
            </div>
        </div>
    );
};

const DigitalClock = ({ isDark, toggleTheme, batteryLevel, btDevice, onConnectBt, isFocusMode }: any) => {
    const [time, setTime] = useState(new Date());
    useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

    return (
        <div className={`flex flex-col items-end transition-opacity duration-500 ${isFocusMode ? 'opacity-0' : 'opacity-100'}`}>
             <div className="text-3xl font-bold tracking-tight leading-none tabular-nums font-mono">{time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
             <div className="flex items-center gap-3 mt-1.5 opacity-60">
                 <button onClick={onConnectBt} className={`flex items-center gap-1.5 ${btDevice ? 'text-blue-400' : 'text-white/50'}`}>
                     {btDevice ? <Headphones size={14} /> : <Bluetooth size={14} />}
                     {btDevice && <span className="text-[10px] font-bold uppercase max-w-[60px] truncate">{btDevice.level ? `${btDevice.level}%` : 'BAĞLI'}</span>}
                 </button>
                 <div className="w-px h-3 bg-white/20"></div>
                 <div className="flex items-center gap-1.5">
                     <span className="text-[10px] font-bold">{Math.round(batteryLevel)}%</span>
                     <div className="relative">
                        <Battery size={14} className={batteryLevel < 20 ? 'text-red-500' : 'text-white'} />
                        <div className={`absolute top-[3px] left-[2px] bottom-[3px] w-[8px] bg-current rounded-[1px] ${batteryLevel < 20 ? 'bg-red-500' : 'bg-white'}`} style={{width: `${batteryLevel * 0.08}px`}}></div>
                     </div>
                 </div>
             </div>
        </div>
    );
};

const DigitalSpeedDisplay = ({ speed, onClick }: any) => {
    return (
        <div onClick={onClick} className="flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform duration-200 z-30">
             <div className="relative">
                 <span className="text-[28vw] sm:text-[180px] font-['Chakra_Petch'] font-black leading-[0.8] tracking-tighter tabular-nums text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                     {Math.round(speed)}
                 </span>
             </div>
             <span className="text-sm sm:text-xl font-bold text-white/40 tracking-[0.5em] uppercase mt-2 ml-4">KM/H</span>
        </div>
    );
};

const EnvGrid = ({ weather, aheadWeather, analysis, bikeHeading, tripDistance, currentStation, isPlaying, isDark, onExpand, btDevice, onConnectBt, windChill, apparentWind, isFocusMode, stations, onTogglePlay }: any) => {
    return (
        <div className={`grid grid-cols-2 gap-3 px-4 pb-6 w-full max-w-lg mx-auto transition-all duration-700 ${isFocusMode ? 'translate-y-20 opacity-0' : 'translate-y-0 opacity-100'}`}>
            
            {/* 1. Dynamic Wind Radar (Top Left) */}
            <div onClick={() => onExpand('weather')} className="col-span-1 aspect-square bg-white/5 border border-white/10 rounded-3xl relative overflow-hidden active:scale-95 transition-transform shadow-lg">
                {weather ? (
                    <WindRadar windSpeed={weather.windSpeed} apparentWind={apparentWind} windDirection={weather.windDirection} bikeHeading={bikeHeading} windChill={windChill} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20"><Wind size={32} className="animate-pulse" /></div>
                )}
            </div>

            {/* 2. 10KM Route Forecast (Top Right) - NEW */}
            <div onClick={() => onExpand('ahead')} className="col-span-1 aspect-square bg-emerald-950/20 border border-emerald-500/20 rounded-3xl p-3 relative active:scale-95 transition-transform flex flex-col justify-between group overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-30 group-hover:opacity-60 transition-opacity"><Navigation size={20} className="text-emerald-400"/></div>
                 <div className="z-10">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 mb-0.5">10 KM ROTA</div>
                    <div className="text-[9px] font-medium text-white/40 leading-none">TAHMİNİ DURUM</div>
                </div>
                <div className="z-10 flex flex-col items-start mt-1">
                     {aheadWeather ? (
                         <>
                            <div className="flex items-center gap-2">
                                {getWeatherIcon(aheadWeather.weatherCode, 28, true)}
                                <div className="text-4xl font-bold tracking-tighter">{Math.round(aheadWeather.temp)}°</div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-auto">
                                <Droplets size={12} className={aheadWeather.rainProb > 20 ? 'text-blue-400' : 'text-white/30'}/> 
                                <span className={`text-xs font-bold ${aheadWeather.rainProb > 20 ? 'text-blue-300' : 'text-white/50'}`}>%{aheadWeather.rainProb}</span>
                            </div>
                         </>
                     ) : (
                         <div className="text-xs text-white/30 animate-pulse mt-2">Hesaplanıyor...</div>
                     )}
                </div>
            </div>

            {/* 3. Current Weather Overview (Bottom Left) */}
            <div onClick={() => onExpand('weather')} className="col-span-1 aspect-square bg-white/5 border border-white/10 rounded-3xl p-4 relative active:scale-95 transition-transform flex flex-col justify-between items-start group">
                 <div className="absolute top-3 right-3 opacity-30"><MapPin size={16}/></div>
                 <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">MEVCUT KONUM</div>
                 {weather ? (
                     <>
                        <div className="self-center mt-1 scale-125">{getWeatherIcon(weather.weatherCode, 40, true)}</div>
                        <div className="w-full flex justify-between items-end">
                            <div className="text-2xl font-light tracking-tighter">{Math.round(weather.temp)}°</div>
                            <div className="text-[10px] font-bold text-white/50 mb-1">%{weather.rainProb} Yağış</div>
                        </div>
                     </>
                 ) : (
                     <div className="flex-1 flex items-center justify-center opacity-30">...</div>
                 )}
            </div>

            {/* 4. CoPilot (Bottom Right) */}
            <div onClick={() => onExpand('copilot')} className="col-span-1 aspect-square bg-gradient-to-br from-white/10 to-transparent border border-white/5 rounded-3xl p-4 flex flex-col justify-between active:scale-95 transition-transform relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><ShieldCheck size={32} /></div>
                 <div>
                     <div className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${analysis.color.replace('text-', 'text-')}`}>CO-PILOT</div>
                     <div className={`text-base font-bold leading-none tracking-tight text-white`}>{analysis.status === 'safe' ? 'GÜVENLİ' : analysis.status === 'caution' ? 'DİKKAT' : 'RİSKLİ'}</div>
                 </div>
                 <div className="text-[9px] font-medium text-white/60 leading-snug line-clamp-2 mt-auto">
                     {analysis.message}
                 </div>
            </div>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const [speed, setSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [tripDistance, setTripDistance] = useState(0);
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number>(0);
  const [compassOffset, setCompassOffset] = useState<number>(() => parseInt(localStorage.getItem('compassOffset') || '0'));
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [aheadWeather, setAheadWeather] = useState<WeatherData | null>(null); 
  const [nearbyStations, setNearbyStations] = useState<StationData[]>([]);
  const [locationName, setLocationName] = useState<string>("");
  const [analysis, setAnalysis] = useState<CoPilotAnalysis>(analyzeConditions(null));
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [btDevice, setBtDevice] = useState<{name: string, level: number | null} | null>(() => {
      const saved = localStorage.getItem('lastBtDevice');
      return saved ? { name: saved, level: null } : null;
  });
  
  // Radio States
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [expandedView, setExpandedView] = useState<string | null>(null); 
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isVisorMode, setIsVisorMode] = useState(false);
  
  const wakeLockRef = useRef<any>(null);
  const lastLocationUpdate = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());
  const lastSpeedRef = useRef<number>(0);
  const lastAheadCheck = useRef<number>(0);
  const lastAlertTime = useRef<number>(0); 

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const isDark = theme === 'dark';
  const isFocusMode = speed > 100;

  // --- RADIO LOGIC ---
  useEffect(() => {
    if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.crossOrigin = "anonymous";
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentStation) {
        if (audio.src !== currentStation.streamUrl) {
            audio.src = currentStation.streamUrl;
            audio.load();
        }
        if (isPlaying) {
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error("Radio playback failed:", error);
                    setIsPlaying(false);
                });
            }
        } else {
            audio.pause();
        }
    } else {
        audio.pause();
        audio.src = "";
    }
  }, [currentStation, isPlaying]);

  const radioHandlers = {
      currentStation,
      isPlaying,
      togglePlay: () => setIsPlaying(!isPlaying),
      playStation: (station: RadioStation) => {
          if (currentStation?.id === station.id) {
              setIsPlaying(!isPlaying);
          } else {
              setCurrentStation(station);
              setIsPlaying(true);
          }
      }
  };

  // --- SENSORS & GENERAL LOGIC ---

  // Battery
  useEffect(() => {
    const nav = navigator as any;
    if (nav && typeof nav.getBattery === 'function') {
        nav.getBattery().then((battery: any) => {
            if (battery) {
                setBatteryLevel(battery.level * 100);
                if (typeof battery.addEventListener === 'function') {
                    battery.addEventListener('levelchange', () => setBatteryLevel(battery.level * 100));
                }
            }
        }).catch((e: any) => console.log('Battery API error', e));
    }
  }, []);

  // Install Prompt
  useEffect(() => { const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); }; window.addEventListener('beforeinstallprompt' as any, handler); return () => window.removeEventListener('beforeinstallprompt' as any, handler); }, []);
  const handleInstallClick = () => { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then(() => setDeferredPrompt(null)); } };

  // Wake Lock (Silenced for Preview)
  const requestWakeLock = async () => { 
      if ('wakeLock' in navigator) { 
          try { 
              wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); 
          } catch (e) { 
          } 
      } 
  };
  useEffect(() => { requestWakeLock(); const handleVisibility = () => { if (document.visibilityState === 'visible') requestWakeLock(); }; document.addEventListener('visibilitychange', handleVisibility); return () => document.removeEventListener('visibilitychange', handleVisibility); }, [isVisorMode]);

  // Bluetooth Logic
  const handleConnectBluetooth = async () => {
    if (!(navigator as any).bluetooth) {
        const names = ["INTERCOM X1", "SENA 50S", "CARDO PACKTALK", "AIRPODS PRO"];
        const next = names[Math.floor(Math.random() * names.length)];
        setBtDevice({ name: next, level: 85 });
        localStorage.setItem('lastBtDevice', next);
        return;
    }
    try {
        const device = await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['battery_service'] });
        if (device && device.name) {
            setBtDevice({ name: device.name, level: null });
            localStorage.setItem('lastBtDevice', device.name);
        }
    } catch (e) { console.log("Bluetooth cancelled", e); }
  };

  // Speech Logic
  const speak = (text: string) => {
      if (!isVoiceEnabled || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const googleTr = voices.find(v => v.lang.includes('tr') && v.name.includes('Google'));
      if (googleTr) utterance.voice = googleTr;
      utterance.lang = 'tr-TR';
      window.speechSynthesis.speak(utterance);
  };

  // Sensors & GPS
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
        let rawHeading = 0;
        if ((e as any).webkitCompassHeading) rawHeading = (e as any).webkitCompassHeading;
        else if (e.alpha !== null) rawHeading = 360 - e.alpha;
        setDeviceHeading(rawHeading);
    };

    const handleAbsoluteOrientation = (e: any) => { if (e.alpha !== null) setDeviceHeading(360 - e.alpha); };

    const requestSensors = async () => {
        const DeviceOrientationEvent = (window as any).DeviceOrientationEvent;
        if (DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try { 
                const r = await DeviceOrientationEvent.requestPermission(); 
                if (r === 'granted') (window as any).addEventListener('deviceorientation', handleOrientation);
            } catch (e) {}
        } else {
            if ('ondeviceorientationabsolute' in window) (window as any).addEventListener('deviceorientationabsolute', handleAbsoluteOrientation);
            else if (DeviceOrientationEvent) (window as any).addEventListener('deviceorientation', handleOrientation);
        }
    };
    requestSensors();

    let watchId: number;
    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
            async (pos) => {
                const { speed: spd, heading: hdg, latitude, longitude } = pos.coords;
                const kmh = spd ? spd * 3.6 : 0;
                const safeKmh = kmh < 2 ? 0 : kmh;
                const now = Date.now();
                const timeDelta = (now - lastTimeRef.current) / 1000;
                lastTimeRef.current = now;

                lastSpeedRef.current = safeKmh;
                setSpeed(safeKmh);
                if (safeKmh > maxSpeed) setMaxSpeed(safeKmh);
                if (safeKmh > 5) setTripDistance(prev => prev + (safeKmh * (timeDelta / 3600)));
                setGpsHeading(hdg);

                if (now - lastLocationUpdate.current > 300000) { 
                    lastLocationUpdate.current = now;
                    const [w, addr, stations] = await Promise.all([
                        getWeatherForPoint(latitude, longitude), 
                        reverseGeocode(latitude, longitude),
                        getNearbyStations(latitude, longitude)
                    ]);
                    setWeather(w); setLocationName(addr); setAnalysis(analyzeConditions(w));
                    setNearbyStations(stations);
                }

                if (safeKmh > 20 && now - lastAheadCheck.current > 300000 && hdg !== null) {
                    lastAheadCheck.current = now;
                    const dest = calculateDestination(latitude, longitude, hdg, 10);
                    getWeatherForPoint(dest.lat, dest.lng).then(w => setAheadWeather(w));
                }
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    }
    return () => { 
        (window as any).removeEventListener('deviceorientation', handleOrientation); 
        (window as any).removeEventListener('deviceorientationabsolute', handleAbsoluteOrientation);
        if (watchId) navigator.geolocation.clearWatch(watchId); 
    };
  }, [maxSpeed]);

  const isGpsHeadingUsed = speed > 5 && gpsHeading !== null && !isNaN(gpsHeading);
  const calibratedMagneticHeading = (deviceHeading + compassOffset + 360) % 360;
  const effectiveHeading = isGpsHeadingUsed ? (gpsHeading || 0) : calibratedMagneticHeading;
  const apparentWind = weather ? calculateApparentWind(speed, effectiveHeading, weather.windSpeed, weather.windDirection) : 0;
  const windChill = weather ? calculateWindChill(weather.temp, apparentWind) : (weather?.temp || 0);

  // Smart Alerts
  const checkSmartAlerts = () => {
      if (!isVoiceEnabled || !weather) return;
      const now = Date.now();
      const COOLDOWN = 180000;
      if (now - lastAlertTime.current < COOLDOWN) return;

      let alertMsg = "";
      if (apparentWind > 55) alertMsg = `Dikkat, rüzgar direnci çok yüksek. Şiddet ${apparentWind} kilometreye ulaştı.`;
      else if (windChill < 10 && weather.temp > 15) alertMsg = `Hızlandıkça hissedilen sıcaklık ${Math.round(windChill)} dereceye düştü.`;
      
      if (alertMsg) { speak(alertMsg); lastAlertTime.current = now; }
  };

  useEffect(() => { if (speed > 30) checkSmartAlerts(); }, [speed, aheadWeather, apparentWind, windChill]);

  const expandedData = { maxSpeed, tripDistance, weather, aheadWeather, apparentWind, windChill, analysis, stations: nearbyStations };
  const showRainWarning = weather && (weather.rainProb > 20 || weather.rain > 0.1);
  const showAheadWarning = aheadWeather && (aheadWeather.rainProb > 40 && (!weather || weather.rainProb < 20));

  useEffect(() => { const handlePopState = () => { if (expandedView) setExpandedView(null); }; if (expandedView) { window.history.pushState({ modal: true }, "", ""); window.addEventListener('popstate', handlePopState); } return () => { window.removeEventListener('popstate', handlePopState); }; }, [expandedView]);
  const handleCloseModal = () => window.history.back();

  return (
    <div className="bg-transparent w-full h-[100dvh] flex flex-col relative overflow-hidden font-sans select-none text-white">
        {/* Simple Background Scene */}
        <div className="scene-container">
            <div className="tech-grid"></div>
        </div>

        <CalibrationModal isOpen={showCalibration} onClose={() => setShowCalibration(false)} offset={compassOffset} setOffset={setCompassOffset} />
        {expandedView && <DetailOverlay type={expandedView} data={expandedData} onClose={handleCloseModal} theme={theme} radioHandlers={radioHandlers} />}
        {isVisorMode && <VisorOverlay windChill={windChill} apparentWind={apparentWind} rainProb={weather?.rainProb || 0} onClose={() => setIsVisorMode(false)} windDir={(weather?.windDirection || 0) - effectiveHeading + 180} speed={speed} />}

        <div className={`flex justify-between items-start px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 z-20 shrink-0 transition-opacity duration-700 ${isFocusMode ? 'opacity-20 hover:opacity-100' : 'opacity-100'}`}>
             <div className="flex flex-col gap-4">
                 <VisorTrigger onClick={() => setIsVisorMode(true)} />
                 <div className="flex items-center gap-3 active:scale-95 transition-transform" onClick={() => setShowCalibration(true)}>
                     {deferredPrompt && <button onClick={handleInstallClick} className="flex items-center gap-2 bg-cyan-600/20 border border-cyan-500/50 text-cyan-400 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse hover:bg-cyan-600/40 transition-colors"><Download size={14} /> YÜKLE</button>}
                     {!deferredPrompt && <div className="flex flex-col"><div className="flex items-center gap-2"><Navigation size={14} className="text-white/70" style={{ transform: `rotate(${effectiveHeading || 0}deg)` }} /><span className="text-xs font-bold truncate max-w-[120px] text-white/70">{locationName || "Konum Aranıyor..."}</span></div></div>}
                 </div>
             </div>
             <div className="absolute left-1/2 -translate-x-1/2 top-[max(1.8rem,env(safe-area-inset-top))]"></div>
             <DigitalClock isDark={isDark} toggleTheme={toggleTheme} batteryLevel={batteryLevel} btDevice={btDevice} onConnectBt={handleConnectBluetooth} isFocusMode={isFocusMode} />
        </div>

        {/* Compact Top Radio Player */}
        <CompactRadioPlayer 
            station={currentStation} 
            isPlaying={isPlaying} 
            onToggle={radioHandlers.togglePlay} 
            onExpand={() => setExpandedView('radio')} 
        />

        {(showRainWarning || showAheadWarning) && !isVisorMode && (
            <div className={`w-full px-6 mt-4 mb-0 z-30 transition-opacity duration-500 ${isFocusMode ? 'opacity-20 hover:opacity-100' : 'opacity-100'}`}>
                {showRainWarning && ( <div className="w-full bg-cyan-900/60 backdrop-blur-xl border border-cyan-500/50 rounded-2xl py-3 px-4 flex items-center justify-center gap-3 animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.3)] mb-2"><Umbrella className="text-cyan-400" size={18} /><span className="text-cyan-200 text-xs font-bold tracking-widest">YAĞIŞ BEKLENİYOR (%{weather?.rainProb})</span></div> )}
                {showAheadWarning && ( <div className="w-full bg-rose-900/60 backdrop-blur-xl border border-rose-500/50 rounded-2xl py-3 px-4 flex items-center justify-center gap-3 animate-pulse shadow-[0_0_20px_rgba(244,63,94,0.3)]"><Radar className="text-rose-400" size={18} /><span className="text-rose-200 text-xs font-bold tracking-widest">10KM İLERİDE YAĞMUR!</span></div> )}
            </div>
        )}

        <div className="flex-1 flex flex-col justify-center items-center relative z-10 w-full min-h-0 -mt-8">
             <DigitalSpeedDisplay speed={speed} onClick={() => setExpandedView('speed')} />
        </div>

        <EnvGrid weather={weather} aheadWeather={aheadWeather} analysis={analysis} bikeHeading={effectiveHeading} tripDistance={tripDistance} currentStation={currentStation} isPlaying={isPlaying} isDark={isDark} onExpand={(type: string) => { setExpandedView(type); if(type === 'copilot' && isVoiceEnabled) speak(`${analysis.message}. ${analysis.roadCondition}`); }} btDevice={btDevice} onConnectBt={handleConnectBluetooth} windChill={windChill} apparentWind={apparentWind} isFocusMode={isFocusMode} stations={nearbyStations} onTogglePlay={radioHandlers.togglePlay} />
    </div>
  );
};

export default App;