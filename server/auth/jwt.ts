import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error('Missing JWT_SECRET');

export type JwtClaims = {
  sub: string;           // user id
  email?: string;
  name?: string;
  picture?: string;
  roles?: string[];
};

export function signJwt(claims: JwtClaims, expiresIn = '7d') {
  return jwt.sign(claims, JWT_SECRET, { expiresIn });
}

export function verifyJwt(token: string): JwtClaims {
  return jwt.verify(token, JWT_SECRET) as JwtClaims;
}

export function authOptional(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.mam_jwt;
  if (token) {
    try { (req as any).user = verifyJwt(token); } catch { /* ignore */ }
  }
  next();
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.mam_jwt;
  if (!token) return res.status(401).json({ message: 'Not authenticated' });
  try { (req as any).user = verifyJwt(token); next(); }
  catch { return res.status(401).json({ message: 'Invalid token' }); }
}
