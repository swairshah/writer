import index from "./index.html";
import { mkdir, readdir } from "node:fs/promises";
import { marked } from "marked";

const MARKDOWN_DIR = "./markdown";
const HTML_DIR = "./posts";
const blogCss = await Bun.file("./blog.css").text();

const themeToggleScript = `
<script>
(function() {
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored || (prefersDark ? 'dark' : 'light');
  document.documentElement.classList.add(theme);

  window.toggleTheme = function() {
    const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.remove(current);
    document.documentElement.classList.add(next);
    localStorage.setItem('theme', next);
    updateIcon(next);
  };

  window.updateIcon = function(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.innerHTML = theme === 'dark'
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
  };

  document.addEventListener('DOMContentLoaded', function() {
    updateIcon(theme);
  });
})();
</script>`;

const themeToggleButton = `<button id="theme-toggle" class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme"></button>`;

const themeToggleStyles = `
.theme-toggle {
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    color: #1a1a1a;
    opacity: 0.6;
    transition: opacity 0.2s;
    z-index: 100;
}
.theme-toggle:hover { opacity: 1; }
html.dark .theme-toggle { color: #f0f0ed; }
`;

await mkdir(MARKDOWN_DIR, { recursive: true });
await mkdir(HTML_DIR, { recursive: true });

Bun.serve({
  port: 3000,
  hostname: "0.0.0.0",
  routes: {
    "/": index,
    "/about": {
      GET: async () => {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Swair Shah / ABOUT</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&family=Lora:wght@400;500;600;700&family=Google+Sans+Mono&family=Inter:wght@400;500;600&family=Unica+One&display=swap" rel="stylesheet">
    ${themeToggleScript}
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Lora', serif;
            font-size: 18px;
            line-height: 1.8;
            color: #1a1a1a;
            background-color: #fafaf8;
            padding: 3rem 2rem;
            transition: background-color 0.3s, color 0.3s;
        }
        .container { max-width: 650px; margin: 0 auto; }
        header { margin-bottom: 2.5rem; }
        header h1 {
            font-family: 'Unica One', cursive;
            font-size: 2.5rem;
            font-weight: 400;
            text-transform: uppercase;
            letter-spacing: 3px;
            margin-bottom: 1rem;
        }
        .social-icons {
            display: flex;
            gap: 1.25rem;
            margin-bottom: 0.5rem;
        }
        .social-icons a {
            color: #1a1a1a;
            transition: opacity 0.2s, color 0.3s;
        }
        .social-icons a:hover { opacity: 0.6; }
        .social-icons svg { width: 24px; height: 24px; }
        .bio { margin-bottom: 2rem; font-size: 1.1rem; }
        .nav-links {
            margin-top: 3rem;
            font-family: 'Inter', sans-serif;
            font-size: 0.9rem;
        }
        .nav-links a {
            color: #999;
            text-decoration: none;
            transition: color 0.2s;
        }
        .nav-links a:hover { color: #1a1a1a; }
        .nav-top { max-width: 650px; margin: 0 auto 1rem auto; }
        ${themeToggleStyles}
        html.dark body { background-color: #1a1a1a; color: #f0f0ed; }
        html.dark header h1 { color: #f0f0ed; }
        html.dark .social-icons a { color: #f0f0ed; }
        html.dark .nav-links a:hover { color: #f0f0ed; }
    </style>
</head>
<body>
    ${themeToggleButton}
    <div class="nav-links nav-top">
        <a href="/blog">Blog</a>
    </div>
    <div class="container">
        <header>
            <h1>Swair Shah / About</h1>
            <div class="social-icons">
                <a href="https://github.com/swairshah" target="_blank" title="GitHub">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
                <a href="https://scholar.google.com/citations?user=JQnEXo4AAAAJ&hl=en" target="_blank" title="Google Scholar">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/></svg>
                </a>
                <a href="https://instagram.com/swair_shah" target="_blank" title="Instagram">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                </a>
            </div>
        </header>
        <p class="bio">I am a computer scientist studying machine learning and artificial intelligence. I have deep interest in paintings, history and popular mathematics.</p>
        <div class="nav-links">
            <a href="/blog">Blog</a>
        </div>
    </div>
</body>
</html>`;
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      },
    },
    "/cv": {
      GET: async () => {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Swair Shah / CV</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&family=Lora:wght@400;500;600;700&family=Google+Sans+Mono&family=Inter:wght@400;500;600&family=Unica+One&display=swap" rel="stylesheet">
    ${themeToggleScript}
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Lora', serif;
            font-size: 18px;
            line-height: 1.8;
            color: #1a1a1a;
            background-color: #fafaf8;
            padding: 3rem 2rem;
            transition: background-color 0.3s, color 0.3s;
        }
        .container { max-width: 650px; margin: 0 auto; }
        header { margin-bottom: 2.5rem; }
        header h1 {
            font-family: 'Unica One', cursive;
            font-size: 2.5rem;
            font-weight: 400;
            text-transform: uppercase;
            letter-spacing: 3px;
            margin-bottom: 1rem;
        }
        .social-icons {
            display: flex;
            gap: 1.25rem;
            margin-bottom: 0.5rem;
        }
        .social-icons a {
            color: #1a1a1a;
            transition: opacity 0.2s, color 0.3s;
        }
        .social-icons a:hover { opacity: 0.6; }
        .social-icons svg { width: 24px; height: 24px; }
        .content { margin-bottom: 2rem; color: #666; font-style: italic; }
        .nav-links {
            margin-top: 3rem;
            font-family: 'Inter', sans-serif;
            font-size: 0.9rem;
        }
        .nav-links a {
            color: #999;
            text-decoration: none;
            transition: color 0.2s;
        }
        .nav-links a:hover { color: #1a1a1a; }
        ${themeToggleStyles}
        html.dark body { background-color: #1a1a1a; color: #f0f0ed; }
        html.dark header h1 { color: #f0f0ed; }
        html.dark .social-icons a { color: #f0f0ed; }
        html.dark .content { color: #888; }
        html.dark .nav-links a:hover { color: #f0f0ed; }
    </style>
</head>
<body>
    ${themeToggleButton}
    <div class="container">
        <header>
            <h1>Swair Shah / CV</h1>
            <div class="social-icons">
                <a href="https://github.com/swairshah" target="_blank" title="GitHub">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
                <a href="https://scholar.google.com/citations?user=JQnEXo4AAAAJ&hl=en" target="_blank" title="Google Scholar">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/></svg>
                </a>
                <a href="https://instagram.com/swair_shah" target="_blank" title="Instagram">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                </a>
            </div>
        </header>
        <p class="content">Coming soon...</p>
        <div class="nav-links">
            <a href="/blog">Blog</a> &nbsp;&middot;&nbsp; <a href="/about">About</a>
        </div>
    </div>
</body>
</html>`;
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      },
    },
    "/blog": {
      GET: async () => {
        const files = await readdir(MARKDOWN_DIR);
        const posts = await Promise.all(
          files
            .filter(f => f.endsWith('.md'))
            .map(async (f) => {
              const content = await Bun.file(`${MARKDOWN_DIR}/${f}`).text();
              const title = content.match(/^#\s+(.+)$/m)?.[1] || f.replace('.md', '');
              const date = f.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
              const slug = f.replace('.md', '');
              // Get first paragraph as excerpt
              const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('*'));
              const excerpt = lines[0]?.slice(0, 200) || '';
              return { title, date, slug, excerpt };
            })
        );
        posts.sort((a, b) => b.date.localeCompare(a.date));

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Swair Shah / BLOG</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&family=Lora:wght@400;500;600;700&family=Google+Sans+Mono&family=Inter:wght@400;500;600&family=Unica+One&display=swap" rel="stylesheet">
    ${themeToggleScript}
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Lora', serif;
            font-size: 18px;
            line-height: 1.6;
            color: #1a1a1a;
            background-color: #fafaf8;
            padding: 3rem 2rem;
            transition: background-color 0.3s, color 0.3s;
        }
        .container { max-width: 750px; margin: 0 auto; }
        header { margin-bottom: 3rem; }
        header h1 {
            font-family: 'Unica One', cursive;
            font-size: 2.5rem;
            font-weight: 400;
            text-transform: uppercase;
            letter-spacing: 3px;
            margin-bottom: 1rem;
        }
        .social-icons {
            display: flex;
            gap: 1.25rem;
            margin-bottom: 0.5rem;
        }
        .social-icons a {
            color: #1a1a1a;
            transition: opacity 0.2s, color 0.3s;
        }
        .social-icons a:hover { opacity: 0.6; }
        .social-icons svg { width: 24px; height: 24px; }
        .post-list { list-style: none; }
        .post-entry {
            padding: 1.5rem 0;
            border-bottom: 1px solid #e5e5e5;
            transition: transform 0.2s, border-color 0.3s;
        }
        .post-entry:hover { transform: translateX(4px); }
        .post-entry:last-child { border-bottom: none; }
        .post-entry a { text-decoration: none; color: inherit; display: block; }
        .post-title {
            font-family: 'Unica One', cursive;
            font-size: 1.6rem;
            font-weight: 400;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 0.25rem;
            color: #1a1a1a;
            transition: color 0.3s;
        }
        .post-date {
            font-family: 'Google Sans Mono', monospace;
            font-size: 0.8rem;
            color: #999;
            margin-bottom: 0.5rem;
        }
        .post-excerpt {
            font-family: 'Lora', serif;
            font-size: 0.95rem;
            color: #666;
            line-height: 1.5;
            transition: color 0.3s;
        }
        .empty-state {
            text-align: center;
            padding: 4rem 2rem;
            color: #999;
            font-family: 'Inter', sans-serif;
        }
        .nav-links {
            margin-top: 3rem;
            font-family: 'Inter', sans-serif;
            font-size: 0.9rem;
        }
        .nav-links a {
            color: #999;
            text-decoration: none;
            transition: color 0.2s;
        }
        .nav-links a:hover { color: #1a1a1a; }
        .nav-top { max-width: 750px; margin: 0 auto 1rem auto; }
        ${themeToggleStyles}
        html.dark body { background-color: #1a1a1a; color: #f0f0ed; }
        html.dark header h1 { color: #f0f0ed; }
        html.dark .social-icons a { color: #f0f0ed; }
        html.dark .post-title { color: #f0f0ed; }
        html.dark .post-entry { border-bottom-color: #333; }
        html.dark .post-excerpt { color: #999; }
        html.dark .nav-links a:hover { color: #f0f0ed; }
    </style>
</head>
<body>
    ${themeToggleButton}
    <div class="nav-links nav-top">
        <a href="/about">About</a>
    </div>
    <div class="container">
        <header>
            <h1>Swair Shah / Blog</h1>
            <div class="social-icons">
                <a href="https://github.com/swairshah" target="_blank" title="GitHub">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
                <a href="https://scholar.google.com/citations?user=JQnEXo4AAAAJ&hl=en" target="_blank" title="Google Scholar">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/></svg>
                </a>
                <a href="https://instagram.com/swair_shah" target="_blank" title="Instagram">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                </a>
            </div>
        </header>
        ${posts.length === 0 ? `
            <div class="empty-state">
                <p>No posts yet. Start writing!</p>
            </div>
        ` : `
            <ul class="post-list">
                ${posts.map(post => `
                    <li class="post-entry">
                        <a href="/blog/${post.slug}">
                            <h2 class="post-title">${post.title}</h2>
                            <div class="post-date">${post.date}</div>
                            <p class="post-excerpt">${post.excerpt}${post.excerpt.length >= 200 ? '...' : ''}</p>
                        </a>
                    </li>
                `).join('')}
            </ul>
        `}
        <div class="nav-links">
            <a href="/about">About</a>
        </div>
    </div>
</body>
</html>`;
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      },
    },
    "/blog/:slug": {
      GET: async (req) => {
        try {
          const slug = req.params.slug;
          const content = await Bun.file(`${MARKDOWN_DIR}/${slug}.md`).text();
          const title = content.match(/^#\s+(.+)$/m)?.[1] || slug;
          const date = slug.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
          const htmlContent = await marked(content);

          const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Swair Shah / ${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&family=Lora:wght@400;500;600;700&family=Google+Sans+Mono&family=Inter:wght@400;500;600&family=Unica+One&display=swap" rel="stylesheet">
    ${themeToggleScript}
    <style>${blogCss}${themeToggleStyles}.nav-top { max-width: 750px; margin: 0 auto 1rem auto; }</style>
</head>
<body>
    ${themeToggleButton}
    <div class="nav-links nav-top">
        <a href="/blog">Blog</a> &nbsp;&middot;&nbsp; <a href="/about">About</a>
    </div>
    <div class="container">
        <header>
            <h1>${title}</h1>
            <div class="meta">${date}</div>
        </header>
        <article>${htmlContent}</article>
        <div class="nav-links">
            <a href="/blog">Blog</a> &nbsp;&middot;&nbsp; <a href="/about">About</a>
        </div>
    </div>
</body>
</html>`;
          return new Response(html, { headers: { "Content-Type": "text/html" } });
        } catch (error) {
          return new Response("Post not found", { status: 404 });
        }
      },
    },
    "/api/posts": {
      GET: async () => {
        try {
          const files = await readdir(MARKDOWN_DIR);
          const posts = await Promise.all(
            files
              .filter(f => f.endsWith('.md'))
              .map(async (f) => {
                const content = await Bun.file(`${MARKDOWN_DIR}/${f}`).text();
                const title = content.match(/^#\s+(.+)$/m)?.[1] || f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '').replace(/-/g, ' ');
                return {
                  filename: f,
                  name: title,
                  date: f.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '',
                };
              })
          );
          posts.sort((a, b) => b.date.localeCompare(a.date));

          return new Response(JSON.stringify(posts), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
    "/api/load/:filename": {
      GET: async (req) => {
        try {
          const filename = req.params.filename;
          const content = await Bun.file(`${MARKDOWN_DIR}/${filename}`).text();
          return new Response(JSON.stringify({ content }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
    "/api/save": {
      POST: async (req) => {
        try {
          const { filename, markdown, html, existingFilename } = await req.json();

          if (!filename) {
            return new Response(JSON.stringify({ error: "Filename required" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          let baseName: string;

          if (existingFilename) {
            // Editing existing post - use the existing filename (without .md extension)
            baseName = existingFilename.replace('.md', '');
          } else {
            // Creating new post - generate new filename with today's date
            const safeName = filename.replace(/[^a-zA-Z0-9-_]/g, "-");
            const timestamp = new Date().toISOString().split("T")[0];
            baseName = `${timestamp}-${safeName}`;
          }

          await Bun.write(`${MARKDOWN_DIR}/${baseName}.md`, markdown);
          await Bun.write(`${HTML_DIR}/${baseName}.html`, html);

          return new Response(JSON.stringify({
            success: true,
            filename: `${baseName}.md`,
            files: {
              markdown: `${MARKDOWN_DIR}/${baseName}.md`,
              html: `${HTML_DIR}/${baseName}.html`,
            }
          }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Server running at http://0.0.0.0:3000");
