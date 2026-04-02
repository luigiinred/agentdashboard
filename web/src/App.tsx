import { useState } from 'react';
import { useData } from './hooks/useData';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import { Overview } from './components/Overview';
import { Files } from './components/Files';
import { Comments } from './components/Comments';
import './styles.css';

type TabId = 'overview' | 'files' | 'comments';

function App() {
  const { data, loading, error } = useData();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

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
  const tabs: { id: TabId; label: string; count?: number; hidden?: boolean }[] = [
    { id: 'overview', label: 'Overview' },
    {
      id: 'files',
      label: 'Files',
      count: data.stats.fileCount,
      hidden: data.stats.fileCount === 0,
    },
    {
      id: 'comments',
      label: 'Comments',
      count: data.comments.length || undefined,
      hidden: !data.pr,
    },
  ];

  const visibleTabs = tabs.filter(t => !t.hidden);

  return (
    <div className="app">
      <Header
        project={data.project}
        user={data.user}
        branch={data.branch}
        pr={data.pr}
      />

      <Tabs
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
      />

      <main className="content">
        {activeTab === 'overview' && (
          <Overview data={data} />
        )}
        {activeTab === 'files' && (
          <Files
            files={data.files}
            commentCounts={data.commentCounts}
          />
        )}
        {activeTab === 'comments' && (
          <Comments comments={data.comments} />
        )}
      </main>

      <footer className="updated">
        Updated: {new Date(data.updated).toLocaleTimeString()}
      </footer>
    </div>
  );
}

export default App;
