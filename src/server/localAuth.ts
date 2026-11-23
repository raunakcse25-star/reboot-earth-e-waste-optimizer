import crypto from 'crypto';

export const ALLOWED_ONBOARDING_ROLES = [
  'citizen',
  'collection_centre',
  'recycler',
  'transporter',
] as const;

export type OnboardingRole = (typeof ALLOWED_ONBOARDING_ROLES)[number];

export interface LocalAccountRecord {
  uid: string;
  email: string;
  fullName: string;
  role: OnboardingRole;
  salt: string;
  passwordHash: string;
  createdAt: number;
}

export interface LocalSessionPayload {
  uid: string;
  email: string;
  name: string;
  role: OnboardingRole;
  iat: number;
  exp: number;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const localAccountsByEmail = new Map<string, LocalAccountRecord>();

export function isAllowedOnboardingRole(value: unknown): value is OnboardingRole {
  return (
    typeof value === 'string' &&
    (ALLOWED_ONBOARDING_ROLES as readonly string[]).includes(value)
  );
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 160;
}

function hashPasswordScrypt(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
}

function signTokenPayload(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
}

export function createLocalSessionToken(account: {
  uid: string;
  email: string;
  fullName: string;
  role: OnboardingRole;
}): string {
  const now = Date.now();
  const payload: LocalSessionPayload = {
    uid: account.uid,
    email: account.email,
    name: account.fullName,
    role: account.role,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signTokenPayload(encoded);
  return `rbe.${encoded}.${signature}`;
}

export function verifyLocalSessionToken(token: string): LocalSessionPayload | null {
  if (!token.startsWith('rbe.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [, encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  const expectedSig = signTokenPayload(encoded);
  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as LocalSessionPayload;
    if (!parsed?.uid || !parsed?.email || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    if (!isAllowedOnboardingRole(parsed.role)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function registerLocalAccount(input: {
  email: string;
  password: string;
  fullName: string;
  role: OnboardingRole;
}): Promise<LocalAccountRecord> {
  const email = normalizeEmail(input.email);
  if (localAccountsByEmail.has(email)) {
    const err = new Error('An account with this email already exists. Please sign in instead.') as Error & {
      code?: string;
    };
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = await hashPasswordScrypt(input.password, salt);
  const uid = `rbe_usr_${crypto.randomBytes(12).toString('hex')}`;

  const record: LocalAccountRecord = {
    uid,
    email,
    fullName: input.fullName.trim().slice(0, 120),
    role: input.role,
    salt,
    passwordHash,
    createdAt: Date.now(),
  };
  localAccountsByEmail.set(email, record);
  return record;
}

export async function verifyLocalAccountLogin(
  rawEmail: string,
  password: string
): Promise<LocalAccountRecord | null> {
  const email = normalizeEmail(rawEmail);
  const account = localAccountsByEmail.get(email);
  if (!account) return null;

  const candidateHash = await hashPasswordScrypt(password, account.salt);
  const storedBuf = Buffer.from(account.passwordHash, 'hex');
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  if (
    storedBuf.length !== candidateBuf.length ||
    !crypto.timingSafeEqual(storedBuf, candidateBuf)
  ) {
    return null;
  }
  return account;
}
