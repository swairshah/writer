import index from "./index.html";
import { mkdir, readdir } from "node:fs/promises";
import { marked } from "marked";

const MARKDOWN_DIR = "./markdown";
const HTML_DIR = "./posts";
const blogCss = await Bun.file("./blog.css").text();

await mkdir(MARKDOWN_DIR, { recursive: true });
await mkdir(HTML_DIR, { recursive: true });

Bun.serve({
  port: 3000,
  hostname: "0.0.0.0",
  routes: {
    "/": index,
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
    <title>Blog</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Google+Sans+Mono&family=Inter:wght@400;500;600&family=Unica+One&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Lora', serif;
            font-size: 18px;
            line-height: 1.6;
            color: #1a1a1a;
            background-color: #fafaf8;
            padding: 3rem 2rem;
        }
        .container { max-width: 750px; margin: 0 auto; }
        header { margin-bottom: 3rem; }
        header h1 {
            font-family: 'Unica One', cursive;
            font-size: 3rem;
            font-weight: 400;
            text-transform: uppercase;
            letter-spacing: 3px;
            margin-bottom: 0.5rem;
        }
        header p {
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            color: #999;
        }
        .post-list { list-style: none; }
        .post-entry {
            padding: 1.5rem 0;
            border-bottom: 1px solid #e5e5e5;
            transition: transform 0.2s;
        }
        .post-entry:hover { transform: translateX(4px); }
        .post-entry:last-child { border-bottom: none; }
        .post-entry a {
            text-decoration: none;
            color: inherit;
            display: block;
        }
        .post-title {
            font-family: 'Unica One', cursive;
            font-size: 1.6rem;
            font-weight: 400;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 0.25rem;
            color: #1a1a1a;
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
        }
        .empty-state {
            text-align: center;
            padding: 4rem 2rem;
            color: #999;
            font-family: 'Inter', sans-serif;
        }
        .back-link {
            display: inline-block;
            margin-top: 2rem;
            font-family: 'Inter', sans-serif;
            font-size: 0.9rem;
            color: #999;
            text-decoration: none;
            transition: color 0.2s;
        }
        .back-link:hover { color: #1a1a1a; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #1a1a1a; color: #f0f0ed; }
            header h1 { color: #f0f0ed; }
            .post-title { color: #f0f0ed; }
            .post-entry { border-bottom-color: #333; }
            .post-excerpt { color: #999; }
            .back-link:hover { color: #f0f0ed; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Blog</h1>
            <p>${posts.length} post${posts.length !== 1 ? 's' : ''}</p>
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
        <a href="/" class="back-link">&larr; Back to writer</a>
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
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Google+Sans+Mono&family=Inter:wght@400;500;600&family=Unica+One&display=swap" rel="stylesheet">
    <style>${blogCss}</style>
</head>
<body>
    <div class="container">
        <header>
            <h1>${title}</h1>
            <div class="meta">${date}</div>
        </header>
        <article>${htmlContent}</article>
        <a href="/blog" class="back-link">&larr; Back to all posts</a>
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

console.log("Server running at http://localhost:3000");
