import { WeatherData, RouteAnalysis, ElevationStats, RouteSegment, PitStop } from "../types";

// Helper to get random item from array
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

export const analyzeRouteStatic = async (
  start: string,
  end: string,
  weatherPoints: WeatherData[],
  routeType: 'fastest' | 'scenic' | 'safe',
  elevation?: ElevationStats
): Promise<RouteAnalysis> => {
  
  // 1. Calculate Averages and Maxima
  const avgTemp = weatherPoints.reduce((sum, w) => sum + w.temp, 0) / weatherPoints.length;
  const maxWind = Math.max(...weatherPoints.map(w => w.windSpeed));
  const maxRainProb = Math.max(...weatherPoints.map(w => w.rainProb));
  const totalRain = weatherPoints.reduce((sum, w) => sum + w.rain, 0);

  // 2. Determine Risk Level
  let riskLevel: "Düşük" | "Orta" | "Yüksek" = "Düşük";
  let roadCondition = "Kuru ve Güvenli";
  
  if (maxRainProb > 60 || totalRain > 2.0 || maxWind > 45) {
      riskLevel = "Yüksek";
      roadCondition = "Islak ve Kaygan Zemin";
  } else if (maxRainProb > 30 || maxWind > 25 || avgTemp < 5) {
      riskLevel = "Orta";
      roadCondition = maxWind > 25 ? "Şiddetli Yan Rüzgar" : "Yer Yer Islak";
  }

  // 3. Generate Summary based on Data
  let summary = "";
  if (riskLevel === "Yüksek") {
      summary = `Dikkat! Rota üzerinde zorlu koşullar var. ${maxWind > 45 ? "Şiddetli rüzgar" : "Yoğun yağış"} sürüşü zorlaştırabilir.`;
  } else if (riskLevel === "Orta") {
      summary = `Genel olarak keyifli, ancak ${maxWind > 25 ? "rüzgara" : "bölgesel yağışa"} dikkat edilmeli.`;
  } else {
      summary = `Sürüş için harika bir hava! Rota açık ve koşullar ideal.`;
  }

  // 4. Gear Advice Logic
  let gearAdvice = "";
  if (avgTemp < 10) gearAdvice = "Termal içlik ve kışlık mont şart. Boyunluk takmayı unutma.";
  else if (avgTemp < 20) gearAdvice = "Mevsimlik mont ve rüzgar kesici yeterli olacaktır.";
  else if (avgTemp > 28) gearAdvice = "Yazlık file mont ve bol su molası önerilir.";
  else gearAdvice = "Standart ekipmanla konforlu bir sürüş yapabilirsin.";

  if (maxRainProb > 40) gearAdvice += " Yanına mutlaka yağmurluk al.";

  // 5. Generate Segments (Math-based splitting)
  const segments: RouteSegment[] = [
      {
          name: "Başlangıç Etabı",
          description: "Şehir çıkışı ve ana yola bağlantı.",
          risk: "Düşük"
      },
      {
          name: "Orta Bölüm",
          description: maxWind > 20 ? "Açık alanlarda rüzgar alabilir." : "Seyir hızı için uygun, akıcı trafik.",
          risk: maxWind > 30 ? "Orta" : "Düşük"
      },
      {
          name: "Varış Etabı",
          description: "Hedefe yaklaşırken trafik yoğunluğuna dikkat.",
          risk: "Düşük"
      }
  ];

  // 6. Pit Stops (Generic suggestions based on Route Type)
  const pitStops: PitStop[] = [];
  if (routeType === 'scenic') {
      pitStops.push({ type: "Manzara Molası", locationDescription: "Yolun yüksek kesimi", reason: "Fotoğraf çekmek için harika bir nokta." });
      pitStops.push({ type: "Köy Kahvesi", locationDescription: "Yerleşim yeri girişi", reason: "Çay ve yerel tatlar." });
  } else {
      pitStops.push({ type: "Akaryakıt İstasyonu", locationDescription: "Otoyol Tesisleri", reason: "Yakıt ikmali ve lastik kontrolü." });
      pitStops.push({ type: "Kahve Dünyası", locationDescription: "Dinlenme Tesisi", reason: "Kafein takviyesi." });
  }

  // 7. Playlist Vibe
  let playlistVibe = "Popüler Radyo";
  if (routeType === 'scenic') playlistVibe = "Akustik & Chill";
  else if (avgTemp > 25) playlistVibe = "Yaz Enerjisi / Reggaeton";
  else if (riskLevel === 'Yüksek') playlistVibe = "Odaklanma / Deep House";
  else playlistVibe = "Classic Rock / Yol Şarkıları";

  return {
    riskLevel,
    summary,
    elevationDetails: elevation ? `Max ${Math.round(elevation.max)}m` : "-",
    windWarning: maxWind > 20 ? `${maxWind} km/s Rüzgar` : "Sakin",
    gearAdvice,
    roadCondition,
    scenicScore: routeType === 'scenic' ? "9/10" : "6/10",
    segments,
    pitStops,
    playlistVibe,
    elevationStats: elevation
  };
};