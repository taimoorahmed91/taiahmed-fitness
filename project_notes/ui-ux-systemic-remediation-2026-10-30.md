# FitTrack systemic UI/UX remediation

## What was built

The original 72-item UI/UX audit was implemented as shared application contracts rather than isolated page fixes. The work includes semantic colour and chart tokens, consistent interaction primitives, a unified responsive shell and navigation, accessible forms and charts, mobile workout logging, honest loading/error states, shared data caching and refresh, PWA/offline workout support, and route-level code splitting.

Dashboard chart ranges remain independent per chart. Each chart persists its own 7D/14D/30D/90D/All and line/bar preferences; changing one graph never changes another.

The later presentation pass added a shared history system instead of repeating bordered row cards:

- Meals use day-grouped ledger rows with truthful daily totals and whole-day pagination.
- Gym uses week-grouped expandable workout summaries with structured exercises and sets.
- Weight, waist and sleep use month-grouped metric histories with neutral deltas.
- WHOOP uses week-grouped summaries with progressive disclosure of all readings.
- Personal Data uses an at-a-glance summary, structured settings sections and local history timelines.
- Compare uses a three-step selection/comparison workspace.
- Calendar uses a scannable month grid and grouped selected-day agenda.
- All chart cards use one `ChartHeader`, keeping range/style/PDF controls together responsively.

## Important architecture

- `src/index.css`, `tailwind.config.ts`: contrast-tested semantic tokens and interaction states.
- `src/components/ui/`: shared Button, IconButton, RowActions, SegmentedControl, responsive Card/Dialog/Sheet defaults and touch targets.
- `src/components/layout/`, `src/app/navigation.ts`: one application shell, grouped navigation, mobile bottom navigation, safe-area handling and global refresh ownership.
- `src/components/charts/`, `src/lib/chartTheme.ts`: chart theme, summaries, accessible tables, range controls and empty-state actions.
- `src/components/history/`, `src/lib/historyDates.ts`, `src/lib/historyPaging.ts`: shared grouped histories, disclosures, action trays and whole-group pagination.
- `src/components/personal-data/`: Personal Data summary, sections, ranges, schedule and history timelines.
- `src/components/compare/`, `src/components/calendar/`: data-specific Compare and Calendar interaction systems.
- `src/lib/sharedData.ts`, `src/lib/sharedTable.ts`: user-keyed React Query caching and explicit loading/error/stale states.
- `src/app/globalRefresh.ts`: single-flight refresh for shared tables and non-query sources.
- `src/lib/workoutDraft.ts`: identity-bound workout drafts, legacy quarantine, storage-failure handling and snapshot-based recovery.
- `src/pwa/`, `vite.config.ts`: prompt-based PWA updates, NetworkOnly private data, offline shell/templates and update blocking during workouts.

## Verification completed

- `bun run test`: 1,383 passed, 0 failed; mounted DOM suites included.
- `bun run typecheck`: passed.
- `bun run build`: passed, including generated PWA service worker.
- `git diff --check`: passed.
- Production-browser audit: 19 signed-in routes, widths 320/375/390/768/1024/1440, light and dark.
- Targeted runtime checks covered responsive overflow, controls, contrast, failure/retry states, dialogs, popovers, chat clearance and independent chart ranges.
- Independent final review: F01–F72 = 72 Closed, 0 Partial, 0 Open.

## Rebuild prompt

> In the FitTrack React/Vite/Tailwind/shadcn application, recreate the systemic UI/UX remediation represented by the current source and tests. Use semantic light/dark tokens with automated contrast tests; shared accessible interaction primitives with 44px coarse-pointer targets; one responsive AppLayout with grouped desktop navigation and a mobile bottom bar; per-chart persisted range/style controls (never synchronize dashboard chart ranges); chart summaries and accessible tables; explicit loading/error/stale/true-empty states; a shell-owned single-flight refresh system; user-keyed React Query caches; confirmed mutation results that retain drafts on failure; identity-bound workout recovery using original exercise indexes and saved snapshots; and a conservative PWA that never caches private API data or updates during an active workout. Preserve UTC calendar conventions and all workout ordering/timestamp invariants. Run `bun run test`, `bun run typecheck`, `bun run build`, browser audits at 320–1440px in light/dark, and require all 72 audit findings to be closed before handoff.

## Dependencies and decisions

- `vite-plugin-pwa` provides the service worker.
- `jsdom@26.1.0` supports the mounted suites on Node 22.18.
- Sonner is the only toast system.
- System font stacks replace render-blocking web-font imports.
- Offline mode does not fabricate authentication or queue arbitrary writes.
- Expired offline sessions require reconnecting; workout drafts remain recoverable.

## Remaining certification limits

- Real iOS/Android installed-PWA behavior, native keyboards/pickers, safe areas and audio/vibration require physical-device validation.
- Live writable-account and production RLS behavior are not certified by demo/browser mocks.
- The changes are intentionally uncommitted; unrelated `project_notes` presentation/video artifacts must not be included in any future commit unless explicitly requested.
