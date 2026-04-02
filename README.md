# Session Dashboard

A local web dashboard for monitoring git branches and GitHub pull requests. Designed for AI coding agents to display real-time session data to users.

## What It Does

Session Dashboard watches your current git branch and displays:

- **Overview**: Branch name, base branch, PR status, file change statistics
- **Files**: All changed files with diffs, organized by directory
- **Comments**: PR review threads with resolved/unresolved status

The dashboard auto-refreshes when data changes, giving you a live view of your work session.

## Requirements

- **Git repository**: Must be run from within a git repo
- **GitHub CLI (`gh`)**: Required for PR info and review comments
- **jq**: Required for JSON processing

```bash
# Install dependencies (macOS)
brew install gh jq

# Authenticate with GitHub
gh auth login
```

## Usage

### Generate Dashboard

From any git repository:

```bash
# Generate the dashboard HTML
session-dashboard/scripts/update-data.sh

# Open the generated dashboard
open ~/.claude/sessions/PROJECT-BRANCH.html
```

The dashboard is generated at `~/.claude/sessions/{project}-{branch}.html`.

### As a Claude Code Skill

Symlink to your skills directory for automatic integration:

```bash
ln -s ~/Developer/session-dashboard ~/.claude/skills/session-dashboard
```

## Architecture

```
session-dashboard/
├── dashboard.html          # Main template with rendering logic
├── scripts/
│   ├── update-data.sh      # Collects data from git/GitHub, generates HTML
│   └── init-dashboard.sh   # Initializes dashboard in cmux
└── SKILL.md                # Claude Code skill definition
```

### Data Flow

1. `update-data.sh` runs git commands and GitHub API queries
2. Data is collected into a JSON structure
3. JSON is embedded directly into the HTML (avoids CORS issues)
4. Dashboard JavaScript renders the data into tabs
5. Polling detects changes and re-renders automatically

### Adaptive Display

The dashboard adapts to available data:

- **No PR open**: Hides PR-specific sections, shows branch info only
- **No comments**: Hides comments tab or shows empty state
- **No changed files**: Shows appropriate empty state

## Extending for AI Agents

The dashboard is designed to be extended by AI agents that need to show data to users.

### Adding Custom Tabs

Agents can add new tabs by:

1. Adding a tab button to the `.tabs` container
2. Adding a corresponding `.tab-content` div
3. Implementing a render function for the tab's data

Example structure for a new tab:

```html
<!-- Tab button -->
<div class="tab" data-tab="custom" onclick="switchTab('custom')">Custom</div>

<!-- Tab content -->
<div id="tab-custom" class="tab-content">
    <div id="custom-content"></div>
</div>
```

```javascript
function renderCustom(data) {
    document.getElementById('custom-content').innerHTML = /* ... */;
}
```

### Adding Data to the JSON

Extend `update-data.sh` to collect additional data:

```bash
# Add to the JSON_DATA heredoc
"customData": {
    "key": "value"
}
```

### Use Cases for AI Agents

- **Task Progress**: Show current task list and completion status
- **Build Status**: Display CI/CD pipeline results
- **Test Results**: Show test pass/fail counts
- **Logs**: Stream relevant log output
- **Metrics**: Display performance or code quality metrics

## Configuration

### Session Directory

Generated dashboards are stored in `~/.claude/sessions/`. This can be changed by modifying `SESSION_DIR` in `update-data.sh`.

### Base Branch Detection

The script automatically detects the base branch from:
1. The PR's base branch (if a PR exists)
2. Falls back to `main`

## Troubleshooting

### "Error loading data"
- Ensure `gh` CLI is authenticated: `gh auth status`
- Ensure you're in a git repository

### Empty file list
- Check that your branch has commits ahead of the base branch
- Verify the base branch exists: `git branch -a | grep main`

### Comments not showing
- Requires an open PR with review comments
- Ensure `gh` has access to the repository

## License

MIT
