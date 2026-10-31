// The words for the account menu's "Refresh app & data". Pure and alias-free so it is unit tested.
// Rule: say only what really happened, and keep the data outcome and the app outcome as two separate facts.
import { describeManualRefresh } from '../../app/globalRefresh';
import type { AppRefreshResult, DataRefreshOutcome, UpdateOutcome } from '../../pwa/appRefresh';

export type RefreshToastKind = 'success' | 'info' | 'warning' | 'error';

export interface AppRefreshMessage {
  kind: RefreshToastKind;
  message: string;
  description?: string;
}

export const REFRESH_ACTION_LABEL = 'Refresh app & data';
export const REFRESH_BUSY_LABEL = 'Refreshing app & data…';
export const REFRESH_LOADING_TOAST = 'Refreshing your data and checking for a new version…';
export const REFRESH_UNEXPECTED_ERROR = { message: "Couldn't refresh.", description: 'Please try again.' } as const;

const dataMessage = (data: DataRefreshOutcome): { kind: RefreshToastKind; message: string; description?: string } => {
  switch (data.kind) {
    case 'result': return describeManualRefresh(data.result);
    case 'requested': return { kind: 'info', message: 'Asked this page to refresh.' };
    case 'none': return { kind: 'info', message: 'Nothing to refresh on this page.' };
    default: return { kind: 'error', message: "Couldn't refresh your data.", description: 'You are seeing the last data we loaded. Check your connection and try again.' };
  }
};

/** One short sentence about the data, for use inside the description. */
const dataSentence = (data: DataRefreshOutcome): string => {
  if (data.kind === 'result') {
    switch (data.result.outcome) {
      case 'success': return 'Your data is refreshed.';
      case 'partial': return `Your data is partly refreshed (${data.result.failed} of ${data.result.total} sources failed).`;
      case 'failure': return "Your data couldn't be refreshed.";
      default: return 'There was no data to refresh on this page.';
    }
  }
  if (data.kind === 'requested') return 'This page was asked to refresh.';
  if (data.kind === 'none') return 'There was no data to refresh on this page.';
  return "Your data couldn't be refreshed.";
};

const appSentence = (update: UpdateOutcome): string => {
  switch (update) {
    case 'applied': return 'FitTrack will reload once to finish updating. Your data and any saved workout are kept.';
    case 'blocked': return 'A new version is ready. It will wait until you finish your workout, so nothing reloads now and your workout is kept.';
    case 'current': return 'Checked for updates: you are on the latest version.';
    case 'check-failed': return "Couldn't check for a new version right now.";
    case 'apply-failed': return "A new version is ready but couldn't be installed. Please try again.";
    default: return "Updates aren't checked in this session, so only your data was refreshed.";
  }
};

const worst = (a: RefreshToastKind, b: RefreshToastKind): RefreshToastKind => {
  const order: RefreshToastKind[] = ['success', 'info', 'warning', 'error'];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
};

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ') || undefined;

/** Shown right before the page reloads to install a new version. */
export const describeUpdateStarting = (data: DataRefreshOutcome): AppRefreshMessage => ({
  kind: 'info',
  message: 'Installing the new version…',
  description: join(dataSentence(data), appSentence('applied')),
});

/** Final message for every outcome. For 'applied' this is only seen if the page did not reload. */
export const describeAppRefresh = ({ data, update }: AppRefreshResult): AppRefreshMessage => {
  const d = dataMessage(data);
  // A data problem is the headline; the app fact follows. Otherwise the app news leads when there is any.
  if (d.kind === 'error' || d.kind === 'warning') {
    return { kind: update === 'blocked' || update === 'current' || update === 'unavailable' ? d.kind : worst(d.kind, 'warning'), message: d.message, description: join(d.description, appSentence(update)) };
  }
  switch (update) {
    case 'applied':
      return describeUpdateStarting(data);
    case 'blocked':
      return { kind: 'info', message: 'New version ready. It will wait for your workout.', description: join(dataSentence(data), 'Nothing reloads while your workout is in progress, and your workout is kept.') };
    case 'apply-failed':
      return { kind: 'warning', message: d.message, description: join(d.description, appSentence(update)) };
    case 'check-failed':
      return { kind: 'warning', message: d.message, description: join(d.description, appSentence(update)) };
    default:
      return { kind: d.kind, message: d.message, description: join(d.description, appSentence(update)) };
  }
};
