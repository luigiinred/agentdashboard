import React, { useState, useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { FileInfo, CommentThread } from '../types';

interface FilesProps {
  files: FileInfo[];
  commentCounts: Record<string, number>;
  comments: CommentThread[];
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

interface InlineCommentProps {
  thread: CommentThread;
  defaultCollapsed: boolean;
}

function InlineComment({ thread, defaultCollapsed }: InlineCommentProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');

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
              <div className="inline-comment-text">{comment.body}</div>
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
                    <button className="btn-submit" disabled={!replyText.trim()}>
                      Reply
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn-reply" onClick={() => setReplying(true)}>
                  Reply
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Files({ files, comments }: FilesProps) {
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [addingComment, setAddingComment] = useState<{ path: string; line: number } | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Group comments by file path
  const commentsByFile = comments.reduce((acc, thread) => {
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
            onClick={() => setAddingComment({ path: file.path, line: idx })}
            title="Add comment"
          >
            +
          </button>
        </div>
      );

      // Add inline comment form if user is adding a comment on this line
      if (addingComment?.path === file.path && addingComment?.line === idx) {
        elements.push(
          <div key={`add-comment-${idx}`} className="inline-comment-form">
            <textarea
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder="Write a comment..."
              rows={3}
              autoFocus
            />
            <div className="inline-comment-form-actions">
              <button
                className="btn-cancel"
                onClick={() => { setAddingComment(null); setNewCommentText(''); }}
              >
                Cancel
              </button>
              <button className="btn-submit" disabled={!newCommentText.trim()}>
                Add comment
              </button>
            </div>
          </div>
        );
      }

      // Check if there are comments that should appear after this line
      // (simplified: show all comments for this file after line 5 for demo)
      // In reality, you'd parse the diffHunk to find the exact line
    });

    // Add all comments at the end of the file for now
    // TODO: Parse diffHunk to position comments at correct lines
    if (fileComments.length > 0) {
      elements.push(
        <div key="comments-section" className="file-comments-section">
          <div className="file-comments-header">
            <span>💬 {fileComments.length} comment{fileComments.length > 1 ? 's' : ''}</span>
          </div>
          {fileComments.map((thread, tidx) => (
            <InlineComment
              key={tidx}
              thread={thread}
              defaultCollapsed={thread.isResolved}
            />
          ))}
        </div>
      );
    }

    return <div className="diff-content-highlighted">{elements}</div>;
  };

  return (
    <div className="files-github-layout">
      {/* Sidebar - file tree */}
      <aside className="files-sidebar">
        <div className="sidebar-header">
          <span>{files.length} files changed</span>
        </div>
        <nav className="sidebar-nav">
          {Object.entries(groupedFiles)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dir, dirFiles]) => (
              <div key={dir || 'root'} className="sidebar-group">
                {dir && <div className="sidebar-dir">{dir}</div>}
                {dirFiles.map((file) => {
                  const fileName = file.path.split('/').pop();
                  const hasComments = (commentsByFile[file.path]?.length || 0) > 0;
                  return (
                    <button
                      key={file.path}
                      className={`sidebar-file ${activeFile === file.path ? 'active' : ''}`}
                      onClick={() => scrollToFile(file.path)}
                    >
                      <span className="sidebar-file-icon">📄</span>
                      <span className="sidebar-file-name">{fileName}</span>
                      {hasComments && (
                        <span className="sidebar-badge">💬 {commentsByFile[file.path].length}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
        </nav>
      </aside>

      {/* Main content - all diffs */}
      <main className="files-main">
        {files.map((file) => {
          const isCollapsed = collapsedFiles.has(file.path);
          const language = getLanguage(file.path);
          const fileCommentCount = commentsByFile[file.path]?.length || 0;

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
                {fileCommentCount > 0 && (
                  <span className="file-comment-count">💬 {fileCommentCount}</span>
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
      </main>
    </div>
  );
}
