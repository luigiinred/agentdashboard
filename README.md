# Session Dashboard

A live-updating session dashboard for Claude Code in cmux. Shows branch info, PR status, file changes with diffs, and review comments.

## Features

- **Branch & PR Info**: Current branch, base branch, PR status and link
- **PR Stack**: Visual tree of stacked PRs
- **Files Tab**: File tree with +/- stats, click to view diffs
- **Comments Tab**: Review threads with resolved/unresolved status
- **GitHub Avatar**: Shows your GitHub profile picture
- **Live Reload**: Auto-updates when data changes

## Installation

### As a Claude Code Skill

Copy or symlink to your skills directory:

```bash
ln -s ~/Developer/session-dashboard ~/.claude/skills/session-dashboard
```

### Manual Usage

Generate data and open the dashboard:

```bash
# Generate data (run from your project directory)
~/.claude/skills/session-dashboard/scripts/update-data.sh

# Open the generated HTML
open ~/.claude/sessions/PROJECT-BRANCH.html
```

## Files

- `dashboard.html` - Main dashboard template with all rendering logic
- `scripts/update-data.sh` - Generates JSON data and creates HTML with embedded data
- `scripts/init-dashboard.sh` - Initializes dashboard in cmux (called by hooks)
- `SKILL.md` - Claude Code skill definition

## Requirements

- `gh` CLI (GitHub CLI) - for PR info and comments
- `jq` - for JSON processing
- `git` - for diff and branch info

## How It Works

1. `update-data.sh` collects data from git and GitHub API
2. JSON data is embedded directly into the HTML (avoids CORS issues with file:// URLs)
3. Dashboard polls for changes and re-renders when data updates
