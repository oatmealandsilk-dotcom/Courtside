import { lightColors as c } from '@/theme';
import { qrPath } from './qr';

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);

/** A tennis court from above, in the poster's green: the one picture it needs. */
const COURT = `<svg class="court" viewBox="-1 -1 80 38" aria-hidden="true"><g fill="none" stroke="${c.brand}" stroke-width="0.4">
<rect x="0" y="0" width="78" height="36"/><path d="M0 4.5H78M0 31.5H78M18 4.5V31.5M60 4.5V31.5M18 18H60M0 18H1.2M78 18H76.8"/>
<path d="M39 -1V37" stroke-width="1"/></g></svg>`;

/**
 * The club notice-board poster as one self-contained page: "Looking for a
 * hit at Griffith Park?", a large QR code carrying the printer's own invite
 * link, and tear-off tabs along the bottom. Everything is sized from the
 * page's width, so the same page fits US Letter, A4 and the preview on
 * screen. White paper and thin lines, to go easy on a home printer's ink.
 */
export function posterHtml({ club, link }: { club: string; link: string }): string {
  const qr = qrPath(link);
  const name = club.trim().slice(0, 60);
  const place = esc(name);
  // A long club name steps the headline down so it still fits in three lines.
  const headline = name.length <= 16 ? 10 : name.length <= 26 ? 8.6 : name.length <= 40 ? 7.2 : 6;
  const tabs = Array.from({ length: 8 }, () => '<div class="tab"><span><b>CourtSide</b><br>app.courtsidebase.com/join</span></div>').join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CourtSide poster${name ? ` · ${place}` : ''}</title>
<style>
@page { margin: 0.4in; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --u: 1vw; }
html, body { background: #fff; }
body { font-family: Inter, -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: ${c.text}; -webkit-print-color-adjust: exact; print-color-adjust: exact; -webkit-text-size-adjust: 100%; }
@media screen { :root { --u: 0.9vw; } body { padding: 5vw; } }
.page { position: relative; width: calc(var(--u) * 100); height: calc(var(--u) * 129); display: flex; flex-direction: column; overflow: hidden; }
.court { position: absolute; right: 0; top: 0; width: calc(var(--u) * 38); opacity: 0.5; }
.mark { position: relative; font-weight: 700; font-size: calc(var(--u) * 3.9); letter-spacing: -0.02em; color: ${c.brand}; }
h1 { position: relative; margin-top: calc(var(--u) * 17); font-size: calc(var(--u) * ${headline}); line-height: 0.98; letter-spacing: -0.04em; font-weight: 700; max-width: calc(var(--u) * 84); }
h1 em { font-style: normal; color: ${c.brand}; }
.lead { margin-top: calc(var(--u) * 4); font-size: calc(var(--u) * 2.9); line-height: 1.42; color: ${c.textMuted}; max-width: calc(var(--u) * 72); }
.scan { margin-top: auto; display: flex; align-items: center; gap: calc(var(--u) * 4.5); padding: calc(var(--u) * 3.2); border-radius: calc(var(--u) * 3.2); background: ${c.bg}; border: 1px solid ${c.border}; }
.qr { flex: none; width: calc(var(--u) * 25); height: calc(var(--u) * 25); background: #fff; border-radius: calc(var(--u) * 1.4); }
.scan h2 { font-size: calc(var(--u) * 4.8); line-height: 1.05; letter-spacing: -0.025em; font-weight: 700; }
.scan p { margin-top: calc(var(--u) * 1.4); font-size: calc(var(--u) * 2.3); line-height: 1.45; color: ${c.textMuted}; }
.scan .url { margin-top: calc(var(--u) * 2.2); font-size: calc(var(--u) * 2.3); font-weight: 600; color: ${c.brand}; }
.cut { position: relative; margin-top: calc(var(--u) * 4.5); border-top: 1.5px dashed ${c.borderStrong}; }
.cut i { position: absolute; left: 0; top: calc(var(--u) * -1.7); padding-right: calc(var(--u) * 1); background: #fff; font-style: normal; font-size: calc(var(--u) * 2.4); line-height: 1; color: ${c.textFaint}; }
.tabs { display: flex; height: calc(var(--u) * 24); }
.tab { flex: 1; display: flex; align-items: center; justify-content: center; border-right: 1.5px dashed ${c.borderStrong}; }
.tab:last-child { border-right: 0; }
.tab span { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-size: calc(var(--u) * 1.45); line-height: 1.35; color: ${c.textMuted}; }
.tab b { color: ${c.brand}; }
</style></head><body><div class="page">
${COURT}
<div class="mark">CourtSide</div>
<h1>Looking for a hit${name ? ` at <em>${place}</em>` : ''}?</h1>
<p class="lead">Post when you want to play: the time, the court, your level. Players ${name ? 'here' : 'near you'} tap “I’m in”, and a group chat opens with everyone.</p>
<div class="scan">
<svg class="qr" viewBox="-3 -3 ${qr.size + 6} ${qr.size + 6}" shape-rendering="crispEdges" role="img" aria-label="QR code to join CourtSide"><path fill="${c.text}" d="${qr.d}"/></svg>
<div><h2>Scan to join</h2><p>Point your phone’s camera here. Free, and it opens in your browser: nothing to install. Share clips, get tips and ask questions there too.</p><div class="url">app.courtsidebase.com/join</div></div>
</div>
<div class="cut"><i>✂</i></div>
<div class="tabs">${tabs}</div>
</div></body></html>`;
}
