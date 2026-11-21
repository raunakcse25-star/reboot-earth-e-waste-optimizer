import { GoogleGenAI, Type } from '@google/genai';

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const ECOBOT_SYSTEM_INSTRUCTION = `You are EcoBot, the official intelligent e-waste management and platform assistant for Reboot Earth ("Recycle Technology. Restart Tomorrow.").

Your responsibilities:
1. Guide citizens, organizations, collection centres, recyclers, refurbishers, transporters, producers, and administrators through Reboot Earth features: Pickup Scheduling, Request Status Tracking, Interactive Facility Locator, Smart Logistics Optimizer (Cost / Distance / Carbon Emissions), Inventory & Material Recovery, Environmental Analytics, and Google Workspace Integrations (Gmail receipts, Drive exports, Chat alerts, Contacts autofill).
2. Answer questions accurately about E-Waste categories (IT & Telecom, Consumer Electronics, Large & Small Appliances, Batteries & Power, PCB & Components, Medical/Solar), safe handling (never puncture lithium-ion batteries, wipe personal data before drop-off, keep broken CRTs/fluorescent lamps sealed), refurbishment vs recycling, and India's E-Waste (Management) Rules, 2022 & Extended Producer Responsibility (EPR) overseen by CPCB.
3. Explicitly distinguish Reboot Earth's operational tracking records from official government CPCB registrations, EPR certificates, or statutory filings. Never claim government approval or fabricate facility licenses.
4. Fluently respond in the user's preferred language: English, Hindi (हिन्दी), or Hinglish (Hindi written in Latin script). Keep responses practical, structured, concise, and helpful.`;

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export async function chatWithEcoBot(params: {
  message: string;
  history: ChatTurn[];
  language: string;
  useSearch?: boolean;
}) {
  const ai = getAiClient();
  const langDirective =
    params.language === 'hi'
      ? 'Respond in clear, natural Hindi (Devanagari script).'
      : params.language === 'hinglish'
        ? 'Respond in friendly, natural Hinglish (Hindi words written in English/Latin script).'
        : 'Respond in clear, concise English.';

  const contents = [
    ...params.history.slice(-14).map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    {
      role: 'user',
      parts: [{ text: params.message }],
    },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents,
    config: {
      systemInstruction: `${ECOBOT_SYSTEM_INSTRUCTION}\n\nLanguage preference: ${langDirective}`,
      ...(params.useSearch ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .filter((c: any) => c.web?.uri)
    .map((c: any) => ({
      title: c.web.title || c.web.uri,
      uri: c.web.uri,
    }));

  return {
    reply: response.text || 'I could not generate a response right now. Please try rephrasing your question.',
    sources,
  };
}

export async function searchEWasteRegulations(query: string) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Provide an accurate, current summary answering this India & global e-waste regulations question: ${query}. Clearly distinguish operational guidance from official CPCB statutory portals.`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .filter((c: any) => c.web?.uri)
    .map((c: any) => ({
      title: c.web.title || c.web.uri,
      uri: c.web.uri,
    }));

  return {
    summary: response.text || 'No regulatory summary returned.',
    sources,
  };
}

export async function mapsGroundedFacilitySearch(params: {
  query: string;
  lat?: number;
  lng?: number;
}) {
  const ai = getAiClient();
  const hasCoords = typeof params.lat === 'number' && typeof params.lng === 'number';
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: params.query,
    config: {
      tools: [{ googleMaps: {} }],
      ...(hasCoords
        ? {
            toolConfig: {
              retrievalConfig: {
                latLng: {
                  latitude: params.lat!,
                  longitude: params.lng!,
                },
              },
            },
          }
        : {}),
    },
  });

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const places: { title: string; uri: string; snippet?: string }[] = [];
  for (const chunk of chunks as any[]) {
    if (chunk.maps?.uri) {
      const reviewSnippet = chunk.maps?.placeAnswerSources?.reviewSnippets?.[0]?.content;
      places.push({
        title: chunk.maps.title || 'Google Maps Location',
        uri: chunk.maps.uri,
        snippet: reviewSnippet,
      });
    }
  }

  return {
    answer: response.text || 'No nearby places summary returned.',
    places,
  };
}

export async function identifyDeviceFromImage(params: {
  imageBase64: string;
  mimeType: string;
  notes?: string;
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType,
            data: params.imageBase64,
          },
        },
        {
          text: `Identify the electronic device(s) in this photo for responsible e-waste pickup scheduling. ${
            params.notes ? `User notes: ${params.notes}` : ''
          } Return accurate JSON matching the schema.`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          deviceName: { type: Type.STRING, description: 'Concise name of the electronic device' },
          category: {
            type: Type.STRING,
            description:
              'One of: IT & Telecom, Consumer Electronics, Large Appliances, Small Appliances, Batteries & Power, PCB & Components, Medical & Lab, Solar & Energy',
          },
          estimatedWeightKg: { type: Type.NUMBER, description: 'Estimated weight in kilograms' },
          condition: {
            type: Type.STRING,
            description: 'One of: Working, Partially Working, Refurbishable, Non-working, Damaged / Hazardous',
          },
          hazardousMaterials: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'List of potential hazardous materials present (e.g., Lithium-ion battery, Lead solder)',
          },
          refurbishmentViability: { type: Type.STRING, description: 'Short assessment of refurbishment vs material recovery' },
          safeHandlingTip: { type: Type.STRING, description: 'One actionable safe-handling tip before pickup' },
        },
        required: [
          'deviceName',
          'category',
          'estimatedWeightKg',
          'condition',
          'hazardousMaterials',
          'refurbishmentViability',
          'safeHandlingTip',
        ],
      },
    },
  });

  const raw = (response.text || '{}').trim();
  return JSON.parse(raw);
}

export async function fastDeviceTriage(deviceDescription: string) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: `Classify this e-waste item and provide a 2-sentence safe handling and data-wipe checklist: "${deviceDescription}".`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestedCategory: { type: Type.STRING },
          estimatedWeightKg: { type: Type.NUMBER },
          hazardLevel: { type: Type.STRING },
          checklist: { type: Type.STRING },
        },
        required: ['suggestedCategory', 'estimatedWeightKg', 'hazardLevel', 'checklist'],
      },
    },
  });
  return JSON.parse((response.text || '{}').trim());
}

export async function generateCampaignVisual(params: {
  prompt: string;
  imageSize: '1K' | '2K' | '4K';
  aspectRatio: '1:1' | '16:9' | '4:3' | '3:4' | '9:16';
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [{ text: params.prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: params.aspectRatio,
        imageSize: params.imageSize,
      },
    },
  });

  let imageUrl: string | null = null;
  let caption = '';

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType ?? 'image/png';
      imageUrl = `data:${mime};base64,${part.inlineData.data}`;
    } else if (part.text) {
      caption += part.text;
    }
  }

  if (!imageUrl) {
    throw new Error('The image model completed without returning image bytes.');
  }

  return { imageUrl, caption };
}
