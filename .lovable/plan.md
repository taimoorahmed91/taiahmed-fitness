# Min/Max targets for calories, protein and carbs

## What changes for you
- **Personal Data page**: each target becomes a pair of boxes.
  - Gym day calories: Min / Max
  - Rest day calories: Min / Max
  - Protein multiplier: Min / Max
  - Carb multiplier: Min / Max
  - Your current single values are copied into both Min and Max, so nothing breaks; you then adjust them.
- **Dashboard progress cards** (Calorie goal, Protein target, Carb target): one progress bar, with two small markers showing where Min and Max sit. Text reads e.g. "1,850 / 2,300–2,600 cal". Color: below min = amber, between = green, above max = red.
- **Dashboard line charts** (Actual vs Target): still one chart each, with two dashed lines (Min and Max) instead of one target line, plus the actual line. Y-axis scaling includes both.
- **Meals page "Remaining Today"**: shows remaining to reach min and to max (e.g. "120–420 cal left").
- **Calorie History**: shows target as a range (min–max) and the % is measured against min and max (e.g. "92% / 81%").
- **Change history**: min/max edits to calorie targets are tracked like today.
- Extra activity calories are still added to both min and max.

## Technical details
- Migration on `fittrack_personal_data`: add `gym_day_calorie_target_max`, `rest_day_calorie_target_max`, `protein_multiplier_max`, `carb_multiplier_max` (existing columns become the "min"); backfill max = existing value. Update `log_fittrack_personal_data_changes` trigger to log the new fields.
- `usePersonalData`: add the 4 fields; PersonalData form with paired inputs (decimal text inputs, validate min <= max).
- `Dashboard.resolveGoalForDate` returns `{ min, max }`; macro data rows become `{ date, actual, min, max }`.
- `MacroTargetChart`: two dashed `Line`s (min, max), legend/tooltip updated, yDomain includes both.
- `CalorieGoalProgress`, `ProteinTargetCard`, `CarbTargetCard`: accept min/max, render markers on the bar (bar scale = max * 1.15).
- Update `Meals.tsx`, `CalorieHistory.tsx`, `YesterdayStatus`, JSON export/import for new fields.
