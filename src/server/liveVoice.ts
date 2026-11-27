import type { IncomingMessage, Server as HttpServer } from 'http';
import {
  GoogleGenAI,
  Modality,
  Type,
  type FunctionDeclaration,
  type LiveServerMessage,
} from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';
import { computeEnvironmentalAnalytics, listFacilities } from '../db/queries.ts';
import { formatGeminiError } from './gemini.ts';

const LIVE_VOICE_MODEL = 'gemini-3.8-live';
const ALLOWED_VOICES = new Set(['Zephyr', 'Puck', 'Kore', 'Fenrir', 'Charon']);

function getLiveAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const LIVE_VOICE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'find_collection_centers',
    description:
      'Look up verified Reboot Earth e-waste collection and recycling centers by city or e-waste category, including available capacity and contact details.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        city: {
          type: Type.STRING,
          description: 'Optional city or state name to filter centers (e.g., Bengaluru, Mumbai, Delhi, Pune, Hyderabad).',
        },
        category: {
          type: Type.STRING,
          description: 'Optional e-waste category (e.g., Laptops, Smartphones, Batteries, Appliances, Solar).',
        },
      },
    },
  },
  {
    name: 'get_platform_impact',
    description:
      'Retrieve live Reboot Earth environmental impact metrics including total e-waste mass collected in kg, landfill diversion rate, CO2e avoided, and active recycling hubs.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        metricFocus: {
          type: Type.STRING,
          description: 'Optional focus such as overall, co2, diversion, or facilities.',
        },
      },
    },
  },
  {
    name: 'get_safety_preparation_guide',
    description:
      'Get concise data-wiping and safe handling steps before handing over a specific type of electronic device or battery for pickup.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        deviceType: {
          type: Type.STRING,
          description: 'Type of device such as laptop, smartphone, swollen battery, refrigerator, or server.',
        },
      },
      required: ['deviceType'],
    },
  },
];

async function executeLiveVoiceTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ result: Record<string, unknown>; summary: string }> {
  if (name === 'find_collection_centers') {
    const cityFilter = typeof args.city === 'string' ? args.city.trim().toLowerCase() : '';
    const categoryFilter = typeof args.category === 'string' ? args.category.trim().toLowerCase() : '';
    const allFacilities = await listFacilities();

    const verified = allFacilities.filter((f) => f.verified);
    const matched = verified.filter((f) => {
      const cityOk =
        !cityFilter ||
        f.city.toLowerCase().includes(cityFilter) ||
        f.state.toLowerCase().includes(cityFilter) ||
        f.address.toLowerCase().includes(cityFilter);
      const catOk =
        !categoryFilter ||
        f.acceptedCategories.toLowerCase().includes(categoryFilter) ||
        f.facilityType.toLowerCase().includes(categoryFilter);
      return cityOk && catOk;
    });

    const selected = (matched.length > 0 ? matched : verified).slice(0, 5).map((f) => ({
      name: f.name,
      city: f.city,
      state: f.state,
      address: f.address,
      facilityType: f.facilityType,
      acceptedCategories: f.acceptedCategories,
      availableCapacityKg: Math.max(0, Math.round(f.capacityKg - f.currentLoadKg)),
      contactPhone: f.phone,
      operatingHours: f.operatingHours,
    }));

    return {
      summary:
        matched.length > 0
          ? `Found ${matched.length} verified center${matched.length === 1 ? '' : 's'}${cityFilter ? ` near ${args.city}` : ''}`
          : `Showing ${selected.length} verified Reboot Earth centers`,
      result: {
        exactMatchCount: matched.length,
        centers: selected,
      },
    };
  }

  if (name === 'get_platform_impact') {
    const summary = await computeEnvironmentalAnalytics();
    return {
      summary: `Live impact: ${summary.totalCollectedKg.toLocaleString()} kg collected · ${summary.estimatedCo2AvoidedKg.toLocaleString()} kg CO₂e avoided`,
      result: {
        totalCollectedKg: summary.totalCollectedKg,
        estimatedCo2AvoidedKg: summary.estimatedCo2AvoidedKg,
        landfillDiversionPct: summary.landfillDiversionPct,
        totalPickups: summary.totalPickups,
        completedPickups: summary.completedPickups,
        verifiedFacilities: summary.verifiedFacilities,
        optimizationRunsCount: summary.optimizationRunsCount,
      },
    };
  }

  if (name === 'get_safety_preparation_guide') {
    const device = String(args.deviceType || 'electronic device').toLowerCase();
    const isBattery = device.includes('battery') || device.includes('lithium') || device.includes('swollen') || device.includes('ups');
    const isAppliance = device.includes('fridge') || device.includes('refrigerator') || device.includes('ac') || device.includes('appliance');

    if (isBattery) {
      return {
        summary: 'Prepared lithium & battery safety checklist',
        result: {
          deviceType: device,
          steps: [
            'Do not puncture, crush, bend, or attempt to charge a damaged or swollen battery.',
            'Insulate exposed metal terminals with clear non-conductive tape.',
            'Place the battery inside a cool, dry non-metallic container away from flammable materials.',
            'Flag "Swollen/Damaged Battery" in your Reboot Earth pickup notes so the collector brings a thermal-safe quarantine box.',
          ],
        },
      };
    }

    if (isAppliance) {
      return {
        summary: 'Prepared large appliance recycling checklist',
        result: {
          deviceType: device,
          steps: [
            'Unplug and defrost cooling appliances at least 12 hours before pickup.',
            'Never cut refrigerant lines or dismantle compressors yourself — CFC/HFC gases must be extracted at a CPCB-authorized facility.',
            'Tape loose doors and power cords securely and clear a safe hallway path for the collector team.',
          ],
        },
      };
    }

    return {
      summary: `Prepared data-wipe & handover checklist for ${device}`,
      result: {
        deviceType: device,
        steps: [
          'Back up personal files to cloud or external storage.',
          'Sign out of device locks (Apple Find My, Google FRP, BitLocker, or corporate MDM).',
          'Run a full factory reset or cryptographic wipe, and remove SIM/SD cards.',
          'Keep chargers and cables bundled together so copper and accessories can be recovered.',
        ],
      },
    };
  }

  return {
    summary: `Executed ${name}`,
    result: { error: `Unknown tool: ${name}` },
  };
}

function buildVoiceSystemInstruction(language: string): string {
  const langGuide =
    language === 'hi'
      ? 'Respond naturally in conversational Hindi (Devanagari script in transcripts). Keep replies concise and spoken-friendly.'
      : language === 'hinglish'
        ? 'Respond naturally in friendly conversational Hinglish (Hindi-English mix). Keep replies concise and spoken-friendly.'
        : 'Respond in clear, warm, conversational English. Keep replies concise and spoken-friendly.';

  return [
    'You are EcoBot Voice, the real-time spoken assistant for Reboot Earth — an intelligent e-waste collection, circular recycling, and smart route optimization platform.',
    langGuide,
    'Use your live tools whenever the user asks about collection centers in a city, live platform recycling impact stats, or safe device/battery preparation steps.',
    'Help users with scheduling doorstep e-waste pickups, locating verified CPCB-compliant collection centres, understanding India E-Waste (Management) Rules 2022 & EPR compliance, safe lithium-ion battery handling, data wiping before device recycling, material recovery metrics (copper, aluminum, plastics, precious metals), CO2 savings, and setting monthly recycling targets.',
    'Keep answers crisp (2-4 spoken sentences per turn unless the user asks for step-by-step details) and never invent fake pickup confirmation numbers.',
  ].join(' ');
}

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function attachLiveVoiceWebSocket(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname !== '/api/live-voice') {
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', async (clientWs: WebSocket, request: IncomingMessage) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const requestedVoice = url.searchParams.get('voice') || 'Zephyr';
    const voiceName = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : 'Zephyr';
    const rawLang = url.searchParams.get('lang') || 'en';
    const language = rawLang === 'hi' || rawLang === 'hinglish' ? rawLang : 'en';

    let closed = false;
    let session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    const pendingMessages: string[] = [];

    const closeUpstream = () => {
      if (closed) return;
      closed = true;
      try {
        session?.close();
      } catch {
        // Ignore close errors
      }
      session = null;
    };

    clientWs.on('close', closeUpstream);
    clientWs.on('error', closeUpstream);

    const forwardClientPayload = (raw: string) => {
      if (!session || closed) return;
      try {
        const msg = JSON.parse(raw) as { audio?: string; text?: string };
        if (typeof msg.audio === 'string' && msg.audio.length > 0) {
          session.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (typeof msg.text === 'string' && msg.text.trim().length > 0) {
          session.sendRealtimeInput({
            text: msg.text.trim().slice(0, 1000),
          });
        }
      } catch {
        // Ignore malformed frame
      }
    };

    clientWs.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      if (session) {
        forwardClientPayload(text);
      } else if (pendingMessages.length < 32) {
        pendingMessages.push(text);
      }
    });

    try {
      const ai = getLiveAiClient();
      const connectedSession = await ai.live.connect({
        model: LIVE_VOICE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: LIVE_VOICE_TOOLS }],
          systemInstruction: buildVoiceSystemInstruction(language),
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (closed) return;

            // Handle Live API Function Calls against live Reboot Earth database
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              void (async () => {
                const functionResponses = [];
                for (const call of functionCalls) {
                  const toolName = call.name || 'unknown_tool';
                  safeSend(clientWs, {
                    type: 'toolActivity',
                    tool: toolName,
                    status: 'running',
                    summary:
                      toolName === 'find_collection_centers'
                        ? 'Checking verified Reboot Earth collection centers...'
                        : toolName === 'get_platform_impact'
                          ? 'Fetching live recycling & CO₂ impact stats...'
                          : 'Loading e-waste safety preparation checklist...',
                  });
                  try {
                    const { result, summary } = await executeLiveVoiceTool(
                      toolName,
                      (call.args as Record<string, unknown>) || {}
                    );
                    safeSend(clientWs, {
                      type: 'toolActivity',
                      tool: toolName,
                      status: 'done',
                      summary,
                    });
                    functionResponses.push({
                      id: call.id,
                      name: toolName,
                      response: result,
                    });
                  } catch (toolErr: any) {
                    functionResponses.push({
                      id: call.id,
                      name: toolName,
                      response: { error: toolErr?.message || 'Tool execution failed.' },
                    });
                  }
                }
                if (session && !closed && functionResponses.length > 0) {
                  session.sendToolResponse({ functionResponses });
                }
              })();
            }

            const content = message.serverContent;
            if (!content) return;

            if (content.interrupted) {
              safeSend(clientWs, { type: 'interrupted', interrupted: true });
            }

            if (content.inputTranscription?.text) {
              safeSend(clientWs, {
                type: 'inputTranscript',
                text: content.inputTranscription.text,
              });
            }

            if (content.outputTranscription?.text) {
              safeSend(clientWs, {
                type: 'outputTranscript',
                text: content.outputTranscription.text,
              });
            }

            for (const part of content.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                safeSend(clientWs, {
                  type: 'audio',
                  audio: part.inlineData.data,
                });
              }
            }

            if (content.turnComplete) {
              safeSend(clientWs, { type: 'turnComplete' });
            }
          },
          onerror: (err: any) => {
            const formatted = formatGeminiError(
              err,
              'Gemini Live voice session encountered an upstream error.'
            );
            safeSend(clientWs, { type: 'error', error: formatted.message });
          },
          onclose: () => {
            if (!closed) {
              closed = true;
              safeSend(clientWs, { type: 'closed' });
              try {
                clientWs.close();
              } catch {
                // Ignore
              }
            }
          },
        },
      });

      if (closed) {
        try {
          connectedSession.close();
        } catch {
          // Ignore
        }
        return;
      }

      session = connectedSession;
      safeSend(clientWs, {
        type: 'ready',
        model: LIVE_VOICE_MODEL,
        voice: voiceName,
        language,
      });

      while (pendingMessages.length > 0) {
        const next = pendingMessages.shift();
        if (next) forwardClientPayload(next);
      }
    } catch (error: any) {
      console.error('Gemini Live connect failed:', error);
      const formatted = formatGeminiError(
        error,
        'Unable to start a real-time Gemini Live voice session. Please verify GEMINI_API_KEY in Settings > Secrets.'
      );
      safeSend(clientWs, { type: 'error', error: formatted.message });
      try {
        clientWs.close(1011, formatted.message.slice(0, 120));
      } catch {
        // Ignore
      }
    }
  });
}
