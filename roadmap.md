- [x] Add 7D/30D and line/bar views to WHOOP recovery, workout duration, calorie balance, weight, waist, and sleep charts.
- [x] Extend dashboard data to 30 days for charts previously restricted to seven.
- [ ] Verify charts render and controls switch correctly in an authenticated preview (blocked if no preview session is available).
- [x] Add 7D/30D meal-time distribution with a percentage legend and distinct category colors.
- [x] Match single-series trend lines and bars to their title icon color; preserve multi-series color roles.
- [x] Match the meal-time pie slices to the dashboard's existing chart palette.
- [x] Use dashboard orange and green rather than white and green for the two-series sleep chart.
## Page audit phases
- [x] Phase 1: Gym weekly schedule tracker + last workout snapshot
- [x] Phase 2: Meals target bars, macro split, simpler filters
- [x] Phase 3: Extra Activity impact card + full-width history
- [x] Body pages phase 1: Weight, Waist, Sleep overview cards
- [x] Body pages phase 2: Calorie History summary, Daily Notes insights/filters, WHOOP layout
- [x] Body pages phase 3: Calendar month summary, theme colors on Compare/Reports/Achievements, badge progress
- [x] Body pages phase 4: Audit Log colors, Messaging status overview, User Approval redesign

## Current updates
- [x] Order template exercise display by previous workout sequence, preserving original data indexes and saving display order for recovery; boundary tests pass.
- [x] Show dashboard last successful meals fetch time with a single-flight manual refresh control.
- [ ] Verify both updates signed in (external Supabase does not provide a managed preview session).

## Enhancements round
- [x] Rest timer sound + vibration with mute toggle
- [x] Live workout volume and all-time PR badges
- [x] Installable home-screen app (manifest, icons) and real page title/description
- [x] Quick-add starred/frequent meals
- [x] Projected body mass change from WHOOP energy balance on Calorie History
- [ ] Verify signed in (no managed preview session for this project)
