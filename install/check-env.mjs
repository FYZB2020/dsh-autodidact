// 环境自检：网络可达性 + 关键依赖。
// 退出码 0 = 关键项通过；1 = 关键项失败。
//
// 注意：本机 curl.exe / PowerShell 的 HTTPS 可能失败（schannel SEC_E_NO_CREDENTIALS），
// 那不代表没网。所以这里用 Node 自己的 fetch 判断。
const checks = [];
async function probe(label, url, { critical = false, method = 'GET', headers = {}, body } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method, headers, body, signal: ctl.signal });
    const ok = r.status < 500;
    checks.push({ label, ok, ms: Date.now() - t0, detail: 'HTTP ' + r.status, critical });
  } catch (e) {
    checks.push({ label, ok: false, ms: Date.now() - t0, detail: (e.cause && e.cause.code) || e.name, critical });
  } finally { clearTimeout(t); }
}

await probe('npm registry（装插件必需）', 'https://registry.npmjs.org/dsh-free-search', { critical: true });
await probe('知乎开放平台（可选）', 'https://developer.zhihu.com/api/v1/quota');
await probe('搜狗微信（公众号搜索）', 'https://weixin.sogou.com/weixin?type=2&query=test');
await probe('公众号正文', 'https://mp.weixin.qq.com/s/qxovbSFCVCVb54OgICsijw');
await probe('B站 API', 'https://api.bilibili.com/x/web-interface/view?bvid=BV1GJ411x7h7');
await probe('PubMed', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=rag&retmode=json&retmax=1');
await probe('OpenAlex', 'https://api.openalex.org/works?search=rag&per-page=1');
// 这些在部分网络下会失败，属预期
await probe('DuckDuckGo（常被墙）', 'https://html.duckduckgo.com/html/?q=test');
await probe('Wikipedia API（常被墙）', 'https://en.wikipedia.org/api/rest_v1/page/summary/AI');

console.log('环境自检（Node fetch，15s 超时）');
console.log('-'.repeat(72));
for (const c of checks) {
  const mark = c.ok ? '✅' : (c.critical ? '❌' : '⚠️ ');
  console.log(`${mark} ${String(c.ms).padStart(6)}ms  ${c.label.padEnd(28)} ${c.detail}`);
}
const critFail = checks.filter(c => c.critical && !c.ok);
console.log('-'.repeat(72));
if (critFail.length) {
  console.log('❌ 关键项失败：' + critFail.map(c => c.label).join(', '));
  process.exitCode = 1;
} else {
  console.log('✅ 关键项通过。带 ⚠️ 的失败属网络环境差异，不影响主要功能。');
  process.exitCode = 0;
}
