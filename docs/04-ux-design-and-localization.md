# UX design and localization

This document defines information architecture and localization behavior. [The TICO UI design system](design.md) is the authoritative implementation guide for visual tokens, component states, responsive layouts, and kinetic motion.

## Information architecture

Public routes:

- `/[locale]` — landing page and product explanation.
- `/[locale]/about` — platform mission and vision.
- `/[locale]/pricing` — plan preview; paid subscriptions remain unavailable until billing terms and entitlements are defined.
- `/[locale]/login` — Google sign-in for new and returning users.
- `/[locale]/signup` — compatibility redirect to the same Google sign-in page.

Authenticated learner routes:

- `/[locale]/onboarding` — two-step first-visit profile setup; interrupted setup resumes.
- `/[locale]/onboarding/preview` — public, non-persistent visual preview of both setup steps.

- `/[locale]/learn` — "Select your world": the chapters map, one island per curriculum chapter.
- `/[locale]/learn/[chapterSlug]` — a chapter's worlds map, one island per world; a shut chapter redirects to `/learn`.
- `/[locale]/worlds/[worldSlug]` — world scene and mission path.
- `/[locale]/missions/[missionSlug]` — coding workspace.
- `/[locale]/progress` — concepts, completed missions, badges, and replay.
- `/[locale]/settings` — locale, learner mode, accessibility, account deletion.

Staff routes live under `/[locale]/admin` and require `TEACHER` or `ADMIN` authorization on every server entry point.

## Visual language

The interface should feel like a playable illustrated field notebook, not a corporate dashboard. Use sand and paper neutrals, Nile blue for navigation, teal for safe progress, warm coral for calls to action, and ink navy for readable text. Scene art supplies atmosphere; UI surfaces remain calm and high-contrast.

Recommended design tokens:

```css
--sand-50: #fffaf0;
--sand-100: #f6ecd7;
--ink-900: #17243b;
--nile-700: #155e75;
--nile-500: #0891b2;
--palm-600: #39805f;
--coral-500: #e76f51;
--sun-400: #f4b942;
--danger-600: #b9383a;
```

Status never relies on color alone. Pair it with an icon, label, or motion-safe shape change.

## Mission workspace

Desktop and landscape tablet layout:

```text
┌──────────────────────────────────────────────────────────────────┐
│ world breadcrumb     mission title     XP     locale/profile     │
├──────────────────────┬───────────────────────────────────────────┤
│ illustrated scene    │ task, examples, and active hint           │
│ + character reaction ├───────────────────────────────────────────┤
│                      │ Python editor                              │
│                      ├──────────────────────┬────────────────────┤
│                      │ Run / Submit / Hint  │ output and tests   │
└──────────────────────┴──────────────────────┴────────────────────┘
```

- Preserve the editor and output while opening hints or story details.
- `Run` executes visible checks; `Submit` executes the full formative suite.
- Keyboard shortcut: `Ctrl/Cmd+Enter` runs. Never override browser-standard shortcuts.
- Errors link to the relevant editor line when available.
- TICO's panel is mission-bounded; it is not a global free-form chatbot.

Phone portrait shows story, examples, progress, recap, and replay history. It explains that coding requires a wider screen and does not present a cramped editor.

## Arabic and English

- Canonical locales are `ar-EG` and `en`; unknown locales redirect to the saved preference or `ar-EG` default.
- Pass locale explicitly across client, server, AI, analytics, and content APIs.
- Arabic narrative may use friendly Egyptian phrasing. Technical explanations use clear Modern Standard Arabic where ambiguity would harm learning.
- Python keywords, identifiers, code samples, tracebacks, console output, numbers inside code, and keyboard shortcuts stay English/LTR.
- The document direction follows locale. Editor, output, and inline code set `dir="ltr"` and `lang="en"` explicitly.
- Do not construct translated sentences by concatenating fragments. Messages use ICU-style parameters and plural/select rules.
- Localize meaning, not word order. Keep a glossary for variable, string, condition, loop, function, list, dictionary, error, input, output, and test.

Example:

```json
{
  "mission.run": "شغّل الكود",
  "mission.testsPassed": "نجح {passed, number} من {total, number} اختبارات"
}
```

## Accessibility

MVP target is WCAG 2.2 AA:

- complete keyboard navigation and visible focus;
- semantic headings, landmarks, labels, and live regions;
- 4.5:1 normal-text contrast;
- minimum 44×44 CSS-pixel primary touch targets;
- reduced-motion mode and no required drag-only interaction;
- descriptive scene alt text focused on gameplay information;
- transcript/caption for any audio;
- zoom to 200% without loss of task controls;
- screen-reader test of editor, output, hints, test results, and success state.

Decorative scene layers use empty alt text. A status-changing illustration must have equivalent live text.

## Component boundaries

Pages and layouts remain Server Components by default. Limit client components to the editor/runner, interactive world map, locale control, and small dialog/menu islands. Server Actions validate, authenticate, and authorize mutations even when the UI already hides the action.

## Empty, loading, and error states

- Skeletons preserve layout and do not imitate finished text.
- Empty progress explains how to start mission one.
- Recoverable runner failure offers “restart Python” without losing code.
- Network loss does not block local runs; queue the latest safe progress sync and label it unsaved.
- AI unavailability falls back to reviewed static hints and template missions.
- Auth expiry preserves unsaved code locally, then requests sign-in.
