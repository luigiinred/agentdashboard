export interface PRInfo {
  number: number;
  url: string;
  title: string;
  status: string;
  draft: boolean;
}

export interface FileInfo {
  path: string;
  add: string;
  del: string;
  diff: string;
}

export interface Comment {
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
  updated: string;
}
