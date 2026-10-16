#!/usr/bin/env node
/**
 * bili_lecture — 一次拿到 B站视频的「字幕 + 热门评论」，长视频自动分块。
 *
 * 为什么需要它：
 *   - 只查 view / player/v2 会得出「没有字幕」的错误结论；真正能用的是 x/v2/dm/view。
 *   - 字幕只是单一叙述口径；评论区才有纠错、时间戳重点、补充资料与争议。
 *   - 长视频字幕动辄上万字，必须分块才能喂给模型。
 *
 * 用法：
 *   node bili_lecture.mjs BV1GJ411x7h7
 *   node bili_lecture.mjs BV1GJ411x7h7 --lang zh --comments 20 --out ./bili-output
 *   node bili_lecture.mjs BV1GJ411x7h7 --chunk 300        # 长视频按 300 条 cue 分块
 *   node bili_lecture.mjs https://www.bilibili.com/video/BV1GJ411x7h7
 *
 * 无需 Cookie、无需登录、无需 API key。零第三方依赖（只用 Node 内置 fetch/fs）。
 * 要求：Node >= 18（建议 22+）。
 *
 * 输出（默认 ./bili-output/）：
 *   <BV>.subtitle.txt      纯文本字幕
 *   <BV>.subtitle.srt      SRT 字幕
 *   <BV>.comments.md       热门评论（含点赞数）
 *   <BV>.lecture.md        合并包：元信息 + 分块字幕 + 评论 —— 直接喂模型用这个
 */

import fs from 'node:fs';
import path from 'node:path';

const UA = process.env.BILI_UA ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ---------------------------------------------------------------- 参数
function parseArgs(argv) {
  const o = { bv: '', lang: '', comments: 20, out: './bili-output', chunk: 0, json: false, timeout: 25000 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = argv[++i] || '';
    else if (a === '--comments') o.comments = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === '--out') o.out = argv[++i] || o.out;
    else if (a === '--chunk') o.chunk = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === '--timeout') o.timeout = Math.max(3000, parseInt(argv[++i], 10) || 25000);
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else rest.push(a);
  }
  o.bv = rest[0] || '';
  return o;
}

const argv = parseArgs(process.argv.slice(2));
if (argv.help || !argv.bv) {
  console.log(`用法: node bili_lecture.mjs <BV号或URL> [选项]

选项:
  --lang <代码>     优先语言（默认自动挑中文：zh* / ai-zh）
  --comments <N>    取前 N 条热门评论（默认 20；0 = 不取）
  --out <目录>      输出目录（默认 ./bili-output）
  --chunk <N>       按 N 条字幕分块（0 = 不分块；长视频建议 200-400）
  --timeout <ms>    单请求超时（默认 25000）
  --json            额外打印机器可读摘要

退出码: 0 成功（含"确实没有字幕"）；1 参数/网络错误`);
  process.exit(argv.bv || argv.help ? 0 : 1);
}

// ---------------------------------------------------------------- 工具
async function getJson(url, timeout) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' }, signal: ctl.signal });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch { /* 非 JSON */ }
    return { ok: r.ok, status: r.status, json: j, text: txt };
  } finally { clearTimeout(t); }
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
function srtTime(sec) {
  const ms = Math.round((sec % 1) * 1000);
  const s = Math.floor(sec) % 60, m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}
function hms(sec) {
  const s = Math.floor(sec) % 60, m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();

// ---------------------------------------------------------------- 主流程
// 进度默认走 stdout：Windows PowerShell 会把写入 stderr 的原生命令标记成
// NativeCommandError，用户会误以为运行失败。--json 时改走 stderr，保证 stdout 只有 JSON。
const log = argv.json ? (...a) => console.error(...a) : (...a) => console.log(...a);

// 1) 解析 BV
const m = String(argv.bv).match(/(BV[0-9A-Za-z]{10})/);
if (!m) { log('❌ 无法从参数里解析出 BV 号：' + argv.bv); process.exit(1); }
const bvid = m[1];
log(`▶ ${bvid}`);

// 2) 元信息
const view = await getJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, argv.timeout);
if (view.json?.code !== 0 || !view.json?.data) {
  log(`❌ view 接口失败：code=${view.json?.code} ${view.json?.message || view.status}`);
  process.exit(1);
}
const d = view.json.data;
const aid = d.aid, cid = d.cid;
const title = d.title, dur = d.duration, owner = d.owner?.name, pubdate = d.pubdate;
log(`  「${title}」 ${hms(dur)} · UP ${owner} · 播放 ${d.stat?.view} · 评论 ${d.stat?.reply}`);

// 3) 字幕：只能看 dm/view（player/v2 会给出相反的错误结论）
const gated = await getJson(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`, argv.timeout);
const gatedN = (gated.json?.data?.subtitle?.subtitles || []).length;

const dm = await getJson(`https://api.bilibili.com/x/v2/dm/view?aid=${aid}&oid=${cid}&type=1`, argv.timeout);
const tracks = (dm.json?.data?.subtitle?.subtitles || []).filter(t => t.subtitle_url);
log(`  字幕轨：dm/view=${tracks.length}  (player/v2=${gatedN} ← 这个数不可信)`);

let cues = [], usedTrack = null;
if (tracks.length) {
  // 语言优先：用户指定 > 中文(zh*) > ai-zh > 第一条
  let pick = null;
  if (argv.lang) pick = tracks.find(t => t.lan === argv.lang) || tracks.find(t => t.lan.includes(argv.lang));
  if (!pick) pick = tracks.find(t => /^zh/i.test(t.lan)) || tracks.find(t => /^ai-zh/i.test(t.lan)) || tracks[0];
  const url = String(pick.subtitle_url).replace(/^http:\/\//, 'https://');
  const sub = await getJson(url, argv.timeout);
  cues = (sub.json?.body || []).map(b => ({ from: b.from, to: b.to, text: stripTags(b.content) })).filter(c => c.text);
  usedTrack = pick.lan;
  log(`  取字幕：lan=${pick.lan}  cue=${cues.length}  (auth_key 现取现用，不缓存)`);
} else {
  log('  ⚠️ dm/view 也没有字幕轨 → 这条视频确实没有字幕，需要走音频转录兜底');
}

// 4) 评论（x/v2/reply/main 不需要签名）
let comments = [];
if (argv.comments > 0) {
  const r = await getJson(`https://api.bilibili.com/x/v2/reply/main?type=1&oid=${aid}&mode=3&next=0&ps=${Math.min(30, argv.comments)}`, argv.timeout);
  const list = r.json?.data?.replies || [];
  comments = list.map(c => ({
    like: c.like || 0,
    user: c.member?.uname || '',
    text: stripTags(c.content?.message),
    rcount: c.rcount || 0,
  })).sort((a, b) => b.like - a.like).slice(0, argv.comments);
  log(`  评论：code=${r.json?.code}  取回 ${comments.length} 条（按赞排序）`);
}

// 5) 输出
const outDir = path.resolve(process.cwd(), argv.out);
fs.mkdirSync(outDir, { recursive: true });
const wrote = [];
const w = (name, content) => { const p = path.join(outDir, name); fs.writeFileSync(p, content, 'utf8'); wrote.push(p); return p; };

if (cues.length) {
  w(`${bvid}.subtitle.txt`, cues.map(c => c.text).join('\n'));
  w(`${bvid}.subtitle.srt`, cues.map((c, i) => `${i + 1}\n${srtTime(c.from)} --> ${srtTime(c.to)}\n${c.text}\n`).join('\n'));
}

if (comments.length) {
  w(`${bvid}.comments.md`,
    `# ${title} — 热门评论 Top ${comments.length}\n\n` +
    comments.map((c, i) => `${i + 1}. 👍${c.like}${c.rcount ? `（${c.rcount} 回复）` : ''} ${c.user}：${c.text}`).join('\n\n') + '\n');
}

// 合并包：元信息 + 分块字幕 + 评论。长视频用这个喂模型。
const body = [];
body.push(`# ${title}`);
body.push('');
body.push(`- BV：${bvid} · aid：${aid} · cid：${cid}`);
body.push(`- 时长：${hms(dur)} · UP：${owner} · 发布：${pubdate ? new Date(pubdate * 1000).toISOString().slice(0, 10) : '?'}`);
body.push(`- 数据：播放 ${d.stat?.view} · 点赞 ${d.stat?.like} · 评论 ${d.stat?.reply}`);
body.push(`- 字幕：${cues.length ? `${usedTrack}（${cues.length} 条）` : '**无字幕轨** → 需音频转录兜底'}`);
body.push('');
if (cues.length) {
  body.push('## 字幕');
  body.push('');
  const chunk = argv.chunk > 0 ? argv.chunk : (cues.length > 400 ? 300 : 0);
  if (chunk > 0) {
    body.push(`> 共 ${cues.length} 条，已按 ${chunk} 条分块（长视频请逐块摘要后再合并）。`);
    body.push('');
    for (let i = 0; i < cues.length; i += chunk) {
      const seg = cues.slice(i, i + chunk);
      body.push(`### 第 ${Math.floor(i / chunk) + 1} 块 — ${hms(seg[0].from)} ~ ${hms(seg[seg.length - 1].to)}`);
      body.push('');
      body.push(seg.map(c => `[${hms(c.from)}] ${c.text}`).join('\n'));
      body.push('');
    }
  } else {
    body.push(cues.map(c => `[${hms(c.from)}] ${c.text}`).join('\n'));
    body.push('');
  }
}
if (comments.length) {
  body.push('## 热门评论（按赞排序 —— 纠错、重点、争议在这里）');
  body.push('');
  body.push(comments.map((c, i) => `${i + 1}. **👍${c.like}** ${c.text}`).join('\n\n'));
  body.push('');
}
w(`${bvid}.lecture.md`, body.join('\n'));

// 6) 汇报
console.log(`\n✅ 完成：${bvid}`);
console.log(`   字幕 ${cues.length} 条${usedTrack ? `（${usedTrack}）` : '（无）'}`);
console.log(`   评论 ${comments.length} 条`);
console.log(`   输出：`);
for (const p of wrote) console.log('     ' + p);
if (!cues.length) {
  console.log(`\n⚠️ 这条视频没有字幕轨。兜底方案（需要 yt-dlp + ffmpeg + 本机 ASR）：`);
  console.log(`   yt-dlp -f 30280 -o audio.m4a "https://www.bilibili.com/video/${bvid}"`);
  console.log(`   然后用 faster-whisper 转写；注意必须分段（30 秒窗口），整段喂长音频会严重欠转写。`);
}
if (argv.json) {
  console.log('\n' + JSON.stringify({ bvid, aid, cid, title, duration: dur, subtitleTrack: usedTrack, cues: cues.length, comments: comments.length, files: wrote }, null, 2));
}
