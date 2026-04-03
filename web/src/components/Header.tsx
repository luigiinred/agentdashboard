import type { PRInfo } from '../types';

interface HeaderProps {
  project: string;
  user: string | null;
  branch: string;
  pr: PRInfo | null;
}

export function Header({ project, user, branch, pr }: HeaderProps) {
  const getStatusClass = () => {
    if (!pr) return '';
    if (pr.draft) return 'draft';
    return pr.status.toLowerCase();
  };

  const getStatusText = () => {
    if (!pr) return null;
    if (pr.draft) return 'Draft';
    return pr.status;
  };

  return (
    <header className="header">
      {user && (
        <img
          src={`https://github.com/${user}.png?size=64`}
          alt={user}
          className="avatar"
        />
      )}
      <div className="header-info">
        <h1 className="project-name">{project}</h1>
        <div className="branch-info">
          <span>{branch}</span>
          {pr && (
            <>
              <span>•</span>
              <a href={pr.url} target="_blank" rel="noopener" className="pr-link">
                #{pr.number}
              </a>
              <span className={`pr-status ${getStatusClass()}`}>
                {getStatusText()}
              </span>
            </>
          )}
        </div>
      </div>
      <a
        href="https://github.com/luigiinred/agentdashboard/issues/new"
        target="_blank"
        rel="noopener"
        className="report-issue-btn"
        title="Report an issue"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z"/>
        </svg>
      </a>
    </header>
  );
}
