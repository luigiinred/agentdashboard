import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { CommentThread, LocalComment } from '../types';

interface CommentsProps {
  comments: CommentThread[];
  localComments: LocalComment[];
}

// Map file extensions to Prism language names
function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    swift: 'swift', kt: 'kotlin', java: 'java', py: 'python',
    rb: 'ruby', go: 'go', rs: 'rust', css: 'css', scss: 'scss',
    html: 'markup', xml: 'markup', json: 'json', yaml: 'yaml',
    yml: 'yaml', md: 'markdown', sql: 'sql', sh: 'bash',
  };
  return langMap[ext] || 'text';
}

export function Comments({ comments, localComments }: CommentsProps) {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [showLocal, setShowLocal] = useState(true);
  const [showGithub, setShowGithub] = useState(true);

  // Start with resolved threads collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    comments.forEach((thread, idx) => {
      if (thread.isResolved) initial.add(`gh-${idx}`);
    });
    localComments.forEach((lc) => {
      if (lc.resolved) initial.add(`local-${lc.id}`);
    });
    return initial;
  });

  const resolveLocalComment = async (id: string, resolved: boolean) => {
    try {
      await fetch('/api/local-comments/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolved, author: 'human' }),
      });
    } catch (e) {
      alert('Failed to update comment');
    }
  };

  const deleteLocalComment = async (id: string) => {
    try {
      await fetch('/api/local-comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch (e) {
      alert('Failed to delete comment');
    }
  };

  const toggleThread = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'just now';
  };

  const renderMarkdown = (text: string) => {
    // Simple markdown rendering
    let html = text
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      // Headers (must be before line breaks)
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
      // Double newlines = paragraph break
      .replace(/\n\n+/g, '</p><p>')
      // Single newlines = line break (but not right after headers/pre)
      .replace(/(<\/h[234]>|<\/pre>)\n/g, '$1')
      .replace(/\n/g, '<br>');

    // Wrap in paragraph if we added paragraph breaks
    if (html.includes('</p><p>')) {
      html = '<p>' + html + '</p>';
    }

    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  // Filter comments
  const filteredGhComments = comments.filter(thread => {
    if (!showGithub) return false;
    if (filter === 'open') return !thread.isResolved;
    if (filter === 'resolved') return thread.isResolved;
    return true;
  });

  const filteredLocalComments = localComments.filter(lc => {
    if (!showLocal) return false;
    if (filter === 'open') return !lc.resolved;
    if (filter === 'resolved') return lc.resolved;
    return true;
  });

  const totalOpen = comments.filter(t => !t.isResolved).length + localComments.filter(l => !l.resolved).length;
  const totalResolved = comments.filter(t => t.isResolved).length + localComments.filter(l => l.resolved).length;

  return (
    <div className="comments">
      {/* Filters */}
      <div className="comments-filters">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({comments.length + localComments.length})
          </button>
          <button
            className={`filter-tab ${filter === 'open' ? 'active' : ''}`}
            onClick={() => setFilter('open')}
          >
            Open ({totalOpen})
          </button>
          <button
            className={`filter-tab ${filter === 'resolved' ? 'active' : ''}`}
            onClick={() => setFilter('resolved')}
          >
            Resolved ({totalResolved})
          </button>
        </div>
        <div className="filter-toggles">
          <label>
            <input type="checkbox" checked={showGithub} onChange={(e) => setShowGithub(e.target.checked)} />
            GitHub
          </label>
          <label>
            <input type="checkbox" checked={showLocal} onChange={(e) => setShowLocal(e.target.checked)} />
            Local
          </label>
        </div>
      </div>

      {filteredGhComments.length === 0 && filteredLocalComments.length === 0 && (
        <div className="no-comments">No comments match filters</div>
      )}

      {/* Local comments */}
      {filteredLocalComments.map((lc) => (
        <div key={lc.id} className={`comment-thread local ${lc.resolved ? 'resolved' : ''}`}>
          <div
            className="thread-header"
            onClick={() => toggleThread(`local-${lc.id}`)}
          >
            <span className="thread-icon">
              {collapsed.has(`local-${lc.id}`) ? '▶' : '▼'}
            </span>
            <span className="thread-source local">Local</span>
            <span className="thread-path">{lc.target || lc.path || 'General'}</span>
            {lc.resolved && (
              <span className="thread-status resolved">Resolved</span>
            )}
          </div>
          <div className={`thread-content ${collapsed.has(`local-${lc.id}`) ? 'collapsed' : ''}`}>
            <div className="comment-item">
              <div className="comment-header">
                <span className={`comment-author-badge ${lc.author === 'agent' ? 'agent' : ''}`}>
                  {lc.author || 'human'}
                </span>
                <span className="comment-time">{formatTime(lc.createdAt)}</span>
              </div>
              <div className="comment-body">{lc.body}</div>
            </div>
            <div className="comment-actions">
              {lc.resolved ? (
                <button className="btn-unresolve" onClick={() => resolveLocalComment(lc.id, false)}>
                  Unresolve
                </button>
              ) : (
                <button className="btn-resolve" onClick={() => resolveLocalComment(lc.id, true)}>
                  Resolve
                </button>
              )}
              <button className="btn-delete" onClick={() => deleteLocalComment(lc.id)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* GitHub comments */}
      {filteredGhComments.map((thread, idx) => (
        <div key={`gh-${idx}`} className={`comment-thread github ${thread.isResolved ? 'resolved' : ''}`}>
          <div
            className="thread-header"
            onClick={() => toggleThread(`gh-${idx}`)}
          >
            <span className="thread-icon">
              {collapsed.has(`gh-${idx}`) ? '▶' : '▼'}
            </span>
            <span className="thread-source github">GitHub</span>
            <span className="thread-path">{thread.path}</span>
            {thread.isResolved && (
              <span className="thread-status resolved">Resolved</span>
            )}
            {thread.isOutdated && (
              <span className="thread-status outdated">Outdated</span>
            )}
          </div>
          <div className={`thread-content ${collapsed.has(`gh-${idx}`) ? 'collapsed' : ''}`}>
            {/* Show diff hunk context if available - last 5 lines with syntax highlighting */}
            {thread.comments[0]?.diffHunk && (
              <div className="comment-diff-context">
                {(() => {
                  const lines = thread.comments[0].diffHunk.split('\n');
                  // Take last 5 non-empty lines (or all if fewer)
                  const contextLines = lines.slice(-6).filter(l => l.trim());
                  const language = getLanguage(thread.path);

                  return (
                    <div className="diff-hunk-highlighted">
                      {contextLines.map((line, i) => {
                        let lineClass = '';
                        let content = line;

                        if (line.startsWith('+') && !line.startsWith('+++')) {
                          lineClass = 'add';
                          content = line.slice(1);
                        } else if (line.startsWith('-') && !line.startsWith('---')) {
                          lineClass = 'del';
                          content = line.slice(1);
                        } else if (line.startsWith('@@')) {
                          lineClass = 'hunk';
                        } else if (line.startsWith(' ')) {
                          content = line.slice(1);
                        }

                        return (
                          <div key={i} className={`diff-context-line ${lineClass}`}>
                            <span className="diff-context-prefix">
                              {line.startsWith('+') ? '+' : line.startsWith('-') ? '-' : ' '}
                            </span>
                            <span className="diff-context-code">
                              {lineClass === 'hunk' ? (
                                <span className="hunk-text">{line}</span>
                              ) : (
                                <SyntaxHighlighter
                                  language={language}
                                  style={oneDark}
                                  customStyle={{ display: 'inline', padding: 0, margin: 0, background: 'transparent', fontSize: '12px' }}
                                  codeTagProps={{ style: { background: 'transparent' } }}
                                  PreTag="span"
                                >
                                  {content || ' '}
                                </SyntaxHighlighter>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
            {thread.comments.map((comment, cidx) => (
              <div key={cidx} className="comment-item">
                <div className="comment-header">
                  <img
                    src={`https://github.com/${comment.author}.png?size=48`}
                    alt={comment.author}
                    className="comment-avatar"
                  />
                  <span className="comment-author">{comment.author}</span>
                  <span className="comment-time">{formatTime(comment.createdAt)}</span>
                </div>
                <div className="comment-body">
                  {renderMarkdown(comment.body)}
                </div>
              </div>
            ))}
            {/* Actions */}
            <div className="comment-actions">
              <a
                href={thread.comments[0]?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-github-link"
              >
                Open on GitHub
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
