// Tiny DOM test harness for "mounted" tests. It needs jsdom, a devDependency found automatically after `bun install`.
// JSDOM_PATH can point at another copy. Plain `bun test` skips the mounted files when jsdom is missing;
// `bun run test` (REQUIRE_MOUNTED=1) fails instead.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDom = any;

export const loadJsdom = async (): Promise<AnyDom | null> => {
  try {
    const mod: AnyDom = await import(process.env.JSDOM_PATH ?? 'jsdom');
    return mod.JSDOM ?? mod.default?.JSDOM ?? null;
  } catch {
    return null;
  }
};

export const installDom = (JSDOM: AnyDom) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const w = dom.window as AnyDom;
  const g = globalThis as AnyDom;
  const define = (key: string, value: unknown) => Object.defineProperty(g, key, { value, configurable: true, writable: true });
  for (const key of [
    'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement',
    'HTMLTextAreaElement', 'HTMLFormElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'InputEvent',
    'CustomEvent', 'MutationObserver', 'getComputedStyle', 'DocumentFragment', 'SVGElement', 'NodeFilter', 'DOMParser',
  ]) define(key, w[key]);
  define('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0));
  define('cancelAnimationFrame', (id: number) => clearTimeout(id));
  class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  define('ResizeObserver', Observer);
  define('IntersectionObserver', Observer);
  w.ResizeObserver = Observer;
  w.matchMedia = w.matchMedia ?? ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  define('matchMedia', w.matchMedia);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLElement.prototype.hasPointerCapture = () => false;
  w.HTMLElement.prototype.setPointerCapture = () => {};
  w.HTMLElement.prototype.releasePointerCapture = () => {};
  define('IS_REACT_ACT_ENVIRONMENT', true);
  return { dom, window: w };
};

/** Types into an input/textarea the way a person does, so React's onChange fires. */
export const typeInto = (window: AnyDom, el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};

export const click = (window: AnyDom, el: Element) => {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
};

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
