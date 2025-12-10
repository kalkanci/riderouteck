import React, { useState, useEffect, useRef } from 'react';
import { Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, Navigation, Umbrella, Download, X, Battery, Shield, ShieldAlert, ShieldCheck, Bluetooth, Music, Headphones, Radar, ThermometerSnowflake, Glasses, Map, Play, Pause, SkipForward, SkipBack, User, Shuffle, Repeat, ArrowUp, ArrowDown, Radio, Signal, MapPin, Droplets, Navigation2, Scan } from 'lucide-react';
import { WeatherData, CoPilotAnalysis, StationData, RadioStation } from './types';
import { getWeatherForPoint, reverseGeocode, getNearbyStations } from './services/api';

// --- RADIO STATIONS DATA (SIMPLIFIED) ---
const RADIO_STATIONS: RadioStation[] = [
    { id: '1', name: 'Power FM', category: 'Yabancı Pop', streamUrl: 'https://listen.powerapp.com.tr/powerfm/mpeg/icecast.audio', color: 'bg-red-600' },
    { id: '2', name: 'Power Türk', category: 'Türkçe Pop', streamUrl: 'https://listen.powerapp.com.tr/powerturk/mpeg/icecast.audio', color: 'bg-red-700' },
    { id: '8', name: 'Number 1', category: 'Hit', streamUrl: 'https://n10101m.mediatriple.net/numberoneturk', color: 'bg-blue-500' },
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
    const relativeWindAngle = (windDirection - bikeHeading + 180) % 360;
    
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
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <div className="w-full h-px bg-white"></div>
                <div className="h-full w-px bg-white absolute"></div>
            </div>

            <div className="flex-1 w-full relative flex items-center justify-center">
                <div className="absolute z-10 p-2 bg-[#18181b] rounded-full border border-white/20 shadow-[0_0_15px_rgba(0,0,0,0.8)]">
                    <Navigation2 size={24} className="text-white fill-white stroke-[3px]" />
                </div>
                
                <div 
                    className="absolute inset-0 flex items-center justify-center transition-transform duration-700 ease-out"
                    style={{ transform: `rotate(${relativeWindAngle}deg)` }}
                >
                    <div className="absolute -top-4 flex flex-col items-center gap-1">
                         <div className={`w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[12px] ${apparentWind > 25 ? 'border-t-rose-500 animate-pulse' : 'border-t-cyan-400'}`}></div>
                         <div className={`w-0.5 h-6 bg-gradient-to-b ${apparentWind > 25 ? 'from-rose-500' : 'from-cyan-400'} to-transparent opacity-50`}></div>
                    </div>
                    <div className="absolute -top-1 w-20 h-20 opacity-30 animate-pulse">
                         <div className={`w-full h-full border-t-4 rounded-full ${colorClass}`} style={{ clipPath: 'polygon(0 0, 100% 0, 50% 50%)'}}></div>
                    </div>
                </div>
            </div>

            <div className="absolute top-2 w-full text-center">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-black/40 border ${isHighWind ? 'border-rose-500/50 text-rose-400' : 'border-white/10 text-white/60'}`}>
                    {impactText}
                </span>
            </div>

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
                         {type === 'weather' && <><Scan size={18} className="text-blue-400"/> <span>50KM Yağış Taraması</span></>}
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
                         <div className="space-y-4">
                             <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-900/30 to-blue-900/10 border border-blue-500/20 flex flex-col items-center justify-center text-center">
                                <Scan size={48} className="text-blue-400 animate-pulse mb-3"/>
                                <h3 className="text-blue-300 text-sm font-bold uppercase tracking-widest mb-1">50KM YARIÇAP</h3>
                                <div className="text-3xl font-light tracking-tighter">
                                    {(data.weather?.rainProb > 0 || data.stations?.some((s:any) => s.rainProb > 0)) ? "YAĞIŞ VAR" : "TEMİZ"}
                                </div>
                                <div className="mt-3 text-xs text-white/50">Bölgesel istasyon verilerine göre analiz edildi.</div>
                             </div>
                             
                             <div className="space-y-2">
                                <h4 className="text-xs text-white/40 uppercase tracking-widest px-1">BÖLGESEL RAPOR</h4>
                                {data.stations?.map((s:any, i:number) => (
                                    <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                                        <span className="text-xs font-bold text-white/70">{s.direction} ({s.name})</span>
                                        <div className="flex items-center gap-2">
                                            {s.rainProb > 0 ? <CloudRain size={12} className="text-blue-400"/> : <Sun size={12} className="text-amber-500"/>}
                                            <span className="text-xs">{Math.round(s.temp)}°</span>
                                        </div>
                                    </div>
                                ))}
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in" onClick={onClose}>
            <div className="bg-[#18181b] border border-white/10 p-6 rounded-3xl w-full max-w-xs flex flex-col items-center" onClick={e => e.stopPropagation()}>
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Navigation size={24} className="text-white/70" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Pusula Ayarı</h3>
                <p className="text-xs text-white/50 text-center mb-6 leading-relaxed">Telefonunuzun pusulası ile GPS yönü arasındaki sapmayı manuel olarak düzeltin.</p>
                
                <div className="flex items-center justify-center gap-4 mb-8 w-full">
                    <button onClick={() => setOffset((prev: number) => prev - 5)} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-colors">
                        <ArrowDown size={18} className="text-white rotate-90" />
                    </button>
                    <div className="flex flex-col items-center w-20">
                        <span className="text-3xl font-bold tabular-nums tracking-tighter">{offset}°</span>
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">SAPMA</span>
                    </div>
                    <button onClick={() => setOffset((prev: number) => prev + 5)} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-colors">
                        <ArrowUp size={18} className="text-white rotate-90" />
                    </button>
                </div>

                <div className="flex gap-2 w-full">
                     <button onClick={() => { setOffset(0); localStorage.setItem('compassOffset', '0'); onClose(); }} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-white/60 transition-colors">SIFIRLA</button>
                     <button onClick={() => { localStorage.setItem('compassOffset', offset.toString()); onClose(); }} className="flex-[2] py-3 rounded-xl bg-white text-black text-xs font-bold hover:bg-white/90 transition-colors">KAYDET</button>
                </div>
            </div>
        </div>
    );
};

const DigitalClock = ({ isDark, toggleTheme, batteryLevel, btDevice, onConnectBt, isFocusMode }: any) => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className={`flex items-center gap-4 transition-opacity duration-500 ${isFocusMode ? 'opacity-0' : 'opacity-100'}`}>
            <div className="flex flex-col items-end">
                <div className="text-3xl font-bold leading-none tracking-tight text-white drop-shadow-lg font-mono">
                    {formatTime(time)}
                </div>
                <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                    {time.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
            </div>
            <div className="flex flex-col gap-1">
                 <button onClick={onConnectBt} className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${btDevice ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/30'}`}>
                    {btDevice ? <Headphones size={12} /> : <Bluetooth size={12} />}
                    <span className="text-[10px] font-bold">{btDevice ? `${btDevice.level}%` : '---'}</span>
                 </button>
                 <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${batteryLevel < 20 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                    <Battery size={12} />
                    <span className="text-[10px] font-bold">{Math.round(batteryLevel)}%</span>
                 </div>
            </div>
        </div>
    );
};

const DigitalSpeedDisplay = ({ speed, onClick }: any) => {
    return (
        <div onClick={onClick} className="flex flex-col items-center justify-center scale-100 active:scale-95 transition-transform cursor-pointer">
            <div className="relative">
                <span className="text-[10rem] sm:text-[13rem] font-black leading-[0.8] text-white tracking-tighter drop-shadow-[0_0_50px_rgba(255,255,255,0.2)] font-sans">
                    {Math.round(speed)}
                </span>
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-sm font-bold text-white/40 uppercase tracking-[0.5em] bg-black/20 px-4 py-1 rounded-full backdrop-blur-sm">KM/H</span>
            </div>
        </div>
    );
};

const EnvGrid = ({ weather, aheadWeather, analysis, bikeHeading, tripDistance, currentStation, isPlaying, isDark, onExpand, btDevice, onConnectBt, windChill, apparentWind, isFocusMode, stations, onTogglePlay }: any) => {
    return (
        <div className={`w-full max-w-md px-6 pb-8 grid grid-cols-2 gap-3 transition-all duration-700 ${isFocusMode ? 'translate-y-20 opacity-0' : 'translate-y-0 opacity-100'}`}>
            
            {/* CoPilot Widget */}
            <div onClick={() => onExpand('copilot')} className="col-span-2 bg-[#18181b]/80 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-lg active:scale-98 transition-transform">
                 <div className="flex items-center gap-3">
                     <div className={`w-10 h-10 rounded-full flex items-center justify-center ${analysis.status === 'safe' ? 'bg-emerald-500/20 text-emerald-400' : analysis.status === 'caution' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-500'}`}>
                         {analysis.status === 'safe' ? <ShieldCheck size={20} /> : analysis.status === 'caution' ? <Shield size={20} /> : <ShieldAlert size={20} />}
                     </div>
                     <div className="flex flex-col">
                         <span className={`text-xs font-bold uppercase tracking-wider ${analysis.color}`}>{analysis.roadCondition}</span>
                         <span className="text-[10px] text-white/50 line-clamp-1">{analysis.message}</span>
                     </div>
                 </div>
                 <div className="h-8 w-px bg-white/10 mx-2"></div>
                 <div className="flex flex-col items-end">
                      <span className="text-xs font-bold text-white/60">CO-PILOT</span>
                      <span className="text-[10px] text-emerald-400 font-bold">AKTİF</span>
                 </div>
            </div>

            {/* Weather Widget */}
            <div onClick={() => onExpand('weather')} className="bg-[#18181b]/80 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex flex-col justify-between h-32 active:scale-95 transition-transform shadow-lg relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-2 opacity-50 group-hover:opacity-100 transition-opacity">
                     <Scan size={14} className="text-white/40" />
                 </div>
                 <div className="flex justify-between items-start">
                     <div className="flex flex-col">
                         <span className="text-3xl font-bold text-white tracking-tighter">{weather ? Math.round(weather.temp) : '--'}°</span>
                         <span className="text-[10px] text-white/50 font-bold uppercase">HAVA</span>
                     </div>
                     <div className="pt-1">
                         {weather && getWeatherIcon(weather.weatherCode, 28)}
                     </div>
                 </div>
                 <div className="flex items-center gap-2 mt-2">
                     <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg">
                         <Droplets size={12} className={weather?.rainProb > 0 ? "text-blue-400" : "text-white/30"} />
                         <span className={`text-xs font-bold ${weather?.rainProb > 0 ? "text-blue-400" : "text-white/30"}`}>%{weather?.rainProb || 0}</span>
                     </div>
                 </div>
            </div>

            {/* Wind Radar Widget */}
            <div className="bg-[#18181b]/80 backdrop-blur-md border border-white/10 rounded-2xl relative overflow-hidden h-32 shadow-lg">
                <WindRadar 
                    windSpeed={weather?.windSpeed || 0}
                    apparentWind={apparentWind}
                    windDirection={weather?.windDirection || 0}
                    bikeHeading={bikeHeading}
                    windChill={windChill}
                />
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
                
                // Haptic Feedback for Speed
                if (safeKmh > 10 && (navigator as any).vibrate) {
                    // Slight vibration pulse on update if speed > 10
                    (navigator as any).vibrate(Math.min(safeKmh / 2, 40)); 
                }

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
        {/* Simple Background Scene (No Grid) */}
        <div className="scene-container">
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