import { useOptionalUserId } from '@/contexts/userContextCore';
import { useChartDaySelection, type ChartDaySelection } from '@/components/charts/useChartDaySelection';
import type { ChartViewerDataset } from '@/lib/chartViewerData';

/**
 * Chart day selection scoped to the signed-in account. This is the hook charts use: it passes the user id to
 * `useChartDaySelection` as its scope, so a different account never sees the previous account's selected day, even
 * when both have the same date in their cached rows. (The selection contract itself knows nothing about auth.)
 */
export const useAccountChartSelection = (dataset: ChartViewerDataset): ChartDaySelection => useChartDaySelection(dataset, useOptionalUserId());
