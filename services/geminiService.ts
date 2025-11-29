import { GoogleGenAI, Type } from "@google/genai";
import { WeatherData, RouteAnalysis } from "../types";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeRouteWithGemini = async (
  start: string,
  end: string,
  weatherPoints: WeatherData[],
  routeType: 'fastest' | 'scenic' | 'safe' // Keeping type signature for compatibility but logic focuses on general analysis
): Promise<RouteAnalysis> => {
  const model = "gemini-2.5-flash";

  const weatherSummary = weatherPoints
    .map(
      (w, i) =>
        `Nokta ${i + 1}: Konum(${w.lat.toFixed(2)}, ${w.lng.toFixed(2)}), Sıcaklık: ${w.temp}°C, Rüzgar: ${w.windSpeed} km/s`
    )
    .join("\n");

  const prompt = `
    Aşağıdaki motosiklet rotasını analiz et.
    Başlangıç: ${start}
    Bitiş: ${end}
    Rota üzerindeki hava durumu verileri:
    ${weatherSummary}

    Özellikle şunlara odaklan:
    1. Yükseklik/Rakım değişimleri: Dağ geçidi, yayla veya deniz seviyesine iniş var mı?
    2. Rüzgar ve sıcaklık ilişkisi.
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      riskLevel: {
        type: Type.STRING,
        enum: ["Düşük", "Orta", "Yüksek"],
        description: "Genel sürüş risk seviyesi.",
      },
      summary: {
        type: Type.STRING,
        description: "Genel rota özeti.",
      },
      elevationDetails: {
        type: Type.STRING,
        description: "Rakım analizi. Örn: 'Bolu Dağı geçişinde rakım 900m'ye çıkıyor, ısı düşebilir.'",
      },
      windWarning: {
        type: Type.STRING,
        description: "Rüzgar riski uyarısı.",
      },
      gearAdvice: {
        type: Type.STRING,
        description: "Ekipman tavsiyesi.",
      },
      roadCondition: {
         type: Type.STRING,
         description: "Tahmini asfalt kalitesi.",
      },
      scenicScore: {
          type: Type.STRING,
          description: "Manzara puanı.",
      }
    },
    required: ["riskLevel", "summary", "elevationDetails", "windWarning", "gearAdvice", "roadCondition", "scenicScore"],
  };

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: "Sen uzman bir motosiklet eğitmenisin. Yanıtı Türkçe ve JSON formatında ver.",
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
      summary: "Yapay zeka bağlantısı kurulamadı.",
      elevationDetails: "Rakım verisi alınamadı.",
      windWarning: "Veri alınamadı.",
      gearAdvice: "Tam korumalı ekipman giyiniz.",
      roadCondition: "Bilinmiyor, dikkatli sürün.",
      scenicScore: "Standart Rota"
    };
  }
};
