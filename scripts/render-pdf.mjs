// 把 docs/交付文档.md 渲染成 A4 的 PDF（写回 docs/交付文档.pdf）。
// 中间产物 HTML 落在 tmp/（已在 .gitignore 中），不随仓库分发；
// 渲染用的浏览器来自开发依赖 @playwright/test，克隆仓库后 npm ci 即可直接执行。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// 以脚本自身位置定位仓库根：本脚本在 scripts/ 下，上一级就是根目录，换机器无需改路径。
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = resolve(root, 'docs/交付文档.md');
const pdfPath = resolve(root, 'docs/交付文档.pdf');
const htmlPath = resolve(root, 'tmp/doc.html');
const md = readFileSync(mdPath, 'utf8');

const inline = text => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img src="file://${resolve(root, 'docs', src)}" alt="${alt}">`)
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const lines = md.split('\n');
const out = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  if (line.startsWith('```')) {
    const lang = line.slice(3).trim();
    const body = [];
    for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i]);
    out.push(`<pre data-lang="${lang}">${body.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`);
  } else if (/^\|/.test(line)) {
    const rows = [];
    for (; i < lines.length && /^\|/.test(lines[i]); i++) {
      rows.push(lines[i].split('|').slice(1, -1).map(cell => cell.trim()));
    }
    const [head, ...rest] = rows.filter(cells => !cells.every(cell => /^-+$/.test(cell)));
    out.push(`<table><thead><tr>${head.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rest.map(cells => `<tr>${cells.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
  } else if (/^\d+\.\s/.test(line)) {
    const items = [];
    for (; i < lines.length && /^\d+\.\s/.test(lines[i]); i++) items.push(`<li>${inline(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
    out.push(`<ol>${items.join('')}</ol>`);
  } else if (/^[-*]\s/.test(line)) {
    const items = [];
    for (; i < lines.length && /^[-*]\s/.test(lines[i]); i++) items.push(`<li>${inline(lines[i].slice(2))}</li>`);
    out.push(`<ul>${items.join('')}</ul>`);
  } else if (/^<div/.test(line.trim())) {
    const block = [];
    for (; i < lines.length && lines[i].trim(); i++) block.push(lines[i]);
    out.push(block.join('\n').replace(/src="([^"]+)"/g, (_, src) => `src="file://${resolve(root, 'docs', src)}"`));
  } else if (/^#{1,6}\s/.test(line)) {
    const level = line.match(/^#+/)[0].length;
    out.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
  } else if (line.trim()) {
    out.push(`<p>${inline(line)}</p>`);
  }
  i++;
}

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm 15mm 18mm; }
  :root { --green: #241f19; --gold: #a83c2a; --ink: #241f19; --muted: #877c6c; --line: #e4ddcc; --bg: #ffffff; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; color: var(--ink); font-size: 10.5pt; line-height: 1.75; }
  h1 { font-size: 22pt; color: var(--green); margin: 0 0 4pt; letter-spacing: .04em; font-weight: 300; font-family: "PingFang SC", "HarmonyOS Sans SC", "Noto Sans CJK SC", sans-serif; }
  h2 { font-size: 13pt; color: var(--green); margin: 20pt 0 8pt; padding-left: 8pt; border-left: 2pt solid var(--gold); break-after: avoid; }
  p { margin: 6pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 9.5pt; }
  th, td { border: 0.6pt solid var(--line); padding: 5pt 7pt; text-align: left; vertical-align: top; }
  th { background: #f5f0e6; color: var(--green); font-weight: 600; }
  ul, ol { margin: 6pt 0 6pt 18pt; padding: 0; }
  li { margin: 3pt 0; }
  pre { background: #faf6ec; border: 0.6pt solid var(--line); border-left: 2pt solid var(--gold); border-radius: 3pt; padding: 8pt 10pt; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8.5pt; line-height: 1.55; white-space: pre-wrap; word-break: break-word; margin: 8pt 0; }
  code { background: #faf6ec; border-radius: 2pt; padding: 0 3pt; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9pt; color: var(--gold); }
  pre code { background: none; color: var(--ink); font-size: 8.5pt; padding: 0; }
  img { max-width: 100%; border: 0.6pt solid var(--line); border-radius: 4pt; margin: 4pt 0; }
  .shots { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; align-items: start; margin: 8pt 0; }
  .shots figure { margin: 0; break-inside: avoid; text-align: center; }
  .shots img { width: auto; margin: 0 auto; }
  .shots figcaption { font-size: 8.5pt; color: var(--muted); margin-top: 3pt; }
  .shots .phone img { height: 84mm; }
  .shots .screen img { height: 58mm; }
  .shots .wide { grid-column: 1 / -1; }
  .shots .wide img { height: 104mm; }
  strong { color: var(--green); }
  a { color: var(--gold); text-decoration: none; word-break: break-all; }
  h2 + p, h2 + table, h2 + ol, h2 + ul { break-before: avoid; }
</style></head><body>${out.join('\n')}</body></html>`;

// 克隆出来的仓库没有 tmp/，先建目录再写，避免直接 ENOENT。
mkdirSync(dirname(htmlPath), { recursive: true });
writeFileSync(htmlPath, html);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${htmlPath}`);
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' } });
await browser.close();
console.log(`PDF 已生成：${relative(root, pdfPath)}（源：${relative(root, mdPath)}）`);
