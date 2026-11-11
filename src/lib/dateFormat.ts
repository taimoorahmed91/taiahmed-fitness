// Every date the app shows is day/month/year. Weekday (if asked) comes first: "Fri, 30/10/2026".
// Options without a day (e.g. a month title) keep the words: "November 2026".
export const formatDMY = (date: number | Date, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'numeric', year: 'numeric' }): string => {
  const ms = typeof date === 'number' ? date : date.getTime();
  if (!options.day) return new Intl.DateTimeFormat('en-GB', options).format(ms);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: options.timeZone, weekday: options.weekday, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(ms);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const core = `${get('day')}/${get('month')}${options.year ? `/${get('year')}` : ''}`;
  return options.weekday ? `${get('weekday')}, ${core}` : core;
};
