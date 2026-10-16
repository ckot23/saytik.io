"use strict";
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { minify } = require('html-minifier-terser');
const esbuild = require('esbuild');
const config = require('../site.config.json');
const contacts = require('../assets/js/site.config.js');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function build() {
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) throw new Error('site.config.json: ожидается HTTPS origin без пути');
  const origin = url.origin;
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
  await fs.cp(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
  const versions = {};
  for (const file of ['assets/css/style.css', 'assets/js/site.config.js', 'assets/js/main.js', 'assets/js/order.js']) {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    const result = await esbuild.transform(source, { loader: file.endsWith('.css') ? 'css' : 'js', minify: true, target: 'es2020', legalComments: 'none' });
    const hash = crypto.createHash('sha256').update(result.code).digest('hex').slice(0, 12);
    const versioned = file.replace(/\.(css|js)$/, `.${hash}.$1`);
    versions[file] = versioned;
    await fs.writeFile(path.join(out, versioned), result.code);
    await fs.unlink(path.join(out, file));
  }
  for (const file of ['index.html', 'order.html']) {
    let html = (await fs.readFile(path.join(root, file), 'utf8')).replaceAll('https://saytik.ru', origin);
    // Pre-render contacts; the browser only enhances already usable HTML.
    const data = {phone: [contacts.phone, 'tel:' + contacts.phoneHref], email: [contacts.email, 'mailto:' + contacts.email], telegram: [contacts.telegram, contacts.telegramHref]};
    html = html.replace(/<(p|a)([^>]*data-contact="(phone|email|telegram)"[^>]*)>[\s\S]*?<\/\1>/g, (_, tag, attrs, kind) => {
      const [label, href] = data[kind];
      if (!label) return '';
      if (tag === 'a') return `<a${attrs.replace(/\s+href="[^"]*"/, '')} href="${escape(href)}">${escape(label)}</a>`;
      return `<p${attrs}><a href="${escape(href)}">${escape(label)}</a></p>`;
    });
    // Keep structured data synchronized with public contact configuration.
    html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, json) => {
      const data = JSON.parse(json);
      data.name = config.name; data.email = contacts.email; data.telephone = contacts.phoneHref;
      data.sameAs = contacts.telegramHref ? [contacts.telegramHref] : [];
      return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
    });
    for (const [from, to] of Object.entries(versions)) html = html.replaceAll(from, to);
    await fs.writeFile(path.join(out, file), await minify(html, { collapseWhitespace: true, removeComments: true, minifyCSS: true, minifyJS: true, keepClosingSlash: true }));
  }
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
  // Only canonical indexable pages belong here. No fabricated lastmod dates.
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${escape(origin)}/</loc></url>\n</urlset>\n`;
  for (const [file, text] of [['robots.txt', robots], ['sitemap.xml', sitemap]]) {
    await fs.writeFile(path.join(out, file), text);
    await fs.writeFile(path.join(root, file), text);
  }
  await fs.copyFile(path.join(root, '_headers'), path.join(out, '_headers'));
  console.log('SSG: dist/ готова; canonical origin: ' + origin);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
