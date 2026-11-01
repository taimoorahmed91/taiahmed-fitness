# Selected-day contract (Phase 1, Lane A)

One shared way to say "this calendar day, and where the person came from". Used by the Calendar page, the adherence
grid, Calorie History, and (later) the shared chart points.

## API (`src/lib/selectedDay.ts`, pure)

- `parseIsoDate(v)` / `isValidIsoDate(v)`: strict `YYYY-MM-DD`, real calendar dates only (leap years right, years 1000-9999).
  `2026-02-30`, `2025-02-29`, `2026-13-01`, `2026-10-30T00:00Z`, ` 2026-10-30` are all rejected (never rolled forward).
- `createSelectedDay(isoDate, origin?) -> SelectedDay | null`
  `SelectedDay = { isoDate, origin?: { kind: 'record'|'daily-aggregate'|'period-aggregate', metric, recordId?, seriesKey? } }`.
  Only these fields are copied, so a display label or array index can never become identity. A malformed origin returns `null`.
- `selectedDayKey(day)` / `isSameSelectedDay(a, b)`: identity = date + kind + metric + recordId + seriesKey.
- Calendar address: `readCalendarDate`, `resolveCalendarDate(search, today)`, `withCalendarDate(search, iso)` (keeps other params),
  `buildCalendarHref(iso)` -> `/calendar?date=YYYY-MM-DD`.
- History: `planDayNavigation({search, selected, target, intent})`. `select | step | today` REPLACE; `open-in-calendar` PUSHES.
  Same day or unreal day = no navigation.
- `src/lib/dayEntryAdapters.ts`: `adherenceCellDay(iso, metric)`, `calorieHistoryDay(iso)`, `openDayLabel(iso)`.
- Notes (`src/lib/dayNote.ts`): `resolveDayNoteAccess` (ready / loading / unknown / read-only / signed-out / invalid-date),
  `draftFromNote`, `noteInputFromDraft`, `hasNoteChangedSince`.

## Chart integration (for the shared chart owner)

```ts
const day = createSelectedDay(point.date, { kind: 'record', metric: 'weight', recordId: row.id });
if (day) setSelected(day);
// open elsewhere:           navigate(buildCalendarHref(day.isoDate))            // push
// embed the agenda + note:  <ConnectedSelectedDayPanel day={day} />             // loads its own data, "Open in Calendar" on
//                           <SelectedDayPanel day={day} entries={...} ... />    // bring your own data (see useDayAgenda)
```

Keep chart-selection state account-scoped: clear it when `useDailyNotes().userId` changes (the panel's note editor already does).
Phase 1 does this by keeping the selection in the chart component (a date only, no account data): signing out unmounts the page
(ProtectedRoute), so one account's selected day can never reach another, and the inline panel's note editor is keyed by account.

## Phase 1 chart integration (shipped)

- Pure rules: `src/lib/chartSelection.ts`. Dataset contract: `ChartViewerDataset.selection` (`{ metric, valueKeys, dateKey?, recordId? }`,
  `false` = explicit opt-out) and `capabilities.daySelection`. State: `components/charts/useChartDaySelection.ts`
  (`ChartDaySelection`: `selected`, `toggleRow`, `togglePlot(isoDate, seriesKey)`, `step`, `canStep`, `clear`). Visuals:
  `ChartDaySelectionUi.tsx` (card readout, viewer bar, lazy inline `ConnectedSelectedDayPanel`), `ChartSelectionMarks.tsx` (dot hit
  circles, bar Cells, dashed day guide). Insight dates: `useOpenCalendarDay()` (push to `buildCalendarHref`).
- Identity is the dataset row id (ISO date). Rows are `daily-aggregate` days unless `recordId` supplies an exact record. The series
  clicked is not part of the identity. A row is selectable only with a real ISO date AND a real number in a `valueKeys` column.
- Eligible: TrendChart (Weight, Waist, Sleep, Recovery, Workout Duration, Calorie Balance; `daySelection={false}` opts out) and
  MacroTargetChart (Actual only; Min / Max targets are never selectable). Opted out: Calories by Time of Day, Body Recomposition
  Index (`selection: false`), plus Delta / Weekly / Report charts (no config).
- Card: click a point / bar -> readout (date, values, Open day, Clear), polite live region, no modal. Viewer: Previous / Next date
  (`aria-disabled` at the ends), Table rows share the selection, inline day panel below. Direct SVG clicks are additive: on a dense
  chart the buttons and the Table are the dependable path (bars can be under 1px wide).
- Selection resets when its row leaves the visible rows; a line/bar switch keeps it.

## Rebuild prompt

"Add a shared SelectedDay contract (strict ISO UTC dates, origin kinds record/daily-aggregate/period-aggregate, identity never from labels
or indexes). Make Calendar read/write `?date=` (replace on ordinary selection, push for explicit open, keep other params, invalid -> UTC
today). Build SelectedDayPanel (agenda + Open in Calendar + Add/Edit note) where the note editor is single-flight, closes only on a
`true` save result, keeps the draft on failure, is blocked when notes failed to load or for the demo account, and is keyed by account
and date. Make adherence cells and Calorie History day rows buttons that open the day."

## Gate 1 remediation (shipped)

- **Source status.** `src/lib/chartSourceStatus.ts` turns table states into a dataset `status`: `unavailable` when a source's first load
  failed, `stale` when only a refresh failed over kept rows, nothing otherwise (so a successful refresh clears it on the next render).
  No time is invented. Dashboard: `resolveDashboardData(...).sections[x].chartStatus` (the sources of that block); Reports:
  `reportChartStatus(states, REPORT_CHART_TABLES.x)`. Charts take an optional `status` prop. Unavailable datasets are not exportable
  and have no selectable days; the CSV name gets `_stale` for stale ones.
- **Account scope.** `useChartDaySelection(dataset, scope)` stores the scope with the choice and exposes `selected` only while the
  current scope matches, decided during render. Charts use `useAccountChartSelection` (user id from `contexts/userContextCore`,
  which has no Supabase import and works without a provider). The note editor is still keyed by account and date.
- **Observed intake.** `src/lib/macroIntake.ts` (`no-meals | unrecorded | partial | recorded`). The Dashboard macro rows carry
  `actual: number | null` plus `intake`; only `recorded` is selectable (an explicit 0 yes, `actual > 0` is never used). The actual line
  no longer connects across unlogged days. `ChartDatasetSelection.isObserved` carries the rule into the dataset.
- **Layering.** `selectedDay.ts` takes its Calendar path from `lib/routePaths.ts` (a test keeps it equal to `ROUTES.calendar`);
  `dayEntryAdapters.ts` uses the pure `lib/dayDisplay.ts` (a test keeps it identical to the Calendar model's formats).
