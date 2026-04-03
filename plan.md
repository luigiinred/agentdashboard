# Implementation Plan: Issue #3 - Task tracking plugin

## Overview
Create a Claude Code plugin that uses hooks to automatically maintain a task list in the dashboard.

## Child PR Breakdown

### Child PR 1: Create task-tracking plugin scaffold
- Create plugin directory structure in `plugins/task-tracking/`
- Add `.claude-plugin/plugin.json` manifest
- Add SKILL.md with installation instructions
- ~50 lines
- Files: `plugins/task-tracking/.claude-plugin/plugin.json`, `plugins/task-tracking/SKILL.md`

### Child PR 2: Add hook scripts
- Create scripts that generate tasks.html from task events
- Handle TaskCreate and TaskUpdate tool hooks
- ~100 lines
- Files: `plugins/task-tracking/scripts/update-tasks.sh`, `plugins/task-tracking/scripts/tasks-template.html`

### Child PR 3: Remove plan.md
- Cleanup: remove plan.md before merging to main

## Acceptance Criteria
- [ ] Plugin can be installed to ~/.claude/plugins/
- [ ] Hooks write to .sessiondashboard/tabs/tasks.html
- [ ] Dashboard auto-refreshes to show task state
- [ ] Task hierarchy and status visible

## Technical Notes
Claude Code hooks are configured in `~/.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "TaskCreate|TaskUpdate",
        "hooks": [{ "type": "command", "command": "..." }]
      }
    ]
  }
}
```
