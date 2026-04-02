# Agent Dashboard

A local web dashboard for monitoring git branches and GitHub pull requests. Designed for AI coding agents to display real-time session data to users.

## Features

- **Live Updates**: Server-sent events for real-time data refresh
- **GitHub-style Diff View**: Syntax-highlighted diffs with collapsible files
- **PR Comments**: Review threads with resolved/unresolved status
- **File Navigation**: Sticky sidebar to jump between changed files
- **Adaptive UI**: Tabs hide when data isn't available
- **Extensible**: Plugin system for adding custom data sources

## Requirements

- **Node.js 16+**
- **Git**: Must be run from within a git repo
- **GitHub Token**: For PR info and comments (see Authentication below)

```bash
# Install Node.js (macOS)
brew install node
```

## GitHub Authentication

The dashboard needs a GitHub token to fetch PR info and comments. It checks in this order:

1. `GITHUB_TOKEN` environment variable
2. Token from `gh auth token` (GitHub CLI)

### Option 1: GitHub CLI (Recommended)

```bash
# Install and authenticate
brew install gh
gh auth login
```

The dashboard will automatically use your gh CLI token.

### Option 2: Environment Variable

```bash
# Set token directly
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Or pass when starting
GITHUB_TOKEN=ghp_xxx agentdashboard /path/to/repo
```

### Option 3: No Token

Without a token, the dashboard still works but PR features are disabled:
- No PR status or link
- No review comments
- No PR stack

## Installation

```bash
# Clone the repo
git clone <repo-url> ~/Developer/session-dashboard
cd ~/Developer/session-dashboard

# Run install script
./install.sh
```

This will:
1. Check requirements
2. Build the web UI
3. Link `agentdashboard` command globally
4. Link as a Claude Code skill

## Usage

```bash
# Current directory
agentdashboard

# Specific path
agentdashboard /path/to/repo

# Open browser automatically
agentdashboard -o

# Specific port
agentdashboard -p 8080
```

The dashboard will:
1. Find an available port (starting at 3456)
2. Print the URL
3. Watch for changes and push updates via SSE

## Architecture

```
session-dashboard/
├── bin/cli.js          # CLI entry point
├── server.js           # Node.js server with SSE
├── package.json        # Dependencies and scripts
├── install.sh          # Installation script
├── web/                # React frontend
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── hooks/      # useData hook for SSE
│   │   ├── types/      # TypeScript types
│   │   └── styles.css  # GitHub-dark theme
│   └── dist/           # Built files (generated)
└── SKILL.md            # Claude Code skill definition
```

### Data Flow

1. Server collects data from git and GitHub CLI
2. Data is sent to clients via Server-Sent Events
3. React app renders with syntax highlighting
4. Changes trigger automatic re-render

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Serve dashboard with embedded data |
| `GET /api/data` | Get current data as JSON |
| `POST /api/refresh` | Force data refresh |
| `GET /events` | SSE stream for live updates |

## Agent Tabs

AI coding agents can create custom dashboard tabs by adding HTML files to `.sessiondashboard/tabs/` in the working directory. The dashboard automatically watches this directory and updates when files change.

### How It Works

1. Create `.sessiondashboard/tabs/` in the repo root (created automatically when dashboard starts)
2. Add an HTML file: `.sessiondashboard/tabs/my-status.html`
3. The tab appears automatically with title "My Status" (filename converted to title case)
4. Edit the HTML file and changes appear live

### File Format

The file should contain valid HTML that will be rendered inside the dashboard. You have access to the dashboard's CSS variables for consistent styling:

```html
<!-- .sessiondashboard/tabs/build-status.html -->
<div class="card">
  <div class="card-header">Build Status</div>
  <div class="card-content">
    <div class="stats-grid">
      <div class="stat">
        <div class="stat-value additions">Passing</div>
        <div class="stat-label">Tests</div>
      </div>
      <div class="stat">
        <div class="stat-value">42s</div>
        <div class="stat-label">Duration</div>
      </div>
    </div>
  </div>
</div>
```

### CSS Variables

Available CSS variables for consistent theming:
- `--bg`: Primary background (#0d1117)
- `--bg-secondary`: Secondary background (#161b22)
- `--bg-tertiary`: Tertiary background (#21262d)
- `--border`: Border color (#30363d)
- `--text`: Primary text (#e6edf3)
- `--text-muted`: Muted text (#8b949e)
- `--accent`: Accent color (#58a6ff)
- `--green`: Success color (#3fb950)
- `--red`: Error color (#f85149)
- `--purple`: Purple (#a371f7)
- `--orange`: Warning color (#d29922)

### Use Cases

- Display build/test progress
- Show agent task status
- Render diagrams or visualizations
- Display custom metrics
- Show logs or output

### Example: Progress Tracker

```html
<!-- .sessiondashboard/tabs/progress.html -->
<div class="card">
  <div class="card-header">Task Progress</div>
  <div class="card-content">
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: var(--green);">&#10003;</span>
        <span>Parse requirements</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: var(--green);">&#10003;</span>
        <span>Generate code</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: var(--accent);">&#9679;</span>
        <span>Running tests...</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; opacity: 0.5;">
        <span>&#9675;</span>
        <span>Create PR</span>
      </div>
    </div>
  </div>
</div>
```

## Extending

### Adding Plugins

```javascript
const dashboard = require('session-dashboard/server');

dashboard.registerPlugin({
  id: 'my-plugin',
  name: 'My Custom Data',
  collect: (data) => {
    // Return custom data to add to the dashboard
    return { myField: 'value' };
  }
});

dashboard.start();
```

### Adding Custom Tabs

1. Add data in your plugin's `collect` function
2. Create a new React component in `web/src/components/`
3. Add the tab to `App.tsx`
4. Rebuild: `npm run build`

## Development

```bash
# Install dependencies
npm install
cd web && npm install

# Run server (uses built files)
npm start

# Build web UI
npm run build
```

## Troubleshooting

### "Error: Not a git repository"
Run from within a git repository.

### "GitHub CLI not found"
Install with `brew install gh` and authenticate with `gh auth login`.

### Comments not showing
- Ensure PR exists and has review comments
- Check `gh auth status` for authentication

### Port in use
The CLI will automatically find an available port. Or specify one with `-p`.

## License

MIT
