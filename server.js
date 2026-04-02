#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const PORT = process.env.PORT || 3456;
const REFRESH_INTERVAL = 5000; // 5 seconds

// State
let currentData = null;
let clients = []; // SSE clients for live updates
let plugins = [];
let ghToken = null;
let repoInfo = null;

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

// Run a command and return output
function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
  } catch {
    return opts.fallback ?? '';
  }
}

// Get GitHub auth token from env var or gh CLI
function getGitHubToken() {
  // Check env var first
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  // Fall back to gh CLI
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

// Get repo owner/name from git remote
function getRepoInfo() {
  try {
    const remote = run('git remote get-url origin', { fallback: '' });
    // Parse: git@github.com:owner/repo.git or https://github.com/owner/repo.git
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) {
      return { owner: match[1], name: match[2] };
    }
  } catch {}
  return null;
}

// GitHub API helper
async function githubAPI(query, variables = {}) {
  if (!ghToken) return null;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ghToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      console.error('GitHub API error:', response.status);
      return null;
    }

    const result = await response.json();
    return result.data;
  } catch (err) {
    console.error('GitHub API error:', err.message);
    return null;
  }
}

// GitHub REST API helper
async function githubREST(endpoint) {
  if (!ghToken) return null;

  try {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${ghToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Agent tabs directory
const AGENT_TABS_DIR = '.sessiondashboard/tabs';

// Read agent-created tabs from .sessiondashboard/tabs/
function readAgentTabs() {
  const tabsDir = path.join(process.cwd(), AGENT_TABS_DIR);
  const tabs = [];

  if (!fs.existsSync(tabsDir)) {
    return tabs;
  }

  try {
    const files = fs.readdirSync(tabsDir);
    for (const file of files) {
      if (file.endsWith('.html')) {
        const filePath = path.join(tabsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const name = path.basename(file, '.html');
        // Convert filename to title (e.g., "my-tab" -> "My Tab")
        const title = name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        tabs.push({
          id: `agent-${name}`,
          name,
          title,
          content,
          file: filePath,
          modified: fs.statSync(filePath).mtime.toISOString(),
        });
      }
    }
  } catch (err) {
    console.error('Error reading agent tabs:', err.message);
  }

  return tabs;
}

// Collect all dashboard data
async function collectData() {
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
    agentTabs: readAgentTabs(),
    updated: new Date().toISOString(),
  };

  // Get GitHub user
  if (ghToken) {
    const user = await githubREST('/user');
    if (user) data.user = user.login;
  }

  // Get PR info for current branch
  if (ghToken && repoInfo) {
    const prQuery = `
      query($owner: String!, $repo: String!, $head: String!) {
        repository(owner: $owner, name: $repo) {
          pullRequests(headRefName: $head, first: 1, states: [OPEN, MERGED]) {
            nodes {
              number
              url
              title
              state
              isDraft
              baseRefName
            }
          }
        }
      }
    `;

    const prResult = await githubAPI(prQuery, {
      owner: repoInfo.owner,
      repo: repoInfo.name,
      head: data.branch,
    });

    const prNode = prResult?.repository?.pullRequests?.nodes?.[0];
    if (prNode) {
      data.pr = {
        number: prNode.number,
        url: prNode.url,
        title: prNode.title,
        status: prNode.state,
        draft: prNode.isDraft,
      };
      data.baseBranch = prNode.baseRefName || 'main';
    }
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

  // Get PR comments using GraphQL
  if (data.pr?.number && ghToken && repoInfo) {
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

    const commentsResult = await githubAPI(commentsQuery, {
      owner: repoInfo.owner,
      repo: repoInfo.name,
      pr: data.pr.number,
    });

    const threads = commentsResult?.repository?.pullRequest?.reviewThreads?.nodes || [];
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

  // Get PR stack
  if (data.pr && ghToken && repoInfo) {
    data.prStack = await buildPRStack(data.branch, data.baseBranch, data.pr);
  }

  // Run plugins
  for (const plugin of plugins) {
    try {
      const pluginData = await plugin.collect(data);
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
  }

  return data;
}

// Build PR stack
async function buildPRStack(branch, baseBranch, currentPR) {
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
  if (ghToken && repoInfo) {
    const childQuery = `
      query($owner: String!, $repo: String!, $base: String!) {
        repository(owner: $owner, name: $repo) {
          pullRequests(baseRefName: $base, first: 10, states: [OPEN, MERGED, CLOSED]) {
            nodes {
              number
              url
              title
              state
            }
          }
        }
      }
    `;

    const childResult = await githubAPI(childQuery, {
      owner: repoInfo.owner,
      repo: repoInfo.name,
      base: branch,
    });

    const children = childResult?.repository?.pullRequests?.nodes || [];
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
  }

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
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
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
    currentData = await collectData();
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
  start: async (options = {}) => {
    const port = options.port || PORT;

    if (!isGitRepo()) {
      console.error('Error: Not a git repository');
      process.exit(1);
    }

    // Get GitHub token
    ghToken = getGitHubToken();
    if (!ghToken) {
      console.warn('Warning: No GitHub token found.');
      console.warn('  Set GITHUB_TOKEN env var or run "gh auth login"');
    } else if (process.env.GITHUB_TOKEN) {
      console.log('Using GITHUB_TOKEN from environment');
    } else {
      console.log('Using token from gh CLI');
    }

    // Get repo info
    repoInfo = getRepoInfo();
    if (!repoInfo) {
      console.warn('Warning: Could not determine GitHub repo from git remote.');
    }

    // Initial data collection
    console.log('Collecting initial data...');
    currentData = await collectData();

    // Start server
    server.listen(port, () => {
      console.log(`Session Dashboard running at http://localhost:${port}`);
      console.log(`Watching: ${currentData.project} @ ${currentData.branch}`);
      if (currentData.pr) {
        console.log(`PR: #${currentData.pr.number} - ${currentData.pr.title}`);
      }
    });

    // Periodic refresh
    setInterval(async () => {
      const newData = await collectData();
      if (JSON.stringify(newData) !== JSON.stringify(currentData)) {
        currentData = newData;
        broadcastUpdate(currentData);
        console.log(`[${new Date().toLocaleTimeString()}] Data updated`);
      }
    }, REFRESH_INTERVAL);

    // Watch .sessiondashboard/tabs/ for agent tab changes
    const tabsDir = path.join(process.cwd(), AGENT_TABS_DIR);
    if (fs.existsSync(tabsDir)) {
      fs.watch(tabsDir, { persistent: false }, async (eventType, filename) => {
        if (filename && filename.endsWith('.html')) {
          console.log(`[${new Date().toLocaleTimeString()}] Agent tab changed: ${filename}`);
          currentData = await collectData();
          broadcastUpdate(currentData);
        }
      });
      console.log(`Watching agent tabs: ${tabsDir}`);
    } else {
      // Create the directory if it doesn't exist so agents can add tabs
      fs.mkdirSync(tabsDir, { recursive: true });
      fs.watch(tabsDir, { persistent: false }, async (eventType, filename) => {
        if (filename && filename.endsWith('.html')) {
          console.log(`[${new Date().toLocaleTimeString()}] Agent tab changed: ${filename}`);
          currentData = await collectData();
          broadcastUpdate(currentData);
        }
      });
      console.log(`Created and watching agent tabs: ${tabsDir}`);
    }

    return { server, registerPlugin };
  },
  registerPlugin,
  collectData,
};

// Run if called directly
if (require.main === module) {
  module.exports.start();
}
