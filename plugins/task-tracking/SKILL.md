# Task Tracking Plugin

Automatically display Claude Code tasks in the session dashboard.

## Installation

1. Copy this plugin to your Claude plugins directory:
   ```bash
   cp -r plugins/task-tracking ~/.claude/plugins/
   ```

2. Add the following hooks to `~/.claude/settings.json`:
   ```json
   {
     "hooks": {
       "PostToolUse": [
         {
           "matcher": "TaskCreate|TaskUpdate",
           "hooks": [
             {
               "type": "command",
               "command": "~/.claude/plugins/task-tracking/scripts/update-tasks.sh"
             }
           ]
         }
       ]
     }
   }
   ```

3. Restart Claude Code to activate the hooks.

## How It Works

When Claude creates or updates tasks using the `TaskCreate` or `TaskUpdate` tools, this plugin:

1. Receives the task data via the `PostToolUse` hook
2. Reads the current task state from Claude's task list
3. Generates an HTML view of all tasks
4. Writes to `.sessiondashboard/tabs/tasks.html`
5. The dashboard auto-refreshes to show the updated tasks

## Task View Features

- Shows task hierarchy (parent/child tasks)
- Displays task status (pending, in_progress, completed)
- Shows task descriptions
- Updates in real-time as Claude works

## Files

- `.claude-plugin/plugin.json` - Plugin manifest
- `scripts/update-tasks.sh` - Hook script that generates the tasks HTML
- `scripts/tasks-template.html` - HTML template for the tasks view
