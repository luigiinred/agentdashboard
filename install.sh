#!/bin/bash
# Install agentdashboard

set -e

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$HOME/.claude/skills"

echo "Agent Dashboard Installer"
echo "========================="
echo

# Check requirements
echo "Checking requirements..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed."
    echo "Install with: brew install node"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "Error: Node.js 16+ required, found $(node -v)"
    exit 1
fi
echo "  Node.js $(node -v)"

# Check git
if ! command -v git &> /dev/null; then
    echo "Error: git is required but not installed."
    exit 1
fi
echo "  git $(git --version | cut -d' ' -f3)"

# Check gh CLI
if command -v gh &> /dev/null; then
    echo "  gh $(gh --version | head -1 | cut -d' ' -f3)"

    # Check if authenticated
    if ! gh auth status &> /dev/null; then
        echo
        echo "Warning: GitHub CLI not authenticated."
        echo "Run 'gh auth login' for PR features."
    fi
else
    echo "  gh CLI: not installed (PR features disabled)"
    echo "  Install with: brew install gh"
fi

echo
echo "Building web UI..."
cd "$INSTALL_DIR"
npm install --silent
npm run build --silent
echo "  Build complete"

echo
echo "Installing CLI globally..."
npm link --silent
echo "  Linked agentdashboard command"

# Link as Claude Code skill
mkdir -p "$SKILL_DIR"
if [ -L "$SKILL_DIR/session-dashboard" ]; then
    rm "$SKILL_DIR/session-dashboard"
fi
ln -s "$INSTALL_DIR" "$SKILL_DIR/session-dashboard"
echo "  Linked to Claude Code skills"

echo
echo "Installation complete!"
echo
echo "Usage:"
echo "  agentdashboard                    # Current directory"
echo "  agentdashboard /path/to/repo      # Specific path"
echo "  agentdashboard -o                 # Open browser"
echo
echo "Or from Claude Code, the skill will auto-activate."
