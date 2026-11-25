# Architecture

## Principles

1. **Pure logic first.** Stages, follow-ups, stats, email rules, fact checks and page layout are pure modules under `src/logic/`, all unit tested. Views only render and wire events.
2. **Every capability is optional.** `claude.use(name)` can resolve `null` and any call can be refused. Each feature checks first and says what still works.
3. **Claude proposes, code checks, you decide.** Every Claude answer passes through `src/logic/facts.js` before you see it. Stage changes from email are suggestions you accept one at a time.
4. **Private by default.** Data lives under `data/users/<id>/job-hunt-hub/kv/<key>`, private even from the artifact owner.

## Capabilities

| Capability   | Used for                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `db`, `user` | settings, master profile, one document per role, resume versions, inbox suggestions                          |
| `desktop`    | notifications, menu bar, optional tracker-file import (manifest: `notifications`, `menu-bar`, `full-access`) |
| `mcp`        | Gmail: `search_threads`. Google Calendar: `list_events`. Read-only tools only.                               |
| `sample`     | profile structuring, post analysis, tailoring, cover note, follow-up draft                                   |
| `downloads`  | PDF, DOCX and CSV                                                                                            |

## Fact checks (`src/logic/facts.js`)

| Check               | Rule                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateProfile`   | gives every role and bullet a stable id; flags bullets whose numbers aren't in the pasted text                                                                               |
| `validateAnalysis`  | keeps only evidence whose quote really appears in the post; no verified quote means no score                                                                                 |
| `validateTailoring` | bullet ids must belong to the role; a rewrite may not add a number or grow past 1.4x; skills must already be in the profile; omitted roles are kept so dates stay continuous |
| cover note          | 120 to 180 words, and no number outside the profile or post, otherwise a warning                                                                                             |

## Resume pipeline

```
pasted text --Claude--> validateProfile --> master profile
post + profile --Claude--> validateTailoring --> tailoring
profile + tailoring --> assembleResume --> fitOnePage(measure) --> layout ops
layout ops --> HTML preview | jsPDF text PDF (page count checked) | DOCX at the same size
```

`fitOnePage` steps the font from 10.5pt to 9pt, then drops the lowest-priority bullets (later bullets of older roles) while keeping one per role. Measurement is injected, so the layout is tested in Node and uses jsPDF's Helvetica metrics in the app.

## Email rules

`classifyEmail` checks the subject and snippet in priority order: Offer, Rejected, Interview, Screening, Applied. `matchJob` compares company-name tokens (minus filler words like Pvt, Ltd, careers) with the sender and subject, and needs at least half the tokens to match. Only forward moves, or moves to Rejected or Offer, are suggested.

## Security

- Every value from a person, connector or Claude is escaped or set with `textContent`. Links render only when they start with `https://`.
- CSV export neutralises spreadsheet formulas.
- Connector errors are mapped per code, so each one shows its own fix.
