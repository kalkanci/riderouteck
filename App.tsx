import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, CloudRain, X, Mountain, LocateFixed, Coffee, ArrowUpRight, RefreshCw, ThermometerSun, Wind, AlertTriangle, Fuel, Camera, Utensils } from 'lucide-react';
import { LocationData, RouteAnalysis, WeatherData, RouteAlternative, ElevationStats, PoiData } from './types';
import { searchLocation, getIpLocation, getRouteAlternatives, getWeatherForPoint, getElevationProfile, findPoisAlongRoute } from './services/api';
import { analyzeRouteStatic } from './services/geminiService'; // Renamed import, same file structure

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
    const height = 60;
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
        <div className="w-full mt-4 bg-white/5 rounded-xl p-3 border border-white/5">
            <div className="flex justify-between text-[10px] text-white/40 font-bold mb-2 px-1 tracking-widest uppercase">
                <span>{Math.round(min)}m</span>
                <span className="text-blue-400">+{Math.round(stats.gain)}m TIRMANIŞ</span>
                <span>{Math.round(max)}m</span>
            </div>
            <div className="relative h-12 w-full">
                <svg className="w-full h-full drop-shadow-[0_4px_10px_rgba(59,130,246,0.2)]" preserveAspectRatio="none" viewBox={`0 0 100 ${height}`}>
                    <defs>
                        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style={{stopColor:'rgb(59, 130, 246)', stopOpacity:0.5}} />
                            <stop offset="100%" style={{stopColor:'rgb(59, 130, 246)', stopOpacity:0}} />
                        </linearGradient>
                    </defs>
                    <path d={`${pathD} L 100 ${height} L 0 ${height} Z`} fill="url(#grad)" stroke="none" />
                    <path d={pathD} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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
  const [pois, setPois] = useState<PoiData[]>([]);
  const [poiLoading, setPoiLoading] = useState<string | null>(null);

  // Rain Alert
  const [rainAlert, setRainAlert] = useState<{minutes: number, prob: number} | null>(null);
  const [activeSearchField, setActiveSearchField] = useState<'start' | 'end' | null>(null);
  
  // Navigation
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [heading, setHeading] = useState(0); // This will now mix Compass & GPS

  // Analysis Tabs & Sheet
  const [activeTab, setActiveTab] = useState<'general' | 'segments' | 'stops'>('general');
  const [sheetMode, setSheetMode] = useState<'mini' | 'mid' | 'full'>('mid');
  
  // Pull to Refresh State
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Refs ---
  const mapRef = useRef<any>(null); 
  const routeLayersRef = useRef<any[]>([]); 
  const markersRef = useRef<any[]>([]); 
  const poiMarkersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null); 
  const wakeLockRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const touchStartRef = useRef<number>(0);
  const compassHeadingRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Initialization ---
  useEffect(() => {
    if (!mapRef.current && window.L) {
      mapRef.current = window.L.map('map-container', {
        zoomControl: false,
        attributionControl: false,
        zoomSnap: 0.1, // Ultra smooth zoom
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true
      }).setView([39.9334, 32.8597], 6);

      // CartoDB Dark Matter - High Contrast
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        maxZoom: 20,
        subdomains: 'abcd'
      }).addTo(mapRef.current);
    }

    // Compass
    const handleOrientation = (event: DeviceOrientationEvent) => {
        let compass = 0;
        if ((event as any).webkitCompassHeading) {
             compass = (event as any).webkitCompassHeading;
        } else if (event.alpha !== null) {
             compass = 360 - event.alpha;
        }
        compassHeadingRef.current = compass;
        if (currentSpeed < 5 && userMarkerRef.current) updateMarkerRotation(compass);
    };

    if (window.DeviceOrientationEvent) window.addEventListener('deviceorientation', handleOrientation);

    initLocation();

    return () => {
        if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        window.removeEventListener('deviceorientation', handleOrientation);
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  const initLocation = async () => {
      setIsRefreshing(true);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            updateUserMarker(latitude, longitude, 0);
            if (!startLoc) { // Only set start if empty
                setStartLoc({ name: "Konumum", lat: latitude, lng: longitude });
                setStartQuery("Konumum");
                if(mapRef.current) mapRef.current.flyTo([latitude, longitude], 15, { animate: true, duration: 2 });
            }
            setIsRefreshing(false);
          },
          async () => {
            const ipLoc = await getIpLocation();
            if (ipLoc) {
              updateUserMarker(ipLoc.lat, ipLoc.lng, 0);
              setStartLoc(ipLoc);
              setStartQuery(ipLoc.name);
            }
            setIsRefreshing(false);
          },
          { enableHighAccuracy: true }
        );
      } else {
          setIsRefreshing(false);
      }
  };

  // --- Pull to Refresh Logic ---
  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
        touchStartRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStartRef.current;
    if (diff > 0 && window.scrollY === 0 && !isNavigating) {
        setPullY(Math.min(diff * 0.4, 120)); // Resistance
    }
  };

  const handleTouchEnd = () => {
      if (pullY > 80) {
          initLocation(); // Trigger refresh
      }
      setPullY(0);
  };

  // --- Marker & Map Updates ---
  const updateMarkerRotation = (deg: number) => {
      const arrowEl = document.querySelector('.nav-arrow-container') as HTMLElement;
      if (arrowEl) arrowEl.style.transform = `rotate(${deg}deg)`;
      setHeading(deg);
  };

  const updateUserMarker = (lat: number, lng: number, gpsHeading: number, isNav: boolean = false) => {
    if (!mapRef.current) return;
    
    const effectiveHeading = (currentSpeed > 5 && gpsHeading) ? gpsHeading : compassHeadingRef.current;
    
    if (userMarkerRef.current) {
        // Use Leaflet's built-in setLatLng which handles smooth transition via CSS if markerZoomAnimation is on
        userMarkerRef.current.setLatLng([lat, lng]);
        updateMarkerRotation(effectiveHeading);
    } else {
        const svg = isNav ? 
            `<div class="nav-arrow-container" style="transform: rotate(${effectiveHeading}deg); display:flex; align-items:center; justify-content:center;">
                <svg width="64" height="64" viewBox="0 0 56 56" fill="none">
                    <circle cx="28" cy="28" r="28" fill="#3B82F6" fill-opacity="0.2"/>
                    <path d="M28 6L10 48L28 40L46 48L28 6Z" fill="#3B82F6" stroke="white" stroke-width="3" stroke-linejoin="round"/>
                </svg>
            </div>` : 
            '';
            
        const icon = isNav ? 
            window.L.divIcon({ className: 'nav-marker-wrapper', html: svg, iconSize: [64, 64], iconAnchor: [32, 32] }) : 
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
          
          if (isSelected) {
            const glow = window.L.polyline(latLngs, { color: route.color, weight: 10, opacity: 0.4, className: 'blur-md' }).addTo(mapRef.current);
            routeLayersRef.current.push(glow);
          }

          const line = window.L.polyline(latLngs, { 
              color: isSelected ? route.color : '#475569', 
              weight: isSelected ? 5 : 4, 
              opacity: isSelected ? 1 : 0.5,
              lineCap: 'round', lineJoin: 'round'
          }).addTo(mapRef.current);
          
          line.on('click', () => handleRouteSelect(index));
          routeLayersRef.current.push(line);

          if (isSelected) mapRef.current.fitBounds(line.getBounds(), { padding: [60, 60] });
      });
  };

  const calculateRoutes = async () => {
    if (!startLoc || !endLoc) return;
    setLoading(true);
    setRoutes([]); setAnalysis(null); setRainAlert(null); setSheetMode('mid'); setPois([]);
    
    // Clear Markers
    markersRef.current.forEach(m => mapRef.current.removeLayer(m));
    markersRef.current = [];
    poiMarkersRef.current.forEach(m => mapRef.current.removeLayer(m));
    poiMarkersRef.current = [];

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
            html: `<div class="${colorClass} w-7 h-7 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-slate-900 font-bold text-[10px]">${Math.round(w.temp)}°</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14]
        });
        markersRef.current.push(window.L.marker([w.lat, w.lng], { icon }).addTo(mapRef.current));
    });

    // Use STATIC Analysis now (No AI)
    const aiResult = await analyzeRouteStatic(
        startLoc?.name || "", endLoc?.name || "", weatherDataList, 
        route.type === 'scenic' ? 'scenic' : 'fastest', elevationStats || undefined
    );
    setAnalysis(aiResult);
  };

  const checkForRainRisk = (points: WeatherData[]) => {
      if (points.length === 0) return;
      const probNow = points[0].rainProb || 0;
      setRainAlert(probNow > 40 ? { minutes: 0, prob: probNow } : null);
  };

  // --- POI Search Logic ---
  const handlePoiSearch = async (type: 'fuel' | 'food' | 'sight') => {
      if (!routes[selectedRouteIndex]) return;
      
      setPoiLoading(type);
      // Clear existing POIs first
      poiMarkersRef.current.forEach(m => mapRef.current.removeLayer(m));
      poiMarkersRef.current = [];
      setPois([]);

      const results = await findPoisAlongRoute(routes[selectedRouteIndex].coordinates, type);
      setPois(results);
      setPoiLoading(null);

      // Render markers
      results.forEach(poi => {
          let bgColor = 'bg-yellow-500';
          let Icon = Fuel;
          
          if (poi.type === 'food') { bgColor = 'bg-orange-500'; Icon = Utensils; }
          else if (poi.type === 'sight') { bgColor = 'bg-purple-500'; Icon = Camera; }

          // Convert lucide icon to SVG string manually for Leaflet DivIcon
          const iconHtml = `<div class="${bgColor} w-8 h-8 rounded-full flex items-center justify-center text-white shadow-xl border-2 border-white transform hover:scale-110 transition-transform">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                ${type === 'fuel' ? '<path d="M3 22v-8a2 2 0 0 1 2-2h2.5a2 2 0 0 1 2 2v8"></path><path d="M5 2h5"></path><path d="M12 2v20"></path><path d="M15 10v-5a2 2 0 0 1 2-2h3"></path>' : ''}
                ${type === 'food' ? '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3"></path>' : ''}
                ${type === 'sight' ? '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle>' : ''}
            </svg>
          </div>`;

          const marker = window.L.marker([poi.lat, poi.lng], {
              icon: window.L.divIcon({ className: '', html: iconHtml, iconSize: [32, 32], iconAnchor: [16, 32] })
          }).addTo(mapRef.current);
          
          marker.bindPopup(`<div class="font-bold text-sm text-black">${poi.name}</div>`, { closeButton: false, offset: [0, -32] });
          poiMarkersRef.current.push(marker);
      });
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
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, speed, heading: gpsHeading } = pos.coords;
                setCurrentSpeed(speed ? Math.round(speed * 3.6) : 0);
                updateUserMarker(latitude, longitude, gpsHeading || 0, true);
                if (mapRef.current) mapRef.current.flyTo([latitude, longitude], 18, { animate: true, duration: 1 });
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
      setIsRefreshing(true);
      initLocation();
  };

  const currentAvgWeather = weatherPoints.length > 0 ? weatherPoints[0] : null; 
  const windChill = currentAvgWeather ? calculateWindChill(currentAvgWeather.temp, currentAvgWeather.windSpeed) : 0;
  const currentRoute = routes[selectedRouteIndex];
  
  const sheetHeightClass = 
    sheetMode === 'mini' ? 'h-[180px]' : 
    sheetMode === 'mid' ? 'h-[55dvh]' : // Increased slightly to fit POI buttons
    'h-[90dvh]';

  return (
    <div 
        ref={containerRef}
        className="relative w-full h-[100dvh] flex flex-col bg-black font-sans overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
    >
      
      {/* Map Layer */}
      <div id="map-container" className="absolute inset-0 z-0 h-full w-full bg-black" />

      {/* --- PULL TO REFRESH INDICATOR --- */}
      <div className="absolute top-0 left-0 right-0 z-30 flex justify-center pointer-events-none transition-transform duration-200" style={{ transform: `translateY(${pullY}px)` }}>
          <div className="bg-black/80 rounded-full p-2 mt-4 shadow-2xl border border-white/20">
              <RefreshCw size={24} className={`text-blue-500 ${isRefreshing ? 'animate-spin' : ''}`} style={{ transform: `rotate(${pullY * 2}deg)` }}/>
          </div>
      </div>

      {/* --- RAIN ALERT --- */}
      {rainAlert && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-10 duration-700">
              <div className="bg-black/70 backdrop-blur-2xl px-5 py-2.5 rounded-full flex items-center gap-3 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                  <div className="bg-blue-500/20 p-1.5 rounded-full animate-pulse">
                      <CloudRain size={16} className="text-blue-400" />
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-blue-300 tracking-wider uppercase">Yağmur Uyarısı</span>
                      <span className="text-sm font-semibold text-white">{rainAlert.minutes === 0 ? "Bölgede Yağış Var" : `${rainAlert.minutes}dk içinde`}</span>
                  </div>
              </div>
          </div>
      )}

      {/* --- NAVIGATION MODE UI --- */}
      {isNavigating && currentRoute && (
        <>
            <div className="absolute top-6 left-4 right-4 z-50 flex justify-between pointer-events-none">
                 <div className="bg-black/60 backdrop-blur-2xl border border-white/10 p-4 rounded-[28px] shadow-2xl flex items-center gap-4 flex-1 mr-2 pointer-events-auto">
                    <div className="bg-green-500 w-12 h-12 rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(34,197,94,0.4)]">
                        <ArrowUpRight size={28} strokeWidth={3} />
                    </div>
                    <div>
                        <div className="text-2xl font-black text-white tracking-tight">{Math.round(currentRoute.distance / 1000)} <span className="text-sm text-white/50 font-medium">km</span></div>
                        <div className="text-xs text-white/50 font-medium truncate">Sonraki dönüş düz devam</div>
                    </div>
                 </div>
                 <button onClick={stopNavigation} className="pointer-events-auto bg-red-500/80 hover:bg-red-500 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-all active:scale-95">
                    <X size={20} />
                 </button>
            </div>

            <div className="absolute bottom-10 left-6 right-6 z-50 pointer-events-none flex justify-center">
                <div className="bg-black/70 backdrop-blur-2xl border border-white/10 rounded-[32px] p-1.5 px-2 shadow-2xl flex items-center gap-1 pointer-events-auto">
                    <div className="bg-white/10 rounded-[24px] px-6 py-3 flex flex-col items-center min-w-[90px]">
                        <span className="text-3xl font-black text-white leading-none">{currentSpeed}</span>
                        <span className="text-[9px] font-bold text-white/50 tracking-widest mt-1">KM/H</span>
                    </div>
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
            {/* Transparent Header Search */}
            <div className="absolute top-0 left-0 right-0 z-40 p-4 pt-4 bg-gradient-to-b from-black/90 to-transparent pointer-events-none transition-all" style={{ opacity: pullY > 0 ? 0.5 : 1 }}>
                <div className="flex flex-col gap-3 pointer-events-auto">
                    <div className="group relative transition-all active:scale-[0.99]">
                        <div className="absolute left-4 top-3.5 text-blue-500"><MapPin size={16} /></div>
                        <input type="text" placeholder="Nereden?" 
                        className="w-full bg-white/10 backdrop-blur-md text-white p-3 pl-11 rounded-2xl border border-white/5 focus:bg-black/80 focus:border-blue-500/50 outline-none text-sm font-medium placeholder:text-white/30 shadow-lg transition-all"
                        value={startQuery} onChange={(e) => setStartQuery(e.target.value)} onFocus={() => setActiveSearchField('start')} />
                    </div>
                    <div className="group relative transition-all active:scale-[0.99]">
                        <div className="absolute left-4 top-3.5 text-orange-500"><Search size={16} /></div>
                        <input type="text" placeholder="Nereye gidiyoruz?" 
                        className="w-full bg-white/10 backdrop-blur-md text-white p-3 pl-11 rounded-2xl border border-white/5 focus:bg-black/80 focus:border-orange-500/50 outline-none text-sm font-medium placeholder:text-white/30 shadow-lg transition-all"
                        value={endQuery} onChange={(e) => setEndQuery(e.target.value)} onFocus={() => setActiveSearchField('end')} />
                    </div>

                    {activeSearchField && searchResults.length > 0 && (
                        <div className="bg-black/90 backdrop-blur-2xl rounded-2xl mt-1 overflow-hidden border border-white/10 shadow-2xl">
                            {searchResults.map((res, idx) => (
                                <div key={idx} className="p-3.5 hover:bg-white/10 cursor-pointer flex items-center gap-3 border-b border-white/5 last:border-0 active:bg-white/20" onClick={() => handleSelectLocation(res)}>
                                    <div className="bg-white/10 p-2 rounded-full text-white/70">
                                        <MapPin size={14} />
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

                {(!analysis || routes.length === 0) && (
                    <div className="pointer-events-auto mt-3 flex justify-end">
                        <button onClick={calculateRoutes} disabled={!startLoc || !endLoc || loading}
                        className={`px-5 py-2 rounded-full font-bold shadow-lg transition-all backdrop-blur-md text-xs tracking-wide uppercase flex items-center gap-2 ${loading ? 'bg-white/10 text-white/50' : 'bg-white text-black hover:bg-gray-200 hover:scale-105'}`}>
                        {loading ? 'Hesaplanıyor...' : 'Rotayı Çiz'} <Navigation size={12} fill="currentColor"/>
                        </button>
                    </div>
                )}
            </div>

            {/* Locate Me FAB */}
            <button 
               onClick={handleRecenter}
               className={`absolute right-4 z-40 bg-black/60 backdrop-blur-xl border border-white/10 w-12 h-12 rounded-full flex items-center justify-center shadow-2xl text-white active:scale-90 transition-all duration-300 ${sheetMode === 'full' ? 'bottom-[92dvh] opacity-0' : sheetMode === 'mid' ? 'bottom-[57dvh]' : 'bottom-[200px]'}`}
            >
               <LocateFixed size={20} className={isRefreshing ? 'animate-spin' : ''} />
            </button>

            {/* --- BOTTOM SHEET --- */}
            {routes.length > 0 && analysis && (
                <div 
                    className={`absolute bottom-0 left-0 right-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-2xl border-t border-white/10 rounded-t-[36px] shadow-[0_-10px_60px_rgba(0,0,0,1)] flex flex-col transition-[height] duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${sheetHeightClass}`}
                >
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
                        <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                    </div>

                    <div className="flex-none flex px-4 pb-4 gap-3 overflow-x-auto no-scrollbar snap-x pt-2">
                        {routes.map((r, idx) => (
                            <button key={idx} onClick={(e) => { e.stopPropagation(); handleRouteSelect(idx); }} 
                                className={`flex-none snap-center min-w-[120px] h-[72px] rounded-2xl border transition-all duration-300 flex flex-col items-center justify-center relative overflow-hidden active:scale-95 ${selectedRouteIndex === idx ? 'bg-white/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.2)]' : 'bg-transparent border-white/5 opacity-50'}`}>
                                <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: r.color }}>{r.name}</div>
                                <div className="text-xl font-black text-white leading-none">{(r.distance / 1000).toFixed(0)}<span className="text-[10px] font-bold text-white/50 ml-0.5">KM</span></div>
                                <div className="text-[10px] text-white/40 mt-1">{Math.floor(r.duration / 60)} dk</div>
                            </button>
                        ))}
                    </div>

                    <div className={`flex-1 overflow-y-auto px-6 pt-2 transition-opacity duration-300 ${sheetMode === 'mini' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                        <div className="flex items-start justify-between mb-5">
                            <h2 className="text-white font-bold text-2xl w-3/4 leading-none tracking-tight">{analysis.summary}</h2>
                            <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border tracking-wider ${analysis.riskLevel === 'Düşük' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`}>
                                {analysis.riskLevel}
                            </div>
                        </div>

                        <div className="flex bg-white/5 p-1 rounded-xl mb-6">
                            {(['general', 'segments', 'stops'] as const).map((tab) => (
                                <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold transition-all duration-300 uppercase tracking-widest ${activeTab === tab ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white'}`}>
                                    {tab === 'general' ? 'Özet' : tab === 'segments' ? 'Yol' : 'Mola'}
                                </button>
                            ))}
                        </div>

                        <div className="pb-28 space-y-3">
                            {activeTab === 'general' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    {/* POI Search Buttons */}
                                    <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
                                        <button onClick={() => handlePoiSearch('fuel')} disabled={poiLoading !== null} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border font-bold text-xs transition-all ${poiLoading==='fuel'?'bg-yellow-500/20 border-yellow-500 text-yellow-500':'bg-white/5 border-white/5 hover:bg-white/10 text-white/70'}`}>
                                            <Fuel size={14} className={poiLoading==='fuel'?'animate-pulse':''} /> Benzin
                                        </button>
                                        <button onClick={() => handlePoiSearch('food')} disabled={poiLoading !== null} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border font-bold text-xs transition-all ${poiLoading==='food'?'bg-orange-500/20 border-orange-500 text-orange-500':'bg-white/5 border-white/5 hover:bg-white/10 text-white/70'}`}>
                                            <Utensils size={14} className={poiLoading==='food'?'animate-pulse':''} /> Yemek
                                        </button>
                                        <button onClick={() => handlePoiSearch('sight')} disabled={poiLoading !== null} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border font-bold text-xs transition-all ${poiLoading==='sight'?'bg-purple-500/20 border-purple-500 text-purple-500':'bg-white/5 border-white/5 hover:bg-white/10 text-white/70'}`}>
                                            <Camera size={14} className={poiLoading==='sight'?'animate-pulse':''} /> Manzara
                                        </button>
                                    </div>

                                    <div className="bg-gradient-to-br from-white/10 to-white/5 p-5 rounded-3xl border border-white/5">
                                        <div className="flex items-center gap-2 text-[10px] text-blue-300 mb-1 uppercase font-bold tracking-wider"><Mountain size={12}/> Yükselti Analizi</div>
                                        {analysis.elevationStats && <ElevationChart stats={analysis.elevationStats} />}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 mt-3">
                                        <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
                                            <div className="text-[10px] text-white/40 mb-1 font-bold uppercase tracking-wider flex items-center gap-1"><ThermometerSun size={12}/> Hissedilen</div>
                                            <div className="text-2xl font-black text-white">{windChill}°</div>
                                        </div>
                                        <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
                                            <div className="text-[10px] text-white/40 mb-1 font-bold uppercase tracking-wider flex items-center gap-1"><Wind size={12}/> Rüzgar</div>
                                            <div className="text-sm font-bold text-white truncate">{analysis.windWarning}</div>
                                        </div>
                                    </div>
                                    <div className="bg-blue-600/10 border border-blue-500/20 p-5 rounded-3xl mt-3">
                                        <div className="text-[10px] text-blue-400 font-bold uppercase mb-2 flex items-center gap-2 tracking-wider"><AlertTriangle size={12}/> Ekipman Tavsiyesi</div>
                                        <div className="text-sm text-blue-100 font-medium leading-relaxed">{analysis.gearAdvice}</div>
                                    </div>
                                </div>
                            )}
                             {activeTab === 'segments' && analysis.segments.map((seg, i) => (
                                <div key={i} className="bg-white/5 p-4 rounded-3xl border border-white/5 flex justify-between items-center group">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{seg.name}</span>
                                        <span className="text-[10px] text-white/40 mt-0.5">{seg.description}</span>
                                    </div>
                                    <span className={`text-[9px] px-2 py-1 rounded font-bold ${seg.risk==='Yüksek'?'bg-red-500/20 text-red-400':'bg-green-500/20 text-green-400'}`}>{seg.risk}</span>
                                </div>
                             ))}
                             {activeTab === 'stops' && analysis.pitStops.map((stop, i) => (
                                <div key={i} className="bg-white/5 p-4 rounded-3xl border border-white/5 flex gap-4 items-center">
                                    <div className="bg-orange-500/20 w-10 h-10 rounded-full flex items-center justify-center text-orange-400 shadow-lg shadow-orange-500/10"><Coffee size={16}/></div>
                                    <div><div className="text-sm font-bold text-white">{stop.type}</div><div className="text-[10px] text-white/50 mt-0.5">{stop.locationDescription}</div></div>
                                </div>
                             ))}
                        </div>
                    </div>

                    <div className="absolute bottom-8 left-0 right-0 px-8 flex justify-center pointer-events-none z-50">
                        <button onClick={startNavigation} className="pointer-events-auto bg-white text-black pl-8 pr-2 py-2 rounded-full font-black shadow-[0_0_50px_rgba(255,255,255,0.4)] flex items-center gap-6 hover:scale-105 active:scale-95 transition-all group">
                            <span className="text-sm tracking-widest uppercase">BAŞLAT</span>
                            <div className="bg-black text-white w-12 h-12 rounded-full flex items-center justify-center group-hover:rotate-90 transition-transform duration-500">
                                <Navigation size={20} fill="currentColor" />
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