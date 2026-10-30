import { b64urlEncode, b64urlDecode } from './verify.js';

export function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return b64urlEncode(bytes);
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password) {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = b64urlEncode(saltBytes);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return 'v1.' + salt + '.' + b64urlEncode(new Uint8Array(bits));
}

export async function verifyPassword(password, stored) {
  try {
    const parts = stored.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return false;
    const saltBytes = b64urlDecode(parts[1]);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' }, key, 256);
    const candidate = b64urlEncode(new Uint8Array(bits));
    if (candidate.length !== parts[2].length) return false;
    let diff = 0;
    for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ parts[2].charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

export function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const pools = [upper, lower, digits, symbols];
  const chars = [];
  for (const pool of pools) {
    for (let i = 0; i < 5; i++) {
      const pick = new Uint8Array(1);
      crypto.getRandomValues(pick);
      chars.push(pool[pick[0] % pool.length]);
    }
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const roll = new Uint8Array(1);
    crypto.getRandomValues(roll);
    const j = roll[0] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

async function aesKey(secretText) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secretText));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptText(secretText, plaintext) {
  const key = await aesKey(secretText);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return b64urlEncode(iv) + '.' + b64urlEncode(new Uint8Array(cipher));
}

export async function decryptText(secretText, packed) {
  const parts = typeof packed === 'string' ? packed.split('.') : [];
  if (parts.length !== 2) throw new Error('bad ciphertext');
  const key = await aesKey(secretText);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlDecode(parts[0]) }, key, b64urlDecode(parts[1]));
  return new TextDecoder().decode(plain);
}

const BACKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateBackupCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += BACKUP_ALPHABET[byte % BACKUP_ALPHABET.length];
  return out;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input) {
  const clean = input.replace(/=+$/, '').toUpperCase();
  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (const ch of clean) {
    const value = BASE32_ALPHABET.indexOf(ch);
    if (value < 0) throw new Error('bad secret');
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return new Uint8Array(bytes);
}

export async function totpCode(secret, timeMs) {
  const keyBytes = base32Decode(secret);
  const step = Math.floor(timeMs / 1000 / 30);
  const counter = new Uint8Array(8);
  let remaining = step;
  for (let i = 7; i >= 0; i--) {
    counter[i] = remaining & 255;
    remaining = Math.floor(remaining / 256);
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
  const offset = signature[signature.length - 1] & 15;
  const code = ((signature[offset] & 127) << 24) | ((signature[offset + 1] & 255) << 16) | ((signature[offset + 2] & 255) << 8) | (signature[offset + 3] & 255);
  return String(code % 1000000).padStart(6, '0');
}

export async function verifyTotp(secret, code, timeMs) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  for (const delta of [-1, 0, 1]) {
    const expected = await totpCode(secret, timeMs + delta * 30000);
    if (expected === code) return true;
  }
  return false;
}
