# Remove the leftover calorie-goal pencil from the dashboard

## Goal
The Daily Calorie Goal box on the dashboard must be read-only. Calorie targets (gym day / rest day, min and max) are set only on the Personal Data page. The pencil edit on the dashboard is a leftover from an older version and will be removed.

## Changes

### 1. `src/components/CalorieGoalProgress.tsx`
- Remove the pencil button in the card header and the editing state (`isEditing`, `editValue`, `handleSave`, `handleCancel`).
- Remove the inline input with the check/cross buttons that appears while editing.
- Remove the now-unused imports (`useState`, `Button`, `Input`, `Pencil`, `Check`, `X`).
- Remove the `onGoalChange` prop from the component interface.
- Keep everything else as-is: the Gym day / Rest day badge, the range bar, and the three rows (Consumed, Min with remaining + %, Max with remaining + %).

### 2. `src/pages/Dashboard.tsx`
- Stop passing `onGoalChange={updateCalorieGoal}` to `CalorieGoalProgress`.
- Remove `updateCalorieGoal` from the `useUserSettings()` destructure on the dashboard.

### 3. `src/hooks/useUserSettings.ts`
- Remove the `updateCalorieGoal` function and its export, since nothing else uses it (verified: only the dashboard referenced it).
- The underlying `calorie_goal` setting column stays in the database untouched — it is simply no longer editable from the dashboard.

## Verification
- Run the TypeScript check (`tsgo --noEmit`) to confirm no leftover references.
- Confirm the dashboard box shows Consumed / Min / Max rows with no pencil icon, and that targets still come from the Personal Data values (gym vs rest day auto-pick keeps working).
