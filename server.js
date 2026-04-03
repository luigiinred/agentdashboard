#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load configuration
function loadConfig() {
  const defaultConfig = {
    port: 3456,
    refreshInterval: 180000,  // 3 minutes (rate limit friendly)
  };
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      return { ...defaultConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    } catch (e) {
      console.warn('Failed to load config.json, using defaults');
    }
  }
  return defaultConfig;
}

const config = loadConfig();
const PORT = process.env.PORT || config.port;
const REFRESH_INTERVAL = config.refreshInterval;

// State
let currentData = null;
let githubError = null;
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

    const resetHeader = response.headers.get('x-ratelimit-reset');

    if (!response.ok) {
      console.error('GitHub API error:', response.status);
      if (response.status === 403 || response.status === 429) {
        const resetTime = resetHeader ? new Date(resetHeader * 1000).toLocaleTimeString() : 'soon';
        githubError = `GitHub API rate limit exceeded. Resets at ${resetTime}`;
      }
      return null;
    }

    const result = await response.json();

    // Check for GraphQL errors
    if (result.errors && result.errors.length > 0) {
      const msg = result.errors[0].message || '';
      if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('exceeded')) {
        githubError = `GitHub API: ${msg}`;
        console.error(githubError);
        return null;
      }
    }

    // Clear error on success
    githubError = null;
    return result.data;
  } catch (err) {
    console.error('GitHub API error:', err.message);
    githubError = `GitHub API error: ${err.message}`;
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

// Local comments file
const LOCAL_COMMENTS_DIR = '.sessiondashboard/comments';
const LOCAL_COMMENTS_FILE = '.sessiondashboard/comments/comments.json';

// Agent files
const AGENT_SUMMARY_FILE = '.sessiondashboard/agent-summary.md';
const AGENT_TODOS_FILE = '.sessiondashboard/todos.json';

// Read agent summary from .sessiondashboard/agent-summary.md
function readAgentSummary() {
  const summaryPath = path.join(process.cwd(), AGENT_SUMMARY_FILE);
  if (!fs.existsSync(summaryPath)) {
    return null;
  }
  try {
    return fs.readFileSync(summaryPath, 'utf8');
  } catch (err) {
    console.error('Error reading agent summary:', err.message);
    return null;
  }
}

// Read agent todos from .sessiondashboard/todos.json
function readAgentTodos() {
  const todosPath = path.join(process.cwd(), AGENT_TODOS_FILE);
  if (!fs.existsSync(todosPath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(todosPath, 'utf8'));
  } catch (err) {
    console.error('Error reading agent todos:', err.message);
    return [];
  }
}

// Read local comments from .sessiondashboard/comments/comments.json
function readLocalComments() {
  const commentsPath = path.join(process.cwd(), LOCAL_COMMENTS_FILE);
  if (!fs.existsSync(commentsPath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(commentsPath, 'utf8'));
  } catch (err) {
    console.error('Error reading local comments:', err.message);
    return [];
  }
}

// Write local comments to .sessiondashboard/comments/comments.json
function writeLocalComments(comments) {
  const commentsDir = path.join(process.cwd(), LOCAL_COMMENTS_DIR);
  const commentsPath = path.join(process.cwd(), LOCAL_COMMENTS_FILE);

  // Ensure directory exists
  if (!fs.existsSync(commentsDir)) {
    fs.mkdirSync(commentsDir, { recursive: true });
  }

  fs.writeFileSync(commentsPath, JSON.stringify(comments, null, 2));
}

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
  const cwd = process.cwd();
  const data = {
    project: path.basename(cwd),
    directory: cwd,
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
    uncommitted: { staged: [], unstaged: [], untracked: [] },
    commits: [],
    openPRs: [],
    agentSummary: readAgentSummary(),
    agentTodos: readAgentTodos(),
    localComments: readLocalComments(),
    githubError: githubError,
    refreshInterval: REFRESH_INTERVAL,
    updated: new Date().toISOString(),
  };

  // Get uncommitted changes with diffs
  const statusOutput = run('git status --porcelain', { fallback: '' });
  if (statusOutput) {
    statusOutput.split('\n').filter(Boolean).forEach(line => {
      const index = line[0];
      const worktree = line[1];
      const filePath = line.slice(3);

      if (index === '?' && worktree === '?') {
        // Untracked file
        data.uncommitted.untracked.push({ path: filePath, status: 'untracked', diff: '' });
      } else if (index !== ' ' && index !== '?') {
        // Staged changes
        const diff = run(`git diff --cached -- "${filePath}" 2>/dev/null`, { fallback: '' });
        data.uncommitted.staged.push({ path: filePath, status: index, diff });
      }
      if (worktree !== ' ' && worktree !== '?') {
        // Unstaged changes (working tree)
        const diff = run(`git diff -- "${filePath}" 2>/dev/null`, { fallback: '' });
        data.uncommitted.unstaged.push({ path: filePath, status: worktree, diff });
      }
    });
  }

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
              additions
              deletions
              changedFiles
              reviewDecision
              mergeable
              commits(last: 1) {
                nodes {
                  commit {
                    statusCheckRollup {
                      state
                      contexts(first: 50) {
                        nodes {
                          ... on CheckRun {
                            __typename
                            name
                            status
                            conclusion
                            detailsUrl
                          }
                          ... on StatusContext {
                            __typename
                            context
                            state
                            targetUrl
                          }
                        }
                      }
                    }
                  }
                }
              }
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
      // Extract CI checks
      const statusRollup = prNode.commits?.nodes?.[0]?.commit?.statusCheckRollup;
      const checks = [];
      if (statusRollup?.contexts?.nodes) {
        for (const ctx of statusRollup.contexts.nodes) {
          if (ctx.__typename === 'CheckRun') {
            checks.push({
              name: ctx.name,
              status: ctx.status,
              conclusion: ctx.conclusion,
              url: ctx.detailsUrl,
            });
          } else if (ctx.__typename === 'StatusContext') {
            checks.push({
              name: ctx.context,
              status: ctx.state === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED',
              conclusion: ctx.state === 'SUCCESS' ? 'SUCCESS' : ctx.state === 'FAILURE' ? 'FAILURE' : ctx.state,
              url: ctx.targetUrl,
            });
          }
        }
      }

      data.pr = {
        number: prNode.number,
        url: prNode.url,
        title: prNode.title,
        status: prNode.state,
        draft: prNode.isDraft,
        checksStatus: statusRollup?.state || null,
        checks: checks,
        reviewDecision: prNode.reviewDecision,
        mergeable: prNode.mergeable,
        additions: prNode.additions,
        deletions: prNode.deletions,
        changedFiles: prNode.changedFiles,
      };
      data.baseBranch = prNode.baseRefName || 'main';
    }
  }

  // Get all open PRs for the current user in this repo using search API
  if (ghToken && repoInfo && data.user) {
    const openPRsQuery = `
      query($searchQuery: String!) {
        search(query: $searchQuery, type: ISSUE, first: 50) {
          nodes {
            ... on PullRequest {
              number
              url
              title
              isDraft
              createdAt
              updatedAt
              headRefName
              baseRefName
              additions
              deletions
              changedFiles
              reviewDecision
              mergeable
              mergeStateStatus
              comments { totalCount }
              reviewThreads(first: 100) {
                totalCount
                nodes { isResolved }
              }
              author { login }
              commits(last: 1) {
                nodes {
                  commit {
                    statusCheckRollup {
                      state
                      contexts(first: 50) {
                        totalCount
                        nodes {
                          ... on CheckRun {
                            conclusion
                          }
                          ... on StatusContext {
                            state
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const searchQuery = `repo:${repoInfo.owner}/${repoInfo.name} is:pr is:open author:${data.user}`;
    const openPRsResult = await githubAPI(openPRsQuery, { searchQuery });

    const allPRs = (openPRsResult?.search?.nodes || []).filter(pr => pr.number);

    // Get existing worktrees and workspaces to check which PRs have them
    const repoRoot = run('git rev-parse --show-toplevel', { fallback: process.cwd() });
    const existingWorktrees = new Set();
    try {
      const worktreeList = run('git worktree list --porcelain', { fallback: '' });
      const entries = worktreeList.split('\n\n').filter(Boolean);
      for (const entry of entries) {
        const lines = entry.split('\n');
        const pathLine = lines.find(l => l.startsWith('worktree '));
        const branchLine = lines.find(l => l.startsWith('branch '));
        if (pathLine && branchLine) {
          const wtPath = pathLine.replace('worktree ', '');
          if (wtPath !== repoRoot) {
            const wtBranch = branchLine.replace('branch refs/heads/', '');
            existingWorktrees.add(wtBranch);
          }
        }
      }
    } catch (e) { /* ignore */ }

    const existingWorkspaces = new Set();
    try {
      const workspaces = run('cmux list-workspaces', { fallback: '' });
      workspaces.split('\n').forEach(line => {
        existingWorkspaces.add(line); // Store full line to search later
      });
    } catch (e) { /* ignore - cmux may not be available */ }

    // Map PR data (already filtered by author in search query)
    data.openPRs = allPRs
      .map(pr => {
        const rollup = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup;
        const contexts = rollup?.contexts?.nodes || [];
        const totalChecks = rollup?.contexts?.totalCount || 0;
        const passedChecks = contexts.filter(c =>
          c.conclusion === 'SUCCESS' || c.state === 'SUCCESS'
        ).length;

        const threads = pr.reviewThreads?.nodes || [];
        const unresolvedThreads = threads.filter(t => !t.isResolved).length;

        // Check if workspace or worktree exists for this branch
        const hasWorktree = existingWorktrees.has(pr.headRefName);
        let hasWorkspace = false;
        for (const ws of existingWorkspaces) {
          if (ws.includes(pr.headRefName)) {
            hasWorkspace = true;
            break;
          }
        }

        return {
          number: pr.number,
          url: pr.url,
          title: pr.title,
          draft: pr.isDraft,
          branch: pr.headRefName,
          base: pr.baseRefName,
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changedFiles,
          checksStatus: rollup?.state || null,
          checksPassed: passedChecks,
          checksTotal: totalChecks,
          reviewDecision: pr.reviewDecision,
          mergeable: pr.mergeable,
          mergeStateStatus: pr.mergeStateStatus,
          hasWorktree,
          hasWorkspace,
          commentsCount: pr.comments?.totalCount || 0,
          threadsCount: pr.reviewThreads?.totalCount || 0,
          unresolvedThreads: unresolvedThreads,
        };
      });
  }

  // Get recent commits on this branch
  const commitLog = run(`git log --format="%H|%h|%s|%an|%ai" -10 2>/dev/null`, { fallback: '' });
  if (commitLog) {
    data.commits = commitLog.split('\n').filter(Boolean).map(line => {
      const [hash, shortHash, subject, author, date] = line.split('|');
      return { hash, shortHash, subject, author, date };
    });
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
                id
                isResolved
                isOutdated
                path
                comments(first: 20) {
                  nodes {
                    id
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
      id: t.id,
      isResolved: t.isResolved,
      isOutdated: t.isOutdated,
      path: t.path,
      comments: t.comments.nodes.map(c => ({
        id: c.id,
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
    console.log(`[${new Date().toLocaleTimeString()}] Manual refresh requested`);
    currentData = await collectData();
    broadcastUpdate(currentData);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Open external URL in default browser
  if (pathname === '/api/open-url' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { url } = JSON.parse(body);
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid URL' }));
          return;
        }
        console.log(`[${new Date().toLocaleTimeString()}] Opening URL: ${url}`);
        execSync(`open "${url}"`, { stdio: 'pipe' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Reply to a PR review comment
  if (pathname === '/api/reply' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { commentId, body: replyBody } = JSON.parse(body);
        console.log(`[${new Date().toLocaleTimeString()}] Posting reply to comment ${commentId}`);

        if (!ghToken || !repoInfo || !currentData?.pr?.number) {
          console.log('  -> Failed: No PR or GitHub token');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No PR or GitHub token' }));
          return;
        }

        const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.name}/pulls/${currentData.pr.number}/comments/${commentId}/replies`;
        console.log(`  -> POST ${url}`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body: replyBody }),
        });

        if (!response.ok) {
          const err = await response.text();
          console.log(`  -> Failed: ${response.status} - ${err}`);
          res.writeHead(response.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err }));
          return;
        }

        const result = await response.json();
        console.log(`  -> Success: Created comment ${result.id}`);

        // Refresh data
        currentData = await collectData();
        broadcastUpdate(currentData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, comment: result }));
      } catch (err) {
        console.log(`  -> Error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Post a new GitHub PR comment
  if (pathname === '/api/github-comment' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { body: commentBody } = JSON.parse(body);
        console.log(`[${new Date().toLocaleTimeString()}] Posting GitHub PR comment`);

        if (!ghToken || !repoInfo || !currentData?.pr?.number) {
          console.log('  -> Failed: No PR or GitHub token');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No PR or GitHub token available' }));
          return;
        }

        // POST to issues API (PRs are issues)
        const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.name}/issues/${currentData.pr.number}/comments`;
        console.log(`  -> POST ${url}`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body: commentBody }),
        });

        if (!response.ok) {
          const err = await response.text();
          console.log(`  -> Failed: ${response.status} - ${err}`);
          res.writeHead(response.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err }));
          return;
        }

        const result = await response.json();
        console.log(`  -> Success: Created GitHub comment ${result.id}`);

        // Refresh data
        currentData = await collectData();
        broadcastUpdate(currentData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, comment: result }));
      } catch (err) {
        console.log(`  -> Error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Resolve/unresolve a GitHub review thread
  if (pathname === '/api/github-resolve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { threadId, resolved } = JSON.parse(body);
        console.log(`[${new Date().toLocaleTimeString()}] ${resolved ? 'Resolving' : 'Unresolving'} GitHub thread ${threadId}`);

        if (!ghToken) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No GitHub token available' }));
          return;
        }

        const mutation = resolved ? `
          mutation($threadId: ID!) {
            resolveReviewThread(input: {threadId: $threadId}) {
              thread { isResolved }
            }
          }
        ` : `
          mutation($threadId: ID!) {
            unresolveReviewThread(input: {threadId: $threadId}) {
              thread { isResolved }
            }
          }
        `;

        const result = await githubAPI(mutation, { threadId });

        if (result?.errors) {
          console.log(`  -> Failed: ${JSON.stringify(result.errors)}`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.errors[0]?.message || 'GraphQL error' }));
          return;
        }

        console.log(`  -> Success`);

        // Refresh data
        currentData = await collectData();
        broadcastUpdate(currentData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.log(`  -> Error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Fix a comment in Claude - creates branch, worktree, opens Claude with context
  if (pathname === '/api/fix-comment' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { threadId, path: filePath, comments } = JSON.parse(body);
        const currentBranch = currentData?.branch || 'main';

        // Create a short ID from the thread ID (last 8 chars of base64)
        const shortId = Buffer.from(threadId).toString('base64').slice(-8).replace(/[^a-zA-Z0-9]/g, '');
        const fixBranch = `${currentBranch}-fix-${shortId}`;

        console.log(`[${new Date().toLocaleTimeString()}] Creating fix branch: ${fixBranch}`);

        // Check if branch already exists
        const branchExists = run(`git branch --list ${fixBranch}`, { fallback: '' }).trim();

        if (!branchExists) {
          // Create the new branch from current branch
          try {
            execSync(`git branch ${fixBranch} ${currentBranch}`, { stdio: 'pipe' });
            console.log(`  -> Created branch: ${fixBranch}`);
          } catch (e) {
            console.log(`  -> Error creating branch: ${e.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Failed to create branch: ${e.message}` }));
            return;
          }
        } else {
          console.log(`  -> Branch already exists: ${fixBranch}`);
        }

        // Check if worktree already exists
        let worktreePath = null;
        try {
          const worktreeList = run('git worktree list --porcelain', { fallback: '' });
          const entries = worktreeList.split('\n\n').filter(Boolean);
          for (const entry of entries) {
            const lines = entry.split('\n');
            const pathLine = lines.find(l => l.startsWith('worktree '));
            const branchLine = lines.find(l => l.startsWith('branch '));
            if (pathLine && branchLine) {
              const wtPath = pathLine.replace('worktree ', '');
              const wtBranch = branchLine.replace('branch refs/heads/', '');
              if (wtBranch === fixBranch) {
                worktreePath = wtPath;
                console.log(`  -> Found existing worktree: ${wtPath}`);
                break;
              }
            }
          }
        } catch (e) {
          console.log(`  -> Error listing worktrees: ${e.message}`);
        }

        // Create worktree if needed
        if (!worktreePath) {
          const repoRoot = run('git rev-parse --show-toplevel', { fallback: process.cwd() });
          const parentDir = path.dirname(repoRoot);
          const worktreesDir = path.join(parentDir, 'worktrees', path.basename(repoRoot));
          const sanitizedBranch = fixBranch.replace(/\//g, '-');
          worktreePath = path.join(worktreesDir, sanitizedBranch);

          if (!fs.existsSync(worktreesDir)) {
            fs.mkdirSync(worktreesDir, { recursive: true });
          }

          try {
            execSync(`git worktree add "${worktreePath}" ${fixBranch}`, { stdio: 'pipe' });
            console.log(`  -> Created worktree: ${worktreePath}`);
          } catch (e) {
            console.log(`  -> Error creating worktree: ${e.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Failed to create worktree: ${e.message}` }));
            return;
          }
        }

        // Build the Claude prompt with comment context
        const commentContext = comments.map(c => `**${c.author}**: ${c.body}`).join('\n\n');
        const prompt = `Fix the following code review comment and create a PR back to \`${currentBranch}\`:

**File:** \`${filePath}\`

**Review Comments:**
${commentContext}

Please:
1. Read the file and understand the issue
2. Make the necessary fix
3. Commit the changes
4. Create a PR targeting \`${currentBranch}\``;

        // Escape the prompt for shell
        const escapedPrompt = prompt.replace(/'/g, "'\\''");

        // Open cmux workspace
        const workspaceTitle = `fix: ${filePath.split('/').pop()}`;
        console.log(`  -> Opening cmux workspace: ${workspaceTitle}`);

        try {
          // Create new workspace and capture its ref
          const createOutput = execSync(`cmux new-workspace --cwd "${worktreePath}"`, { encoding: 'utf8' }).trim();
          const workspaceRefMatch = createOutput.match(/(workspace:\d+)/);
          const workspaceRef = workspaceRefMatch ? workspaceRefMatch[1] : null;
          console.log(`  -> Created workspace: ${workspaceRef}`);

          if (workspaceRef) {
            // Select the new workspace
            execSync(`cmux select-workspace --workspace "${workspaceRef}"`, { stdio: 'pipe' });

            // Rename the workspace
            execSync(`cmux rename-workspace --workspace "${workspaceRef}" "${workspaceTitle}"`, { stdio: 'pipe' });

            // Start Claude with the prompt
            execSync(`cmux send --workspace "${workspaceRef}" "claude -p '${escapedPrompt}'\\n"`, { stdio: 'pipe' });
            console.log(`  -> Started Claude with fix prompt`);
          }

          execSync('cmux set-app-focus active', { stdio: 'pipe' });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, branch: fixBranch, worktree: worktreePath }));
        } catch (e) {
          console.log(`  -> Error opening cmux: ${e.message}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Failed to open cmux: ${e.message}` }));
        }
      } catch (err) {
        console.log(`  -> Error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Get local comments
  if (pathname === '/api/local-comments' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readLocalComments()));
    return;
  }

  // Add a local comment
  if (pathname === '/api/local-comments' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const authorName = data.author || 'human';

        // Support both old format (path/line/type) and new generic format (target)
        const target = data.target || (data.path ? `file:${data.type || 'branch'}:${data.path}${data.line != null ? ':' + data.line : ''}` : null);

        console.log(`[${new Date().toLocaleTimeString()}] Adding comment by ${authorName} on ${target}`);

        const comments = readLocalComments();
        const newComment = {
          id: `local-${Date.now()}`,
          target: target,
          // Keep legacy fields for backwards compatibility
          path: data.path || null,
          line: data.line ?? null,
          type: data.type || null,
          body: data.body,
          author: authorName,
          createdAt: new Date().toISOString(),
        };
        comments.push(newComment);
        writeLocalComments(comments);

        // Refresh data
        currentData = await collectData();
        broadcastUpdate(currentData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, comment: newComment }));
      } catch (err) {
        console.log(`  -> Error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Resolve/unresolve a local comment
  if (pathname === '/api/local-comments/resolve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { id, resolved, author } = JSON.parse(body);
        console.log(`[${new Date().toLocaleTimeString()}] ${resolved ? 'Resolving' : 'Unresolving'} comment ${id}`);

        const comments = readLocalComments();
        const comment = comments.find(c => c.id === id);
        if (comment) {
          comment.resolved = resolved;
          comment.resolvedAt = resolved ? new Date().toISOString() : null;
          comment.resolvedBy = resolved ? (author || 'human') : null;
          writeLocalComments(comments);

          // Refresh data
          currentData = await collectData();
          broadcastUpdate(currentData);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, comment }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Comment not found' }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Delete a local comment
  if (pathname === '/api/local-comments' && req.method === 'DELETE') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { id } = JSON.parse(body);
        console.log(`[${new Date().toLocaleTimeString()}] Deleting local comment ${id}`);

        const comments = readLocalComments();
        const filtered = comments.filter(c => c.id !== id);
        writeLocalComments(filtered);

        // Refresh data
        currentData = await collectData();
        broadcastUpdate(currentData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.log(`  -> Error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Open branch in worktree via cmux
  if (pathname === '/api/open-worktree' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { branch, project } = JSON.parse(body);
        const workspaceTitle = branch;
        console.log(`[${new Date().toLocaleTimeString()}] Opening worktree for branch: ${branch}`);

        // Check if cmux workspace already exists with this title
        try {
          const workspaces = run('cmux list-workspaces', { fallback: '' });
          const lines = workspaces.split('\n');
          for (const line of lines) {
            // Line format: "* workspace:22  --id 24 --name title" or "  workspace:19  ✳ title"
            // Extract the workspace ref (e.g., "workspace:22")
            const refMatch = line.match(/(workspace:\d+)/);
            if (refMatch) {
              // Check if this line contains our title (after the workspace ref and any symbols)
              const afterRef = line.slice(line.indexOf(refMatch[1]) + refMatch[1].length);
              if (afterRef.includes(workspaceTitle) || afterRef.includes(branch)) {
                // Found existing workspace, select it and focus
                console.log(`  -> Found existing workspace: ${refMatch[1]}`);
                execSync(`cmux select-workspace --workspace "${refMatch[1]}"`, { stdio: 'pipe' });
                execSync('cmux set-app-focus active', { stdio: 'pipe' });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, action: 'selected', workspace: refMatch[1], isNew: false }));
                return;
              }
            }
          }
        } catch (e) {
          console.log(`  -> Error checking workspaces: ${e.message}`);
        }

        // Check if worktree already exists for this branch (skip main repo)
        let worktreePath = null;
        const repoRoot = run('git rev-parse --show-toplevel', { fallback: process.cwd() });
        try {
          const worktreeList = run('git worktree list --porcelain', { fallback: '' });
          const entries = worktreeList.split('\n\n').filter(Boolean);
          for (const entry of entries) {
            const lines = entry.split('\n');
            const pathLine = lines.find(l => l.startsWith('worktree '));
            const branchLine = lines.find(l => l.startsWith('branch '));
            if (pathLine && branchLine) {
              const wtPath = pathLine.replace('worktree ', '');
              // Skip the main repo - we only want secondary worktrees
              if (wtPath === repoRoot) continue;
              const wtBranch = branchLine.replace('branch refs/heads/', '');
              if (wtBranch === branch) {
                worktreePath = wtPath;
                console.log(`  -> Found existing worktree: ${wtPath}`);
                break;
              }
            }
          }
        } catch (e) {
          console.log(`  -> Error listing worktrees: ${e.message}`);
        }

        // Create worktree if it doesn't exist
        if (!worktreePath) {
          // Create worktree in ../worktrees/<project>/<branch>
          const parentDir = path.dirname(repoRoot);
          const worktreesDir = path.join(parentDir, 'worktrees', path.basename(repoRoot));
          const sanitizedBranch = branch.replace(/\//g, '-');
          worktreePath = path.join(worktreesDir, sanitizedBranch);

          // Ensure worktrees directory exists
          if (!fs.existsSync(worktreesDir)) {
            fs.mkdirSync(worktreesDir, { recursive: true });
          }

          console.log(`  -> Creating worktree at: ${worktreePath}`);
          try {
            execSync(`git worktree add "${worktreePath}" "${branch}"`, { stdio: 'pipe' });
          } catch (e) {
            console.log(`  -> Error creating worktree: ${e.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Failed to create worktree: ${e.message}` }));
            return;
          }
        }

        // Open in cmux with the title
        console.log(`  -> Opening cmux workspace: ${workspaceTitle}`);
        try {
          // Create new workspace and capture its ref from output (e.g., "OK workspace:31")
          const createOutput = execSync(`cmux new-workspace --cwd "${worktreePath}"`, { encoding: 'utf8' }).trim();
          const workspaceRefMatch = createOutput.match(/(workspace:\d+)/);
          const workspaceRef = workspaceRefMatch ? workspaceRefMatch[1] : null;
          console.log(`  -> Created workspace: ${workspaceRef}`);

          if (workspaceRef) {
            // Select the new workspace
            try {
              execSync(`cmux select-workspace --workspace "${workspaceRef}"`, { stdio: 'pipe' });
              console.log(`  -> Selected workspace: ${workspaceRef}`);
            } catch (e) {
              console.log(`  -> Warning: Could not select workspace: ${e.message}`);
            }

            // Rename the workspace (specify workspace ref to ensure we rename the right one)
            try {
              execSync(`cmux rename-workspace --workspace "${workspaceRef}" "${workspaceTitle}"`, { stdio: 'pipe' });
              console.log(`  -> Renamed workspace to: ${workspaceTitle}`);
            } catch (e) {
              console.log(`  -> Warning: Could not rename workspace: ${e.message}`);
            }

            // Start Claude in the terminal (specify workspace ref)
            try {
              execSync(`cmux send --workspace "${workspaceRef}" "claude\\n"`, { stdio: 'pipe' });
              console.log(`  -> Started Claude in workspace`);
            } catch (e) {
              console.log(`  -> Warning: Could not start Claude: ${e.message}`);
            }
          }

          // Focus the cmux app
          execSync('cmux set-app-focus active', { stdio: 'pipe' });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, action: 'created', worktree: worktreePath, isNew: true }));
        } catch (e) {
          console.log(`  -> Error opening cmux: ${e.message}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Failed to open cmux: ${e.message}` }));
        }
      } catch (err) {
        console.log(`[${new Date().toLocaleTimeString()}] Open worktree error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Open URL in cmux browser (uses cmux open wrapper from PATH)
  if (pathname === '/api/open-url' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { url } = JSON.parse(body);
        if (url && url.includes('github.com')) {
          // Use 'open' which picks up cmux wrapper to open in cmux browser
          console.log(`[${new Date().toLocaleTimeString()}] Opening URL in cmux: ${url}`);
          execSync(`open "${url}"`, { stdio: 'pipe' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Only GitHub URLs allowed' }));
        }
      } catch (err) {
        console.log(`[${new Date().toLocaleTimeString()}] Open URL error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
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
