---
version: 1
slug: "app-tabs-coaches-tsx"
primary_target: "app/(tabs)/coaches.tsx"
related_targets: ["app/messages/index.tsx","app/messages/[id].tsx","src/components/TipPage.tsx","app/(tabs)/index.tsx","src/components/ui/Screen.tsx","src/theme/index.ts","app/_layout.tsx","app/(tabs)/discuss.tsx","app/(tabs)/profile.tsx"]
---

# App UI revamp (prototype branch `ui-revamp`)

Scope: the iPhone app's chrome and the screens the owner named — Home (ground and type only), Community and Profile (type and ground), Messages list and thread, the Coaching tab, the "Submit a tip" feed page and the "bottom of CourtSide" end card. Mode: Operate. Audience: the owner and friends testing, then the waitlist. Job: every task works exactly as before; the app reads as the same world as the waitlist page people signed up on. Constraints (owner): all functionality untouched, Home and Community lightest touch; Inter ships in the app bundle (no runtime download on the phone); the clay-and-grass wash appears only at moments, never under scrolling content; six palettes keep working; nothing goes live from this branch.

Unresolved: whether the wash should extend to every screen top (owner to decide after seeing the prototype); Android's look is out of scope.

## Direction contract

THESIS: The app wears the waitlist's world — lighter type, tighter tracking, more air, hairlines instead of boxes — so a screen reads like a page from the same magazine as the site people joined on. It refuses the category's chrome: 800-weight screen titles, all-caps eyebrows, bordered cards stacked as page structure.

OWN-WORLD: Inter 400/500/600 everywhere, display at 500 with tight tracking, body at 400/15. Ball Can Cream ground; hairline tan rules and the dotted rule for section breaks; pill actions in club green (primary carries a soft green shadow, secondary a strong-tan hairline); containers at 16–20px with one hairline and no shadow. The wash — clay low-left, grass high-right, feathered — sits inside a card or behind a screen's opening moment only. Success and end cards use the waitlist's card: mark in a brand-dim tile, big place/number at 500, one action. All six palettes keep their slots.

STORY: Open Coaching and meet a quiet editorial page that says what coaching will be and lets you ask a coach now. Open Messages and read names at 500 over previews, one hairline apart. Hit the tip page or the bottom of the feed and recognise the waitlist's card language.

FIRST VIEWPORT (Coaching, iPhone 390×844): "Coaching" at 30/500 tight with a one-line muted subtitle, a feathered wash behind the top third; below, the Ask-a-coach card (tinted mark tile, 17/600 headline, one-line body, primary pill "Ask a coach"); then coaches as hairline rows (name 500, credential small muted, price right-aligned tabular); the apply card closes the page as a quiet bordered block. Primary action: the pill in the Ask card.

FORM: Owner-pinned — the waitlist page's own world (public/waitlist.html) with Brightwill's card polish; no concept roll (seed: owner-pinned). Signature interaction: the mark draws itself on the tip and end cards when they appear; motion grammar is exponential ease-out from a visible default, one authored moment per screen, none under Reduce Motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
