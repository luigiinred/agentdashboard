import { useState } from 'react';
import type { DashboardData, OpenPR } from '../types';

interface GitProps {
  data: DashboardData;
}

interface PRNode {
  pr: OpenPR;
  children: PRNode[];
}

function buildPRTree(prs: OpenPR[]): PRNode[] {
  const branchToPR = new Map<string, OpenPR>();
  prs.forEach(pr => branchToPR.set(pr.branch, pr));

  const roots: PRNode[] = [];
  const nodes = new Map<number, PRNode>();

  // Create nodes for all PRs
  prs.forEach(pr => {
    nodes.set(pr.number, { pr, children: [] });
  });

  // Build tree structure
  prs.forEach(pr => {
    const node = nodes.get(pr.number)!;
    const parentPR = branchToPR.get(pr.base);

    if (parentPR && nodes.has(parentPR.number)) {
      // This PR is based on another PR's branch
      nodes.get(parentPR.number)!.children.push(node);
    } else {
      // This PR is based on main or a non-PR branch
      roots.push(node);
    }
  });

  return roots;
}

function PRTreeItem({ node, currentBranch, depth = 0 }: { node: PRNode; currentBranch: string; depth?: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const { pr, children } = node;
  const hasChildren = children.length > 0;

  return (
    <div className="pr-tree-item">
      <div
        className={`open-pr-item ${pr.branch === currentBranch ? 'current' : ''}`}
        style={{ marginLeft: depth * 20 }}
      >
        {hasChildren && (
          <button
            className="pr-tree-toggle"
            onClick={(e) => {
              e.preventDefault();
              setCollapsed(!collapsed);
            }}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        )}
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="open-pr-link"
        >
          <div className="open-pr-header">
            <span className="open-pr-number">#{pr.number}</span>
            {pr.draft && <span className="open-pr-draft">Draft</span>}
            {pr.branch === currentBranch && <span className="open-pr-current">current</span>}
            {hasChildren && <span className="pr-children-count">{children.length} stacked</span>}
          </div>
          <div className="open-pr-status-row">
            {/* CI Status */}
            {pr.checksStatus && (
              <span className={`open-pr-ci ${pr.checksStatus.toLowerCase()}`}>
                {pr.checksStatus === 'SUCCESS' ? '✓' : pr.checksStatus === 'FAILURE' ? '✗' : '●'}
                {' '}CI {pr.checksTotal > 0 ? `${pr.checksPassed}/${pr.checksTotal}` : pr.checksStatus.toLowerCase()}
              </span>
            )}
            {/* Review Status */}
            {pr.reviewDecision && (
              <span className={`open-pr-review ${pr.reviewDecision.toLowerCase()}`}>
                {pr.reviewDecision === 'APPROVED' && '✓ Approved'}
                {pr.reviewDecision === 'CHANGES_REQUESTED' && '✗ Changes requested'}
                {pr.reviewDecision === 'REVIEW_REQUIRED' && '○ Review required'}
              </span>
            )}
            {!pr.reviewDecision && !pr.draft && (
              <span className="open-pr-review pending">○ Awaiting review</span>
            )}
          </div>
          <div className="open-pr-title">{pr.title}</div>
          <div className="open-pr-stats">
            <span className="open-pr-files">{pr.changedFiles} files</span>
            <span className="open-pr-additions">+{pr.additions}</span>
            <span className="open-pr-deletions">-{pr.deletions}</span>
            {(pr.commentsCount > 0 || pr.threadsCount > 0) && (
              <span className="open-pr-comments">
                {pr.threadsCount > 0 && (
                  <>
                    {pr.unresolvedThreads > 0 ? (
                      <span className="unresolved">{pr.unresolvedThreads} unresolved</span>
                    ) : (
                      <span className="resolved">{pr.threadsCount} resolved</span>
                    )}
                  </>
                )}
              </span>
            )}
          </div>
          <div className="open-pr-meta">
            <span className="open-pr-branch">{pr.branch}</span>
            <span className="open-pr-arrow">→</span>
            <span className="open-pr-base">{pr.base}</span>
          </div>
        </a>
      </div>
      {hasChildren && !collapsed && (
        <div className="pr-tree-children">
          {children.map(child => (
            <PRTreeItem key={child.pr.number} node={child} currentBranch={currentBranch} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Git({ data }: GitProps) {
  const prTree = data.openPRs ? buildPRTree(data.openPRs) : [];

  return (
    <div className="git-tab">
      {/* Open PRs */}
      {prTree.length > 0 && (
        <div className="card">
          <div className="card-header">
            My Open PRs
            <span className="badge">{data.openPRs.length}</span>
          </div>
          <div className="card-content">
            <div className="open-prs-list">
              {prTree.map(node => (
                <PRTreeItem key={node.pr.number} node={node} currentBranch={data.branch} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
