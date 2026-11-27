import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PRIMARY_TEXT_MODEL = 'gemini-4-hydrogen';
const SECONDARY_SEARCH_MODEL = 'gemini-4-neon';
const FALLBACK_TEXT_MODEL = 'gemini-3.1-flash-lite';

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

function extractResponseText(response: any): string {
  const direct = typeof response?.text === 'string' ? response.text.trim() : '';
  if (direct) return direct;

  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const joined = parts
      .filter((p: any) => !p?.thought && typeof p?.text === 'string')
      .map((p: any) => p.text)
      .join('')
      .trim();
    if (joined) return joined;
  }

  return '';
}

function parseErrorInfo(error: any): { code?: number; status?: string; message: string } {
  const rawMessage = typeof error?.message === 'string' ? error.message : String(error || '');
  let code: number | undefined = typeof error?.status === 'number' ? error.status : undefined;
  let status: string | undefined;
  let message = rawMessage;

  if (rawMessage.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage);
      const inner = parsed?.error ?? parsed;
      if (typeof inner?.code === 'number') code = inner.code;
      if (typeof inner?.status === 'string') status = inner.status;
      if (typeof inner?.message === 'string') message = inner.message;
    } catch {
      // keep raw message
    }
  }

  if (!code) {
    if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(rawMessage)) code = 429;
    else if (/\b503\b|UNAVAILABLE|high demand/i.test(rawMessage)) code = 503;
    else if (/\b403\b|PERMISSION_DENIED/i.test(rawMessage)) code = 403;
    else if (/\b400\b|INVALID_ARGUMENT/i.test(rawMessage)) code = 400;
  }

  return { code, status, message };
}

function isRetryableOrFallbackError(error: any): boolean {
  const info = parseErrorInfo(error);
  return (
    info.code === 429 ||
    info.code === 503 ||
    info.code === 500 ||
    info.code === 504 ||
    info.status === 'UNAVAILABLE' ||
    info.status === 'RESOURCE_EXHAUSTED' ||
    /high demand|temporarily unavailable|quota|rate limit|overloaded/i.test(info.message)
  );
}

export function formatGeminiError(error: any, fallbackMessage: string): { status: number; message: string } {
  const info = parseErrorInfo(error);

  if (/GEMINI_API_KEY is not configured/i.test(info.message)) {
    return {
      status: 503,
      message: 'Gemini API key is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (info.code === 429 || info.status === 'RESOURCE_EXHAUSTED') {
    return {
      status: 429,
      message:
        'Gemini API quota or rate limit was reached. Please wait a moment and try again, or configure a billing-enabled API key in Settings > Secrets.',
    };
  }
  if (info.code === 503 || info.status === 'UNAVAILABLE') {
    return {
      status: 503,
      message: 'The Gemini model is temporarily experiencing high demand. Please retry in a few seconds.',
    };
  }
  if (info.code === 403 || info.status === 'PERMISSION_DENIED') {
    return {
      status: 403,
      message: 'Gemini API access was denied for the current key. Please check GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (info.code === 400 || info.status === 'INVALID_ARGUMENT') {
    return {
      status: 400,
      message: info.message || fallbackMessage,
    };
  }

  return {
    status: 502,
    message: info.message || fallbackMessage,
  };
}

function sanitizeChatHistory(history: ChatTurn[]): Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> {
  const cleaned: Array<{ role: 'user' | 'model'; text: string }> = [];

  for (const turn of history.slice(-14)) {
    if (!turn || (turn.role !== 'user' && turn.role !== 'model')) continue;
    const text = typeof turn.text === 'string' ? turn.text.trim() : '';
    if (!text) continue;

    // Gemini multi-turn contents must begin with a user turn.
    if (cleaned.length === 0 && turn.role !== 'user') continue;

    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === turn.role) {
      prev.text = `${prev.text}\n${text}`;
    } else {
      cleaned.push({ role: turn.role, text });
    }
  }

  // Ensure the history does not end on a user turn right before we append the new user prompt.
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].role === 'user') {
    cleaned.pop();
  }

  return cleaned.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));
}

const ECOBOT_SYSTEM_INSTRUCTION = `You are EcoBot, the official intelligent e-waste management and platform assistant for Reboot Earth ("Recycle Technology. Restart Tomorrow.").

Your responsibilities:
1. Guide citizens, organizations, collection centres, recyclers, refurbishers, transporters, producers, and administrators through Reboot Earth features: Pickup Scheduling (with Google Calendar sync), Request Status Tracking, Interactive Facility Locator, Smart Logistics Optimizer (Cost / Distance / Carbon Emissions), Inventory & Material Recovery, Environmental Analytics, and Google Workspace Integrations (Gmail receipts, Calendar events, Drive exports, Chat alerts, Contacts autofill).
2. Answer questions accurately about E-Waste categories (IT & Telecom, Consumer Electronics, Large & Small Appliances, Batteries & Power, PCB & Components, Medical/Solar), safe handling (never puncture lithium-ion batteries, wipe personal data before drop-off, keep broken CRTs/fluorescent lamps sealed), refurbishment vs recycling, and India's E-Waste (Management) Rules, 2022 & Extended Producer Responsibility (EPR) overseen by CPCB.
3. Explicitly distinguish Reboot Earth's operational tracking records from official government CPCB registrations, EPR certificates, or statutory filings. Never claim government approval or fabricate facility licenses.
4. Fluently respond in the user's preferred language: English, Hindi (हिन्दी), or Hinglish (Hindi written in Latin script). Keep responses practical, structured, concise, and helpful.`;

export interface SearchGroundingSource {
  title: string;
  uri: string;
  domain?: string;
}

function extractSearchGrounding(response: any): {
  sources: SearchGroundingSource[];
  webSearchQueries: string[];
} {
  const metadata = response?.candidates?.[0]?.groundingMetadata;
  const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
  const seen = new Set<string>();
  const sources: SearchGroundingSource[] = [];

  for (const chunk of chunks) {
    const uri = typeof chunk?.web?.uri === 'string' ? chunk.web.uri.trim() : '';
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    let domain: string | undefined;
    try {
      domain = new URL(uri).hostname.replace(/^www\./, '');
    } catch {
      domain = undefined;
    }
    sources.push({
      title: (typeof chunk?.web?.title === 'string' && chunk.web.title.trim()) || domain || uri,
      uri,
      domain,
    });
  }

  const rawQueries: unknown[] = Array.isArray(metadata?.webSearchQueries)
    ? metadata.webSearchQueries
    : [];
  const webSearchQueries: string[] = Array.from(
    new Set<string>(
      rawQueries
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim())
    )
  ).slice(0, 6);

  return { sources, webSearchQueries };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  const searchDirective = params.useSearch
    ? 'Live Google Search grounding is enabled. Actively use Google Search to retrieve up-to-date, real-time facts (including current scrap metal and recovered commodity market benchmarks, latest CPCB E-Waste and Battery Rules amendments, recent circular-economy news, and OEM recycling/take-back programs). Present fresh, verifiable figures and note approximate ranges when prices vary by city or grade.'
    : '';

  const systemInstruction = [
    ECOBOT_SYSTEM_INSTRUCTION,
    `Language preference: ${langDirective}`,
    searchDirective,
  ]
    .filter(Boolean)
    .join('\n\n');

  const contents = [
    ...sanitizeChatHistory(params.history),
    {
      role: 'user' as const,
      parts: [{ text: params.message.trim() }],
    },
  ];

  type AttemptSpec = {
    model: string;
    useSearch: boolean;
    thinkingLow?: boolean;
    delayMs?: number;
  };

  const attempts: AttemptSpec[] = params.useSearch
    ? [
        { model: PRIMARY_TEXT_MODEL, useSearch: true },
        { model: PRIMARY_TEXT_MODEL, useSearch: true, delayMs: 900 },
        { model: SECONDARY_SEARCH_MODEL, useSearch: true },
        { model: FALLBACK_TEXT_MODEL, useSearch: true },
        { model: FALLBACK_TEXT_MODEL, useSearch: false },
      ]
    : [
        { model: PRIMARY_TEXT_MODEL, useSearch: false, thinkingLow: true },
        { model: FALLBACK_TEXT_MODEL, useSearch: false },
      ];

  let lastError: any = null;

  for (const attempt of attempts) {
    if (attempt.delayMs) {
      await delay(attempt.delayMs);
    }
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents,
        config: {
          systemInstruction,
          ...(attempt.thinkingLow ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          ...(attempt.useSearch ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });

      const reply = extractResponseText(response);
      if (!reply) {
        lastError = new Error(`Model ${attempt.model} returned an empty response.`);
        continue;
      }

      const { sources, webSearchQueries } = extractSearchGrounding(response);

      return {
        reply,
        sources,
        webSearchQueries,
        grounded: Boolean(attempt.useSearch && (sources.length > 0 || webSearchQueries.length > 0)),
        model: attempt.model,
        searchFallback: Boolean(params.useSearch && !attempt.useSearch),
      };
    } catch (err: any) {
      const info = parseErrorInfo(err);
      console.warn(`[gemini] chatWithEcoBot (${attempt.model}, search=${attempt.useSearch}) failed:`, info.code, info.status, info.message.slice(0, 160));
      lastError = err;
      if (!isRetryableOrFallbackError(err)) {
        throw err;
      }
    }
  }

  throw lastError || new Error('EcoBot did not receive a text response from the Gemini service.');
}

export async function searchEWasteRegulations(query: string) {
  const ai = getAiClient();
  const prompt = `Use live Google Search to provide an accurate, up-to-date summary answering this India & global e-waste regulations question: ${query}. Include recent policy updates, dates, and figures where available, and clearly distinguish operational software guidance from official CPCB statutory portals.`;

  const attempts = [
    { model: PRIMARY_TEXT_MODEL },
    { model: PRIMARY_TEXT_MODEL, delayMs: 900 },
    { model: SECONDARY_SEARCH_MODEL },
    { model: FALLBACK_TEXT_MODEL },
  ];

  let lastError: any = null;
  for (const attempt of attempts) {
    if (attempt.delayMs) {
      await delay(attempt.delayMs);
    }
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const summary = extractResponseText(response);
      if (!summary) {
        lastError = new Error(`Model ${attempt.model} returned an empty regulatory summary.`);
        continue;
      }

      const { sources, webSearchQueries } = extractSearchGrounding(response);

      return {
        summary,
        answer: summary,
        sources,
        webSearchQueries,
        grounded: sources.length > 0 || webSearchQueries.length > 0,
        model: attempt.model,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      const info = parseErrorInfo(err);
      console.warn(`[gemini] searchEWasteRegulations (${attempt.model}) failed:`, info.code, info.status, info.message.slice(0, 160));
      lastError = err;
      if (!isRetryableOrFallbackError(err)) throw err;
    }
  }

  throw lastError || new Error('Unable to fetch search-grounded regulatory summary.');
}

export async function queryLiveSearchIntel(params: {
  query: string;
  topic?: 'metals' | 'regulations' | 'news' | 'programs' | 'custom';
  region?: string;
}) {
  const ai = getAiClient();
  const region = (params.region || 'India').trim().slice(0, 60);
  const topicContext: Record<string, string> = {
    metals: `Focus on current real-time market benchmark prices and trends for recovered e-waste metals (copper, aluminum, gold, silver, PCB scrap) in ${region} and global markets. Include currency units and dates.`,
    regulations: `Focus on the latest official CPCB notifications, India E-Waste (Management) Rules amendments, Battery Waste Management Rules, and EPR compliance deadlines in ${region}. Distinguish guidance from official statutory portals.`,
    news: `Focus on the latest verified news, statistics, urban mining innovations, and circular electronics sustainability reports relevant to ${region} and global e-waste management.`,
    programs: `Focus on active electronics manufacturer (OEM) take-back, trade-in, and authorized e-waste recycling programs currently available in ${region}.`,
    custom: `Provide an accurate, up-to-date, well-structured answer grounded in live Google Search data relevant to ${region} and circular e-waste sustainability.`,
  };

  const directive = topicContext[params.topic || 'custom'] || topicContext.custom;
  const prompt = `${directive}\n\nUser query: ${params.query.trim()}\n\nUse concise headings or bullet points and cite concrete dates/figures from current web results.`;

  const attempts = [
    { model: PRIMARY_TEXT_MODEL },
    { model: PRIMARY_TEXT_MODEL, delayMs: 900 },
    { model: SECONDARY_SEARCH_MODEL },
    { model: FALLBACK_TEXT_MODEL },
  ];

  let lastError: any = null;
  for (const attempt of attempts) {
    if (attempt.delayMs) {
      await delay(attempt.delayMs);
    }
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const answer = extractResponseText(response);
      if (!answer) {
        lastError = new Error(`Model ${attempt.model} returned an empty search-grounded response.`);
        continue;
      }

      const { sources, webSearchQueries } = extractSearchGrounding(response);

      return {
        answer,
        sources,
        webSearchQueries,
        grounded: sources.length > 0 || webSearchQueries.length > 0,
        model: attempt.model,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      const info = parseErrorInfo(err);
      console.warn(`[gemini] queryLiveSearchIntel (${attempt.model}) failed:`, info.code, info.status, info.message.slice(0, 160));
      lastError = err;
      if (!isRetryableOrFallbackError(err)) throw err;
    }
  }

  throw lastError || new Error('Unable to retrieve real-time Google Search grounded data.');
}

function parseJsonResponse<T>(response: any, fallback: T): T {
  const raw = extractResponseText(response);
  if (!raw) return fallback;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

export async function mapsGroundedFacilitySearch(params: {
  query: string;
  lat?: number;
  lng?: number;
}) {
  const ai = getAiClient();
  const hasCoords = typeof params.lat === 'number' && typeof params.lng === 'number';
  const toolConfig = hasCoords
    ? {
        retrievalConfig: {
          latLng: {
            latitude: params.lat!,
            longitude: params.lng!,
          },
        },
      }
    : undefined;

  const coordHint = hasCoords
    ? ` (near coordinates ${params.lat!.toFixed(4)}, ${params.lng!.toFixed(4)})`
    : '';

  const attempts: Array<{
    model: string;
    tool: 'maps' | 'search' | 'none';
    thinkingLow?: boolean;
  }> = [
    { model: 'gemini-2.5-flash', tool: 'maps' },
    { model: PRIMARY_TEXT_MODEL, tool: 'maps', thinkingLow: true },
    { model: PRIMARY_TEXT_MODEL, tool: 'search', thinkingLow: true },
    { model: FALLBACK_TEXT_MODEL, tool: 'search' },
    { model: FALLBACK_TEXT_MODEL, tool: 'none' },
  ];

  let lastError: any = null;
  for (const attempt of attempts) {
    try {
      const promptText =
        attempt.tool === 'maps'
          ? params.query
          : `Find authorized or notable e-waste collection centres and recycling drop-off facilities for this query: ${params.query}${coordHint}. List specific facility names, localities, and practical drop-off advice.`;

      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: promptText,
        config: {
          ...(attempt.tool === 'maps' ? { tools: [{ googleMaps: {} }] } : {}),
          ...(attempt.tool === 'search' ? { tools: [{ googleSearch: {} }] } : {}),
          ...(attempt.thinkingLow ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          ...(attempt.tool === 'maps' && toolConfig ? { toolConfig } : {}),
        },
      });

      const answer = extractResponseText(response);
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
        } else if (chunk.web?.uri) {
          places.push({
            title: chunk.web.title || chunk.web.uri,
            uri: chunk.web.uri,
          });
        }
      }

      if (!answer && places.length === 0) {
        lastError = new Error(`Model ${attempt.model} returned an empty Maps grounding result.`);
        continue;
      }

      const finalAnswer = answer || 'Nearby e-waste locations found via Google Maps.';
      return {
        answer: finalAnswer,
        summary: finalAnswer,
        places,
      };
    } catch (err: any) {
      lastError = err;
      const info = parseErrorInfo(err);
      // Also fall back if googleMaps tool is unsupported on a specific model (400 / 404)
      if (!isRetryableOrFallbackError(err) && info.code !== 400 && info.code !== 404) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Unable to query Google Maps grounding.');
}

export async function identifyDeviceFromImage(params: {
  imageBase64: string;
  mimeType: string;
  notes?: string;
}) {
  const ai = getAiClient();
  const models = [PRIMARY_TEXT_MODEL, FALLBACK_TEXT_MODEL];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
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

      const parsed = parseJsonResponse<any>(response, {});
      const hazardousMaterials = Array.isArray(parsed.hazardousMaterials)
        ? parsed.hazardousMaterials
        : Array.isArray(parsed.hazards)
          ? parsed.hazards
          : [];

      return {
        ...parsed,
        hazardousMaterials,
        hazards: hazardousMaterials,
      };
    } catch (err: any) {
      lastError = err;
      if (!isRetryableOrFallbackError(err)) throw err;
    }
  }

  throw lastError || new Error('Unable to analyze device image.');
}

export async function fastDeviceTriage(deviceDescription: string) {
  const ai = getAiClient();
  const models = [FALLBACK_TEXT_MODEL, PRIMARY_TEXT_MODEL];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `Classify this e-waste item into one of [IT & Telecom, Consumer Electronics, Large Appliances, Small Appliances, Batteries & Power, PCB & Components, Medical & Lab, Solar & Energy] and provide a concise 2-sentence safe handling and data-wipe checklist: "${deviceDescription}".`,
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

      const parsed = parseJsonResponse<any>(response, {});
      const category = parsed.suggestedCategory || parsed.category || 'IT & Telecom';
      const hazardLevel = parsed.hazardLevel || parsed.priority || 'Standard';
      const checklist = parsed.checklist || parsed.note || 'Back up and wipe personal data, and keep batteries insulated before pickup.';

      return {
        suggestedCategory: category,
        category,
        estimatedWeightKg: Number(parsed.estimatedWeightKg) || 2.5,
        hazardLevel,
        priority: hazardLevel,
        checklist,
        note: checklist,
      };
    } catch (err: any) {
      lastError = err;
      if (!isRetryableOrFallbackError(err)) throw err;
    }
  }

  throw lastError || new Error('Unable to run fast device triage.');
}

export async function generateCampaignVisual(params: {
  prompt: string;
  imageSize: '1K' | '2K' | '4K';
  aspectRatio: '1:1' | '16:9' | '4:3' | '3:4' | '9:16';
}) {
  const ai = getAiClient();
  const attempts = [
    { model: 'gemini-3-pro-image-preview', withImageSize: true },
    { model: 'gemini-3.1-flash-image-preview', withImageSize: true },
    { model: 'gemini-2.5-flash-image', withImageSize: false },
  ];

  let lastError: any = null;
  for (const attempt of attempts) {
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: {
          parts: [{ text: params.prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: params.aspectRatio,
            ...(attempt.withImageSize ? { imageSize: params.imageSize } : {}),
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

      if (imageUrl) {
        return { imageUrl, dataUrl: imageUrl, caption };
      }

      lastError = new Error('The image model completed without returning image bytes.');
    } catch (err: any) {
      lastError = err;
      const info = parseErrorInfo(err);
      if (!isRetryableOrFallbackError(err) && info.code !== 403 && info.code !== 404) {
        throw err;
      }
    }
  }

  throw lastError || new Error('The image model completed without returning image bytes.');
}

const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

export async function transcribeAudio(params: {
  audioBase64: string;
  mimeType: string;
  language?: string;
}) {
  const ai = getAiClient();
  const base64Clean = params.audioBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!base64Clean) {
    throw new Error('Audio recording data is empty.');
  }

  const langHint =
    params.language === 'hi'
      ? 'The speaker may be speaking Hindi (transcribe accurately in Devanagari script).'
      : params.language === 'hinglish'
        ? 'The speaker may be speaking Hinglish (Hindi/English mix in Latin script).'
        : 'Transcribe accurately in the spoken language.';

  const audioPart = {
    inlineData: {
      mimeType: params.mimeType,
      data: base64Clean,
    },
  };

  const attempts = [
    { model: TRANSCRIBE_MODEL },
    { model: TRANSCRIBE_MODEL, delayMs: 800 },
  ];

  let lastError: any = null;
  for (const attempt of attempts) {
    if (attempt.delayMs) {
      await delay(attempt.delayMs);
    }
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: {
          parts: [
            audioPart,
            {
              text: `Transcribe this audio verbatim with clean punctuation. Return only the transcribed text with no preamble or commentary. ${langHint}`,
            },
          ],
        },
      });

      const transcript = extractResponseText(response);
      if (!transcript) {
        lastError = new Error('No speech was detected in the audio recording.');
        continue;
      }

      return {
        transcript,
        model: attempt.model,
      };
    } catch (err: any) {
      const info = parseErrorInfo(err);
      console.warn(
        `[gemini] transcribeAudio (${attempt.model}) failed:`,
        info.code,
        info.status,
        info.message.slice(0, 160)
      );
      lastError = err;
      if (!isRetryableOrFallbackError(err)) throw err;
    }
  }

  throw lastError || new Error('Unable to transcribe audio right now.');
}
