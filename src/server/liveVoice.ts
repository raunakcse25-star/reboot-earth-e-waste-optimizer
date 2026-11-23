import type { IncomingMessage } from 'http';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';
import type { Server as HttpServer } from 'http';
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
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
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
          systemInstruction: buildVoiceSystemInstruction(language),
        },
        callbacks: {
          onopen: () => {
            safeSend(clientWs, {
              type: 'ready',
              model: LIVE_VOICE_MODEL,
              voice: voiceName,
              language,
            });
          },
          onmessage: (message: LiveServerMessage) => {
            if (closed) return;
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
