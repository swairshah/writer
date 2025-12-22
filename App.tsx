import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import { marked } from "marked";
import DOMPurify from "dompurify";
import morphdom from "morphdom";
import "./styles.css";

function Preview({ html }: { html: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current) {
      const template = document.createElement("article");
      template.className = "article-content";
      template.innerHTML = DOMPurify.sanitize(html);
      morphdom(ref.current, template, {
        onBeforeElUpdated: (fromEl, toEl) => {
          if (fromEl.isEqualNode(toEl)) return false;
          return true;
        },
      });
    }
  }, [html]);

  return <article ref={ref} className="article-content" />;
}

const defaultMarkdown = `# Article Title Here

*January 15, 2025*

Start your article content here. This is the main paragraph where you introduce your topic and engage your readers with compelling text.

You can write multiple paragraphs to develop your ideas. The typography is designed to be elegant and readable, inspired by clean design systems.

## Section Heading

Continue with more detailed content under section headings. The fonts used are:

- Lora for body text (serif)
- Inter for interface elements (sans-serif)
- Unica One for headings (display)

> This is a highlighted notice box. You can use it for important information, blockquotes, or special callouts.

You can use inline code like \`const x = 42\` within your text.

\`\`\`javascript
// Code block example
function greet(name) {
    return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

## Another Section

The design uses a clean two-column layout. The color palette is minimal with warm off-whites and black text for maximum readability.

![Placeholder image](https://via.placeholder.com/600x400)
*This is an image caption describing your image*

The layout is fully responsive and will adapt to different screen sizes.
`;

marked.setOptions({
  gfm: true,
  breaks: true,
});

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const SaveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const FolderIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

type Post = {
  filename: string;
  name: string;
  date: string;
};

function App() {
  const [markdown, setMarkdown] = useState(defaultMarkdown);
  const [html, setHtml] = useState(() => {
    const rendered = marked(defaultMarkdown) as string;
    return DOMPurify.sanitize(rendered);
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentFilename, setCurrentFilename] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  // Load most recent post on startup
  useEffect(() => {
    const loadMostRecent = async () => {
      try {
        const response = await fetch('/api/posts');
        const posts = await response.json();
        if (posts.length > 0) {
          const mostRecent = posts[0];
          const contentResponse = await fetch(`/api/load/${encodeURIComponent(mostRecent.filename)}`);
          const data = await contentResponse.json();
          if (data.content) {
            setMarkdown(data.content);
            setCurrentFilename(mostRecent.filename);
          }
        }
      } catch (error) {
        // Keep default if no posts
      }
    };
    loadMostRecent();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleSave = async () => {
    if (saveStatus === 'saving') return;

    const title = markdown.match(/^#\s+(.+)$/m)?.[1] || 'untitled';
    const filename = title.toLowerCase().replace(/\s+/g, '-');

    setSaveStatus('saving');

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          markdown,
          html,
          existingFilename: currentFilename
        }),
      });

      const result = await response.json();
      if (result.success) {
        setCurrentFilename(result.filename);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  useEffect(() => {
    const rendered = marked(markdown) as string;
    setHtml(rendered);
  }, [markdown]);

  const openLoadModal = async () => {
    try {
      const response = await fetch('/api/posts');
      const data = await response.json();
      setPosts(data);
      setShowLoadModal(true);
    } catch (error) {
      console.error('Failed to load posts:', error);
    }
  };

  const handleNewPost = () => {
    setMarkdown(defaultMarkdown);
    setCurrentFilename(null);
  };

  const loadPost = async (filename: string) => {
    try {
      const response = await fetch(`/api/load/${encodeURIComponent(filename)}`);
      const data = await response.json();
      if (data.content) {
        setMarkdown(data.content);
        setCurrentFilename(filename);
        setShowLoadModal(false);
      }
    } catch (error) {
      console.error('Failed to load post:', error);
    }
  };

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMarkdown(e.target.value);
  }, []);

  const handleEditorScroll = useCallback(() => {
    if (isScrolling.current) return;
    const editor = editorRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;

    isScrolling.current = true;
    const scrollRatio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
    preview.scrollTop = scrollRatio * (preview.scrollHeight - preview.clientHeight);
    requestAnimationFrame(() => {
      isScrolling.current = false;
    });
  }, []);

  return (
    <div className="app-container">
      {/* Header */}
      <motion.header
        className="app-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="header-left">
          <motion.div
            className="logo-mark"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          />
          <h1>WRITER</h1>
        </div>
        <div className="header-actions">
          <motion.button
            className="header-button"
            onClick={handleNewPost}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            aria-label="New post"
          >
            <PlusIcon />
          </motion.button>
          <motion.button
            className="header-button"
            onClick={openLoadModal}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            aria-label="Load post"
          >
            <FolderIcon />
          </motion.button>
          <motion.button
            className={`header-button ${saveStatus === 'saved' ? 'save-success' : ''} ${saveStatus === 'error' ? 'save-error' : ''}`}
            onClick={handleSave}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            animate={saveStatus === 'saving' ? { rotate: 360 } : { rotate: 0 }}
            transition={{ duration: saveStatus === 'saving' ? 0.8 : 0.2, repeat: saveStatus === 'saving' ? Infinity : 0, ease: 'linear' }}
            aria-label="Save"
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saved' ? <CheckIcon /> : <SaveIcon />}
          </motion.button>
          <motion.button
            className="header-button"
            onClick={toggleTheme}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </motion.button>
        </div>
      </motion.header>

      {/* Main Content */}
      <div className="panels-container">
        {/* Preview Panel - Left */}
        <motion.div
          className="panel preview-panel"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div
            className="preview-content"
            ref={previewRef}
          >
            <Preview html={html} />
          </div>
        </motion.div>

        {/* Divider */}
        <motion.div
          className="panel-divider"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <div className="divider-accent" />
        </motion.div>

        {/* Editor Panel - Right */}
        <motion.div
          className="panel editor-panel"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <textarea
            ref={editorRef}
            className="editor-textarea"
            value={markdown}
            onChange={handleChange}
            onScroll={handleEditorScroll}
            placeholder="Write your markdown here..."
            spellCheck={false}
          />
        </motion.div>
      </div>

      {/* Load Modal */}
      {showLoadModal && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowLoadModal(false)}
        >
          <motion.div
            className="modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>LOAD POST</h2>
              <button className="modal-close" onClick={() => setShowLoadModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-content">
              {posts.length === 0 ? (
                <p className="modal-empty">No saved posts yet</p>
              ) : (
                <ul className="post-list">
                  {posts.map((post) => (
                    <motion.li
                      key={post.filename}
                      className="post-item"
                      onClick={() => loadPost(post.filename)}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="post-name">{post.name}</span>
                      <span className="post-date">{post.date}</span>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
