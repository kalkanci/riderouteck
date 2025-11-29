import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, CloudRain, Wind, AlertTriangle, ShieldCheck, XCircle, Volume2, Settings, Mountain, Zap, Wallet, Menu, X, Thermometer, ArrowUp, Umbrella, Eye, Activity, LocateFixed, Compass } from 'lucide-react';
import { LocationData, RouteAnalysis, WeatherData } from './types';
import { searchLocation, getIpLocation, getRoute, getWeatherForPoint } from './services/api';
import { analyzeRouteWithGemini } from './services/geminiService';

// Helper: Haversine distance
const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const deg2rad = (deg: number) => deg * (Math.PI / 180);

const calculateWindChill = (temp: number, windSpeed: number) => {
    const ridingSpeed = 80; 
    const v = ridingSpeed + windSpeed; 
    const chill = 13.12 + (0.6215 * temp) - (11.37 * Math.pow(v, 0.16)) + (0.3965 * temp * Math.pow(v, 0.16));
    return Math.round(chill);
};

const App: React.FC = () => {
  // --- State ---
  const [startLoc, setStartLoc] = useState<LocationData | null>(null);
  const [endLoc, setEndLoc] = useState<LocationData | null>(null);
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationData[]>([]);
  const [loading, setLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [analysis, setAnalysis] = useState<RouteAnalysis | null>(null);
  const [activeSearchField, setActiveSearchField] = useState<'start' | 'end' | null>(null);
  const [weatherPoints, setWeatherPoints] = useState<WeatherData[]>([]);
  
  // Navigation & Settings
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [fallbackWarning, setFallbackWarning] = useState<boolean>(false);
  
  // Active Navigation State
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [heading, setHeading] = useState(0);

  // --- Refs ---
  const mapRef = useRef<any>(null); 
  const routeLayerRef = useRef<any>(null); 
  const routeGlowLayerRef = useRef<any>(null); 
  const markersRef = useRef<any[]>([]); 
  const userMarkerRef = useRef<any>(null); 
  const wakeLockRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);

  // --- Initialization ---
  useEffect(() => {
    if (!mapRef.current && window.L) {
      mapRef.current = window.L.map('map-container', {
        zoomControl: false,
        attributionControl: false
      }).setView([39.9334, 32.8597], 6);

      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        maxZoom: 19
      }).addTo(mapRef.current);
    }

    // Initial Geolocation
    const initLocation = async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            updateUserMarker(latitude, longitude, 0);
            setStartLoc({ name: "Konumum", lat: latitude, lng: longitude });
            setStartQuery("Konumum");
            // Center map initially
            if(mapRef.current) mapRef.current.setView([latitude, longitude], 14);
          },
          async () => {
            const ipLoc = await getIpLocation();
            if (ipLoc) {
              updateUserMarker(ipLoc.lat, ipLoc.lng, 0);
              setStartLoc(ipLoc);
              setStartQuery(ipLoc.name);
            }
          }
        );
      }
    };
    initLocation();

    return () => {
        if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // --- Navigation Logic (GPS & WakeLock) ---
  const startNavigation = async () => {
    if (!startLoc || !endLoc) return;
    setIsNavigating(true);

    // Wake Lock
    if ('wakeLock' in navigator) {
        try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } 
        catch (err) { console.error(err); }
    }

    // Start Watching Position
    if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, speed, heading: gpsHeading } = pos.coords;
                const kmh = speed ? Math.round(speed * 3.6) : 0;
                setCurrentSpeed(kmh);
                
                const currentHeading = gpsHeading || 0;
                setHeading(currentHeading);

                updateUserMarker(latitude, longitude, currentHeading, true);

                if (mapRef.current) {
                    // TomTom style: High zoom, centered on user
                    mapRef.current.setView([latitude, longitude], 18, { animate: true, duration: 0.5 });
                }
            },
            (err) => console.error(err),
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 3000 }
        );
    }
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
    }
    if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
    }
    // Revert marker and view
    if (startLoc && mapRef.current) {
        updateUserMarker(startLoc.lat, startLoc.lng, 0, false);
        if (routeLayerRef.current) {
            mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] });
        }
    }
  };

  const updateUserMarker = (lat: number, lng: number, headingVal: number, isNav: boolean = false) => {
    if (!mapRef.current) return;
    if (userMarkerRef.current) mapRef.current.removeLayer(userMarkerRef.current);
    
    let icon;
    if (isNav) {
        // Navigation Arrow
        const svg = `
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
             <path d="M12 2L4.5 20.5L12 17L19.5 20.5L12 2Z" fill="#3b82f6" stroke="white" stroke-width="3" stroke-linejoin="round"/>
          </svg>`;
        icon = window.L.divIcon({
            className: 'nav-arrow',
            html: `<div style="transform: rotate(${headingVal}deg); width: 48px; height: 48px; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.5)); transition: transform 0.3s ease;">${svg}</div>`,
            iconSize: [48, 48],
            iconAnchor: [24, 24]
        });
    } else {
        // Pulse Dot
        icon = window.L.divIcon({
            className: 'user-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
    }
    userMarkerRef.current = window.L.marker([lat, lng], { icon }).addTo(mapRef.current);
    if(isNav) userMarkerRef.current.setZIndexOffset(9999);
  };

  // --- Route Logic ---
  const calculateRoute = async () => {
    if (!startLoc || !endLoc) return;
    setLoading(true);
    setAnalysis(null);
    setFallbackWarning(false);
    
    // Clean Map
    if (routeLayerRef.current) mapRef.current.removeLayer(routeLayerRef.current);
    if (routeGlowLayerRef.current) mapRef.current.removeLayer(routeGlowLayerRef.current);
    markersRef.current.forEach(m => mapRef.current.removeLayer(m));
    markersRef.current = [];

    const result = await getRoute(startLoc, endLoc, { avoidTolls });
    const route = result.geometry;

    if (!route) {
      setLoading(false);
      alert("Rota bulunamadı.");
      return;
    }

    if (result.usedFallback) {
        setFallbackWarning(true);
        setTimeout(() => setFallbackWarning(false), 5000);
    }

    setRouteInfo({ distance: route.distance, duration: route.duration });

    // Draw Map
    if (mapRef.current) {
      const latLngs = route.coordinates.map(c => [c[1], c[0]]);
      const color = avoidTolls ? '#10b981' : '#3b82f6'; // Green for Free, Blue for Toll

      routeGlowLayerRef.current = window.L.polyline(latLngs, { color: color, weight: 8, opacity: 0.4, className: 'blur-sm' }).addTo(mapRef.current);
      routeLayerRef.current = window.L.polyline(latLngs, { color: color, weight: 5 }).addTo(mapRef.current);
      mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [80, 80] });
    }

    // Weather Points
    const pointsToSample = 5;
    const step = Math.floor(route.coordinates.length / (pointsToSample + 1));
    const weatherPromises: Promise<WeatherData>[] = [];
    for (let i = 1; i <= pointsToSample; i++) {
      const coord = route.coordinates[i * step];
      weatherPromises.push(getWeatherForPoint(coord[1], coord[0]));
    }
    const weatherDataList = await Promise.all(weatherPromises);
    setWeatherPoints(weatherDataList);

    // Add Markers (Only in overview mode)
    if (!isNavigating) {
        weatherDataList.forEach(w => {
            let colorClass = 'bg-emerald-500';
            if (w.rain > 0.5) colorClass = 'bg-blue-500';
            else if (w.windSpeed > 25) colorClass = 'bg-yellow-500';

            const icon = window.L.divIcon({
                className: '',
                html: `<div class="${colorClass} w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-slate-900 font-bold text-[10px]">${Math.round(w.temp)}°</div>`,
                iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
            });
            markersRef.current.push(window.L.marker([w.lat, w.lng], { icon }).addTo(mapRef.current));
        });
    }

    // AI Analysis
    const aiResult = await analyzeRouteWithGemini(startLoc.name, endLoc.name, weatherDataList, 'fastest');
    setAnalysis(aiResult);
    setLoading(false);
  };

  // --- Search Logic ---
  useEffect(() => {
    const query = activeSearchField === 'start' ? startQuery : endQuery;
    if (!query || query.length < 3) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const results = await searchLocation(query);
      setSearchResults(results);
    }, 500);
    return () => clearTimeout(timer);
  }, [startQuery, endQuery, activeSearchField]);

  const handleSelectLocation = (loc: LocationData) => {
    if (activeSearchField === 'start') { setStartLoc(loc); setStartQuery(loc.name); } 
    else { setEndLoc(loc); setEndQuery(loc.name); }
    setSearchResults([]); setActiveSearchField(null);
  };

  // --- Helper Calculations ---
  const currentAvgWeather = weatherPoints.length > 0 ? weatherPoints[0] : null; 
  const windChill = currentAvgWeather ? calculateWindChill(currentAvgWeather.temp, currentAvgWeather.windSpeed) : 0;
  const hasImpendingRain = weatherPoints.some(w => w.rainProb > 40);
  const hasWindRisk = currentAvgWeather ? currentAvgWeather.windSpeed > 25 : false;

  return (
    <div className="relative h-screen w-full flex flex-col bg-slate-900 font-sans overflow-hidden">
      
      <div id="map-container" className="absolute inset-0 z-0" />

      {/* --- NAVIGATION MODE (TOMTOM STYLE) --- */}
      {isNavigating && routeInfo && (
        <>
            {/* Top Bar: Next Maneuver / Compass */}
            <div className="absolute top-4 left-4 right-4 z-50 flex justify-between items-start pointer-events-none">
                 <div className="bg-slate-900/90 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[150px]">
                    <div className="bg-blue-600 p-2 rounded-xl text-white">
                        <Navigation size={32} className="transform -rotate-45" />
                    </div>
                    <div>
                        <div className="text-xs text-slate-400 font-bold uppercase">Rota Takip</div>
                        <div className="text-xl font-bold text-white tracking-tight">{Math.round(routeInfo.distance / 1000)} km</div>
                    </div>
                 </div>

                 {/* Stop Button */}
                 <button onClick={stopNavigation} className="pointer-events-auto bg-red-600 hover:bg-red-500 text-white p-3 rounded-full shadow-lg border-2 border-slate-900">
                    <XCircle size={28} />
                 </button>
            </div>

            {/* Dynamic Warnings (Pills) */}
            <div className="absolute top-28 left-4 z-40 space-y-2 pointer-events-none">
                {hasImpendingRain && (
                    <div className="bg-blue-600/90 backdrop-blur-md text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-left">
                        <Umbrella size={18} className="animate-bounce" />
                        <span className="text-sm font-bold">Yağmur Yaklaşıyor</span>
                    </div>
                )}
                {hasWindRisk && (
                     <div className="bg-yellow-500/90 backdrop-blur-md text-slate-900 px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-left">
                        <Wind size={18} />
                        <span className="text-sm font-bold">Şiddetli Rüzgar</span>
                    </div>
                )}
            </div>

            {/* Bottom Dashboard (The TomTom Look) */}
            <div className="absolute bottom-6 left-4 right-4 z-50 pointer-events-none">
                <div className="bg-slate-900/90 backdrop-blur-xl border border-white/20 rounded-3xl p-5 shadow-2xl grid grid-cols-3 items-center gap-4">
                    
                    {/* 1. Speed (Big & Bold) */}
                    <div className="flex flex-col items-center justify-center border-r border-white/10 pr-2">
                        <div className="text-6xl font-black text-white tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                            {currentSpeed}
                        </div>
                        <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">KM/H</div>
                    </div>

                    {/* 2. Route Stats */}
                    <div className="flex flex-col items-center justify-center border-r border-white/10 pr-2 space-y-2">
                        <div className="text-center">
                            <div className="text-sm text-slate-400 font-bold uppercase">Süre</div>
                            <div className="text-xl font-bold text-white">{Math.floor(routeInfo.duration / 60)} <span className="text-sm">dk</span></div>
                        </div>
                        <div className="text-center">
                             <div className="text-sm text-slate-400 font-bold uppercase">Varış</div>
                             {/* Simple ETA Calc */}
                             <div className="text-lg font-bold text-emerald-400">
                                {new Date(new Date().getTime() + routeInfo.duration * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                             </div>
                        </div>
                    </div>

                    {/* 3. Weather / Visor Data */}
                    <div className="flex flex-col items-center justify-center pl-2">
                        {currentAvgWeather ? (
                            <>
                                <div className="flex items-center gap-1 mb-1">
                                    <Thermometer size={14} className={windChill < 15 ? 'text-blue-400' : 'text-orange-400'}/>
                                    <span className="text-2xl font-bold text-white">{windChill}°</span>
                                </div>
                                <div className="text-[10px] text-slate-400 uppercase font-bold text-center">Hissedilen</div>
                                
                                <div className="mt-2 flex items-center gap-1 bg-white/10 px-2 py-1 rounded-lg">
                                    <div style={{ transform: `rotate(${currentAvgWeather.windDirection}deg)` }}>
                                        <ArrowUp size={12} className="text-slate-300" />
                                    </div>
                                    <span className="text-xs font-bold text-white">{Math.round(currentAvgWeather.windSpeed)} km</span>
                                </div>
                            </>
                        ) : (
                            <span className="text-xs text-slate-500">Veri Yok</span>
                        )}
                    </div>

                </div>
            </div>
        </>
      )}

      {/* --- IDLE / PLANNING MODE UI --- */}
      {!isNavigating && (
        <>
            <div className="absolute top-6 left-4 right-4 z-40 flex flex-col gap-3 pointer-events-none">
                <div className="flex justify-between items-center pointer-events-auto">
                    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-3 rounded-2xl shadow-2xl flex items-center gap-2">
                        <Navigation className="w-5 h-5 text-blue-400" />
                        <span className="font-bold text-white tracking-wide">MotoRota</span>
                    </div>
                    
                    {/* Toll Toggle Switch */}
                    <button 
                        onClick={() => setAvoidTolls(!avoidTolls)}
                        className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all shadow-xl ${avoidTolls ? 'bg-emerald-600 border-emerald-400 text-white shadow-emerald-500/30' : 'bg-slate-900/60 border-white/10 text-slate-400'}`}
                    >
                        <Wallet size={18} />
                        <span className="text-xs font-bold">{avoidTolls ? 'Ücretsiz & Manzaralı' : 'Standart Rota'}</span>
                    </button>
                </div>

                {fallbackWarning && (
                    <div className="bg-orange-500/90 backdrop-blur-xl p-3 rounded-2xl shadow-2xl pointer-events-auto flex items-center gap-3 animate-in slide-in-from-top-5">
                        <Activity className="text-white shrink-0" size={20} />
                        <div className="text-xs text-white font-medium">Tam ücretsiz rota bulunamadı, en uygun alternatif gösteriliyor.</div>
                    </div>
                )}

                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-2xl pointer-events-auto flex flex-col gap-2">
                <div className="relative group">
                    <div className="absolute left-4 top-3.5 text-blue-400"><MapPin size={18} /></div>
                    <input type="text" placeholder="Nereden?" className="w-full bg-white/5 hover:bg-white/10 text-white p-3 pl-11 rounded-2xl border-none outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder-slate-400"
                    value={startQuery} onChange={(e) => setStartQuery(e.target.value)} onFocus={() => setActiveSearchField('start')}
                    />
                </div>
                <div className="relative group">
                    <div className="absolute left-4 top-3.5 text-red-400"><Search size={18} /></div>
                    <input type="text" placeholder="Nereye?" className="w-full bg-white/5 hover:bg-white/10 text-white p-3 pl-11 rounded-2xl border-none outline-none focus:ring-2 focus:ring-red-500/50 transition-all placeholder-slate-400"
                    value={endQuery} onChange={(e) => setEndQuery(e.target.value)} onFocus={() => setActiveSearchField('end')}
                    />
                </div>
                {activeSearchField && searchResults.length > 0 && (
                    <div className="bg-slate-800/90 backdrop-blur-md rounded-xl mt-1 overflow-hidden border border-white/5 max-h-[30vh] overflow-y-auto">
                    {searchResults.map((res, idx) => (
                        <div key={idx} className="p-3 hover:bg-white/10 cursor-pointer text-sm flex flex-col border-b border-white/5" onClick={() => handleSelectLocation(res)}>
                        <span className="font-bold text-white">{res.name}</span>
                        {res.admin1 && <span className="text-slate-400 text-xs">{res.admin1}</span>}
                        </div>
                    ))}
                    </div>
                )}
                </div>

                <div className="pointer-events-auto">
                    <button onClick={calculateRoute} disabled={!startLoc || !endLoc || loading}
                    className={`w-full py-3.5 rounded-2xl font-bold shadow-xl transition-all border border-white/10 backdrop-blur-md ${loading ? 'bg-slate-800/80 text-slate-500' : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white'}`}>
                    {loading ? 'Rota Hesaplanıyor...' : 'Rotayı Göster'}
                    </button>
                </div>
            </div>

            {/* Analysis Sheet */}
            {analysis && currentAvgWeather && (
                <div className="absolute bottom-4 left-4 right-4 z-40 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-4 shadow-2xl max-h-[60vh] overflow-y-auto animate-in slide-in-from-bottom-10">
                
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                             <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${analysis.riskLevel === 'Düşük' ? 'border-emerald-500 text-emerald-500' : 'border-red-500 text-red-500'}`}>
                                {analysis.riskLevel} Risk
                             </div>
                             {avoidTolls && <div className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-blue-500 text-blue-500">Ücretsiz</div>}
                        </div>
                        <h2 className="text-white font-bold text-lg leading-tight w-3/4">{analysis.summary.split('.')[0]}.</h2>
                    </div>
                    {routeInfo && (
                        <div className="text-right">
                        <div className="text-xl font-bold text-white font-mono">{(routeInfo.distance / 1000).toFixed(0)}<span className="text-sm">km</span></div>
                        <div className="text-xs text-slate-400">{Math.floor(routeInfo.duration / 60)}dk</div>
                        </div>
                    )}
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/5 p-3 rounded-2xl">
                         <div className="text-[10px] text-slate-400 uppercase font-bold mb-1 flex items-center gap-1"><Thermometer size={10}/> Hissedilen</div>
                         <div className="text-xl font-bold text-white">{windChill}°</div>
                         <div className="text-[10px] text-slate-300 leading-tight mt-1">{windChill < 15 ? 'Kışlık Ekipman' : 'Mevsimlik'}</div>
                    </div>
                    <div className="bg-white/5 p-3 rounded-2xl">
                         <div className="text-[10px] text-slate-400 uppercase font-bold mb-1 flex items-center gap-1"><Mountain size={10}/> Rakım</div>
                         <div className="text-[10px] text-slate-300 leading-tight">{analysis.elevationDetails.substring(0, 50)}...</div>
                    </div>
                </div>

                {/* Main Action Button: Start Navigation */}
                <button 
                    onClick={startNavigation}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-emerald-900/50 flex items-center justify-center gap-2 mb-3 transition-transform active:scale-95"
                >
                    <Navigation size={20} fill="currentColor" />
                    BAŞLA
                </button>
                
                {/* Secondary Links */}
                <div className="grid grid-cols-2 gap-3">
                    <a href={`https://www.google.com/maps/dir/?api=1&origin=${startLoc?.lat},${startLoc?.lng}&destination=${endLoc?.lat},${endLoc?.lng}&travelmode=driving`} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-slate-400 py-2 rounded-xl font-bold text-xs transition-colors">
                    Google Maps
                    </a>
                    <a href={`yandexnavi://build_route_on_map?lat_from=${startLoc?.lat}&lon_from=${startLoc?.lng}&lat_to=${endLoc?.lat}&lon_to=${endLoc?.lng}`} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-slate-400 py-2 rounded-xl font-bold text-xs transition-colors">
                    Yandex
                    </a>
                </div>
                </div>
            )}
        </>
      )}

    </div>
  );
};

export default App;
