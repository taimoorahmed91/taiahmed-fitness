import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PAGE_GUTTER_CLASS } from '@/components/layout/Page';
import { getPwaController } from '@/pwa/pwaController';
import { usePwaUpdate } from '@/pwa/usePwaUpdate';
import {
  describeUpdate, OFFLINE_READY_TOAST, UPDATE_BLOCKED_TOAST, UPDATE_FAILED_TOAST,
} from './pwaFeedbackCopy';

/**
 * Update and offline-ready feedback for the signed-in shell (rendered by AppLayout, under the header).
 *
 *  - "Ready to work offline" is a one-time Sonner toast.
 *  - A waiting update is a compact banner. It never reloads by itself: the person taps "Update now".
 *  - While a workout is saved on this device the banner says the update will wait and has NO button.
 *    The same banner gains the button once the workout is finished or discarded.
 */
export const PwaFeedback = () => {
  const { status, offlineReady, applyUpdate, dismissUpdate, dismissOfflineReady } = usePwaUpdate();
  const [applying, setApplying] = useState(false);
  const announcedOffline = useRef(false);

  useEffect(() => {
    if (!offlineReady || announcedOffline.current) return;
    announcedOffline.current = true;
    toast.success(OFFLINE_READY_TOAST.message, { id: OFFLINE_READY_TOAST.id, description: OFFLINE_READY_TOAST.description });
    dismissOfflineReady();
  }, [offlineReady, dismissOfflineReady]);

  // Finishing a workout in this tab fires no storage event, so while the update is waiting on a workout,
  // look again every few seconds. It is one localStorage read, and it stops as soon as the update can go ahead.
  useEffect(() => {
    if (status !== 'blocked-by-workout') return;
    const controller = getPwaController();
    const id = window.setInterval(() => controller.refresh(), 3000);
    return () => window.clearInterval(id);
  }, [status]);

  const copy = describeUpdate(status);
  if (!copy) return null;

  const update = async () => {
    setApplying(true);
    try {
      const result = await applyUpdate();
      if (result === 'blocked') toast.info(UPDATE_BLOCKED_TOAST);
    } catch {
      toast.error(UPDATE_FAILED_TOAST);
    } finally {
      setApplying(false);
    }
  };

  return (
    <section
      aria-label="App update"
      data-pwa-update-banner
      className="border-b bg-primary/10 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className={`container flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 text-sm ${PAGE_GUTTER_CLASS}`}>
        {/* Polite live region: announces "ready", and again if it changes to "will wait". */}
        <div role="status" className="flex min-w-0 flex-1 basis-64 items-start gap-2">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="min-w-0">
            <span className="font-medium text-foreground">{copy.title}.</span>{' '}
            <span className="text-muted-foreground">{copy.body}</span>
          </p>
        </div>
        {(copy.action || copy.dismissible) && (
          <div className="flex shrink-0 items-center gap-2">
            {copy.dismissible && (
              <Button type="button" variant="ghost" size="touch" onClick={dismissUpdate}>
                Later
              </Button>
            )}
            {copy.action && (
              <Button type="button" size="touch" onClick={update} loading={applying} loadingText="Updating…">
                {copy.action}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
