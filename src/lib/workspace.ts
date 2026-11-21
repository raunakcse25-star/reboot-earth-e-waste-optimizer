import firebaseConfig from '../../firebase-applet-config.json';

export const CHAT_CONSOLE_CONFIG_URL = `https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=${firebaseConfig.projectId}`;

export interface GmailSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export interface GoogleContact {
  resourceName: string;
  name: string;
  email: string;
  phone: string;
}

export interface ChatSpace {
  name: string;
  displayName: string;
  spaceType?: string;
}

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function listRecentGmailMessages(accessToken: string, queryText = 'e-waste OR recycling OR Reboot Earth'): Promise<GmailSummary[]> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=6&q=${encodeURIComponent(queryText)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gmail request failed (${listRes.status})`);
  }
  const listData = await listRes.json();
  const ids: { id: string }[] = listData.messages || [];
  const results: GmailSummary[] = [];

  for (const item of ids.slice(0, 5)) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;
    const msg = await msgRes.json();
    const headers: { name: string; value: string }[] = msg.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    results.push({
      id: msg.id,
      subject: getHeader('Subject') || '(No Subject)',
      from: getHeader('From') || 'Unknown',
      date: getHeader('Date') || '',
      snippet: msg.snippet || '',
    });
  }
  return results;
}

export async function sendGmailMessage(
  accessToken: string,
  params: { to: string; subject: string; body: string }
) {
  const rawEmail = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    params.body,
  ].join('\r\n');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: toBase64Url(rawEmail) }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Unable to send Gmail message (${res.status})`);
  }
  return res.json();
}

export async function saveFileToGoogleDrive(
  accessToken: string,
  params: { fileName: string; content: string; mimeType: string }
) {
  const metadata = {
    name: params.fileName,
    mimeType: params.mimeType,
  };
  const boundary = 'reboot_earth_drive_boundary_90210';
  const multipartBody =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${params.mimeType}\r\n\r\n` +
    `${params.content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google Drive upload failed (${res.status})`);
  }
  return res.json() as Promise<{ id: string; name: string; webViewLink?: string }>;
}

export async function listGoogleContacts(accessToken: string): Promise<GoogleContact[]> {
  const res = await fetch(
    'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=25',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google Contacts fetch failed (${res.status})`);
  }
  const data = await res.json();
  const connections = data.connections || [];
  return connections.map((person: any) => ({
    resourceName: person.resourceName || '',
    name: person.names?.[0]?.displayName || 'Unnamed Contact',
    email: person.emailAddresses?.[0]?.value || '',
    phone: person.phoneNumbers?.[0]?.value || '',
  }));
}

export async function listGoogleChatSpaces(accessToken: string): Promise<ChatSpace[]> {
  const res = await fetch('https://chat.googleapis.com/v1/spaces?pageSize=15', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Google Chat request failed (${res.status})`;
    if (res.status === 404 || msg.toLowerCase().includes('chat app not found')) {
      throw new Error(
        `Google Chat app not found. Configure the Chat app in Google Cloud Console (${CHAT_CONSOLE_CONFIG_URL}) and ensure you are signed in with a Business or Enterprise Google Workspace account.`
      );
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return (data.spaces || []).map((s: any) => ({
    name: s.name,
    displayName: s.displayName || s.name,
    spaceType: s.spaceType,
  }));
}

export async function sendGoogleChatMessage(
  accessToken: string,
  spaceName: string,
  text: string
) {
  const res = await fetch(`https://chat.googleapis.com/v1/${spaceName}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Failed to post Google Chat message (${res.status})`;
    if (res.status === 404 || msg.toLowerCase().includes('chat app not found')) {
      throw new Error(
        `Google Chat app not found. Configure the Chat app in Google Cloud Console (${CHAT_CONSOLE_CONFIG_URL}) using a Business/Enterprise Google Workspace account.`
      );
    }
    throw new Error(msg);
  }
  return res.json();
}

// --- Google Calendar v3 Integration ---

export interface CalendarListItem {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
  backgroundColor?: string;
  timeZone?: string;
}

export interface CalendarEventSummary {
  id: string;
  calendarId: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  htmlLink?: string;
  status?: string;
}

export interface CalendarBusyPeriod {
  start: string;
  end: string;
}

function parseSlotTimeHours(timeSlot: string): { startHour: number; endHour: number } {
  switch (timeSlot) {
    case '09:00 AM - 12:00 PM':
      return { startHour: 9, endHour: 12 };
    case '10:00 AM - 01:00 PM':
      return { startHour: 10, endHour: 13 };
    case '02:00 PM - 05:00 PM':
      return { startHour: 14, endHour: 17 };
    case '05:00 PM - 08:00 PM':
      return { startHour: 17, endHour: 20 };
    default:
      return { startHour: 10, endHour: 13 };
  }
}

export function pickupSlotToIsoWindow(
  preferredDate: string,
  timeSlot: string
): { startIso: string; endIso: string; timeZone: string } {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(preferredDate.trim());
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) - 1 : now.getMonth();
  const day = match ? Number(match[3]) : now.getDate();
  const { startHour, endHour } = parseSlotTimeHours(timeSlot);

  const startDate = new Date(year, month, day, startHour, 0, 0, 0);
  const endDate = new Date(year, month, day, endHour, 0, 0, 0);

  return {
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
    timeZone,
  };
}

function mapCalendarEvent(raw: any, calendarId: string): CalendarEventSummary {
  return {
    id: String(raw?.id || ''),
    calendarId,
    summary: String(raw?.summary || '(Untitled Event)'),
    description: String(raw?.description || ''),
    location: String(raw?.location || ''),
    start: String(raw?.start?.dateTime || raw?.start?.date || ''),
    end: String(raw?.end?.dateTime || raw?.end?.date || ''),
    htmlLink: raw?.htmlLink ? String(raw.htmlLink) : undefined,
    status: raw?.status ? String(raw.status) : undefined,
  };
}

export async function listGoogleCalendars(accessToken: string): Promise<CalendarListItem[]> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google Calendar list failed (${res.status})`);
  }
  const data = await res.json();
  return (data.items || []).map((c: any) => ({
    id: String(c.id || 'primary'),
    summary: String(c.summaryOverride || c.summary || c.id || 'Calendar'),
    primary: Boolean(c.primary),
    accessRole: String(c.accessRole || 'reader'),
    backgroundColor: c.backgroundColor ? String(c.backgroundColor) : undefined,
    timeZone: c.timeZone ? String(c.timeZone) : undefined,
  }));
}

export async function listUpcomingCalendarEvents(
  accessToken: string,
  calendarId = 'primary',
  maxResults = 15
): Promise<CalendarEventSummary[]> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(Math.max(1, Math.min(50, maxResults))),
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google Calendar events fetch failed (${res.status})`);
  }
  const data = await res.json();
  return (data.items || []).map((item: any) => mapCalendarEvent(item, calendarId));
}

export async function checkCalendarFreeBusy(
  accessToken: string,
  params: { calendarId?: string; timeMin: string; timeMax: string }
): Promise<CalendarBusyPeriod[]> {
  const calendarId = params.calendarId || 'primary';
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      items: [{ id: calendarId }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google Calendar availability check failed (${res.status})`);
  }
  const data = await res.json();
  const busy = data?.calendars?.[calendarId]?.busy || [];
  return busy.map((slot: any) => ({
    start: String(slot.start || ''),
    end: String(slot.end || ''),
  }));
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  params: {
    calendarId?: string;
    summary: string;
    location?: string;
    description?: string;
    startIso: string;
    endIso: string;
    timeZone?: string;
  }
): Promise<CalendarEventSummary> {
  const calendarId = params.calendarId || 'primary';
  const tz = params.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: params.summary,
        location: params.location || undefined,
        description: params.description || undefined,
        start: { dateTime: params.startIso, timeZone: tz },
        end: { dateTime: params.endIso, timeZone: tz },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 },
            { method: 'popup', minutes: 15 },
          ],
        },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Unable to create Google Calendar event (${res.status})`);
  }
  const created = await res.json();
  return mapCalendarEvent(created, calendarId);
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  params: {
    calendarId?: string;
    eventId: string;
    summary: string;
    location?: string;
    description?: string;
    startIso: string;
    endIso: string;
    timeZone?: string;
  }
): Promise<CalendarEventSummary> {
  const calendarId = params.calendarId || 'primary';
  const tz = params.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: params.summary,
        location: params.location || undefined,
        description: params.description || undefined,
        start: { dateTime: params.startIso, timeZone: tz },
        end: { dateTime: params.endIso, timeZone: tz },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Unable to update Google Calendar event (${res.status})`);
  }
  const updated = await res.json();
  return mapCalendarEvent(updated, calendarId);
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  calendarId = 'primary'
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Unable to delete Google Calendar event (${res.status})`);
  }
}

