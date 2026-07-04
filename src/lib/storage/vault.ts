/**
 * Vault identity / folder consistency.
 *
 * The vault folder name is fixed (APP_CONFIG.vaultDir), so the SAME OPFS folder
 * is reused on every visit on a given device. To make that identity explicit and
 * exportable we also keep a small manifest file inside the folder:
 *
 *   - If `_vault.json` already exists  -> REUSE it (existing folder, same device).
 *   - If it is missing                 -> CREATE it (new device / first run).
 *
 * The generated `vaultId` is mirrored into IndexedDB settings for quick lookup.
 */
import { APP_CONFIG } from '@/config';
import * as db from '@/lib/storage/db';
import * as opfs from '@/lib/storage/opfs';
import { newId } from '@/lib/util';
import type { VaultManifest } from '@/types';

/** Best-effort short, human-readable device/browser label. */
function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'unknown-device';
  const ua = navigator.userAgent || '';
  const platform =
    // Newer API when available, else legacy platform string.
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ||
    navigator.platform ||
    'unknown';

  let browser = 'browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  return `${platform} · ${browser}`;
}

/**
 * Ensure the vault exists and return its manifest. Creates the folder identity
 * on first run, otherwise reuses the existing one. Safe to call on every launch.
 */
export async function initVault(): Promise<VaultManifest> {
  if (!opfs.isOpfsSupported()) {
    // No private folder here — return an in-memory identity so the UI still works.
    const vaultId = (await db.getSetting<string>(APP_CONFIG.settingsKeys.vaultId)) ?? newId();
    await db.setSetting(APP_CONFIG.settingsKeys.vaultId, vaultId);
    return {
      vaultId,
      folderName: opfs.getVaultDirName(),
      schemaVersion: APP_CONFIG.manifestSchema,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceLabel: deviceLabel(),
      appName: APP_CONFIG.appName,
    };
  }

  const existing = await opfs.readJson<VaultManifest>(APP_CONFIG.manifestFile);
  if (existing?.vaultId) {
    await db.setSetting(APP_CONFIG.settingsKeys.vaultId, existing.vaultId);
    return existing;
  }

  const now = new Date().toISOString();
  const manifest: VaultManifest = {
    vaultId: newId(),
    folderName: opfs.getVaultDirName(),
    schemaVersion: APP_CONFIG.manifestSchema,
    createdAt: now,
    updatedAt: now,
    deviceLabel: deviceLabel(),
    appName: APP_CONFIG.appName,
  };
  await opfs.writeJson(APP_CONFIG.manifestFile, manifest);
  await db.setSetting(APP_CONFIG.settingsKeys.vaultId, manifest.vaultId);
  return manifest;
}

/** Persist an updated `updatedAt` timestamp (called after index changes). */
export async function touchManifest(manifest: VaultManifest): Promise<VaultManifest> {
  const next: VaultManifest = { ...manifest, updatedAt: new Date().toISOString() };
  if (opfs.isOpfsSupported()) {
    await opfs.writeJson(APP_CONFIG.manifestFile, next);
  }
  return next;
}
