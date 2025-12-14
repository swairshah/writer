import { mkdir, readdir, rm } from "node:fs/promises";
import { marked } from "marked";

const MARKDOWN_DIR = "./markdown";
const OUTPUT_DIR = "./dist";
const blogCss = await Bun.file("./blog.css").text();

// Clean and create output directory
await rm(OUTPUT_DIR, { recursive: true, force: true });
await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(`${OUTPUT_DIR}/blog`, { recursive: true });

// Read all markdown files
const files = await readdir(MARKDOWN_DIR).catch(() => []);
const posts = await Promise.all(
  files
    .filter((f) => f.endsWith(".md"))
    .map(async (f) => {
      const content = await Bun.file(`${MARKDOWN_DIR}/${f}`).text();
      const title = content.match(/^#\s+(.+)$/m)?.[1] || f.replace(".md", "");
      const date = f.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
      const slug = f.replace(".md", "");
      const lines = content
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("*"));
      const excerpt = lines[0]?.slice(0, 200) || "";
      const htmlContent = await marked(content);
      return { title, date, slug, excerpt, htmlContent, filename: f };
    })
);

posts.sort((a, b) => b.date.localeCompare(a.date));

// Generate blog index
const indexHtml = `<!DOCTYPE html>
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
        @media (prefers-color-scheme: dark) {
            body { background-color: #1a1a1a; color: #f0f0ed; }
            header h1 { color: #f0f0ed; }
            .post-title { color: #f0f0ed; }
            .post-entry { border-bottom-color: #333; }
            .post-excerpt { color: #999; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Blog</h1>
            <p>${posts.length} post${posts.length !== 1 ? "s" : ""}</p>
        </header>
        ${
          posts.length === 0
            ? `
            <div class="empty-state">
                <p>No posts yet.</p>
            </div>
        `
            : `
            <ul class="post-list">
                ${posts
                  .map(
                    (post) => `
                    <li class="post-entry">
                        <a href="/blog/${post.slug}/">
                            <h2 class="post-title">${post.title}</h2>
                            <div class="post-date">${post.date}</div>
                            <p class="post-excerpt">${post.excerpt}${post.excerpt.length >= 200 ? "..." : ""}</p>
                        </a>
                    </li>
                `
                  )
                  .join("")}
            </ul>
        `
        }
    </div>
</body>
</html>`;

await Bun.write(`${OUTPUT_DIR}/index.html`, indexHtml);
await Bun.write(`${OUTPUT_DIR}/blog/index.html`, indexHtml);

// Generate individual post pages
for (const post of posts) {
  const postDir = `${OUTPUT_DIR}/blog/${post.slug}`;
  await mkdir(postDir, { recursive: true });

  const postHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${post.title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Google+Sans+Mono&family=Inter:wght@400;500;600&family=Unica+One&display=swap" rel="stylesheet">
    <style>${blogCss}</style>
</head>
<body>
    <div class="container">
        <header>
            <h1>${post.title}</h1>
            <div class="meta">${post.date}</div>
        </header>
        <article>${post.htmlContent}</article>
        <a href="/" class="back-link">← Back to all posts</a>
    </div>
</body>
</html>`;

  await Bun.write(`${postDir}/index.html`, postHtml);
}

console.log(`✓ Built ${posts.length} posts to ${OUTPUT_DIR}/`);
console.log(`  - ${OUTPUT_DIR}/index.html`);
console.log(`  - ${OUTPUT_DIR}/blog/index.html`);
posts.forEach((p) => console.log(`  - ${OUTPUT_DIR}/blog/${p.slug}/index.html`));
