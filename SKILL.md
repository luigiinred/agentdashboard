---
name: session-dashboard
description: Automatically opens a cmux sidepanel with live-updating session status when running Claude Code in cmux. Shows branch, PR link, changes summary, tasks, and comments. Auto-triggers at session start via hook.
---

# Session Dashboard

A live web dashboard in cmux showing session status, powered by [agentdashboard](https://github.com/tgarrabrant/session-dashboard).

## How It Works

1. **SessionStart hook** runs `init-dashboard.sh` when in cmux
2. Script launches `agentdashboard` server for the current directory
3. Dashboard auto-opens in cmux browser tab
4. Live updates: git status, PR info, comments refresh automatically

## Requirements

Install agentdashboard globally:
```bash
npm install -g agentdashboard
```

## Features

The dashboard shows:
- **Branch info**: Current branch, comparison to main
- **PR status**: Link, review status, checks
- **File changes**: Diff summary with inline comments
- **Comments**: PR review comments with context
- **Agent tabs**: Track multiple agent sessions

## Manual Initialization

If the dashboard didn't open automatically:

```bash
~/.claude/skills/session-dashboard/scripts/init-dashboard.sh
```

Or run directly:
```bash
agentdashboard /path/to/repo
```

## Configuration

agentdashboard auto-detects cmux and opens in the browser. Options:

```bash
agentdashboard [path] [options]
  -p, --port <port>  Specific port (default: auto-find from 3456)
  -o, --open         Force open browser
```
