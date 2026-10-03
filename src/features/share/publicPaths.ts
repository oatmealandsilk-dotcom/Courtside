/** Addresses a signed-out visitor may open: a shared post, profile, open hit, thread or court, and an invite. */
export function isPublicPath(pathname: string): boolean {
  return /^\/(post|user|question|court)\/[^/]+\/?$/.test(pathname)
    || (/^\/hit-request\/[^/]+\/?$/.test(pathname) && pathname !== '/hit-request/new')
    || pathname === '/join';
}
