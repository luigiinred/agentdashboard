import { useState, useEffect } from 'react';
import { useData } from './hooks/useData';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import { Overview } from './components/Overview';
import { Files } from './components/Files';
import { Comments } from './components/Comments';
import { AgentTabView } from './components/AgentTabView';
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
    </div>
  );
}

export default App;
