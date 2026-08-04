import { clearEverything } from '@/lib/storage/db';
import { deleteVaultDir } from '@/lib/storage/opfs';

/**
 * Completely erase this device's vault so a fresh one can be created:
 *  - removes every original file + JSON sidecar + manifest from OPFS, and
 *  - clears all IndexedDB stores INCLUDING the hashed admin password.
 *
 * After this the app returns to first-run state ("needs-setup") and the user
 * can create a new admin password and a brand-new empty vault. This is the
 * recovery path for a forgotten admin password.
 */
export async function hardResetVault(): Promise<void> {
  await deleteVaultDir();
  await clearEverything();
}
