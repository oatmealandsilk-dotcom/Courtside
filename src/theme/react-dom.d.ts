// The web build's react-dom, which ships without its own types here. Only
// the one function the theme cross-fade needs is declared.
declare module 'react-dom' {
  export function flushSync<R>(fn: () => R): R;
}
