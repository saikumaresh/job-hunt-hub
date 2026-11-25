# Job Hunt Hub

**Your whole job search, in one place.** Track every role from Saved to Offer, let Gmail and Calendar tell you what moved, never miss a follow-up, and build a tailored, ATS-safe, one-page resume for each application. Every resume stays true to your own facts.

It's a Claude artifact made to be installed with Claude's **Install as app** on Mac or Windows. It also runs in the Claude app on your phone.

**Open the app:** https://claude.ai/artifact/1GbSrTUG7QukNa4dqxqxtN

## Features

- **Setup wizard (about 3 minutes):** paste your resume, set targets, connect Gmail and Calendar, choose follow-up rules, and add your first role.
- **Pipeline board:** Saved, Applied, Screening, Interview, Offer, plus Closed. Drag cards on desktop; tap stage chips on a phone.
- **Add a role by pasting the post:** Claude fills in the company, role and location, and scores the match with quotes from the post as evidence.
- **Gmail sync (read-only):** finds confirmations, assessments, interview invites, offers and rejections, and suggests the stage change. Nothing moves until you accept.
- **Interviews** from Google Calendar for the next 14 days.
- **Follow-ups:** due after N days with no reply (7 after applying, 3 after an interview by default). Claude drafts the note; you send it yourself.
- **Resume builder:**
  - A master profile is the only source of facts.
  - Tailoring can only choose, order and lightly rephrase your own bullets.
  - Code refuses any new number, skill or bullet, and shows you each refusal.
  - Single-column, text-based PDF checked to be exactly one page, plus DOCX.
  - Saved versions are linked to each role.
- **Cover note:** 120 to 180 words from the same facts, with warnings if it drifts.
- **Stats:** applications per week, response and interview rates, days in each stage, and best sources.
- **Desktop app:** notifications for due follow-ups and upcoming interviews, a menu bar count, and an optional import from a markdown tracker file.
- **Guided tour** and an in-app How to use guide.
- **Private:** data lives in your own Claude account and the artifact owner can't read it.

## What it never does

- It never applies, submits or uploads for you.
- It never sends, replies to, labels or deletes email.
- It never contacts recruiters or anyone else.
- It never adds a skill, number, title or employer you didn't give it.

## Install

1. Open the link above in the **Claude desktop app** (Mac or Windows, 6.28899.0 or later).
2. Choose **Install as app**, or press the app's own **Install as app** button.
3. Follow the setup wizard.

Full guide: [docs/user-guide.md](docs/user-guide.md).

## Develop

Requires Node 20 or later.

```bash
npm install
npm run check      # lint + format check + unit tests + build (what CI runs)
npm run build      # writes dist/index.html, one self-contained page
npm run smoke      # headless screenshots with sample data (needs Python Playwright)
```

## Layout

```
src/
  main.js             entry: navigation, boot
  setup.js            first-run wizard
  state.js            settings, profile, jobs, versions, inbox
  view-*.js           Board, Job panel, Inbox, Resume, Stats, Settings
  ai.js               every Claude call, each followed by a fact check
  resume-export.js    PDF (jsPDF) and DOCX (docx)
  desktop.js          alerts and menu bar
  guide.js            tour steps and How to use
  logic/pipeline.js   stages, follow-ups, stats, email rules, tracker import (unit tested)
  logic/facts.js      guardrails that keep Claude's output tied to real facts (unit tested)
  logic/resume.js     resume assembly and one-page layout engine (unit tested)
  logic/prompts.js    every prompt sent to Claude
  shared/             theme, DOM helpers, storage, dates, CSV, tour, Claude capability wrappers
scripts/build.mjs     esbuild bundle inlined into dist/index.html
tests/                node:test unit tests
```

See [docs/architecture.md](docs/architecture.md).

## License

MIT
