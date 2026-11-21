import React, { useState } from 'react';
import {
  CloudUpload,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import {
  CHAT_CONSOLE_CONFIG_URL,
  listGoogleChatSpaces,
  listGoogleContacts,
  listRecentGmailMessages,
  saveFileToGoogleDrive,
  sendGmailMessage,
  sendGoogleChatMessage,
  type ChatSpace,
  type GmailSummary,
  type GoogleContact,
} from '../lib/workspace';
import { ConfirmDialog } from './ConfirmDialog';
import type { AnalyticsSummary } from '../types';

export const WorkspaceAndStudio: React.FC<{ analytics: AnalyticsSummary | null }> = ({
  analytics,
}) => {
  const { workspaceToken, firebaseUser, signInWithGoogle } = useAuth();
  const [activeTab, setActiveTab] = useState<'gmail' | 'drive' | 'chat' | 'contacts' | 'studio'>('gmail');

  // Gmail state
  const [emails, setEmails] = useState<GmailSummary[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailTo, setGmailTo] = useState(firebaseUser?.email || '');
  const [gmailSubject, setGmailSubject] = useState('Reboot Earth — Environmental Recycling Update');
  const [gmailBody, setGmailBody] = useState(
    'Hello,\n\nAttached is our latest e-waste collection and material recovery summary from Reboot Earth.\n\nRegards,\nReboot Earth Sustainability Team'
  );

  // Drive state
  const [driveResult, setDriveResult] = useState<{ name: string; link?: string } | null>(null);

  // Chat state
  const [chatSpaces, setChatSpaces] = useState<ChatSpace[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState('');
  const [chatMessage, setChatMessage] = useState(
    'Reboot Earth Dispatch Alert: Route optimization batch is ready for collection review.'
  );

  // Contacts state
  const [contacts, setContacts] = useState<GoogleContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Shared workspace status & confirmation
  const [wsError, setWsError] = useState<string | null>(null);
  const [wsSuccess, setWsSuccess] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<null | {
    title: string;
    description: string;
    confirmLabel: string;
    run: () => Promise<void>;
  }>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // AI Campaign Studio state
  const [studioPrompt, setStudioPrompt] = useState(
    'Clean editorial poster for an urban electronic waste recycling drive, emerald leaves emerging from recycled circuit board copper traces, minimalist modern design, no text'
  );
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '1:1' | '4:3' | '3:4' | '9:16'>('16:9');
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const runConfirmedAction = async () => {
    if (!pendingAction) return;
    setActionBusy(true);
    setWsError(null);
    setWsSuccess(null);
    try {
      await pendingAction.run();
    } catch (err: any) {
      setWsError(err?.message || 'Workspace action failed.');
    } finally {
      setActionBusy(false);
      setPendingAction(null);
    }
  };

  const handleLoadGmail = async () => {
    if (!workspaceToken) return;
    setGmailLoading(true);
    setWsError(null);
    try {
      const list = await listRecentGmailMessages(workspaceToken);
      setEmails(list);
    } catch (err: any) {
      setWsError(err?.message || 'Unable to load Gmail messages.');
    } finally {
      setGmailLoading(false);
    }
  };

  const handleLoadSpaces = async () => {
    if (!workspaceToken) return;
    setChatLoading(true);
    setWsError(null);
    try {
      const spaces = await listGoogleChatSpaces(workspaceToken);
      setChatSpaces(spaces);
      if (spaces.length > 0 && !selectedSpace) setSelectedSpace(spaces[0].name);
    } catch (err: any) {
      setWsError(err?.message || 'Unable to fetch Google Chat spaces.');
    } finally {
      setChatLoading(false);
    }
  };

  const handleLoadContacts = async () => {
    if (!workspaceToken) return;
    setContactsLoading(true);
    setWsError(null);
    try {
      const list = await listGoogleContacts(workspaceToken);
      setContacts(list);
    } catch (err: any) {
      setWsError(err?.message || 'Unable to load Google Contacts.');
    } finally {
      setContactsLoading(false);
    }
  };

  const handleGenerateVisual = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudioLoading(true);
    setStudioError(null);
    try {
      const res = await apiFetch<{ dataUrl: string }>(
        '/api/ai/generate-image',
        {
          method: 'POST',
          body: JSON.stringify({ prompt: studioPrompt, imageSize, aspectRatio }),
        },
        false
      );
      setGeneratedImage(res.dataUrl);
    } catch (err: any) {
      setStudioError(err?.message || 'Unable to generate campaign visual.');
    } finally {
      setStudioLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-emerald-50">
            Google Workspace Hub &amp; AI Campaign Studio
          </h3>
          <p className="text-xs text-slate-600 dark:text-emerald-200/70">
            Send recycling records via Gmail, archive ESG reports to Google Drive, notify ops in Google Chat, or create awareness visuals.
          </p>
        </div>

        <div className="inline-flex flex-wrap rounded-lg border border-slate-200 dark:border-emerald-900/70 p-1 bg-slate-50 dark:bg-[#05140F] gap-1">
          {(
            [
              { id: 'gmail', label: 'Gmail', icon: Mail },
              { id: 'drive', label: 'Drive', icon: CloudUpload },
              { id: 'chat', label: 'Chat', icon: MessageSquare },
              { id: 'contacts', label: 'Contacts', icon: Users },
              { id: 'studio', label: 'AI Visual Studio', icon: Sparkles },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTab(t.id);
                  setWsError(null);
                  setWsSuccess(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                  activeTab === t.id
                    ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950'
                    : 'text-slate-600 dark:text-emerald-200/75 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {!workspaceToken && activeTab !== 'studio' && (
        <div className="p-5 rounded-xl border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Connect Google Workspace Session
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200/80 mt-0.5">
              Workspace access tokens are kept strictly in memory for security. Re-authorize with Google to enable Gmail, Drive, Chat, and Contacts actions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap self-start sm:self-auto"
          >
            Authorize Workspace
          </button>
        </div>
      )}

      {wsError && (
        <div className="p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300 space-y-2">
          <p>{wsError}</p>
          {wsError.includes('chat.googleapis.com') && (
            <a
              href={CHAT_CONSOLE_CONFIG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline font-semibold"
            >
              Open Google Chat App Configuration in Cloud Console
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {wsSuccess && (
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-xs text-emerald-800 dark:text-emerald-200">
          {wsSuccess}
        </div>
      )}

      {/* Gmail Tab */}
      {activeTab === 'gmail' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 p-5 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
                Recent E-Waste &amp; Recycling Emails
              </h4>
              <button
                type="button"
                disabled={!workspaceToken || gmailLoading}
                onClick={() => void handleLoadGmail()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-200 disabled:opacity-50"
              >
                {gmailLoading ? 'Loading...' : 'Fetch Inbox'}
              </button>
            </div>
            {emails.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-emerald-200/65">
                Click &ldquo;Fetch Inbox&rdquo; to read recent recycling confirmations from your Gmail account.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-emerald-900/50">
                {emails.map((m) => (
                  <div key={m.id} className="py-3 space-y-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-emerald-50">{m.subject}</p>
                    <p className="text-[11px] text-slate-500 dark:text-emerald-200/65">{m.from} · {m.date}</p>
                    <p className="text-xs text-slate-600 dark:text-emerald-100/80 line-clamp-2">{m.snippet}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-6 p-5 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-3">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
              Send Recycling Dispatch or Receipt Email
            </h4>
            <input
              type="email"
              value={gmailTo}
              onChange={(e) => setGmailTo(e.target.value)}
              placeholder="Recipient email address"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
            />
            <input
              type="text"
              value={gmailSubject}
              onChange={(e) => setGmailSubject(e.target.value)}
              placeholder="Subject"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
            />
            <textarea
              rows={5}
              value={gmailBody}
              onChange={(e) => setGmailBody(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
            />
            <button
              type="button"
              disabled={!workspaceToken || !gmailTo.trim()}
              onClick={() =>
                setPendingAction({
                  title: 'Confirm Gmail Dispatch',
                  description: `Send email to ${gmailTo}\nSubject: ${gmailSubject}\n\nYour Google Workspace Gmail account will be used to deliver this message.`,
                  confirmLabel: 'Send Gmail Message',
                  run: async () => {
                    await sendGmailMessage(workspaceToken!, {
                      to: gmailTo.trim(),
                      subject: gmailSubject.trim(),
                      body: gmailBody,
                    });
                    setWsSuccess(`Email successfully sent to ${gmailTo.trim()}.`);
                  },
                })
              }
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Review &amp; Send via Gmail
            </button>
          </div>
        </div>
      )}

      {/* Drive Tab */}
      {activeTab === 'drive' && (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-4">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
            Archive Environmental Impact Summary to Google Drive
          </h4>
          <p className="text-xs text-slate-600 dark:text-emerald-200/75 max-w-2xl">
            Exports your live database environmental metrics (collected mass, material recovery breakdown, landfill diversion, and transparent CO₂e conversion methodology) directly into your Google Drive using scoped <span className="font-mono">drive.file</span> permissions.
          </p>
          <button
            type="button"
            disabled={!workspaceToken || !analytics}
            onClick={() =>
              setPendingAction({
                title: 'Upload Impact Report to Google Drive',
                description:
                  'Create "RebootEarth_Impact_Report.json" in your Google Drive containing live platform recycling analytics?',
                confirmLabel: 'Upload Report',
                run: async () => {
                  const uploaded = await saveFileToGoogleDrive(workspaceToken!, {
                    fileName: `RebootEarth_Impact_Report_${new Date().toISOString().slice(0, 10)}.json`,
                    content: JSON.stringify(analytics, null, 2),
                    mimeType: 'application/json',
                  });
                  setDriveResult({ name: uploaded.name, link: uploaded.webViewLink });
                  setWsSuccess(`Uploaded ${uploaded.name} to Google Drive.`);
                },
              })
            }
            className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <CloudUpload className="w-4 h-4" />
            Save Impact Report to Google Drive
          </button>

          {driveResult?.link && (
            <div>
              <a
                href={driveResult.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 underline inline-flex items-center gap-1"
              >
                Open {driveResult.name} in Google Drive
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
                Operations Dispatch via Google Chat
              </h4>
              <p className="text-xs text-slate-500 dark:text-emerald-200/70">
                Requires a Google Workspace Business/Enterprise account with the Chat app configured in Cloud Console.
              </p>
            </div>
            <button
              type="button"
              disabled={!workspaceToken || chatLoading}
              onClick={() => void handleLoadSpaces()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-200 disabled:opacity-50"
            >
              {chatLoading ? 'Loading Spaces...' : 'Load Chat Spaces'}
            </button>
          </div>

          {chatSpaces.length > 0 && (
            <div className="space-y-3">
              <select
                value={selectedSpace}
                onChange={(e) => setSelectedSpace(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              >
                {chatSpaces.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.displayName} ({s.spaceType || 'SPACE'})
                  </option>
                ))}
              </select>
              <textarea
                rows={3}
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
              />
              <button
                type="button"
                disabled={!selectedSpace || !chatMessage.trim()}
                onClick={() =>
                  setPendingAction({
                    title: 'Post Message to Google Chat Space',
                    description: `Post the following dispatch alert to ${selectedSpace}?\n\n"${chatMessage}"`,
                    confirmLabel: 'Post to Google Chat',
                    run: async () => {
                      await sendGoogleChatMessage(workspaceToken!, selectedSpace, chatMessage);
                      setWsSuccess('Dispatch alert posted to Google Chat.');
                    },
                  })
                }
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Send Dispatch Alert
              </button>
            </div>
          )}
        </div>
      )}

      {/* Contacts Tab */}
      {activeTab === 'contacts' && (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
              Google Contacts Directory
            </h4>
            <button
              type="button"
              disabled={!workspaceToken || contactsLoading}
              onClick={() => void handleLoadContacts()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-200 disabled:opacity-50"
            >
              {contactsLoading ? 'Loading...' : 'Load Contacts'}
            </button>
          </div>
          {contacts.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-emerald-200/65">
              Load your Google Contacts to quickly autofill pickup coordinators or facility contacts.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {contacts.map((c) => (
                <div
                  key={c.resourceName}
                  className="p-3 rounded-lg border border-slate-200 dark:border-emerald-900/60 bg-slate-50 dark:bg-[#05140F]"
                >
                  <p className="text-xs font-semibold text-slate-900 dark:text-emerald-50">{c.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-emerald-200/65">{c.email || '—'}</p>
                  <p className="text-[11px] font-mono text-slate-600 dark:text-emerald-300/80">{c.phone || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Campaign Visual Studio Tab */}
      {activeTab === 'studio' && (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#081D16] space-y-5">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-emerald-50 inline-flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-emerald-500" />
              Eco-Campaign Visual Generator (Gemini Pro Image)
            </h4>
            <p className="text-xs text-slate-600 dark:text-emerald-200/70 mt-1">
              Create custom high-resolution awareness posters for campus, residential, or corporate e-waste drives with 1K, 2K, or 4K output.
            </p>
          </div>

          <form onSubmit={handleGenerateVisual} className="space-y-4">
            <textarea
              rows={3}
              required
              value={studioPrompt}
              onChange={(e) => setStudioPrompt(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
            />

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 dark:text-emerald-200/70">Resolution:</span>
                  {(['1K', '2K', '4K'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setImageSize(sz)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-semibold border ${
                        imageSize === sz
                          ? 'border-emerald-500 bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950'
                          : 'border-slate-300 dark:border-emerald-800 text-slate-600 dark:text-emerald-200/75'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 dark:text-emerald-200/70">Ratio:</span>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as any)}
                    className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-emerald-800 bg-slate-50 dark:bg-[#05140F] text-slate-900 dark:text-emerald-50"
                  >
                    <option value="16:9">16:9 Banner</option>
                    <option value="1:1">1:1 Square</option>
                    <option value="4:3">4:3 Presentation</option>
                    <option value="3:4">3:4 Poster</option>
                    <option value="9:16">9:16 Story</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={studioLoading}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {studioLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Generate {imageSize} Visual
              </button>
            </div>
          </form>

          {studioError && (
            <div className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/35 text-xs text-amber-900 dark:text-amber-200">
              {studioError}
            </div>
          )}

          {generatedImage && (
            <div className="space-y-3 pt-2">
              <img
                src={generatedImage}
                alt="Generated e-waste awareness visual"
                referrerPolicy="no-referrer"
                className="w-full max-h-[460px] object-contain rounded-xl border border-slate-200 dark:border-emerald-900/60 bg-slate-950"
              />
              <a
                href={generatedImage}
                download={`reboot-earth-campaign-${imageSize}.png`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-emerald-800 text-slate-700 dark:text-emerald-100"
              >
                <Download className="w-3.5 h-3.5" />
                Download Artwork
              </a>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.title || ''}
        description={pendingAction?.description || ''}
        confirmLabel={pendingAction?.confirmLabel || 'Confirm'}
        busy={actionBusy}
        onConfirm={() => void runConfirmedAction()}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
};
