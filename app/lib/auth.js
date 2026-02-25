import crypto from 'crypto';
import { query } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const OTP_EXPIRY_MINUTES = 10;
const TOKEN_EXPIRY_DAYS = 30;

export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function createJWT(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const data = { ...payload, iat: now, exp: now + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 };
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyJWT(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    const now = Math.floor(Date.now() / 1000);
    
    if (payload.exp < now) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}

export async function createOTP(email) {
  const code = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  
  await query(
    'INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)',
    [email, code, expiresAt]
  );
  
  return code;
}

export async function verifyOTP(email, code) {
  const results = await query(
    `SELECT * FROM otp_codes 
     WHERE email = ? AND code = ? AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [email, code]
  );
  
  if (results.length === 0) {
    return false;
  }
  
  await query(
    'UPDATE otp_codes SET used = TRUE WHERE id = ?',
    [results[0].id]
  );
  
  return true;
}

export async function createOrUpdateUser(email) {
  const results = await query(
    'SELECT id FROM users WHERE email = ?',
    [email]
  );
  
  if (results.length > 0) {
    await query(
      'UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = ?',
      [results[0].id]
    );
    return results[0].id;
  }
  
  const insertResult = await query(
    'INSERT INTO users (email, email_verified) VALUES (?, TRUE)',
    [email]
  );
  
  return insertResult.insertId;
}

export async function createSession(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  
  await query(
    'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, tokenHash, expiresAt]
  );
  
  return createJWT({ userId, token });
}

export async function verifySession(token) {
  const payload = verifyJWT(token);
  if (!payload || !payload.userId || !payload.token) {
    return null;
  }
  
  const tokenHash = hashToken(payload.token);
  const results = await query(
    `SELECT us.*, u.email, u.email_verified 
     FROM user_sessions us 
     JOIN users u ON us.user_id = u.id 
     WHERE us.user_id = ? AND us.token_hash = ? AND us.expires_at > NOW()`,
    [payload.userId, tokenHash]
  );
  
  if (results.length === 0) {
    return null;
  }
  
  return {
    userId: results[0].user_id,
    email: results[0].email,
    emailVerified: results[0].email_verified
  };
}

export async function deleteSession(token) {
  const payload = verifyJWT(token);
  if (!payload || !payload.token) {
    return;
  }
  
  const tokenHash = hashToken(payload.token);
  await query(
    'DELETE FROM user_sessions WHERE token_hash = ?',
    [tokenHash]
  );
}

export async function deleteUserSessions(userId) {
  await query(
    'DELETE FROM user_sessions WHERE user_id = ?',
    [userId]
  );
}

export async function cleanExpiredOTPs() {
  await query('DELETE FROM otp_codes WHERE expires_at < NOW() OR used = TRUE');
}

export async function cleanExpiredSessions() {
  await query('DELETE FROM user_sessions WHERE expires_at < NOW()');
}
