import type { AgentTab } from '../types';

interface AgentTabViewProps {
  tab: AgentTab | undefined;
}

export function AgentTabView({ tab }: AgentTabViewProps) {
  if (!tab) {
    return (
      <div className="card">
        <div className="card-content">
          <p>Tab not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-tab-container">
      <div
        className="agent-tab-content"
        dangerouslySetInnerHTML={{ __html: tab.content }}
      />
      <div className="agent-tab-meta">
        <span className="agent-tab-file">{tab.file}</span>
        <span className="agent-tab-modified">
          Updated: {new Date(tab.modified).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
