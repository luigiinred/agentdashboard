import { useState } from 'react';
import type { CommentThread } from '../types';

interface CommentsProps {
  comments: CommentThread[];
}

export function Comments({ comments }: CommentsProps) {
  // Start with resolved threads collapsed
  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    comments.forEach((thread, idx) => {
      if (thread.isResolved) initial.add(idx);
    });
    return initial;
  });

  const toggleThread = (idx: number) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
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
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
      // Line breaks
      .replace(/\n/g, '<br>');

    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  if (comments.length === 0) {
    return <div className="no-comments">No comments</div>;
  }

  return (
    <div className="comments">
      {comments.map((thread, idx) => (
        <div key={idx} className="comment-thread">
          <div
            className="thread-header"
            onClick={() => toggleThread(idx)}
          >
            <span className="thread-icon">
              {collapsed.has(idx) ? '▶' : '▼'}
            </span>
            <span className="thread-path">{thread.path}</span>
            {thread.isResolved && (
              <span className="thread-status resolved">Resolved</span>
            )}
            {thread.isOutdated && (
              <span className="thread-status outdated">Outdated</span>
            )}
          </div>
          <div className={`thread-content ${collapsed.has(idx) ? 'collapsed' : ''}`}>
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
          </div>
        </div>
      ))}
    </div>
  );
}
