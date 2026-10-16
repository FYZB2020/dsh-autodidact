#!/usr/bin/env node
/**
 * push-to-github — 用 GitHub REST API 把本仓库推上去（不用 git push）。
 *
 * 为什么不用 git push：
 *   本机（以及部分大陆网络环境）`github.com` 这个域名不稳定 / 不可达，
 *   `git push` 会失败（schannel 或 connect 超时）。但 **api.github.com 是稳定的**，
 *   所以改走 REST 的 Git Data API（blob → tree → commit → ref）。
 *
 * 用法：
 *   # 1) 先把 token 放进环境（不要在命令行里传，避免进历史记录）
 *   #    Windows 永久写入用户环境变量：
 *   #      setx GITHUB_TOKEN "github_pat_xxx"
 *   #    或临时（仅当前窗口）：
 *   #      $env:GITHUB_TOKEN="github_pat_xxx"
 *
 *   # 2) 先干跑，确认要推哪些文件、推到哪
 *   node install/push-to-github.mjs --owner <你的用户名> --repo <仓库名> --dry-run
 *
 *   # 3) 真推
 *   node install/push-to-github.mjs --owner <你的用户名> --repo <仓库名> \
 *        --message "chore: initial import"
 *
 * 需要的 token 权限（最小化）：
 *   推荐 **Fine-grained PAT**，只勾一个仓库，Repository permissions → Contents: Read and write。
 *   老式 classic token 需要 repo 作用域（权限过大，不推荐）。
 *
 * 安全：token 只从环境变量读，不写入任何文件、不打印。
 */
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.github.com';

// ---------------------------------------------------------------- 参数
function parseArgs(argv) {
  const o = { owner: '', repo: '', branch: 'main', message: 'chore: initial import', dryRun: false, root: '', private: null, description: '', topics: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--owner') o.owner = argv[++i] || '';
    else if (a === '--repo') o.repo = argv[++i] || '';
    else if (a === '--branch') o.branch = argv[++i] || 'main';
    else if (a === '--message' || a === '-m') o.message = argv[++i] || o.message;
    else if (a === '--root') o.root = argv[++i] || '';
    else if (a === '--description') o.description = argv[++i] || '';
    else if (a === '--topics') o.topics = argv[++i] || '';
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '-h' || a === '--help') o.help = true;
  }
  return o;
}
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`用法: node install/push-to-github.mjs --owner <用户名> --repo <仓库名> [选项]

选项:
  --branch <名>      分支（默认 main）
  --message <文本>   提交信息
  --dry-run          只列出要推的文件，不发起写请求
  --description <文本>  设置仓库简介（需 admin 权限，可选）
  --topics <a,b,c>      设置仓库标签（需 admin 权限，可选）
  --root <目录>      要推的目录（默认 = 本仓库根）

环境变量: GITHUB_TOKEN（必需，除 --dry-run 外）`);
  process.exit(0);
}

const root = path.resolve(args.root || path.join(import.meta.dirname, '..'));

// token 来源优先级：进程环境 → ~/.dsh/.env → 仓库内 .env
// （放 .env 的好处：不必重启 DSH，也不会出现在聊天记录或命令历史里）
function loadToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [path.join(home, '.dsh', '.env'), path.join(root, '.env')];
  for (const f of candidates) {
    try {
      if (!f || !fs.existsSync(f)) continue;
      const line = fs.readFileSync(f, 'utf8').split(/\r?\n/).find(l => /^\s*GITHUB_TOKEN\s*=/.test(l));
      if (line) {
        const v = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
        if (v) { console.log('（token 来源：' + f + '）'); return v; }
      }
    } catch { /* 忽略 */ }
  }
  return '';
}
const TOKEN = loadToken();

// ---------------------------------------------------------------- 收集文件
const SKIP_DIRS = new Set(['.git', 'node_modules', '_backups', 'bili-output', 'deepread-output', '.venv', '__pycache__']);
const SKIP_FILE = [/^\.env($|\.)/i, /\.log$/i];
const SKIP_FILE_EXCEPT = new Set(['.env.example']);

function collect(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? prefix + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...collect(path.join(dir, e.name), rel));
      continue;
    }
    if (!e.isFile()) continue;
    if (SKIP_FILE_EXCEPT.has(e.name)) { /* 放行 */ }
    else if (SKIP_FILE.some(re => re.test(e.name))) continue;
    out.push({ rel, abs: path.join(dir, e.name) });
  }
  return out;
}

const files = collect(root);
console.log(`目录：${root}`);
console.log(`待推送：${files.length} 个文件`);
for (const f of files) {
  const size = fs.statSync(f.abs).size;
  console.log(`  ${String(size).padStart(8)} B  ${f.rel}`);
}

if (!args.owner || !args.repo) {
  console.error('\n❌ 缺少 --owner / --repo');
  process.exit(1);
}
if (args.dryRun) {
  console.log('\n✅ --dry-run：未发起任何写请求。');
  console.log(`   目标：https://github.com/${args.owner}/${args.repo}  (branch: ${args.branch})`);
  if (!TOKEN) console.log('   ⚠️ 未检测到 GITHUB_TOKEN —— 真推之前要先设好。');
  process.exit(0);
}
if (!TOKEN) {
  console.error('\n❌ 未检测到 GITHUB_TOKEN 环境变量。');
  console.error('   Windows: setx GITHUB_TOKEN "github_pat_xxx"   然后重开终端');
  console.error('   或临时:  $env:GITHUB_TOKEN="github_pat_xxx"');
  process.exit(1);
}

// ---------------------------------------------------------------- API
async function gh(method, url, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(url.startsWith('http') ? url : API + url, {
      method,
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dsh-autodidact-push',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const txt = await r.text();
    let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { }
    if (!r.ok) {
      const msg = (j && (j.message || j.error)) || txt.slice(0, 200);
      throw new Error(`${method} ${url} → HTTP ${r.status}: ${msg}`);
    }
    return j;
  } finally { clearTimeout(t); }
}

const slug = `${args.owner}/${args.repo}`;
console.log(`\n▶ 目标仓库 ${slug}（分支 ${args.branch}）`);

// 0) 仓库是否存在 / 有无初始提交
let repoInfo = null;
try { repoInfo = await gh('GET', `/repos/${slug}`); console.log(`  仓库存在，默认分支 ${repoInfo.default_branch}，private=${repoInfo.private}`); }
catch (e) { console.error('❌ 读不到仓库：' + e.message); console.error('   请确认仓库已创建，且 token 对该仓库有 Contents 读写权限。'); process.exit(1); }

let baseCommitSha = null, baseTreeSha = null;
try {
  const ref = await gh('GET', `/repos/${slug}/git/ref/heads/${args.branch}`);
  baseCommitSha = ref.object.sha;
  const c = await gh('GET', `/repos/${slug}/git/commits/${baseCommitSha}`);
  baseTreeSha = c.tree.sha;
  console.log(`  已有分支 ${args.branch}，基线 commit ${baseCommitSha.slice(0, 8)}`);
} catch {
  console.log(`  分支 ${args.branch} 还不存在 —— 将创建初始提交`);
}

// 1) 逐个文件建 blob（并行度 4，避免触发二级限流）
console.log('\n  上传 blob…');
const tree = [];
let done = 0;
const queue = [...files];
async function worker() {
  while (queue.length) {
    const f = queue.shift();
    const content = fs.readFileSync(f.abs);
    const isText = !/\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|onnx|bin)$/i.test(f.rel);
    const blob = await gh('POST', `/repos/${slug}/git/blobs`, isText
      ? { content: content.toString('utf8'), encoding: 'utf-8' }
      : { content: content.toString('base64'), encoding: 'base64' });
    tree.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha });
    done++;
    process.stdout.write(`\r    ${done}/${files.length}  ${f.rel.slice(0, 50).padEnd(52)}`);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log('');

// 2) tree
const newTree = await gh('POST', `/repos/${slug}/git/trees`, {
  ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
  tree,
});
console.log(`  tree ${newTree.sha.slice(0, 8)}（${tree.length} 项）`);

// 3) commit
const commit = await gh('POST', `/repos/${slug}/git/commits`, {
  message: args.message,
  tree: newTree.sha,
  ...(baseCommitSha ? { parents: [baseCommitSha] } : {}),
});
console.log(`  commit ${commit.sha.slice(0, 8)}`);

// 4) 更新/创建 ref
if (baseCommitSha) {
  await gh('PATCH', `/repos/${slug}/git/refs/heads/${args.branch}`, { sha: commit.sha, force: false });
} else {
  await gh('POST', `/repos/${slug}/git/refs`, { ref: `refs/heads/${args.branch}`, sha: commit.sha });
}
console.log(`  ✅ 已更新 refs/heads/${args.branch}`);

// 5) 可选元信息
if (args.description || args.topics) {
  try {
    const body = {};
    if (args.description) body.description = args.description;
    if (args.topics) body.topics = args.topics.split(',').map(s => s.trim()).filter(Boolean);
    await gh('PATCH', `/repos/${slug}`, body);
    console.log('  ✅ 已更新仓库简介/标签');
  } catch (e) {
    console.log('  ⚠️ 简介/标签设置失败（需要 admin 权限）：' + e.message);
  }
}

console.log(`\n🎉 完成：https://github.com/${slug}/tree/${args.branch}`);
console.log('   建议：去仓库页面确认文件齐全，并把 token 撤销（如果只是临时用）。');
