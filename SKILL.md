---
name: session-dashboard
description: Automatically opens a cmux sidepanel with live-updating session status when running Claude Code in cmux. Shows branch, PR link, changes summary, tasks, and comments. Auto-triggers at session start via hook.
proactive: true
---

# Session Dashboard

A live web dashboard in cmux showing session status. **You should keep this updated as you work.**

## Your Responsibilities

### 1. Update Todo Tab (Current Work)

Write `.sessiondashboard/tabs/todo.html` showing what you're actively working on:

```html
<style>
  .item { padding: 6px 0; border-bottom: 1px solid #30363d; }
  .item:last-child { border: none; }
  .wip { color: #d29922; }
  .next { color: #58a6ff; }
</style>

<h3>Now</h3>
<div class="item"><span class="wip">></span> Brief description of current task</div>

<h3>Next</h3>
<div class="item"><span class="next">-</span> What's coming up</div>
```

**Update this when you:**
- Start a new task
- Shift focus
- Complete something

### 2. Update Timeline (Session History)

Append to `.sessiondashboard/timeline.json` as you complete work:

```json
[
  {
    "time": "2024-01-15T10:30:00Z",
    "action": "Added user auth endpoint",
    "files": ["src/auth.ts", "src/routes.ts"]
  }
]
```

Then regenerate `.sessiondashboard/tabs/timeline.html`:

```html
<style>
  .entry { padding: 8px 0; border-left: 2px solid #30363d; padding-left: 12px; margin: 4px 0; }
  .time { font-size: 11px; color: #8b949e; }
  .action { margin-top: 2px; }
  .files { font-size: 11px; color: #8b949e; margin-top: 2px; }
</style>

<h3>Session Timeline</h3>
<div class="entry">
  <div class="time">10:30</div>
  <div class="action">Added user auth endpoint</div>
  <div class="files">src/auth.ts, src/routes.ts</div>
</div>
```

**Log when you:**
- Complete a task or subtask
- Make a significant decision
- Hit a blocker and pivot

### 3. Read Timeline for Context

At session start, read `.sessiondashboard/timeline.json` to understand what previous sessions accomplished. This gives you context without re-reading all the code.

## File Locations

```
.sessiondashboard/
├── tabs/
│   ├── todo.html       # Your current focus (update frequently)
│   └── timeline.html   # Visual history (regenerate from JSON)
├── timeline.json       # Append-only history (persists across sessions)
└── comments/
    └── comments.json   # Local review comments
```

## Quick Patterns

**Starting a session:**
```bash
# Read what happened before
cat .sessiondashboard/timeline.json
```

**Update todo:**
```bash
# Write directly - dashboard auto-refreshes
cat > .sessiondashboard/tabs/todo.html << 'EOF'
<h3>Now</h3>
<div>Implementing feature X</div>
EOF
```

**Log completion:**
```javascript
// Append to timeline.json, then regenerate timeline.html
```

## Keep It Concise

- Todo: 1-3 items max
- Timeline entries: One line per action
- No paragraphs - scannable at a glance
