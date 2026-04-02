import React, { useState, useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { FileInfo, CommentThread, UncommittedChanges, LocalComment } from '../types';

interface FilesProps {
  files: FileInfo[];
  commentCounts: Record<string, number>;
  comments: CommentThread[];
  uncommitted?: UncommittedChanges;
  localComments?: LocalComment[];
  onAddComment?: (path: string, line: number, body: string) => Promise<void>;
}

// Map file extensions to Prism language names
function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    swift: 'swift', kt: 'kotlin', java: 'java', py: 'python',
    rb: 'ruby', go: 'go', rs: 'rust', css: 'css', scss: 'scss',
    less: 'less', html: 'markup', xml: 'markup', json: 'json',
    yaml: 'yaml', yml: 'yaml', md: 'markdown', sql: 'sql',
    sh: 'bash', bash: 'bash', zsh: 'bash', c: 'c', cpp: 'cpp',
    h: 'c', hpp: 'cpp', cs: 'csharp', php: 'php',
  };
  return langMap[ext] || 'text';
}

// Custom style based on GitHub dark theme
const diffStyle: Record<string, React.CSSProperties> = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    margin: 0, padding: 0, background: 'transparent', fontSize: '12px', lineHeight: '20px',
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: 'transparent', fontSize: '12px',
  },
};

// Memoized diff line to prevent re-renders during typing
const MemoizedDiffLine = React.memo(function DiffLine({
  line,
  idx,
  language,
}: {
  line: string;
  idx: number;
  language: string;
}) {
  let lineClass = '';
  let prefix = ' ';
  let content = line;

  if (line.startsWith('+++') || line.startsWith('---')) {
    lineClass = 'meta';
  } else if (line.startsWith('+') && !line.startsWith('+++')) {
    lineClass = 'add';
    prefix = '+';
    content = line.slice(1);
  } else if (line.startsWith('-') && !line.startsWith('---')) {
    lineClass = 'del';
    prefix = '-';
    content = line.slice(1);
  } else if (line.startsWith('@@')) {
    lineClass = 'hunk';
  } else if (line.startsWith(' ')) {
    content = line.slice(1);
  }

  return (
    <div className={`diff-line ${lineClass}`} data-line-idx={idx}>
      <span className="diff-line-num">{idx + 1}</span>
      <span className="diff-line-prefix">{prefix}</span>
      <span className="diff-line-code">
        {lineClass === 'hunk' || lineClass === 'meta' ? (
          <span className="hunk-text">{content}</span>
        ) : (
          <SyntaxHighlighter
            language={language}
            style={diffStyle}
            customStyle={{ display: 'inline', padding: 0, margin: 0, background: 'transparent' }}
            codeTagProps={{ style: { display: 'inline', background: 'transparent' } }}
            PreTag="span"
          >
            {content || ' '}
          </SyntaxHighlighter>
        )}
      </span>
      <button
        className="add-comment-btn"
        data-line={idx}
        title="Add comment"
      >
        +
      </button>
    </div>
  );
});

interface InlineCommentProps {
  thread: CommentThread;
  defaultCollapsed: boolean;
}

function InlineComment({ thread, defaultCollapsed }: InlineCommentProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitReply = async () => {
    if (!replyText.trim() || !thread.comments[0]?.id) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: thread.comments[0].id,
          body: replyText,
        }),
      });
      if (res.ok) {
        setReplyText('');
        setReplying(false);
      } else {
        const err = await res.json();
        alert('Failed to post reply: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Failed to post reply');
    } finally {
      setSubmitting(false);
    }
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
      // Single newlines after headers/pre = nothing
      .replace(/(<\/h[234]>|<\/pre>)\n/g, '$1')
      // Other single newlines = line break
      .replace(/\n/g, '<br>');

    if (html.includes('</p><p>')) {
      html = '<p>' + html + '</p>';
    }

    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <div className={`inline-comment-thread ${thread.isResolved ? 'resolved' : ''}`}>
      <div className="inline-comment-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="collapse-icon">{collapsed ? '▶' : '▼'}</span>
        <img
          src={`https://github.com/${thread.comments[0]?.author}.png?size=32`}
          alt=""
          className="inline-comment-avatar"
        />
        <span className="inline-comment-author">{thread.comments[0]?.author}</span>
        <span className="inline-comment-preview">
          {collapsed ? thread.comments[0]?.body.slice(0, 60) + '...' : ''}
        </span>
        <span className="inline-comment-meta">
          {thread.comments.length > 1 && <span className="reply-count">{thread.comments.length} comments</span>}
          {thread.isResolved && <span className="status-badge resolved">Resolved</span>}
          {thread.isOutdated && <span className="status-badge outdated">Outdated</span>}
        </span>
      </div>

      {!collapsed && (
        <div className="inline-comment-body">
          {thread.comments.map((comment, idx) => (
            <div key={idx} className="inline-comment-item">
              <div className="inline-comment-item-header">
                <img
                  src={`https://github.com/${comment.author}.png?size=32`}
                  alt=""
                  className="inline-comment-avatar"
                />
                <span className="inline-comment-author">{comment.author}</span>
                <span className="inline-comment-time">{formatTime(comment.createdAt)}</span>
              </div>
              <div className="inline-comment-text">{renderMarkdown(comment.body)}</div>
            </div>
          ))}

          {!thread.isResolved && (
            <div className="inline-comment-reply">
              {replying ? (
                <div className="reply-form">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a reply..."
                    rows={3}
                  />
                  <div className="reply-actions">
                    <button className="btn-cancel" onClick={() => { setReplying(false); setReplyText(''); }}>
                      Cancel
                    </button>
                    <button
                      className="btn-submit"
                      disabled={!replyText.trim() || submitting}
                      onClick={submitReply}
                    >
                      {submitting ? 'Posting...' : 'Reply'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button className="btn-reply" onClick={() => setReplying(true)}>
                    Reply
                  </button>
                  <a
                    href={thread.comments[0]?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-github-link"
                  >
                    Open on GitHub
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Files({ files, comments, uncommitted, localComments = [] }: FilesProps) {
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [addingLocalComment, setAddingLocalComment] = useState<{ path: string; type: string; line?: number } | null>(null);
  const [localCommentText, setLocalCommentText] = useState('');
  const [submittingLocal, setSubmittingLocal] = useState(false);
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Group local comments by file path
  const localCommentsByFile = localComments.reduce((acc, comment) => {
    const key = `${comment.type}-${comment.path}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(comment);
    return acc;
  }, {} as Record<string, LocalComment[]>);

  // Add a local comment
  const addLocalComment = async (filePath: string, type: string, line?: number) => {
    if (!localCommentText.trim()) return;
    setSubmittingLocal(true);
    try {
      const res = await fetch('/api/local-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          line: line ?? null,
          body: localCommentText,
          type,
          author: 'human',
        }),
      });
      if (res.ok) {
        setLocalCommentText('');
        setAddingLocalComment(null);
      } else {
        const err = await res.json();
        alert('Failed to add comment: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Failed to add comment');
    } finally {
      setSubmittingLocal(false);
    }
  };

  // Delete a local comment
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

  // Group comments by file path (only unresolved for inline display)
  const commentsByFile = comments.reduce((acc, thread) => {
    if (!thread.isResolved) {
      if (!acc[thread.path]) acc[thread.path] = [];
      acc[thread.path].push(thread);
    }
    return acc;
  }, {} as Record<string, CommentThread[]>);

  // All comments by file for sidebar counts
  const allCommentsByFile = comments.reduce((acc, thread) => {
    if (!acc[thread.path]) acc[thread.path] = [];
    acc[thread.path].push(thread);
    return acc;
  }, {} as Record<string, CommentThread[]>);

  // Scroll to file when clicking sidebar
  const scrollToFile = (path: string) => {
    const el = fileRefs.current[path];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveFile(path);
    }
  };

  // Track which file is in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveFile(entry.target.getAttribute('data-path'));
          }
        });
      },
      { threshold: 0.3, rootMargin: '-100px 0px -50% 0px' }
    );

    Object.values(fileRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [files]);

  const toggleFile = (path: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Group files by directory for sidebar
  const groupedFiles = files.reduce((acc, file) => {
    const parts = file.path.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    if (!acc[dir]) acc[dir] = [];
    acc[dir].push(file);
    return acc;
  }, {} as Record<string, FileInfo[]>);

  const renderDiffWithComments = (file: FileInfo, language: string) => {
    if (!file.diff) return <div className="file-diff-empty">No diff available</div>;

    const lines = file.diff.split('\n');
    const fileComments = commentsByFile[file.path] || [];
    const elements: React.ReactNode[] = [];

    lines.forEach((line, idx) => {
      let lineClass = '';
      let prefix = ' ';
      let content = line;

      if (line.startsWith('+++') || line.startsWith('---')) {
        lineClass = 'meta';
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        lineClass = 'add';
        prefix = '+';
        content = line.slice(1);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        lineClass = 'del';
        prefix = '-';
        content = line.slice(1);
      } else if (line.startsWith('@@')) {
        lineClass = 'hunk';
      } else if (line.startsWith(' ')) {
        content = line.slice(1);
      }

      // Add the diff line
      elements.push(
        <div key={`line-${idx}`} className={`diff-line ${lineClass}`}>
          <span className="diff-line-num">{idx + 1}</span>
          <span className="diff-line-prefix">{prefix}</span>
          <span className="diff-line-code">
            {lineClass === 'hunk' || lineClass === 'meta' ? (
              <span className="hunk-text">{content}</span>
            ) : (
              <SyntaxHighlighter
                language={language}
                style={diffStyle}
                customStyle={{ display: 'inline', padding: 0, margin: 0, background: 'transparent' }}
                codeTagProps={{ style: { display: 'inline', background: 'transparent' } }}
                PreTag="span"
              >
                {content || ' '}
              </SyntaxHighlighter>
            )}
          </span>
          <button
            className="add-comment-btn"
            onClick={() => setAddingLocalComment({ path: file.path, type: 'branch', line: idx })}
            title="Add comment"
          >
            +
          </button>
        </div>
      );

      // Add inline comment form if user is adding a comment on this line
      if (addingLocalComment?.path === file.path && addingLocalComment?.type === 'branch' && addingLocalComment?.line === idx) {
        elements.push(
          <div key={`add-comment-${idx}`} className="inline-comment-form">
            <textarea
              value={localCommentText}
              onChange={(e) => setLocalCommentText(e.target.value)}
              placeholder="Write a comment..."
              rows={3}
              autoFocus
            />
            <div className="inline-comment-form-actions">
              <button
                className="btn-cancel"
                onClick={() => { setAddingLocalComment(null); setLocalCommentText(''); }}
              >
                Cancel
              </button>
              <button
                className="btn-submit"
                disabled={!localCommentText.trim() || submittingLocal}
                onClick={() => addLocalComment(file.path, 'branch', idx)}
              >
                {submittingLocal ? 'Adding...' : 'Save Local'}
              </button>
            </div>
          </div>
        );
      }

      // Show any local comments attached to this line
      const key = `branch-${file.path}`;
      const fileLocalComments = localCommentsByFile[key] || [];
      const lineLocalComments = fileLocalComments.filter(c => c.line === idx);
      lineLocalComments.forEach((lc, cidx) => {
        elements.push(
          <div key={`local-comment-${idx}-${cidx}`} className="inline-local-comment">
            <div className="inline-local-comment-header">
              <span className={`inline-local-comment-badge ${lc.author === 'agent' ? 'agent' : ''}`}>
                {lc.author || 'human'}
              </span>
              <span className="inline-local-comment-time">
                {new Date(lc.createdAt).toLocaleString()}
              </span>
              <button
                className="local-comment-delete"
                onClick={() => deleteLocalComment(lc.id)}
                title="Delete comment"
              >
                ×
              </button>
            </div>
            <div className="inline-local-comment-body">{lc.body}</div>
          </div>
        );
      });

      // Check if there are comments that should appear after this line
      // (simplified: show all comments for this file after line 5 for demo)
      // In reality, you'd parse the diffHunk to find the exact line
    });

    // Add all unresolved comments at the end of the file
    if (fileComments.length > 0) {
      elements.push(
        <div key="comments-section" className="file-comments-section">
          <div className="file-comments-header">
            <span>💬 {fileComments.length} unresolved comment{fileComments.length > 1 ? 's' : ''}</span>
          </div>
          {fileComments.map((thread, tidx) => (
            <div key={tidx} id={`comment-${file.path}-${tidx}`}>
              <InlineComment
                thread={thread}
                defaultCollapsed={false}
              />
            </div>
          ))}
        </div>
      );
    }

    return <div className="diff-content-highlighted">{elements}</div>;
  };

  // Diff renderer with local comments for uncommitted changes
  const renderDiffWithLocalComments = (diff: string, language: string, filePath: string, fileType: string) => {
    const lines = diff.split('\n');
    const key = `${fileType}-${filePath}`;
    const fileLocalComments = localCommentsByFile[key] || [];
    const elements: React.ReactNode[] = [];

    lines.forEach((line, idx) => {
      // Add the memoized diff line (won't re-render on typing)
      elements.push(
        <MemoizedDiffLine
          key={`line-${idx}`}
          line={line}
          idx={idx}
          language={language}
        />
      );

      // Add inline comment form if user is adding a comment on this line
      if (addingLocalComment?.path === filePath && addingLocalComment?.type === fileType && addingLocalComment?.line === idx) {
        elements.push(
          <div key={`add-comment-${idx}`} className="inline-comment-form">
            <textarea
              value={localCommentText}
              onChange={(e) => setLocalCommentText(e.target.value)}
              placeholder="Write a comment..."
              rows={3}
              autoFocus
            />
            <div className="inline-comment-form-actions">
              <button
                className="btn-cancel"
                onClick={() => { setAddingLocalComment(null); setLocalCommentText(''); }}
              >
                Cancel
              </button>
              <button
                className="btn-submit"
                disabled={!localCommentText.trim() || submittingLocal}
                onClick={() => addLocalComment(filePath, fileType, idx)}
              >
                {submittingLocal ? 'Adding...' : 'Add Comment'}
              </button>
            </div>
          </div>
        );
      }

      // Show any local comments attached to this line
      const lineComments = fileLocalComments.filter(c => c.line === idx);
      lineComments.forEach((lc, cidx) => {
        elements.push(
          <div key={`local-comment-${idx}-${cidx}`} className="inline-local-comment">
            <div className="inline-local-comment-header">
              <span className={`inline-local-comment-badge ${lc.author === 'agent' ? 'agent' : ''}`}>
                {lc.author || 'human'}
              </span>
              <span className="inline-local-comment-time">
                {new Date(lc.createdAt).toLocaleString()}
              </span>
              <button
                className="local-comment-delete"
                onClick={() => deleteLocalComment(lc.id)}
                title="Delete comment"
              >
                ×
              </button>
            </div>
            <div className="inline-local-comment-body">{lc.body}</div>
          </div>
        );
      });
    });

    const handleClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.add-comment-btn');
      if (btn) {
        const lineIdx = parseInt(btn.getAttribute('data-line') || '0', 10);
        setAddingLocalComment({ path: filePath, type: fileType, line: lineIdx });
      }
    };

    return (
      <div className="diff-content-highlighted" onClick={handleClick}>
        {elements}
      </div>
    );
  };

  // Check if there's anything to show
  const hasUncommitted = uncommitted && (
    uncommitted.staged.length > 0 ||
    uncommitted.unstaged.length > 0 ||
    uncommitted.untracked.length > 0
  );
  const hasAnyFiles = files.length > 0 || hasUncommitted;

  // Empty state
  if (!hasAnyFiles) {
    return (
      <div className="files-empty-state">
        <div className="empty-icon">📁</div>
        <div className="empty-title">No changes</div>
        <div className="empty-description">
          Working directory is clean. No uncommitted changes or branch modifications.
        </div>
      </div>
    );
  }

  // Count total files for sidebar header
  const uncommittedCount = (uncommitted?.staged.length || 0) +
    (uncommitted?.unstaged.length || 0) +
    (uncommitted?.untracked.length || 0);
  const totalCount = files.length + uncommittedCount;

  return (
    <div className="files-github-layout">
      {/* Sidebar - file tree */}
      <aside className="files-sidebar">
        <div className="sidebar-header">
          <span>{totalCount} file{totalCount !== 1 ? 's' : ''}{uncommittedCount > 0 && files.length > 0 ? ` (${uncommittedCount} uncommitted)` : ''}</span>
        </div>
        <nav className="sidebar-nav">
          {/* Uncommitted changes section */}
          {uncommitted && (uncommitted.staged.length > 0 || uncommitted.unstaged.length > 0 || uncommitted.untracked.length > 0) && (
            <div className="sidebar-uncommitted">
              <div className="sidebar-section-header">Uncommitted</div>
              {uncommitted.staged.length > 0 && (
                <div className="sidebar-subsection">
                  <div className="sidebar-subsection-header">
                    <span className="status-dot staged"></span>
                    Staged ({uncommitted.staged.length})
                  </div>
                  {uncommitted.staged.map((file, idx) => (
                    <button
                      key={idx}
                      className={`sidebar-uncommitted-file staged ${activeFile === `staged-${file.path}` ? 'active' : ''}`}
                      onClick={() => scrollToFile(`staged-${file.path}`)}
                    >
                      <span className="uncommitted-status">{file.status}</span>
                      <span className="uncommitted-path">{file.path.split('/').pop()}</span>
                    </button>
                  ))}
                </div>
              )}
              {uncommitted.unstaged.length > 0 && (
                <div className="sidebar-subsection">
                  <div className="sidebar-subsection-header">
                    <span className="status-dot unstaged"></span>
                    Modified ({uncommitted.unstaged.length})
                  </div>
                  {uncommitted.unstaged.map((file, idx) => (
                    <button
                      key={idx}
                      className={`sidebar-uncommitted-file unstaged ${activeFile === `unstaged-${file.path}` ? 'active' : ''}`}
                      onClick={() => scrollToFile(`unstaged-${file.path}`)}
                    >
                      <span className="uncommitted-status">{file.status}</span>
                      <span className="uncommitted-path">{file.path.split('/').pop()}</span>
                    </button>
                  ))}
                </div>
              )}
              {uncommitted.untracked.length > 0 && (
                <div className="sidebar-subsection">
                  <div className="sidebar-subsection-header">
                    <span className="status-dot untracked"></span>
                    Untracked ({uncommitted.untracked.length})
                  </div>
                  {uncommitted.untracked.map((file, idx) => (
                    <button
                      key={idx}
                      className={`sidebar-uncommitted-file untracked ${activeFile === `untracked-${file.path}` ? 'active' : ''}`}
                      onClick={() => scrollToFile(`untracked-${file.path}`)}
                    >
                      <span className="uncommitted-status">?</span>
                      <span className="uncommitted-path">{file.path.split('/').pop()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Changed files in branch */}
          {files.length > 0 && (uncommitted?.staged.length || uncommitted?.unstaged.length || uncommitted?.untracked.length) && (
            <div className="sidebar-section-header">Branch Changes</div>
          )}
          {Object.entries(groupedFiles)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dir, dirFiles]) => (
              <div key={dir || 'root'} className="sidebar-group">
                {dir && <div className="sidebar-dir">{dir}</div>}
                {dirFiles.map((file) => {
                  const fileName = file.path.split('/').pop();
                  const fileComments = allCommentsByFile[file.path] || [];
                  const unresolvedCount = fileComments.filter(c => !c.isResolved).length;
                  return (
                    <div key={file.path} className="sidebar-file-group">
                      <button
                        className={`sidebar-file ${activeFile === file.path ? 'active' : ''}`}
                        onClick={() => scrollToFile(file.path)}
                      >
                        <span className="sidebar-file-icon">📄</span>
                        <span className="sidebar-file-name">{fileName}</span>
                        {unresolvedCount > 0 && (
                          <span className="sidebar-badge">{unresolvedCount}</span>
                        )}
                      </button>
                      {fileComments.length > 0 && (
                        <div className="sidebar-comments">
                          {fileComments.map((thread, idx) => (
                            <button
                              key={idx}
                              className={`sidebar-comment ${thread.isResolved ? 'resolved' : ''}`}
                              onClick={() => {
                                scrollToFile(file.path);
                                // Small delay to scroll to comment after file is in view
                                setTimeout(() => {
                                  const el = document.getElementById(`comment-${file.path}-${idx}`);
                                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 100);
                              }}
                            >
                              <span className="sidebar-comment-icon">💬</span>
                              <span className="sidebar-comment-author">{thread.comments[0]?.author}</span>
                              <span className="sidebar-comment-preview">
                                {thread.comments[0]?.body.slice(0, 30)}...
                              </span>
                              {thread.isResolved && <span className="sidebar-resolved-badge">✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
        </nav>
      </aside>

      {/* Main content - all diffs */}
      <main className="files-main">
        {/* Unstaged changes section */}
        {uncommitted && uncommitted.unstaged.length > 0 && (
          <div className="uncommitted-section">
            <div className="section-header unstaged">
              <span className="section-icon">●</span>
              Unstaged Changes ({uncommitted.unstaged.length} files)
            </div>
            {uncommitted.unstaged.map((file) => {
              const key = `unstaged-${file.path}`;
              const isCollapsed = collapsedFiles.has(key);
              const language = getLanguage(file.path);

              const fileLocalComments = localCommentsByFile[key] || [];

              return (
                <div
                  key={key}
                  ref={(el) => { fileRefs.current[key] = el; }}
                  data-path={key}
                  className="file-diff-card uncommitted-card"
                >
                  <div className="file-diff-header" onClick={() => toggleFile(key)}>
                    <span className="file-collapse-icon">{isCollapsed ? '▶' : '▼'}</span>
                    <span className="uncommitted-badge unstaged">{file.status}</span>
                    <span className="file-diff-path">{file.path}</span>
                    {fileLocalComments.length > 0 && (
                      <span className="file-comment-count">💬 {fileLocalComments.length}</span>
                    )}
                  </div>
                  {!isCollapsed && file.diff && renderDiffWithLocalComments(file.diff, language, file.path, 'unstaged')}
                  {!isCollapsed && !file.diff && (
                    <div className="file-diff-empty">No diff available</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Staged changes section */}
        {uncommitted && uncommitted.staged.length > 0 && (
          <div className="uncommitted-section">
            <div className="section-header staged">
              <span className="section-icon">✓</span>
              Staged Changes ({uncommitted.staged.length} files)
            </div>
            {uncommitted.staged.map((file) => {
              const key = `staged-${file.path}`;
              const isCollapsed = collapsedFiles.has(key);
              const language = getLanguage(file.path);
              const fileLocalComments = localCommentsByFile[key] || [];

              return (
                <div
                  key={key}
                  ref={(el) => { fileRefs.current[key] = el; }}
                  data-path={key}
                  className="file-diff-card uncommitted-card staged"
                >
                  <div className="file-diff-header" onClick={() => toggleFile(key)}>
                    <span className="file-collapse-icon">{isCollapsed ? '▶' : '▼'}</span>
                    <span className="uncommitted-badge staged">{file.status}</span>
                    <span className="file-diff-path">{file.path}</span>
                    {fileLocalComments.length > 0 && (
                      <span className="file-comment-count">💬 {fileLocalComments.length}</span>
                    )}
                  </div>
                  {!isCollapsed && file.diff && renderDiffWithLocalComments(file.diff, language, file.path, 'staged')}
                  {!isCollapsed && !file.diff && (
                    <div className="file-diff-empty">No diff available</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Untracked files section */}
        {uncommitted && uncommitted.untracked.length > 0 && (
          <div className="uncommitted-section">
            <div className="section-header untracked">
              <span className="section-icon">?</span>
              Untracked Files ({uncommitted.untracked.length} files)
            </div>
            {uncommitted.untracked.map((file) => {
              const key = `untracked-${file.path}`;
              const isCollapsed = collapsedFiles.has(key);
              const fileLocalComments = localCommentsByFile[key] || [];

              return (
                <div
                  key={key}
                  ref={(el) => { fileRefs.current[key] = el; }}
                  data-path={key}
                  className="file-diff-card uncommitted-card untracked"
                >
                  <div className="file-diff-header" onClick={() => toggleFile(key)}>
                    <span className="file-collapse-icon">{isCollapsed ? '▶' : '▼'}</span>
                    <span className="uncommitted-badge untracked">?</span>
                    <span className="file-diff-path">{file.path}</span>
                    {fileLocalComments.length > 0 && (
                      <span className="file-comment-count">💬 {fileLocalComments.length}</span>
                    )}
                  </div>
                  {!isCollapsed && (
                    <div className="file-diff-empty">New file (not yet tracked)</div>
                  )}
                  {!isCollapsed && (
                    <div className="local-comments-section">
                      {fileLocalComments.map((lc) => (
                        <div key={lc.id} className="local-comment">
                          <div className="local-comment-header">
                            <span className="local-comment-time">
                              {new Date(lc.createdAt).toLocaleString()}
                            </span>
                            <button
                              className="local-comment-delete"
                              onClick={() => deleteLocalComment(lc.id)}
                              title="Delete comment"
                            >
                              ×
                            </button>
                          </div>
                          <div className="local-comment-body">{lc.body}</div>
                        </div>
                      ))}
                      {addingLocalComment?.path === file.path && addingLocalComment?.type === 'untracked' ? (
                        <div className="local-comment-form">
                          <textarea
                            value={localCommentText}
                            onChange={(e) => setLocalCommentText(e.target.value)}
                            placeholder="Add a comment..."
                            rows={3}
                            autoFocus
                          />
                          <div className="local-comment-form-actions">
                            <button
                              className="btn-cancel"
                              onClick={() => { setAddingLocalComment(null); setLocalCommentText(''); }}
                            >
                              Cancel
                            </button>
                            <button
                              className="btn-submit"
                              disabled={!localCommentText.trim() || submittingLocal}
                              onClick={() => addLocalComment(file.path, 'untracked')}
                            >
                              {submittingLocal ? 'Adding...' : 'Add Comment'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="btn-add-local-comment"
                          onClick={() => setAddingLocalComment({ path: file.path, type: 'untracked' })}
                        >
                          + Add Comment
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Branch changes section */}
        {files.length > 0 && (
          <div className="branch-section">
            {(uncommitted?.unstaged.length || uncommitted?.staged.length || uncommitted?.untracked.length) ? (
              <div className="section-header branch">
                <span className="section-icon">⎇</span>
                Branch Changes ({files.length} files)
              </div>
            ) : null}
            {files.map((file) => {
              const isCollapsed = collapsedFiles.has(file.path);
              const language = getLanguage(file.path);
              const fileCommentCount = commentsByFile[file.path]?.length || 0;
              const key = `branch-${file.path}`;
              const fileLocalComments = localCommentsByFile[key] || [];
              const totalComments = fileCommentCount + fileLocalComments.length;

              return (
                <div
                  key={file.path}
                  ref={(el) => { fileRefs.current[file.path] = el; }}
                  data-path={file.path}
                  className="file-diff-card"
                >
                  {/* File header */}
                  <div className="file-diff-header" onClick={() => toggleFile(file.path)}>
                    <span className="file-collapse-icon">{isCollapsed ? '▶' : '▼'}</span>
                    <span className="file-diff-path">{file.path}</span>
                    {totalComments > 0 && (
                      <span className="file-comment-count">
                        💬 {totalComments}
                        {fileLocalComments.length > 0 && <span className="local-badge">({fileLocalComments.length} local)</span>}
                      </span>
                    )}
                    <span className="file-diff-stats">
                      <span className="add">+{file.add}</span>
                      <span className="del">-{file.del}</span>
                    </span>
                  </div>

                  {/* Diff content with inline comments */}
                  {!isCollapsed && renderDiffWithComments(file, language)}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
