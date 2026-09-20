---
target_identity: "file:/Users/william/Desktop/Courtside/app/(tabs)/index.tsx"
target_fingerprint: "sha256:dc8199220fd3d2b1daec13847f1f1cc9c4d4649acff6af4e206cd3c6c3706662"
target_path: /Users/william/Desktop/Courtside/app/(tabs)/index.tsx
timestamp: 2026-09-20T04-28-56Z
slug: app-tabs-index-tsx
---
# Critique — Home feed (app/(tabs)/index.tsx)

Method: dual-agent (A: design review · B: detector + browser evidence). Phone 375x812 and desktop 1440x900.

## Design Health Score: 20/40 (all ten heuristics applicable)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Excellent load choreography; no position indicator in a 20+ page pager |
| 2 | Match system / real world | 3 | Strong tennis vocabulary, undercut by raw enum eyebrows ("NOTE · FOR YOU") |
| 3 | User control and freedom | 2 | Feed reshuffles every open; a clip you wanted to re-watch is unfindable |
| 4 | Consistency and standards | 1 | Three gutters (0/12/20), three brand placements, ten font sizes, two like-reds |
| 5 | Error prevention | 3 | Double-tap only ever likes; risk is half-clipped action rows |
| 6 | Recognition over recall | 2 | Five gestures, four with no affordance |
| 7 | Flexibility and efficiency | 1 | No filter by level or surface, no following/for-you switch |
| 8 | Aesthetic and minimalist | 2 | Beautiful palette; four stacked zeros per clip, 269-330px dead cream |
| 9 | Error recovery | 2 | A failed image is marked ready; broken clip renders blank, no retry |
| 10 | Help and documentation | 1 | Whole gesture vocabulary taught by one line of 10px 70% white text |

## Priority issues
- P0 Written pages clip their own action row and strand 269-330px of empty cream (index.tsx:779, :847, :1152)
- P0 Desktop has no column cap: 1180-1220px measure, 156-202 characters per line; clip caption/rail anchored to page not clip (index.tsx:1124-1144)
- P1 Home opted out of the type system: 26 fontSize literals across 10 sizes, none from tokens; no scaling between breakpoints
- P1 Metadata greys fail WCAG AA: textFaint 3.50:1, textMuted 4.27:1, eyebrow 4.11:1; 29 failing pairs at phone
- P2 Clip page carries no tennis context; LevelPill imported at index.tsx:16 and never used

## Detector
10 advisory findings, one rule (design-system-color), all scrim/overlay colors over video — documentation gap, not drift.
Missed: #8A6BE0 (QuestionCard.tsx:25, file reported clean), #FF3B5C (Heart.tsx:6, outside scan scope), all 26 fontSize literals.
Clean: no overflow at 375px, no console errors, all network 200.
