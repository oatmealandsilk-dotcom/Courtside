/**
 * How a visitor turns Location back on for this site, in two steps, for the
 * browser they are actually in (guest courts map, Oct 29: "Location is off —
 * here's how to turn it on"). Read from the browser's own description of
 * itself (its user agent): iPhone Safari, an app's built-in browser
 * (Messenger, Instagram, Facebook), Chrome, or anything else.
 */
export interface LocationHelp {
  /** Where they are, in a few words, for the top of the steps ("In Messenger on iPhone"). */
  where: string;
  steps: [string, string];
}

/** The app whose built-in browser this is, if it is one we can name. */
function inAppName(ua: string): string | null {
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/MessengerForiOS|Orca-Android|\bMessenger\b/i.test(ua)) return 'Messenger';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'Facebook';
  if (/musical_ly|TikTok|Bytedance/i.test(ua)) return 'TikTok';
  if (/Snapchat/i.test(ua)) return 'Snapchat';
  return null;
}

export function locationHelpFor(ua: string): LocationHelp {
  const iPhone = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
  const android = /Android/i.test(ua);
  const app = inAppName(ua);
  if (app && iPhone) {
    return {
      where: `In ${app} on iPhone`,
      steps: [
        `Open your iPhone’s Settings, then tap Apps → ${app} → Location.`,
        'Choose While Using the App, come back here and tap Try again.',
      ],
    };
  }
  if (app && android) {
    return {
      where: `In ${app}`,
      steps: [
        'Tap ⋮ at the top right, then Open in Chrome (or Open in browser).',
        'Tap Find a hit near me there and choose Allow.',
      ],
    };
  }
  if (iPhone && /CriOS/i.test(ua)) {
    return {
      where: 'In Chrome on iPhone',
      steps: [
        'Open your iPhone’s Settings, then tap Apps → Chrome → Location.',
        'Choose While Using the App, come back here and tap Try again.',
      ],
    };
  }
  if (iPhone) {
    return {
      where: 'In Safari on iPhone',
      steps: [
        'Tap ᴀA at the left of the address bar, then Website Settings.',
        'Set Location to Allow, then tap Try again.',
      ],
    };
  }
  if (android) {
    return {
      where: 'In Chrome',
      steps: [
        'Tap the icon at the left of the web address, then Permissions.',
        'Turn Location on, then tap Try again.',
      ],
    };
  }
  return {
    where: 'In your browser',
    steps: [
      'Click the icon at the left of the web address (a lock or sliders).',
      'Set Location to Allow, then click Try again.',
    ],
  };
}
