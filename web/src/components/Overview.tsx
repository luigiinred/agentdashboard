import type { DashboardData } from '../types';

interface OverviewProps {
  data: DashboardData;
}

export function Overview({ data }: OverviewProps) {
  return (
    <div className="overview">
      {/* Stats */}
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

      {/* PR Stack */}
      {data.prStack.length > 0 && (
        <div className="card">
          <div className="card-header">PR Stack</div>
          <div className="card-content">
            {data.prStack.map((item, idx) => (
              <div
                key={idx}
                className={`pr-stack-item ${item.isCurrent ? 'current' : ''}`}
                style={{ paddingLeft: `${item.indent * 20 + 12}px` }}
              >
                {item.indent > 0 && (
                  <span className="pr-stack-indent">└</span>
                )}
                {item.number ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener"
                    className="pr-stack-number"
                  >
                    #{item.number}
                  </a>
                ) : null}
                <span className="pr-stack-title">
                  {item.title}
                  {item.isCurrent && ' ← current'}
                </span>
                {item.state && (
                  <span className={`pr-stack-state ${item.state}`}>
                    {item.state}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Branch Info */}
      <div className="card">
        <div className="card-header">Branch Info</div>
        <div className="card-content">
          <p><strong>Branch:</strong> {data.branch}</p>
          <p><strong>Base:</strong> {data.baseBranch}</p>
          {data.user && <p><strong>User:</strong> {data.user}</p>}
        </div>
      </div>
    </div>
  );
}
