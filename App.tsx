import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, CloudRain, Wind, AlertTriangle, ShieldCheck, XCircle, Volume2, Settings, Mountain, Zap, Wallet, Menu, X, Thermometer, ArrowUp, Umbrella, Eye, Activity, LocateFixed, Compass, Music, Coffee, Map as MapIcon, Sparkles, ChevronRight, Play, SkipForward, Radio, Timer, ChevronUp, ChevronDown, ChevronsUp, Store, Fuel, Utensils } from 'lucide-react';
import { LocationData, RouteAnalysis, WeatherData, RouteAlternative, ElevationStats } from './types';
import { searchLocation, getIpLocation, getRouteAlternatives, getWeatherForPoint, getElevationProfile } from './services/api';
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

// Elevation Chart Component (Sparkline style)
const ElevationChart: React.FC<{ stats: ElevationStats }> = ({ stats }) => {
    const height = 40;
    const width = 100; // percent
    const points = stats.points;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    
    // Generate SVG path
    const pathD = points.map((p, i) => {
        const x = (i / (points.length - 1)) * 100;
        const y = height - ((p - min) / range) * height;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return (
        <div className="w-full mt-2">
            <div className="flex justify-between text-[10px] text-slate-400 font-bold mb-1 px-1">
                <span>{Math.round(min)}m</span>
                <span className="text-blue-300">Tırmanış: +{Math.round(stats.gain)}m</span>
                <span>{Math.round(max)}m</span>
            </div>
            <div className="relative h-10 w-full bg-slate-800/50 rounded-lg overflow-hidden border border-white/5">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 100 ${height}`}>
                    <path d={`${pathD} L 100 ${height} L 0 ${height} Z`} fill="rgba(59, 130, 246, 0.2)" stroke="none" />
                    <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
            </div>
        </div>
    );
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
  
  // Rain Alert State
  const [rainAlert, setRainAlert] = useState<{minutes: number, prob: number} | null>(null);

  const [activeSearchField, setActiveSearchField] = useState<'start' | 'end' | null>(null);
  
  // Navigation & Visor State
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [heading, setHeading] = useState(0);
  const [showMusicPanel, setShowMusicPanel] = useState(false);

  // Analysis Tabs & Sheet State
  const [activeTab, setActiveTab] = useState<'general' | 'segments' | 'stops'>('general');
  const [sheetMode, setSheetMode] = useState<'mini' | 'mid' | 'full'>('mid');

  // --- Refs ---
  const mapRef = useRef<any>(null); 
  const routeLayersRef = useRef<any[]>([]); // Array for multiple route lines
  const markersRef = useRef<any[]>([]); 
  const userMarkerRef = useRef<any>(null); 
  const wakeLockRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const touchStartRef = useRef<number>(0);

  // --- Initialization ---
  useEffect(() => {
    if (!mapRef.current && window.L) {
      mapRef.current = window.L.map('map-container', {
        zoomControl: false,
        attributionControl: false,
        zoomSnap: 0.5 // Smoother zoom
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

    // Cleanup: Destroy map on unmount to prevent "Map container is already initialized"
    return () => {
        if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }
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
      const selectedRoute = routes[index];
      await analyzeSelectedRoute(selectedRoute);
  };

  // --- Core Calculation Logic ---
  const calculateRoutes = async () => {
    if (!startLoc || !endLoc) return;
    setLoading(true);
    setRoutes([]);
    setAnalysis(null);
    setRainAlert(null); // Reset alert
    setSheetMode('mid'); // Reset sheet to medium height
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
    for (let i = 0; i <= pointsToSample; i++) { // Start from 0 to capture Start Point
      const coord = route.coordinates[i * step];
      if (coord) weatherPromises.push(getWeatherForPoint(coord[1], coord[0]));
    }

    // Parallel Fetch: Weather + Elevation
    const [weatherDataList, elevationStats] = await Promise.all([
        Promise.all(weatherPromises),
        getElevationProfile(route.coordinates)
    ]);

    setWeatherPoints(weatherDataList);

    // Check for Rain Risk immediately
    checkForRainRisk(weatherDataList);

    // Add Weather Markers (skip 0 to avoid crowding user marker)
    markersRef.current.forEach(m => mapRef.current.removeLayer(m));
    markersRef.current = [];
    weatherDataList.slice(1).forEach(w => {
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

    // Gemini Analysis (Now includes Elevation)
    const routeType = route.type === 'scenic' ? 'scenic' : 'fastest';
    const aiResult = await analyzeRouteWithGemini(
        startLoc?.name || "", 
        endLoc?.name || "", 
        weatherDataList, 
        routeType,
        elevationStats || undefined
    );
    setAnalysis(aiResult);
  };

  // --- Rain Alert Logic ---
  const checkForRainRisk = (points: WeatherData[]) => {
      if (points.length === 0) return;
      
      const startPoint = points[0];
      const currentHour = new Date().getHours();
      const currentMinute = new Date().getMinutes();
      
      if (!startPoint.hourlyRainForecast) return;

      // Check current hour probability
      const probNow = startPoint.hourlyRainForecast[currentHour] || 0;
      // Check next hour probability
      const probNext = startPoint.hourlyRainForecast[currentHour + 1] || 0;

      // Logic: If prob > 40%, warn user
      if (probNow > 40) {
          // It's likely raining now or very soon
          setRainAlert({ minutes: 0, prob: probNow });
      } else if (probNext > 40) {
          // It will likely rain in the next hour
          const minutesUntilNextHour = 60 - currentMinute;
          setRainAlert({ minutes: minutesUntilNextHour, prob: probNext });
      } else {
          setRainAlert(null);
      }
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

  const handleRecenter = () => {
    if (!mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            updateUserMarker(latitude, longitude, 0);
            mapRef.current.flyTo([latitude, longitude], 15, { animate: true, duration: 1.5 });
        },
        (err) => {
            console.error("Locate error", err);
            // Fallback if permission denied or unavailable
            if (startLoc) {
                 mapRef.current.flyTo([startLoc.lat, startLoc.lng], 15, { animate: true });
            }
        },
        { enableHighAccuracy: true }
    );
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

  // --- Gestures for Bottom Sheet ---
  const handleTouchStart = (e: React.TouchEvent) => {
      touchStartRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      const touchEnd = e.changedTouches[0].clientY;
      const diff = touchStartRef.current - touchEnd;

      // Swipe Up (Expand)
      if (diff > 50) {
          if (sheetMode === 'mini') setSheetMode('mid');
          else if (sheetMode === 'mid') setSheetMode('full');
      }
      // Swipe Down (Collapse)
      else if (diff < -50) {
          if (sheetMode === 'full') setSheetMode('mid');
          else if (sheetMode === 'mid') setSheetMode('mini');
      }
  };

  // Helper values
  const currentAvgWeather = weatherPoints.length > 0 ? weatherPoints[0] : null; 
  const windChill = currentAvgWeather ? calculateWindChill(currentAvgWeather.temp, currentAvgWeather.windSpeed) : 0;
  const currentRoute = routes[selectedRouteIndex];
  
  // Height classes based on state
  const sheetHeightClass = 
    sheetMode === 'mini' ? 'h-[240px]' : 
    sheetMode === 'mid' ? 'h-[50dvh]' : 
    'h-[92dvh]';
    
  // Render POI Icon based on type
  const renderPoiIcon = (type?: string) => {
      if (!type) return <MapPin size={18} />;
      if (type.includes('fuel')) return <Fuel size={18} className="text-yellow-400"/>;
      if (type.includes('restaurant') || type.includes('cafe')) return <Utensils size={18} className="text-orange-400"/>;
      if (type.includes('market') || type.includes('shop')) return <Store size={18} className="text-blue-400"/>;
      return <MapPin size={18} />;
  };

  return (
    // Use [100dvh] for dynamic viewport height to fix mobile browser scroll issues
    <div className="relative w-full h-[100dvh] flex flex-col bg-slate-900 font-sans overflow-hidden">
      
      {/* Map Layer - Absolute & Fixed */}
      <div id="map-container" className="absolute inset-0 z-0 h-full w-full" />

      {/* --- RAIN ALERT COMPONENT --- */}
      {rainAlert && (
          <div className="absolute top-24 left-4 right-4 z-[60] flex justify-center animate-in slide-in-from-top-10 duration-500 pointer-events-none">
              <div className="bg-red-600/90 backdrop-blur-md text-white p-4 rounded-3xl shadow-[0_0_20px_rgba(220,38,38,0.5)] border-2 border-red-400 flex items-center gap-4 max-w-sm pointer-events-auto">
                  <div className="bg-white/20 p-3 rounded-full animate-pulse shrink-0">
                      <CloudRain size={24} strokeWidth={3} />
                  </div>
                  <div>
                      <div className="text-xs font-bold uppercase text-red-100 tracking-wider flex items-center gap-1">
                          <Timer size={12} /> YAĞMUR ALARMI (%{rainAlert.prob})
                      </div>
                      <div className="text-lg font-black leading-tight mt-0.5">
                          {rainAlert.minutes === 0 ? "Bölgede Yağmur Başladı!" : `${rainAlert.minutes} dakika sonra yağmur başlıyor.`}
                      </div>
                      <div className="text-xs text-red-100 mt-1 font-medium">
                          Islanmadan sığınmak için vaktin var.
                      </div>
                  </div>
              </div>
          </div>
      )}

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
                <div className="absolute top-28 right-4 z-50 bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl w-48 animate-in slide-in-from-right pointer-events-auto">
                    <div className="flex items-center gap-2 mb-3 text-green-400 font-bold text-xs uppercase tracking-widest"><Radio size={14}/> Müzik Modu</div>
                    <button onClick={openSpotify} className="w-full bg-green-500 hover:bg-green-400 text-slate-900 font-bold py-3 rounded-xl mb-2 flex items-center justify-center gap-2 transition-colors">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg" className="w-5 h-5" alt="Spotify" />
                        Spotify Aç
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                        <button className="bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg flex justify-center"><Play size={20} fill="currentColor" /></button>
                        <button className="bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg flex justify-center"><SkipForward size={20} fill="currentColor" /></button>
                    </div>
                </div>
            )}

            {/* Visor Dashboard (High Contrast) - Raised slightly to avoid home bar interference */}
            <div className="absolute bottom-10 left-4 right-4 z-50 pointer-events-none">
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
            <div className="absolute top-4 left-4 right-4 z-40 pointer-events-none space-y-3">
                {/* Search Bar - Glassmorphism */}
                <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-2xl pointer-events-auto flex flex-col gap-2">
                    <div className="relative group">
                        <div className="absolute left-4 top-3.5 text-blue-400"><MapPin size={18} /></div>
                        <input type="text" placeholder="Nereden?" className="w-full bg-white/5 text-white p-3 pl-11 rounded-2xl border-none outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-500"
                        value={startQuery} onChange={(e) => setStartQuery(e.target.value)} onFocus={() => setActiveSearchField('start')} />
                    </div>
                    <div className="relative group">
                        <div className="absolute left-4 top-3.5 text-red-400"><Search size={18} /></div>
                        <input type="text" placeholder="Nereye? (Benzinlik, Köfteci, Şehir...)" className="w-full bg-white/5 text-white p-3 pl-11 rounded-2xl border-none outline-none focus:ring-1 focus:ring-red-500 transition-all placeholder:text-slate-500"
                        value={endQuery} onChange={(e) => setEndQuery(e.target.value)} onFocus={() => setActiveSearchField('end')} />
                    </div>
                    {/* Search Results Dropdown */}
                    {activeSearchField && searchResults.length > 0 && (
                        <div className="bg-slate-800 rounded-xl mt-1 overflow-hidden max-h-[35vh] overflow-y-auto border border-white/10 shadow-2xl">
                            {searchResults.map((res, idx) => (
                                <div key={idx} className="p-3 hover:bg-white/10 cursor-pointer text-sm flex items-center gap-3 border-b border-white/5 last:border-0" onClick={() => handleSelectLocation(res)}>
                                    <div className="bg-white/5 p-2 rounded-lg text-slate-300">
                                        {renderPoiIcon(res.type)}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-white">{res.name}</span>
                                        {res.admin1 && <span className="text-slate-400 text-xs">{res.admin1}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Calculate Button - Only shown if not analysing yet to save space */}
                {(!analysis || routes.length === 0) && (
                    <div className="pointer-events-auto animate-in slide-in-from-top-2">
                        <button onClick={calculateRoutes} disabled={!startLoc || !endLoc || loading}
                        className={`w-full py-4 rounded-2xl font-bold shadow-xl transition-all border border-white/10 backdrop-blur-md text-lg flex justify-center items-center gap-2 ${loading ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                        {loading ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Hesaplanıyor...</> : 'Rotaları Bul'}
                        </button>
                    </div>
                )}
            </div>

            {/* Locate Me FAB - Positioned to move with sheet */}
            <button 
               onClick={handleRecenter}
               className={`absolute right-4 z-40 bg-slate-900/80 backdrop-blur-xl border border-white/10 p-3 rounded-2xl shadow-2xl text-blue-500 active:scale-95 transition-all duration-300 hover:bg-slate-800 hover:text-white ${sheetMode === 'full' ? 'bottom-[93dvh] opacity-0' : sheetMode === 'mid' ? 'bottom-[52dvh]' : 'bottom-[250px]'}`}
               aria-label="Konumumu Bul"
            >
               <LocateFixed size={24} />
            </button>

            {/* --- BOTTOM SHEET: ROUTE SELECTION & ANALYSIS --- */}
            {/* Interactive, draggable, 3-state bottom sheet */}
            {routes.length > 0 && analysis && (
                <div 
                    className={`absolute bottom-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-2xl border-t border-white/10 rounded-t-[2rem] shadow-[0_-10px_60px_rgba(0,0,0,0.8)] flex flex-col transition-[height] duration-500 cubic-bezier(0.32, 0.72, 0, 1) ${sheetHeightClass}`}
                >
                    
                    {/* Drag Handle & Header Area */}
                    <div 
                        className="flex-none pt-3 pb-2 w-full flex flex-col items-center justify-center cursor-grab active:cursor-grabbing hover:bg-white/5 transition-colors rounded-t-[2rem]"
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        onClick={() => setSheetMode(prev => prev === 'mid' ? 'full' : prev === 'full' ? 'mini' : 'mid')}
                    >
                        <div className="w-14 h-1.5 bg-white/20 rounded-full mb-1" />
                        {/* Dynamic Chevron based on state */}
                        <div className="text-white/30 transition-transform duration-300">
                             {sheetMode === 'mini' && <ChevronsUp size={16} className="animate-bounce" />}
                             {sheetMode === 'mid' && <div className="h-4" />} 
                             {sheetMode === 'full' && <ChevronDown size={16} />}
                        </div>
                    </div>

                    {/* Route Switcher (Horizontal Scroll) - Always visible */}
                    <div className="flex-none flex p-4 pt-1 gap-3 overflow-x-auto no-scrollbar snap-x z-20">
                        {routes.map((r, idx) => (
                            <button key={idx} onClick={(e) => { e.stopPropagation(); handleRouteSelect(idx); }} 
                                className={`flex-none snap-center min-w-[140px] h-[80px] px-4 rounded-2xl border transition-all duration-300 flex flex-col items-center justify-center gap-1 relative overflow-hidden group active:scale-95 ${selectedRouteIndex === idx ? 'bg-slate-800/80 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'bg-slate-900/50 border-white/5 opacity-60 hover:opacity-100'}`}>
                                
                                {selectedRouteIndex === idx && <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 via-transparent to-transparent z-0"/>}
                                
                                <div className="text-[10px] font-bold uppercase tracking-widest z-10" style={{ color: r.color }}>{r.name}</div>
                                <div className="flex items-baseline gap-1 z-10">
                                    <div className="text-xl font-black text-white">{(r.distance / 1000).toFixed(0)}</div>
                                    <div className="text-xs font-bold text-slate-400">km</div>
                                </div>
                                <div className="text-[10px] text-slate-400 z-10 font-medium bg-black/30 px-2 py-0.5 rounded-full">{Math.floor(r.duration / 60)} dk</div>
                            </button>
                        ))}
                    </div>

                    <div className="flex-none h-px bg-gradient-to-r from-transparent via-white/10 to-transparent w-full mb-1" />

                    {/* Scrollable Content Area - Only visible in Mid/Full mode */}
                    <div className={`flex-1 overflow-y-auto min-h-0 p-5 pt-2 transition-opacity duration-300 ${sheetMode === 'mini' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                        <div className="flex justify-between items-start mb-5">
                             <h2 className="text-white font-bold text-2xl leading-tight w-3/4 tracking-tight drop-shadow-md">{analysis.summary.split('.')[0]}.</h2>
                             <div className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border tracking-wider shadow-lg ${analysis.riskLevel === 'Düşük' ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400 shadow-emerald-900/20' : 'border-red-500/50 bg-red-500/20 text-red-400 shadow-red-900/20'}`}>
                                {analysis.riskLevel} Risk
                             </div>
                        </div>

                        {/* Enhanced Tabs */}
                        <div className="flex bg-black/40 p-1.5 rounded-2xl mb-6 sticky top-0 z-10 backdrop-blur-xl border border-white/10 shadow-lg">
                            {(['general', 'segments', 'stops'] as const).map((tab) => (
                                <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 capitalize ${activeTab === tab ? 'bg-slate-700 text-white shadow-md ring-1 ring-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                                    {tab === 'general' ? 'Özet' : tab === 'segments' ? 'Yol' : 'Mola'}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="space-y-4 pb-20">
                            {activeTab === 'general' && (
                                <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {/* Elevation Chart - New! */}
                                    {analysis.elevationStats && (
                                        <div className="col-span-2 bg-gradient-to-br from-slate-800 to-slate-900 p-4 rounded-2xl border border-white/5 shadow-lg">
                                            <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1"><Mountain size={12} className="text-blue-400"/> Yükselti Profili</div>
                                            <ElevationChart stats={analysis.elevationStats} />
                                        </div>
                                    )}

                                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-4 rounded-2xl border border-white/5 shadow-lg">
                                        <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1 mb-2"><Thermometer size={12} className="text-orange-400"/> Hissedilen</div>
                                        <div className="text-2xl font-black text-white tracking-tight">{windChill}°C</div>
                                    </div>
                                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-4 rounded-2xl border border-white/5 shadow-lg">
                                        <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1 mb-2"><Music size={12} className="text-purple-400"/> Vibe</div>
                                        <div className="text-sm font-bold text-purple-200 truncate leading-relaxed">{analysis.playlistVibe}</div>
                                    </div>
                                    <div className="col-span-2 bg-gradient-to-r from-blue-900/30 to-slate-900 border-l-4 border-blue-500 p-4 rounded-r-2xl">
                                        <div className="text-[10px] text-blue-400 font-bold uppercase mb-1 flex items-center gap-2"><ShieldCheck size={12}/> Eğitmen Notu</div>
                                        <div className="text-sm text-slate-200 italic leading-relaxed font-medium">
                                            "{analysis.gearAdvice}"
                                        </div>
                                    </div>
                                </div>
                            )}
                             {activeTab === 'segments' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {analysis.segments.map((seg, i) => (
                                        <div key={i} className="bg-slate-800/40 p-4 rounded-2xl border border-white/5 relative overflow-hidden group">
                                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors ${seg.risk === 'Yüksek' ? 'bg-red-500' : seg.risk === 'Orta' ? 'bg-yellow-500' : 'bg-emerald-500'}`}/>
                                            <div className="pl-4">
                                                <div className="flex justify-between mb-2 items-center">
                                                    <span className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">{seg.name}</span> 
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${seg.risk === 'Yüksek' ? 'border-red-500/30 text-red-400' : 'border-emerald-500/30 text-emerald-400'}`}>{seg.risk}</span>
                                                </div>
                                                <p className="text-xs text-slate-400 leading-relaxed">{seg.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                             )}
                             {activeTab === 'stops' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {analysis.pitStops.map((stop, i) => (
                                        <div key={i} className="bg-slate-800/40 p-4 rounded-2xl border border-white/5 flex gap-4 items-start">
                                            <div className="w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 text-orange-400 shadow-lg shadow-orange-900/20">
                                                <Coffee size={18} />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-white">{stop.type}</div>
                                                <p className="text-xs text-slate-400 mt-1 font-medium">{stop.locationDescription}</p>
                                                <p className="text-[11px] text-slate-500 mt-1.5 italic border-l-2 border-slate-700 pl-2">"{stop.reason}"</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                             )}
                        </div>
                    </div>

                    {/* Fixed Footer Button - Always visible, adapts padding based on safe area */}
                    <div className="flex-none p-4 pt-3 pb-8 bg-slate-900/90 border-t border-white/5 backdrop-blur-xl z-30">
                        <button onClick={startNavigation} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-4 rounded-2xl font-black text-lg shadow-[0_4px_20px_rgba(37,99,235,0.4)] flex items-center justify-center gap-3 transform active:scale-[0.98] transition-all border border-white/10 group">
                            <Navigation size={22} className="group-hover:rotate-45 transition-transform duration-300" fill="currentColor" /> SÜRÜŞÜ BAŞLAT
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