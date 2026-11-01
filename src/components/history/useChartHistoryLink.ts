import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOptionalUserId } from '@/contexts/userContextCore';
import type { EntryChartLink, EntryRevealRequest } from '@/components/history/MetricHistoryList';
import type { RecordChartLink, RecordChartRequest } from '@/components/history/RecordTrendChart';
import { revealStatus, type PlotStatus, type RecordLike } from '@/lib/recordTrend';

/**
 * The glue between a page's trend chart and its history list (Weight, Waist, Sleep). It owns only the person's current
 * interaction, never data: which record the chart has selected, a pending "show this record on the chart" or "reveal this
 * record in the list" request, whether the phone's Trend disclosure is open, and why a jump could not happen.
 *
 *   chart point -> row:  chart.onJump(id) -> if a filter hides the record, the chart says so and offers "Clear filters"
 *                        (the filters are never cleared silently); otherwise the list pages to it, opens it, focuses it.
 *   row -> chart point:  list.onToggle(entry) -> opens Trend if it is collapsed and selects exactly that record.
 *
 * It never fetches anything. Switching account drops every pending request and notice (the chart drops its own selection).
 */
interface Options<T extends RecordLike> {
  /** Every record of the page (unfiltered). */
  entries: readonly T[];
  /** What the history list is showing after the person's search and date filters. */
  visibleEntries: readonly T[];
  /** Whether a record is the one on the chart (see planRecordPlot). */
  statusOf: (id: string) => PlotStatus;
  /** Puts the page's search and date filters back to "everything". The page owns them. */
  clearFilters: () => void;
  noun: string;
  nounPlural: string;
  valueKey: string;
}

export const useChartHistoryLink = <T extends RecordLike>({ entries, visibleEntries, statusOf, clearFilters, noun, nounPlural, valueKey }: Options<T>) => {
  const userId = useOptionalUserId();
  const [trendOpen, setTrendOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [request, setRequest] = useState<RecordChartRequest | null>(null);
  const [reveal, setReveal] = useState<EntryRevealRequest | null>(null);
  /** The record a jump could not reach, with why. Only meaningful while that record is still the chart's selection. */
  const [blocked, setBlocked] = useState<string | null>(null);
  const nonce = useRef(0);
  const next = useCallback(() => (nonce.current += 1), []);

  // A different account: forget every pending request and notice.
  const firstUser = useRef(userId);
  useEffect(() => {
    if (firstUser.current === userId) return;
    firstUser.current = userId;
    setRequest(null);
    setReveal(null);
    setBlocked(null);
    setSelectedId(null);
  }, [userId]);

  // A reveal request for a record that no longer exists (deleted meanwhile) would wait forever.
  useEffect(() => {
    if (reveal && !entries.some((entry) => entry.id === reveal.id)) setReveal(null);
  }, [reveal, entries]);

  const onJump = useCallback((id: string) => {
    const status = revealStatus(id, entries, visibleEntries);
    if (status === 'visible') {
      setBlocked(null);
      setReveal({ id, nonce: next() });
    } else {
      setBlocked(id);
    }
  }, [entries, visibleEntries, next]);

  const onRevealed = useCallback((done: number) => setReveal((current) => (current?.nonce === done ? null : current)), []);

  const jumpNotice = useMemo<RecordChartLink['jumpNotice']>(() => {
    if (blocked === null || blocked !== selectedId) return null;
    const status = revealStatus(blocked, entries, visibleEntries);
    if (status === 'visible') return null;
    if (status === 'missing') return { text: `That ${noun} is no longer in your history.`, actionLabel: 'Dismiss', onAction: () => setBlocked(null) };
    return {
      text: `Your search or date filters are hiding that ${noun}.`,
      actionLabel: 'Clear filters',
      onAction: () => {
        const id = blocked;
        setBlocked(null);
        clearFilters();
        // The list answers as soon as the entry is back in it (it may not be mounted while everything is filtered out).
        setReveal({ id, nonce: next() });
      },
    };
  }, [blocked, selectedId, entries, visibleEntries, noun, clearFilters, next]);

  const chartLink = useMemo<RecordChartLink>(() => ({
    valueKey, noun, nounPlural, request, jumpNotice,
    onSelectedRecordChange: setSelectedId,
    onJump,
  }), [valueKey, noun, nounPlural, request, jumpNotice, onJump]);

  const listLink = useMemo<EntryChartLink<T>>(() => ({
    selectedId,
    statusOf,
    onToggle: (entry) => {
      if (selectedId === entry.id) {
        setRequest({ recordId: null, nonce: next() });
        return;
      }
      setTrendOpen(true);
      setRequest({ recordId: entry.id, nonce: next() });
    },
  }), [selectedId, statusOf, next]);

  return { trendOpen, setTrendOpen, chartLink, listLink, reveal, onRevealed };
};
