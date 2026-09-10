import React from 'react';

// Native navigation already animates its screens.
export function RouteTransition({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
