import { GoogleGenAI, Type } from "@google/genai";
import { WeatherData, RouteAnalysis, ElevationStats } from "../types";

export const analyzeRouteWithGemini = async (
  start: string,
  end: string,
  weatherPoints: WeatherData[],
  routeType: 'fastest' | 'scenic' | 'safe',
  elevation?: ElevationStats // Added elevation input
): Promise<RouteAnalysis> => {
  
  const apiKey = process.env.API_KEY;

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
      playlistVibe: "Radyo",
      elevationStats: elevation
    };
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const model = "gemini-2.5-flash";

  const weatherSummary = weatherPoints
    .map(
      (w, i) =>
        `Nokta ${i + 1}: Konum(${w.lat.toFixed(2)}, ${w.lng.toFixed(2)}), Sıcaklık: ${w.temp}°C, Rüzgar: ${w.windSpeed} km/s, Yağış İhtimali: %${w.rainProb}`
    )
    .join("\n");

  const elevationInfo = elevation 
    ? `Rota Rakım Bilgisi: En Düşük: ${elevation.min}m, En Yüksek: ${elevation.max}m, Toplam Tırmanış: ${elevation.gain}m.` 
    : "Rakım bilgisi mevcut değil.";

  const prompt = `
    Sen uzman bir motosiklet yol planlayıcısısın. Aşağıdaki rotayı bir motorcu için detaylı analiz et.
    Başlangıç: ${start}
    Bitiş: ${end}
    ${elevationInfo}
    Hava Durumu Verileri:
    ${weatherSummary}

    Önemli: Eğer rakım yüksekse (1000m+), sıcaklık düşüşü uyarısı yap.
    
    İstediğim Çıktılar:
    1. Genel Risk ve Özet (Rakım ve hava ilişkisini kur).
    2. Rota Segmentasyonu: Rotayı mantıksal olarak 3 parçaya böl.
    3. Mola Durakları: 3 adet nokta atışı öneri.
    4. Playlist Modu: Yolun ruhuna uygun.
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
      playlistVibe: { type: Type.STRING },
      segments: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                risk: { type: Type.STRING, enum: ["Düşük", "Orta", "Yüksek"] }
            }
        }
      },
      pitStops: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                type: { type: Type.STRING },
                locationDescription: { type: Type.STRING },
                reason: { type: Type.STRING }
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
        systemInstruction: "Motosiklet odaklı, Türkçe yanıt ver.",
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Gemini yanıtı boş.");
    
    const parsed = JSON.parse(text) as RouteAnalysis;
    parsed.elevationStats = elevation; // Attach raw stats back to object
    return parsed;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      riskLevel: "Orta",
      summary: "Analiz hatası.",
      elevationDetails: "-",
      windWarning: "-",
      gearAdvice: "Dikkatli sürün.",
      roadCondition: "-",
      scenicScore: "-",
      segments: [],
      pitStops: [],
      playlistVibe: "-",
      elevationStats: elevation
    };
  }
};