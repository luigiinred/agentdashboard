import { useState, useEffect, useRef, useCallback } from 'react';
import { useData } from './hooks/useData';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import { Overview } from './components/Overview';
import { Git } from './components/Git';
import { Files } from './components/Files';
import { Comments } from './components/Comments';
import { AgentTabView } from './components/AgentTabView';
import { ToastContainer } from './components/Toast';
import type { ToastMessage } from './components/Toast';
import './styles.css';

// Detect if we're in cmux browser (not a standard browser like Chrome/Safari/Firefox)
function isInCmuxBrowser(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  // cmux browser likely uses a WebKit/Chromium base but won't have Chrome/Safari/Firefox identifiers
  // or check for specific cmux indicators
  const isStandardBrowser = ua.includes('chrome') || ua.includes('firefox') || ua.includes('safari');
  // If running on localhost and not a standard browser, assume cmux
  return !isStandardBrowser || ua.includes('cmux');
}

// Open GitHub URL in system default browser via server proxy
async function openInSystemBrowser(url: string): Promise<boolean> {
  try {
    const res = await fetch('/api/open-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function App() {
  const { data, loading, error } = useData();
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Track seen comment IDs to detect new ones
  const seenLocalCommentIds = useRef<Set<string>>(new Set());
  const seenGithubCommentIds = useRef<Set<number>>(new Set());
  const isInitialized = useRef(false);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Detect new comments and show toasts
  useEffect(() => {
    if (!data) return;

    // On first load, just record all existing IDs without showing toasts
    if (!isInitialized.current) {
      data.localComments.forEach(c => seenLocalCommentIds.current.add(c.id));
      data.comments.forEach(thread => {
        thread.comments.forEach(c => seenGithubCommentIds.current.add(c.id));
      });
      isInitialized.current = true;
      return;
    }

    // Check for new agent comments (local comments with author='agent')
    data.localComments.forEach(comment => {
      if (!seenLocalCommentIds.current.has(comment.id)) {
        seenLocalCommentIds.current.add(comment.id);
        if (comment.author === 'agent') {
          addToast({
            type: 'agent-comment',
            title: 'New Agent Comment',
            body: comment.body.length > 100 ? comment.body.slice(0, 100) + '...' : comment.body,
            onClick: () => setActiveTab('comments'),
          });
        }
      }
    });

    // Check for new GitHub comments
    data.comments.forEach(thread => {
      thread.comments.forEach(comment => {
        if (!seenGithubCommentIds.current.has(comment.id)) {
          seenGithubCommentIds.current.add(comment.id);
          addToast({
            type: 'github-comment',
            title: `New comment from ${comment.author}`,
            body: comment.body.length > 100 ? comment.body.slice(0, 100) + '...' : comment.body,
            onClick: () => setActiveTab('comments'),
          });
        }
      });
    });
  }, [data, addToast]);

  // Intercept GitHub links when in cmux browser
  useEffect(() => {
    if (!isInCmuxBrowser()) return;

    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (link && link.href && link.href.includes('github.com')) {
        e.preventDefault();
        e.stopPropagation();
        await openInSystemBrowser(link.href);
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app">
        <div className="error">{error || 'No data available'}</div>
      </div>
    );
  }

  // Determine which tabs to show
  const uncommittedCount = (data.uncommitted?.staged.length || 0) +
    (data.uncommitted?.unstaged.length || 0) +
    (data.uncommitted?.untracked.length || 0);
  const totalFileCount = data.stats.fileCount + uncommittedCount;

  const baseTabs: { id: string; label: string; count?: number; hidden?: boolean }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'git', label: 'Git' },
    {
      id: 'files',
      label: 'Files',
      count: totalFileCount || undefined,
      // Always show Files tab
    },
    {
      id: 'comments',
      label: 'Comments',
      count: (data.comments.length + data.localComments.length) || undefined,
      // Always show - includes both GH and local comments
    },
  ];

  // Add agent-created tabs
  const agentTabs = (data.agentTabs || []).map(tab => ({
    id: tab.id,
    label: tab.title,
  }));

  const allTabs = [...baseTabs.filter(t => !t.hidden), ...agentTabs];
  const visibleTabs = allTabs;

  return (
    <div className="app">
      <Header
        project={data.project}
        directory={data.directory}
        user={data.user}
        branch={data.branch}
        pr={data.pr}
      />

      {data.githubError && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          {data.githubError}
        </div>
      )}

      <Tabs
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id)}
      />

      <main className="content">
        {activeTab === 'overview' && (
          <Overview data={data} />
        )}
        {activeTab === 'git' && (
          <Git data={data} />
        )}
        {activeTab === 'files' && (
          <Files
            files={data.files}
            commentCounts={data.commentCounts}
            comments={data.comments}
            uncommitted={data.uncommitted}
            localComments={data.localComments}
          />
        )}
        {activeTab === 'comments' && (
          <Comments comments={data.comments} localComments={data.localComments} />
        )}
        {activeTab.startsWith('agent-') && (
          <AgentTabView
            tab={(data.agentTabs || []).find(t => t.id === activeTab)}
          />
        )}
      </main>

      <footer className="updated">
        <span>Updated: {new Date(data.updated).toLocaleTimeString()}</span>
        <span className="refresh-info">
          (auto-refresh: {Math.round(data.refreshInterval / 60000)}min)
        </span>
        <button
          className="btn-refresh"
          onClick={async () => {
            await fetch('/api/refresh', { method: 'POST' });
          }}
        >
          Refresh Now
        </button>
      </footer>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
