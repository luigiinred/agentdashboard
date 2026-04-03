#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const net = require('net');
const { execSync } = require('child_process');

// Parse arguments
const args = process.argv.slice(2);
const flags = {
  port: null, // auto-find
  open: false,
  help: false,
  path: process.cwd(),
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '-p' || arg === '--port') {
    flags.port = parseInt(args[++i]) || null;
  } else if (arg === '-o' || arg === '--open') {
    flags.open = true;
  } else if (arg === '-h' || arg === '--help') {
    flags.help = true;
  } else if (!arg.startsWith('-')) {
    // Positional argument = path
    flags.path = path.resolve(arg);
  }
}

if (flags.help) {
  console.log(`
agentdashboard - Monitor git branches and GitHub PRs

Usage:
  agentdashboard [path] [options]

Arguments:
  path               Path to git repository (default: current directory)

Options:
  -p, --port <port>  Port to run server on (default: auto-find)
  -o, --open         Open browser automatically
  -h, --help         Show this help message

Note: When running inside cmux, the browser opens automatically in a new tab.

Requirements:
  - Path must be a git repository
  - GitHub CLI (gh) for PR features

Examples:
  agentdashboard                     # Current directory
  agentdashboard ~/projects/myapp    # Specific path
  agentdashboard . -o                # Open browser
  agentdashboard -p 8080             # Specific port
`);
  process.exit(0);
}

// Validate path
if (!fs.existsSync(flags.path)) {
  console.error(`Error: Path does not exist: ${flags.path}`);
  process.exit(1);
}

// Change to target directory
process.chdir(flags.path);

// Check if git repo
try {
  execSync('git rev-parse --git-dir', { stdio: 'pipe' });
} catch {
  console.error(`Error: Not a git repository: ${flags.path}`);
  process.exit(1);
}

// Find available port
function findPort(startPort = 3456) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // Port in use, try next
      if (startPort < 65535) {
        resolve(findPort(startPort + 1));
      } else {
        reject(new Error('No available ports'));
      }
    });
  });
}

async function main() {
  // Find port
  const port = flags.port || await findPort(3456);
  process.env.PORT = port;

  // Start server
  const dashboard = require('../server.js');
  const { server } = await dashboard.start({ port });

  const url = `http://localhost:${port}`;
  console.log(`\n  Dashboard: ${url}\n`);

  // Auto-open in cmux if running inside cmux session
  const inCmux = !!process.env.CMUX_SOCKET_PATH;
  const shouldOpen = flags.open || inCmux;

  if (shouldOpen) {
    setTimeout(() => {
      try {
        if (process.platform === 'darwin') {
          // cmux's open wrapper intercepts URLs when inside cmux
          execSync(`open "${url}"`, { stdio: 'pipe' });
          if (inCmux && !flags.open) {
            console.log('  Opened in cmux browser tab\n');
          }
        } else if (process.platform === 'linux') {
          execSync(`xdg-open "${url}"`, { stdio: 'pipe' });
        } else if (process.platform === 'win32') {
          execSync(`start "${url}"`, { stdio: 'pipe' });
        }
      } catch {}
    }, 300);
  }

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
