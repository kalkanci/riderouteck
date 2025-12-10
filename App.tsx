import React, { useState, useEffect, useRef } from 'react';
import { Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, Navigation, Clock, Umbrella, Download, X, Battery, Shield, ShieldAlert, ShieldCheck, Bluetooth, Radio, Music, Headphones, Volume2, StopCircle, Radar, ThermometerSnowflake, Glasses, Map } from 'lucide-react';
import { WeatherData, CoPilotAnalysis, StationData, RadioStation } from './types';
import { getWeatherForPoint, reverseGeocode, getNearbyStations } from './services/api';

// --- CONFIGURATION ---
const RADIO_STATIONS: RadioStation[] = [
    { name: "Süper FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/SUPER_FM_SC" },
    { name: "Joy Türk", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/JOY_TURK_SC" },
    { name: "Metro FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/METRO_FM_SC" },
    { name: "Virgin Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/VIRGIN_RADIO_TR_SC" },
    { name: "Joy FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/JOY_FM_SC" },
    { name: "Fenomen", url: "https://listen.radyofenomen.com/fenomen/128/icecast.audio" }
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

// --- SUB COMPONENTS (Moved outside App for performance) ---

const VisorTrigger = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className="group relative flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden transition-all duration-300 active:scale-95 hover:bg-white/10 hover:border-cyan-500/30 hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
        <Glasses size={18} className="text-cyan-400 group-hover:scale-110 transition-transform duration-300" />
        <span className="text-xs font-bold text-white/90 tracking-[0.2em] uppercase">VİZÖR</span>
    </button>
);

const VisorOverlay = ({ windChill, apparentWind, rainProb, onClose, windDir }: any) => {
    return (
        <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col items-center justify-between p-8 font-mono select-none animate-in fade-in duration-300">
            <div className="w-full flex justify-between items-start">
                <div className="text-neon-green flex flex-col">
                    <span className="text-xs uppercase tracking-[0.2em] text-white/50">VİZÖR MODU</span>
                    <Clock className="text-green-400 mt-2 animate-pulse" />
                </div>
                <button onClick={onClose} className="p-4 bg-white/10 rounded-full active:bg-white/30 transition-colors"><X size={32} className="text-white" /></button>
            </div>
            <div className="flex flex-col items-center justify-center flex-1 w-full gap-4">
                <div className="flex flex-col items-center">
                    <span className="text-[25vw] sm:text-[12rem] font-black leading-none text-green-400 drop-shadow-[0_0_20px_rgba(74,222,128,0.5)] tracking-tighter">{windChill}°</span>
                    <span className="text-2xl font-bold uppercase tracking-widest text-green-200/80 mt-[-10px]">Hissedilen</span>
                </div>
            </div>
            <div className="w-full grid grid-cols-2 gap-8 mb-8">
                <div className="flex flex-col items-start border-l-4 border-cyan-400 pl-6">
                    <div className="flex items-center gap-3 mb-1"><Wind className="text-cyan-400" size={32} /><span className="text-4xl font-bold text-white">{apparentWind}</span></div>
                    <span className="text-sm font-bold text-cyan-400/80 uppercase tracking-widest">Rüzgar (km/s)</span>
                    <div className="mt-2 flex items-center gap-2 text-white/50 text-xs"><Navigation size={12} style={{transform: `rotate(${windDir}deg)`}}/> YÖN</div>
                </div>
                <div className="flex flex-col items-end border-r-4 border-rose-500 pr-6 text-right">
                    <div className="flex items-center justify-end gap-3 mb-1"><span className={`text-4xl font-bold ${rainProb > 0 ? 'text-rose-400' : 'text-white'}`}>%{rainProb}</span><Umbrella className={rainProb > 0 ? "text-rose-400" : "text-white/30"} size={32} /></div>
                    <span className="text-sm font-bold text-rose-400/80 uppercase tracking-widest">Yağış Riski</span>
                    <div className="mt-2 text-white/50 text-xs">{rainProb > 20 ? "DİKKAT KAYGAN ZEMİN" : "ZEMİN KURU"}</div>
                </div>
            </div>
        </div>
    );
};

const DetailOverlay = ({ type, data, onClose, radioHandlers }: any) => {
    if (!type) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all duration-500 ios-ease" onClick={onClose}>
            <div className="w-full max-w-md max-h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden bg-[#121214]/80 backdrop-blur-2xl border border-white/10 text-white transform transition-all duration-500 ios-ease animate-in fade-in zoom-in-95 slide-in-from-bottom-8" onClick={e => e.stopPropagation()}>
                <div className="p-5 flex justify-between items-center shrink-0 border-b border-white/5">
                    <h2 className="text-lg font-bold tracking-tight flex items-center gap-2 text-white/90">
                         <span>{type === 'speed' ? 'Sürüş Özeti' : type === 'weather' ? 'Detaylı Hava Durumu' : type === 'copilot' ? 'Taktiksel Analiz' : type === 'radio' ? 'Radyo Paneli' : 'Çevre İstasyonlar'}</span>
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"><X size={20} className="text-white/80" /></button>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar p-6">
                     {type === 'radio' && (
                        <div className="grid grid-cols-2 gap-3">
                            {RADIO_STATIONS.map((station, idx) => {
                                const isActive = radioHandlers.currentStation === idx && radioHandlers.isPlaying;
                                return (
                                    <button key={idx} onClick={() => radioHandlers.play(idx)} className={`p-4 rounded-3xl border flex flex-col items-center justify-center gap-2 transition-all duration-300 ${isActive ? 'border-cyan-500/50 bg-cyan-500/20' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
                                        <Music size={24} className={isActive ? 'text-cyan-400' : 'text-white/40'} />
                                        <span className={`text-xs font-bold ${isActive ? 'text-cyan-100' : 'text-white/60'}`}>{station.name}</span>
                                    </button>
                                )
                            })}
                        </div>
                     )}
                     {type === 'copilot' && <div className="p-6 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-3xl"><p className="text-lg font-medium leading-relaxed text-white/90">{data.analysis.message}</p><p className="mt-2 text-sm text-white/50">{data.analysis.roadCondition}</p></div>}
                     {type === 'weather' && (
                         <div className="space-y-4">
                             <div className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md flex flex-col items-center justify-center text-center">
                                <h3 className="text-xs font-bold opacity-40 uppercase mb-2 tracking-widest">Anlık Durum</h3>
                                {getWeatherIcon(data.weather?.weatherCode || 0, 64, true)}
                                <div className="text-6xl font-thin tracking-tighter mt-2">{Math.round(data.weather?.temp || 0)}°</div>
                                <div className="text-sm font-medium text-white/60 mt-1 capitalize">Gerçek Sıcaklık</div>
                             </div>
                             <div className="p-5 rounded-3xl bg-cyan-500/10 border border-cyan-400/20 backdrop-blur-md flex items-center justify-between">
                                 <div className="flex flex-col"><span className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-1">MOTORCU HİSSEDİLEN</span><span className="text-4xl font-light text-white tracking-tighter">{data.windChill}°</span><span className="text-[10px] text-white/50 mt-1">Sürüş Hızı + Rüzgar Etkisi</span></div>
                                 <div className="text-right"><div className="flex items-center gap-1 justify-end text-white/80"><Wind size={14} /><span className="text-lg font-bold">{data.apparentWind}</span><span className="text-xs">km/s</span></div><span className="text-[10px] text-white/40">Efektif Rüzgar</span></div>
                             </div>
                             <div className="p-5 rounded-3xl bg-indigo-500/10 border border-indigo-400/20 relative overflow-hidden backdrop-blur-md mt-2">
                                <div className="absolute top-0 right-0 p-3 opacity-20"><Radar size={60} className="text-indigo-400"/></div>
                                <h3 className="text-xs font-bold text-indigo-300 uppercase mb-3 tracking-widest">10 KM İlerisi (Tahmin)</h3>
                                {data.aheadWeather ? (
                                    <div className="flex justify-between items-center relative z-10">
                                        <div className="flex items-center gap-3">{getWeatherIcon(data.aheadWeather?.weatherCode || 0, 32, true)}<span className="text-3xl font-light tracking-tighter">{Math.round(data.aheadWeather?.temp || 0)}°</span></div>
                                        <div className="text-right space-y-1"><div className={`text-sm font-bold ${data.aheadWeather.rainProb > 20 ? 'text-rose-400' : 'text-white/60'}`}>Yağış %{data.aheadWeather?.rainProb}</div><div className="text-sm font-medium text-white/60">Rüzgar {Math.round(data.aheadWeather?.windSpeed || 0)} km/s</div></div>
                                    </div>
                                ) : ( <div className="text-sm opacity-50 italic">Hareket halinde hesaplanacak...</div> )}
                             </div>
                         </div>
                     )}
                     {type === 'stations' && (
                         <div className="space-y-3">
                             {data.stations && data.stations.length > 0 ? (
                                 data.stations.map((station: StationData, idx: number) => (
                                     <div key={idx} className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                                         <div className="flex flex-col">
                                             <div className="flex items-center gap-2"><span className="text-xs font-bold text-cyan-400 uppercase tracking-wide">{station.direction}</span><span className="text-[10px] opacity-40">~10km</span></div>
                                             <div className="text-base font-bold text-white mt-0.5">{station.name || "Bilinmeyen Bölge"}</div>
                                         </div>
                                         <div className="flex items-center gap-4">
                                             <div className="flex flex-col items-end">{getWeatherIcon(station.weatherCode, 20, true)}<span className="text-xl font-light">{Math.round(station.temp)}°</span></div>
                                             <div className="w-px h-8 bg-white/10"></div>
                                             <div className="flex flex-col items-end gap-1 min-w-[50px]">
                                                 <div className="flex items-center gap-1 text-xs opacity-60"><Wind size={10}/> {Math.round(station.windSpeed)}</div>
                                                 {station.rainProb > 0 && <div className="flex items-center gap-1 text-xs text-rose-400"><Umbrella size={10}/> %{station.rainProb}</div>}
                                             </div>
                                         </div>
                                     </div>
                                 ))
                             ) : ( <div className="p-8 text-center opacity-50">İstasyon verisi yükleniyor...</div> )}
                         </div>
                     )}
                     {type === 'speed' && (
                         <div className="grid grid-cols-2 gap-4">
                             <div className="bg-white/5 border border-white/10 p-5 rounded-3xl"><div className="text-xs font-bold opacity-40 mb-1">MAX HIZ</div><div className="text-3xl font-light tracking-tighter">{Math.round(data.maxSpeed)}</div></div>
                             <div className="bg-white/5 border border-white/10 p-5 rounded-3xl"><div className="text-xs font-bold opacity-40 mb-1">MESAFE</div><div className="text-3xl font-light tracking-tighter">{data.tripDistance.toFixed(1)} <span className="text-base opacity-50">km</span></div></div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 transition-all duration-300">
            <div className="bg-[#1c1c1e] border border-white/10 w-full max-w-sm p-6 rounded-[2rem] shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-4">Kalibrasyon</h2>
                <p className="text-slate-400 text-sm mb-6">Mevcut pusula sapması: {offset}°</p>
                <button onClick={onClose} className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-slate-200 transition-colors">Tamam</button>
            </div>
        </div>
    );
};

const DigitalClock = ({ toggleTheme, batteryLevel, btDevice, onConnectBt, isFocusMode }: any) => {
    const [time, setTime] = useState(new Date());
    useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
    const dateStr = time.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' });

    return (
        <div className={`flex items-center gap-5 transition-opacity duration-700 ${isFocusMode ? 'opacity-30' : 'opacity-100'}`}>
            <div className="flex flex-col items-end">
                <div className="text-xl font-bold tracking-tight text-white tabular-nums">{time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                <div onClick={toggleTheme} className="flex items-center gap-1 cursor-pointer mt-0.5">
                    <span className="text-[10px] font-bold text-white/50 tracking-wide uppercase">{dateStr}</span>
                </div>
            </div>
            <div className="flex flex-col items-end pl-5 border-l border-white/10 h-8 justify-center gap-1">
                {btDevice ? (
                    <div className="flex items-center gap-2 bg-white/10 px-2 py-0.5 rounded-full cursor-pointer active:scale-95 transition-transform" onClick={onConnectBt}>
                         <Headphones size={10} className="text-white/70" />
                         <span className={`text-[9px] font-bold ${btDevice.level > 20 ? 'text-emerald-400' : 'text-rose-400'}`}>{btDevice.level}%</span>
                    </div>
                ) : (
                    <button onClick={onConnectBt} className="p-1 hover:text-cyan-400 transition-colors opacity-50 hover:opacity-100" title="Cihaz Bağla">
                        <Bluetooth size={14} className="text-white" />
                    </button>
                )}
                {!btDevice && (
                    <div className="flex items-center gap-1.5 opacity-60">
                        <div className="text-[10px] font-bold">{Math.round(batteryLevel)}%</div>
                        <Battery size={12} className={batteryLevel < 20 ? 'text-rose-500' : 'text-emerald-500'} />
                    </div>
                )}
            </div>
        </div>
    );
};

const DigitalSpeedDisplay = ({ speed, onClick }: any) => (
    <div onClick={onClick} className="relative flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform duration-300 ios-ease z-20 w-full">
        {/* SPORTY FONT "Chakra Petch" AND LARGER SIZE */}
        <h1 className="text-[35vw] sm:text-[25vw] lg:text-[18rem] font-['Chakra_Petch'] font-bold leading-[0.8] tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-400 drop-shadow-[0_0_50px_rgba(255,255,255,0.25)] italic">
            {Math.round(speed)}
        </h1>
        <div className="mt-4 px-5 py-2 rounded-full border border-white/10 bg-black/40 backdrop-blur-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="text-sm font-['Chakra_Petch'] font-bold text-white/70 tracking-[0.3em] uppercase">KM/H</span>
        </div>
    </div>
);

const WindArrow = ({ dir }: {dir: number}) => (<div className="relative w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white/5 flex items-center justify-center"><Navigation size={14} className="text-white/80 sm:w-[18px] sm:h-[18px]" style={{ transform: `rotate(${dir}deg)` }} /></div>);

const EnvGrid = ({ weather, analysis, bikeHeading, tripDistance, radioState, isDark, onExpand, windChill, apparentWind, isFocusMode, stations }: any) => {
    const cardClass = "relative p-4 sm:p-5 rounded-[2rem] bg-[#1c1c1e]/40 backdrop-blur-xl border border-white/5 flex flex-col justify-between aspect-[1.5/1] sm:aspect-[1.8/1] active:scale-95 transition-all duration-300 ios-ease overflow-hidden group hover:bg-[#1c1c1e]/60";
    const textMain = "text-white";

    let stationSummary = "Yükleniyor...";
    if (stations && stations.length > 0) {
        const temps = stations.map((s: StationData) => s.temp);
        const minT = Math.min(...temps);
        const maxT = Math.max(...temps);
        stationSummary = `${Math.round(minT)}° - ${Math.round(maxT)}°`;
    }

    return (
        <div className={`grid grid-cols-2 gap-2 sm:gap-4 w-full px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] shrink-0 max-w-2xl mx-auto transition-opacity duration-700 ${isFocusMode ? 'opacity-20 hover:opacity-100' : 'opacity-100'} z-20`}>
            <div onClick={() => onExpand('copilot')} className={cardClass}>
                <div className="flex justify-between items-start z-10"><div className="flex flex-col"><span className="text-[9px] font-bold tracking-widest opacity-40 uppercase mb-1">COPILOT</span><span className={`text-sm sm:text-base font-bold leading-tight ${analysis.color}`}>{analysis.status === 'safe' ? 'GÜVENLİ' : analysis.status === 'caution' ? 'DİKKAT' : 'RİSKLİ'}</span></div>{analysis.status === 'safe' ? <ShieldCheck className="text-emerald-500 w-5 h-5 sm:w-6 sm:h-6" /> : analysis.status === 'caution' ? <Shield className="text-amber-500 w-5 h-5 sm:w-6 sm:h-6" /> : <ShieldAlert className="text-rose-500 w-5 h-5 sm:w-6 sm:h-6" />}</div>
                <div className="z-10"><p className={`text-[10px] sm:text-[11px] font-medium leading-snug opacity-80 line-clamp-2 ${textMain}`}>{analysis.message}</p></div>
                 <div className="absolute -right-6 -bottom-6 opacity-[0.03] rotate-12"><Shield size={80} className="text-white"/></div>
            </div>
            
            <div onClick={() => onExpand('weather')} className={cardClass}>
                 <div className="flex justify-between items-start z-10">
                     <div className="flex flex-col"><span className="text-[9px] font-bold tracking-widest opacity-40 uppercase mb-1">HAVA</span><div className="flex items-center gap-1"><span className={`text-2xl sm:text-3xl font-light tracking-tighter ${textMain}`}>{Math.round(weather?.temp || 0)}°</span></div></div>
                     {getWeatherIcon(weather?.weatherCode || 0, 24, isDark)}
                 </div>
                <div className="flex items-end justify-between z-10">
                     <div className="flex flex-col"><span className="text-[9px] font-bold text-cyan-400 tracking-wide flex items-center gap-1"><ThermometerSnowflake size={10}/> ISI</span><span className={`text-lg sm:text-xl font-bold ${textMain}`}>{windChill}°</span></div>
                     <WindArrow dir={(weather?.windDirection || 0) - (bikeHeading || 0) + 180} />
                </div>
            </div>

            <div onClick={() => onExpand('radio')} className={cardClass}>
                <div className="flex justify-between items-start z-10"><span className="text-[9px] font-bold tracking-widest opacity-40 uppercase">RADYO</span>{radioState.isPlaying ? <Volume2 className="text-cyan-400 animate-pulse w-5 h-5 sm:w-6 sm:h-6" /> : <Radio className="opacity-30 w-5 h-5 sm:w-6 sm:h-6" />}</div>
                <div className="z-10">{radioState.isPlaying ? (<><div className="text-[10px] font-bold text-cyan-400 mb-0.5 uppercase tracking-wide">Çalıyor</div><div className={`text-xs sm:text-sm font-bold leading-tight line-clamp-1 ${textMain}`}>{RADIO_STATIONS[radioState.currentStation].name}</div></>) : (<div className="flex items-center justify-start h-full pt-2 opacity-30 font-bold text-[10px]">KAPALI</div>)}</div>
            </div>

            <div onClick={() => onExpand('stations')} className={cardClass}>
                <div className="flex justify-between items-start z-10"><span className="text-[9px] font-bold tracking-widest opacity-40 uppercase">ÇEVRESEL</span><Map size={18} className="text-purple-400 opacity-60" /></div>
                <div className="flex flex-col justify-end z-10 h-full pb-1">
                    <div className={`text-2xl sm:text-3xl font-light tracking-tighter ${textMain} tabular-nums`}>{stationSummary}</div>
                    <div className="flex items-center gap-1.5 mt-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span><span className="text-[10px] opacity-60 font-medium">4 İSTASYON</span></div>
                </div>
                <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none"><Map size={80} /></div>
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
  const [compassOffset] = useState<number>(() => parseInt(localStorage.getItem('compassOffset') || '0'));
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
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [currentStation, setCurrentStation] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [expandedView, setExpandedView] = useState<string | null>(null); 
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isVisorMode, setIsVisorMode] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<any>(null);
  const lastLocationUpdate = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());
  const lastSpeedRef = useRef<number>(0);
  const lastAheadCheck = useRef<number>(0);
  const lastAlertTime = useRef<number>(0); 

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  
  // FOCUS MODE THRESHOLD INCREASED TO 100 KM/H
  const isFocusMode = speed > 100;

  // DYNAMIC ANIMATION SPEED CALCULATION
  // Default (stop/slow) = 100s. Fast = 0.5s.
  // Formula: As speed increases, duration decreases.
  const animDuration = speed < 2 ? '100s' : `${Math.max(0.2, 50 / speed)}s`;

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
      else if (aheadWeather) {
          if (aheadWeather.rainProb > 40 && weather.rainProb < 20) alertMsg = `Rotada gelişme var. 10 kilometre ileride yağış riski yüzde ${aheadWeather.rainProb}.`;
          else if (aheadWeather.windSpeed > weather.windSpeed + 15) alertMsg = `Uyarı. İleride rüzgar şiddetini artırıyor. ${Math.round(aheadWeather.windSpeed)} kilometre hıza ulaşacak.`;
      }

      if (alertMsg) { speak(alertMsg); lastAlertTime.current = now; }
  };

  useEffect(() => { if (speed > 30) checkSmartAlerts(); }, [speed, aheadWeather, apparentWind, windChill]);

  // Audio Player
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (radioPlaying) {
        const targetUrl = RADIO_STATIONS[currentStation].url;
        if (audio.src !== targetUrl) { audio.src = targetUrl; audio.load(); }
        audio.play().catch(e => { if (e.name !== 'AbortError') setRadioPlaying(false); });
    } else { audio.pause(); }
  }, [radioPlaying, currentStation]);

  const handleRadioPlay = (idx: number) => { setCurrentStation(idx); setRadioPlaying(true); };
  const handleRadioStop = () => { setRadioPlaying(false); };

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

  // Wake Lock
  const requestWakeLock = async () => { if ('wakeLock' in navigator) { try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (e) { console.log('Wake Lock Error', e); } } };
  useEffect(() => { requestWakeLock(); const handleVisibility = () => { if (document.visibilityState === 'visible') requestWakeLock(); }; document.addEventListener('visibilitychange', handleVisibility); return () => document.removeEventListener('visibilitychange', handleVisibility); }, [isVisorMode]);

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
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            try { 
                const r = await (DeviceOrientationEvent as any).requestPermission(); 
                if (r === 'granted') (window as any).addEventListener('deviceorientation', handleOrientation);
            } catch (e) {}
        } else {
            if ('ondeviceorientationabsolute' in window) (window as any).addEventListener('deviceorientationabsolute', handleAbsoluteOrientation);
            else (window as any).addEventListener('deviceorientation', handleOrientation);
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

  const isDark = theme === 'dark';
  const expandedData = { maxSpeed, tripDistance, weather, aheadWeather, apparentWind, windChill, analysis, stations: nearbyStations };
  const showRainWarning = weather && (weather.rainProb > 20 || weather.rain > 0.1);
  const showAheadWarning = aheadWeather && (aheadWeather.rainProb > 40 && (!weather || weather.rainProb < 20));

  useEffect(() => { const handlePopState = () => { if (expandedView) setExpandedView(null); }; if (expandedView) { window.history.pushState({ modal: true }, "", ""); window.addEventListener('popstate', handlePopState); } return () => { window.removeEventListener('popstate', handlePopState); }; }, [expandedView]);
  const handleCloseModal = () => window.history.back();

  return (
    <div className="bg-transparent w-full h-[100dvh] flex flex-col relative overflow-hidden font-sans select-none text-white">
        {/* Pass the dynamic animation duration to the container's style for the grid to pick up */}
        <div className="scene-container" style={{"--anim-duration": animDuration} as React.CSSProperties}>
            <div className="horizon-glow"></div>
            <div className="road-plane"><div className="moving-grid"></div></div>
        </div>

        <audio ref={audioRef} onError={() => setRadioPlaying(false)} onEnded={() => setRadioPlaying(false)} className="hidden" preload="none" />
        <CalibrationModal isOpen={showCalibration} onClose={() => setShowCalibration(false)} offset={compassOffset} />
        {expandedView && <DetailOverlay type={expandedView} data={expandedData} onClose={handleCloseModal} theme={theme} radioHandlers={{ isPlaying: radioPlaying, currentStation: currentStation, play: handleRadioPlay, stop: handleRadioStop }} />}
        {isVisorMode && <VisorOverlay windChill={windChill} apparentWind={apparentWind} rainProb={weather?.rainProb || 0} onClose={() => setIsVisorMode(false)} windDir={(weather?.windDirection || 0) - effectiveHeading + 180} />}

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

        {radioPlaying && !expandedView && !isVisorMode && (
             <div className="absolute top-[80px] left-0 right-0 px-6 z-50 flex justify-center animate-in slide-in-from-top-4 fade-in duration-500 ios-ease">
                <button onClick={handleRadioStop} className="flex items-center gap-4 bg-rose-600/80 backdrop-blur-xl text-white px-6 py-3 rounded-full shadow-[0_10px_30px_rgba(225,29,72,0.4)] border border-rose-500/50 active:scale-95 transition-all group hover:bg-rose-600">
                    <div className="relative"><span className="absolute inset-0 rounded-full animate-ping bg-white/50"></span><Volume2 size={20} className="animate-pulse" /></div>
                    <div className="flex flex-col items-start leading-none"><span className="text-[9px] font-black opacity-80 tracking-widest uppercase">ÇALIYOR</span><span className="text-sm font-bold max-w-[120px] truncate">{RADIO_STATIONS[currentStation].name}</span></div>
                    <div className="h-6 w-px bg-white/20 mx-1"></div>
                    <StopCircle size={24} fill="currentColor" className="text-white group-hover:scale-110 transition-transform" />
                </button>
            </div>
        )}

        {(showRainWarning || showAheadWarning) && !isVisorMode && (
            <div className={`w-full px-6 mt-16 mb-0 z-30 transition-opacity duration-500 ${isFocusMode ? 'opacity-20 hover:opacity-100' : 'opacity-100'}`}>
                {showRainWarning && ( <div className="w-full bg-cyan-900/60 backdrop-blur-xl border border-cyan-500/50 rounded-2xl py-3 px-4 flex items-center justify-center gap-3 animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.3)] mb-2"><Umbrella className="text-cyan-400" size={18} /><span className="text-cyan-200 text-xs font-bold tracking-widest">YAĞIŞ BEKLENİYOR (%{weather?.rainProb})</span></div> )}
                {showAheadWarning && ( <div className="w-full bg-rose-900/60 backdrop-blur-xl border border-rose-500/50 rounded-2xl py-3 px-4 flex items-center justify-center gap-3 animate-pulse shadow-[0_0_20px_rgba(244,63,94,0.3)]"><Radar className="text-rose-400" size={18} /><span className="text-rose-200 text-xs font-bold tracking-widest">10KM İLERİDE YAĞMUR!</span></div> )}
            </div>
        )}

        <div className="flex-1 flex flex-col justify-center items-center relative z-10 w-full min-h-0">
             <DigitalSpeedDisplay speed={speed} onClick={() => setExpandedView('speed')} />
        </div>

        <EnvGrid weather={weather} analysis={analysis} bikeHeading={effectiveHeading} tripDistance={tripDistance} radioState={{ isPlaying: radioPlaying, currentStation, stop: handleRadioStop }} isDark={isDark} onExpand={(type: string) => { setExpandedView(type); if(type === 'copilot' && isVoiceEnabled) speak(`${analysis.message}. ${analysis.roadCondition}`); }} btDevice={btDevice} onConnectBt={handleConnectBluetooth} windChill={windChill} apparentWind={apparentWind} isFocusMode={isFocusMode} stations={nearbyStations} />
    </div>
  );
};

export default App;