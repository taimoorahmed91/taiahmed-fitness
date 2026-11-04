import * as React from "react";

import {
  digitOffsetPercent,
  formatAnimatedNumber,
  staggerDelays,
  type AnimatedNumberFormat,
  type NumberToken,
} from "@/lib/animatedNumber";
import { cn } from "@/lib/utils";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export interface AnimatedNumberProps extends AnimatedNumberFormat {
  value: number | null | undefined;
  className?: string;
}

/*
 * The visible glyphs are drawn with CSS `content: attr(data-*)` instead of text nodes. That keeps the DOM text
 * equal to the real value (only the sr-only copy), so copy/paste, find-in-page, tests and screen readers never
 * see a pile of 0123456789 columns.
 */

/** One rolling 0-9 column. The invisible "0" in normal flow sets its size; the strip of ten digits slides behind a clip window. */
const DigitColumn = React.memo(({ digit, delayMs }: { digit: number; delayMs: number }) => (
  <span className="relative inline-block text-center">
    <span className="invisible before:content-['0']" />
    <span className="absolute inset-0 overflow-hidden">
      <span
        className="block transition-transform duration-500 ease-[cubic-bezier(0.34,1.3,0.64,1)] [will-change:transform] motion-reduce:transition-none"
        style={{ transform: `translateY(${digitOffsetPercent(digit)}%)`, transitionDelay: `${delayMs}ms` }}
      >
        {DIGITS.map((d) => (
          <span key={d} data-d={d} className="block before:content-[attr(data-d)]" />
        ))}
      </span>
    </span>
  </span>
));
DigitColumn.displayName = "DigitColumn";

/**
 * Odometer-style number. Every digit is its own column that slides to its new value when the number changes,
 * one column after another (50ms apart). Nothing moves on first render, only on change.
 *
 * - Pass the same formatting the page used before (`format`, or `formatOptions`, `prefix`, `suffix`, `fallback`) and the
 *   visible text stays exactly the same; only digits roll, everything else (commas, dots, signs, units, "—") is static.
 * - Takes its colour and size from the parent. Tabular figures and fixed-size columns mean no layout shift.
 * - Screen readers read the real text once; the rolling columns are hidden from them.
 * - With prefers-reduced-motion the digits switch instantly.
 */
export const AnimatedNumber = ({ value, className, ...format }: AnimatedNumberProps) => {
  const { text, tokens } = formatAnimatedNumber(value, format);

  // Remember the tokens of the previous committed render, to know which columns changed.
  const prevRef = React.useRef<NumberToken[] | null>(null);
  const delays = staggerDelays(prevRef.current, tokens);
  React.useEffect(() => {
    prevRef.current = tokens;
  });

  return (
    <span className={cn("relative inline-block whitespace-nowrap tabular-nums", className)} data-animated-number="">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {tokens.map((t) =>
          t.kind === "digit" ? (
            <DigitColumn key={t.key} digit={t.digit} delayMs={delays[t.key] ?? 0} />
          ) : (
            <span key={t.key} data-c={t.char} className="whitespace-pre before:content-[attr(data-c)]" />
          ),
        )}
      </span>
    </span>
  );
};
