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
- **GitHub CLI (`gh`)**: Required for PR info and review comments

```bash
# Install dependencies (macOS)
brew install node gh

# Authenticate with GitHub
gh auth login
```

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
