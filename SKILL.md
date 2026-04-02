---
name: session-dashboard
description: Automatically opens a cmux sidepanel with live-updating session status when running Claude Code in cmux. Shows branch, PR link, changes summary, tasks, and notes. Auto-triggers at session start via hook.
---

# Session Dashboard

A live-updating markdown sidepanel in cmux showing session status.

## How It Works

1. **SessionStart hook** runs `init-dashboard.sh` when in cmux
2. Script creates `~/.claude/sessions/{project}-dashboard.md`
3. Opens it in a cmux sidepanel with live-reload
4. You update the file during the session - cmux auto-reloads

## Finding the Session File

The file path is predictable:
```
~/.claude/sessions/{project}-{branch}.md
```

Where:
- `{project}` = lowercase, hyphenated basename of working directory
- `{branch}` = current branch with `/` replaced by `-`

Example: `mb-ios` on `RETIRE-4666-money-chart` → `~/.claude/sessions/mb-ios-RETIRE-4666-money-chart.md`

## Keeping It Updated

Update the dashboard when:

| Event | Update |
|-------|--------|
| Start new task | "Current Focus" section |
| Complete task | Check off in "Tasks", update focus |
| Make commits | Refresh "Changes Summary" stats |
| Create/update PR | Update "PR" link and status |
| Important decision | Add to "Notes" |
| Hit a blocker | Add to "Notes" |

## Update Pattern

Use the Edit tool to update specific sections. The file uses markdown headers as anchors:

```markdown
## Current Focus

Implementing the money line chart animation
```

To update stats, run:
```bash
git diff --stat $(git merge-base HEAD main)..HEAD | tail -1
```

## Section Reference

| Section | Purpose |
|---------|---------|
| Branch & PR | Current branch, base branch, PR link, PR status |
| Changes Summary | What the branch does, file stats |
| Current Focus | Active work item (update frequently) |
| Tasks | Checklist of remaining work |
| Notes | Context, decisions, blockers, gotchas |

## Manual Initialization

If the dashboard didn't open automatically:

```bash
~/.claude/skills/session-dashboard/scripts/init-dashboard.sh
```

Or manually:
```bash
cmux new-split right
cmux markdown open ~/.claude/sessions/{project}-dashboard.md
```
