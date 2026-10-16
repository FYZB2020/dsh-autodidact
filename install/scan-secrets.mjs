#!/usr/bin/env node
/**
 * 发布前闸门：扫描仓库，找两类绝不该提交的东西。
 *
 *   1) 密钥/凭据（.env 实体、40 位十六进制 Access Secret、sk-/pat_ 前缀、Bearer 令牌、长 base64）
 *   2) 绝对路径（C:\Users\...、/Users/...、D:\...），会把"只有我能跑"带进仓库
 *
 * 用法：
 *   node install/scan-secrets.mjs            # 扫仓库根
 *   node install/scan-secrets.mjs <目录>
 *
 * 退出码：0 = 干净；1 = 发现问题（不要提交）
 *
 * 建议在 .git/hooks/pre-commit 里调用它，或 CI 里跑。
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, '..'));

const SKIP_DIRS = new Set(['.git', 'node_modules', '_backups', 'bili-output', 'deepread-output', '.venv', '__pycache__']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.m4s', '.mp4', '.wav', '.mp3', '.onnx', '.bin']);

// 扫描器自身含有"举例用的路径"，跳过它自己
const SKIP_FILES = new Set(['scan-secrets.mjs']);

// 允许出现的例外（示例文件、文档里的占位符）
const ALLOW_FILE = new Set(['.env.example']);

const SECRET_PATTERNS = [
  { re: /\b[0-9a-fA-F]{40}\b/g, name: '40 位十六进制串（疑似 Access Secret）' },
  { re: /\bsk-[A-Za-z0-9_-]{16,}\b/g, name: 'sk- 前缀密钥' },
  { re: /\bpat_[A-Za-z0-9_]{10,}\b/g, name: 'pat_ 前缀令牌' },
  { re: /\bghp_[A-Za-z0-9]{20,}\b/g, name: 'GitHub token' },
  { re: /\bBearer\s+[A-Za-z0-9._-]{30,}/g, name: 'Bearer 令牌' },
  { re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, name: 'JWT' },
];

const PATH_PATTERNS = [
  { re: /[A-Za-z]:\\\\?Users\\\\?[^\\\s"']+/g, name: '绝对路径（Windows 用户目录）' },
  { re: /[A-Za-z]:\\Users\\[^\s"']+/g, name: '绝对路径（Windows 用户目录）' },
  { re: /\/Users\/[A-Za-z0-9._-]+\//g, name: '绝对路径（macOS 用户目录）' },
];

const findings = [];
let scanned = 0;

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    const rel = path.relative(root, p);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(p);
      continue;
    }
    if (!e.isFile()) continue;
    if (SKIP_FILES.has(e.name)) continue;

    // 1) 不该存在的 .env 实体
    if (/^\.env($|\.)/.test(e.name) && !ALLOW_FILE.has(e.name)) {
      findings.push({ rel, kind: '.env 实体文件', detail: '不应提交（.gitignore 已排除，请确认没被强制加入）' });
      continue;
    }
    if (SKIP_EXT.has(path.extname(e.name).toLowerCase())) continue;

    let text;
    try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
    if (text.length > 2_000_000) continue; // 超大文本跳过
    scanned++;

    const isExample = ALLOW_FILE.has(e.name);

    for (const { re, name } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      const m = text.match(re);
      if (!m) continue;
      // .env.example 里的空值不算
      if (isExample && m.every(x => /=\s*$/.test(x))) continue;
      const lines = text.split('\n');
      const lineNo = lines.findIndex(l => re.test(l)) + 1;
      findings.push({ rel, kind: '疑似密钥：' + name, detail: '第 ' + lineNo + ' 行，例：' + String(m[0]).slice(0, 12) + '…' });
    }

    for (const { re, name } of PATH_PATTERNS) {
      re.lastIndex = 0;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0;
        if (!re.test(lines[i])) continue;
        // 明显的举例/省略号写法不算问题，例如 C:\Users\... 、<workspace>
        if (/[A-Za-z]:\\Users\\\.\.\./.test(lines[i])) continue;
        if (/<[A-Z_]+>/.test(lines[i]) && !/[A-Za-z]:\\Users\\[A-Za-z0-9]/.test(lines[i])) continue;
        findings.push({ rel, kind: '绝对路径：' + name, detail: '第 ' + (i + 1) + ' 行：' + lines[i].trim().slice(0, 70) });
      }
    }
    // 3) 明文赋值形式（逐行判断，避免 \s* 跨行匹配；占位符不算）
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m2 = lines[i].match(/^[ \t]*(ZHIHU_ACCESS_SECRET|ZHIHU_API_KEY|ZHIHU_ACCESS_TOKEN|BOCHA_API_KEY|TAVILY_API_KEY|EXA_API_KEY|FIRECRAWL_API_KEY)[ \t]*=[ \t]*(.*)$/);
      if (!m2) continue;
      const val = (m2[2] || '').trim();
      if (!val) continue;                                    // 空值 = 模板
      if (/^[<'"`]/.test(val)) continue;                      // <你的 Secret>
      if (/^(\.{3}|x{2,}|\*{2,})/i.test(val)) continue;
      if (/^(your|你的|填入|填|见|参考|TODO|CHANGE)/i.test(val)) continue;
      findings.push({ rel, kind: '明文赋值密钥', detail: '第 ' + (i + 1) + ' 行：' + m2[1] + '=<值，不像占位符>' });
    }
  }
}

console.log('扫描目录：' + root);
walk(root);
console.log(`已扫 ${scanned} 个文本文件。\n`);

if (!findings.length) {
  console.log('✅ 干净：没有发现密钥或绝对路径。可以发布。');
  process.exit(0);
}

console.log(`❌ 发现 ${findings.length} 处问题，**不要提交**：\n`);
const byKind = new Map();
for (const f of findings) { const k = f.kind; if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(f); }
for (const [kind, list] of byKind) {
  console.log(`【${kind}】${list.length} 处`);
  for (const f of list.slice(0, 12)) console.log(`   ${f.rel}  →  ${f.detail}`);
  if (list.length > 12) console.log(`   …还有 ${list.length - 12} 处`);
  console.log('');
}
console.log('处理建议：');
console.log('  · 密钥类：移进 .env（已被 .gitignore 排除），文档里改用 <你的 Access Secret> 占位符；');
console.log('  · 绝对路径：改成参数、环境变量或相对路径；示例路径写 <workspace> 之类的占位符。');
process.exit(1);
