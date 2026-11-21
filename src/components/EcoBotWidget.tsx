import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { saveEcoBotSession } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import type { EcoChatMessage } from '../types';

interface LocalChatMessage extends EcoChatMessage {
  searchFallback?: boolean;
}

const SUGGESTED_QUESTIONS: Record<'en' | 'hi' | 'hinglish', string[]> = {
  en: [
    'How do I schedule an e-waste pickup?',
    'How does Smart Route Optimization lower CO₂?',
    'What are India E-Waste Rules 2022 for EPR?',
    'How should I safely pack swollen lithium batteries?',
  ],
  hi: [
    'मैं ई-कचरा पिकअप कैसे शेड्यूल करूँ?',
    'भारत के ई-वेस्ट नियम 2022 क्या हैं?',
    'पुरानी लिथियम बैटरी को सुरक्षित कैसे रखें?',
  ],
  hinglish: [
    'Laptop recycle karne se pehle data kaise wipe karun?',
    'Smart Optimizer cost aur emissions kaise kam karta hai?',
    'CPCB EPR rules 2022 mein producers ki kya responsibility hai?',
  ],
};

function renderInlineBold(text: string): React.ReactNode {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);
  return segments.map((seg, idx) => {
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
      return (
        <strong key={idx} className="font-semibold">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{seg}</React.Fragment>;
  });
}

function renderFormattedText(text: string): React.ReactNode {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1" />;
        if (/^(\*\*\*|---)$/.test(line)) {
          return <hr key={idx} className="my-1.5 border-slate-200 dark:border-emerald-800/60" />;
        }
        const headingMatch = line.match(/^#{1,4}\s+(.*)$/);
        if (headingMatch) {
          return (
            <p key={idx} className="font-semibold text-slate-900 dark:text-emerald-100 pt-1">
              {renderInlineBold(headingMatch[1])}
            </p>
          );
        }
        const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>{renderInlineBold(bulletMatch[1])}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}

export const EcoBotWidget: React.FC = () => {
  const { firebaseUser, language, setLanguage } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [useSearch, setUseSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [sessionId] = useState(() => `ecobot_${Date.now()}`);
  const [messages, setMessages] = useState<LocalChatMessage[]>([
    {
      role: 'model',
      text: 'Hello! I am EcoBot, your Reboot Earth assistant. Ask me about pickup scheduling, e-waste categories, safe battery handling, Smart Route Optimization, or India E-Waste (Management) Rules 2022 — in English, हिन्दी, or Hinglish.',
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, loading, error]);

  const sendMessage = async (textOverride?: string, isRetry = false) => {
    const content = (textOverride ?? input).trim();
    if (!content || loading) return;

    const baseMessages =
      isRetry && messages[messages.length - 1]?.role === 'user'
        ? messages.slice(0, -1)
        : messages;

    const userMsg: LocalChatMessage = { role: 'user', text: content };
    const nextHistory = [...baseMessages, userMsg];
    setMessages(nextHistory);
    if (!isRetry) setInput('');
    setLoading(true);
    setError(null);
    setLastFailedPrompt(null);

    const apiHistory = baseMessages
      .slice(1)
      .filter((m) => m.text.trim().length > 0)
      .map((m) => ({ role: m.role, text: m.text.trim() }));

    try {
      const res = await apiFetch<{
        reply?: string;
        sources?: { title: string; uri: string }[];
        searchFallback?: boolean;
      }>(
        '/api/ai/chat',
        {
          method: 'POST',
          body: JSON.stringify({
            message: content,
            history: apiHistory,
            language,
            useSearch,
          }),
        },
        false
      );

      const replyText = typeof res?.reply === 'string' ? res.reply.trim() : '';
      if (!replyText) {
        throw new Error('EcoBot returned an empty response. Please try again.');
      }

      const botMsg: LocalChatMessage = {
        role: 'model',
        text: replyText,
        sources: Array.isArray(res.sources) ? res.sources : undefined,
        searchFallback: Boolean(res.searchFallback),
      };
      const updated = [...nextHistory, botMsg];
      setMessages(updated);

      if (firebaseUser) {
        void saveEcoBotSession(
          firebaseUser.uid,
          sessionId,
          language,
          updated.map(({ searchFallback: _sf, ...rest }) => rest)
        ).catch(() => {});
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to reach EcoBot right now. Please try again.');
      setLastFailedPrompt(content);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (idx: number, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  const handleFeedback = (idx: number, vote: 'up' | 'down') => {
    setMessages((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, feedback: vote } : m))
    );
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'model',
        text: 'Conversation cleared. How can I help you recycle electronics responsibly today?',
      },
    ]);
    setError(null);
    setLastFailedPrompt(null);
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 w-[360px] sm:w-[410px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[80vh] rounded-2xl border border-slate-200 dark:border-emerald-800/80 bg-white dark:bg-[#071A14] shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#0A221A] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-emerald-50 truncate">
                  EcoBot Assistant
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-emerald-200/70 truncate">
                  E-Waste Guidance &amp; Search Grounding
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearChat}
                title="Clear conversation"
                className="p-1.5 rounded-lg text-slate-500 dark:text-emerald-200/70 hover:bg-slate-200/60 dark:hover:bg-emerald-900/50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close EcoBot"
                className="p-1.5 rounded-lg text-slate-500 dark:text-emerald-200/70 hover:bg-slate-200/60 dark:hover:bg-emerald-900/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Language & Search Grounding Bar */}
          <div className="px-3.5 py-2 border-b border-slate-200 dark:border-emerald-900/50 flex items-center justify-between gap-2 text-xs bg-white dark:bg-[#061611]">
            <div className="flex items-center gap-1">
              {(['en', 'hi', 'hinglish'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  className={`px-2 py-1 rounded-md font-medium transition-colors ${
                    language === lang
                      ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950'
                      : 'text-slate-600 dark:text-emerald-200/70 hover:bg-slate-100 dark:hover:bg-emerald-900/40'
                  }`}
                >
                  {lang === 'en' ? 'EN' : lang === 'hi' ? 'हिन्दी' : 'Hinglish'}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-emerald-200/80 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useSearch}
                onChange={(e) => setUseSearch(e.target.checked)}
                className="accent-emerald-500 rounded"
              />
              <Globe className="w-3.5 h-3.5 text-emerald-500" />
              <span>Web Grounding</span>
            </label>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {messages.map((msg, idx) => {
              if (!msg.text?.trim()) return null;
              return (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                      msg.role === 'user'
                        ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 font-medium'
                        : 'bg-slate-100 dark:bg-[#0C251C] text-slate-800 dark:text-emerald-50 border border-slate-200 dark:border-emerald-900/60'
                    }`}
                  >
                    {renderFormattedText(msg.text)}
                    {msg.searchFallback && (
                      <p className="mt-2 pt-1.5 border-t border-slate-200 dark:border-emerald-800/60 text-[11px] text-slate-500 dark:text-emerald-300/70">
                        Live web search grounding was temporarily unavailable; answered from EcoBot knowledge.
                      </p>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-emerald-800/60 space-y-1">
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-emerald-300/80">
                          Grounded Web Sources
                        </p>
                        {msg.sources.slice(0, 3).map((src, sIdx) => (
                          <a
                            key={sIdx}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 hover:underline truncate"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{src.title}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {msg.role === 'model' && idx > 0 && (
                    <div className="mt-1 flex items-center gap-2 text-slate-400 dark:text-emerald-200/50">
                      <button
                        type="button"
                        onClick={() => handleCopy(idx, msg.text)}
                        className="hover:text-emerald-500 inline-flex items-center gap-1 text-[11px]"
                      >
                        {copiedIdx === idx ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        {copiedIdx === idx ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(idx, 'up')}
                        aria-label="Helpful response"
                        className={`hover:text-emerald-500 ${msg.feedback === 'up' ? 'text-emerald-500' : ''}`}
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(idx, 'down')}
                        aria-label="Needs improvement"
                        className={`hover:text-amber-500 ${msg.feedback === 'down' ? 'text-amber-500' : ''}`}
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#0C251C] text-xs text-slate-600 dark:text-emerald-200">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                EcoBot is researching your question...
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 space-y-2">
                <p>{error}</p>
                {lastFailedPrompt && (
                  <button
                    type="button"
                    onClick={() => void sendMessage(lastFailedPrompt, true)}
                    disabled={loading}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-100 hover:bg-red-200 dark:hover:bg-red-900 font-medium transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Suggested Prompts */}
          <div className="px-3.5 py-2 border-t border-slate-200 dark:border-emerald-900/50 flex gap-1.5 overflow-x-auto bg-slate-50/70 dark:bg-[#061611]">
            {SUGGESTED_QUESTIONS[language].map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void sendMessage(q)}
                disabled={loading}
                className="px-2.5 py-1 rounded-md text-[11px] bg-white dark:bg-[#0C251C] border border-slate-200 dark:border-emerald-800/70 text-slate-700 dark:text-emerald-100 hover:border-emerald-500 disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="p-3 border-t border-slate-200 dark:border-emerald-900/70 bg-white dark:bg-[#071A14] flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask EcoBot anything about e-waste..."
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900 bg-slate-50 dark:bg-[#04100C] text-slate-900 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="px-3.5 py-2 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-12 px-4 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 shadow-lg hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-colors inline-flex items-center gap-2 font-semibold text-sm"
      >
        {open ? <X className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
        <span>{open ? 'Close EcoBot' : 'Ask EcoBot'}</span>
      </button>
    </div>
  );
};
