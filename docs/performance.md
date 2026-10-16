# 性能实测与提速方案

- 实测时间：**2026-10-16**（Asia/Shanghai）
- 样本：本会话 `session-1eb04003` 的完整事件日志（2253 条事件、**16 个已完成轮次、376 次工具调用**）
- 方法：解析 `~\.dsh\sessions\...\session.v4.jsonl.zstd`（多帧 zstd，按 magic `28 B5 2F FD` 切帧逐帧解压），
  用 `turn/start`→`turn/end` 界定轮内时间，用 `tool/call.data.callId` ↔
  `tool/result.data.message.toolCallId` 配对算工具耗时。
  **注意剔除 `turn/end` → 下一轮 的间隔 —— 那是你在打字，不是计算。**

---

## 一、总账：时间花在哪

**轮内总时长 61.9 分钟 / 16 轮（平均 232 秒/轮，每轮 23.5 次工具调用）**

| 类别 | 时长 | 占比 |
|---|---|---|
| **模型生成** | **31.0 min** | **50.0%** |
| **工具执行** | **30.9 min** | **50.0%** |

**一半一半。** 所以提速要同时打两边 —— 但两边的打法完全不同。

---

## 二、工具侧：`pwsh` 一个吃掉 86%

| 工具 | 次数 | 总耗时 | 单次最大 | 平均 |
|---|---:|---:|---:|---:|
| **`pwsh`** | **157** | **1719s** | **574.4s** | 11.0s |
| `free_search_test` | 3 | 139s | 135.7s | 46.3s |
| `domain_search` | 8 | 38s | 21.1s | 4.7s |
| `web_fetch` | 15 | 34s | 19.4s | 2.3s |
| `web_search` | 4 | 29s | 8.4s | 7.2s |
| `pubmed_search_papers` | 1 | 27s | 26.8s | 26.8s |
| `platform_search` | 2 | 12s | 11.0s | 5.8s |
| **`weixin_search`** | 1 | **4.6s** | | 4.6s |
| **`get_weixin_article_content`** | 1 | **1.4s** | | 1.4s |
| `grep` / `write` / `edit` / `read` | 166 | **6s** | | ≈0.03s |

**两个关键事实：**

1. **`pwsh` 占工具总耗时 1719/2007 = 86%。**
2. **新插件其实非常快**（微信搜 4.6s、读全文 1.4s、本地读写 0.03s）
   —— **慢的不是插件，是我用手搓 shell 干活。**

### `pwsh` 的耗时分布（极端长尾）

```
157 次调用，总计 1719s，中位数只有 1.2s

  > 60s  :   4 次  →  占 61%   ← 四条命令吃掉近三分之二
  > 10s  :  19 次  →  占 86%
  < 2s   : 102 次  →  只占 5%
```

**这就是全部问题所在：中位数 1.2 秒完全健康，是那 4 条命令毁了总账。**

### 最慢的 4 条命令（原文）

| 耗时 | 命令 | 该不该这么慢 |
|---|---|---|
| **574.4s** | `install-research-autonomy.ps1`（6 个包 pnpm 安装） | 一次性成本，可接受。但**可以只装必需的 2 个**、或并行 |
| **213.7s** | 全工作区扫密钥泄漏：`Get-ChildItem <workspace> -Recurse -File \| ForEach { ReadAllText }` | ❌ **纯浪费**。工作区里有 `decks\` **2.0 GB**、`assets\` **570 MB**、`PPTAgent\` **321 MB**、`runtime\` **192 MB** —— 全被扫了 |
| **143.5s** | 我自己的延迟基准（21 源 × 3 次） | 一次性测量成本，正常 |
| **120.0s** | `(Get-Content 11MB.json -Raw \| ConvertFrom-Json)` | ❌ **PowerShell 的 `ConvertFrom-Json` 在 11 MB 上极慢**。同一件事用 Node 只要秒级（我后来就是这么做的） |

另有两条 **50.7s + 43.9s**：24 个包**逐个串行** `npm view`（每次都要走 registry）。

---

## 三、逐源延迟（真实基准，每源 3 次取中位）

### ✅ 在用的源都很快（100 ms – 1.8 s）

| 源 | 中位 | 源 | 中位 |
|---|---:|---|---:|
| 知乎 热榜 | **143ms** | OpenAlex | 726ms |
| 知乎 额度查询 | 203ms | Europe PMC | 726ms |
| 搜狗微信搜索 | 121ms | Qlever Wikidata | 1143ms |
| GitHub API | 102ms | 公众号正文抓取 | 1364ms |
| B站 view（取 cid） | 69ms | PubMed ESearch | 1407ms |
| arXiv | 56ms | Tavily keyless | 1822ms |
| Exa keyless | 211ms | Crossref | 399ms |
| Bing 网页 | 314ms | DOAJ | 448ms |
| Firecrawl keyless | 455ms | 知乎 全网/站内搜索 | 534 / 466ms |

### ❌ 慢的全是「被墙的」（10.7 s 超时）

| 源 | 中位 | 状态 |
|---|---:|---|
| DuckDuckGo HTML | **10814ms** | 连接超时 |
| Wikipedia API | **10743ms** | 连接超时 |

**⚠️ 这才是隐藏杀手**：`free_search_test` 一次 135.7s，就是因为把这两个（加上 SearXNG 的 6 个公共实例）
拉进来等超时。**它们每个都要烧 10.8 秒。**

---

## 四、提速方案（按收益排序）

### 🥇 第一优先：消灭长尾（几乎零成本，回收最多）

| # | 做法 | 收益 |
|---|---|---|
| **1** | **永远不要 `Get-ChildItem -Recurse` 整个工作区。** 用 `grep`/`glob` 工具，或 `-Path` 限定到 `_secrets`/`docs`/`tools`/`research`/`_knowledge` | 213.7s → < 2s |
| **2** | **大 JSON 用 Node 解析，不用 `ConvertFrom-Json`** | 120.0s → ~1s |
| **3** | **批量查询用 Node 并发 `fetch` registry**，别串行 `npm view` | 95s → ~5s |
| **4** | **`free_search_test` 只测你关心的引擎**，别让它去撞 ddg / searxng | 135.7s → ~5s |
| **5** | **首选引擎固定 `bing`**（避免回退链踩 10.8s 超时） | 避免每轮白等 |

**这 5 条合计可回收约 9–10 分钟 / 单轮场景里最高可省 20–30%。**

### 🥈 第二优先：减少轮次（模型占 50%）

| # | 做法 |
|---|---|
| **6** | **一个回合并行发多个工具调用**（harness 支持；本次平均每轮 23.5 次调用，仍有大量可并行） |
| **7** | **用 `research` 一次完成「搜索 + 抓正文 + 出简报」**，别 search → fetch → fetch → fetch 串四轮 |
| **8** | **用 `multi_search` 代替串行试引擎**（一次并发多引擎并去重） |
| **9** | **同类操作合成一个脚本**跑完，而不是拆成 5 次 `pwsh` |

### 🥉 第三优先：缓存与上下文

| # | 做法 |
|---|---|
| **10** | **`cache_search`** 复用 7 天内抓过的页面全文，不重复联网 |
| **11** | **`_knowledge` 落档** —— 同类问题不重复调研（本次已建成，实测有效） |
| **12** | **长材料写文件，别留在对话里** —— 上下文越长每轮越慢 |
| **13** | **本地先过滤再把片段给模型**（grep 出相关行，而不是整篇丢进去） |

### 结构性

| # | 做法 |
|---|---|
| **14** | **能固化成脚本的就固化** —— `verdict_probe.py`、`bili_subtitle.py` 已经是秒级工具，这就是正确形态 |
| **15** | **别反复跑 `--dump-config`**（要加载整棵插件树）；只在改动后跑一次 |
| **16** | **插件安装是分钟级**（pnpm + 供应链校验）—— 一次装齐，别零敲碎打 |

---

## 五、量化预期

| 场景 | 现状 | 优化后（估） |
|---|---|---|
| 单轮 232s | 模型 116s + 工具 116s | 模型 116s + 工具 ~50s → **约 170s（−27%）** |
| 16 轮任务 62 min | 模型 31 + 工具 31 | 模型 ~25 + 工具 ~15 → **约 40 min（−35%）** |
| 一次「搜+读3篇+总结」 | 4 次工具 + 2 轮模型 | `research` 1 次工具 + 1 轮模型 |

**最大的单点收益是第 1 条**：工作区里躺着 **3 GB 的 PPT 资产**（`decks\` 2.0 GB、
`assets\` 570 MB、`PPTAgent\` 321 MB、`runtime\` 192 MB），任何无脑递归都会把它们全读一遍。
**这一条不改，换多快的模型都会被拖死。**

---

## 六、怎么自己复测

```powershell
# 逐源延迟（21 个源 × N 次）
$env:RUNS='3'; node _tmp\latency-bench.mjs

# 轮内拆分 + 工具耗时排名（读最新会话日志）
$s='<DSH_HOME>\sessions\--C-Users-46685-Downloads-dshPPTworks--'
$cur = Get-ChildItem $s -Recurse -File -Filter 'session.v4.jsonl.zstd' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
node --max-old-space-size=4096 _tmp\session-timing4.mjs $cur.FullName

# 最慢的 shell 命令原文
node --max-old-space-size=4096 _tmp\slow-pwsh.mjs $cur.FullName
```

> ⚠️ 会话日志是**多帧 zstd 拼接**，单次 `zstdDecompressSync` 只能解第一帧；
> 必须按 magic 切帧逐帧解压（本文脚本已处理）。
