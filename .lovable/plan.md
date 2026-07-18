## Rename "Activity Logs" to "Audit Log"

Update the user-facing label from "Activity Logs" / "Activity Log" to "Audit Log" across the UI. No database or table renames — `fittrack_activity_logs` and the `useActivityLog` hook stay as-is (internal naming).

### Changes

1. **`src/components/Navigation.tsx`**
   - Sidebar link label: `'Activity Logs'` → `'Audit Log'`.
   - Route stays `/logs` (or optionally add `/audit-log` alias — see question below).

2. **`src/pages/ActivityLogs.tsx`**
   - Page heading: `Activity Logs` → `Audit Log`.
   - Subtitle: "Complete audit trail of all your actions" (already fine).
   - Card title "Log Entries" → "Audit Entries".
   - Empty state text: "No activity logs found" → "No audit entries found".
   - Loading text: "Loading logs..." → "Loading audit log...".

3. **`index.html`** (if the route has specific meta) — not needed unless referenced.

### Out of scope (unless you say otherwise)
- Renaming the DB table `fittrack_activity_logs`.
- Renaming the hook `useActivityLog` / file `useActivityLog.ts`.
- Changing the route path `/logs`.
- Changing category/action enum values.
