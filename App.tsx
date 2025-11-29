import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, CloudRain, Wind, AlertTriangle, ShieldCheck, XCircle, Volume2, Settings, Mountain, Zap, Wallet, Menu, X, Thermometer, ArrowUp, Umbrella, Eye, Activity, LocateFixed, Compass, Music, Coffee, Map as MapIcon, Sparkles, ChevronRight, Play, SkipForward, Radio } from 'lucide-react';
import { LocationData, RouteAnalysis, WeatherData, RouteAlternative } from './types';
import { searchLocation, getIpLocation, getRouteAlternatives, getWeatherForPoint } from './services/api';
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
  
  // Route Selection State
  const [routes, setRoutes] = useState<RouteAlternative[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [analysis, setAnalysis] = useState<RouteAnalysis | null>(null);
  const [weatherPoints, setWeatherPoints] = useState<WeatherData[]>([]);

  const [activeSearchField, setActiveSearchField] = useState<'start' | 'end' | null>(null);
  
  // Navigation & Visor State
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [heading, setHeading] = useState(0);
  const [showMusicPanel, setShowMusicPanel] = useState(false);

  // Analysis Tabs
  const [activeTab, setActiveTab] = useState<'general' | 'segments' | 'stops'>('general');

  // --- Refs ---
  const mapRef = useRef<any>(null); 
  const routeLayersRef = useRef<any[]>([]); // Array for multiple route lines
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

    const initLocation = async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            updateUserMarker(latitude, longitude, 0);
            setStartLoc({ name: "Konumum", lat: latitude, lng: longitude });
            setStartQuery("Konumum");
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

  // --- Visualization Logic ---
  const drawRoutes = (routeList: RouteAlternative[], selectedIndex: number) => {
      if (!mapRef.current) return;

      // Clear existing layers
      routeLayersRef.current.forEach(layer => mapRef.current.removeLayer(layer));
      routeLayersRef.current = [];

      // Draw each route
      routeList.forEach((route, index) => {
          const isSelected = index === selectedIndex;
          const latLngs = route.coordinates.map(c => [c[1], c[0]]);
          
          // Style: Selected is thick/bright, Unselected is thin/dim
          const weight = isSelected ? 6 : 4;
          const opacity = isSelected ? 1 : 0.4;
          const color = route.color;

          // Glow effect for selected
          if (isSelected) {
            const glow = window.L.polyline(latLngs, { color: color, weight: 12, opacity: 0.3, className: 'blur-md' }).addTo(mapRef.current);
            routeLayersRef.current.push(glow);
          }

          const line = window.L.polyline(latLngs, { color: color, weight: weight, opacity: opacity, dashArray: isSelected ? null : '5, 10' }).addTo(mapRef.current);
          
          // Click to select logic
          line.on('click', () => handleRouteSelect(index));
          
          routeLayersRef.current.push(line);

          if (isSelected) {
              mapRef.current.fitBounds(line.getBounds(), { padding: [80, 80] });
          }
      });
  };

  const handleRouteSelect = async (index: number) => {
      setSelectedRouteIndex(index);
      drawRoutes(routes, index); // Re-draw to update highlighting
      
      // Re-fetch weather and AI for the selected route
      // To optimize, we could cache this, but for now we fetch fresh
      const selectedRoute = routes[index];
      await analyzeSelectedRoute(selectedRoute);
  };

  // --- Core Calculation Logic ---
  const calculateRoutes = async () => {
    if (!startLoc || !endLoc) return;
    setLoading(true);
    setRoutes([]);
    setAnalysis(null);
    markersRef.current.forEach(m => mapRef.current.removeLayer(m));
    markersRef.current = [];

    // 1. Get Alternatives (Fast vs Scenic)
    const alternatives = await getRouteAlternatives(startLoc, endLoc);
    
    if (alternatives.length === 0) {
      setLoading(false);
      alert("Rota bulunamadı.");
      return;
    }

    setRoutes(alternatives);
    setSelectedRouteIndex(0);
    drawRoutes(alternatives, 0);

    // 2. Analyze the first (default) route
    await analyzeSelectedRoute(alternatives[0]);
    setLoading(false);
  };

  const analyzeSelectedRoute = async (route: RouteAlternative) => {
    // Sample points for weather
    const pointsToSample = 5;
    const step = Math.floor(route.coordinates.length / (pointsToSample + 1));
    const weatherPromises: Promise<WeatherData>[] = [];
    for (let i = 1; i <= pointsToSample; i++) {
      const coord = route.coordinates[i * step];
      weatherPromises.push(getWeatherForPoint(coord[1], coord[0]));
    }
    const weatherDataList = await Promise.all(weatherPromises);
    setWeatherPoints(weatherDataList);

    // Add Weather Markers
    markersRef.current.forEach(m => mapRef.current.removeLayer(m));
    markersRef.current = [];
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

    // Gemini Analysis
    const routeType = route.type === 'scenic' ? 'scenic' : 'fastest';
    const aiResult = await analyzeRouteWithGemini(startLoc?.name || "", endLoc?.name || "", weatherDataList, routeType);
    setAnalysis(aiResult);
  };

  // --- Navigation & Music Logic ---
  const startNavigation = async () => {
    setIsNavigating(true);
    if ('wakeLock' in navigator) {
        try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (e) {}
    }
    if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, speed, heading: gpsHeading } = pos.coords;
                setCurrentSpeed(speed ? Math.round(speed * 3.6) : 0);
                setHeading(gpsHeading || 0);
                updateUserMarker(latitude, longitude, gpsHeading || 0, true);
                if (mapRef.current) mapRef.current.setView([latitude, longitude], 18, { animate: true, duration: 0.5 });
            },
            (err) => console.error(err),
            { enableHighAccuracy: true, maximumAge: 1000 }
        );
    }
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setShowMusicPanel(false);
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    if (wakeLockRef.current) wakeLockRef.current.release();
    if (startLoc && mapRef.current) {
        updateUserMarker(startLoc.lat, startLoc.lng, 0, false);
        const selected = routes[selectedRouteIndex];
        const latLngs = selected.coordinates.map(c => [c[1], c[0]]);
        mapRef.current.fitBounds(window.L.polyline(latLngs).getBounds(), { padding: [50, 50] });
    }
  };

  const openSpotify = () => {
      // Try deep link first, then web fallback
      window.location.href = "spotify://";
      setTimeout(() => {
          window.open("https://open.spotify.com", "_blank");
      }, 1000);
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

  const updateUserMarker = (lat: number, lng: number, headingVal: number, isNav: boolean = false) => {
    if (!mapRef.current) return;
    if (userMarkerRef.current) mapRef.current.removeLayer(userMarkerRef.current);
    const svg = isNav ? 
        `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L4.5 20.5L12 17L19.5 20.5L12 2Z" fill="#3b82f6" stroke="white" stroke-width="3" stroke-linejoin="round"/></svg>` : 
        '';
    const icon = isNav ? window.L.divIcon({ className: 'nav-arrow', html: `<div style="transform: rotate(${headingVal}deg); width: 48px; height: 48px; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.5)); transition: transform 0.3s ease;">${svg}</div>`, iconSize: [48, 48], iconAnchor: [24, 24] }) : window.L.divIcon({ className: 'user-marker', iconSize: [20, 20], iconAnchor: [10, 10] });
    userMarkerRef.current = window.L.marker([lat, lng], { icon }).addTo(mapRef.current);
    if(isNav) userMarkerRef.current.setZIndexOffset(9999);
  };

  // Helper values
  const currentAvgWeather = weatherPoints.length > 0 ? weatherPoints[0] : null; 
  const windChill = currentAvgWeather ? calculateWindChill(currentAvgWeather.temp, currentAvgWeather.windSpeed) : 0;
  const currentRoute = routes[selectedRouteIndex];

  return (
    <div className="relative h-screen w-full flex flex-col bg-slate-900 font-sans overflow-hidden">
      <div id="map-container" className="absolute inset-0 z-0" />

      {/* --- VISOR MODE (Navigation) --- */}
      {isNavigating && currentRoute && (
        <>
            {/* Top Info Bar */}
            <div className="absolute top-4 left-4 right-4 z-50 flex justify-between items-start pointer-events-none">
                 <div className="bg-slate-900/90 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-2xl flex items-center gap-4">
                    <div className="bg-blue-600 p-2 rounded-xl text-white transform -rotate-45"><Navigation size={32} /></div>
                    <div>
                        <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Mesafe</div>
                        <div className="text-2xl font-black text-white">{Math.round(currentRoute.distance / 1000)}<span className="text-sm font-medium text-slate-400">km</span></div>
                    </div>
                 </div>

                 <div className="flex flex-col gap-2 pointer-events-auto">
                     <button onClick={stopNavigation} className="bg-red-600/90 hover:bg-red-500 text-white p-3 rounded-xl shadow-lg border-2 border-slate-900"><XCircle size={28} /></button>
                     <button onClick={() => setShowMusicPanel(!showMusicPanel)} className="bg-green-600/90 hover:bg-green-500 text-white p-3 rounded-xl shadow-lg border-2 border-slate-900"><Music size={28} /></button>
                 </div>
            </div>

            {/* Music Control Overlay */}
            {showMusicPanel && (
                <div className="absolute top-28 right-4 z-50 bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl w-48 animate-in slide-in-from-right">
                    <div className="flex items-center gap-2 mb-3 text-green-400 font-bold text-xs uppercase tracking-widest"><Radio size={14}/> Müzik Modu</div>
                    <button onClick={openSpotify} className="w-full bg-green-500 hover:bg-green-400 text-slate-900 font-bold py-3 rounded-xl mb-2 flex items-center justify-center gap-2 transition-colors">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg" className="w-5 h-5" alt="Spotify" />
                        Spotify Aç
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                        {/* Fake Controls since we can't really control native spotify from web easily without auth */}
                        <button className="bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg flex justify-center"><Play size={20} fill="currentColor" /></button>
                        <button className="bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg flex justify-center"><SkipForward size={20} fill="currentColor" /></button>
                    </div>
                </div>
            )}

            {/* Visor Dashboard (High Contrast) */}
            <div className="absolute bottom-6 left-4 right-4 z-50 pointer-events-none">
                <div className="bg-black/80 backdrop-blur-xl border-t-2 border-blue-500 rounded-3xl p-6 shadow-2xl grid grid-cols-3 items-center">
                    {/* Speed */}
                    <div className="col-span-1 border-r border-white/10 flex flex-col items-center">
                        <span className="text-[80px] leading-none font-black text-white tracking-tighter tabular-nums">{currentSpeed}</span>
                        <span className="text-blue-500 font-bold text-xs uppercase tracking-[0.2em]">KM/H</span>
                    </div>

                    {/* Stats */}
                    <div className="col-span-2 flex justify-around pl-4">
                        <div className="text-center">
                             <div className="text-xs text-slate-500 font-bold uppercase mb-1">Varış</div>
                             <div className="text-3xl font-bold text-emerald-400">{new Date(new Date().getTime() + currentRoute.duration * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                        <div className="text-center">
                             <div className="text-xs text-slate-500 font-bold uppercase mb-1">Hissedilen</div>
                             <div className="text-3xl font-bold text-orange-400 flex items-center justify-center gap-1"><Thermometer size={20} />{windChill}°</div>
                        </div>
                    </div>
                </div>
            </div>
        </>
      )}

      {/* --- PLANNING MODE --- */}
      {!isNavigating && (
        <>
            <div className="absolute top-6 left-4 right-4 z-40 pointer-events-none space-y-3">
                {/* Search Bar */}
                <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-2xl pointer-events-auto flex flex-col gap-2">
                    <div className="relative group">
                        <div className="absolute left-4 top-3.5 text-blue-400"><MapPin size={18} /></div>
                        <input type="text" placeholder="Nereden?" className="w-full bg-white/5 text-white p-3 pl-11 rounded-2xl border-none outline-none focus:ring-1 focus:ring-blue-500"
                        value={startQuery} onChange={(e) => setStartQuery(e.target.value)} onFocus={() => setActiveSearchField('start')} />
                    </div>
                    <div className="relative group">
                        <div className="absolute left-4 top-3.5 text-red-400"><Search size={18} /></div>
                        <input type="text" placeholder="Nereye?" className="w-full bg-white/5 text-white p-3 pl-11 rounded-2xl border-none outline-none focus:ring-1 focus:ring-red-500"
                        value={endQuery} onChange={(e) => setEndQuery(e.target.value)} onFocus={() => setActiveSearchField('end')} />
                    </div>
                    {/* Search Results */}
                    {activeSearchField && searchResults.length > 0 && (
                        <div className="bg-slate-800 rounded-xl mt-1 overflow-hidden max-h-[30vh] overflow-y-auto border border-white/10">
                            {searchResults.map((res, idx) => (
                                <div key={idx} className="p-3 hover:bg-white/10 cursor-pointer text-sm flex flex-col border-b border-white/5" onClick={() => handleSelectLocation(res)}>
                                    <span className="font-bold text-white">{res.name}</span>
                                    {res.admin1 && <span className="text-slate-400 text-xs">{res.admin1}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Calculate Button */}
                <div className="pointer-events-auto">
                    <button onClick={calculateRoutes} disabled={!startLoc || !endLoc || loading}
                    className={`w-full py-4 rounded-2xl font-bold shadow-xl transition-all border border-white/10 backdrop-blur-md text-lg ${loading ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                    {loading ? 'Rotalar Hesaplanıyor...' : 'Rotaları Bul'}
                    </button>
                </div>
            </div>

            {/* --- ROUTE SELECTION & ANALYSIS SHEET --- */}
            {routes.length > 0 && analysis && (
                <div className="absolute bottom-4 left-4 right-4 z-40 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-3xl p-1 shadow-2xl flex flex-col max-h-[60vh]">
                    
                    {/* Route Switcher (Tabs) */}
                    <div className="flex p-2 gap-2 overflow-x-auto no-scrollbar">
                        {routes.map((r, idx) => (
                            <button key={idx} onClick={() => handleRouteSelect(idx)} 
                                className={`flex-1 min-w-[120px] py-3 px-4 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 ${selectedRouteIndex === idx ? 'bg-white/10 border-white/20 shadow-inner' : 'border-transparent opacity-50'}`}>
                                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: r.color }}>{r.name}</div>
                                <div className="text-lg font-bold text-white">{(r.distance / 1000).toFixed(0)} km</div>
                                <div className="text-xs text-slate-400">{Math.floor(r.duration / 60)} dk</div>
                            </button>
                        ))}
                    </div>

                    <div className="h-px bg-white/10 w-full my-1" />

                    {/* Gemini Content Area */}
                    <div className="p-4 overflow-y-auto">
                        <div className="flex justify-between items-start mb-3">
                             <h2 className="text-white font-bold text-lg w-3/4">{analysis.summary.split('.')[0]}.</h2>
                             <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${analysis.riskLevel === 'Düşük' ? 'border-emerald-500 text-emerald-500' : 'border-red-500 text-red-500'}`}>
                                {analysis.riskLevel} Risk
                             </div>
                        </div>

                        {/* Mini Tabs for Content */}
                        <div className="flex bg-slate-800/50 p-1 rounded-xl mb-3">
                            <button onClick={() => setActiveTab('general')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'general' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>Özet</button>
                            <button onClick={() => setActiveTab('segments')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'segments' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>Yol</button>
                            <button onClick={() => setActiveTab('stops')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'stops' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>Mola</button>
                        </div>

                        <div className="min-h-[100px]">
                            {activeTab === 'general' && (
                                <div className="grid grid-cols-2 gap-2 animate-in fade-in">
                                    <div className="bg-white/5 p-2 rounded-xl">
                                        <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1"><Thermometer size={10}/> Hissedilen</div>
                                        <div className="text-lg font-bold text-white">{windChill}°C</div>
                                    </div>
                                    <div className="bg-white/5 p-2 rounded-xl">
                                        <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1"><Music size={10}/> Vibe</div>
                                        <div className="text-xs font-bold text-purple-300 truncate">{analysis.playlistVibe}</div>
                                    </div>
                                    <div className="col-span-2 text-xs text-slate-300 leading-relaxed italic border-l-2 border-slate-600 pl-2">
                                        "{analysis.gearAdvice}"
                                    </div>
                                </div>
                            )}
                             {activeTab === 'segments' && (
                                <div className="space-y-2 animate-in fade-in">
                                    {analysis.segments.map((seg, i) => (
                                        <div key={i} className="bg-white/5 p-2 rounded-lg border-l-2 border-blue-500">
                                            <div className="flex justify-between"><span className="text-xs font-bold text-white">{seg.name}</span> <span className="text-[10px] text-slate-400">{seg.risk}</span></div>
                                            <p className="text-[10px] text-slate-400">{seg.description}</p>
                                        </div>
                                    ))}
                                </div>
                             )}
                             {activeTab === 'stops' && (
                                <div className="space-y-2 animate-in fade-in">
                                    {analysis.pitStops.map((stop, i) => (
                                        <div key={i} className="bg-white/5 p-2 rounded-lg flex gap-2">
                                            <Coffee size={14} className="text-orange-400 mt-1"/>
                                            <div>
                                                <div className="text-xs font-bold text-white">{stop.type}</div>
                                                <p className="text-[10px] text-slate-400">{stop.locationDescription}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                             )}
                        </div>
                    </div>

                    {/* Start Button */}
                    <div className="p-3 pt-0">
                        <button onClick={startNavigation} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-black text-lg shadow-lg flex items-center justify-center gap-2">
                            <Navigation size={20} fill="currentColor" /> SÜRÜŞÜ BAŞLAT
                        </button>
                    </div>
                </div>
            )}
        </>
      )}
    </div>
  );
};

export default App;
