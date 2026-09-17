import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

/**
 * The page every web route is served inside. `viewport-fit=cover` is what
 * lets a phone browser report the notch and home bar, so the app can keep
 * its wordmark and bottom bar clear of them.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#F8F0E9" />
        <title>CourtSide</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: 'html, body, #root { height: 100%; } body { overscroll-behavior-y: none; -webkit-tap-highlight-color: transparent; }' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
