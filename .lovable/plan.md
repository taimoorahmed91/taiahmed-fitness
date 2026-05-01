## Goal

Add a small live countdown next to the "Dashboard" H1 showing how much time remains until the app's "today" rolls over (i.e., until **00:00 UTC**, since all the app's date logic uses UTC). Do not touch any of the existing date/reset logic.

## Where

`src/pages/Dashboard.tsx` — only the header block:

```tsx
<div>
  <h1 className="text-3xl font-bold">Dashboard</h1>
  <p className="text-muted-foreground mt-1">Track your nutrition and fitness progress</p>
</div>
```

## Change

Wrap that block in a flex row that pushes the countdown to the right, on the same line as the H1.

```text
┌──────────────────────────────────────────────────────────────┐
│ Dashboard                              ⏱ Resets in 04:32:18 │
│ Track your nutrition and fitness progress                    │
└──────────────────────────────────────────────────────────────┘
```

## Implementation details

1. Add a small inline component (or inline `useState` + `useEffect`) inside `Dashboard.tsx` — no new files, no new hooks elsewhere.
2. State holds remaining ms until next UTC midnight, computed as:
   ```ts
   const now = new Date();
   const nextUtcMidnight = Date.UTC(
     now.getUTCFullYear(),
     now.getUTCMonth(),
     now.getUTCDate() + 1
   );
   const remainingMs = nextUtcMidnight - now.getTime();
   ```
3. `setInterval` of 1000 ms; clear on unmount.
4. Format as `HH:MM:SS` (zero-padded).
5. Layout: change the wrapper to `flex items-start justify-between gap-4`, put the existing `<h1>` + `<p>` in the left child, put the countdown on the right aligned with the H1 baseline (e.g., `text-sm text-muted-foreground` with a `Clock` icon from `lucide-react`).
6. Tooltip/title attribute: `"Daily data resets at 00:00 UTC"` so it's clear why the timer exists.

## Out of scope

- No changes to any "today"/UTC logic anywhere else.
- No changes to the daily summary function, meals, gym, goals, or WHOOP code.
- No changes to other pages.