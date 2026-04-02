import { useState } from 'react';
import type { LocalComment } from '../types';

interface LocalCommentsProps {
  target: string;
  comments: LocalComment[];
  title?: string;
}

export function LocalComments({ target, comments, title = 'Comments' }: LocalCommentsProps) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter comments for this target
  const targetComments = comments.filter(c => c.target === target);

  const addComment = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/local-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          body: text,
          author: 'human',
        }),
      });
      if (res.ok) {
        setText('');
        setAdding(false);
      }
    } catch (e) {
      alert('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (id: string) => {
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

  return (
    <div className="local-comments-panel">
      <div className="local-comments-panel-header">
        <span>{title}</span>
        {targetComments.length > 0 && (
          <span className="local-comments-count">{targetComments.length}</span>
        )}
      </div>

      <div className="local-comments-list">
        {targetComments.length === 0 && !adding && (
          <div className="local-comments-empty">No comments yet</div>
        )}

        {targetComments.map((comment) => (
          <div key={comment.id} className="local-comment-item">
            <div className="local-comment-item-header">
              <span className={`comment-author-badge ${comment.author === 'agent' ? 'agent' : ''}`}>
                {comment.author || 'human'}
              </span>
              <span className="comment-time">
                {new Date(comment.createdAt).toLocaleString()}
              </span>
              <button
                className="comment-delete-btn"
                onClick={() => deleteComment(comment.id)}
                title="Delete"
              >
                ×
              </button>
            </div>
            <div className="local-comment-item-body">{comment.body}</div>
          </div>
        ))}

        {adding ? (
          <div className="local-comment-form">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a comment..."
              rows={3}
              autoFocus
            />
            <div className="local-comment-form-buttons">
              <button className="btn-cancel" onClick={() => { setAdding(false); setText(''); }}>
                Cancel
              </button>
              <button
                className="btn-submit"
                disabled={!text.trim() || submitting}
                onClick={addComment}
              >
                {submitting ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-add-comment" onClick={() => setAdding(true)}>
            + Add Comment
          </button>
        )}
      </div>
    </div>
  );
}
