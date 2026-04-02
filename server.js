#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const url = require('url');

// Configuration
const PORT = process.env.PORT || 3456;
const REFRESH_INTERVAL = 5000; // 5 seconds

// State
let currentData = null;
let clients = []; // SSE clients for live updates
let plugins = [];

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Check if we're in a git repo
function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Check if gh CLI is available
function hasGitHubCLI() {
  try {
    execSync('which gh', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Run a command and return output
function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
  } catch {
    return opts.fallback ?? '';
  }
}

// Collect all dashboard data
function collectData() {
  const data = {
    project: path.basename(process.cwd()),
    branch: run('git branch --show-current') || 'detached',
    baseBranch: 'main',
    user: null,
    pr: null,
    prStack: [],
    stats: { fileCount: 0, additions: 0, deletions: 0 },
    files: [],
    comments: [],
    commentCounts: {},
    plugins: [],
    updated: new Date().toISOString(),
  };

  // Get GitHub user
  if (hasGitHubCLI()) {
    data.user = run('gh api user --jq ".login"', { fallback: null });
  }

  // Get PR info
  const prInfo = run('gh pr view --json url,state,isDraft,baseRefName,number,title 2>/dev/null', { fallback: '' });
  if (prInfo) {
    try {
      const pr = JSON.parse(prInfo);
      data.pr = {
        number: pr.number,
        url: pr.url,
        title: pr.title,
        status: pr.state,
        draft: pr.isDraft,
      };
      data.baseBranch = pr.baseRefName || 'main';
    } catch {}
  }

  // Get merge base and file stats
  const remoteBase = `origin/${data.baseBranch}`;
  const mergeBase = run(`git merge-base HEAD ${remoteBase} 2>/dev/null`, { fallback: '' });

  if (mergeBase) {
    // File count
    const fileList = run(`git diff --name-only ${mergeBase}..HEAD 2>/dev/null`, { fallback: '' });
    const files = fileList.split('\n').filter(Boolean);
    data.stats.fileCount = files.length;

    // Additions/deletions
    const stat = run(`git diff --stat ${mergeBase}..HEAD 2>/dev/null | tail -1`, { fallback: '' });
    const addMatch = stat.match(/(\d+) insertion/);
    const delMatch = stat.match(/(\d+) deletion/);
    data.stats.additions = addMatch ? parseInt(addMatch[1]) : 0;
    data.stats.deletions = delMatch ? parseInt(delMatch[1]) : 0;

    // Files with stats and diffs
    const numstat = run(`git diff --numstat ${mergeBase}..HEAD 2>/dev/null`, { fallback: '' });
    data.files = numstat.split('\n').filter(Boolean).map(line => {
      const [add, del, filePath] = line.split('\t');
      const diff = run(`git diff ${mergeBase}..HEAD -- "${filePath}" 2>/dev/null`, { fallback: '' });
      return { add, del, path: filePath, diff };
    });
  }

  // Get PR comments
  if (data.pr?.number && hasGitHubCLI()) {
    const repoInfo = run('gh repo view --json owner,name', { fallback: '{}' });
    try {
      const { owner, name } = JSON.parse(repoInfo);
      if (owner && name) {
        const commentsQuery = `
          query($owner: String!, $repo: String!, $pr: Int!) {
            repository(owner: $owner, name: $repo) {
              pullRequest(number: $pr) {
                reviewThreads(first: 50) {
                  nodes {
                    isResolved
                    isOutdated
                    path
                    comments(first: 20) {
                      nodes {
                        author { login }
                        body
                        createdAt
                        url
                        diffHunk
                      }
                    }
                  }
                }
              }
            }
          }
        `;
        const commentsResult = run(
          `gh api graphql -f query='${commentsQuery.replace(/\n/g, ' ')}' -f owner="${owner}" -f repo="${name}" -F pr=${data.pr.number}`,
          { fallback: '' }
        );
        if (commentsResult) {
          const parsed = JSON.parse(commentsResult);
          const threads = parsed?.data?.repository?.pullRequest?.reviewThreads?.nodes || [];
          data.comments = threads.map(t => ({
            isResolved: t.isResolved,
            isOutdated: t.isOutdated,
            path: t.path,
            comments: t.comments.nodes.map(c => ({
              author: c.author?.login,
              body: c.body,
              createdAt: c.createdAt,
              url: c.url,
              diffHunk: c.diffHunk,
            })),
          }));

          // Comment counts per file
          threads.forEach(t => {
            data.commentCounts[t.path] = (data.commentCounts[t.path] || 0) + 1;
          });
        }
      }
    } catch {}
  }

  // Get PR stack
  if (data.pr) {
    data.prStack = buildPRStack(data.branch, data.baseBranch, data.pr);
  }

  // Run plugins
  plugins.forEach(plugin => {
    try {
      const pluginData = plugin.collect(data);
      if (pluginData) {
        data.plugins.push({
          id: plugin.id,
          name: plugin.name,
          data: pluginData,
        });
      }
    } catch (e) {
      console.error(`Plugin ${plugin.id} error:`, e.message);
    }
  });

  return data;
}

// Build PR stack
function buildPRStack(branch, baseBranch, currentPR) {
  const stack = [];

  // Add current PR
  stack.push({
    number: currentPR.number,
    url: currentPR.url,
    title: currentPR.title,
    state: currentPR.status,
    indent: 0,
    isCurrent: true,
  });

  // Find child PRs (PRs based on this branch)
  const childPRs = run(`gh pr list --base "${branch}" --state all --json number,url,title,state`, { fallback: '[]' });
  try {
    const children = JSON.parse(childPRs);
    children.forEach(child => {
      stack.push({
        number: child.number,
        url: child.url,
        title: child.title,
        state: child.state,
        indent: 1,
        isCurrent: false,
      });
    });
  } catch {}

  return stack;
}

// Get the web dist directory
const DIST_DIR = path.join(__dirname, 'web', 'dist');

// Generate the dashboard HTML with embedded data
function generateHTML(data) {
  // Try React build first
  const reactIndexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(reactIndexPath)) {
    let html = fs.readFileSync(reactIndexPath, 'utf8');
    // Inject data before the closing head tag
    const dataScript = `<script>window.DASHBOARD_DATA = ${JSON.stringify(data)};</script>`;
    html = html.replace('</head>', dataScript + '</head>');
    return html;
  }

  // Fallback to legacy dashboard.html
  const legacyPath = path.join(__dirname, 'dashboard.html');
  if (fs.existsSync(legacyPath)) {
    let html = fs.readFileSync(legacyPath, 'utf8');
    const dataScript = `window.DASHBOARD_DATA = ${JSON.stringify(data)};`;
    html = html.replace('// INJECT_DATA_HERE', dataScript);
    const sseScript = `
      <script>
        const evtSource = new EventSource('/events');
        evtSource.onmessage = (e) => {
          const data = JSON.parse(e.data);
          window.DASHBOARD_DATA = data;
          if (typeof renderAll === 'function') renderAll(data);
        };
      </script>
    `;
    html = html.replace('</body>', sseScript + '</body>');
    return html;
  }

  return '<html><body><h1>Dashboard not built</h1><p>Run: cd web && npm run build</p></body></html>';
}

// Send update to all SSE clients
function broadcastUpdate(data) {
  clients = clients.filter(client => {
    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false;
    }
  });
}

// HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Routes
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(generateHTML(currentData));
    return;
  }

  if (pathname === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(currentData));
    return;
  }

  if (pathname === '/api/refresh') {
    currentData = collectData();
    broadcastUpdate(currentData);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify(currentData)}\n\n`);
    clients.push(res);
    req.on('close', () => {
      clients = clients.filter(c => c !== res);
    });
    return;
  }

  // Static files - try dist directory first, then root
  const ext = path.extname(pathname);
  const distFilePath = path.join(DIST_DIR, pathname);
  const rootFilePath = path.join(__dirname, pathname);

  let filePath = null;
  if (fs.existsSync(distFilePath) && fs.statSync(distFilePath).isFile()) {
    filePath = distFilePath;
  } else if (fs.existsSync(rootFilePath) && fs.statSync(rootFilePath).isFile()) {
    filePath = rootFilePath;
  }

  if (filePath) {
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    res.end(fs.readFileSync(filePath));
    return;
  }

  // SPA fallback - serve index.html for unmatched routes
  if (!ext && pathname !== '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(generateHTML(currentData));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Plugin API
function registerPlugin(plugin) {
  if (!plugin.id || !plugin.name || !plugin.collect) {
    throw new Error('Plugin must have id, name, and collect function');
  }
  plugins.push(plugin);
  console.log(`Registered plugin: ${plugin.name}`);
}

// Export for programmatic use
module.exports = {
  start: (options = {}) => {
    const port = options.port || PORT;

    if (!isGitRepo()) {
      console.error('Error: Not a git repository');
      process.exit(1);
    }

    if (!hasGitHubCLI()) {
      console.warn('Warning: GitHub CLI (gh) not found. PR features will be disabled.');
    }

    // Initial data collection
    console.log('Collecting initial data...');
    currentData = collectData();

    // Start server
    server.listen(port, () => {
      console.log(`Session Dashboard running at http://localhost:${port}`);
      console.log(`Watching: ${currentData.project} @ ${currentData.branch}`);
      if (currentData.pr) {
        console.log(`PR: #${currentData.pr.number} - ${currentData.pr.title}`);
      }
    });

    // Periodic refresh
    setInterval(() => {
      const newData = collectData();
      if (JSON.stringify(newData) !== JSON.stringify(currentData)) {
        currentData = newData;
        broadcastUpdate(currentData);
        console.log(`[${new Date().toLocaleTimeString()}] Data updated`);
      }
    }, REFRESH_INTERVAL);

    return { server, registerPlugin };
  },
  registerPlugin,
  collectData,
};

// Run if called directly
if (require.main === module) {
  module.exports.start();
}
