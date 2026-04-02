# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Session Dashboard is a local web dashboard for monitoring git branches and GitHub PRs. It's designed for AI coding agents to display real-time session data via Server-Sent Events (SSE).

## Commands

```bash
# Install dependencies (both root and web)
npm install && cd web && npm install

# Build the web UI (required before running)
npm run build

# Start the server (serves from web/dist)
npm start

# Run with auto-open browser
agentdashboard -o

# Development: rebuild web after changes
cd web && npm run build

# Lint web code
cd web && npm run lint
```

## Architecture

**Two-part system:**

1. **Node.js Server** (`server.js`) - Collects git/GitHub data, serves API, pushes SSE updates
2. **React Frontend** (`web/`) - Vite + TypeScript app that renders dashboard

**Data Flow:**
- Server polls git and GitHub GraphQL API
- Clients connect to `/events` for SSE stream
- React uses `useData` hook (`web/src/hooks/useData.ts`) to receive updates
- Data broadcasted to all clients when changes detected

**Key Files:**
- `bin/cli.js` - CLI entry point, handles args and port finding
- `server.js` - HTTP server, GitHub API, data collection, SSE broadcasting
- `web/src/App.tsx` - Main React app with tab routing
- `web/src/types/index.ts` - TypeScript interfaces for all data structures

**Local Data Storage:**
- `.sessiondashboard/tabs/` - Agent-created HTML tabs (auto-watched)
- `.sessiondashboard/comments/comments.json` - Local comment threads

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard HTML with embedded data |
| `/api/data` | GET | Current data as JSON |
| `/api/refresh` | POST | Force data refresh |
| `/events` | GET | SSE stream for live updates |
| `/api/local-comments` | GET/POST/DELETE | Manage local comments |
| `/api/local-comments/resolve` | POST | Resolve/unresolve comment |

## GitHub Authentication

The server looks for a token in this order:
1. `GITHUB_TOKEN` environment variable
2. `gh auth token` (GitHub CLI)

Without a token, PR features are disabled but git data still works.
