import React from 'react';
import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';

import { GLYPH_EDGE } from '@/components/ReelCaption';

/*
 * The clip rail's icons, a touch bolder (Oct 24, owner: "could be too thin").
 *
 * Why drawn here and not with the icon font: Instagram's Reels rail is plain
 * white outlines with a heavier line than an icon font gives (its strokes are
 * about 2.2pt at rail size; Ionicons' outlines are 1/16 of the icon, so 1.75 to
 * 1.94pt at our sizes, thinnest on the bookmark). A font glyph cannot be made
 * heavier, so these are the very same Ionicons shapes (the heart, the bubble,
 * the arrow and the bookmark the rail has always had, taken from the font
 * itself), drawn with a thin extra line round their edges that brings every one
 * to the same RAIL_STROKE. The liked heart and the saved bookmark are the same
 * silhouette filled, so nothing changes size when they fill.
 *
 * The crisp dark edge (GLYPH_EDGE on text) is drawn in the same picture: the
 * shape again underneath, 1pt lower, in three soft steps of black. A text shadow
 * cannot fall from a drawing, and these look the same on a phone and in a
 * browser.
 */

/** How heavy every outline on the rail reads, in points. */
export const RAIL_STROKE = 2.2;

/** Font units (the icon is 512 across), y up from the baseline; drawn flipped onto the 512 box. */
const PATHS = {
  heart: 'M146 383Q162 385 178 382Q192 380 206 373Q226 364 244 346L256 334L268 346Q286 364 305 373Q327 383 353 383Q379 383 401 372Q418 364 431 351Q454 327 462 292Q464 284 464 268Q464 235 454 205Q429 130 346 59Q293 15 269 3Q264 0 256 0Q248 0 243 3Q238 6 226 14Q141 74 99.5 128Q58 182 49 244Q48 252 48 268Q48 284 50 292Q59 333 90 359Q115 380 146 383ZM173 351Q173 351 173 351Q169 351 159.5 351.5Q150 352 147 351Q118 346 100 324Q86 308 82 286Q80 278 80.5 263.5Q81 249 82 241Q90 195 120 153.5Q150 112 208 67Q228 51 249 37Q249 37 256 32L263 37Q341 90 382 140Q416 183 427 227Q435 262 430 286Q426 307 413 323Q398 342 374 349Q358 354 340 351Q298 344 270 296Q265 288 256 288Q247 288 242 296Q214 343 173 351Z',
  heartFilled: 'M148 383Q148 383 148 383Q163 385 180 382Q216 374 247 344Q254 336 256 336Q258 336 267 345Q296 374 332 382Q339 384 352 384Q365 384 373 382Q407 375 431 351Q455 327 462 293Q473 237 441 173Q406 103 313 33Q284 11 272.5 4.5Q261 -2 247 1Q241 3 224 15Q84 113 56 212Q43 257 50 292Q61 347 110 372Q127 381 148 383Z',
  bubble: 'M228 414Q238 415 259.5 415Q281 415 290 414Q362 402 413 353Q460 308 474.5 245Q489 182 466 120Q452 81 423.5 49Q395 17 358 -1Q319 -21 274 -24Q229 -27 174 -7Q165 -4 161.5 -4Q158 -4 121 -17.5Q84 -31 81 -32Q73 -33 65 -29Q53 -23 51 -9Q51 -4 61 34L72 71L65 82Q36 130 33 184Q31 207 34 228Q42 280 73.5 323.5Q105 367 152 391Q189 409 228 414ZM283 382Q283 382 283 382Q260 385 241 383Q215 381 192 373Q131 352 95.5 299.5Q60 247 65 184Q68 138 92 99Q101 84 103 75Q104 69 94 33Q92 25 90.5 18.5Q89 12 88 8Q87 4 87 4Q87 4 117.5 15Q148 26 154 27Q165 29 187 22Q204 16 212 14Q268 0 320 18Q370 34 404 75Q438 116 446 168Q453 219 434 266Q415 313 374 344Q334 375 283 382Z',
  share: 'M281 373Q284 371 373 286Q462 201 463 199Q465 192 463 185Q462 183 373 98Q284 13 280 11Q274 7 267.5 9Q261 11 258 17Q256 21 256 62V103H250Q244 103 231 102Q160 95 116 58Q102 45 82 21Q73 10 67.5 8.5Q62 7 56 10.5Q50 14 49 20Q45 31 51 77Q59 147 89 193Q136 266 234 278Q245 279 250 279H256V322Q256 357 257 363Q258 369 262 372Q265 375 270 376Q275 377 281 373ZM361 253Q361 253 361 253Q298 313 293 318Q293 318 289 322L288 291Q288 265 287.5 260.5Q287 256 283 252Q278 248 259 247Q209 245 174 228Q103 193 86 95Q84 82 83 76Q83 76 83 70L90 77Q119 103 149.5 116Q180 129 223 134Q234 135 253 135.5Q272 136 276 135Q279 135 282 132Q287 128 287.5 123.5Q288 119 288 93Q288 93 289 62L356 127Q424 191 424 192Q424 193 361 253Z',
  bookmark: 'M145 414Q151 416 255.5 416Q360 416 366 414Q382 411 395 399.5Q408 388 412 373Q415 366 415.5 357.5Q416 349 416 164.5Q416 -20 415 -22Q412 -28 407 -30Q400 -34 393 -30Q390 -29 323 31L256 91L189 31Q122 -29 119 -30Q112 -34 105 -30Q100 -28 97 -22Q96 -20 96 164.5Q96 349 96.5 357.5Q97 366 100 373Q104 388 117 399.5Q130 411 145 414ZM365 381Q365 381 365 381L360 384H258Q157 384 153 383Q138 380 131 365Q131 365 128 360V190V20L187 72Q246 125 249.5 126.5Q253 128 256 128Q259 128 262.5 126.5Q266 125 325 72Q325 72 384 20V190V360L381 365Q376 376 365 381Z',
  bookmarkFilled: 'M144 414Q144 414 144 414Q151 415 256 415.5Q361 416 367 414Q402 405 414 369Q414 369 416 361V172Q416 -18 415 -21Q414 -27 407 -30.5Q400 -34 393 -30Q390 -29 323 31Q323 31 256 91L191 33Q127 -24 123 -27Q116 -34 108 -32Q101 -30 97 -23Q96 -20 96 170Q96 331 96.5 350Q97 369 103 380Q116 407 144 414Z',
} as const;

export type RailGlyphName = 'heart' | 'bubble' | 'share' | 'bookmark' | 'dots';

const FLIP = 'matrix(1 0 0 -1 0 448)';
/**
 * The edge: how far below the shape it falls, and its steps (how far past the line, how dark), stacked
 * so it fades out over about 1.5pt the way the text shadow's blur does, never a hard grey outline.
 */
const EDGE_DROP = 1;
const EDGE_STEPS = [[1.5, 0.1], [0.9, 0.14], [0.4, 0.24]] as const;
/** Room round the picture for the edge, so it is never cut off (the box itself stays `size`). */
const EDGE_ROOM = 3;

/**
 * One rail icon, `size` points square, in `color` (white on a clip; the
 * stand-in rail's faint ink while a page loads, with `edge` off). `filled`
 * fills the heart and the bookmark. The dots stay the font's three dots, as
 * they were: they are solid already.
 */
export function RailGlyph({ name, size, color = 'white', filled = false, edge = true }: { name: RailGlyphName; size: number; color?: string; filled?: boolean; edge?: boolean }) {
  if (name === 'dots') return <Ionicons name="ellipsis-horizontal" size={size} color={color} style={edge ? GLYPH_EDGE : undefined} />;
  const unit = 512 / size;
  // The font's own line is 32 units (1/16 of the icon); the extra line takes it to RAIL_STROKE.
  const extra = Math.max(0, RAIL_STROKE - size / 16) * unit;
  const d = filled && name === 'heart' ? PATHS.heartFilled : filled && name === 'bookmark' ? PATHS.bookmarkFilled : PATHS[name];
  const room = EDGE_ROOM * unit;
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Svg
        width={size + EDGE_ROOM * 2}
        height={size + EDGE_ROOM * 2}
        viewBox={`${-room} ${-room} ${512 + room * 2} ${512 + room * 2}`}
        style={{ position: 'absolute', left: -EDGE_ROOM, top: -EDGE_ROOM }}
      >
        {edge ? (
          <G transform={`translate(0 ${EDGE_DROP * unit})`}>
            {EDGE_STEPS.map(([past, dark]) => (
              <Path key={past} d={d} transform={FLIP} fill="black" stroke="black" strokeWidth={extra + past * 2 * unit} strokeLinejoin="round" opacity={dark} />
            ))}
          </G>
        ) : null}
        <Path d={d} transform={FLIP} fill={color} stroke={color} strokeWidth={extra} strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
