import { GoogleGenAI, Type } from "@google/genai";
import { WeatherData, RouteAnalysis } from "../types";

export const analyzeRouteWithGemini = async (
  start: string,
  end: string,
  weatherPoints: WeatherData[],
  routeType: 'fastest' | 'scenic' | 'safe'
): Promise<RouteAnalysis> => {
  
  // 1. Direct API Key Access
  // Bundlers often replace process.env.API_KEY directly during build.
  // Complex checks (typeof process) can prevent this replacement.
  const apiKey = process.env.API_KEY;

  // 2. Fallback
  if (!apiKey) {
    console.warn("API Key not found in process.env");
    return {
      riskLevel: "Düşük",
      summary: "API Anahtarı eksik. Gelişmiş analiz yapılamıyor.",
      elevationDetails: "-",
      windWarning: "-",
      gearAdvice: "Ekipman kontrolü yapın.",
      roadCondition: "Standart",
      scenicScore: "-",
      segments: [],
      pitStops: [],
      playlistVibe: "Radyo"
    };
  }

  // 3. Initialize AI
  const ai = new GoogleGenAI({ apiKey: apiKey });
  const model = "gemini-2.5-flash";

  const weatherSummary = weatherPoints
    .map(
      (w, i) =>
        `Nokta ${i + 1}: Konum(${w.lat.toFixed(2)}, ${w.lng.toFixed(2)}), Sıcaklık: ${w.temp}°C, Rüzgar: ${w.windSpeed} km/s, Yağış İhtimali: %${w.rainProb}`
    )
    .join("\n");

  const prompt = `
    Sen uzman bir motosiklet yol planlayıcısısın. Aşağıdaki rotayı bir motorcu için detaylı analiz et.
    Başlangıç: ${start}
    Bitiş: ${end}
    Hava Durumu Verileri:
    ${weatherSummary}

    İstediğim Çıktılar:
    1. Genel Risk ve Özet.
    2. Rota Segmentasyonu: Rotayı mantıksal olarak 3 parçaya böl (Örn: Şehir çıkışı, Otoban, Varış yolu) ve her biri için motorcuya özel sürüş tavsiyesi ver.
    3. Mola Durakları: Bu rotada ve bu hava durumunda nerede durulmalı? (Örn: Soğuksa sıcak kahve, manzaralıysa fotoğraf molası). 3 öneri ver.
    4. Playlist Modu: Bu yolun ve havanın ruhuna uygun bir müzik türü/vibe öner (Örn: "Classic Rock", "Lo-Fi Beats", "Enerjik Pop").
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      riskLevel: { type: Type.STRING, enum: ["Düşük", "Orta", "Yüksek"] },
      summary: { type: Type.STRING },
      elevationDetails: { type: Type.STRING },
      windWarning: { type: Type.STRING },
      gearAdvice: { type: Type.STRING },
      roadCondition: { type: Type.STRING },
      scenicScore: { type: Type.STRING },
      playlistVibe: { type: Type.STRING, description: "Yolun ruhuna uygun müzik türü." },
      segments: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING, description: "Segment adı (Örn: Şehir İçi Geçiş)" },
                description: { type: Type.STRING, description: "Bu bölümdeki sürüş stratejisi" },
                risk: { type: Type.STRING, enum: ["Düşük", "Orta", "Yüksek"] }
            }
        }
      },
      pitStops: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                type: { type: Type.STRING, description: "Mola türü (Kahve, Yemek, Manzara)" },
                locationDescription: { type: Type.STRING, description: "Yaklaşık konum tanımı" },
                reason: { type: Type.STRING, description: "Neden burada durulmalı?" }
            }
        }
      }
    },
    required: ["riskLevel", "summary", "elevationDetails", "windWarning", "gearAdvice", "segments", "pitStops", "playlistVibe"],
  };

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: "Motosiklet odaklı, samimi ve güvenliği ön planda tutan bir dilde, Türkçe yanıt ver.",
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Gemini yanıtı boş.");
    
    return JSON.parse(text) as RouteAnalysis;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      riskLevel: "Orta",
      summary: "Yapay zeka analizine şu an ulaşılamıyor.",
      elevationDetails: "-",
      windWarning: "-",
      gearAdvice: "Tam ekipman.",
      roadCondition: "Bilinmiyor",
      scenicScore: "-",
      segments: [],
      pitStops: [],
      playlistVibe: "Motor Sesi"
    };
  }
};