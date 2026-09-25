---
name: CourtSide
description: A tennis app that reads like a page from the same magazine as the site people joined on.
colors:
  bg: "#F8F7F2"
  bg-elevated: "#F1EFE6"
  surface: "#F4F2E9"
  surface-alt: "#E9E6DA"
  border: "#DCD6C8"
  border-strong: "#B8AF9D"
  text: "#24251F"
  text-muted: "#5D584C"
  text-faint: "#6C665A"
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
    fontFamily: "Inter_500Medium"
    fontSize: "30px"
    fontWeight: 500
    letterSpacing: "-1.05px"
  title:
    fontFamily: "Inter_500Medium"
    fontSize: "22px"
    fontWeight: 500
    letterSpacing: "-0.66px"
  heading:
    fontFamily: "Inter_600SemiBold"
    fontSize: "17px"
    fontWeight: 600
    letterSpacing: "-0.3px"
  body:
    fontFamily: "Inter_400Regular"
    fontSize: "15px"
    fontWeight: 400
  body-strong:
    fontFamily: "Inter_600SemiBold"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.15px"
  small:
    fontFamily: "Inter_400Regular"
    fontSize: "13px"
    fontWeight: 400
  small-strong:
    fontFamily: "Inter_600SemiBold"
    fontSize: "13px"
    fontWeight: 600
  caption:
    fontFamily: "Inter_600SemiBold"
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
    padding: "14px 24px"
  button-secondary:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "14px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "14px 24px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "14px 24px"
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
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  card-feature:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "20px"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  input-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
  empty-tile:
    backgroundColor: "{colors.brand-dim}"
    textColor: "{colors.brand}"
    rounded: "{rounded.lg}"
    size: "56px"
---

# Design System: CourtSide

## Overview

**Creative North Star: "The Same Magazine"**

The app is the second surface of a world that began on the public waitlist page
(`public/waitlist.html`). People signed up on a cream page set in Inter at medium weight, with a
clay-and-grass wash feathering out of the top, dotted rules between sections, pill actions and
hairlines instead of boxes. The app now shares all of it: the face, the ground, the washes, the
pills, the dotted rule and the card. A screen should read like a page from the same magazine as the
site, not like the category's chrome (800-weight screen titles, all-caps eyebrows, bordered cards
stacked as page structure), which is exactly what the previous system was.

What stayed from the earlier world is the material: the six palettes and the recolour-by-slot rule,
the 4px spacing ladder, the 8/12/16/24/pill radius ladder, hairline tan borders, initials avatars
and tinted court placeholders, pill-shaped actions. What changed is the voice on top of it. Type
is now Inter, bundled with the app, and display and title dropped from 800 and 700 to 500 with
tracking that tightens as size grows. Section breaks are dotted rules. Colour arrives as a wash,
not a fill. One shadow exists on the page: the primary action lifting on a soft shadow of its own
green. And the mark draws itself once, on the success and end cards.

Density is lower than the content would suggest. Lists are rows on hairlines, not cards; a screen
opens with its title, one muted line, and air. Colour is rare enough that a single green pill is
the loudest thing on most screens.

**Key Characteristics:**
- Inter at 400/500/600, display and title at medium weight with tight tracking; no black weights
- Warm paper neutrals; never pure white or pure black in the default palette
- Hairlines separate; boxes are for the few things that are genuinely a card
- One shadow on the page, in the brand's own colour, under the primary action only
- The wash: clay low-left, brand high-right, feathered to nothing, at a screen's opening or inside a card
- Dotted rules for section breaks, drawn in strong tan at 70%
- Six complete palettes, one authored source, no literal hex in a component

## Colors

Warm, low-chroma and close in value, so the content and the wash supply the colour rather than the
chrome. The token block above is the default palette; the six palettes in `ThemeProvider.tsx`
(CourtSide, Night, Clean, Australian Open, Roland Garros, Wimbledon, US Open) each fill every one
of the same slots, and the wash, the mark, the lift shadow and the dotted rule all draw from those
slots so each court arrives in its own colours.

### Primary
- **Club Green** (`brand`): the primary pill, the round create button, the arrow on the ask field,
  the sent message bubble, selected chips, the mark, the live dot, the lift shadow. Muted club
  signage, not sports-brand green.
- **Green Ink** (`brand-ink`): the only colour set on Club Green. Warm off-white in the default
  palette so a filled pill stays in the paper world.
- **Dim Green** (`brand-dim`): the 56px tile behind the mark on the tip and end cards and behind the
  icon of an empty state; the quiet highlight behind a chosen reaction.

### Secondary
The four court surfaces classify; they never fill a button. The wash borrows `clay` for its warm
low-left pool and `brand` for the high-right one, so the wash is the one place clay appears at
scale.
- **Court** (`court`): the game and the success state.
- **Clay** (`clay`): warm brick; the wash's warm half.
- **Hard** (`hard` / `info`): cool blue; the Coaching tab's active tint.
- **Grass** (`grass`): desaturated lawn. `warning` is the Community tab's active tint.

### Neutral
- **Ball Can Cream** (`bg`): the page and the tab bar.
- **Warm Sand** (`surface`, `bg-elevated`, `surface-alt`): three small steps up from the page. A
  card, a received bubble and a field are `surface`; a pressed inbox row is `bg-elevated`; an
  unselected chip and the secondary pill are `surface-alt`.
- **Hairline Tan** (`border`) and **Strong Tan** (`border-strong`): every rule and border. Strong
  tan draws the dotted rule, the secondary pill's edge and a field under press.
- **Court Ink** (`text`): all reading text, and the "All" filter chip's fill in the inbox.
- **Muted Ink** (`text-muted`) and **Faint Ink** (`text-faint`): subtitles, previews, metadata,
  placeholders. Both deepened from the previous world to match the waitlist page and hold contrast
  against the wash.

### Named Rules
**The Every-Slot Rule.** Every palette defines every colour key, and no component writes a literal
hex. Styles are authored once against the default palette and recoloured by slot at draw time; a
missing slot leaves a stray colour from the theme the screen was written in, and it looks correct
until someone picks Wimbledon. Only black-on-media surfaces (a video frame, a story) may use a
literal `#000` or `#FFFFFF`, because the picture, not the palette, is their ground.

**The Wash Rule.** Colour at scale arrives as a wash, never as a filled band. The wash is two
radial pools, clay at 42% low-left and brand at 26% high-right (both multiplied by 0.7 on a dark
palette), under a linear fade to the page colour from 35% of its height. It sits behind a screen's
opening moment (Coaching, 360px at 0.85 strength) or inside a card (tip and end cards, 260px at
0.6). It never sits under a scrolling list.

**The Surface Vocabulary Rule.** Clay, hard, grass and court classify. A surface colour on an
action is a category error.

## Typography

**Display / Body / Label Font:** Inter, bundled in the app via `@expo-google-fonts/inter`
(`Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`, `Inter_700Bold`), loaded before the
first frame so nothing renders in a fallback. The web build resolves the same names. The
`font(weight)` helper in `src/theme/index.ts` returns both `fontFamily` and `fontWeight`, and is the
only sanctioned way to set a weight.

**Character:** lighter than it was. Hierarchy still comes from size and weight, but the top of the
scale is medium, not black, and it tightens as it grows. A 30px title at 500 with -1.05px tracking
reads as set, not shouted.

### Hierarchy
- **Display** (500, 30px, -1.05px): a screen's own title, once per screen, at the top of the
  header with 24px above it.
- **Title** (500, 22px, -0.66px): section heads ("Coaches"), the tip and end card titles, sheet
  titles. The Coaching lead ("Ask a coach.") is this style at 24px.
- **Heading** (600, 17px, -0.3px): the head of an empty state or a grouped list.
- **Body** (400, 15px): posts, threads, bubbles at 21px line height. Names in rows are body at 500
  and 16px; a field's text is 16px so iOS does not zoom it.
- **Body Strong** (600, 15px, -0.15px): pill labels, prices (tabular numerals), anything found while
  scrolling.
- **Small** (400, 13px) and **Small Strong** (600, 13px): subtitles under titles, previews,
  timestamps, links inside cards. Subtitle and card body run at 19px line height.
- **Caption** (600, 11px, +0.4px): stamps and tile labels; the only tracked-out style.

### Named Rules
**The Medium Top Rule.** Nothing above 17px is set heavier than 500. A screen title at 700 or 800
is the previous world and reads as the category's chrome.

**The Tight Top Rule.** Tracking tightens as size grows (-1.05 at 30, -0.66 at 22, -0.3 at 17,
-0.15 at strong body) and opens only at caption size.

**The No-Kicker Rule.** No all-caps eyebrow sits above a heading. A screen opens with its display
title and one muted line beneath it; a section opens with a title and one muted line beneath it.
Uppercase caption survives only as a stamp inside content (a thread's date stamp at 11px, +0.6px)
or as a tile label, never as a lead-in to a heading.

## Layout

A single measured column. On the phone it is the screen with 16px side padding; the header carries
24px above the title and the title's subtitle sits 4px beneath it. On a computer the column is
capped at 700px for a page (630px for the feed beside its rail) with a 220px sidebar (76px
compact); a card caps at 520px and centres.

Spacing runs on a 4px base through 8, 12, 16, 24, 32 and 48. Rows on a hairline carry 15px or 16px
of vertical padding and 12px between avatar and words; the words own the hairline, so it runs from
the text's left edge, not the picture's. A section is a title, a 4px gap, one muted line, then 8px
before its rows. Section breaks are a dotted rule with 24px above and below.

Lists are rows on hairlines, not stacked cards. A screen's structure is type and air; a bordered
container appears only when the thing is genuinely a card (tip, end, apply, a received bubble).

### Named Rules
**The Rows-Not-Boxes Rule.** A list item is a row on a hairline. Wrapping list items in bordered
cards is the previous world.

**The One Column Rule.** Past the column cap, extra width stays empty or becomes the rail; it never
widens the reading measure.

## Elevation & Depth

Flat, with one exception. Depth on the page is a hairline and a half-step of surface warmth. The
exception is the primary action, which lifts on a soft shadow in its own colour: `shadowColor:
brand, opacity 0.28, radius 12, offset 0/6` on the primary pill, and the same recipe at radius 10
and offset 0/5 on the round create button, the ask field's arrow and the thread's send button.
Because the shadow is the brand colour, it recolours with the palette and reads as a glow rather
than a drop.

Things that float over the page rather than sit on it (a sheet, a toast, the upload bar, a
long-press menu, a control over video) keep a neutral black shadow, as before; they are overlays,
not page elements.

### Shadow Vocabulary
- **Lift** (`0 6px 12px {brand} @ 0.28`, elevation 3): the primary pill. The one shadow on the page.
- **Lift, small** (`0 5px 10px {brand} @ 0.28`): the round create button and round arrow buttons.
- **Overlay** (`0 6px 16px #000 @ 0.18` and kin): sheets, menus, toasts, the upload bar. Not page
  elements.

### Named Rules
**The One Shadow Rule.** On the page, only the primary action casts a shadow, and it casts it in
its own colour. Cards, rows, fields and secondary pills get a hairline. A shadow on a card to make
it look important is a defect.

## Shapes

Roundness scales with the thing: 8px on small marks, 12px on fields and tiles, 16px on cards and the
brand-dim tile, 20px on the feature card (tip, end) and message bubbles (with a 6px corner on the
speaking side), 24px on sheets, and fully round on anything pressed that is smaller than a card,
including the ask field and the inbox search.

Rules are hairlines (`StyleSheet.hairlineWidth`) in Hairline Tan. Section breaks are a dotted rule:
1px dotted, Strong Tan at 70% opacity. Cards carry a 1px border; without it the warm surfaces
collapse into one another.

### Named Rules
**The Pill Rule.** Actions are pills; fields that behave like actions (ask, search) are pills too;
containers are rounded rectangles. If it is fully round, you can press it or type into it.

**The Dotted Break Rule.** A break between sections of one screen is a dotted rule, never a solid
one and never a band of surface colour.

## Components

### Buttons
- **Shape:** fully round, 14px vertical and 24px horizontal padding, 1px border in every variant
  so all four share a silhouette.
- **Primary:** Club Green fill, Green Ink label, the lift shadow. Disabled sits at 50% opacity and
  keeps the shadow at that opacity.
- **Secondary:** Warm Sand alt fill, Court Ink label, Strong Tan border, no shadow.
- **Ghost:** transparent, Muted Ink label. Also appears as a bare Small Strong link ("Back to the
  top", "See everyone's tips and vote →") centred under a primary pill.
- **Danger:** transparent, Danger red label and border; destructive actions are outlined, never
  filled.
- **Press:** scales to 0.97; loading keeps the label and adds a court spinner in the label colour.
- **Round icon button:** 38px (arrow, send) or 50px (create), Club Green, Green Ink glyph, the small
  lift shadow.

### Chips
- **Unselected:** Warm Sand alt fill, Muted Ink label, Hairline Tan border, 7px/12px.
- **Selected:** Club Green fill and Green Ink label by default; a caller may pass a tint (the inbox
  filter uses Court Ink so the row of chips stays quiet next to the green create button).

### Cards / Containers
- **Standard card:** `surface`, 16px corners, 1px Hairline Tan, 16px padding.
- **Feature card (tip, end, success):** `surface`, 20px corners, 1px Hairline Tan, 24px padding,
  16px gap, max 520px, `overflow: hidden` so the wash inside it clips to the corners. Layout is
  the waitlist's: a 56px brand-dim tile with the mark, title at 22/500, one Small body at 19px
  line height, a field if it asks for something, one primary pill, one ghost link.
- **Rows:** no container; a hairline above each row after the first.

### Inputs / Fields
- **Field:** `surface` fill, 1px Hairline Tan, 12px corners, 16px/12px padding, 15px text.
  Multiline fields set a min height (96px on the tip card).
- **Pill field:** the same, fully round, 16px text, 52px min height, with a round green arrow or a
  search glyph inside. Press darkens the border to Strong Tan.
- **Thread composer:** pill field with a 38px round send button that only lifts when there is text.

### Navigation
- **Phone:** four tabs on Ball Can Cream under a hairline, labels at 10.5px Small Strong in Faint
  Ink. The active tab takes a tint: brand for Home and Profile, `info` for Coaching, `warning` for
  Community. A 50px round green create button sits in the centre and shrinks to 0.86 as the bar
  ducks on scroll.
- **Computer:** a 220px sidebar (76px compact) replaces the bar; the active item sits on `surface`.
- **Header:** back chevron, display title, one Small muted subtitle; on a pushed screen the title
  compacts to Title size beside the chevron.

### The Wash (signature)
`Wash` in `src/components/Wash.tsx`: an SVG of two radial gradients (clay low-left, brand high-right)
under a vertical fade to the page colour, absolutely positioned at the top of its parent and
non-interactive. `Screen` takes `wash` to place it behind the header (360px, 0.85); the feature
card places it inside itself (260px, 0.6). It reads the theme, so the four slam palettes wash in
their own court colours and Night pulls the opacity to 70%.

### The Drawn Mark (signature)
`MarkDraw`: the CourtSide mark as strokes, drawing itself in when a success or end card appears:
court outline over 640ms, then the net at 360ms, then the post at 540ms, on an exponential ease-out
(`cubic-bezier(0.22, 1, 0.36, 1)`). It is the one authored moment on those cards. Under Reduce
Motion it appears already drawn. Sits in the 56px brand-dim tile at 30px.

### The Live Dot (signature)
`LiveDot`: an 8px brand dot with a ring that leaves it every 1.8s (scale to 2.8, fading from 55%),
the waitlist scoreboard's "in play" mark, for anything still waiting on a person ("Awaiting a
coach"). Still under Reduce Motion.

### Empty State
Icon at 24px in brand on a 56px brand-dim tile, Heading title, Small muted body at 19px line height
capped at 300px, 48px of vertical air.

### Court Placeholders
Unchanged from the previous world: avatars are initials on one of six muted tints chosen from the
handle; media with nothing loaded is a tinted court card. No binary imagery ships.

## Do's and Don'ts

### Do:
- **Do** set weight through `font('500')` and the typography scale; never a bare `fontWeight`.
- **Do** open a screen with its display title and one muted line, with the wash behind it only if
  it is that screen's opening moment.
- **Do** build lists as rows on hairlines with the line starting at the words.
- **Do** break sections with `DottedRule`.
- **Do** keep the lift shadow to the primary action and round brand buttons, in the brand colour.
- **Do** use the feature card (tile, title, body, one pill, one link, wash inside) for success and
  end moments.
- **Do** take every colour from the theme so all six palettes keep working.
- **Do** give every animated flourish a Reduce Motion path that lands on the finished state.

### Don't:
- **Don't** set a title at 700 or 800, or use a display size above 30px on a screen title.
- **Don't** put an all-caps kicker or eyebrow above a heading.
- **Don't** put the wash under a scrolling list, or on every screen by default.
- **Don't** add a neutral or black shadow to anything that sits on the page.
- **Don't** stack bordered cards as page structure.
- **Don't** write a literal hex in a component outside a black-on-media surface.
- **Don't** use a court surface colour (clay, hard, grass, court) as an action colour.
- **Don't** ship imagery or an icon font; the mark is drawn, icons are vector, avatars are initials.
