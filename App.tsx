import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, CloudRain, Wind, XCircle, Settings, Mountain, Menu, X, Thermometer, LocateFixed, Music, Coffee, Play, SkipForward, Radio, Timer, ChevronDown, ChevronsUp, Store, Fuel, Utensils, ArrowUpRight } from 'lucide-react';
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

// Modern iOS Style Elevation Chart
const ElevationChart: React.FC<{ stats: ElevationStats }> = ({ stats }) => {
    const height = 50;
    const points = stats.points;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    
    const pathD = points.map((p, i) => {
        const x = (i / (points.length - 1)) * 100;
        const y = height - ((p - min) / range) * height;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return (
        <div className="w-full mt-3">
            <div className="flex justify-between text-[10px] text-white/50 font-medium mb-2 px-1 tracking-wider uppercase">
                <span>{Math.round(min)}m</span>
                <span className="text-blue-400">+{Math.round(stats.gain)}m</span>
                <span>{Math.round(max)}m</span>
            </div>
            <div className="relative h-12 w-full">
                <svg className="w-full h-full drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]" preserveAspectRatio="none" viewBox={`0 0 100 ${height}`}>
                    <defs>
                        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style={{stopColor:'rgb(59, 130, 246)', stopOpacity:0.4}} />
                            <stop offset="100%" style={{stopColor:'rgb(59, 130, 246)', stopOpacity:0}} />
                        </linearGradient>
                    </defs>
                    <path d={`${pathD} L 100 ${height} L 0 ${height} Z`} fill="url(#grad)" stroke="none" />
                    <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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
  
  // Rain Alert
  const [rainAlert, setRainAlert] = useState<{minutes: number, prob: number} | null>(null);
  const [activeSearchField, setActiveSearchField] = useState<'start' | 'end' | null>(null);
  
  // Navigation
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [heading, setHeading] = useState(0); // This will now mix Compass & GPS
  const [showMusicPanel, setShowMusicPanel] = useState(false);

  // Analysis Tabs & Sheet
  const [activeTab, setActiveTab] = useState<'general' | 'segments' | 'stops'>('general');
  const [sheetMode, setSheetMode] = useState<'mini' | 'mid' | 'full'>('mid');

  // --- Refs ---
  const mapRef = useRef<any>(null); 
  const routeLayersRef = useRef<any[]>([]); 
  const markersRef = useRef<any[]>([]); 
  const userMarkerRef = useRef<any>(null); 
  const wakeLockRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const touchStartRef = useRef<number>(0);
  
  // Compass Logic
  const compassHeadingRef = useRef<number>(0);

  // --- Initialization ---
  useEffect(() => {
    if (!mapRef.current && window.L) {
      mapRef.current = window.L.map('map-container', {
        zoomControl: false,
        attributionControl: false,
        zoomSnap: 0.25, // Very smooth zoom
        zoomAnimation: true
      }).setView([39.9334, 32.8597], 6);

      // Dark Matter Map Style (More minimal)
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        maxZoom: 20
      }).addTo(mapRef.current);
    }

    // 1. Compass / Device Orientation Listener
    const handleOrientation = (event: DeviceOrientationEvent) => {
        // webkitCompassHeading for iOS, alpha for Android (needs math)
        let compass = 0;
        if ((event as any).webkitCompassHeading) {
             compass = (event as any).webkitCompassHeading;
        } else if (event.alpha !== null) {
             compass = 360 - event.alpha;
        }
        compassHeadingRef.current = compass;
        
        // If we are not moving fast, use compass for heading
        if (currentSpeed < 5 && userMarkerRef.current) {
             updateMarkerRotation(compass);
        }
    };

    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', handleOrientation);
    }

    // 2. Initial Location (High Accuracy)
    const initLocation = async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            updateUserMarker(latitude, longitude, 0);
            setStartLoc({ name: "Konumum", lat: latitude, lng: longitude });
            setStartQuery("Konumum");
            if(mapRef.current) mapRef.current.setView([latitude, longitude], 15);
          },
          async () => {
            const ipLoc = await getIpLocation();
            if (ipLoc) {
              updateUserMarker(ipLoc.lat, ipLoc.lng, 0);
              setStartLoc(ipLoc);
              setStartQuery(ipLoc.name);
            }
          },
          { enableHighAccuracy: true } // Important
        );
      }
    };
    initLocation();

    return () => {
        if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        window.removeEventListener('deviceorientation', handleOrientation);
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }
    };
  }, []);

  // --- Marker & Map Updates ---
  const updateMarkerRotation = (deg: number) => {
      // Find the arrow inside the marker and rotate it using CSS
      const arrowEl = document.querySelector('.nav-arrow-container') as HTMLElement;
      if (arrowEl) {
          arrowEl.style.transform = `rotate(${deg}deg)`;
      }
      setHeading(deg);
  };

  const updateUserMarker = (lat: number, lng: number, gpsHeading: number, isNav: boolean = false) => {
    if (!mapRef.current) return;
    
    // If speed > 5kmh, use GPS heading, else use Compass
    const effectiveHeading = (currentSpeed > 5 && gpsHeading) ? gpsHeading : compassHeadingRef.current;
    
    if (userMarkerRef.current) {
        // Smooth slide to new position
        const newLatLng = new window.L.LatLng(lat, lng);
        userMarkerRef.current.setLatLng(newLatLng);
        updateMarkerRotation(effectiveHeading);
    } else {
        // Create Marker
        const svg = isNav ? 
            `<div class="nav-arrow-container" style="transform: rotate(${effectiveHeading}deg); display:flex; align-items:center; justify-content:center;">
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="28" cy="28" r="28" fill="#3B82F6" fill-opacity="0.2"/>
                    <path d="M28 6L10 48L28 40L46 48L28 6Z" fill="#3B82F6" stroke="white" stroke-width="3" stroke-linejoin="round"/>
                </svg>
            </div>` : 
            '';
            
        const icon = isNav ? 
            window.L.divIcon({ className: 'nav-marker-wrapper', html: svg, iconSize: [56, 56], iconAnchor: [28, 28] }) : 
            window.L.divIcon({ className: 'user-marker', iconSize: [18, 18], iconAnchor: [9, 9] });

        userMarkerRef.current = window.L.marker([lat, lng], { icon }).addTo(mapRef.current);
        if(isNav) userMarkerRef.current.setZIndexOffset(1000);
    }
  };

  // --- Core Calculation Logic ---
  const drawRoutes = (routeList: RouteAlternative[], selectedIndex: number) => {
      if (!mapRef.current) return;
      routeLayersRef.current.forEach(layer => mapRef.current.removeLayer(layer));
      routeLayersRef.current = [];

      routeList.forEach((route, index) => {
          const isSelected = index === selectedIndex;
          const latLngs = route.coordinates.map(c => [c[1], c[0]]);
          
          // Outer glow for selected route
          if (isSelected) {
            const glow = window.L.polyline(latLngs, { color: route.color, weight: 12, opacity: 0.3, className: 'blur-md' }).addTo(mapRef.current);
            routeLayersRef.current.push(glow);
          }

          const line = window.L.polyline(latLngs, { 
              color: isSelected ? route.color : '#334155', 
              weight: isSelected ? 5 : 4, 
              opacity: isSelected ? 1 : 0.6,
              lineCap: 'round',
              lineJoin: 'round'
          }).addTo(mapRef.current);
          
          line.on('click', () => handleRouteSelect(index));
          routeLayersRef.current.push(line);

          if (isSelected) {
              mapRef.current.fitBounds(line.getBounds(), { padding: [60, 60] });
          }
      });
  };

  const calculateRoutes = async () => {
    if (!startLoc || !endLoc) return;
    setLoading(true);
    setRoutes([]); setAnalysis(null); setRainAlert(null); setSheetMode('mid');
    markersRef.current.forEach(m => mapRef.current.removeLayer(m));
    markersRef.current = [];

    const alternatives = await getRouteAlternatives(startLoc, endLoc);
    
    if (alternatives.length === 0) { setLoading(false); alert("Rota bulunamadı."); return; }

    setRoutes(alternatives);
    setSelectedRouteIndex(0);
    drawRoutes(alternatives, 0);
    await analyzeSelectedRoute(alternatives[0]);
    setLoading(false);
  };

  const handleRouteSelect = async (index: number) => {
      setSelectedRouteIndex(index);
      drawRoutes(routes, index);
      await analyzeSelectedRoute(routes[index]);
  };

  const analyzeSelectedRoute = async (route: RouteAlternative) => {
    const pointsToSample = 5;
    const step = Math.floor(route.coordinates.length / (pointsToSample + 1));
    const weatherPromises: Promise<WeatherData>[] = [];
    for (let i = 0; i <= pointsToSample; i++) {
      const coord = route.coordinates[i * step];
      if (coord) weatherPromises.push(getWeatherForPoint(coord[1], coord[0]));
    }

    const [weatherDataList, elevationStats] = await Promise.all([
        Promise.all(weatherPromises),
        getElevationProfile(route.coordinates)
    ]);

    setWeatherPoints(weatherDataList);
    checkForRainRisk(weatherDataList);

    markersRef.current.forEach(m => mapRef.current.removeLayer(m));
    markersRef.current = [];
    weatherDataList.slice(1).forEach(w => {
        let colorClass = 'bg-emerald-500';
        if (w.rain > 0.5) colorClass = 'bg-blue-500';
        else if (w.windSpeed > 25) colorClass = 'bg-yellow-500';

        const icon = window.L.divIcon({
            className: '',
            html: `<div class="${colorClass} w-6 h-6 rounded-full flex items-center justify-center text-white shadow-[0_0_15px_rgba(0,0,0,0.5)] border-2 border-white font-bold text-[9px]">${Math.round(w.temp)}°</div>`,
            iconSize: [24, 24], iconAnchor: [12, 12]
        });
        markersRef.current.push(window.L.marker([w.lat, w.lng], { icon }).addTo(mapRef.current));
    });

    const aiResult = await analyzeRouteWithGemini(
        startLoc?.name || "", endLoc?.name || "", weatherDataList, 
        route.type === 'scenic' ? 'scenic' : 'fastest', elevationStats || undefined
    );
    setAnalysis(aiResult);
  };

  const checkForRainRisk = (points: WeatherData[]) => {
      if (points.length === 0) return;
      const startPoint = points[0];
      const currentHour = new Date().getHours();
      const probNow = startPoint.hourlyRainForecast?.[currentHour] || 0;
      
      if (probNow > 40) {
          setRainAlert({ minutes: 0, prob: probNow });
      } else {
          setRainAlert(null);
      }
  };

  // --- Search Logic ---
  useEffect(() => {
    const query = activeSearchField === 'start' ? startQuery : endQuery;
    if (!query || query.length < 3) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const results = await searchLocation(query);
      setSearchResults(results);
    }, 400);
    return () => clearTimeout(timer);
  }, [startQuery, endQuery, activeSearchField]);

  const handleSelectLocation = (loc: LocationData) => {
    if (activeSearchField === 'start') { setStartLoc(loc); setStartQuery(loc.name); } 
    else { setEndLoc(loc); setEndQuery(loc.name); }
    setSearchResults([]); setActiveSearchField(null);
  };

  // --- Navigation & High Accuracy Tracking ---
  const startNavigation = async () => {
    setIsNavigating(true);
    if ('wakeLock' in navigator) {
        try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (e) {}
    }
    if (navigator.geolocation) {
        // High frequency tracking
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, speed, heading: gpsHeading } = pos.coords;
                // Convert m/s to km/h
                setCurrentSpeed(speed ? Math.round(speed * 3.6) : 0);
                
                // Update marker with high precision
                updateUserMarker(latitude, longitude, gpsHeading || 0, true);
                
                // Keep map centered and zoomed
                if (mapRef.current) {
                    mapRef.current.flyTo([latitude, longitude], 18, { 
                        animate: true, 
                        duration: 1 // faster follow
                    });
                }
            },
            (err) => console.error(err),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    }
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    if (wakeLockRef.current) wakeLockRef.current.release();
    if (startLoc && mapRef.current) {
        updateUserMarker(startLoc.lat, startLoc.lng, 0, false);
        const latLngs = routes[selectedRouteIndex].coordinates.map(c => [c[1], c[0]]);
        mapRef.current.fitBounds(window.L.polyline(latLngs).getBounds(), { padding: [50, 50] });
    }
  };

  const handleRecenter = () => {
      if (!mapRef.current) return;
      navigator.geolocation.getCurrentPosition((pos) => {
          mapRef.current.flyTo([pos.coords.latitude, pos.coords.longitude], 16);
      });
  };

  // Helper values
  const currentAvgWeather = weatherPoints.length > 0 ? weatherPoints[0] : null; 
  const windChill = currentAvgWeather ? calculateWindChill(currentAvgWeather.temp, currentAvgWeather.windSpeed) : 0;
  const currentRoute = routes[selectedRouteIndex];
  
  const sheetHeightClass = 
    sheetMode === 'mini' ? 'h-[200px]' : 
    sheetMode === 'mid' ? 'h-[45dvh]' : 
    'h-[90dvh]';

  const renderPoiIcon = (type?: string) => {
      if (!type) return <MapPin size={16} />;
      if (type.includes('fuel')) return <Fuel size={16} className="text-yellow-400"/>;
      if (type.includes('restaurant') || type.includes('cafe')) return <Utensils size={16} className="text-orange-400"/>;
      return <MapPin size={16} />;
  };

  return (
    <div className="relative w-full h-[100dvh] flex flex-col bg-black font-sans overflow-hidden">
      
      {/* Map Layer */}
      <div id="map-container" className="absolute inset-0 z-0 h-full w-full" />

      {/* --- RAIN ALERT (Dynamic Island Style) --- */}
      {rainAlert && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-10 duration-700">
              <div className="bg-black/60 backdrop-blur-2xl px-6 py-3 rounded-full flex items-center gap-3 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                  <div className="bg-blue-500/20 p-2 rounded-full animate-pulse">
                      <CloudRain size={18} className="text-blue-400" />
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-blue-300 tracking-wider uppercase">Yağmur Alarmı</span>
                      <span className="text-sm font-semibold text-white">{rainAlert.minutes === 0 ? "Şuan Yağıyor" : `${rainAlert.minutes}dk içinde`}</span>
                  </div>
              </div>
          </div>
      )}

      {/* --- NAVIGATION MODE UI (Minimal & Floating) --- */}
      {isNavigating && currentRoute && (
        <>
            {/* Top Navigation Pill */}
            <div className="absolute top-6 left-4 right-4 z-50 flex justify-between pointer-events-none">
                 <div className="bg-black/60 backdrop-blur-2xl border border-white/10 p-4 rounded-[28px] shadow-2xl flex items-center gap-4 flex-1 mr-2 pointer-events-auto">
                    <div className="bg-green-500 w-12 h-12 rounded-full flex items-center justify-center text-black shadow-lg shadow-green-900/50">
                        <ArrowUpRight size={28} strokeWidth={3} />
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-white tracking-tight">{Math.round(currentRoute.distance / 1000)} <span className="text-sm text-white/50 font-medium">km</span></div>
                        <div className="text-xs text-white/50 font-medium truncate max-w-[140px]">Sonraki dönüş düz devam</div>
                    </div>
                 </div>
                 
                 <div className="flex flex-col gap-2 pointer-events-auto">
                     <button onClick={stopNavigation} className="bg-red-500/80 hover:bg-red-500 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-all active:scale-95">
                        <X size={20} />
                     </button>
                 </div>
            </div>

            {/* Bottom Info Pill (Replaces Visor) */}
            <div className="absolute bottom-10 left-6 right-6 z-50 pointer-events-none flex justify-center">
                <div className="bg-black/70 backdrop-blur-2xl border border-white/10 rounded-[32px] p-1.5 px-2 shadow-2xl flex items-center gap-1 pointer-events-auto">
                    
                    {/* Speed */}
                    <div className="bg-white/10 rounded-[24px] px-6 py-3 flex flex-col items-center min-w-[90px]">
                        <span className="text-3xl font-black text-white leading-none">{currentSpeed}</span>
                        <span className="text-[9px] font-bold text-white/50 tracking-widest mt-1">KM/H</span>
                    </div>

                    {/* Stats Group */}
                    <div className="flex gap-4 px-6">
                        <div className="flex flex-col items-center">
                             <div className="text-[10px] text-white/40 font-bold uppercase mb-0.5">Varış</div>
                             <div className="text-lg font-bold text-green-400">{new Date(new Date().getTime() + currentRoute.duration * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                        <div className="w-px bg-white/10 h-8 self-center"/>
                        <div className="flex flex-col items-center">
                             <div className="text-[10px] text-white/40 font-bold uppercase mb-0.5">Isı</div>
                             <div className="text-lg font-bold text-orange-400">{windChill}°</div>
                        </div>
                    </div>
                </div>
            </div>
        </>
      )}

      {/* --- PLANNING MODE --- */}
      {!isNavigating && (
        <>
            {/* Minimal Search Header */}
            <div className="absolute top-0 left-0 right-0 z-40 p-4 pt-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                <div className="flex flex-col gap-2 pointer-events-auto">
                    {/* Start Input */}
                    <div className="group relative transition-all active:scale-[0.99]">
                        <div className="absolute left-4 top-3.5 text-blue-500"><MapPin size={16} /></div>
                        <input type="text" placeholder="Nereden?" 
                        className="w-full bg-black/60 backdrop-blur-xl text-white p-3 pl-11 rounded-2xl border border-white/10 focus:border-blue-500/50 outline-none text-sm font-medium placeholder:text-white/30 shadow-lg transition-all"
                        value={startQuery} onChange={(e) => setStartQuery(e.target.value)} onFocus={() => setActiveSearchField('start')} />
                    </div>
                    {/* End Input */}
                    <div className="group relative transition-all active:scale-[0.99]">
                        <div className="absolute left-4 top-3.5 text-orange-500"><Search size={16} /></div>
                        <input type="text" placeholder="Nereye gidiyoruz?" 
                        className="w-full bg-black/60 backdrop-blur-xl text-white p-3 pl-11 rounded-2xl border border-white/10 focus:border-orange-500/50 outline-none text-sm font-medium placeholder:text-white/30 shadow-lg transition-all"
                        value={endQuery} onChange={(e) => setEndQuery(e.target.value)} onFocus={() => setActiveSearchField('end')} />
                    </div>

                    {/* Results Dropdown */}
                    {activeSearchField && searchResults.length > 0 && (
                        <div className="bg-black/80 backdrop-blur-2xl rounded-2xl mt-1 overflow-hidden border border-white/10 shadow-2xl">
                            {searchResults.map((res, idx) => (
                                <div key={idx} className="p-3.5 hover:bg-white/10 cursor-pointer flex items-center gap-3 border-b border-white/5 last:border-0 active:bg-white/20" onClick={() => handleSelectLocation(res)}>
                                    <div className="bg-white/10 p-2 rounded-full text-white/70">
                                        {renderPoiIcon(res.type)}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-white text-sm">{res.name}</span>
                                        {res.admin1 && <span className="text-white/40 text-[10px]">{res.admin1}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Inline Calculate Button */}
                {(!analysis || routes.length === 0) && (
                    <div className="pointer-events-auto mt-2 flex justify-end">
                        <button onClick={calculateRoutes} disabled={!startLoc || !endLoc || loading}
                        className={`px-6 py-2.5 rounded-full font-bold shadow-lg transition-all border border-white/10 backdrop-blur-md text-sm flex items-center gap-2 ${loading ? 'bg-white/10 text-white/50' : 'bg-white text-black hover:bg-gray-200'}`}>
                        {loading ? 'Hesaplanıyor...' : 'Rotaları Göster'}
                        </button>
                    </div>
                )}
            </div>

            {/* Locate Me FAB */}
            <button 
               onClick={handleRecenter}
               className={`absolute right-4 z-40 bg-black/60 backdrop-blur-xl border border-white/10 w-11 h-11 rounded-full flex items-center justify-center shadow-2xl text-white active:scale-90 transition-all duration-300 ${sheetMode === 'full' ? 'bottom-[92dvh] opacity-0' : sheetMode === 'mid' ? 'bottom-[47dvh]' : 'bottom-[210px]'}`}
            >
               <LocateFixed size={20} />
            </button>

            {/* --- IOS STYLE BOTTOM SHEET --- */}
            {routes.length > 0 && analysis && (
                <div 
                    className={`absolute bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-2xl border-t border-white/10 rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.8)] flex flex-col transition-[height] duration-500 cubic-bezier(0.32, 0.72, 0, 1) ${sheetHeightClass}`}
                >
                    {/* Handle */}
                    <div 
                        className="flex-none pt-4 pb-2 w-full flex flex-col items-center justify-center cursor-grab active:cursor-grabbing"
                        onTouchStart={(e) => touchStartRef.current = e.touches[0].clientY}
                        onTouchEnd={(e) => {
                             const diff = touchStartRef.current - e.changedTouches[0].clientY;
                             if (diff > 50) setSheetMode(p => p === 'mini' ? 'mid' : 'full');
                             else if (diff < -50) setSheetMode(p => p === 'full' ? 'mid' : 'mini');
                        }}
                        onClick={() => setSheetMode(p => p === 'mid' ? 'full' : p === 'full' ? 'mini' : 'mid')}
                    >
                        <div className="w-12 h-1 bg-white/20 rounded-full" />
                    </div>

                    {/* Route Cards (Horizontal) */}
                    <div className="flex-none flex px-4 pb-4 gap-3 overflow-x-auto no-scrollbar snap-x pt-2">
                        {routes.map((r, idx) => (
                            <button key={idx} onClick={(e) => { e.stopPropagation(); handleRouteSelect(idx); }} 
                                className={`flex-none snap-center min-w-[120px] h-[72px] rounded-2xl border transition-all duration-300 flex flex-col items-center justify-center relative overflow-hidden active:scale-95 ${selectedRouteIndex === idx ? 'bg-white/10 border-blue-500/50' : 'bg-transparent border-white/5 opacity-60'}`}>
                                <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: r.color }}>{r.name}</div>
                                <div className="text-lg font-bold text-white leading-none">{(r.distance / 1000).toFixed(0)}<span className="text-[10px] font-medium text-white/50 ml-0.5">km</span></div>
                                <div className="text-[10px] text-white/40 mt-1">{Math.floor(r.duration / 60)} dk</div>
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className={`flex-1 overflow-y-auto px-5 pt-2 transition-opacity duration-300 ${sheetMode === 'mini' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-white font-bold text-xl w-3/4 leading-snug">{analysis.summary.split('.')[0]}.</h2>
                            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${analysis.riskLevel === 'Düşük' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`}>
                                {analysis.riskLevel} Risk
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex bg-white/5 p-1 rounded-xl mb-4">
                            {(['general', 'segments', 'stops'] as const).map((tab) => (
                                <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all duration-300 uppercase tracking-wide ${activeTab === tab ? 'bg-white/10 text-white shadow-sm' : 'text-white/40'}`}>
                                    {tab === 'general' ? 'Özet' : tab === 'segments' ? 'Yol' : 'Mola'}
                                </button>
                            ))}
                        </div>

                        <div className="pb-24 space-y-3">
                            {activeTab === 'general' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                        <div className="flex items-center gap-2 text-xs text-white/60 mb-2 uppercase font-bold"><Mountain size={14}/> Yükselti & Zemin</div>
                                        {analysis.elevationStats && <ElevationChart stats={analysis.elevationStats} />}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 mt-3">
                                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                                            <div className="text-[10px] text-white/50 mb-1">Hissedilen</div>
                                            <div className="text-xl font-bold text-white">{windChill}°C</div>
                                        </div>
                                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                                            <div className="text-[10px] text-white/50 mb-1">Vibe</div>
                                            <div className="text-xs font-medium text-purple-300 truncate">{analysis.playlistVibe}</div>
                                        </div>
                                    </div>
                                    <div className="bg-blue-900/20 border border-blue-500/20 p-4 rounded-2xl mt-3">
                                        <div className="text-[10px] text-blue-400 font-bold uppercase mb-1">Eğitmen Notu</div>
                                        <div className="text-xs text-blue-100/80 leading-relaxed">"{analysis.gearAdvice}"</div>
                                    </div>
                                </div>
                            )}
                            {/* Segments & Stops rendered simply... */}
                             {activeTab === 'segments' && analysis.segments.map((seg, i) => (
                                <div key={i} className="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
                                    <span className="text-sm font-medium text-white">{seg.name}</span>
                                    <span className={`text-[9px] px-2 py-0.5 rounded border ${seg.risk==='Yüksek'?'border-red-500/50 text-red-400':'border-green-500/50 text-green-400'}`}>{seg.risk}</span>
                                </div>
                             ))}
                             {activeTab === 'stops' && analysis.pitStops.map((stop, i) => (
                                <div key={i} className="bg-white/5 p-3 rounded-2xl border border-white/5 flex gap-3">
                                    <div className="bg-orange-500/20 w-8 h-8 rounded-full flex items-center justify-center text-orange-400"><Coffee size={14}/></div>
                                    <div><div className="text-sm font-bold text-white">{stop.type}</div><div className="text-[10px] text-white/50">{stop.locationDescription}</div></div>
                                </div>
                             ))}
                        </div>
                    </div>

                    {/* Floating Start Pill Button (Replaces Big Button) */}
                    <div className="absolute bottom-8 left-0 right-0 px-8 flex justify-center pointer-events-none z-50">
                        <button onClick={startNavigation} className="pointer-events-auto bg-white text-black pl-6 pr-2 py-2 rounded-full font-bold shadow-[0_0_40px_rgba(255,255,255,0.3)] flex items-center gap-4 hover:scale-105 active:scale-95 transition-all group">
                            <span className="text-sm tracking-wide">SÜRÜŞÜ BAŞLAT</span>
                            <div className="bg-black text-white w-10 h-10 rounded-full flex items-center justify-center group-hover:rotate-45 transition-transform">
                                <Navigation size={18} fill="currentColor" />
                            </div>
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