import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { syncAuthenticatedUser } from '../db/queries.ts';

export const BOOTSTRAP_ADMIN_EMAIL = 'raunaksahni7286@gmail.com';

export interface DbUserRecord {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: string;
  roleApproved: boolean;
  requestedRole: string | null;
  organizationName: string | null;
  phone: string | null;
  city: string | null;
  rewardPoints: number;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: DbUserRecord;
}

export async function getOrCreateDbUser(decoded: DecodedIdToken): Promise<DbUserRecord> {
  const email = (decoded.email || '').toLowerCase();
  const isBootstrapAdmin = email === BOOTSTRAP_ADMIN_EMAIL && decoded.email_verified === true;
  const displayName = decoded.name || email.split('@')[0] || 'Reboot Earth Member';

  try {
    return await syncAuthenticatedUser({
      uid: decoded.uid,
      email,
      fullName: displayName,
      isBootstrapAdmin,
    });
  } catch (error) {
    console.error('Failed to sync authenticated user record:', error);
    throw new Error('Unable to synchronize user profile. Please retry.', { cause: error });
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Invalid authorization header.' });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    req.dbUser = await getOrCreateDbUser(decoded);
    return next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
};

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        req.user = decoded;
        req.dbUser = await getOrCreateDbUser(decoded);
      } catch {
        // Ignore invalid optional tokens on public routes
      }
    }
  }
  return next();
};

export const requireRoles = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.dbUser.role === 'admin') {
      return next();
    }
    if (!allowedRoles.includes(req.dbUser.role) || !req.dbUser.roleApproved) {
      return res.status(403).json({
        error: `Access denied. Authorized roles: ${allowedRoles.join(', ')}.`,
      });
    }
    return next();
  };
};
