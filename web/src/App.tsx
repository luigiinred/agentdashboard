import { useState } from 'react';
import { useData } from './hooks/useData';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import { Overview } from './components/Overview';
import { Files } from './components/Files';
import { Comments } from './components/Comments';
import { AgentTabView } from './components/AgentTabView';
import './styles.css';

function App() {
  const { data, loading, error } = useData();
  const [activeTab, setActiveTab] = useState<string>('overview');

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
  const baseTabs: { id: string; label: string; count?: number; hidden?: boolean }[] = [
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
          />
        )}
        {activeTab === 'comments' && (
          <Comments comments={data.comments} />
        )}
        {activeTab.startsWith('agent-') && (
          <AgentTabView
            tab={(data.agentTabs || []).find(t => t.id === activeTab)}
          />
        )}
      </main>

      <footer className="updated">
        Updated: {new Date(data.updated).toLocaleTimeString()}
      </footer>
    </div>
  );
}

export default App;
