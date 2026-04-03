import type { PRInfo } from '../types';

interface HeaderProps {
  project: string;
  directory: string;
  user: string | null;
  branch: string;
  pr: PRInfo | null;
}

export function Header({ project, directory, user, branch, pr }: HeaderProps) {
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
        <div className="directory-path">{directory}</div>
        <div className="branch-info">
          <span className="branch-name-text">{branch}</span>
          {pr && (
            <>
              <span className="separator">•</span>
              <a href={pr.url} target="_blank" rel="noopener" className="pr-link">
                #{pr.number}
              </a>
              {pr.draft && <span className="header-badge draft">Draft</span>}
            </>
          )}
        </div>
        {pr && (
          <div className="header-status-row">
            {/* Review status */}
            {pr.reviewDecision === 'APPROVED' && (
              <span className="header-badge approved">✓ Approved</span>
            )}
            {pr.reviewDecision === 'CHANGES_REQUESTED' && (
              <span className="header-badge changes-requested">✗ Changes requested</span>
            )}
            {!pr.reviewDecision && !pr.draft && (
              <span className="header-badge pending">○ Awaiting review</span>
            )}
            {/* Merge status */}
            {pr.mergeable === 'CONFLICTING' && (
              <span className="header-badge conflicts">⚠ Conflicts</span>
            )}
            {/* CI status */}
            {pr.checksStatus && (
              <span className={`header-badge ci-${pr.checksStatus.toLowerCase()}`}>
                {pr.checksStatus === 'SUCCESS' ? '✓' : pr.checksStatus === 'FAILURE' ? '✗' : '●'} CI
              </span>
            )}
            {/* File stats */}
            {pr.changedFiles !== undefined && (
              <span className="header-stats">
                <span className="files">{pr.changedFiles} files</span>
                <span className="additions">+{pr.additions}</span>
                <span className="deletions">-{pr.deletions}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
