#!/bin/bash
# Task tracking hook script for session-dashboard
# Called by Claude Code PostToolUse hook for TaskCreate/TaskUpdate

set -e

# Get the working directory from CLAUDE_WORKING_DIRECTORY or use current
WORK_DIR="${CLAUDE_WORKING_DIRECTORY:-.}"
TASKS_DIR="$WORK_DIR/.sessiondashboard/tabs"
TASKS_FILE="$TASKS_DIR/tasks.html"
TASKS_JSON="$TASKS_DIR/.tasks-cache.json"

# Read task data from stdin (Claude Code passes hook data as JSON)
HOOK_DATA=$(cat)

# Ensure the tabs directory exists
mkdir -p "$TASKS_DIR"

# Extract task info from the hook data
# PostToolUse hooks receive: { tool_name, tool_input, tool_result }
TOOL_NAME=$(echo "$HOOK_DATA" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
TOOL_INPUT=$(echo "$HOOK_DATA" | jq -r '.tool_input // empty' 2>/dev/null || echo "{}")
TOOL_RESULT=$(echo "$HOOK_DATA" | jq -r '.tool_result // empty' 2>/dev/null || echo "{}")

# Initialize or load the tasks cache
if [ -f "$TASKS_JSON" ]; then
  TASKS=$(cat "$TASKS_JSON")
else
  TASKS='[]'
fi

# Process based on tool type
case "$TOOL_NAME" in
  TaskCreate)
    # Extract task details from input
    TASK_ID=$(echo "$TOOL_RESULT" | jq -r '.id // empty' 2>/dev/null || echo "task-$(date +%s)")
    TASK_DESC=$(echo "$TOOL_INPUT" | jq -r '.description // "Untitled task"' 2>/dev/null || echo "Untitled task")
    TASK_STATUS="pending"

    # Add to tasks array
    NEW_TASK=$(jq -n --arg id "$TASK_ID" --arg desc "$TASK_DESC" --arg status "$TASK_STATUS" \
      '{id: $id, description: $desc, status: $status, created: (now | todate)}')
    TASKS=$(echo "$TASKS" | jq --argjson task "$NEW_TASK" '. + [$task]')
    ;;

  TaskUpdate)
    # Extract update details
    TASK_ID=$(echo "$TOOL_INPUT" | jq -r '.id // empty' 2>/dev/null || echo "")
    NEW_STATUS=$(echo "$TOOL_INPUT" | jq -r '.status // empty' 2>/dev/null || echo "")

    if [ -n "$TASK_ID" ] && [ -n "$NEW_STATUS" ]; then
      TASKS=$(echo "$TASKS" | jq --arg id "$TASK_ID" --arg status "$NEW_STATUS" \
        'map(if .id == $id then .status = $status else . end)')
    fi
    ;;
esac

# Save updated tasks
echo "$TASKS" > "$TASKS_JSON"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Generate the tasks HTML
cat > "$TASKS_FILE" << 'HTMLEOF'
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d1117;
      color: #e6edf3;
      padding: 20px;
      margin: 0;
    }
    .task-list {
      max-width: 800px;
    }
    .task {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 8px;
    }
    .task-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .task-status {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .task-status.pending { background: #6e7681; }
    .task-status.in_progress { background: #d29922; }
    .task-status.completed { background: #3fb950; }
    .task-title {
      font-weight: 500;
    }
    .updated {
      color: #8b949e;
      font-size: 12px;
      margin-top: 16px;
    }
    .empty-state {
      color: #8b949e;
      text-align: center;
      padding: 40px;
    }
  </style>
</head>
<body>
  <div class="task-list">
HTMLEOF

# Check if we have tasks
TASK_COUNT=$(echo "$TASKS" | jq 'length' 2>/dev/null || echo "0")

if [ "$TASK_COUNT" -eq 0 ]; then
  cat >> "$TASKS_FILE" << 'EMPTYEOF'
    <div class="empty-state">
      <p>Task tracking is active.</p>
      <p>Tasks will appear here as Claude creates them.</p>
    </div>
EMPTYEOF
else
  # Generate task items
  echo "$TASKS" | jq -r '.[] | @base64' | while read -r encoded; do
    task=$(echo "$encoded" | base64 -d)
    id=$(echo "$task" | jq -r '.id')
    desc=$(echo "$task" | jq -r '.description')
    status=$(echo "$task" | jq -r '.status')

    cat >> "$TASKS_FILE" << TASKEOF
    <div class="task">
      <div class="task-header">
        <span class="task-status $status"></span>
        <span class="task-title">$desc</span>
      </div>
    </div>
TASKEOF
  done
fi

# Add timestamp and close HTML
cat >> "$TASKS_FILE" << FOOTEREOF
    <div class="updated">Last updated: $TIMESTAMP</div>
  </div>
</body>
</html>
FOOTEREOF

echo "Tasks updated: $TASKS_FILE"
