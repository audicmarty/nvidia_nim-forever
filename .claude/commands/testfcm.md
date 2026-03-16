---
description: Run the AI end-to-end free-coding-models workflow and inspect the generated report
argument-hint: [--tool crush|codex|claude-code|gemini|...]
---
Run the `/testfcm` workflow for this repository.

1. Read [task/TESTFCM-WORKFLOW.md](../../task/TESTFCM-WORKFLOW.md).
2. Run `pnpm test:fcm -- $ARGUMENTS` if `pnpm` exists. Otherwise run `npm run test:fcm -- $ARGUMENTS`.
3. Open the newest Markdown file under `task/reports/`.
4. Summarize:
   - the final status
   - the exact bugs or blockers found
   - the evidence files to inspect
   - the concrete tasks to resolve
5. If the report is not green, ask the user whether you should fix the issues now.
