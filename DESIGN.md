---
name: CourtSide
description: A tennis app that stays quiet so the court can be loud.
colors:
  bg: "#F8F7F2"
  bg-elevated: "#F1EFE6"
  surface: "#F4F2E9"
  surface-alt: "#E9E6DA"
  border: "#DCD6C8"
  border-strong: "#B8AF9D"
  text: "#24251F"
  text-muted: "#7C7565"
  text-faint: "#8B8373"
  brand: "#3F7049"
  brand-ink: "#FAF8F0"
  brand-dim: "#E3E7D9"
  court: "#527C56"
  clay: "#A06F53"
  hard: "#3E6982"
  grass: "#748360"
  info: "#3E6982"
  success: "#527C56"
  warning: "#957328"
  danger: "#A34D40"
  overlay: "rgba(24, 32, 27, 0.5)"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    letterSpacing: "-0.6px"
  title:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.3px"
  heading:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 700
  body:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  body-strong:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  small:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  small-strong:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  label:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.4px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "13px 24px"
  button-secondary:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "13px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "13px 24px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "13px 24px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text-muted}"
    typography: "{typography.small-strong}"
    rounded: "{rounded.pill}"
    padding: "7px 12px"
  chip-selected:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
    typography: "{typography.small-strong}"
    rounded: "{rounded.pill}"
    padding: "7px 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: CourtSide

## Overview

**Creative North Star: "Courtside Seats"**

You are at the edge of the court and the match is the thing. Everything the interface does is in
service of a clip, a photo taken minutes after a session, or a thread someone is trying to read
properly — so the interface takes the seat, not the court. Restraint here is not minimalism for its
own sake; it is the position. A premium, understated surface makes a phone-shot rally look like
something worth watching, where a loud one would compete with it and lose.

The material is warm paper rather than glass or neon. Cream grounds, soft tan borders and a muted
club green, all of them low-chroma — the brand accent sits at 0.082 chroma, which is less saturated
than most apps' *neutrals*. Surfaces are flat and separated by a single hairline border, not by
shadow. Type is the platform's own: no font ships with the app, so text renders in San Francisco on
iPhone and the system stack on the web, which is both faster and quieter than a brand face would be.

The palette is not one world but six, and that is structural rather than a novelty setting. Every
screen is authored once against the default palette and recoloured at draw time, which is why every
palette must define every colour slot — a missing slot leaks a colour from whichever theme the
screen was written in. The Grand Slam themes are the product wearing a tournament, and they only
work because no component ever hardcodes a colour.

**Key Characteristics:**
- Warm paper neutrals, never grey and never white
- Low-chroma accents; the green is muted club signage, not sports-brand green
- Flat by default — hairline borders do the separating, shadows only lift
- Platform type only; no brand font, no icon font, no shipped imagery
- Pill-shaped actions against softly-rounded containers
- Six complete palettes, one authored source

## Colors

Warm, low-chroma and close together in value, so content supplies the contrast rather than the
interface.

### Primary
- **Club Green** (`#3F7049`): every action worth taking. Primary buttons, selected chips and the
  active state of anything toggleable. Muted deliberately — at half the chroma of a sports-brand
  green it reads as club signage rather than a call to action shouting from a shelf.
- **Green Ink** (`#FAF8F0`): the only colour that sits on Club Green. Warm off-white, not pure
  white, so a filled button stays in the paper world.
- **Dim Green** (`#E3E7D9`): a tint of the accent for quiet highlights — badge backgrounds and
  selected rows that must not carry a full-strength fill.

### Secondary
The four court surfaces, used as classification colour rather than decoration. They label a kind of
thing; they never fill a button.
- **Court** (`#527C56`): the game itself, and the success state.
- **Clay** (`#A06F53`): warm brick.
- **Hard** (`#3E6982`): cool blue, and the information state.
- **Grass** (`#748360`): desaturated lawn.

### Neutral
- **Ball Can Cream** (`#F8F7F2`): the page. Warm enough to read as paper under a phone's night
  brightness.
- **Warm Sand** (`#F4F2E9` surface, `#F1EFE6` elevated, `#E9E6DA` alt): the three steps between the
  page and a raised surface, each a small step warmer or darker than the last rather than a jump.
- **Hairline Tan** (`#DCD6C8`) and **Strong Tan** (`#B8AF9D`): every border in the app. The strong
  one appears only where a boundary must be felt — a secondary button's edge, an input under focus.
- **Court Ink** (`#24251F`): body text. Near-black with a trace of green, never `#000`.
- **Muted Ink** (`#7C7565`) and **Faint Ink** (`#8B8373`): secondary text and metadata.

### Named Rules
**The Warm Neutral Rule.** No pure white and no pure black anywhere. Every neutral carries warmth
(`#F8F7F2`, not `#FFFFFF`; `#24251F`, not `#000000`). A pure value on a warm ground reads as a bug.

**The Every-Slot Rule.** Every palette defines every colour key, and no component ever writes a
literal hex. Styles are authored once and recoloured at draw time by slot; a missing slot leaves a
stray colour from the theme the screen was written in. This is the one rule whose breakage is
silent — it looks fine in the default theme and wrong only in a slam theme.

**The Surface Vocabulary Rule.** Clay, hard, grass and court classify; they never command. A surface
colour on a button is a category error.

## Typography

**Display / Body / Label Font:** the platform's own (`system-ui`, San Francisco on iPhone, Roboto on
Android). No font ships with the app.

**Character:** neutral by choice. With a small, tight scale and heavy weights doing the hierarchy,
the system face reads as precise rather than generic, and it never costs a download or a flash of
unstyled text.

### Hierarchy
- **Display** (800, 30px, -0.6px tracking): a screen's own title, once per screen.
- **Title** (700, 22px, -0.3px): section heads and sheet titles.
- **Heading** (700, 17px): the head of a card or a grouped list.
- **Body** (400, 15px): post text, thread bodies, messages.
- **Body Strong** (600, 15px): button labels, names, anything that must be found while scrolling.
- **Small** (400, 13px) / **Small Strong** (600, 13px): metadata, timestamps, handles, hints.
- **Label** (600, 11px, +0.4px tracking): eyebrows and pills. The only tracked-out style.

### Named Rules
**The Tight Top Rule.** Tracking tightens as size grows (-0.6px at display, -0.3px at title, 0 at
body) and opens only at label size. Large type set loose looks web; large type set tight looks
considered.

**The Two-Weight Rule.** Hierarchy comes from weight and size, never from colour alone. A muted
colour marks something as secondary; it is not allowed to be the only thing marking it.

## Layout

A single measured column, centred. On a phone the column is the screen; on a computer it is capped —
630px for the feed when a rail sits beside it, 700px for a page on its own, with a 280px rail and a
220px sidebar (76px compact). A sheet or floating card caps at 520px.

Spacing runs on a 4px base through 8, 12, 16, 24, 32 and 48. Screen padding is 16px; a card's
interior is 16px; groups of related controls sit 8px apart and unrelated blocks 24px.

Density is deliberately low for an app with this much content: the feed gives one post the whole
viewport rather than stacking two, because a clip that shares the screen stops being the thing you
are looking at.

### Named Rules
**The One Column Rule.** Content never spans the full width of a large screen. Past the column cap,
the extra space stays empty or becomes the rail — it never widens the reading measure.

## Elevation & Depth

Flat. Depth comes from a hairline border and a half-step change in surface warmth, not from shadow:
a card is `surface` on `bg` with a 1px `border`, and that is the entire vocabulary for anything that
sits *on* the page.

Shadow is reserved for things that genuinely float above it — the upload bar, a dragged sheet, a
toast, a scrubber cursor, a frosted control over video. There are eleven such places in the whole
app, and that is the intended order of magnitude.

### Shadow Vocabulary
- **Floating card** (`0 6px 14px rgba(0,0,0,0.12)`): the upload bar and similar detached cards.
- **Sheet** (`0 -10px 28px rgba(0,0,0,0.28)`): a sheet rising from the bottom edge.
- **Toast** (`0 4px 18px rgba(0,0,0,0.18)`): a message passing over the page.
- **Control over media** (`0 3px 7px rgba(0,0,0,0.28)`): a pill or cursor on top of a photo or video,
  where a border would disappear into the picture.

### Named Rules
**The Flat-By-Default Rule.** If a thing belongs to the page, it gets a border. If it floats over the
page, it gets a shadow. Nothing gets both, and a card never gets a shadow to look important.

## Shapes

Roundness scales with the size of the thing: 8px on small marks, 12px on inputs and tiles, 16px on
cards, 24px on sheets and the largest containers, and fully round (999px) on anything you press that
is smaller than a card.

Every container carries a 1px border. Borders are the structural material of the system — remove
them and the warm surfaces collapse into one another, because they are only a few percent apart in
lightness.

### Named Rules
**The Pill Rule.** Actions are pills; containers are rounded rectangles. If it is fully round, you
can press it.

## Components

### Buttons
- **Shape:** fully round (999px), 13px tall inside, 24px of horizontal room, 1px border in every
  variant so all four align on the same silhouette.
- **Primary:** Club Green fill, Green Ink label, no visible border.
- **Secondary:** Warm Sand alt fill, Court Ink label, Strong Tan border.
- **Ghost:** transparent, Muted Ink label, transparent border — it holds the same space as the
  others so rows of mixed buttons stay aligned.
- **Danger:** transparent with a Danger red label and border. Destructive actions are outlined, never
  filled: a red fill reads as the primary action on the screen, which is exactly wrong.
- **Press / hover:** scales to 0.97 on press and 1.04 on hover over 60ms. Wide buttons use a gentler
  press than small icons, which travel to 0.94.
- **Loading:** the label stays and a court-ball spinner appears beside it at the label's own colour;
  the button does not change size.

### Chips
- **Unselected:** Warm Sand alt fill, Muted Ink label, Hairline Tan border.
- **Selected:** Club Green fill (or a passed-in tint, for topic colours), Green Ink label, no border.
- **Sizes:** 7px/12px normal, 4px/8px small with label type.

### Cards / Containers
- **Corners:** 16px.
- **Background:** `surface` on the page's `bg` — one half-step of warmth apart.
- **Border:** 1px Hairline Tan, always.
- **Shadow:** none. See Elevation.
- **Padding:** 16px when padded; a media card carries its picture edge to edge and pads only the text.
- **Pressed:** drops to 72% opacity rather than moving.

### Inputs / Fields
- **Style:** `surface` fill, 1px Hairline Tan border, 12px corners, 16px/12px padding, 15px text.
- **Label:** Small Strong in Muted Ink, 8px above the field.
- **Hint:** Small in Faint Ink, below.

### Navigation
- **Phone:** four tabs — Home, Community, Coaching, Profile.
- **Computer:** a left sidebar (220px, 76px when compact) replaces the tab bar.
- **Wordmark:** centred at the top of the feed on every screen and every width.

### The Feed Page (signature)
One post fills the viewport and the next is a vertical page away. Over a clip or a hit, the
interface goes translucent and sits directly on the picture — the only place in the app where
controls have no surface under them, which is why those controls carry shadow. Pinching out removes
the interface entirely.

### Court Placeholders (signature)
No image assets ship. An avatar is the person's initials on one of six muted tints, chosen
deterministically from their handle, and a photo or video with nothing loaded yet renders as a
tinted court card. Both are part of the look, not a stopgap: the app is recognisably itself before a
single byte of media arrives.

## Do's and Don'ts

### Do:
- **Do** take every colour from the theme, so all six palettes keep working.
- **Do** separate surfaces with a 1px border and a half-step of warmth.
- **Do** keep actions pill-shaped and containers rounded-rectangular.
- **Do** let type weight carry hierarchy, with colour as reinforcement.
- **Do** give a clip the whole viewport.
- **Do** outline destructive actions rather than filling them.

### Don't:
- **Don't** write a literal hex in a component. The recolouring works by slot; a literal survives
  the theme change and looks correct until someone picks Wimbledon.
- **Don't** use `#FFFFFF` or `#000000`. Every neutral is warm.
- **Don't** add a shadow to something that sits on the page.
- **Don't** use a surface colour (clay, hard, grass, court) as an action colour.
- **Don't** introduce a webfont or an icon font. Type is the platform's, icons are vector.
- **Don't** ship placeholder imagery. Initials and court cards are the placeholder system.
