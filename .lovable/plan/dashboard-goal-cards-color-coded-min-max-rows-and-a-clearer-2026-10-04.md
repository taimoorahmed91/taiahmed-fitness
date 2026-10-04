# Dashboard goal cards: color-coded Min/Max rows and a clearer progress bar

## What's changing

### 1. Distinct colors for the Min and Max rows
In all three dashboard goal boxes (Daily Calorie Goal, Daily Protein Target, Daily Carb Target):
- **Min row** — green accent (border tint + green "Min" label / remaining text). Reaching the min is the goal, so it reads as "target".
- **Max row** — orange/red accent. The max is a limit, so it reads as "don't cross this".

### 2. Make the progress bar match and explain the empty tail
The bar is currently scaled to 115% of the max target, so the space after the Max marker is empty headroom (the "over-target" zone). Changes:
- Color the **Min marker** green and the **Max marker** red/orange so they match the rows below.
- Shade the headroom zone after the Max marker as a subtle hatched/striped strip labeled only visually (no text change needed) so it's recognizable as intentional buffer, not blank space.
- Keep the same 15% headroom so exceeding the max is still visible.

## Files
- `src/components/TargetRangeBar.tsx` — colored markers + shaded over-target zone.
- `src/components/CalorieGoalProgress.tsx` — colored Min/Max rows.
- `src/components/MacroTargetCard.tsx` — colored Min/Max rows (protein and carb cards use this).

## Verification
- Type check passes.
- Preview the dashboard: each of the three goal boxes shows a green Min row, an orange/red Max row, and a progress bar whose markers and buffer zone match.
