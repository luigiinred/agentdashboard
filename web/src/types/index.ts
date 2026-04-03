export interface CICheck {
  name: string;
  status: string;
  conclusion: string | null;
  url: string | null;
}

export interface PRInfo {
  number: number;
  url: string;
  title: string;
  status: string;
  draft: boolean;
  checksStatus: string | null;
  checks: CICheck[];
}

export interface FileInfo {
  path: string;
  add: string;
  del: string;
  diff: string;
}

export interface Comment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  url: string;
  diffHunk: string;
}

export interface CommentThread {
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  comments: Comment[];
}

export interface PRStackItem {
  number: number;
  url: string;
  title: string;
  state: string;
  indent: number;
  isCurrent: boolean;
}

export interface PluginData {
  id: string;
  name: string;
  data: unknown;
}

export interface AgentTab {
  id: string;
  name: string;
  title: string;
  content: string;
  file: string;
  modified: string;
}

export interface UncommittedFile {
  path: string;
  status: string;
  diff: string;
}

export interface UncommittedChanges {
  staged: UncommittedFile[];
  unstaged: UncommittedFile[];
  untracked: UncommittedFile[];
}

export interface LocalComment {
  id: string;
  target: string; // Generic target: "file:type:path:line", "tab:tab-id", "overview", etc.
  // Legacy fields for file comments
  path?: string | null;
  line?: number | null;
  type?: 'staged' | 'unstaged' | 'untracked' | 'branch' | null;
  body: string;
  author: string;
  resolved?: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export interface Commit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

export interface AgentTodo {
  id: string;
  text: string;
  completed: boolean;
  createdAt?: string;
  completedAt?: string;
}

export interface OpenPR {
  number: number;
  url: string;
  title: string;
  draft: boolean;
  branch: string;
  base: string;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  checksStatus: string | null;
  checksPassed: number;
  checksTotal: number;
  reviewDecision: string | null;
  commentsCount: number;
  threadsCount: number;
  unresolvedThreads: number;
}

export interface DashboardData {
  project: string;
  branch: string;
  baseBranch: string;
  user: string | null;
  pr: PRInfo | null;
  prStack: PRStackItem[];
  stats: {
    fileCount: number;
    additions: number;
    deletions: number;
  };
  files: FileInfo[];
  comments: CommentThread[];
  commentCounts: Record<string, number>;
  plugins: PluginData[];
  agentTabs: AgentTab[];
  uncommitted: UncommittedChanges;
  commits: Commit[];
  openPRs: OpenPR[];
  agentSummary: string | null;
  agentTodos: AgentTodo[];
  localComments: LocalComment[];
  githubError: string | null;
  refreshInterval: number;
  updated: string;
}
