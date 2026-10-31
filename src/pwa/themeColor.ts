// Keeps the browser/status-bar colour in step with the in-app light/dark toggle.
// index.html declares two <meta name="theme-color"> tags keyed to the OS setting; when the person picks
// a theme inside the app (class "dark" on <html>), both tags are pointed at that theme's surface colour.
export const THEME_COLORS = { light: '#f5f5f5', dark: '#171717' } as const;

export const themeColorFor = (isDark: boolean): string => (isDark ? THEME_COLORS.dark : THEME_COLORS.light);

export const startThemeColorSync = (): (() => void) => {
  const apply = () => {
    const color = themeColorFor(document.documentElement.classList.contains('dark'));
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', color);
    });
  };
  // Only take over once the app has set a theme class; until then the OS-based tags apply.
  const hasThemeClass = () => document.documentElement.classList.contains('dark') || document.documentElement.classList.contains('light');
  const observer = new MutationObserver(() => {
    if (hasThemeClass()) apply();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if (hasThemeClass()) apply();
  return () => observer.disconnect();
};
