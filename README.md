# Loop Engineering — Test Repo

A runnable companion to **Chapter 7: Loop Engineering** of *Agentic Development in Practice*.
It ships a delivery loop as real, versioned GitHub primitives so you can **watch a feature go
from a filed issue to a governed merge** — driven from your terminal with `/loop` in GitHub
Copilot CLI.

> **The one idea:** you don't prompt the agent — you *engineer the loop that prompts it*. You
> show up at exactly two gates: **approve the plan**, **authorize the merge**.

## Five capabilities

Every iteration passes through the same five recurring capabilities:

1. **Discover** — read the issue, load conventions, turn a request into an executable objective. Nothing is built yet.
2. **Plan** — produce a delivery plan, then **pause**. *(Gate 1 — you review thinking, not typing.)*
3. **Execute** — once approved, work autonomously in small, committed slices.
4. **Verify & Recover** — self-validate each iteration; a red check becomes the next input.
5. **Complete** — every box checked + CI green → prepare the PR and stop. *(Gate 2 — you merge.)*

## The six primitives

**None of them mention the feature being built** — build the loop once, every issue rides it.

| # | Primitive | File | What it steers |
|---|---|---|---|
| 1 | The engine | `.github/prompts/deliver-feature.loop.md` | What `/loop` runs. One tick = advance one capability, then stop |
| 2 | The protocol | `.github/skills/deliver-feature/SKILL.md` | Source of truth for the five capabilities + two gates |
| 3 | The conventions | `.github/copilot-instructions.md` | Always-on law, auto-loaded every turn |
| 4 | The contract | `.github/ISSUE_TEMPLATE/feature-loop.yml` | Machine-checkable acceptance checklist |
| 5 | The verifier | `.github/workflows/verify.yml` | **Verify & Recover** on every push + gates **Complete** |
| 6 | The guardrails | `.github/hooks/pre-pr.json` + `.vscode/mcp.json` | Keep **Execute** off `main`; least-privilege connector |

## Run the loop

**Setup (once):** make the repo **public** (free Actions), create the loop label
(`gh label create loop --color 1f6feb`), and install GitHub Copilot CLI.

**1 — File a loop-ready issue** via the **🔁 Feature Loop** template, or:

```bash
gh issue create --title "[loop] Book launch landing page" --label loop --body-file - <<'EOF'
## Goal
A simple, self-contained HTML landing page for the book launch.
## Acceptance criteria (machine-checkable)
- [ ] index.html renders title, subtitle, author, blurb, cover, CTA
- [ ] Responsive: no horizontal overflow at 375px and 1280px
- [ ] Accessibility checks pass (single h1, landmarks, alt text, contrast)
- [ ] CI green
EOF
```

**2 — Start the loop.** Run `copilot` in this repo, then:

```text
/loop 15m advance the delivery loop for issue #<ISSUE#> by one capability using @.github/prompts/deliver-feature.loop.md
```

`/loop` schedules that prompt to re-run **for this session**; each tick advances one capability
and stops, so the gates hold. Close the terminal and it stops.

**3 — Watch it move, steer at the two gates:**

| Capability | On the issue/PR thread | Your move |
|---|---|---|
| **Discover** | Loop posts goals, assumptions, open questions — no code | — |
| **Plan** | Loop posts a file map + test mapping + rollback, then **stops** | 🚦 reply **`plan approved`** |
| **Execute** | Commits stream onto `feature/<#>-…` in small slices (`pre-pr` keeps it off `main`) | — |
| **Verify & Recover** | `verify` runs on each push; a red check self-heals next tick | — |
| **Complete** | Gate stays red until all boxes checked + CI green, then loop announces "ready" | 🚦 click **Merge** |

> Tip: for a snappier demo use `/loop 5m …`.

## The money moment — prove "PR opened" ≠ "done"

The `done-condition` job counts `- [ ]` vs `- [x]` in the PR body and **fails while any box is
unchecked**, so the loop cannot declare itself finished early. On any open PR:

```bash
gh pr checks <PR#>   # unchecked boxes → "done-condition (hard gate)  fail"
                     # check every box in the PR body, re-run → pass
```

## Try the guardrail hook — no CI needed

```bash
echo '{"tool_input":{"command":"git push origin main"}}' | python .github/hooks/scripts/pre_pr_check.py
# → BLOCKED — Direct push to `main` is not allowed. (exit 2)
echo '{"tool_input":{"command":"git push origin feature/4-launch-page"}}' | python .github/hooks/scripts/pre_pr_check.py
# → allowed (exit 0)
```

## The landing page (issue #3)

A worked output of the loop lives at [`index.html`](./index.html) — a single, self-contained
book-launch page (inline CSS, no build step).

- **Open it:** double-click `index.html`, or `python -m http.server`.
- **Verify it:** with Node.js 24 installed, run:

  ```text
  npm ci --ignore-scripts --no-audit --no-fund
  npx playwright install chromium
  npm run lint
  npm test
  ```

The browser suite opens the page offline at 375px and 1280px, checking approved content,
keyboard navigation, accessibility (including contrast), and fixture-locked responsive
layout. CI runs the same checks and installs Chromium's system dependencies.

This is a demo with placeholder author credit and original cover artwork. The CTA links
to the on-page book description; there are no purchases, signups, or external runtime assets.

## Reset between demos

```bash
gh pr close <PR#> --delete-branch   # drop the demo PR + branch
# then open a fresh issue with the `loop` label for a clean Discover→Complete run
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Workflow **"Startup failure"** / billing lock | Make the repo **public**, or clear billing at `github.com/settings/billing` |
| `@.github/prompts/...` won't resolve | Start `copilot` from the repo root |
| Loop implements before you approve | It must **stop** after Plan — reply `plan approved` only when you mean it |
| Done-condition never passes | An acceptance box is still `- [ ]` — check every box in the PR body |

See `.github/copilot-instructions.md` for the always-on rules and
`.github/skills/deliver-feature/SKILL.md` for the full protocol.
