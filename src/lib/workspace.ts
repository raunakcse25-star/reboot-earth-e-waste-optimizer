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
