/**
 * iOS Safari only applies the :active state (which drives the button press effect) when the page
 * has at least one touch listener. A passive no-op listener on the document turns it on for every
 * control without changing scrolling or click behaviour. Safe to call more than once.
 */
let installed = false;

export function enableTouchActive(target: Pick<Document, "addEventListener"> | undefined = typeof document === "undefined" ? undefined : document): boolean {
  if (installed || !target) return false;
  target.addEventListener("touchstart", () => {}, { passive: true });
  installed = true;
  return true;
}
