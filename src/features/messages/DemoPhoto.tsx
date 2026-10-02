import React from 'react';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

/*
 * The demo's chat photos. The demo ships no picture files (avatars are
 * initials, posts are court cards), so its photo messages carry "demo:"
 * addresses and these draw the pictures: a court under the lights, clay at
 * sunset, a few balls on a hard court. The colours are the pictures' own,
 * like a photo's, not the app's theme. Each has a real photo's shape, so the
 * bubbles and the full-screen view lay them out exactly as they would a
 * picture from a camera roll.
 */

/** The demo pictures and their shapes (width × height, as a camera would report them). */
export const DEMO_PHOTOS = {
  'demo:court-night': { w: 1600, h: 1200 },
  'demo:clay-sunset': { w: 1200, h: 1600 },
  'demo:balls': { w: 1400, h: 1400 },
} as const;

export function DemoPhoto({ path, fit = 'cover' }: { path: string; fit?: 'cover' | 'contain' }) {
  const aspect = fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
  if (path === 'demo:clay-sunset') return <ClaySunset aspect={aspect} />;
  if (path === 'demo:balls') return <Balls aspect={aspect} />;
  return <CourtNight aspect={aspect} />;
}

/** A hard court from the stands at night: floodlit blue, white lines, a ball by the service line. */
function CourtNight({ aspect }: { aspect: string }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio={aspect}>
      <Defs>
        <RadialGradient id="cn-sky" cx="50%" cy="0%" r="90%">
          <Stop offset="0" stopColor="#3A5F8F" />
          <Stop offset="0.55" stopColor="#152A44" />
          <Stop offset="1" stopColor="#0A1624" />
        </RadialGradient>
        <LinearGradient id="cn-surround" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#24563F" />
          <Stop offset="1" stopColor="#2F6E50" />
        </LinearGradient>
        <LinearGradient id="cn-court" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2F64A3" />
          <Stop offset="1" stopColor="#3F7CC2" />
        </LinearGradient>
        <RadialGradient id="cn-glow" cx="50%" cy="38%" r="60%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="cn-ball" cx="38%" cy="32%" r="70%">
          <Stop offset="0" stopColor="#F7FF8A" />
          <Stop offset="0.6" stopColor="#D9EC2C" />
          <Stop offset="1" stopColor="#9DB21A" />
        </RadialGradient>
        <RadialGradient id="cn-vignette" cx="50%" cy="50%" r="75%">
          <Stop offset="0.6" stopColor="#000000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.45" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="400" height="300" fill="url(#cn-sky)" />
      {/* The stands, a dark band with a few lit rows. */}
      <Rect x="0" y="52" width="400" height="30" fill="#0E1C2E" />
      <G opacity={0.5}>
        {Array.from({ length: 26 }, (_, i) => <Circle key={i} cx={8 + i * 15.4} cy={62 + (i % 3) * 6} r={1.3} fill="#F6E7A8" />)}
      </G>
      <Polygon points="0,82 400,82 400,300 0,300" fill="url(#cn-surround)" />
      <Polygon points="104,96 296,96 368,286 32,286" fill="url(#cn-court)" />
      <G stroke="#F4F7FB" strokeWidth={2.2} fill="none" strokeLinejoin="round">
        <Polygon points="104,96 296,96 368,286 32,286" />
        <Line x1="122" y1="96" x2="58" y2="286" strokeWidth={1.6} />
        <Line x1="278" y1="96" x2="342" y2="286" strokeWidth={1.6} />
        <Line x1="113" y1="122" x2="287" y2="122" strokeWidth={1.6} />
        <Line x1="80" y1="236" x2="320" y2="236" strokeWidth={1.8} />
        <Line x1="200" y1="122" x2="200" y2="236" strokeWidth={1.6} />
        <Line x1="200" y1="96" x2="200" y2="101" />
        <Line x1="200" y1="281" x2="200" y2="286" />
      </G>
      {/* The net: its shadow, the mesh, the white tape. */}
      <Polygon points="86,162 314,162 318,170 82,170" fill="#0B1E33" opacity={0.35} />
      <Rect x="80" y="146" width="240" height="16" fill="#0D1B2B" opacity={0.78} />
      <G stroke="#3F5873" strokeWidth={0.6} opacity={0.8}>
        {Array.from({ length: 30 }, (_, i) => <Line key={i} x1={84 + i * 8} y1={147} x2={84 + i * 8} y2={162} />)}
      </G>
      <Rect x="78" y="143.5" width="244" height="3.5" rx="1" fill="#F4F7FB" />
      <Rect x="74" y="138" width="4" height="25" fill="#C9D3DE" />
      <Rect x="322" y="138" width="4" height="25" fill="#C9D3DE" />
      <Ellipse cx="249" cy="252" rx="10" ry="3.2" fill="#0B1E33" opacity={0.4} />
      <Circle cx="246" cy="244" r="7.5" fill="url(#cn-ball)" />
      <Path d="M240.5 239.5c3 2 3 7.5 0 9.6M251.6 239c-3 2.2-3 7.8 0 10" stroke="#F4F7FB" strokeWidth={1} fill="none" opacity={0.85} />
      <Rect x="0" y="0" width="400" height="300" fill="url(#cn-glow)" />
      <Rect x="0" y="0" width="400" height="300" fill="url(#cn-vignette)" />
    </Svg>
  );
}

/** A clay court at sunset from the baseline: warm sky, the tree line, long shadows. */
function ClaySunset({ aspect }: { aspect: string }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 300 400" preserveAspectRatio={aspect}>
      <Defs>
        <LinearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6E5B9C" />
          <Stop offset="0.45" stopColor="#E98C6E" />
          <Stop offset="0.8" stopColor="#F7C27A" />
          <Stop offset="1" stopColor="#FBE0A0" />
        </LinearGradient>
        <RadialGradient id="cs-sun" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFF4CF" />
          <Stop offset="0.5" stopColor="#FFE29A" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#FFD58A" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="cs-clay" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#C9673D" />
          <Stop offset="1" stopColor="#B35632" />
        </LinearGradient>
        <LinearGradient id="cs-warm" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFB070" stopOpacity="0.18" />
          <Stop offset="1" stopColor="#5A2A40" stopOpacity="0.22" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="300" height="400" fill="url(#cs-sky)" />
      <Circle cx="196" cy="168" r="46" fill="url(#cs-sun)" />
      <Circle cx="196" cy="168" r="15" fill="#FFF3D1" />
      {/* Trees along the back fence. */}
      <Path d="M0 176 Q14 150 30 170 Q44 140 62 166 Q78 146 92 168 Q106 152 122 170 Q140 148 156 172 Q170 158 186 176 Q204 150 222 172 Q238 154 254 170 Q270 148 286 168 Q296 160 300 166 L300 196 L0 196 Z" fill="#3B2F45" />
      <Rect x="0" y="186" width="300" height="12" fill="#2C2536" />
      <G stroke="#2A2232" strokeWidth={0.8} opacity={0.7}>
        {Array.from({ length: 16 }, (_, i) => <Line key={i} x1={i * 20} y1={170} x2={i * 20} y2={198} />)}
      </G>
      <Polygon points="0,198 300,198 300,400 0,400" fill="#A94F2E" />
      <Polygon points="70,206 230,206 300,400 0,400" fill="url(#cs-clay)" />
      <G stroke="#F6EDE2" fill="none" strokeLinejoin="round">
        <Polygon points="70,206 230,206 300,400 0,400" strokeWidth={1.6} />
        <Line x1="88" y1="206" x2="34" y2="400" strokeWidth={1.2} />
        <Line x1="212" y1="206" x2="266" y2="400" strokeWidth={1.2} />
        <Line x1="79" y1="232" x2="221" y2="232" strokeWidth={1.2} />
        <Line x1="46" y1="330" x2="254" y2="330" strokeWidth={1.4} />
        <Line x1="150" y1="232" x2="150" y2="330" strokeWidth={1.2} />
      </G>
      {/* Long shadows across the clay. */}
      <Polygon points="0,260 300,236 300,262 0,300" fill="#7A3320" opacity={0.18} />
      <Rect x="58" y="262" width="184" height="15" fill="#2D1E22" opacity={0.6} />
      <G stroke="#6A4F4F" strokeWidth={0.5} opacity={0.8}>
        {Array.from({ length: 23 }, (_, i) => <Line key={i} x1={62 + i * 8} y1={263} x2={62 + i * 8} y2={277} />)}
      </G>
      <Rect x="56" y="259" width="188" height="3.5" rx="1" fill="#F6EDE2" />
      <Rect x="52" y="254" width="4" height="24" fill="#E7DCCF" />
      <Rect x="244" y="254" width="4" height="24" fill="#E7DCCF" />
      <Path d="M0 360 Q80 352 150 356 T300 350 L300 400 L0 400 Z" fill="#8E3D22" opacity={0.25} />
      <Rect x="0" y="0" width="300" height="400" fill="url(#cs-warm)" />
    </Svg>
  );
}

/** Three balls on a hard court, close up, with the baseline running across. */
function Balls({ aspect }: { aspect: string }) {
  const ball = (cx: number, cy: number, r: number, turn: number, id: string) => (
    <G key={id}>
      <Ellipse cx={cx + r * 0.35} cy={cy + r * 0.85} rx={r * 1.05} ry={r * 0.32} fill="#0D2440" opacity={0.35} />
      <Circle cx={cx} cy={cy} r={r} fill="url(#bl-ball)" />
      <G transform={`rotate(${turn} ${cx} ${cy})`}>
        <Path d={`M${cx - r * 0.72} ${cy - r * 0.68} C${cx - r * 0.12} ${cy - r * 0.25} ${cx - r * 0.12} ${cy + r * 0.25} ${cx - r * 0.72} ${cy + r * 0.68}`} stroke="#F7FAF0" strokeWidth={r * 0.1} fill="none" strokeLinecap="round" opacity={0.9} />
        <Path d={`M${cx + r * 0.72} ${cy - r * 0.68} C${cx + r * 0.12} ${cy - r * 0.25} ${cx + r * 0.12} ${cy + r * 0.25} ${cx + r * 0.72} ${cy + r * 0.68}`} stroke="#F7FAF0" strokeWidth={r * 0.1} fill="none" strokeLinecap="round" opacity={0.9} />
      </G>
    </G>
  );
  return (
    <Svg width="100%" height="100%" viewBox="0 0 300 300" preserveAspectRatio={aspect}>
      <Defs>
        <LinearGradient id="bl-court" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3B78BC" />
          <Stop offset="1" stopColor="#21558F" />
        </LinearGradient>
        <RadialGradient id="bl-ball" cx="36%" cy="30%" r="72%">
          <Stop offset="0" stopColor="#F9FF9C" />
          <Stop offset="0.55" stopColor="#D8EA2E" />
          <Stop offset="1" stopColor="#96AC18" />
        </RadialGradient>
        <RadialGradient id="bl-light" cx="30%" cy="20%" r="80%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="300" height="300" fill="url(#bl-court)" />
      <Polygon points="0,206 300,168 300,186 0,226" fill="#F2F6FA" />
      <Polygon points="0,226 300,186 300,190 0,231" fill="#1C4A7E" opacity={0.35} />
      {ball(96, 132, 34, 18, 'a')}
      {ball(176, 112, 30, -24, 'b')}
      {ball(214, 214, 38, 40, 'c')}
      <Rect x="0" y="0" width="300" height="300" fill="url(#bl-light)" />
    </Svg>
  );
}
