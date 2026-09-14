# TICO UI design system

Status: authoritative UI implementation guide  
Last updated: 2026-09-05

This file is the source of truth for TICO interface design. Every agent creating or reviewing UI must read it together with [UX and localization](04-ux-design-and-localization.md), [product and game design](01-product-and-game-design.md), [safety](10-safety-privacy-and-security.md), and [the asset bible](09-asset-bible-and-image-prompts.md).

## 1. Precedence and reference use

The supplied 24-screen reference board and root `ui.md` establish useful qualities: warm off-white space, orange-forward actions, restrained cards, an obvious next step, frequent but controlled mascot support, and a journey from onboarding to mission completion.

They are visual references, not the product specification. When they conflict with the TICO docs, follow this guide and the accepted ADR:

- TICO is the friendly orange robot defined by the canonical source sheets in `client/assets/source/tico/`. Those supplied sheets override the earlier hoopoe concept.
- Launch worlds are the public baladi bakery, Egyptian railway station, and Cairo traffic control—not Code Village, Logic City, or Data Desert.
- Contemporary Egyptian daily life replaces generic desert, pyramid, pharaonic, or tourist imagery.
- There are no MVP coins, public leaderboards, lives, social profiles, or streak punishment.
- Real Python syntax replaces block coding or fictional syntax.
- The full coding workspace is for laptops and landscape tablets; portrait phones provide content and progress but no cramped editor.
- Arabic and English ship together. Arabic screens are RTL; code and terminal content are always LTR.

The hierarchy of authority for UI work is:

1. Product, safety, and architecture documents.
2. This design system.
3. `docs/09-asset-bible-and-image-prompts.md` for illustration production.
4. The reference board for composition and interaction inspiration.
5. Root `ui.md` only where it does not conflict with the above.

## 2. Experience principles

### Learning is the gameplay

Do not decorate an LMS with points. Each screen should make the learner understand a problem, try an action, see a consequence, and move toward mastery.

### One obvious next action

Every view has one primary action. Secondary choices are quieter and never compete by using the same visual weight. The learner should answer “what do I do next?” in under three seconds.

### Warm, capable, never babyish

TICO supports children and undergraduates with the same visual system. Use friendly curves, tactile scenes, and encouraging language without toy-like chrome, giant emojis, or childish type.

### Mistakes are evidence

An incorrect result is calm and specific. Do not flash the entire screen red, use punishment animation, remove XP, or imply personal failure.

### Egypt is the substance

World art, object shapes, mission data, materials, and story actions must feel contemporary and Egyptian. Avoid pasting pyramids or flags onto generic interfaces.

### Motion has meaning

Kinetic motion explains hierarchy, cause, progress, and reward. It never delays work, hides information, or runs continuously for decoration.

## 3. Brand color system

The four supplied colors are the immutable brand anchors:

| Token | Value | Role |
| --- | --- | --- |
| `--brand-primary` | `#DB5B31` | TICO orange; primary actions, current mission, active navigation |
| `--brand-teal` | `#3DABA9` | discovery, information, selected learning tools, supporting progress |
| `--brand-gold` | `#E9992F` | XP, rewards, highlights, achievement ornament |
| `--brand-ink` | `#1F1820` | primary text, strong surfaces, code-workspace anchors |

Use uppercase hex in documentation and tokens. Do not silently replace the four anchors with close alternatives.

### Supporting tokens

```css
:root {
  color-scheme: light;

  --brand-primary: #DB5B31;
  --brand-primary-strong: #A64022;
  --brand-primary-soft: #F8E1D8;
  --brand-primary-faint: #FFF3ED;

  --brand-teal: #3DABA9;
  --brand-teal-strong: #267977;
  --brand-teal-soft: #DDF1F0;

  --brand-gold: #E9992F;
  --brand-gold-strong: #80550F;
  --brand-gold-soft: #FAEACF;

  --brand-ink: #1F1820;
  --text-muted: #716A72;
  --text-faint: #8D858D;

  --canvas: #FBF8F3;
  --surface: #FFFDF9;
  --surface-raised: #FFFFFF;
  --surface-subtle: #F4EFE9;
  --border: #E5DDD5;
  --border-strong: #CFC3B9;

  --success: #2B7A4B;
  --success-soft: #E0F2E7;
  --warning: #80550F;
  --warning-soft: #FAEACF;
  --danger: #B9383A;
  --danger-soft: #F9E3E3;
  --focus: #267977;
}
```

### Accessible pairings

- Default primary button: `#DB5B31` background with `#1F1820` text.
- White text on `#DB5B31` is not permitted for normal-size copy; it does not meet WCAG AA contrast. White is allowed only for large bold display text that satisfies the large-text threshold, or on `#A64022` after verification.
- Teal and gold use ink text. White text is not allowed on `#3DABA9` or `#E9992F`.
- Orange body text on a light surface uses `#A64022`, not the brand anchor.
- Teal body text on a light surface uses `#267977`.
- Gold body text on a light surface uses `#80550F`.
- Muted text uses `#716A72` or darker on `--canvas`/`--surface`.
- Validate real foreground/background pairs with an automated contrast test; token names do not guarantee accessibility in every composition.

### Distribution

Aim for approximately 70% warm neutrals, 20% ink/structural color, and 10% brand/semantic accents. Orange is the main interaction signal; if every card is orange, nothing is primary.

Do not use gradients on routine UI controls. Illustration lighting may contain painted tonal variation. A rare reward glow can use a subtle radial alpha gradient derived from gold, never multicolor “AI” gradients.

## 4. Typography

### Families

- English UI: **Plus Jakarta Sans**, variable when available.
- Arabic UI: **Alexandria**, selected for contemporary, highly readable Arabic with an Egyptian voice.
- Python, terminal, and inline code: **JetBrains Mono**.
- Fallbacks: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; Arabic adds `Tahoma, Arial, sans-serif`; code adds `ui-monospace, "SFMono-Regular", Consolas, monospace`.

Load fonts with the current Next.js font mechanism after reading the installed Next.js documentation. Limit weights and subsets. Font failure must preserve readable metrics and never hide text.

### Scale

Use fluid display sizes and stable application sizes:

| Token | Desktop | Compact | Weight | Line height | Use |
| --- | ---: | ---: | ---: | ---: | --- |
| `display-xl` | 64 px | 42 px | 750–800 | 1.04 | landing hero only |
| `display` | 48 px | 36 px | 750 | 1.1 | world/major result title |
| `h1` | 36 px | 30 px | 700 | 1.18 | screen title |
| `h2` | 28 px | 24 px | 700 | 1.25 | major section |
| `h3` | 21 px | 19 px | 650–700 | 1.3 | card/panel title |
| `body-lg` | 18 px | 17 px | 400–500 | 1.65 | hero and explanation |
| `body` | 16 px | 16 px | 400 | 1.6 | standard UI copy |
| `label` | 14 px | 14 px | 650 | 1.35 | controls and metadata |
| `caption` | 12 px | 12 px | 550 | 1.4 | timestamps and support text |
| `code` | 15 px | 14 px | 450 | 1.65 | editor default |

Arabic usually needs slightly more line height. Do not reduce Arabic font sizes to imitate Latin density. Avoid all-caps Arabic styling and excessive uppercase English; short eyebrow labels may use letter spacing only in English.

Line length is 45–75 characters for reading copy. Interface labels are sentence case. Never place essential copy inside generated images.

## 5. Spatial system

Use a 4 px base and an 8 px working rhythm:

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96
```

- Inline icon gap: 8 px.
- Related field/control gap: 12–16 px.
- Card padding: 20 px compact, 24 px standard, 32 px feature.
- Section gap: 48–64 px application, 80–96 px marketing.
- Minimum touch target: 44×44 CSS px; primary touch actions target 48 px height.

### Containers and breakpoints

| Range | Behavior |
| --- | --- |
| `< 640 px` | phone content/progress mode; no full code editor |
| `640–899 px` | compact tablet; single-column content, navigation drawer |
| `900–1199 px` | landscape tablet; full mission workspace with compressed rails |
| `1200–1439 px` | standard desktop; persistent learner navigation |
| `≥ 1440 px` | wide desktop; cap reading/application width and add breathing room |

- Marketing max width: 1,280 px.
- Application content max width: 1,440 px.
- Reading column: 720 px.
- Auth/onboarding panel: 440–520 px.
- Sidebar: 232 px expanded, 72 px compact where necessary.
- Top application bar: 64 px.

Use CSS logical properties (`margin-inline`, `padding-inline`, `inset-inline-start`) so RTL is native, not patched.

## 6. Shape, border, and elevation

TICO uses soft rectangles, not a sea of pills.

```css
--radius-xs: 6px;
--radius-sm: 10px;
--radius-md: 14px;
--radius-lg: 18px;
--radius-xl: 24px;
--radius-round: 999px;

--shadow-card: 0 4px 18px rgb(31 24 32 / 0.06);
--shadow-float: 0 14px 40px rgb(31 24 32 / 0.12);
--shadow-action: 0 5px 0 rgb(31 24 32 / 0.16);
```

- Inputs and buttons: 10–12 px radius.
- Cards and panels: 16–20 px.
- Large illustration windows: 24 px.
- Pills only for compact state, filters, tags, or counters.
- Default cards use a 1 px border. Add a shadow only to interactive/elevated cards.
- Primary buttons may use a restrained 2–4 px physical “press” shadow; reduce it to zero on press.
- Never stack heavy border, large shadow, and saturated fill on one element.

## 7. Iconography and illustration

Use one rounded outline icon family—Lucide is the default—with consistent 1.75–2 px strokes. Icons support labels; they do not replace unfamiliar actions. Mirror directional icons in RTL, but do not mirror universal media, code, check, warning, or brand marks.

The TICO robot appears at meaningful moments:

- hero welcome;
- onboarding reassurance;
- mission briefing;
- hint delivery;
- error encouragement;
- success celebration;
- thoughtful empty state.

TICO should normally occupy less than 25% of an application panel and never cover code, task text, input, or result. Use the asset bible's neutral, thinking, and celebration states. Do not invent a different mascot pose style per screen.

World illustration follows `docs/09-asset-bible-and-image-prompts.md`. Use contemporary Egyptian architecture and objects. No logos, readable image text, real official systems, or unrelated ancient-Egypt motifs.

### Establishing art is not the gameplay board

World cards and story briefings may use cinematic side-on or three-quarter establishing art. Interactive missions use a separate **2D orthographic playfield** viewed from the side or from a consistent high three-quarter/top-down camera. Never try to animate characters inside a flattened establishing illustration.

Every playable scene has independent layers:

1. a fixed locale-neutral playfield with readable walkable lanes, boundaries, destinations, and empty interaction slots;
2. transparent actor and prop sprites generated at that playfield's exact camera angle and scale;
3. DOM/SVG state overlays for selection, paths, targets, counts, and localized feedback;
4. a reviewed coordinate/nav graph owned by client content rather than inferred from image pixels at runtime.

Learner code changes semantic scene state; React maps the validated result to actor movement, queue changes, object state, or counters. Motion explains the causal sequence and never determines correctness. Characters must remain legible at their smallest runtime size, cannot cover interaction targets, and receive a visible non-motion state change when reduced motion is enabled.

The bakery v2 preview uses a side-on cutaway with independently rendered oven, counter, bread and actor layers in one 1600×900 SVG coordinate system. Follow [layered bakery production](13-bakery-layered-production.md). The earlier top-down prototype under `client/public/assets/worlds/bakery/gameplay/` is retained only as historical artwork, not the current gameplay camera. The supplied WhatsApp screenshots are spatial inspiration only and are not a style, layout, or asset source to reproduce.

## 8. Application shells

### Public shell

Landing/auth pages use a slim header: brand at logical start, concise navigation, locale control, sign-in, and one primary start action. On phones, retain brand, locale, and one menu button.

Landing hero uses a 5/7 or 6/6 text-to-art split on desktop and stacks copy before art on compact screens. One primary CTA and one secondary CTA are enough. Do not publish fictional user counts, ratings, or mission totals.

### Auth and onboarding shell

Use a centered 440–520 px card on warm canvas. Keep the TICO illustration at a lower corner outside the form's reading path. Labels are persistent; errors sit next to their fields; Google sign-in is visually secondary but fully available. No anonymous/guest action.

Multi-step onboarding uses a labelled progress indicator, not dots alone. Browser Back must behave predictably. Preserve entered data when moving between steps.

### Learner shell

Desktop uses a persistent sidebar and top utility row. Navigation order for MVP:

1. Home
2. World map
3. Learning path
4. Progress
5. Achievements
6. Projects, only when the feature exists
7. Profile and settings below a separator

Do not add a leaderboard or coin balance. Show XP as a reward summary, not a purchase currency. Current mission and Continue Learning dominate the dashboard.

On compact screens, the sidebar becomes an accessible modal drawer. Do not rely on a horizontal icon-only dock for primary navigation unless every destination has a persistent label.

## 9. Screen patterns

### Landing page

- Eyebrow: “A Python adventure through Egypt.”
- Headline names real Python and practical Egyptian problems.
- Art combines TICO with a contemporary world glimpse, not a generic skyline.
- “Start learning” is primary; “Explore the worlds” is secondary.
- Below the fold: three worlds, how the loop works, safety/real-syntax proof, final CTA.

### Signup and login

- Inputs are 48 px high with visible labels.
- Signup asks only for what is needed now; age uses the approved coarse band, never exact birth date.
- Password requirements appear before failure and update without relying on color.
- OAuth divider reads as an alternative, not a requirement.
- Loading actions keep their width and use a text label such as “Creating account…”
- Generic auth errors do not reveal whether an email exists.

### Onboarding and diagnostic

- One question or tightly related group per screen.
- Show progress as “Step 2 of 4” plus a bar.
- Learning preference choices use icons, labels, and explanation.
- Assessment code is LTR even inside Arabic screens.
- Selected answer uses border, background, check icon, and label—not color alone.
- Assessment result explains that the plan is adjustable; it does not rank intelligence.

### Dashboard

Order: greeting → continue mission → journey progress → concept progress → recent reward. Limit dashboard metrics to what changes the next learning decision. Use one feature card and at most three small support cards above the fold.

### World map

The map is a major illustrated play surface with exactly three chapter regions. States:

| State | Visual |
| --- | --- |
| Completed | success check, solid path behind, accessible label |
| Current | orange ring, gentle one-time pulse, “Current” label |
| Available | ink/teal outline, clear action |
| Locked | muted art, lock icon, prerequisite explanation |

Map nodes remain real buttons/links above the illustration. Never bake names into the image. Keyboard focus follows curriculum order, not arbitrary visual position.

### World overview

Use a wide scene crop, world title, short local problem, six-mission path, concept list, and one Start/Continue action. Locked missions remain readable and explain their prerequisite. Do not show invented live service details or official branding.

### Mission flow

The mission sequence is:

```text
Briefing → Problem discovery → Concept discovery → Coding workspace
         → Run/result → Debug or succeed → Recap/debrief
```

Keep stage progress persistent but quiet. Preserve state when moving backward. “Problem discovery” ensures the learner understands the situation before code. “Concept discovery” uses one compact visual model and a different example from the final solution.

### Coding workspace

Desktop layout:

```text
┌───────────────────────────────────────────────────────────────┐
│ breadcrumb   mission / concept                  XP   profile   │
├────────────────────┬──────────────────────────────────────────┤
│ story + challenge  │ editor                                   │
│ 28–32%             │ 68–72%                                   │
│                    ├─────────────────────────┬────────────────┤
│ TICO / current hint│ run controls            │ output/tests   │
└────────────────────┴─────────────────────────┴────────────────┘
```

- Challenge, expected behavior, and one visible example remain visible.
- CodeMirror is the editor; default code font is 15 px with line numbers and clear indent guides.
- Editor, stdin, output, tracebacks, and test values set `dir="ltr"` and `lang="en"`.
- `Run` is the primary editor action. `Submit` appears when semantically distinct; do not confuse the two.
- `Ctrl/Cmd+Enter` runs code. Reset is a quiet action with confirmation only when it would destroy meaningful work.
- Output is a live region after execution, but do not announce every keystroke or progress frame.
- Hints open without resizing away the editor or deleting output.
- Phone portrait shows the mission material and a clear “Continue on a wider screen” state; it does not stack a tiny editor.

### Error and debugging

Heading: “Something doesn’t look right yet” or a localized equivalent. Show what happened, what was expected when safe, the relevant line, and actions to Try again or Get a hint. Use a danger icon and soft red surface; never use an alarm-like full red panel.

### Mission complete and debrief

Reward order is learning first, reward second:

1. State what the code accomplished in the Egyptian world.
2. Name the concept improved.
3. Award 100 XP once.
4. Reveal a world badge only when earned.
5. Offer recap/replay and one Next mission action.

The AI debrief is a bounded mission summary, not a grade of the learner's intelligence or personality.

### Progress, achievements, projects, profile

Progress emphasizes evidence and next practice, not false precision. Pair percentages with labels and explain what changes them. Achievement cards state the actual criterion. Locked badges do not use shame copy. Projects are private learning artifacts in MVP. Profile is a learning identity, not a public social profile.

## 10. Core component specifications

### Buttons

All buttons keep an accessible name and 44 px minimum target.

| Variant | Styling | Use |
| --- | --- | --- |
| Primary | orange fill, ink text, 1 px strong-orange border, subtle press shadow | single next action |
| Secondary | raised surface, ink text, neutral border | valid alternative |
| Teal | teal fill, ink text | discovery/information action, never competing with primary |
| Ghost | transparent, ink text | navigation and low-priority action |
| Danger | danger fill or danger-soft with dark danger text | confirmed destructive action only |

Hover lifts at most 2 px. Press returns to baseline and scales no lower than 0.98. Disabled controls have no motion, retain readable labels, and include a reason nearby when needed. A loading button preserves dimensions and uses text plus a small indicator.

### Inputs

- Height: 48 px standard; textarea height follows content.
- Label remains visible above the control.
- Focus: 2 px teal ring with 2 px offset.
- Error: danger border plus icon and message linked through `aria-describedby`.
- Success validation is used sparingly and never while the learner is still typing.
- Placeholder demonstrates format only; it never acts as the label.
- Password reveal is a labelled 44 px control.

### Cards

Default: surface background, 1 px border, 18 px radius, 24 px padding. Only clickable cards receive hover/focus elevation. Do not nest more than one bordered card inside another. Entire-card links must retain a clear accessible name and cannot contain competing buttons.

### Progress

Progress bars include a text value and label. The fill animates only after measurement is known, never from a fake zero on every render. Skill mastery uses teal; curriculum completion uses orange; success uses green. Do not use gold as progress because it denotes reward.

### Badges and XP

XP uses the gold family with an icon and numeric label. World badges are illustrated, not emoji. A reward animation plays once when earned, not on every page visit. Never let animation delay persistence or navigation.

### Toasts

Toasts confirm background/reversible outcomes. Validation errors stay next to the relevant control. Toasts pause on hover/focus, remain long enough to read, and expose a polite live region. Destructive failures are persistent banners or inline panels, not disappearing messages.

### Dialogs and drawers

Trap focus, label the surface, close with Escape where safe, restore focus to the trigger, and prevent background interaction. Confirmation copy names the consequence. Account deletion requires a dedicated flow, not a generic modal with an orange primary action.

### Skeleton and loading states

Skeletons match final geometry and use low-contrast opacity, not fast shimmer. For longer model work, show a deterministic stage label and provide fallback/cancel behavior. Do not use an endlessly bouncing mascot as the only status indicator.

## 11. Kinetic motion system

TICO uses **Motion for React** through the `motion` package. Add it with `pnpm add motion` from `client/`, and import from `motion/react`:

```tsx
"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
```

Do not use the legacy `framer-motion` import in new code. Keep Motion inside the smallest possible Client Component; pages and layouts remain Server Components unless interactivity requires otherwise.

### Global configuration

Wrap interactive motion islands in a client provider:

```tsx
"use client";

import { MotionConfig } from "motion/react";

export function TicoMotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.8 }}
    >
      {children}
    </MotionConfig>
  );
}
```

The app must respect the operating system's reduced-motion setting. `MotionConfig reducedMotion="user"` is the baseline; use `useReducedMotion()` when a composition needs to replace movement with an opacity or color change. Never make progress, status, or learning feedback depend on seeing movement.

### Motion tokens

```ts
export const ticoMotion = {
  duration: {
    instant: 0.1,
    fast: 0.16,
    base: 0.24,
    slow: 0.4,
    celebration: 0.7,
  },
  ease: {
    enter: [0.22, 1, 0.36, 1],
    exit: [0.4, 0, 1, 1],
    standard: [0.4, 0, 0.2, 1],
  },
  spring: {
    control: { type: "spring", stiffness: 420, damping: 30, mass: 0.65 },
    card: { type: "spring", stiffness: 320, damping: 28, mass: 0.8 },
    reward: { type: "spring", stiffness: 260, damping: 18, mass: 0.9 },
  },
} as const;
```

### Motion grammar

- Enter: small opacity change plus 6–12 px movement from logical block direction, 160–240 ms.
- Exit: opacity first with 4–8 px movement, 100–160 ms.
- Hover: interactive cards lift 2–3 px; buttons lift 1–2 px.
- Press: return to baseline and scale to 0.98–0.99.
- Selection: border/background transition plus a check icon spring; do not scale the whole page.
- Layout change: use Motion `layout` only on the smallest stable container.
- Route/stage change: `AnimatePresence` with `mode="wait"` for one-at-a-time mission steps. Keep exit under 160 ms so navigation feels immediate.
- RTL: horizontal direction follows logical forward/back. Derive the sign from locale; never hard-code “forward = right.”

Prefer transform and opacity. Avoid animating layout-heavy `width`, `height`, `top`, or `left`; progress bars may use `scaleX` with a logical transform origin. Never animate editor line layout or terminal text positions.

### Required kinetic sequences

**Correct discovery answer**

1. Selected option border and check resolve in 160–220 ms.
2. TICO gives one small nod/wing movement.
3. Continue action becomes available with opacity and 6 px lift.

**Incorrect discovery answer**

1. Option performs one restrained 3 px nudge, never repeated shaking.
2. Explanation fades in beside/below it.
3. Focus moves only if necessary; never steal focus during typing.

**Code run**

1. Run button compresses and changes label to running.
2. Output panel uses a subtle activity indicator without shifting layout.
3. Result replaces loading via `AnimatePresence`; editor remains still.

**Mission success**

1. World state resolves first.
2. TICO celebration appears.
3. XP counts once from the previous value to the awarded value.
4. Badge reveals only if newly earned.
5. Next mission action appears last.

Keep the full success sequence under 1.8 seconds and allow immediate skip/navigation. Confetti uses at most 12 simple shapes, lasts under 900 ms, ignores pointer events, and is removed from the DOM.

**Mission unlock**

The lock fades/scales down, the node border changes, and the accessible label updates. No explosive effects, loud sound, or looping pulse. Current-node pulse runs at most twice.

### Continuous motion

Avoid decorative loops. Permitted exceptions are a short loading activity indicator and a very subtle TICO idle loop that stops after two cycles, when offscreen, when the tab is hidden, and under reduced motion. User-started gameplay simulations may run controlled walk, oven and handoff cycles while playback is active. One pausable clock drives them; pause, reset, hidden tabs and unmount stop progression. Under reduced motion, replace travel and frame cycling with static phase changes and equivalent captions. The bakery demo stops when the queue is served; it never autoplays on page load. No autoplay parallax in learning screens.

### Motion performance

- Animate only compositor-friendly properties.
- Do not attach scroll listeners when CSS or Motion values can do the job.
- Lazy-load heavy celebration code.
- Use stable keys; accidental remounting must not replay rewards.
- Test on mid-range Android tablet hardware and throttled desktop CPU.
- Never block form submission, result persistence, or route navigation on an animation callback.

## 12. RTL and bilingual behavior

- Root `lang` and `dir` match the locale.
- Navigation, sidebars, breadcrumbs, drawers, and step direction mirror through logical layout.
- Numbers follow localized prose unless they are code/test data.
- Code, terminal, filenames, keyboard shortcuts, and Python identifiers are wrapped in an LTR isolation boundary.
- Mixed inline technical text uses `<bdi>` or explicit bidi isolation; do not fix it with stray punctuation.
- Scene art itself is not mechanically mirrored when that would reverse railway, traffic, or cultural details. UI overlays reposition independently.
- Animation direction uses a locale-aware logical axis.
- Arabic strings are written as natural phrases, never concatenated fragments.

## 13. Responsive behavior

Do not merely scale the desktop canvas.

- Phone: public pages, auth, story, assessment, roadmap, progress, recap, settings. Coding CTA explains the landscape-tablet/desktop requirement.
- Compact tablet: stacked discovery and concept views; drawers replace fixed sidebar.
- Landscape tablet: two-column coding workspace; story/hints can collapse without losing state.
- Desktop: persistent app navigation and side-by-side workspace.
- Wide desktop: cap content width; do not stretch editor lines or cards to fill the screen.

Keep primary action visible without covering content. Avoid sticky UI that consumes more than 20% of phone height. Test 320 CSS px width, 200% zoom, long English, and long Arabic strings.

## 14. Accessibility requirements

WCAG 2.2 AA is the minimum:

- semantic landmarks and heading order;
- keyboard completion of every mission step;
- visible focus with at least a 2 px ring and strong contrast;
- 44×44 px targets;
- text contrast verified for every state;
- icon plus label/shape for statuses;
- polite live regions for results and toasts; assertive only for immediate safety-critical errors;
- correct field labels, descriptions, and error association;
- reduced motion with meaningful static alternatives;
- no drag-only, hover-only, color-only, audio-only, or animation-only instruction;
- alt text describes gameplay-relevant scene changes, while decorative layers use empty alt;
- editor, output, hints, tests, modal, map, and success flow tested with screen readers.

Do not auto-focus on page load except for a deliberate single-task flow. Do not move focus merely to demonstrate motion. Focus follows the learner's task and returns predictably after overlays close.

## 15. Voice and interface copy

Copy is short, concrete, encouraging, and action-led.

Prefer:

- “Let’s check the total.”
- “Your program printed 7. The order needs 10.”
- “Try again” and “Show me a hint.”
- “You used a loop to count every batch.”

Avoid:

- “Wrong.”
- “You failed.”
- “Invalid user operation.”
- claims that TICO thinks, knows personal facts, or is a human teacher;
- excessive exclamation marks or emoji;
- culture-neutral filler where a precise world consequence is available.

TICO speaks friendly Egyptian Arabic for narrative and clear Arabic for technical accuracy. English is natural, not a literal Arabic translation. Python vocabulary and identifiers remain English.

## 16. Implementation rules for agents

1. Read this document before UI work and cite the screen pattern being implemented in the task/PR.
2. Check the installed Next.js docs before using framework APIs.
3. Use Server Components by default. Add `"use client"` only for state, browser APIs, event handlers, editor behavior, or Motion.
4. Use Tailwind CSS v4 tokens or CSS variables from this file; do not scatter raw brand hex values through components.
5. Use `motion/react` for kinetic feedback and presence transitions. Use CSS for simple color/focus transitions.
6. Build reusable primitives around behavior, not a `Tico*` wrapper for every HTML element.
7. Keep accessible HTML semantics; a styled `div` is not a button.
8. Build locale, RTL, loading, empty, error, reduced-motion, and narrow-layout states with the primary state.
9. Never fabricate product data, statistics, leaderboard entries, prices, or official Egyptian information.
10. Use only the canonical TICO robot design; never redesign its antennae, face, proportions, orange body, or gold joint accents. Do not add a generic learning world, coin economy, public leaderboard, or social mechanic from the visual reference.
11. Reuse approved asset IDs; do not invent filenames or bake localized text into art.
12. Add component/visual tests for interactive states and verify keyboard and screen-reader behavior.

## 17. UI review checklist

Before a UI change is done, confirm:

- [ ] One primary action is visually obvious.
- [ ] The screen matches a documented TICO route and feature.
- [ ] Only the four brand anchors and approved supporting tokens are used.
- [ ] Foreground/background contrast passes, including hover, focus, selected, disabled, and error states.
- [ ] Arabic layout is truly RTL while all code/output remains LTR.
- [ ] Long translations, 200% zoom, phone, landscape tablet, and desktop are usable.
- [ ] Keyboard order is logical and focus is always visible.
- [ ] Status uses text/icon/shape as well as color.
- [ ] TICO and Egyptian imagery follow the asset/world bibles.
- [ ] Motion uses `motion/react`, explains cause/effect, and respects reduced motion.
- [ ] Animation does not replay accidentally or block persistence/navigation.
- [ ] Loading, empty, offline, error, and success states are designed.
- [ ] No sensitive or fabricated data appears in UI fixtures or screenshots.
- [ ] The next learner action remains obvious.

## 18. Reference implementation structure

Suggested client organization:

```text
client/src/
├── app/[locale]/
│   ├── (public)/
│   ├── (auth)/
│   └── (learner)/
├── components/
│   ├── ui/             # button, input, card, dialog, progress
│   ├── motion/         # provider, variants, reward sequences
│   ├── navigation/
│   ├── mission/
│   └── worlds/
├── styles/
│   └── tokens.css
└── lib/
    ├── i18n/
    └── motion/
```

Route groups organize code but do not change URLs. Component names should express product behavior—`MissionRunner`, `HintPanel`, `WorldNode`, `XPReward`—while low-level primitives remain `Button`, `Card`, `Progress`, and `Dialog`.

## 19. External implementation reference

Use the current official [Motion for React documentation](https://motion.dev/docs/react) for API details. The required accessibility baseline is [MotionConfig with user reduced motion](https://motion.dev/docs/react-motion-config) plus targeted [`useReducedMotion`](https://motion.dev/docs/react-use-reduced-motion) behavior. Installed Next.js documentation remains authoritative for React and rendering boundaries.

## 20. Figma landing-page implementation

The public landing page at `/en` and `/ar-EG` follows the composition in
[Figma node 2:42](https://www.figma.com/design/mYA52DN0D9UfDUJzB4PQsX/Untitled?node-id=2-42):
illustrated hero, four numbered learning steps, world cards, centered call to action,
and rounded teal footer. Its styles are scoped in `landing-page.module.css`.
The supplied hero and logo artwork are retained as the explicit landing-page reference;
this does not change the contemporary-Egypt direction for gameplay assets.
Landing-only supporting colors are `#FDF1EC` (illustration transition) and `#174E58`
(footer and secondary actions). Existing brand anchors remain. Per the requested Figma fidelity correction, the landing page uses Inter, with Outfit for world-card titles; Arabic retains Alexandria. Other app screens retain Plus Jakarta Sans.

The reference's unverified testimonials, student-count claim, pricing, and fourth world
are not published. Social and payment marks are restored from the exact Figma SVG exports
as requested. Payment marks are presentation only; this change adds no checkout. The three approved worlds retain their existing
content and art. The unfinished video block becomes a linked first-mission preview;
the external help-center link becomes local, keyboard-operable FAQ disclosures.
Sign Up and Log In link to bilingual account forms consuming the existing auth actions.
Contact Us and social destinations await owner-supplied contact details; until then the
contact disclosure explains availability and social marks are non-interactive.
Orange buttons use ink text for contrast. Arabic mirrors content and navigation without
flipping the illustration. Phone layouts stack the artwork below the hero copy.

Exact Figma PNG exports are stored in `client/public/assets/landing/`; Next.js optimizes
them at delivery. `client/public/assets/landing/sources.json` records their source nodes.

The revised header is a 76 px floating pill on desktop. An IntersectionObserver applies
backdrop blur once the top marker scrolls out of view, with cleanup on unmount. The hero
uses a transparent mask ending at the same solid peach canvas as the following section,
so its bottom edge cannot create a color seam. Native scrolling retains a thin warm thumb.
Header, artwork, and typography reflow at tablet and phone widths; anchors allow room for
the fixed header. Account forms expose required fields, pending, failure, and email-confirmation
states; successful live authentication depends on the configured Better Auth and Google OAuth server credentials.

## 21. About and Pricing

`/[locale]/about` implements Figma `2:797`: three peach panels for About Us, Our
Mission, and Our Vision, with the exported orange SVG icons and a 4 px orange lower
edge. `marketing-pages.module.css` owns the layout; English uses Inter and Arabic
uses Alexandria. Panels stack at every width and use the existing reduced-motion-aware
Reveal component.

`/[locale]/pricing` implements the three-card composition in Figma `2:526`: Free Plan,
Premium, and Pro, with preview amounts $0, $30, and $100. The source repeats placeholder
feature text and specifies no billing period. Until product supplies the real plan
matrix and billing terms, a visible preview notice labels this state. Lists describe
the documented TICO learning experience, not distinct paid entitlements. Paid actions
open a native modal explaining availability, with Escape close, focus containment,
focus restoration, and a link to the learning map. This is presentation only: no
subscription, billing, quota enforcement, or account-plan mutation is implemented.
The Free Plan links to signup rather than asserting an unverified current subscription.

`marketing-chrome.tsx` shares the existing animated navigation and footer across the
landing, About, and Pricing pages. The current route is marked with `aria-current`,
and header locale switching preserves About/Pricing. Guest account actions remain
consistent with the landing page instead of presenting the reference's fictional
signed-in profile. Existing landing animation implementations are unchanged.
Asset source nodes are recorded alongside the exports in `public/assets/about/` and
`public/assets/pricing/`. New pages are checked with Chrome DevTools at desktop and
320 px widths in both locales, including the plan dialog's keyboard behavior.

## 22. Reusable mission panels and illustrated challenge map

The requested Figma nodes `2:1266`, `2:1346`, `2:1354`, `2:1337`, `2:1359`,
`2:1276`, and `6:82` are implemented under `client/src/components/mission-ui/`.
They follow the supplied peach gradients, Inter typography, rounded panels and pill
buttons; orange actions retain ink text for contrast. Arabic uses Alexandria. Map
banner titles use Caveat in English. These choices are scoped to the new components.

`/[locale]/components-preview` demonstrates all six references, native modal behavior,
and the map's four node states. `2:1276` is named “edit profile” in Figma but contains
the same mission-success content as `2:1266`; both use `MissionSuccessPanel`.
`/[locale]/challenges` previews the two illustrated Figma scenes with independently
selectable mission nodes. The existing three-world learning map remains the curriculum
entry point. The preview does not assert saved progress or change world ordering.

The caller supplies all panel callbacks and map availability. Exact Figma asset exports
and provenance are stored in `public/assets/mission-ui/` and `public/assets/challenge-map/`.
Sprite-sheet crops retain the Figma geometry in CSS. See
[mission component usage](mission-ui-components.md) for APIs and browser checks.

## 23. Google login and two-step onboarding

The owner's revised reference uses Figma `2:1008` for login, `2:1202` for personal
setup, and `2:1244` for Learner/Challenger selection. Login uses an orange window bar,
rounded peach-gradient frame, Inter typography, and a large waving TICO. The single
Google action retains the owner's Google-only requirement; the reference's password,
GitHub, and separate signup controls are not reintroduced.

Onboarding preserves the two progress segments, large thinking TICO crop, rounded
inputs, and large selectable cards. Step one collects a name and coarse age band in
place of the reference's exact birthday, following the privacy baseline. Step two
collects `LEARNER` or `CHALLENGER` as a self-reported preference, not an authorization
role or an automatic curriculum unlock. Back preserves both steps' values. Native
radio controls provide keyboard selection; progress is announced as Step 1/2.
White text is used on orange only for large bold actions meeting the contrast rule.
Arabic retains Alexandria, and compact layouts stack the artwork below the controls.
Motion for React handles short step transitions and respects reduced motion.

`/[locale]/onboarding/preview` exposes both steps for visual review without an account;
its completion is explicitly a preview and saves nothing. The real onboarding route
continues to verify identity and uses the authenticated completion action. Asset source
nodes and crop geometry are recorded in `public/assets/auth/sources.json`.

## 24. Chapters map and chapter worlds map (2026-09-15)

`/[locale]/learn` implements Figma `23:52`, "Select your world": four chapter islands
down one painted sky, a dashed road weaving between them, a plaque beside each and one
action — an orange Join World, or a black Locked pill with the lock badge riding its top
edge. `/[locale]/learn/[chapterSlug]` implements Figma `23:119`: the chapter's worlds
as floating Egyptian islands, TICO standing on the one to play, a Play button into that
world's own mission map at `/worlds/[worldSlug]`, and a lock on the ones after it. The
existing world page and its mission road are the third level and are unchanged. This
supersedes the three-region map in §9 as the learner's entry point; the three Egyptian
worlds now sit inside the first chapter, and the three chapters drawn after it (OOP,
Data Structure, Algorithms) are locked until they have worlds. Chapter content lives in
`client/src/content/chapters.ts`; both maps read progress through
`services/chapters-map.service.ts` so they can never disagree about what is open.

Both maps are measured in the 1440-wide artboard and scale with a container-query unit
(`--px`, one artboard pixel), so the composition holds from laptop to wide desktop.
Under 760 px the scene is not shrunk; it becomes a stacked list — island, plaque,
action — with the road removed and the curriculum order kept. Positions use logical
insets, so Arabic mirrors the islands and the road; the art itself is never mirrored,
and TICO turns to face along the road. Copy follows the Figma with two additions the
design system requires: each plaque names its status in words (locked ones name the
prerequisite), and every island on the worlds map carries a small name plaque, since
names are never baked into art. Inter on English, Alexandria on Arabic, orange actions
with ink text; the Figma's `#D5582A` kicker uses the brand anchor.

Motion is a hover lift and press on the action, a single 400 ms entrance for TICO, and
nothing continuous. The landing page's worlds section embeds the chapter worlds map in
a `framed` variant (sky inside a rounded frame, header band trimmed). Assets are the
Figma image fills trimmed to their alpha bounds, as webp, in
`public/assets/chapters-map/` and `public/assets/worlds-map/`, with `sources.json` in
each recording the node ids.
