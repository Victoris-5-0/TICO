# Mission UI components

Source: Figma file `mYA52DN0D9UfDUJzB4PQsX`. Preview routes are available in English
and Egyptian Arabic and are excluded from indexing.

- `/en/components-preview`: all six requested references, dialog triggers, hint
  dismissal/restoration, and example map availability states.
- `/en/challenges`: the illustrated two-scene map from node `6:82`.
- Replace `/en` with `/ar-EG` for RTL previews.

## Integration

Import from `@/components/mission-ui/mission-panels` inside an interactive component.
All panels require `locale`. Text overrides are optional except `hint`, which must be
supplied by the caller. No panel changes progress or runs a mission itself.

| Export | Required behavior props | Figma reference |
| --- | --- | --- |
| `MissionSuccessPanel` | `onBackToMap`, `onNext` | `2:1266`, identical `2:1276` |
| `MissionStartPanel` | `onStart`, `onCancel` | `2:1346` |
| `MissionExitPanel` | `onExit`, `onCancel` | `2:1337` |
| `MissionHintPanel` | `hint`, `onClose` | `2:1354` |
| `MissionMascot` | Optional `pose`: start, hint, exit | `2:1359` for start |
| `MissionDialog` | `open`, `onClose`, `label`, `children` | Shared modal behavior |

`MissionStartPanel` accepts `showMascot` to compose the standalone pose into the start
panel; it defaults to false to match Figma. `MissionExitPanel.description` should state
any unsaved-work consequence supplied by the host. Success supports `title`, `message`,
and `nextLabel`; panels support `titleId` for host heading associations.

```tsx
const [open, setOpen] = useState(false);

<button onClick={() => setOpen(true)}>Start mission</button>
<MissionDialog open={open} onClose={() => setOpen(false)} label="Start mission">
  <MissionStartPanel
    locale={locale}
    onStart={() => { setOpen(false); startMission(); }}
    onCancel={() => setOpen(false)}
  />
</MissionDialog>
```

The native dialog handles focus containment and background interaction. The wrapper
restores the trigger, closes on Escape through `onClose`, and prevents background
scrolling. Mount it continuously and control `open`; close it in action callbacks.
Motion is limited to entrance and interactive feedback, respects reduced motion, and
never delays a callback. The preview loads Inter with `--font-mission`; hosts that
need exact English Figma typography should provide this font variable. The components
fall back to the app's Plus Jakarta Sans when no variable is supplied.

## Map data

Import `ChallengeMap`, `ChallengeNode`, and `ChallengeStage` from
`@/components/mission-ui/challenge-map`. Supply `locale`, `stages`, and `onSelect`.

Each stage has an ID, localized title and stage label, a `bakery` or `traffic` theme,
and nodes. Nodes have an ID, localized label, `x`/`y` top-left coordinates in the
1440 × 1929 scene, and an explicit `available`, `current`, `completed`, or `locked`
status. Optional companion coordinates use the same scene space. Its message is live
text, separate from art. An empty stage array renders the localized empty state;
`emptyMessage` overrides that text.

Locked nodes stay keyboard discoverable and announce their state, but never call
`onSelect`. Current nodes use `aria-current="step"`. Numbers/checks supplement color,
and focus exposes the mission name. Caller-owned data determines progression; the
component does not infer access or persist anything. Runtime authorization belongs
in the mission/backend flow, not in this presentation component.

The separate map preview uses the first five authored mission names from each of the
two depicted worlds. All are available to preview, and selection opens a description
with a real world-overview link. This is explicitly labeled as a design preview, not
learner progress. It does not replace the three-world `/learn` curriculum.

## Verification

Use Chrome DevTools, per project-owner preference. Check both locales at 1440 px and
320 px, plus 200% zoom. Open each dialog with its trigger, tab between actions, close
with Escape, and verify trigger focus restoration. Check both confirmation actions,
success actions, hint dismissal and restoration, and locked-node non-activation.
Inspect natural asset loading, scene alignment, touch targets, and horizontal overflow.
Test with `prefers-reduced-motion: reduce`; entrance/hover transforms should be absent.
Run `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` from `client/`.
