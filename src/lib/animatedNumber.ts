/**
 * Pure helpers behind the rolling-digit number (src/components/ui/animated-number.tsx).
 *
 * The number is first formatted to a plain string exactly the way the page already did, then split into
 * "digit" tokens (each becomes a rolling 0-9 column) and "static" tokens (separators, signs, units, "—").
 * Tokens are keyed from the RIGHT, so when a number grows from 999 to 1,000 the last three columns keep
 * their identity (and their animation state) and only the new left-hand columns appear.
 */

export type DigitToken = { kind: 'digit'; key: string; digit: number };
export type StaticToken = { kind: 'static'; key: string; char: string };
export type NumberToken = DigitToken | StaticToken;

export interface AnimatedNumberFormat {
  /** Full custom formatter. Wins over `formatOptions`. Lets a page keep its exact existing output. */
  format?: (value: number) => string;
  /** Intl.NumberFormat options, used when no `format` is given. Without either, the value is printed with String(value). */
  formatOptions?: Intl.NumberFormatOptions;
  locale?: string | string[];
  /** Always rendered as static text, never as rolling columns. */
  prefix?: string;
  suffix?: string;
  /** Shown instead of a number when the value is null, undefined or not finite. Default "—". */
  fallback?: string;
}

export const DEFAULT_FALLBACK = '—';
export const STAGGER_MS = 50;

export interface FormattedNumber {
  /** The complete visible string: prefix + body + suffix (or the fallback). Also the screen-reader text. */
  text: string;
  /** True when `text` is the fallback rather than a number. */
  isFallback: boolean;
  tokens: NumberToken[];
}

const isDigit = (ch: string) => ch >= '0' && ch <= '9' && ch.length === 1;

/** Format `value` the way a page would have, without prefix/suffix/fallback. */
export function formatBody(value: number, f: Pick<AnimatedNumberFormat, 'format' | 'formatOptions' | 'locale'> = {}): string {
  if (f.format) return f.format(value);
  if (f.formatOptions || f.locale) return new Intl.NumberFormat(f.locale, f.formatOptions).format(value);
  return String(value);
}

/**
 * Split `text` into tokens. Characters in the first `prefixLength` or last `suffixLength` positions are always static.
 * Keys count from the right ("d0" is the last digit), so columns stay stable when the digit count changes.
 */
export function tokenize(text: string, opts: { prefixLength?: number; suffixLength?: number } = {}): NumberToken[] {
  const chars = Array.from(text);
  const prefixLength = opts.prefixLength ?? 0;
  const suffixLength = opts.suffixLength ?? 0;
  const out: NumberToken[] = [];
  for (let i = chars.length - 1; i >= 0; i--) {
    const fromRight = chars.length - 1 - i;
    const ch = chars[i];
    const forcedStatic = i < prefixLength || fromRight < suffixLength;
    out.push(!forcedStatic && isDigit(ch)
      ? { kind: 'digit', key: `d${fromRight}`, digit: Number(ch) }
      : { kind: 'static', key: `s${fromRight}`, char: ch });
  }
  return out.reverse();
}

export function formatAnimatedNumber(value: number | null | undefined, f: AnimatedNumberFormat = {}): FormattedNumber {
  if (value == null || typeof value !== 'number' || !Number.isFinite(value)) {
    const text = f.fallback ?? DEFAULT_FALLBACK;
    return { text, isFallback: true, tokens: tokenize(text, { prefixLength: Array.from(text).length }) };
  }
  const prefix = f.prefix ?? '';
  const suffix = f.suffix ?? '';
  const text = `${prefix}${formatBody(value, f)}${suffix}`;
  return { text, isFallback: false, tokens: tokenize(text, { prefixLength: Array.from(prefix).length, suffixLength: Array.from(suffix).length }) };
}

/**
 * Delay (ms) per column key. Only columns whose digit actually changed are staggered, in left-to-right order,
 * so an unchanged leading digit never makes the changing ones wait. Returns {} on first render (prev is null):
 * nothing animates on mount.
 */
export function staggerDelays(prev: NumberToken[] | null, next: NumberToken[], stepMs = STAGGER_MS): Record<string, number> {
  if (!prev) return {};
  const before = new Map<string, number>();
  for (const t of prev) if (t.kind === 'digit') before.set(t.key, t.digit);
  const delays: Record<string, number> = {};
  let rank = 0;
  for (const t of next) {
    if (t.kind !== 'digit') continue;
    const was = before.get(t.key);
    if (was === undefined || was === t.digit) continue;
    delays[t.key] = rank * stepMs;
    rank += 1;
  }
  return delays;
}

/** translateY percentage that brings `digit` into view in a column of ten equal rows. */
export const digitOffsetPercent = (digit: number): number => (digit === 0 ? 0 : -digit * 10);
