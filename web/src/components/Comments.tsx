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
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group local comments by target for initial collapsed state
  const getLocalThreadKey = (lc: LocalComment) => lc.target || `file:${lc.path}:${lc.line}`;

  // Start with resolved threads collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    comments.forEach((thread, idx) => {
      if (thread.isResolved) initial.add(`gh-${idx}`);
    });
    // Group and check if all comments in thread are resolved
    const localByKey: Record<string, LocalComment[]> = {};
    localComments.forEach((lc) => {
      const key = getLocalThreadKey(lc);
      if (!localByKey[key]) localByKey[key] = [];
      localByKey[key].push(lc);
    });
    Object.entries(localByKey).forEach(([key, thread]) => {
      if (thread.every(c => c.resolved)) initial.add(`local-${key}`);
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

  const submitComment = async () => {
    if (!newComment.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await fetch('/api/local-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'general',
          body: newComment.trim(),
          author: 'human',
        }),
      });
      setNewComment('');
    } catch (e) {
      alert('Failed to post comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitComment();
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

  // Group local comments by target (file:path:line or other target)
  const localThreads = localComments.reduce((acc, lc) => {
    const key = lc.target || `file:${lc.path}:${lc.line}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(lc);
    return acc;
  }, {} as Record<string, LocalComment[]>);

  // Filter local threads
  const filteredLocalThreads = Object.entries(localThreads).filter(([, thread]) => {
    if (!showLocal) return false;
    // A thread is resolved if all comments are resolved
    const isResolved = thread.every(c => c.resolved);
    if (filter === 'open') return !isResolved;
    if (filter === 'resolved') return isResolved;
    return true;
  });

  // Count threads, not individual comments
  const localThreadCount = Object.keys(localThreads).length;
  const localOpenThreads = Object.values(localThreads).filter(thread => !thread.every(c => c.resolved)).length;
  const localResolvedThreads = Object.values(localThreads).filter(thread => thread.every(c => c.resolved)).length;

  const totalOpen = comments.filter(t => !t.isResolved).length + localOpenThreads;
  const totalResolved = comments.filter(t => t.isResolved).length + localResolvedThreads;

  return (
    <div className="comments">
      {/* Filters */}
      <div className="comments-filters">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({comments.length + localThreadCount})
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

      {filteredGhComments.length === 0 && filteredLocalThreads.length === 0 && (
        <div className="no-comments">No comments match filters</div>
      )}

      {/* Local comment threads */}
      {filteredLocalThreads.map(([threadKey, thread]) => {
        const isResolved = thread.every(c => c.resolved);
        const firstComment = thread[0];
        const displayPath = firstComment.target || firstComment.path || 'General';

        return (
          <div key={threadKey} className={`comment-thread local ${isResolved ? 'resolved' : ''}`}>
            <div
              className="thread-header"
              onClick={() => toggleThread(`local-${threadKey}`)}
            >
              <span className="thread-icon">
                {collapsed.has(`local-${threadKey}`) ? '▶' : '▼'}
              </span>
              <span className="thread-source local">Local</span>
              <span className="thread-path">{displayPath}</span>
              {thread.length > 1 && (
                <span className="thread-count">{thread.length} comments</span>
              )}
              {isResolved && (
                <span className="thread-status resolved">Resolved</span>
              )}
            </div>
            <div className={`thread-content ${collapsed.has(`local-${threadKey}`) ? 'collapsed' : ''}`}>
              {thread.map((lc) => (
                <div key={lc.id} className="comment-item">
                  <div className="comment-header">
                    <span className={`comment-author-badge ${lc.author === 'agent' ? 'agent' : ''}`}>
                      {lc.author || 'human'}
                    </span>
                    <span className="comment-time">{formatTime(lc.createdAt)}</span>
                    {lc.resolved && (
                      <span className="comment-resolved-badge">Resolved</span>
                    )}
                  </div>
                  <div className="comment-body">{lc.body}</div>
                  <div className="comment-item-actions">
                    {lc.resolved ? (
                      <button className="btn-small btn-unresolve" onClick={() => resolveLocalComment(lc.id, false)}>
                        Unresolve
                      </button>
                    ) : (
                      <button className="btn-small btn-resolve" onClick={() => resolveLocalComment(lc.id, true)}>
                        Resolve
                      </button>
                    )}
                    <button className="btn-small btn-delete" onClick={() => deleteLocalComment(lc.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

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

      {/* Chat input */}
      <div className="comment-input-container">
        <textarea
          className="comment-input"
          placeholder="Leave a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
        />
        <div className="comment-input-actions">
          <span className="comment-input-hint">Cmd+Enter to send</span>
          <button
            className="btn-send"
            onClick={submitComment}
            disabled={!newComment.trim() || isSubmitting}
          >
            {isSubmitting ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
