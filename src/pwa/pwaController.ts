import { defaultStorage } from '../lib/workoutOfflineCache';
import { createUpdateController, type UpdateController } from './updateController';

// One controller per page, shared by register.ts (index.html entry) and usePwaUpdate().
// Kept on globalThis so it stays a single instance even if the bundler splits the two entries.
const KEY = '__fittrackPwaController';

export const getPwaController = (): UpdateController => {
  const g = globalThis as unknown as Record<string, UpdateController | undefined>;
  if (!g[KEY]) g[KEY] = createUpdateController({ storage: defaultStorage() });
  return g[KEY] as UpdateController;
};
