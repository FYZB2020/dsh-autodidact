---
topic: keyless APIs + DSH plugins for agent self-education (mainland China, no proxy, no browser)
date: 2026-10-16
confidence: high (reachability/limits/WeChat/Bilibili/知乎日报/plugins measured directly); medium on Bilibili login-cookie inference and a few free-tier numbers
task: Research free/keyless official APIs an AI agent can use to learn a topic mid-task, plus DSH plugins/MCP servers wrapping them
sources:
  - https://info.arxiv.org/help/api/tou.html
  - https://help.openalex.org/api/authentication/
  - https://www.semanticscholar.org/product/api
  - https://core.ac.uk/services/api
  - https://doaj.org/api/v3/docs
  - https://api.biorxiv.org/
  - https://operations.osmfoundation.org/policies/nominatim/
  - https://mymemory.translated.net/doc/usagelimits.php
  - https://ai.youdao.com/DOCSIRMA/html/trans/api/wbfy/index.html
  - https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/README.md
  - https://raw.githubusercontent.com/SYSTRAN/faster-whisper/master/README.md
  - https://raw.githubusercontent.com/dawnswwwww/zhihu-cli/main/skills/zhihu-cli/references/api-reference.md
  - https://raw.githubusercontent.com/jack1545/dsh-weixin-reader/main/README.md
  - https://raw.githubusercontent.com/iTraceur/dsh-wechat-mp-search/main/README.md
  - https://raw.githubusercontent.com/Vncntvx/dsh-zotero/main/README.md
  - https://dshbase.com/zh/plugins/directory/
  - https://registry.npmjs.org/ (per-package metadata)
---

## Gap

Which keyless/free official APIs let a DSH agent learn a topic while doing a task, on a
Windows box in mainland China with **no proxy** and **no browser automation** (a Zhihu
official-platform key and a search plugin already exist)? Which DSH plugins / MCP servers
wrap them, and which need a key or GitHub access?

## What I found

### Environment gotcha that invalidates naive testing (IMPORTANT)
- `curl.exe` and `Invoke-WebRequest` **cannot do HTTPS** from a DSH shell on this machine:
  `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030E)`. Plain HTTP works.
- **Node's bundled TLS works for both.** Script API calls with Node (or Python), not `curl.exe`.
- `npm view` fails with `EPERM` because npm's cache is outside the workspace. Use
  `https://registry.npmjs.org/<pkg>` over HTTPS instead (and `registry.npmmirror.com` is ~4x faster).
- The workspace `_tmp\` folder got swept mid-session; use a fresh filename or a subdirectory per run.

### Reachability (no proxy, measured 2026-10-16)
- **Blocked (TCP timeout):** all `*.wikipedia.org`, `api.wikimedia.org`, all `*.wikidata.org`,
  `*.wiktionary.org`, `*.wikisource.org`, `foundation.wikimedia.org`, `www.mediawiki.org`,
  `meta.wikimedia.org`, `nominatim.openstreetmap.org`, `overpass-api.de`, `news.google.com`,
  `youtube.com` (+ `/api/timedtext`), `translate.googleapis.com`, `translate.google.com`,
  `huggingface.co`, `searx.be`, `html.duckduckgo.com`, `search.brave.com`, `r.jina.ai`,
  `rsshub.app`, `wikiwand.com`, `library.kiwix.org`, `download.kiwix.org`, `archive.org`,
  `web.archive.org`, and every CORS bridge (allorigins/codetabs/corsproxy/cors.lol).
- **Works:** arXiv, Semantic Scholar, OpenAlex, Crossref, Unpaywall, NCBI E-utils, DOAJ, CORE,
  bioRxiv, Europe PMC, OpenAIRE, HAL, DataCite, OSF, DBpedia, **Qlever Wikidata SPARQL**,
  **dumps.wikimedia.org**, MDN, DevDocs, npm/npmmirror, PyPI (+Tsinghua/Aliyun), crates.io,
  jsDelivr/fastly, ghfast.top/gh-proxy.com/ghproxy.net, Bing/Baidu/Sogou/360/Mojeek,
  **mp.weixin.qq.com**, **weixin.sogou.com**, **news-at.zhihu.com**, Bilibili APIs,
  `www.stats.gov.cn`, `www.gov.cn`, MyMemory, 有道/百度翻译, DeepL-free, `hf-mirror.com`,
  `rsshub.ktachibana.party`, wechat2rss/werss/feeddd, dshbase.com.
- **Service-side blocks (a proxy will NOT fix):** `data.stats.gov.cn` 403, `baike.baidu.com` 403,
  `www.zhihu.com`/`zhuanlan.zhihu.com` 403 (ZSE), `www.zhihu.com/api/v4/*` 403 (10003/40362),
  `www.gsxt.gov.cn` 521, `www.creditchina.gov.cn` 412, `libretranslate.com` 403, Bilibili `search/type` 412.
- **GitHub was reachable today with no proxy** (`github.com`, `api.github.com`,
  `raw.githubusercontent.com`, `codeload.github.com` all 200) — contradicts the standing premise. Treat as intermittent.
- **GDELT is reachable but unusable**: DOC API aborted at 12 s and 20 s.

### Rate limits (from response headers = machine truth, plus official docs)
- OpenAlex keyless: **10 rps** and a **$0.10/day budget shared with everyone on your IP**
  (`x-ratelimit-limit=1000`, `cost=$0.0001`). `mailto=` **does not** raise it (stated in the body).
  Free key (agent-requestable via `POST https://api.openalex.org/api-keys {"email":...}`) = 30 rps, $1/day.
  **Cursor paging past page 1 requires a key.**
- Crossref: `limit=3`, `interval=1s`, concurrency 3.
- NCBI E-utilities: `x-ratelimit-limit=3` (3 rps keyless; 10 with a free key).
- CORE: **free, no registration**; "one batch request or five single requests per 10 seconds".
- DOAJ: 2 rps, bursts to 5 queued; API keys are for publishers only.
- bioRxiv: 100 articles/call; **interval/DOI-based only, no keyword search**.
- arXiv: **1 request / 3 s, single connection**; API returns HTTP 200 even when throttled.
- S2: keyless = 1000 rps shared by ALL anonymous users (saturated → I got 429 twice); free key = 1 rps dedicated.
- Unpaywall: real email mandatory (placeholder → 422).
- MyMemory: **5000 chars/day anonymous, 50 000 with a valid `de=` email**; `q` ≤ 500 bytes.
- GitHub: 60 req/hr core, 10 req/min search, unauthenticated.

### The three highest-value discoveries
1. **mp.weixin.qq.com fetches fine keylessly.** Reproduced: `.../s/qxovbSFCVCVb54OgICsijw` → 200,
   3.5 MB, `id="js_content"` present, `var msg_title`/`var ct` extractable, 24 `data-src` images,
   2946 chars of clean body text. No browser, no key, no cookie. Caveat: `var nickname` was EMPTY.
   Discovery side: `weixin.sogou.com/weixin?type=2&query=` → 200, 10 results, no captcha.
2. **`dumps.wikimedia.org` is reachable** (zhwiki/wikidatawiki listings + a real file downloaded) —
   Wikipedia/Wikidata are obtainable offline without a proxy, even though every Wikimedia API is blocked.
   **Qlever Wikidata SPARQL** (`qlever.cs.uni-freiburg.de/api/wikidata?query=`) also works and returns
   real data — but `wd:`/`wdt:` are **not** pre-registered, so declare every PREFIX.
3. **知乎日报 legacy API is keyless and returns full bodies**: `news-at.zhihu.com/api/4/news/latest`
   and `/api/4/news/{id}` → 200 with a 3,285-char HTML body. Meanwhile `www.zhihu.com` and
   `api/v4` are ZSE-protected (403). Official 知乎 open platform is far richer than assumed
   (global_search 全网搜索, zhida, knowledge-base RAG, pdf_parse, ppt_generation) but
   `question_answers` returns **summaries only**, and full text works **only for your own content**.

## How to use it

- **Read a 公众号 article, no browser/key:** plain host `fetch` of `mp.weixin.qq.com/s/<id>`, parse
  `id="js_content"`. Existing DSH options: `dsh-wechat-mp-search` (npm ✅ + ships an MCP server ✅,
  covers Sogou search + article body), `@wjx-ai/dsh-wx-reader` (npm ✅, Python3 stdlib, no key),
  `dsh-wechat-article-fetcher` (npm ✅, includes a standalone CLI:
  `node lib/fetch_wechat_article.cjs "<url>" [--cookie] [--no-images] [--out] [--json] [--max-retries]`),
  `dsh-ab-wechat-scrape` (npm ✅, writes Markdown), and `github:jack1545/dsh-weixin-reader`
  (**GitHub-only — npm 404**, as suspected; uses host `fetch`, not a subprocess, because piped
  stdio is EPERM-blocked in the sandbox).
- **Scholarly, no key:** arXiv + OpenAlex + NCBI/Europe PMC + Crossref + Unpaywall. Best bundled
  option: **`dsh-pubmed@0.4.4`** — 26 tools over PubMed, Europe PMC, OpenAlex, PubTator3, Semantic
  Scholar, with **all keys optional** (they only raise rate limits).
- **Reference when Wikipedia is blocked:** Qlever Wikidata SPARQL + `dumps.wikimedia.org`.
- **Translation, no key:** MyMemory (`api.mymemory.translated.net/get?q=&langpair=en|zh-CN`) — the only
  keyless one that works here. Google's unofficial endpoint is blocked.
- **GitHub when it's flaky:** jsDelivr / ghfast.top / gh-proxy.com / ghproxy.net (all verified 200).
- Plain-Markdown persistence needs **nothing** — no storage API required.

## What it changes

- Don't build around "GitHub is unreachable" — re-test; and keep a mirror fallback either way.
- Don't spend effort on Wikipedia/Wikidata *APIs*; go straight to dumps + Qlever.
- Don't waste time on GDELT, Nominatim, YouTube, or Google News from this network.
- Prefer npm-installable plugins: they avoid GitHub entirely. All seven named plugins
  (`dsh-ai4scholar`, `dsh-zotero`, `dsh-knowledge`, `dsh-library`, `deep-read-summarize`,
  `dsh-deepread`, `dsh-kb-rag`) exist on npm. Only `dsh-ai4scholar` **requires** a key
  (AI4Scholar credits); the rest are keyless. `dsh-zotero` needs Zotero 7+ desktop running.
- Watch `@copylee/dsh-academic`'s CNKI/Google Scholar paths — they use a **browser**, which is out of scope.

## Still unknown

DeepL API Free's 500k chars/month (pricing page showed Translator plans only); 百度翻译 free tier
(docs are a JS shell); Wikimedia's User-Agent policy text (**its own pages are blocked**);
Unpaywall's daily cap; GDELT's keyless status; whether Bilibili subtitles truly require `SESSDATA`
(12/12 sampled videos empty for anonymous callers — strong inference, not documented);
`yt-dlp`'s Bilibili extractor support; the `HF_ENDPOINT` mirror mechanism for faster-whisper.
Unblocking: a proxy, or pasting the specific doc text in.
