# Improve MacroTargetChart Y-axis scaling

## Goal
Make the Calorie, Protein, and Carbs "Actual vs Target" line charts on the Dashboard easier to read by dynamically setting the Y-axis minimum and maximum based on the data range, rather than always starting at 0.

## What will change
- Update `src/components/MacroTargetChart.tsx` so its Y-axis domain is computed from the plotted values.
- The domain will include both **actual** and **target** values so the target line stays visible even when it lies outside the actual-value range.
- Add a small padding (about 10%) above the max and below the min so the line does not touch the chart edges.
- Keep the existing tooltip, legend, and styling unchanged.

## Implementation details
1. In `MacroTargetChart`, compute:
   - `minValue` = smallest non-null value among `actual` and `target`.
   - `maxValue` = largest non-null value among `actual` and `target`.
   - `padding` = 10% of the range, with a minimum fallback so very small ranges still look reasonable.
   - `yMin` = `minValue - padding`, rounded down to a nice number.
   - `yMax` = `maxValue + padding`, rounded up to a nice number.
2. Pass `domain={[yMin, yMax]}` to the Recharts `<YAxis>`.
3. Guard against empty or all-zero data so the chart still renders sensibly (e.g., fall back to `[0, 1]` or the original behavior when there is no meaningful range).
4. No changes are needed in `src/pages/Dashboard.tsx`; the same three `<MacroTargetChart>` calls will automatically use the improved scaling.

## Verification
- Run the build to confirm no TypeScript errors.
- Check the Dashboard preview to ensure the three charts rescale and the dashed target lines remain visible.
