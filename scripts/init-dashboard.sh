#!/bin/bash
# Initialize session dashboard in cmux

# Only run if in cmux
[ -z "$CMUX_WORKSPACE_ID" ] && exit 0

# Use predictable path based on project + branch
PROJECT_NAME=$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
BRANCH_DISPLAY=$(git branch --show-current 2>/dev/null || echo "no-branch")
BRANCH_SAFE=$(echo "$BRANCH_DISPLAY" | tr '/' '-')
SESSION_DIR="$HOME/.claude/sessions"
SKILL_DIR="$HOME/.claude/skills/session-dashboard"
mkdir -p "$SESSION_DIR"

HTML_FILE="$SESSION_DIR/${PROJECT_NAME}-${BRANCH_SAFE}.html"
DATA_FILE="$SESSION_DIR/${PROJECT_NAME}-${BRANCH_SAFE}.json"

# Copy static HTML template if needed
cp "$SKILL_DIR/dashboard.html" "$HTML_FILE"

# Generate initial data
"$SKILL_DIR/scripts/update-data.sh" > /dev/null 2>&1 &

# Check if dashboard is already open
ALREADY_OPEN=$(cmux tree 2>/dev/null | grep -c "\[browser\]" || true)

if [ "$ALREADY_OPEN" -eq 0 ]; then
    # Open in cmux browser
    cmux new-split right 2>/dev/null
    sleep 0.3
    cmux browser open "file://$HTML_FILE?data=file://$DATA_FILE" 2>/dev/null
fi

echo "OK"
