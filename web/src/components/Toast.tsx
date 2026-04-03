import { useState } from 'react';

export interface ToastMessage {
  id: string;
  type: 'agent-comment' | 'github-comment';
  title: string;
  body: string;
  onClick?: () => void;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastProps) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  const handleClick = () => {
    if (toast.onClick) {
      toast.onClick();
      handleDismiss();
    }
  };

  return (
    <div
      className={`toast toast-${toast.type} ${exiting ? 'toast-exit' : ''}`}
      onClick={handleClick}
    >
      <div className="toast-content">
        <div className="toast-icon">
          {toast.type === 'agent-comment' ? '🤖' : '💬'}
        </div>
        <div className="toast-text">
          <div className="toast-title">{toast.title}</div>
          <div className="toast-body">{toast.body}</div>
        </div>
      </div>
      <button
        className="toast-close"
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss();
        }}
      >
        ×
      </button>
    </div>
  );
}
