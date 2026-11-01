/**
 * Route strings that pure code (src/lib) needs. Kept here, free of app, icon and router imports, so a lib file never
 * depends on the app shell. tests/selectedDay.test.ts checks each one still equals its entry in `ROUTES`
 * (src/app/navigation.ts), which stays the source of truth for the app.
 */
export const CALENDAR_PATH = '/calendar';
