#!/usr/bin/env node
/**
 * 发布前自检：不只是"文件存在"，而是"真的能用"。
 *   1. 所有 .mjs 语法通过（node --check 等价）
 *   2. SKILL.md 的 frontmatter 合法（name kebab-case + description 必备，否则会被静默丢弃）
 *   3. README 与 docs 里的相对链接都指向真实文件
 *   4. .gitignore 确实能挡住 .env / _secrets
 *   5. 没有密钥、没有绝对路径（内嵌调用 scan-secrets 的规则）
 *
 * 用法: node install/self-test.mjs [仓库根]
 * 退出码: 0 = 全过；1 = 有问题
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, '..'));
const fails = [], warns = [], oks = [];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === '_backups') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(root);
const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

// ---- 1. JS 语法 ----
const mjs = files.filter(f => f.endsWith('.mjs') || f.endsWith('.js'));
for (const f of mjs) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'ignore', 'pipe'] });
    oks.push('语法通过 ' + rel(f));
  } catch (e) {
    fails.push('语法错误 ' + rel(f) + ' :: ' + String(e.stderr || e.message).split('\n')[0].slice(0, 120));
  }
}

// ---- 2. SKILL.md frontmatter ----
for (const f of files.filter(x => x.endsWith('SKILL.md'))) {
  const txt = fs.readFileSync(f, 'utf8');
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) { fails.push('SKILL.md 缺 frontmatter: ' + rel(f)); continue; }
  const fm = m[1];
  const name = (fm.match(/^name:\s*(.+)$/m) || [])[1];
  const desc = (fm.match(/^description:\s*(.+)$/m) || [])[1];
  if (!name) fails.push('SKILL.md 缺 name: ' + rel(f));
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name.trim())) fails.push('SKILL.md name 必须是 kebab-case: ' + name.trim());
  else oks.push('SKILL.md name 合法: ' + name.trim());
  if (!desc) fails.push('SKILL.md 缺 description（缺失会被静默丢弃）: ' + rel(f));
  else oks.push('SKILL.md description 存在（' + desc.trim().length + ' 字）');
}

// ---- 3. 相对链接 ----
const linkRe = /\]\((?!https?:|#|mailto:)([^)]+)\)/g;
for (const f of files.filter(x => x.endsWith('.md'))) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = linkRe.exec(txt)) !== null) {
    const target = m[1].split('#')[0].trim();
    if (!target) continue;
    const abs = path.resolve(path.dirname(f), target);
    if (!fs.existsSync(abs)) warns.push('死链 ' + rel(f) + ' → ' + target);
  }
}
if (!warns.some(w => w.startsWith('死链'))) oks.push('所有相对链接可达');

// ---- 4. .gitignore 是否真挡得住 ----
const gi = path.join(root, '.gitignore');
if (!fs.existsSync(gi)) fails.push('.gitignore 不存在');
else {
  const cleaned = mjs.length; // 占位，避免未使用告警
  void cleaned;
  // 造两个临时文件，用 git check-ignore 验证
  const probeEnv = path.join(root, '.env');
  const probeSec = path.join(root, '_secrets');
  const hadEnv = fs.existsSync(probeEnv);
  const hadSec = fs.existsSync(probeSec);
  try {
    if (!hadEnv) fs.writeFileSync(probeEnv, 'PROBE=1\n', 'utf8');
    if (!hadSec) fs.mkdirSync(probeSec, { recursive: true });
    if (!hadSec) fs.writeFileSync(path.join(probeSec, 'x.env'), 'PROBE=1\n', 'utf8');
    let ignored = true;
    try {
      execFileSync('git', ['-C', root, 'check-ignore', '-q', '.env'], { stdio: 'ignore' });
    } catch { ignored = false; }
    if (ignored) oks.push('.gitignore 能挡住 .env');
    else fails.push('.gitignore 挡不住 .env（会被提交！）');
    let ignored2 = true;
    try {
      execFileSync('git', ['-C', root, 'check-ignore', '-q', '_secrets/x.env'], { stdio: 'ignore' });
    } catch { ignored2 = false; }
    if (ignored2) oks.push('.gitignore 能挡住 _secrets/');
    else fails.push('.gitignore 挡不住 _secrets/');
  } catch (e) {
    warns.push('跳过 .gitignore 实测（可能不是 git 仓库）: ' + e.message.slice(0, 60));
  } finally {
    if (!hadEnv && fs.existsSync(probeEnv)) fs.unlinkSync(probeEnv);
    if (!hadSec && fs.existsSync(probeSec)) fs.rmSync(probeSec, { recursive: true, force: true });
  }
}

// ---- 5. 调 scan-secrets ----
try {
  const scan = path.join(root, 'install', 'scan-secrets.mjs');
  if (fs.existsSync(scan)) {
    execFileSync(process.execPath, [scan, root], { stdio: ['ignore', 'ignore', 'pipe'] });
    oks.push('scan-secrets 通过（无密钥 / 无绝对路径）');
  }
} catch (e) {
  const out = String(e.stdout || '') + String(e.stderr || '');
  fails.push('scan-secrets 未通过 :: ' + out.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 200));
}

// ---- 汇总 ----
console.log('发布前自检：' + root);
console.log('='.repeat(72));
for (const o of oks) console.log('  ✅ ' + o);
for (const w of warns) console.log('  ⚠️  ' + w);
for (const f of fails) console.log('  ❌ ' + f);
console.log('='.repeat(72));
console.log(`通过 ${oks.length} · 警告 ${warns.length} · 失败 ${fails.length}`);
process.exitCode = fails.length ? 1 : 0;
