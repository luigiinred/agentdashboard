import type { DashboardData } from '../types';
import ReactMarkdown from 'react-markdown';

interface OverviewProps {
  data: DashboardData;
}

export function Overview({ data }: OverviewProps) {
  const completedTodos = data.agentTodos?.filter(t => t.completed) || [];
  const pendingTodos = data.agentTodos?.filter(t => !t.completed) || [];

  return (
    <div className="overview">
      {/* Agent Summary */}
      <div className="card">
        <div className="card-header">Agent Summary</div>
        <div className="card-content">
          {data.agentSummary ? (
            <div className="agent-summary-content">
              <ReactMarkdown>{data.agentSummary}</ReactMarkdown>
            </div>
          ) : (
            <p className="empty-state">
              No summary yet. Claude Code can write to <code>.sessiondashboard/agent-summary.md</code>
            </p>
          )}
        </div>
      </div>

      {/* Agent Todos */}
      <div className="card">
        <div className="card-header">
          Agent Todo List
          {data.agentTodos && data.agentTodos.length > 0 && (
            <span className="badge">{pendingTodos.length} pending</span>
          )}
        </div>
        <div className="card-content">
          {data.agentTodos && data.agentTodos.length > 0 ? (
            <div className="agent-todos">
              {pendingTodos.length > 0 && (
                <div className="todos-section">
                  {pendingTodos.map(todo => (
                    <div key={todo.id} className="todo-item pending">
                      <span className="todo-checkbox">○</span>
                      <span className="todo-text">{todo.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {completedTodos.length > 0 && (
                <div className="todos-section completed-section">
                  <div className="todos-section-header">Completed ({completedTodos.length})</div>
                  {completedTodos.map(todo => (
                    <div key={todo.id} className="todo-item completed">
                      <span className="todo-checkbox">✓</span>
                      <span className="todo-text">{todo.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="empty-state">
              No todos yet. Claude Code can write to <code>.sessiondashboard/todos.json</code>
            </p>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="card">
        <div className="card-header">Changes</div>
        <div className="card-content">
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-value">{data.stats.fileCount}</div>
              <div className="stat-label">Files</div>
            </div>
            <div className="stat">
              <div className="stat-value additions">+{data.stats.additions}</div>
              <div className="stat-label">Additions</div>
            </div>
            <div className="stat">
              <div className="stat-value deletions">-{data.stats.deletions}</div>
              <div className="stat-label">Deletions</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
