export const SWIPE_STOPS = [
  { pathname: '/', section: '' },
  { pathname: '/discuss', section: 'discussions' },
  { pathname: '/discuss', section: 'players' },
  { pathname: '/coaches', section: '' },
  { pathname: '/profile', section: 'Posts' },
  { pathname: '/profile', section: 'Reels' },
  { pathname: '/profile', section: 'Tagged' },
] as const;
export function swipeDestination(pathname: string, section: string | undefined, direction: 1 | -1) {
  const index = SWIPE_STOPS.findIndex(stop => stop.pathname === pathname && (!stop.section || stop.section === (section ?? (pathname === '/discuss' ? 'discussions' : 'Posts'))));
  if (index < 0) return undefined;
  return SWIPE_STOPS[index + direction];
}
export function horizontalSwipe(dx: number, dy: number) {
  return Math.abs(dx) >= 65 && Math.abs(dx) > Math.abs(dy) * 1.6;
}
