import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, hashPassword, verifyPassword } from './db.ts';
import type { AuthUser, UserRole } from '../src/types/astrocare.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'astrocare-mission-secret-dev-only-2026';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signToken(user: AuthUser): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      astronautId: user.astronautId ?? null,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    })
  );
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest());
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      id: decoded.sub,
      email: decoded.email,
      fullName: decoded.fullName,
      role: decoded.role,
      astronautId: decoded.astronautId ?? null,
    };
  } catch {
    return null;
  }
}

export interface AuthedRequest extends Request {
  user?: AuthUser | null;
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    req.user = verifyToken(auth.slice(7));
  } else {
    req.user = null;
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  const user = auth?.startsWith('Bearer ') ? verifyToken(auth.slice(7)) : null;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required for this clinical/mission action.' });
  }
  req.user = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Role ${req.user.role} lacks permission for this action.` });
    }
    next();
  };
}

export function recordAudit(actorEmail: string, actorRole: string, action: string, detail: string) {
  db.prepare(
    'INSERT INTO audit_logs (actor_email, actor_role, action, detail, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(actorEmail, actorRole, action, detail, new Date().toISOString());
}

export function authenticateUser(email: string, password: string): { user: AuthUser; token: string } | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.astronaut_id, r.name as role_name
       FROM users u JOIN roles r ON u.role_id = r.id WHERE lower(u.email) = lower(?)`
    )
    .get(email) as
    | {
        id: number;
        email: string;
        password_hash: string;
        full_name: string;
        astronaut_id: number | null;
        role_name: UserRole;
      }
    | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) return null;
  const user: AuthUser = {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role_name,
    astronautId: row.astronaut_id,
  };
  recordAudit(user.email, user.role, 'LOGIN', 'Session token issued');
  return { user, token: signToken(user) };
}

export function registerUser(email: string, password: string, fullName: string, roleName: UserRole) {
  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email);
  if (existing) {
    throw new Error('Account with this email already exists.');
  }
  const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName) as { id: number } | undefined;
  if (!role) throw new Error('Invalid role specified.');

  const astronautId = roleName === 'Astronaut' ? 1 : null;
  const hash = hashPassword(password);
  const res = db
    .prepare(
      'INSERT INTO users (email, password_hash, full_name, role_id, astronaut_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(email.trim().toLowerCase(), hash, fullName.trim(), role.id, astronautId, new Date().toISOString());

  const user: AuthUser = {
    id: Number(res.lastInsertRowid),
    email: email.trim().toLowerCase(),
    fullName: fullName.trim(),
    role: roleName,
    astronautId,
  };
  recordAudit(user.email, user.role, 'REGISTER', 'New account registered');
  return { user, token: signToken(user) };
}

// Simple in-memory API rate limiter
const hits = new Map<string, { count: number; resetAt: number }>();
export function rateLimiter(maxPerMin = 180) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'local';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    entry.count += 1;
    if (entry.count > maxPerMin) {
      return res.status(429).json({ error: 'Rate limit exceeded. Slow telemetry polling.' });
    }
    next();
  };
}
