import React, { useState, useEffect, useRef } from 'react';
import { Wind, CloudRain, Sun, Cloud, CloudFog, Snowflake, Navigation, Umbrella, Download, X, Battery, Shield, ShieldAlert, ShieldCheck, Bluetooth, Music, Headphones, Radar, ThermometerSnowflake, Glasses, Map, Play, Pause, SkipForward, SkipBack, User, Shuffle, Repeat, ArrowUp } from 'lucide-react';
import { WeatherData, CoPilotAnalysis, StationData, SpotifyTrack, SpotifyPlaylist, SpotifyPlayerState } from './types';
import { getWeatherForPoint, reverseGeocode, getNearbyStations } from './services/api';

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

const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// --- SUB COMPONENTS ---

const WindRadar = ({ windSpeed, apparentWind, windDirection, bikeHeading, windChill }: any) => {
    // Relatif rüzgar açısını hesapla (Motosikletin burnu hep 0 derece/yukarı)
    // windDirection (Rüzgarın geldiği yön) - bikeHeading
    const relativeWindAngle = (windDirection - bikeHeading + 180) % 360;
    
    // Renk skalası
    const getColor = (speed: number) => {
        if (speed < 15) return "text-emerald-400";
        if (speed < 30) return "text-amber-400";
        return "text-rose-500";
    };

    const colorClass = getColor(apparentWind);

    return (
        <div className="relative flex flex-col items-center justify-center w-full h-full min-h-[140px]">
            {/* Outer Compass Ring */}
            <div className="absolute inset-0 rounded-full border border-white/5 bg-gradient-to-b from-white/5 to-transparent"></div>
            
            {/* Direction Indicators */}
            <div className="absolute top-2 text-[10px] font-bold text-white/30">ÖN</div>
            <div className="absolute bottom-2 text-[10px] font-bold text-white/30">ARKA</div>
            
            {/* Central Bike Icon (Fixed) */}
            <div className="absolute z-10 p-2 bg-[#1c1c1e] rounded-full border border-white/10 shadow-lg">
                <Navigation size={20} className="text-white fill-white/20" />
            </div>

            {/* Wind Arrow (Rotates) */}
            <div 
                className="absolute inset-0 flex items-center justify-center transition-transform duration-700 ease-out"
                style={{ transform: `rotate(${relativeWindAngle}deg)` }}
            >
                {/* Arrow pointing IN towards center (wind source) */}
                <div className="absolute top-4 flex flex-col items-center">
                    <ArrowUp size={24} className={`${colorClass} animate-pulse`} />
                    <div className={`h-8 w-1 bg-gradient-to-b from-${colorClass.split('-')[1]}-500/0 to-${colorClass.split('-')[1]}-500/50 rounded-full`}></div>
                </div>
            </div>

            {/* Stats Overlay */}
            <div className="absolute -bottom-1 -right-1 flex flex-col items-end">
                 <div className="text-2xl font-bold text-white leading-none tabular-nums">{apparentWind}</div>
                 <div className="text-[9px] font-bold text-white/40 uppercase">Rüzgar Km/h</div>
            </div>
             <div className="absolute -bottom-1 -left-1 flex flex-col items-start">
                 <div className={`text-2xl font-bold leading-none tabular-nums ${windChill < 10 ? 'text-cyan-400' : 'text-white'}`}>{windChill}°</div>
                 <div className="text-[9px] font-bold text-white/40 uppercase">Hissedilen</div>
            </div>
        </div>
    );
};

const VisorTrigger = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className="group relative flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden transition-all duration-300 active:scale-95 hover:bg-white/10 hover:border-cyan-500/30 hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
        <Glasses size={18} className="text-cyan-400 group-hover:scale-110 transition-transform duration-300" />
        <span className="text-xs font-bold text-white/90 tracking-[0.2em] uppercase">VİZÖR</span>
    </button>
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

            {/* Center Content: Speed & Temp */}
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

const DetailOverlay = ({ type, data, onClose, musicHandlers, spotifyUser, onSpotifyLogin, onSpotifyLogout, clientId, setClientId, playlists, onPlayPlaylist }: any) => {
    if (!type) return null;

    const currentTrack = musicHandlers.currentTrack;
    const progress = musicHandlers.progress;
    const isPaused = musicHandlers.isPaused;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-3xl transition-all duration-500 ios-ease" onClick={onClose}>
            <div className={`w-full ${type === 'spotify' ? 'h-full sm:h-auto sm:max-w-md sm:aspect-[9/18]' : 'max-w-md max-h-[85vh]'} sm:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden bg-[#121214] border-x sm:border border-white/10 text-white transform transition-all duration-500 ios-ease animate-in fade-in zoom-in-95 slide-in-from-bottom-8 relative`} onClick={e => e.stopPropagation()}>
                
                {/* Close Button Overlay */}
                <button onClick={onClose} className="absolute top-6 right-6 z-50 p-2 rounded-full bg-black/20 hover:bg-white/10 text-white transition-colors"><X size={24} /></button>
                
                {type !== 'spotify' && (
                    <div className="p-5 flex justify-between items-center shrink-0 border-b border-white/5 mt-8 sm:mt-0">
                        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2 text-white/90">
                             <span>{type === 'speed' ? 'Sürüş Özeti' : type === 'weather' ? 'Detaylı Hava Durumu' : type === 'copilot' ? 'Taktiksel Analiz' : 'Çevre İstasyonlar'}</span>
                        </h2>
                    </div>
                )}
                
                <div className={`flex-1 overflow-y-auto no-scrollbar ${type === 'spotify' ? 'p-0' : 'p-6'}`}>
                     {type === 'spotify' && (
                        <div className="flex flex-col h-full bg-[#121214] relative">
                             {/* Background Blur */}
                             {currentTrack && (
                                <div className="absolute inset-0 z-0">
                                    <div className="absolute inset-0 bg-cover bg-center opacity-40 blur-3xl scale-125" style={{backgroundImage: `url(${currentTrack.album.images[0]?.url})`}}></div>
                                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#121214]/80 to-[#121214]"></div>
                                </div>
                             )}

                            {!spotifyUser.isLoggedIn ? (
                                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 animate-in fade-in relative z-10">
                                    <div className="w-20 h-20 bg-[#1DB954] rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(29,185,84,0.3)] mb-4">
                                        <Music size={40} className="text-black" />
                                    </div>
                                    <h2 className="text-2xl font-bold">Spotify Bağlanıyor...</h2>
                                    <p className="text-white/60 max-w-xs">Giriş yapmanız bekleniyor. Eğer pencere açılmazsa butona tıklayın.</p>
                                    <button 
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSpotifyLogin(); }}
                                        className="w-full max-w-xs py-4 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold rounded-full text-base transition-transform active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
                                    >
                                        Tekrar Dene
                                    </button>
                                </div>
                            ) : (
                                <div className="relative z-10 flex flex-col h-full pt-16 px-8 pb-8">
                                    {/* Album Art Area */}
                                    <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
                                        {currentTrack ? (
                                            <div className="w-full aspect-square max-w-[340px] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden group border border-white/5">
                                                 <img src={currentTrack.album.images[0]?.url} alt="Cover" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                                 {isPaused && <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[2px]"><Play size={64} fill="white" className="text-white opacity-80" /></div>}
                                            </div>
                                        ) : (
                                            <div className="w-full aspect-square max-w-[320px] bg-white/5 rounded-2xl flex items-center justify-center border border-white/5">
                                                <Music size={64} className="text-white/20" />
                                            </div>
                                        )}
                                        
                                        {/* Track Info Large */}
                                        <div className="mt-8 text-center w-full">
                                            <h2 className="text-3xl font-bold leading-tight truncate px-4">{currentTrack ? currentTrack.name : "Müzik Bekleniyor"}</h2>
                                            <p className="text-white/60 text-xl truncate mt-2 font-medium">{currentTrack ? currentTrack.artists[0]?.name : "Çalmak için listeye tıkla"}</p>
                                        </div>
                                    </div>

                                    {/* Smooth Progress Bar */}
                                    <div className="w-full mb-8 group cursor-pointer pt-4">
                                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <div className="h-full bg-white rounded-full relative transition-all duration-100 ease-linear" style={{width: `${currentTrack ? (progress / currentTrack.duration_ms) * 100 : 0}%`}}>
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            </div>
                                        </div>
                                        <div className="flex justify-between text-xs font-bold text-white/30 mt-2 font-mono">
                                            <span>{formatTime(progress)}</span>
                                            <span>{currentTrack ? formatTime(currentTrack.duration_ms) : "0:00"}</span>
                                        </div>
                                    </div>

                                    {/* Controls Large */}
                                    <div className="flex items-center justify-between mb-10 px-4">
                                        <button className="text-white/40 hover:text-white transition-colors p-2"><Shuffle size={24} /></button>
                                        <button onClick={musicHandlers.prev} className="text-white hover:text-[#1DB954] transition-colors active:scale-90 p-2"><SkipBack size={40} fill="currentColor" /></button>
                                        <button onClick={musicHandlers.togglePlay} className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                                            {isPaused ? <Play size={40} fill="black" className="ml-1" /> : <Pause size={40} fill="black" />}
                                        </button>
                                        <button onClick={musicHandlers.next} className="text-white hover:text-[#1DB954] transition-colors active:scale-90 p-2"><SkipForward size={40} fill="currentColor" /></button>
                                        <button className="text-white/40 hover:text-white transition-colors p-2"><Repeat size={24} /></button>
                                    </div>

                                    {/* Playlist Selector (Collapsed at bottom) */}
                                    <div className="flex-1 min-h-0 flex flex-col gap-3">
                                        <div className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Kitaplığın</div>
                                        <div className="overflow-y-auto no-scrollbar -mx-2 px-2 pb-4 space-y-2 max-h-[150px]">
                                            {playlists.map((pl: SpotifyPlaylist) => (
                                                <button key={pl.id} onClick={() => onPlayPlaylist(pl.uri)} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/10 transition-all border border-transparent hover:border-white/5 group">
                                                    <img src={pl.images[0]?.url || ""} className="w-12 h-12 rounded-lg object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="" />
                                                    <div className="flex flex-col items-start flex-1 min-w-0">
                                                        <span className="text-sm font-bold truncate w-full text-left text-white/90 group-hover:text-white">{pl.name}</span>
                                                        <span className="text-[10px] text-white/40 uppercase tracking-wide">Çalma Listesi</span>
                                                    </div>
                                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                                        <Play size={14} fill="white" className="ml-0.5" />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
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

const CalibrationModal = ({ isOpen, onClose, offset, setOffset }: any) => {
    if (!isOpen) return null;
    const [localOffset, setLocalOffset] = useState(offset);

    const handleSave = () => {
        if (setOffset) setOffset(localOffset);
        localStorage.setItem('compassOffset', localOffset.toString());
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
            <div className="bg-[#1c1c1e] border border-white/10 p-6 rounded-3xl w-full max-w-xs text-center" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-white mb-4">Pusula Kalibrasyonu</h3>
                <p className="text-xs text-white/50 mb-6">Telefonun yönü ile motosikletin yönü arasındaki açıyı ayarlayın.</p>
                <div className="flex items-center justify-center gap-4 mb-8">
                    <button onClick={() => setLocalOffset((p: number) => p - 1)} className="w-12 h-12 flex items-center justify-center bg-white/5 rounded-full hover:bg-white/10 active:scale-95 transition-all"><Navigation size={20} className="-rotate-90 text-white"/></button>
                    <span className="text-3xl font-mono font-bold w-20 tabular-nums text-white">{localOffset}°</span>
                    <button onClick={() => setLocalOffset((p: number) => p + 1)} className="w-12 h-12 flex items-center justify-center bg-white/5 rounded-full hover:bg-white/10 active:scale-95 transition-all"><Navigation size={20} className="rotate-90 text-white"/></button>
                </div>
                <button onClick={handleSave} className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl mb-3 transition-colors">Kaydet</button>
                <button onClick={onClose} className="w-full py-3 text-white/50 font-bold hover:text-white transition-colors">İptal</button>
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

    return (
        <div className={`flex flex-col items-center transition-opacity duration-500 ${isFocusMode ? 'opacity-0' : 'opacity-100'}`}>
            <div className="text-4xl font-bold tracking-tighter text-white leading-none tabular-nums">
                {time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
                    <div className="relative">
                        <Battery size={16} className={`text-white/70 ${batteryLevel < 20 ? 'text-red-500 animate-pulse' : ''}`} />
                        <div className={`absolute top-[2px] left-[2px] h-[7px] bg-white rounded-[1px] ${batteryLevel < 20 ? 'bg-red-500' : ''}`} style={{ width: `${Math.max(0, (batteryLevel/100)*12)}px` }} />
                    </div>
                    <span className="text-xs font-bold text-white/70">{Math.round(batteryLevel)}%</span>
                </div>
                <div className="w-px h-3 bg-white/20"></div>
                <button onClick={onConnectBt} className="flex items-center gap-1 active:scale-95 transition-transform">
                    <Bluetooth size={16} className={btDevice ? "text-cyan-400" : "text-white/30"} />
                    {btDevice && <span className="text-xs font-bold text-cyan-400">{btDevice.level ? `${btDevice.level}%` : 'ON'}</span>}
                </button>
            </div>
        </div>
    );
};

const DigitalSpeedDisplay = ({ speed, onClick }: { speed: number, onClick: () => void }) => (
    <div onClick={onClick} className="flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform z-20">
        <div className="relative">
            <span className="text-[28vw] sm:text-[180px] font-sans font-black text-white leading-[0.85] tracking-tighter drop-shadow-[0_0_50px_rgba(255,255,255,0.15)]">
                {Math.round(speed)}
            </span>
        </div>
        <div className="text-lg font-bold text-white/40 tracking-[0.4em] mt-2 uppercase">km/h</div>
    </div>
);

const EnvGrid = ({ weather, analysis, bikeHeading, tripDistance, currentTrack, isPaused, isDark, onExpand, btDevice, onConnectBt, windChill, apparentWind, isFocusMode, stations, spotifyUser, trackProgress, onSpotifyLogin }: any) => {
    return (
        <div className={`w-full grid grid-cols-2 gap-3 px-4 pb-8 transition-all duration-500 ${isFocusMode ? 'translate-y-20 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
            {/* Wind Radar Widget */}
            <div onClick={() => onExpand('weather')} className="col-span-1 aspect-square bg-[#1c1c1e]/60 backdrop-blur-xl rounded-3xl border border-white/10 p-1 relative overflow-hidden active:scale-[0.98] transition-transform">
                <WindRadar 
                    windSpeed={weather?.windSpeed || 0} 
                    apparentWind={apparentWind} 
                    windDirection={weather?.windDirection || 0} 
                    bikeHeading={bikeHeading}
                    windChill={windChill}
                />
            </div>

            {/* CoPilot / Weather Widget */}
            <div className="col-span-1 flex flex-col gap-3">
                 <div onClick={() => onExpand('copilot')} className={`flex-1 rounded-3xl p-4 border active:scale-[0.98] transition-transform flex flex-col justify-between relative overflow-hidden ${analysis.status === 'danger' ? 'bg-rose-900/20 border-rose-500/30' : analysis.status === 'caution' ? 'bg-amber-900/20 border-amber-500/30' : 'bg-[#1c1c1e]/60 border-white/10'}`}>
                    <div className="flex justify-between items-start">
                        {analysis.status === 'safe' ? <ShieldCheck size={24} className={analysis.color} /> : analysis.status === 'caution' ? <Shield size={24} className={analysis.color} /> : <ShieldAlert size={24} className={analysis.color} />}
                        <div className="text-[10px] font-bold opacity-50 uppercase tracking-widest">CoPilot</div>
                    </div>
                    <div>
                        <div className={`text-lg font-bold leading-tight ${analysis.color}`}>{analysis.roadCondition}</div>
                        <div className="text-[10px] opacity-60 mt-1 line-clamp-1">{analysis.message}</div>
                    </div>
                </div>

                <div onClick={() => onExpand('weather')} className="h-[70px] bg-[#1c1c1e]/60 backdrop-blur-xl rounded-3xl border border-white/10 p-3 flex items-center justify-between active:scale-[0.98] transition-transform">
                    <div className="flex flex-col">
                        <span className="text-[10px] opacity-50 uppercase font-bold">Sıcaklık</span>
                        <span className="text-2xl font-bold text-white">{Math.round(weather?.temp || 0)}°</span>
                    </div>
                    {getWeatherIcon(weather?.weatherCode || 0, 32)}
                </div>
            </div>

            {/* Music Widget */}
            <div onClick={() => spotifyUser.isLoggedIn ? onExpand('spotify') : onSpotifyLogin()} className="col-span-2 h-[80px] bg-[#1c1c1e]/60 backdrop-blur-xl rounded-3xl border border-white/10 p-3 flex items-center gap-4 relative overflow-hidden active:scale-[0.98] transition-transform group">
                 {!spotifyUser.isLoggedIn ? (
                     <div className="flex items-center gap-4 w-full px-2">
                         <div className="w-12 h-12 rounded-full bg-[#1DB954]/20 flex items-center justify-center"><Music size={20} className="text-[#1DB954]" /></div>
                         <div className="flex flex-col">
                             <span className="font-bold text-white">Spotify Bağlan</span>
                             <span className="text-xs text-white/50">Müzik kontrolü için dokun</span>
                         </div>
                     </div>
                 ) : (
                    <>
                        <div className={`w-14 h-14 rounded-2xl bg-white/10 shrink-0 overflow-hidden relative ${isPaused ? 'opacity-80' : ''}`}>
                            {currentTrack?.album?.images[0]?.url ? (
                                <img src={currentTrack.album.images[0].url} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center"><Headphones size={24} className="text-white/20"/></div>
                            )}
                            {currentTrack && !isPaused && (
                                <div className="absolute inset-0 flex items-end justify-center gap-[2px] pb-1 bg-black/20">
                                    <div className="w-[3px] bg-[#1DB954] animate-bounce h-3" style={{animationDelay:'0ms'}}></div>
                                    <div className="w-[3px] bg-[#1DB954] animate-bounce h-5" style={{animationDelay:'150ms'}}></div>
                                    <div className="w-[3px] bg-[#1DB954] animate-bounce h-2" style={{animationDelay:'300ms'}}></div>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center h-full">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] shrink-0"></span>
                                <span className="text-[10px] font-bold text-[#1DB954] uppercase tracking-wider">SPOTIFY</span>
                            </div>
                            <div className="font-bold text-base truncate text-white/90 leading-tight">{currentTrack?.name || "Müzik Durduruldu"}</div>
                            <div className="text-xs text-white/50 truncate font-medium">{currentTrack?.artists[0]?.name || "Parça seçin"}</div>
                            {/* Mini Progress Bar */}
                            {currentTrack && (
                                <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-[#1DB954] rounded-full" style={{ width: `${(trackProgress / currentTrack.duration_ms) * 100}%` }}></div>
                                </div>
                            )}
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                            {isPaused ? <Play size={18} fill="white" className="ml-0.5 text-white/80" /> : <Pause size={18} fill="white" className="text-white/80" />}
                        </div>
                    </>
                 )}
            </div>

            {/* Stations Widget */}
            <div onClick={() => onExpand('stations')} className="col-span-2 h-[70px] bg-[#1c1c1e]/60 backdrop-blur-xl rounded-3xl border border-white/10 p-3 px-5 flex items-center justify-between active:scale-[0.98] transition-transform">
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest mb-0.5">YAKIN İSTASYONLAR</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold tabular-nums text-white">{stations.length}</span>
                        <span className="text-xs font-bold opacity-60">Bölge</span>
                    </div>
                </div>
                <div className="flex -space-x-3">
                     {stations.slice(0,3).map((s:any, i:number) => (
                         <div key={i} className="w-10 h-10 rounded-full bg-[#2c2c2e] border-2 border-[#121214] flex items-center justify-center text-xs font-bold text-white/50">{s.direction[0]}</div>
                     ))}
                     {stations.length > 3 && <div className="w-10 h-10 rounded-full bg-[#2c2c2e] border-2 border-[#121214] flex items-center justify-center text-xs font-bold text-white/50">+{stations.length - 3}</div>}
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
  
  // Spotify States
  const [spotifyToken, setSpotifyToken] = useState<string | null>(localStorage.getItem('spotify_token'));
  const [spotifyClientId, setSpotifyClientId] = useState<string>(localStorage.getItem('spotify_client_id') || 'ea912decbcc14169b6676efa223f28c5');
  const [spotifyUser, setSpotifyUser] = useState({ isLoggedIn: false, name: '' });
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [isPaused, setIsPaused] = useState(true);
  const [trackProgress, setTrackProgress] = useState(0);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [playerDeviceId, setPlayerDeviceId] = useState<string | null>(null);
  const playerRef = useRef<any>(null);

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

  // --- SPOTIFY LOGIC ---

  // 1. Auth Init (Debug Mode - FIXED for Blob/Preview URLs)
  const handleSpotifyLogin = () => {
    try {
        const clientId = 'ea912decbcc14169b6676efa223f28c5';
        const productionUri = 'https://riderouteck-nine.vercel.app/'; // User provided production URI

        let redirectUri = window.location.href;
        
        // CHECK: If we are in a Blob URL (Preview) or a Google Cloud Function URL (Preview environment)
        // We MUST use the hardcoded production URI, otherwise Spotify will reject the 'blob:...' URI.
        if (redirectUri.startsWith('blob:') || redirectUri.includes('scf.usercontent.goog')) {
             console.log("Preview environment detected. Using Production URI for Spotify Redirect.");
             redirectUri = productionUri;
        } else {
            // Normal environment: Clean hash and params
            if (redirectUri.includes('#')) redirectUri = redirectUri.split('#')[0];
            if (redirectUri.includes('?')) redirectUri = redirectUri.split('?')[0];
            
            // Note: We do NOT strip the trailing slash anymore, to ensure it matches the user's dashboard registration exactly.
        }

        console.log("DEBUG: Final Redirect URI used:", redirectUri);

        const scopes = [
            "streaming",
            "user-read-email",
            "user-read-private",
            "user-read-playback-state",
            "user-modify-playback-state",
            "playlist-read-private"
        ];

        const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(" "))}`;
        
        console.log("DEBUG: Redirecting to:", authUrl);
        
        // 3. Perform Redirect
        window.location.href = authUrl;

    } catch (e: any) {
        console.error("Spotify Login Error:", e);
        // CRITICAL: Alert the user with the exact error so they can debug
        alert(`Spotify Bağlantı Hatası!\n\nHata: ${e.message}\n\nLütfen tarayıcı konsolunu kontrol edin.`);
    }
  };

  const handleSpotifyLogout = () => {
      setSpotifyToken(null);
      localStorage.removeItem('spotify_token');
      setSpotifyUser({ isLoggedIn: false, name: '' });
      setCurrentTrack(null);
      if (playerRef.current) playerRef.current.disconnect();
      window.location.hash = '';
      window.location.reload();
  };

  // 2. Token Parse & SDK Init
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
        const token = new URLSearchParams(hash.substring(1)).get('access_token');
        if (token) {
            setSpotifyToken(token);
            localStorage.setItem('spotify_token', token);
            window.location.hash = '';
        }
    }
  }, []);

  // 3. SDK Setup
  useEffect(() => {
    if (!spotifyToken) return;

    let playerInstance: any = null;

    const initializePlayer = () => {
        if (!(window as any).Spotify) return;

        const player = new (window as any).Spotify.Player({
            name: 'MotoRota Web Player',
            getOAuthToken: (cb: any) => { cb(spotifyToken); },
            volume: 0.8
        });

        player.addListener('ready', ({ device_id }: any) => {
            console.log('Ready with Device ID', device_id);
            setPlayerDeviceId(device_id);
            setSpotifyUser(prev => ({ ...prev, isLoggedIn: true })); 
            
            // Transfer playback to this device to avoid "active device" issues
            fetch('https://api.spotify.com/v1/me/player', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${spotifyToken}` },
                body: JSON.stringify({ device_ids: [device_id], play: false })
            }).catch(err => console.error("Transfer playback failed", err));
        });

        player.addListener('not_ready', ({ device_id }: any) => {
            console.log('Device ID has gone offline', device_id);
        });

        player.addListener('authentication_error', ({ message }: any) => {
            console.error(message);
            handleSpotifyLogout();
        });

        player.addListener('player_state_changed', (state: SpotifyPlayerState) => {
            if (!state) return;
            setCurrentTrack(state.track_window.current_track);
            setIsPaused(state.paused);
            setTrackProgress(state.position);
            
            player.getCurrentState().then((s: any) => { 
                if(s) setTrackProgress(s.position); 
            });
        });

        player.connect();
        playerRef.current = player;
        playerInstance = player;
    };

    if ((window as any).Spotify) {
        initializePlayer();
    } else {
        (window as any).onSpotifyWebPlaybackSDKReady = initializePlayer;
        if (!document.getElementById('spotify-sdk')) {
            const script = document.createElement("script");
            script.id = 'spotify-sdk';
            script.src = "https://sdk.scdn.co/spotify-player.js";
            script.async = true;
            script.crossOrigin = "anonymous"; 
            document.body.appendChild(script);
        }
    }
        
    // Fetch User Info
    fetch('https://api.spotify.com/v1/me', { headers: { 'Authorization': `Bearer ${spotifyToken}` } })
        .then(res => {
            if (res.status === 401) throw new Error("Token expired");
            return res.json();
        })
        .then(data => setSpotifyUser({ isLoggedIn: true, name: data.display_name }))
        .catch(() => handleSpotifyLogout());

    // Fetch Playlists
    fetch('https://api.spotify.com/v1/me/playlists', { headers: { 'Authorization': `Bearer ${spotifyToken}` } })
        .then(res => {
            if (res.status === 401) throw new Error("Token expired");
            return res.json();
        })
        .then(data => setPlaylists(data.items || []))
        .catch(() => {});

    return () => {
        if (playerInstance) playerInstance.disconnect();
    };
  }, [spotifyToken]);

  // Smooth Progress Bar Interpolation
  useEffect(() => {
    if (isPaused || !currentTrack) return;
    
    const interval = setInterval(() => {
        setTrackProgress(prev => {
            if (prev >= currentTrack.duration_ms) return prev;
            return prev + 100; // Increment by 100ms
        });
    }, 100);

    return () => clearInterval(interval);
  }, [isPaused, currentTrack]);

  // 4. Playback Controls
  const spotifyControl = {
      togglePlay: () => playerRef.current?.togglePlay(),
      next: () => playerRef.current?.nextTrack(),
      prev: () => playerRef.current?.previousTrack(),
      seek: (ms: number) => playerRef.current?.seek(ms),
      playContext: (uri: string) => {
          fetch(`https://api.spotify.com/v1/me/player/play?device_id=${playerDeviceId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${spotifyToken}` },
              body: JSON.stringify({ context_uri: uri })
          }).catch(e => console.error("Play context failed", e));
      }
  };

  const musicHandlers = {
      currentTrack,
      isPaused,
      progress: trackProgress,
      togglePlay: spotifyControl.togglePlay,
      next: spotifyControl.next,
      prev: spotifyControl.prev
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
              // Silently fail in preview environments where policy prevents wake lock
              // console.log('Wake Lock Error', e); 
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
        {expandedView && <DetailOverlay type={expandedView} data={expandedData} onClose={handleCloseModal} theme={theme} musicHandlers={musicHandlers} spotifyUser={spotifyUser} onSpotifyLogin={handleSpotifyLogin} onSpotifyLogout={handleSpotifyLogout} clientId={spotifyClientId} setClientId={setSpotifyClientId} playlists={playlists} onPlayPlaylist={spotifyControl.playContext} />}
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

        {currentTrack && !expandedView && !isVisorMode && spotifyUser.isLoggedIn && (
             <div className="absolute top-[100px] left-0 right-0 px-6 z-50 flex justify-center animate-in slide-in-from-top-4 fade-in duration-500 ios-ease">
                <button onClick={() => setExpandedView('spotify')} className="flex items-center gap-4 bg-[#1DB954]/90 backdrop-blur-xl text-black px-4 py-3 rounded-full shadow-[0_10px_30px_rgba(29,185,84,0.4)] border border-[#1DB954]/50 active:scale-95 transition-all group hover:bg-[#1ed760] max-w-[90%]">
                    <img src={currentTrack.album.images[0]?.url} className="w-10 h-10 rounded shadow-md object-cover" alt="Cover"/>
                    <div className="flex flex-col items-start leading-none mr-2 min-w-0 flex-1">
                        <span className="text-xs font-bold truncate w-full">{currentTrack.name}</span>
                        <span className="text-[10px] font-medium opacity-80 truncate w-full">{currentTrack.artists[0]?.name}</span>
                    </div>
                    <div onClick={(e) => { e.stopPropagation(); spotifyControl.togglePlay(); }} className="p-1 rounded-full bg-black/10 hover:bg-black/20 transition-colors shrink-0">
                        {isPaused ? <Play size={24} fill="currentColor" className="text-black/80 ml-0.5" /> : <Pause size={24} fill="currentColor" className="text-black/80" />}
                    </div>
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

        <EnvGrid weather={weather} analysis={analysis} bikeHeading={effectiveHeading} tripDistance={tripDistance} currentTrack={currentTrack} isPaused={isPaused} isDark={isDark} onExpand={(type: string) => { setExpandedView(type); if(type === 'copilot' && isVoiceEnabled) speak(`${analysis.message}. ${analysis.roadCondition}`); }} btDevice={btDevice} onConnectBt={handleConnectBluetooth} windChill={windChill} apparentWind={apparentWind} isFocusMode={isFocusMode} stations={nearbyStations} spotifyUser={spotifyUser} trackProgress={trackProgress} onSpotifyLogin={handleSpotifyLogin} />
    </div>
  );
};

export default App;