/**
 * Single-admin authentication, fully client-side.
 *
 * On first launch the admin sets a password. We never store the password —
 * only a PBKDF2-SHA-256 derivation with a random per-install salt, saved in
 * IndexedDB. Login re-derives and compares in (roughly) constant time.
 *
 * Note: because this app is static (Firebase Hosting) with on-device storage,
 * this gate protects the local UI/data on a shared device. It is not a
 * server-enforced boundary; anyone with raw device access could inspect
 * IndexedDB. For the stated "one admin password" requirement this is the right
 * fit; upgrade to Firebase Auth if you later add a backend.
 */
import { PBKDF2_ITERATIONS } from '@/config';
import { getSetting, setSetting } from '@/lib/storage/db';

const CRED_KEY = 'admin-credential';
const SESSION_KEY = 'vault-session-active';

interface Credential {
  salt: string; // base64
  hash: string; // base64
  iterations: number;
  createdAt: string;
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bufToB64(bits);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Has an admin password ever been set on this install? */
export async function isAdminConfigured(): Promise<boolean> {
  return Boolean(await getSetting<Credential>(CRED_KEY));
}

/** Create (or overwrite) the admin password. */
export async function setAdminPassword(password: string): Promise<void> {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  const cred: Credential = {
    salt: bufToB64(salt.buffer),
    hash,
    iterations: PBKDF2_ITERATIONS,
    createdAt: new Date().toISOString(),
  };
  await setSetting(CRED_KEY, cred);
}

/** Verify a password attempt against the stored credential. */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const cred = await getSetting<Credential>(CRED_KEY);
  if (!cred) return false;
  const candidate = await derive(password, b64ToBytes(cred.salt), cred.iterations);
  return timingSafeEqual(candidate, cred.hash);
}

/** Change the password after verifying the current one. */
export async function changeAdminPassword(current: string, next: string): Promise<void> {
  if (!(await verifyAdminPassword(current))) {
    throw new Error('Current password is incorrect.');
  }
  await setAdminPassword(next);
}

/* -------- session (kept only for the tab's lifetime) -------- */

export function markLoggedIn(): void {
  sessionStorage.setItem(SESSION_KEY, '1');
}

export function isSessionActive(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
