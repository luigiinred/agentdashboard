#!/bin/bash
# Initialize session dashboard in cmux using agentdashboard

# Only run if in cmux
[ -z "$CMUX_WORKSPACE_ID" ] && exit 0

# Check if agentdashboard is available
if ! command -v agentdashboard &> /dev/null; then
    echo "agentdashboard not found - install with: npm install -g agentdashboard"
    exit 1
fi

REPO_PATH="$(pwd)"

# Create a new split pane on the right and capture the new surface/pane IDs
SPLIT_OUTPUT=$(cmux new-split right 2>/dev/null)
NEW_SURFACE=$(echo "$SPLIT_OUTPUT" | grep -o 'surface:[0-9]*' | head -1)
NEW_PANE=$(echo "$SPLIT_OUTPUT" | grep -o 'pane:[0-9]*' | head -1)

if [ -z "$NEW_SURFACE" ]; then
    echo "Failed to create split"
    exit 1
fi

sleep 0.3

# Run agentdashboard in the new split's terminal
cmux send --surface "$NEW_SURFACE" "agentdashboard \"$REPO_PATH\"" 2>/dev/null
cmux send-key --surface "$NEW_SURFACE" Enter 2>/dev/null

# Wait for server to start and read the URL from terminal output
sleep 2
DASHBOARD_URL=$(cmux read-screen --surface "$NEW_SURFACE" 2>/dev/null | grep -o 'http://localhost:[0-9]*' | head -1)

if [ -n "$DASHBOARD_URL" ]; then
    # Open browser tab in same pane
    cmux new-surface --type browser --pane "$NEW_PANE" --url "$DASHBOARD_URL" 2>/dev/null
fi

echo "OK"
