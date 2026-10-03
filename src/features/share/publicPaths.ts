/** Addresses a signed-out visitor may open: a shared post, profile, open hit, thread, court or group invite, and an invite. */
export function isPublicPath(pathname: string): boolean {
  return /^\/(post|user|question|court|g)\/[^/]+\/?$/.test(pathname)
    || (/^\/hit-request\/[^/]+\/?$/.test(pathname) && pathname !== '/hit-request/new')
    || pathname === '/join';
}
