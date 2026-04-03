import type { DashboardData } from '../types';

interface GitProps {
  data: DashboardData;
}

export function Git({ data }: GitProps) {
  const uncommittedCount =
    (data.uncommitted?.staged.length || 0) +
    (data.uncommitted?.unstaged.length || 0) +
    (data.uncommitted?.untracked.length || 0);

  return (
    <div className="git-tab">
      {/* Branch Info */}
      <div className="card">
        <div className="card-header">Branch</div>
        <div className="card-content">
          <div className="branch-info">
            <div className="branch-current">
              <span className="branch-icon">*</span>
              <span className="branch-name">{data.branch}</span>
            </div>
            <div className="branch-base">
              <span className="branch-label">Base:</span>
              <span className="branch-name">{data.baseBranch}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Uncommitted Changes Summary */}
      {uncommittedCount > 0 && (
        <div className="card">
          <div className="card-header">
            Uncommitted Changes
            <span className="badge">{uncommittedCount}</span>
          </div>
          <div className="card-content">
            <div className="uncommitted-summary">
              {data.uncommitted.staged.length > 0 && (
                <div className="uncommitted-group">
                  <span className="status-icon staged">+</span>
                  <span>{data.uncommitted.staged.length} staged</span>
                </div>
              )}
              {data.uncommitted.unstaged.length > 0 && (
                <div className="uncommitted-group">
                  <span className="status-icon modified">M</span>
                  <span>{data.uncommitted.unstaged.length} modified</span>
                </div>
              )}
              {data.uncommitted.untracked.length > 0 && (
                <div className="uncommitted-group">
                  <span className="status-icon untracked">?</span>
                  <span>{data.uncommitted.untracked.length} untracked</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Commits */}
      <div className="card">
        <div className="card-header">Recent Commits</div>
        <div className="card-content">
          {data.commits && data.commits.length > 0 ? (
            <div className="commits-list">
              {data.commits.map((commit) => (
                <div key={commit.hash} className="commit-item">
                  <div className="commit-header">
                    <span className="commit-hash">{commit.shortHash}</span>
                    <span className="commit-author">{commit.author}</span>
                  </div>
                  <div className="commit-subject">{commit.subject}</div>
                  <div className="commit-date">
                    {new Date(commit.date).toLocaleDateString()} {new Date(commit.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No commits found</p>
          )}
        </div>
      </div>
    </div>
  );
}
