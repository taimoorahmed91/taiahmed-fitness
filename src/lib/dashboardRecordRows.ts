// Dashboard Weight and Sleep chart rows that carry EXACT stored record ids (so the viewer's A / B Compare picks can name them).
// No React, no browser globals (tests/dashboardRecordRows.test.ts).
//
// ## Identity: the same rule as the Weight and Sleep pages
// Both pages draw ONE record per day, chosen by `planRecordPlot` (src/lib/recordTrend.ts): among a day's drawable records, the
// one with the lowest id (plain string order, independent of the order the rows arrived in). These helpers call the very same
// functions with the very same "drawable" tests, so a Dashboard point and the Weight / Sleep page point of one day are the same
// record, and a refetch that shuffles same-day rows never moves a point to another record.
//
//   Waist   row = { date, waist, recordId, entryCount }    same plan, in-viewer comparison only (no link)
//   Weight  row = { date, weight, recordId, entryCount }   the day's lowest-id weigh-in with weight > 0
//   Sleep   row = { date, hours, whoopHours, recordId?, entryCount }
//             hours + recordId  = the day's lowest-id MANUAL sleep entry with hours > 0
//             whoopHours        = that day's WHOOP in-bed hours (the later WHOOP row of a day wins); never a record
//             WHOOP-only day    = a row WITHOUT recordId (nothing exact to compare)
//             manual + WHOOP    = the manual recordId stays; only the manual series is record-backed (Compare refuses a WHOOP press)
//
// Other same-day records are not on the chart (and not comparable from it); `entryCount` says how many there were.
import { planRecordPlot, recordChartRows, sleepChartRows, type RecordChartRow, type SleepChartRow } from './recordTrend';

interface WeightLike { id: string; date: string; weight: number }
interface SleepLike { id: string; date: string; hours: number }
interface WhoopLike { date: string; total_in_bed_hours: number | null }

/** One exact weigh-in per day, newest day first. Same plan as the Weight page. */
export const dashboardWeightRows = <T extends WeightLike>(entries: readonly T[]): RecordChartRow<'weight'>[] =>
  recordChartRows(planRecordPlot(entries, (entry) => entry.weight > 0), 'weight', (entry) => entry.weight);

interface WaistLike { id: string; date: string; waist: number }

/**
 * One exact measurement per UTC date, newest day first. Same plan as the Waist page (lowest id of a day's drawable records, whatever order
 * the rows arrived in). Rows carry `recordId` / `entryCount` so the chart can say how many same-day measurements there were, but the Dashboard
 * never offers Open in Compare for Waist: the viewer comparison stays in the viewer.
 */
export const dashboardWaistRows = <T extends WaistLike>(entries: readonly T[]): RecordChartRow<'waist'>[] =>
  recordChartRows(planRecordPlot(entries, (entry) => entry.waist > 0), 'waist', (entry) => entry.waist);

/** One exact manual sleep record per day plus WHOOP in-bed hours, newest day first. Same plan and WHOOP rule as the Sleep page. */
export const dashboardSleepRows = <T extends SleepLike>(entries: readonly T[], whoop: readonly WhoopLike[]): SleepChartRow[] =>
  sleepChartRows(planRecordPlot(entries, (entry) => entry.hours > 0), whoop);
