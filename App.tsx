import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, CloudRain, X, Mountain, LocateFixed, Coffee, ArrowUpRight, RefreshCw, ThermometerSun, Wind, AlertTriangle, Fuel, Camera, Utensils, Radio, Play, Pause, Music, Compass, Activity, Gauge, Cloud, Sun, CloudFog, CloudLightning, Snowflake, Droplets, ArrowRight } from 'lucide-react';
import { LocationData, RouteAnalysis, WeatherData, RouteAlternative, ElevationStats, PoiData, RadioStation } from './types';
import { searchLocation, getIpLocation, getRouteAlternatives, getWeatherForPoint, getElevationProfile, findPoisAlongRoute, getRadioStations } from './services/api';
import { analyzeRouteStatic } from './services/geminiService';

// --- Helpers ---

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

const getCompassDirection = (deg: number) => {
    const val = Math.floor((deg / 22.5) + 0.5);
    const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return arr[(val % 16)];
};

// Map WMO codes to Icon and Description
const getWeatherInfo = (code: number) => {
    if (code === 0) return { icon: Sun, label: "Açık", color: "text-yellow-400" };
    if (code >= 1 && code <= 3) return { icon: Cloud, label: "Bulutlu", color: "text-gray-300" };
    if (code === 45 || code === 48) return { icon: CloudFog, label: "Sisli", color: "text-slate-400" };
    if (code >= 51 && code <= 67) return { icon: CloudRain, label: "Yağmurlu", color: "text-blue-400" };
    if (code >= 71 && code <= 77) return { icon: Snowflake, label: "Karlı", color: "text-cyan-200" };
    if (code >= 80 && code <= 82) return { icon: CloudRain, label: "Sağanak", color: "text-blue-500" };
    if (code >= 95) return { icon: CloudLightning, label: "Fırtına", color: "text-purple-400" };
    return { icon: Sun, label: "Açık", color: "text-yellow-400" };
};

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

// Component for Weather Card in Bottom Sheet
const WeatherTimelineCard: React.FC<{ weather: WeatherData; index: number; total: number }> = ({ weather, index, total }) => {
    const { icon: Icon, label, color } = getWeatherInfo(weather.weatherCode);
    const progress = Math.round((index / (total - 1)) * 100);
    
    return (
        <div className="flex-none w-24 bg-white/5 rounded-2xl p-3 flex flex-col items-center justify-between border border-white/5 relative overflow-hidden group">
            <div className="text-[9px] text-white/40 font-bold uppercase tracking-wider mb-1">
                {index === 0 ? "Başlangıç" : index === total - 1 ? "Varış" : `%${progress} Yol`}
            </div>
            <Icon size={24} className={`${color} drop-shadow-lg mb-1`} />
            <div className="text-lg font-bold text-white leading-none">{Math.round(weather.temp)}°</div>
            <div className="text-[9px] text-white/60 font-medium truncate w-full text-center mt-0.5">{label}</div>
            
            {/* Wind & Rain Indicators */}
            <div className="flex gap-2 mt-2 w-full justify-center border-t border-white/5 pt-1">
                {weather.rainProb > 0 && (
                    <div className="flex items-center gap-0.5 text-blue-400">
                        <Droplets size={8} /> <span className="text-[9px] font-bold">%{weather.rainProb}</span>
                    </div>
                )}
                <div className="flex items-center gap-0.5 text-white/50">
                   <Wind size={8} /> <span className="text-[9px] font-bold">{Math.round(weather.windSpeed)}</span>
                </div>
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
  
  // Route & Analysis
  const [routes, setRoutes] = useState<RouteAlternative[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [analysis, setAnalysis] = useState<RouteAnalysis | null>(null);
  const [weatherPoints, setWeatherPoints] = useState<WeatherData[]>([]);
  
  // POI & Radio
  const [pois, setPois] = useState<PoiData[]>([]);
  const [poiLoading, setPoiLoading] = useState<string | null>(null);
  const [showRadio, setShowRadio] = useState(false);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [radioLoading, setRadioLoading] = useState(false);

  const [rainAlert, setRainAlert] = useState<{minutes: number, prob: number} | null>(null);
  const [activeSearchField, setActiveSearchField] = useState<'start' | 'end' | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  
  // Navigation Stats
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [altitude, setAltitude] = useState(0);
  const [leanAngle, setLeanAngle] = useState(0);
  const [heading, setHeading] = useState(0);

  const [activeTab, setActiveTab] = useState<'general' | 'segments' | 'stops'>('general');
  const [sheetMode, setSheetMode] = useState<'mini' | 'mid' | 'full'>('mid');
  
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // --- Refs ---
  const mapRef = useRef<any>(null); 
  const tileLayerRef = useRef<any>(null);
  const routeLayersRef = useRef<any[]>([]); 
  const activeRoutePolylineRef = useRef<any>(null); 
  const activeRouteGlowRef = useRef<any>(null);
  const traveledPolylineRef = useRef<any>(null); 
  
  const markersRef = useRef<any[]>([]); 
  const poiMarkersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null); 
  const wakeLockRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const touchStartRef = useRef<number>(0);
  const compassHeadingRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Initialization ---
  useEffect(() => {
    if (!mapRef.current && window.L) {
      mapRef.current = window.L.map('map-container', {
        zoomControl: false,
        attributionControl: false,
        zoomSnap: 0.1,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true
      }).setView([39.9334, 32.8597], 6);

      // Force Satellite Mode Only
      tileLayerRef.current = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19
      }).addTo(mapRef.current);
      
      // Labels
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
          subdomains: 'abcd',
          maxZoom: 20,
          id: 'labels'
      }).addTo(mapRef.current);
    }

    const handleOrientation = (event: DeviceOrientationEvent) => {
        // Compass
        let compass = 0;
        if ((event as any).webkitCompassHeading) {
             compass = (event as any).webkitCompassHeading;
        } else if (event.alpha !== null) {
             compass = 360 - event.alpha;
        }
        compassHeadingRef.current = compass;
        
        // Lean Angle (Gamma is usually left/right tilt in portrait)
        if (event.gamma !== null) {
            setLeanAngle(Math.round(event.gamma));
        }

        if (currentSpeed < 5 && userMarkerRef.current) updateMarkerRotation(compass);
    };

    if (window.DeviceOrientationEvent) window.addEventListener('deviceorientation', handleOrientation);

    initLocation();
    
    // Audio Setup
    audioRef.current = new Audio();
    audioRef.current.onplaying = () => setIsPlaying(true);
    audioRef.current.onpause = () => setIsPlaying(false);
    audioRef.current.onerror = () => { setIsPlaying(false); alert("Radyo yüklenemedi."); };

    return () => {
        if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        window.removeEventListener('deviceorientation', handleOrientation);
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  const initLocation = async () => {
      setIsRefreshing(true);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            updateUserMarker(latitude, longitude, 0);
            if (!startLoc) { 
                setStartLoc({ name: "Konumum", lat: latitude, lng: longitude });
                setStartQuery("Konumum");
                if(mapRef.current) mapRef.current.panTo([latitude, longitude], { animate: true, duration: 1 });
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

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) touchStartRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStartRef.current;
    if (diff > 0 && window.scrollY === 0 && !isNavigating) setPullY(Math.min(diff * 0.4, 120));
  };

  const handleTouchEnd = () => {
      if (pullY > 80) initLocation();
      setPullY(0);
  };

  const updateMarkerRotation = (deg: number) => {
      const arrowEl = document.querySelector('.nav-arrow-container') as HTMLElement;
      if (arrowEl) arrowEl.style.transform = `rotate(${deg}deg)`;
      setHeading(deg);
  };

  const updateUserMarker = (lat: number, lng: number, gpsHeading: number, isNav: boolean = false) => {
    if (!mapRef.current) return;
    const effectiveHeading = (currentSpeed > 5 && gpsHeading) ? gpsHeading : compassHeadingRef.current;
    
    if (userMarkerRef.current) {
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

  const updateRouteProgress = (lat: number, lng: number) => {
      if (!routes[selectedRouteIndex] || !activeRoutePolylineRef.current) return;
      
      const routeCoords = routes[selectedRouteIndex].coordinates;
      let minDist = Infinity;
      let closestIdx = 0;

      for (let i = 0; i < routeCoords.length; i++) {
          const d = getDistanceFromLatLonInKm(lat, lng, routeCoords[i][1], routeCoords[i][0]);
          if (d < minDist) {
              minDist = d;
              closestIdx = i;
          }
      }

      if (minDist > 0.5) return; 

      const traveled = routeCoords.slice(0, closestIdx + 1).map(c => [c[1], c[0]]);
      const remaining = routeCoords.slice(closestIdx).map(c => [c[1], c[0]]);

      if (activeRoutePolylineRef.current) activeRoutePolylineRef.current.setLatLngs(remaining);
      if (activeRouteGlowRef.current) activeRouteGlowRef.current.setLatLngs(remaining);
      
      if (!traveledPolylineRef.current && traveled.length > 0) {
          traveledPolylineRef.current = window.L.polyline(traveled, { 
              color: '#94a3b8',
              weight: 6,
              opacity: 0.5,
              lineCap: 'round',
              smoothFactor: 1.5
           }).addTo(mapRef.current);
      } else if (traveledPolylineRef.current) {
          traveledPolylineRef.current.setLatLngs(traveled);
      }
  };

  const drawRoutes = (routeList: RouteAlternative[], selectedIndex: number) => {
      if (!mapRef.current) return;
      
      routeLayersRef.current.forEach(layer => mapRef.current.removeLayer(layer));
      routeLayersRef.current = [];
      if (activeRoutePolylineRef.current) { mapRef.current.removeLayer(activeRoutePolylineRef.current); activeRoutePolylineRef.current = null; }
      if (activeRouteGlowRef.current) { mapRef.current.removeLayer(activeRouteGlowRef.current); activeRouteGlowRef.current = null; }
      if (traveledPolylineRef.current) { mapRef.current.removeLayer(traveledPolylineRef.current); traveledPolylineRef.current = null; }

      routeList.forEach((route, index) => {
          const isSelected = index === selectedIndex;
          const latLngs = route.coordinates.map(c => [c[1], c[0]]);
          
          if (isSelected) {
            activeRouteGlowRef.current = window.L.polyline(latLngs, { color: route.color, weight: 10, opacity: 0.4, className: 'blur-md', smoothFactor: 1.5 }).addTo(mapRef.current);
            activeRoutePolylineRef.current = window.L.polyline(latLngs, { 
                color: route.color, 
                weight: 6, 
                opacity: 1,
                lineCap: 'round', lineJoin: 'round',
                smoothFactor: 1.5
            }).addTo(mapRef.current);
            
            mapRef.current.fitBounds(activeRoutePolylineRef.current.getBounds(), { padding: [60, 60] });
          } else {
            const line = window.L.polyline(latLngs, { 
                color: '#475569', 
                weight: 4, 
                opacity: 0.5,
                lineCap: 'round', lineJoin: 'round',
                smoothFactor: 1.5
            }).addTo(mapRef.current);
            line.on('click', () => handleRouteSelect(index));
            routeLayersRef.current.push(line);
          }
      });
  };

  const calculateRoutes = async () => {
    if (!startLoc || !endLoc) return;
    setLoading(true);
    setRoutes([]); setAnalysis(null); setRainAlert(null); setSheetMode('mid'); setPois([]);
    
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

    // --- ENHANCED WEATHER MARKERS ---
    markersRef.current.forEach(m => mapRef.current.removeLayer(m));
    markersRef.current = [];
    
    weatherDataList.forEach((w, idx) => {
        // Skip start point to avoid cluttering user location
        if (idx === 0) return;

        const { label, color: iconColor } = getWeatherInfo(w.weatherCode);
        
        // Custom HTML Marker for Detailed Weather
        // Icons: Lucide SVGs embedded directly for Leaflet HTML
        const isRainy = w.rainProb > 40;
        const bgClass = isRainy ? 'bg-blue-900/90 border-blue-500' : 'bg-slate-900/90 border-slate-600';
        
        const html = `
            <div class="flex flex-col items-center transform transition-transform hover:scale-110">
                <div class="${bgClass} backdrop-blur-md border px-2 py-1 rounded-xl shadow-2xl flex flex-col items-center min-w-[50px]">
                    <div class="flex items-center gap-1">
                        <span class="text-sm font-bold text-white">${Math.round(w.temp)}°</span>
                    </div>
                    <div class="w-full h-px bg-white/10 my-0.5"></div>
                    <div class="flex items-center gap-1">
                         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white/70" style="transform: rotate(${w.windDirection}deg)">
                            <path d="M5 12l14 0"></path><path d="M13 18l6 -6"></path><path d="M13 6l6 6"></path>
                        </svg>
                        <span class="text-[8px] font-bold text-white/70">${Math.round(w.windSpeed)}</span>
                    </div>
                </div>
                <div class="w-0.5 h-3 bg-white/50"></div>
                <div class="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_white]"></div>
            </div>
        `;

        const icon = window.L.divIcon({
            className: 'bg-transparent',
            html: html,
            iconSize: [50, 60],
            iconAnchor: [25, 60]
        });
        
        const marker = window.L.marker([w.lat, w.lng], { icon }).addTo(mapRef.current);
        markersRef.current.push(marker);
    });

    const aiResult = await analyzeRouteStatic(
        startLoc?.name || "", endLoc?.name || "", weatherDataList, 
        route.type === 'scenic' ? 'scenic' : 'fastest', elevationStats || undefined
    );
    setAnalysis(aiResult);
    
    fetchRadioForVibe(aiResult.playlistTag);
  };

  const fetchRadioForVibe = async (tag: string) => {
      setRadioLoading(true);
      const res = await getRadioStations(tag);
      setStations(res);
      setRadioLoading(false);
  };

  const toggleRadio = (station: RadioStation) => {
      if (currentStation?.stationuuid === station.stationuuid) {
          if (isPlaying) { audioRef.current?.pause(); } 
          else { audioRef.current?.play(); }
      } else {
          setCurrentStation(station);
          if (audioRef.current) {
              audioRef.current.src = station.url_resolved;
              audioRef.current.play();
          }
      }
  };

  const checkForRainRisk = (points: WeatherData[]) => {
      if (points.length === 0) return;
      const probNow = points[0].rainProb || 0;
      setRainAlert(probNow > 40 ? { minutes: 0, prob: probNow } : null);
  };

  const handlePoiSearch = async (type: 'fuel' | 'food' | 'sight') => {
      if (!routes[selectedRouteIndex]) return;
      
      setPoiLoading(type);
      poiMarkersRef.current.forEach(m => mapRef.current.removeLayer(m));
      poiMarkersRef.current = [];
      setPois([]);

      const results = await findPoisAlongRoute(routes[selectedRouteIndex].coordinates, type);
      setPois(results);
      setPoiLoading(null);

      results.forEach(poi => {
          let bgColor = 'bg-yellow-500';
          let Icon = Fuel;
          
          if (poi.type === 'food') { bgColor = 'bg-orange-500'; Icon = Utensils; }
          else if (poi.type === 'sight') { bgColor = 'bg-purple-500'; Icon = Camera; }

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

  const startNavigation = async () => {
    setIsNavigating(true);
    if ('wakeLock' in navigator) {
        try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (e) {}
    }
    if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, speed, heading: gpsHeading, altitude: gpsAlt } = pos.coords;
                setCurrentSpeed(speed ? Math.round(speed * 3.6) : 0);
                setAltitude(gpsAlt ? Math.round(gpsAlt) : 0);
                updateUserMarker(latitude, longitude, gpsHeading || 0, true);
                updateRouteProgress(latitude, longitude); 
                if (mapRef.current) mapRef.current.panTo([latitude, longitude], { animate: true, duration: 0.8 });
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
    sheetMode === 'mid' ? 'h-[55dvh]' : 
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

      {/* --- PULL TO REFRESH --- */}
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

      {/* --- TOP CONTROLS --- */}
      <div className="absolute top-4 right-4 z-40 flex flex-col gap-2">
         <button 
             onClick={() => setShowRadio(!showRadio)} 
             className="bg-black/60 backdrop-blur-xl border border-white/10 w-11 h-11 rounded-full flex items-center justify-center shadow-2xl text-white active:scale-90 transition-all">
             {isPlaying ? <div className="animate-pulse text-green-400"><Music size={20} /></div> : <Radio size={20} />}
         </button>
      </div>

      {/* --- RADIO PLAYER PANEL --- */}
      {showRadio && (
          <div className="absolute top-20 right-4 z-40 w-64 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-4 animate-in slide-in-from-right-10">
              <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-white/70 uppercase tracking-widest">MotoRadio</span>
                  <X size={16} className="text-white/50 cursor-pointer" onClick={() => setShowRadio(false)}/>
              </div>
              
              {currentStation ? (
                  <div className="mb-4">
                      <div className="text-white font-bold truncate text-sm">{currentStation.name}</div>
                      <div className="text-white/40 text-[10px] truncate mb-2">{currentStation.tags}</div>
                      <div className="flex justify-center gap-4">
                          <button onClick={() => toggleRadio(currentStation)} className="bg-white text-black rounded-full w-10 h-10 flex items-center justify-center hover:scale-105 transition-transform">
                              {isPlaying ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor" className="ml-0.5"/>}
                          </button>
                      </div>
                  </div>
              ) : (
                  <div className="text-white/40 text-xs text-center mb-4">Bir istasyon seçin</div>
              )}

              <div className="h-40 overflow-y-auto no-scrollbar space-y-1">
                  {radioLoading ? <div className="text-white/30 text-xs text-center">Yükleniyor...</div> : stations.map(s => (
                      <div key={s.stationuuid} onClick={() => toggleRadio(s)} 
                           className={`p-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors ${currentStation?.stationuuid === s.stationuuid ? 'bg-white/20' : 'hover:bg-white/5'}`}>
                           {currentStation?.stationuuid === s.stationuuid && isPlaying ? <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/> : <div className="w-2 h-2 rounded-full bg-white/20"/>}
                           <div className="flex-1 truncate">
                               <div className="text-white text-xs font-medium truncate">{s.name}</div>
                           </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* --- NAVIGATION MODE UI (COCKPIT DASHBOARD) --- */}
      {isNavigating && currentRoute && (
        <>
            <div className="absolute top-6 left-4 right-16 z-50 flex justify-between pointer-events-none">
                 <div className="bg-black/60 backdrop-blur-3xl border border-white/20 p-4 rounded-[28px] shadow-2xl flex items-center gap-4 flex-1 mr-2 pointer-events-auto">
                    <div className="bg-green-500 w-12 h-12 rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(34,197,94,0.4)] animate-pulse">
                        <ArrowUpRight size={28} strokeWidth={3} />
                    </div>
                    <div>
                        <div className="text-3xl font-black text-white tracking-tight leading-none">{Math.round(currentRoute.distance / 1000)} <span className="text-sm text-white/50 font-medium">km</span></div>
                        <div className="text-[10px] text-white/50 font-medium uppercase tracking-widest mt-1">Hedefe Kalan</div>
                    </div>
                 </div>
                 <button onClick={stopNavigation} className="pointer-events-auto bg-red-600 hover:bg-red-500 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-all active:scale-95 border-2 border-white/10">
                    <X size={24} strokeWidth={3}/>
                 </button>
            </div>

            {/* PRO COCKPIT DASHBOARD */}
            <div className="absolute bottom-6 left-4 right-4 z-50 pointer-events-none flex justify-center">
                <div className="bg-gradient-to-t from-black to-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-[32px] p-2 shadow-[0_20px_60px_rgba(0,0,0,1)] pointer-events-auto w-full max-w-lg relative overflow-hidden">
                    {/* Glass Glare */}
                    <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"/>
                    
                    <div className="flex gap-2">
                        {/* Speedometer (Main) */}
                        <div className="bg-black/50 rounded-[24px] px-6 py-4 flex flex-col items-center justify-center min-w-[120px] border border-white/5 shadow-inner relative">
                             {/* Lean Angle Visualizer (Background Bar) */}
                             <div className="absolute bottom-2 left-2 right-2 h-1 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 transition-all duration-300" 
                                style={{ width: '20%', transform: `translateX(${leanAngle * 2}px)`, margin: '0 auto' }} /> 
                             </div>
                             
                             <span className="text-6xl font-black text-white leading-none tracking-tighter drop-shadow-lg">{currentSpeed}</span>
                             <div className="flex items-center gap-1 mt-1">
                                <span className="text-[9px] font-bold text-blue-400 tracking-[0.2em]">KM/H</span>
                             </div>
                        </div>

                        {/* Info Grid */}
                        <div className="flex-1 grid grid-cols-2 gap-2">
                             <div className="bg-white/5 rounded-2xl p-2 flex flex-col items-center justify-center">
                                 <Compass size={14} className="text-white/40 mb-1" />
                                 <div className="text-lg font-bold text-white">{getCompassDirection(heading)}</div>
                                 <div className="text-[8px] text-white/30 uppercase tracking-widest">Yön</div>
                             </div>
                             
                             <div className="bg-white/5 rounded-2xl p-2 flex flex-col items-center justify-center">
                                 <Mountain size={14} className="text-white/40 mb-1" />
                                 <div className="text-lg font-bold text-white">{altitude}m</div>
                                 <div className="text-[8px] text-white/30 uppercase tracking-widest">Rakım</div>
                             </div>
                             
                             <div className="bg-white/5 rounded-2xl p-2 flex flex-col items-center justify-center">
                                 <ThermometerSun size={14} className="text-white/40 mb-1" />
                                 <div className="text-lg font-bold text-orange-400">{windChill}°</div>
                                 <div className="text-[8px] text-white/30 uppercase tracking-widest">Isı</div>
                             </div>
                             
                             <div className="bg-white/5 rounded-2xl p-2 flex flex-col items-center justify-center">
                                 <Gauge size={14} className="text-white/40 mb-1" />
                                 <div className="text-lg font-bold text-green-400">{new Date(new Date().getTime() + currentRoute.duration * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                 <div className="text-[8px] text-white/30 uppercase tracking-widest">Varış</div>
                             </div>
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
            <div className="absolute top-0 left-0 right-14 z-40 p-4 pt-4 bg-gradient-to-b from-black/90 to-transparent pointer-events-none transition-all" style={{ opacity: pullY > 0 ? 0.5 : 1 }}>
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
                                    
                                    {/* WEATHER TIMELINE - NEW */}
                                    <div className="mb-4">
                                        <div className="flex items-center gap-2 text-[10px] text-blue-300 mb-2 uppercase font-bold tracking-wider px-1">
                                            <Cloud size={12}/> Yol Boyu Hava Tahmini
                                        </div>
                                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                            {weatherPoints.map((w, idx) => (
                                                <WeatherTimelineCard key={idx} weather={w} index={idx} total={weatherPoints.length} />
                                            ))}
                                        </div>
                                    </div>

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

                                    <div className="grid grid-cols-2 gap-3 mt-3">
                                        <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
                                            <div className="text-[10px] text-white/40 mb-1 font-bold uppercase tracking-wider flex items-center gap-1"><ThermometerSun size={12}/> Hissedilen</div>
                                            <div className="text-2xl font-black text-white">{windChill}°</div>
                                        </div>
                                        <div onClick={() => { setShowRadio(true); fetchRadioForVibe(analysis.playlistTag); }} className="bg-white/5 p-4 rounded-3xl border border-white/5 cursor-pointer active:bg-white/10 transition-colors">
                                            <div className="text-[10px] text-white/40 mb-1 font-bold uppercase tracking-wider flex items-center gap-1"><Music size={12}/> Vibe</div>
                                            <div className="text-xs font-bold text-white truncate">{analysis.playlistVibe}</div>
                                            <div className="text-[9px] text-white/30 mt-1">Dinlemek için dokun</div>
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-br from-white/10 to-white/5 p-5 rounded-3xl border border-white/5 mt-3">
                                        <div className="flex items-center gap-2 text-[10px] text-blue-300 mb-1 uppercase font-bold tracking-wider"><Mountain size={12}/> Yükselti Analizi</div>
                                        {analysis.elevationStats && <ElevationChart stats={analysis.elevationStats} />}
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