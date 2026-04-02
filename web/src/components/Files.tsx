import { useState, useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { FileInfo } from '../types';

interface FilesProps {
  files: FileInfo[];
  commentCounts: Record<string, number>;
}

// Map file extensions to Prism language names
function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    swift: 'swift',
    kt: 'kotlin',
    java: 'java',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'markup',
    xml: 'markup',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    graphql: 'graphql',
    gql: 'graphql',
  };
  return langMap[ext] || 'text';
}

// Custom style based on GitHub dark theme
const diffStyle: Record<string, React.CSSProperties> = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    margin: 0,
    padding: 0,
    background: 'transparent',
    fontSize: '12px',
    lineHeight: '20px',
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: 'transparent',
    fontSize: '12px',
  },
};

export function Files({ files, commentCounts }: FilesProps) {
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  const renderDiffWithHighlighting = (diff: string, language: string) => {
    const lines = diff.split('\n');

    return (
      <div className="diff-content-highlighted">
        {lines.map((line, idx) => {
          let lineClass = '';
          let prefix = ' ';
          let content = line;

          if (line.startsWith('+++') || line.startsWith('---')) {
            lineClass = 'meta';
            content = line;
          } else if (line.startsWith('+')) {
            lineClass = 'add';
            prefix = '+';
            content = line.slice(1);
          } else if (line.startsWith('-')) {
            lineClass = 'del';
            prefix = '-';
            content = line.slice(1);
          } else if (line.startsWith('@@')) {
            lineClass = 'hunk';
            content = line;
          } else if (line.startsWith(' ')) {
            content = line.slice(1);
          }

          return (
            <div key={idx} className={`diff-line ${lineClass}`}>
              <span className="diff-line-num">{idx + 1}</span>
              <span className="diff-line-prefix">{prefix}</span>
              <span className="diff-line-code">
                {lineClass === 'hunk' || lineClass === 'meta' ? (
                  <span className="hunk-text">{content}</span>
                ) : (
                  <SyntaxHighlighter
                    language={language}
                    style={diffStyle}
                    customStyle={{
                      display: 'inline',
                      padding: 0,
                      margin: 0,
                      background: 'transparent',
                    }}
                    codeTagProps={{
                      style: {
                        display: 'inline',
                        background: 'transparent',
                      }
                    }}
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
                  return (
                    <button
                      key={file.path}
                      className={`sidebar-file ${activeFile === file.path ? 'active' : ''}`}
                      onClick={() => scrollToFile(file.path)}
                    >
                      <span className="sidebar-file-icon">📄</span>
                      <span className="sidebar-file-name">{fileName}</span>
                      {commentCounts[file.path] && (
                        <span className="sidebar-badge">{commentCounts[file.path]}</span>
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
                <span className="file-diff-stats">
                  <span className="add">+{file.add}</span>
                  <span className="del">-{file.del}</span>
                </span>
              </div>

              {/* Diff content with syntax highlighting */}
              {!isCollapsed && file.diff && renderDiffWithHighlighting(file.diff, language)}

              {!isCollapsed && !file.diff && (
                <div className="file-diff-empty">No diff available</div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
