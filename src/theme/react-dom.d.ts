// The web build's react-dom, which ships without its own types here. Only
// what the app uses is declared: flushSync for the theme cross-fade, and
// createPortal for the group photo's Move and Scale step on the web.
declare module 'react-dom' {
  export function flushSync<R>(fn: () => R): R;
  export function createPortal(children: import('react').ReactNode, container: Element): import('react').ReactElement;
}
