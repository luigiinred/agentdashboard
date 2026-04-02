# .sessiondashboard

This folder stores session-specific data for the agentdashboard.

## Structure

```
.sessiondashboard/
├── tabs/           # Custom HTML tabs shown in dashboard
├── comments/       # Local comments on files
└── README.md       # This file
```

## Tabs

Drop any `.html` file in `tabs/` and it appears as a new tab in the dashboard.

**Naming:** `my-tab.html` → Tab titled "My Tab"

### Best Practices

1. **Keep it scannable** - Users glance at tabs, use clear headings
2. **Use the templates** - Copy from `tabs/templates/` for consistent styling
3. **Update frequently** - Stale info is worse than no info
4. **One purpose per tab** - Don't cram everything into one tab

### Available Templates

- `templates/progress.html` - Track task progress
- `templates/notes.html` - Session notes and decisions
- `templates/checklist.html` - Simple checklist

## Comments

Local comments are stored in `comments/comments.json`. These are notes attached to specific lines in diffs - useful for:

- Marking areas that need review
- Noting why a change was made
- TODOs that don't belong in code

Comments are **not** pushed to GitHub - they stay local.

### Comment API

Both humans and agents can read/write comments via the API.

**Read all comments:**
```bash
curl http://localhost:3456/api/local-comments
```

**Add a comment:**
```bash
curl -X POST http://localhost:3456/api/local-comments \
  -H "Content-Type: application/json" \
  -d '{
    "path": "src/file.tsx",
    "line": 42,
    "body": "This needs review",
    "type": "branch",
    "author": "agent"
  }'
```

**Delete a comment:**
```bash
curl -X DELETE http://localhost:3456/api/local-comments \
  -H "Content-Type: application/json" \
  -d '{"id": "local-1234567890"}'
```

### Author Types

- `human` - Comments from the dashboard UI (default)
- `agent` - Comments from AI agents (shown with purple badge)

### Comment Types

- `staged` - Comments on staged files
- `unstaged` - Comments on unstaged files  
- `untracked` - Comments on untracked files
- `branch` - Comments on committed files in the branch
