// The words (and the decision of which buttons exist) for PWA update / offline feedback.
// Pure and alias-free so it is unit tested. The visual component is PwaFeedback.tsx.

export type UpdateBannerStatus = 'none' | 'ready' | 'blocked-by-workout';

export interface UpdateBannerCopy {
  title: string;
  body: string;
  /** Label of the one primary button, or null when there must be no button. */
  action: string | null;
  /** "Later" is only offered when it is safe to ignore the update for now. */
  dismissible: boolean;
}

/**
 * While a workout is saved on this device there is NO update button at all: the banner only says the
 * update will wait, so there is no unsafe default to tap. The button appears the moment the workout is
 * finished or discarded, and it never reloads without a tap.
 */
export const describeUpdate = (status: UpdateBannerStatus): UpdateBannerCopy | null => {
  switch (status) {
    case 'ready':
      return {
        title: 'A new version of FitTrack is ready',
        body: 'Update when it suits you. The page reloads once and keeps your data.',
        action: 'Update now',
        dismissible: true,
      };
    case 'blocked-by-workout':
      return {
        title: 'A new version is ready and will wait',
        body: 'Your workout is in progress, so nothing will reload. Finish or discard it, then you can update.',
        action: null,
        dismissible: false,
      };
    default:
      return null;
  }
};

/** Shown if someone taps Update after a workout started in the meantime. */
export const UPDATE_BLOCKED_TOAST = 'Your workout is in progress, so the update will wait.';
export const UPDATE_FAILED_TOAST = "Couldn't install the update. Please try again.";

export const OFFLINE_READY_TOAST = {
  id: 'pwa-offline-ready',
  message: 'FitTrack can now open without a connection.',
  description: 'Saving new data, meals and edits still need a connection.',
} as const;

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export const formatAge = (savedAt: number, now: number): string => {
  const minutes = Math.max(0, Math.floor((now - savedAt) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
};

/** Gym notice when the template list on screen is this device's saved copy, not fresh from the server. */
export const describeCachedTemplates = (cachedAt: number | null, now: number): { title: string; body: string } | null => {
  if (cachedAt == null) return null;
  return {
    title: 'Showing templates saved on this device',
    body: `Last updated ${formatAge(cachedAt, now)}. You can start a workout, but changing templates needs a connection.`,
  };
};
