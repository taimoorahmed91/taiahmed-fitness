// One treatment for the "pin to quick add" toggle, shared by the Quick add chips (MealForm) and the meal history (MealList),
// so the two always say and look the same: a Pin icon (filled and tilted when pinned), one stable accessible name with
// aria-pressed, a tooltip that says what the NEXT tap does, and a focus ring drawn inside the control.

/** Stable accessible name. It never changes with the state: `aria-pressed` carries pinned / not pinned. */
export const quickAddPinLabel = (food: string) => `Pin ${food} to quick add`;

/** What the next tap does (tooltip). */
export const quickAddPinTooltip = (pinned: boolean) => (pinned ? 'Unpin from quick add' : 'Pin to quick add');

/** Focus ring inside the control, so a rounded or clipped parent never cuts it off. */
export const QUICK_ADD_PIN_FOCUS = 'focus-visible:ring-inset focus-visible:ring-offset-0';
