# 能力覆盖与实测清单（可发布版素材）

- 机器：Windows 11 · DSH `0.2.0-rc.2`（web/desktop profile）· **无代理**（`netsh winhttp show proxy` = Direct access）
- 实测日期：**2026-10-16**（本机 Asia/Shanghai）
- 判定口径：**「✅ 实测」= 本机真发过请求并拿到有效结果**；**「❓ 未测」= 只在工具描述里见过，没验过**；
  **「❌ 被墙」= 本机连接失败**
- ⚠️ 所有网络结论都只用 **Node / Python** 取的。**本机 `curl.exe` 与 PowerShell 的 HTTPS 全部失败**
  （`schannel: SEC_E_NO_CREDENTIALS 0x8009030E`），用它们判断连通性会得到假阴性。

---

## 0. 一句话

**给 DSH 装上一套「任务驱动自学」能力：接到没有现成材料的任务时，自己去多个引擎和中文平台查、
读一手来源、把有用的留下、用它把活干完、不通就回去重查 —— 全程走官方 API，不用浏览器，不交 Cookie。**

---

## 1. 能搜哪些地方

### 1.1 综合搜索（`dsh-free-search`，声明 24 个引擎，全部接进 DSH 原生 `web_search`）

| 引擎 | 本机实测 | 备注 |
|---|---|---|
| **Bing（`zh-CN`，当前默认）** | ✅ | 免 key，国内直连 |
| **AnySearch** | ✅ | 免 key |
| **Exa** | ✅ | 免 key 档可用 |
| **Tavily** | ✅ | 官方 keyless 档（`X-Tavily-Access-Mode: keyless`） |
| **Keenable** | ✅ | 免 key，同 IP 共享 1000 请求/小时 |
| **Firecrawl** | ✅ | keyless `/v2` 可用，1000 credits/月 ≈ 500 次搜索 |
| **Parallel** | ✅ | 免 key |
| **DeepSeek 官方搜索** | ✅ | 按量计费，留作兜底 |
| 知乎全网搜索 / 知乎站内 | ⏳ | `zhihu_global` / `zhihu_site` 需 `ZHIHU_API_KEY`，**已配但待重启** |
| 百度 / Kimi / 阿里云 / 豆包 | ❓ 需 key | 有 key 即可用 |
| Perplexity / You / Serper / Serply / Jina / TinyFish | ❓ 需 key | 同上（Jina **本机 DNS 被污染 + TCP 阻断**，有 key 也没用） |
| **DuckDuckGo（含 lite）** | ❌ 被墙 | `UND_ERR_CONNECT_TIMEOUT` |
| **SearXNG（6 个公共实例）** | ❌ 被墙 | 全部 abort |

> ⚠️ **回退链顺序有坑**：那 5 个免 key 引擎排在**第 17–21 位**。首选引擎一挂，
> 要先烧 16 个才轮到能用的。**建议首选固定为 `bing`。**

### 1.2 中文平台

| 目标 | 工具 | 实测 |
|---|---|---|
| **微信公众号（搜索）** | `weixin_search` / `weixin_search_all`（搜狗微信，支持翻页） | ✅ 搜「AI Agent 记忆」→ 10 条；搜「量子位」→ 11 条 |
| **微信公众号（正文）** | `get_weixin_article_content` | ✅ 拿到整篇干净正文（实测 3.4 MB 页面 → 无 HTML 噪声） |
| 中文网页 | `domain_search` → `sogou` / `so360` | ✅ sogou 实测 5 条真结果（CSDN / 博客园 / 36氪） |
| 中文 AI 资讯 | `domain_search` → `aihot` | ✅ 实测 3 条带日期的 AI 新闻 |
| **B站字幕** | `research/bili-probe/bili_subtitle.py` | ✅ 走 `x/v2/dm/view` 匿名取字幕（实测 47 / 53 cue） |
| B站无字幕时 → 本地转录 | `research/bili-probe/bili_fetch_asr.py` | ✅ 匿名取音频 + 本机 SenseVoice ONNX（239 MB，**已在本机**） |
| **知乎（官方开放平台）** | `zhihu_search` / `zhihu_global_search` / `zhihu_hot_list` / `zhihu_knowledge_search` | ⏳ 工具**待新会话**；**直连官方 API 已实测通过**（全网搜索 5000/天、站内 5000/天、直答 100/天） |
| 小红书 | — | ⛔ **明确不做**（封号风险） |

### 1.3 学术与文献

| 目标 | 工具 | 实测 |
|---|---|---|
| **跨源去重检索** | `pubmed_search_papers`（PubMed + Europe PMC + OpenAlex） | ✅ 295/5258/31092 → 去重 9，带 OA 标记 |
| 26 个 PubMed 系工具 | `pubmed_*` | ✅ 部分实测：检索、Europe PMC、OpenAlex 均通 |
| OpenAlex 单源 | `domain_search` → `openalex` | ✅ 实测 3 篇带被引数 |
| Crossref / arXiv / Semantic Scholar / DOAJ / Europe PMC / bioRxiv / CORE / dblp / Zenodo | `domain_search` | ❓ 未逐个测（底层 API 早前测过：Crossref/DOAJ/PubMed ✅；arXiv 限 1 请求/3 秒；S2 匿名池饱和） |
| **开放获取 PDF** | `pubmed_fetch_pdf_oa` | ❓ 未测（声明支持，含批量下载） |
| Zotero 本地库 | `dsh-zotero` | ❓ 未装 |

### 1.4 代码 / 社区 / 百科

| 目标 | 工具 | 实测 |
|---|---|---|
| GitHub 仓库 / issue / release | `domain_search` → `github_releases`；`platform_search` → `github` | ✅ release 实测通过（拿到 v5.10.7 的完整更新说明） |
| npm / PyPI / crates / Maven / NuGet / Docker Hub… | `domain_search` → `pypi` / `crates` / `registries` | ❓ 未逐个测（npm registry 本机 ✅） |
| Hugging Face 模型 | `domain_search` → `huggingface` | ❓ 未测（hf-mirror.com 本机 ✅） |
| Stack Overflow / Hacker News / Reddit / V2EX | `platform_search` | ⚠️ 实测：`stackoverflow` 返回「No results found」，`v2ex` fetch 失败 —— **需重测** |
| Wikipedia | `platform_search` → `wikipedia` | ❌ **API 被墙**（en/zh 均超时）；但 **`dumps.wikimedia.org` 可达**（能下离线 dump） |
| Wikidata | `domain_search` → `wikidata` | ❌ **ECONNRESET**（被墙）。**替代：Qlever Wikidata SPARQL 实测可用** |
| Google News RSS | `domain_search` → `googlenews` | ❌ **ETIMEDOUT**（被墙） |
| 中文财经/公告 | `cninfo`（A股公告 PDF）/ `cfets`（人民币中间价）/ `yahoo`/`imf`/`worldbank`/`sec_edgar` | ✅ cninfo 实测拿到年报 PDF 直链；✅ cfets 实测 `USD/CNY 6.72200` |
| 工具类 | `worldclock`（本地零网络）/ `holidays` / `openmeteo` / `rdap` / `gleif` / `endoflife` / NVD / OSV / CISA KEV | ❓ 未逐个测（`weather` 工具独立可用） |

### 1.5 长文与视频的「读懂」

| 能力 | 工具 | 实测 |
|---|---|---|
| 多源一键调研（搜索+抓正文+出简报） | `research` | ✅ 实测（12 来源 / 12 文档） |
| 跨源并发搜索去重 | `multi_search` | ✅ 声明支持，实测同 `free_search_test` 路径 |
| 带时间过滤的搜索 | `advanced_search` | ✅ |
| 视频检索 | `video_search` / `platform_search` → `bilibili`/`youtube`/`vimeo` | ❓ 未测（YouTube 本机不可达） |
| 精读（观点/证据/置信度/费曼） | `deepread`（5 模式） | ⚠️ `quick` ✅；**`map` 对长文 3 次重试全废**；`export` **不落盘** |
| 书/论文/视频/网页 → 带引用笔记 | `deep-read-summarize` | ✅ 转录路径实测通过（131 s 视频 → 869 字）；⚠️ 需 `av` pin |
| 结果缓存复用 | `cache_search`（7 天内抓过的页面全文） | ✅ |

---

## 2. 装了哪 6 个插件

| 包 | 版本 | 作用 |
|---|---|---|
| `@klarkxy/dsh-zhihu` | 0.2.4 | 知乎官方 API（搜索/综合/热榜/直答/知识库/配额面板） |
| `dsh-free-search` | 0.8.10 | 免 key 多引擎，接进原生 `web_search` |
| `deep-read-summarize` | 0.3.13 | 精读 + 视频转录 |
| `dsh-deepread` | 1.0.1 | 观点—证据—置信度、费曼读书法 |
| `dsh-wechat-mp-search` | 0.1.1 | 公众号搜索 + 正文（自带 MCP server） |
| `dsh-pubmed` | 0.4.4 | 26 个学术工具 |

外加：**1 个自写行为技能**（`research-autonomy`）+ **1 套知识库目录规范**（`_knowledge\`）。

---

## 3. 真正的卖点（可验证，非口号）

1. **把「自学」做成了可执行的硬规则，不是提示词。**
   技能强制：先说出缺口 → 搜 → 读一手来源 → 落档 → 用它干活 → 不通回去重查（3 轮上限）。
   并硬性禁止：凭记忆答可变事实、引用没打开过的链接、编造工具名、查完不写。
   **实测行为三连全过**（缺口先行 / 5 段失败→改→重试轨迹 / 断网如实报错不编造）。
2. **中文优先，且踩过的坑都写下来了。**
   公众号搜+读全文、B站字幕（`dm/view` 这个"文档化接口全空但前端接口能用"的坑）、
   搜狗/360、知乎官方 API —— 都是国内环境里真跑通的路子。
3. **零 key 即可用。** 8 个免 key 搜索引擎 + 微信 + B站 + 本机转录，**不填任何 key 就能跑**。
4. **不封号。** 全程官方 API，**零 Cookie、零扫码、零浏览器**；主动排除小红书。
5. **结论带来源与置信度，并强制落档。** 每条断言附实测来源，`_knowledge\` 可 grep、可 diff、可跨引擎复用。
6. **诚实。** 内置缺陷清单与「被墙清单」，不假装全能。

---

## 4. 已知缺陷（发 GitHub 前建议先修）

| # | 位置 | 缺陷 |
|---|---|---|
| D-1 | `deep-read-summarize` | **没 pin `av`**：`faster-whisper 1.2.1` 用 `av.open(metadata_errors=)`，av 19.x 删了它 → **干净机器转录 100% 失败**（19.0.x FAIL / 18.1.0 OK） |
| D-2 | `dsh-deepread` | `map` 模式对长文稳定失败（3 次重试全废） |
| D-3 | `dsh-deepread` | `export:"md"` **不落盘 = 静默假成功** |
| D-4 | `@klarkxy/dsh-zhihu` | headless 组合下必然 pending（需 `connection` + `webServer`） |
| D-5 | 知乎知识库 | **上传报 `40006 file parsing failed`**（库已存在、检索可用，只有写不进去） |
| D-6 | 知乎 PDF/PPT | 平台有 API，但插件 v0.2.4 **没曝出工具**，`tools` 池 10 次用不出去 |

---

## 5. 发 GitHub 前**必须**处理的

| # | 事项 | 为什么 |
|---|---|---|
| 1 | **把 `_secrets\zhihu.env` 从仓库剔除**，换成 `.env.example` + 环境变量说明 | 密钥已进过聊天记录，**顺手轮换一枚** |
| 2 | **绝对路径全部参数化** | 现在脚本里写死 `<HOME>\...`，别人拿去跑不了 |
| 3 | **补依赖声明**：Node 版本、pnpm、Python（`av<19`）、`yt-dlp`/`ffmpeg`、SenseVoice 模型从哪来 | 否则别人装完必踩 D-1 |
| 4 | **明确写清 profile 参数**（`--profile desktop` vs `web`） | 装错 profile 是本机最大的坑，文档里必须点名 |
| 5 | **写清第三方插件的使用条款与合规边界** | 抓取类能力有平台条款约束，别给人留下"作者鼓励违规"的印象 |
| 6 | **标注实测环境与日期** | 网络可达性会变；本文所有 ✅/❌ 都限「2026-10-16 · 无代理 · 中国大陆出口」 |

---

## 6. 不建议在宣传里说的话（会过度承诺）

- ❌「支持 Wikipedia / Wikidata」→ **API 本机全被墙**（只有 dumps 与 Qlever 可用）
- ❌「支持 Google 系」→ Google News RSS、YouTube、translate.googleapis.com **全部超时**
- ❌「37 个垂直源全部可用」→ 只有采样过的几个验过，`wikidata`/`googlenews` 实测失败
- ❌「支持小红书」→ 明确不做
- ❌「登录墙内容都能读」→ 无浏览器、无 Cookie，登录墙除公众号外读不了
- ❌「导出报告」→ `deepread` 的 export **实测不落盘**，别宣传
- ❌「全平台转录」→ 转录依赖本机模型与 `av` pin，且 **YouTube 不可用**

---

## 7. 复现本文结论的最短路径

```powershell
# 1) 搜索引擎实测（会打印每个引擎的 OK/FAIL 与原因）
#    在会话里调 free_search_test 工具

# 2) 公众号
#    weixin_search "AI Agent 记忆"  → get_weixin_article_content <永久 /s/ 链接>

# 3) B站字幕（判据：dm/view 有轨才算有字幕）
node research\bili-probe\verdict_probe.py BV1GJ411x7h7 BV1nCWc6KEfS BV1aWHC6wE6G

# 4) 知乎额度与真实可用量
node -e "..."   # GET https://developer.zhihu.com/api/v1/quota（带 Authorization + X-Request-Timestamp）

# 5) 跨源学术
#    在会话里调 pubmed_search_papers
```
