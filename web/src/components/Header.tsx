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
    </header>
  );
}
