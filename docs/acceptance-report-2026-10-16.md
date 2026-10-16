# 测试任务清单 执行报告（docs\测试任务清单.md）

- 执行时间：2026-10-16 14:42 – 16:05（Asia/Shanghai）
- 执行者：DSH 会话 `session-e6612454`（本报告即「逐条跑并回报」的回报）
- 原始证据目录：`_tmp\`（探针脚本与 JSON）、`_tmp\t19\REPORT.md`、`_tmp\t21\T21-EVIDENCE.md`、`_tmp\probe-wechat\`、`_tmp\probe-pubmed\`、`_tmp\probe-free-search\`

## 0. 一句话结论

**清单里最关键的判据（T-03/T-04/T-05 行为、T-15/T-16/T-18/T-19/T-21 主链路）全部通过。**

**T-01 是动态的**：会话开始时工具表只有 40 个、`zhihu`/`weixin`/`pubmed`/`deepread` 一个都没有；
跑到中途（15:55 左右）这批工具**真的挂进了这个会话**，我随即用真工具重测，`weixin_search`/
`get_weixin_article_content`/`pubmed_search_papers`/`research`/`domain_search`/`deepread`
全部实调成功。**仍然缺的只有 zhihu 家族**（它要 `connection`+`webServer` 服务，依赖 Web 层）。

另外发现 **4 处插件真实缺陷**（不是配置问题），以及 **4 处清单描述与实测不符**。

---

## 1. Tier 0 — 逐条结果

| # | 结论 | 证据 |
|---|---|---|
| T-01 | ⚠️ **先 FAIL 后 PASS（顺序很重要）** | ① 会话开始时：工具表 40 个，目标 8 个工具 **0 个**；根因是会话跑在 `desktop` profile（有 `mcp-tapnow`+Agent Teams 工具，与 `desktop\cordis.patch.yml` 一致），6 个研究插件装在 `web` profile。用 `--profile research`（headless+同批插件）实跑得 63 个工具，pubmed 26 / wechat 3 / deepread+research / free-search 一族齐全，唯一缺 zhihu（`pending (waiting for services: connection, webServer)`，因 `tools.js:740` 的 `inject=["zhihu","tools"]` 与宿主半边的 Web 层依赖）。<br>② **会话中途工具表扩到 63+**，于是用真工具复测：`weixin_search`、`get_weixin_article_content`、`pubmed_search_papers`、`research`、`domain_search`、`free_search_test`、`advanced_search`、`multi_search`、`deepread` **全部实际调用成功**。<br>③ 仍缺：`zhihu_search` / `zhihu_global_search` / `zhihu_hot_list` / `zhihu_knowledge_search`（本会话从未出现） |
| T-02 | ✅ **PASS（用运行时证据，而不是静态配置）** | 本会话的搜索提供方说明块明确打印：`## Web search (free-search)` / `Current mode: bing` / `Bing market: zh-CN` / `Safe search: off`，并列出 24 个引擎与回退链。**⇒ 提供方已不是 `deepseek-official`**（静态 `--dump-config` 里那个值只是插件接管前的初值，free-search 在运行时改写它——与它的 patch 注释一致） |
| T-03 | ✅ **PASS** | 做了两次真实缺口先行：<br>① 「`dsh --dump-config-schema` 输出什么、patch 是深合并还是整段替换」→ 写出缺口 → `web_search`（3 条 query）→ `web_fetch` 官方 cordis 教程 raw 原文 → 跑本机 `--dump-config-schema` 拿 656 KB 一手 schema，产出 `_knowledge\notes\2026-10-16-dsh-dump-config-semantics.md`（引用原文 *"A patch config replaces the whole config."*）<br>② 用新挂上的 `research` 工具做了一次「12 来源、12 文档全抓取」的多源调研并核对 | 
| T-04 | ✅ **PASS** | 5 段可复核的失败→改法→重试轨迹：<br>① `--dump-config` 被沙箱 `EPERM ... cordis.yml` 拦下 → 判定为 profile 写权限 → 提权重跑成功；<br>② `--from-default-profile` 参数顺序试 3 种写法（`unknown default profile "research"` → `--profile research --from-default-profile headless`）；<br>③ 多行 prompt 被 CLI 静默丢掉 → 改单行重发成功；<br>④ 知乎直连报 `CALL_BLOCKED 本地保护存储不可用` → 读源码定位账本目录 → `ZHIHU_CALL_POLICY_DIR` 指到工作区后成功；<br>⑤ 首轮 `weixin_search` 用 `maxResults` 参数被忽略/报错（schema 只有 query/page）→ 按真实 schema 重发 |
| T-05 | ✅ **PASS** | 先做对照实验证明 URL 真不可达（裸 fetch `ENOTFOUND` 177 ms），再让工具碰它：`web_fetch` → `getaddrinfo ENOTFOUND this-domain-should-not-exist-20261016.invalid`；`web_search` 垃圾 query → `No results found.`。**都如实报失败，没有编造** |
| T-06 | ✅ **PASS** | `_knowledge\notes\` 新增 3 篇带 `sources` 的笔记，`index.md` 新增 3 行（最新在前） |

> ⚠️ 更正清单第 6 节第 1 条：**「重启 DSH + 新开一个会话」不足以拿到这些工具**。
> 桌面版重启后仍在 `desktop` profile；研究插件装在 `web` profile。
> 本次的实证更有意思：**在同一个会话里它们后来自己挂上了**——所以「老会话拿不到」也不是绝对的，
> 真正要看的是 profile 的插件树是否被重新装载。


---

## 2. Tier 1 — 逐条结果

| # | 结论 | 证据 |
|---|---|---|
| T-11 | ✅ **PASS（但要限定引擎）** | ① 独立探针：`searchBing("DSH 插件 挂载 不生效", 5, {})` 866 ms–8.7 s 返回 5 条真链接，抽 5 条做存活校验 4 条 HTTP 200 且 `<title>` 与标题一致；`searchAnysearch` PASS；`searchDdgHtml`/`searchDdgLite` **FAIL**（`UND_ERR_CONNECT_TIMEOUT`，DuckDuckGo:443 本机不可达，DNS 能解析）；`searchSearxng` FAIL（6 个公共实例全 abort）。插件默认回退链里 5 个免 key 引擎排在第 17–21 位（`BING_URL=https://www.bing.com/search`，`lib\index.js:41`）。<br>② **会话内 `free_search_test` 实测同一结论**：`bing: OK (2 results)`、`anysearch: OK (2 results)`、`ddg: FAIL [transient] connection error: fetch failed`、`searxng: FAIL [transient] all SearXNG instances failed` |
| T-12 | ✅ **PASS** | `executeZhihuSearch("DSH 插件 挂载 不生效")` 返回 5 条真知乎链接+摘要+赞数；`executeZhihuGlobalSearch("faster-whisper 中文 转录 显存 占用")` 返回真全网结果。额度：zhihu_search 5000→4999，global_search 5000→4999。（注：本会话**没有** zhihu 工具，此项是用包代码直连官方 API 验的） |
| T-13 | ✅ **PASS** | `GET /api/v1/quota` `Code:0`，9 个池全部列出（`global_search` 5000 / `zhihu_search` 5000 / `hot_list` 100 / `question_discovery` 100 / `zhida_openai` 100 / **`tools` 10** / `knowledge` 500 / `user_data` 10000 / `creator` 200）。热榜另跑一次返回 3 条真问题 |
| T-14 | ✅ **PASS** | `executeZhihuAsk("DSH 插件被 profile 挂载后为什么新会话仍看不到工具？给出排查顺序")`，`model=zhida-thinking-1p5`，返回 10 步排查顺序 + 完整 `reasoning_content`，答案通顺且可执行。额度 100→99 |
| T-15 | ✅ **PASS（两条路径都实测）** | 上游 = **搜狗微信搜索**。① 独立探针：「机器之心」10 条 / 5754 ms / `blocked=false` / `error=null`；② **会话内真工具 `weixin_search`**：query「量子位」返回 **11 条**标题+链接，`blocked:false`。**重要发现**：Sogou 还原出的 `real_url` **20/20 全是临时签名链**（`src=11`/`src=3`+timestamp+signature），0 条永久链，另有 2 条 `real_url` 为空 |
| T-16 | ✅ **PASS（两条路径都实测）** | ① 独立探针用永久链 `https://mp.weixin.qq.com/s/ClFnYOXxaBmiql_E7Flxkg`：HTTP 200，**2172 字 / 46 非空行**，`isAntiSpider=false`，0 噪声、0 标签残留、0 实体残留；② **会话内真工具 `get_weixin_article_content`** 对同一链接返回干净正文全文（机器之心原创 / 编辑部署名 + 正文），无任何 HTML 噪声。两个真实缺陷已量化：**标题与发布时间不返回**（`extractArticleText` 从 `id="js_content"` 起切）；结束哨兵含 `<script`，本次在真正 `</div>` 前 2021 字节处切断（本次丢弃区 0 字正文，但设计脆弱）。另：连续第二次抓同一链接 15 s 超时，放宽到 45 s 成功（是慢，不是风控） |
| T-17 | ⚠️ **成功路径 PASS + 2 个真实缺陷** | ① **会话内真工具 `deepread`（quick 模式）实测成功**：对一段带「主张/证据/推断/无法确认」的短文产出了完整「核心论点 + 论证结构 + 核心概念 + 金句 + 批判性思考」，结构与要求一致。<br>② **`map` 模式对公众号长文实测失败**：`Error: 模型输出 3 次均未得到合法 JSON：底层错误（模型返回了空结果）；底层错误（模型返回了空结果）；输出被截断。` —— 3 次重试全废，**不是我的输入问题**。<br>③ **`export: "md"` 未落盘**：连续两次带 `export=md` 调用后，工作区内 `deepread-output/` 不存在、无任何 `.md/.mm/.html` 产出 —— 与工具自己声明的「文件写入工作区 deepread-output/ 目录」不符。<br>④ 独立验证部分：包内 `renderMarkdown` 纯函数真跑通，用它产出四档置信度逐条标注的报告（`_tmp\probe-wechat\deepread-result.md`，8512 B） |
| T-18 | ✅ **PASS（三条路径 + 独立复核）** | ① 独立探针：`pubmed_search_papers` 2494 ms，pubmed 5/413 + europepmc 5/2750 + openalex 5/7667 → 去重 14；`pubmed_search_articles` 413 命中；`pubmed_europepmc_search` 2750 命中。<br>② **会话内真工具 `pubmed_search_papers`**（`maxResultsPerSource=3`）返回 8 篇去重结果，含 5 篇 OA 直链。<br>③ 独立复核：3 个 top-5 列表共 9 个唯一 PMID 用裸 fetch 直问 NCBI **全部存在、DOI 一致**，8/9 标题逐字相同 |
| T-19 | ✅ **PASS（坑是真的，机制已复现）** | 三次真实 `dsh --profile research` 会话：run1（要求存文件）**Test-Path=True**，12108 B；run2（只要求核查）**Test-Path=False**、父目录都不存在 —— 精确复现清单里的坑；run3（中性措辞）模型**自主**落盘，14920 B。合约：`workflow.js` 把 script 内联，沙箱无 `fs/require/process/fetch/timer`；`index.js:103-115` 的 `apply()` 只注册 1 个 bundled skill，**不注册工具**，执行走宿主内置 `workflow` 工具（参数键 `meta,args,script`）；`SKILL.md:37` 第 8 步明确要求主代理 `write` 到 `filePath` |
| T-20 | ✅ **PASS** | `_knowledge\` 结构完整（`index.md` + `notes\` + `lessons\`），本次新增 3 篇无重复条目，index 每篇一行 |

---

## 3. Tier 2 — 逐条结果

| # | 结论 | 证据 |
|---|---|---|
| T-21 | ✅ **PASS（含一个必须修的插件依赖缺陷）** | 片源 `https://www.bilibili.com/video/BV1EKWc6hEmQ`（131 s，中文）。`yt-dlp -f 30280` 直接下到 `audio.m4a`（2,674,698 B，AAC 164k，无需 ffmpeg 转码）。`transcribe.js --self-check` 打印 venv/uv/python3.12 路径正确。<br>**第 1 次运行失败在推理而非下载**：uv/清华 pypi/hf-mirror 模型（`model.bin` 483,546,902 B，与 Content-Length 逐字节一致）全部成功，但 `faster-whisper 1.2.1` 调用 `av.open(..., metadata_errors=)` 报 `TypeError: open() got an unexpected keyword argument 'metadata_errors'` —— **faster-whisper 只声明 `av>=11`，而 av 19.x 删了该参数**，fresh venv 必然踩到。<br>**修复**：`uv pip install "av==18.1.0"`（19.0.1/19.0.0 实测 FAIL、18.1.0 OK）。<br>**第 2 次运行 133.5 s 成功**：`DONE zh 130.1` / `TRANSCRIBED 2409 bytes` → `_tmp\t21\transcript.txt`（2409 B，869 字符 / 86 段 / CJK 88.6%，内容是连贯的普朗克口播，与标题吻合）。<br>⚠️ **本机修的是 venv，插件依赖声明没改**：干净机器上仍会 100% 复现同一失败，需要插件侧 pin `av<19` |
| T-22 | ✅ **PASS（清单描述已过期）** | 清单说「实测：本机都缺，只有 uv 0.12.8」——**这是测试前的状态**。本次已装：`yt-dlp --version` → `2026.08.19`；`ffmpeg -version` → `ffmpeg version 9.0.2-full_build-www.gyan.dev`；`ffprobe` 同版本。winget 还顺带装了 `DenoLand.Deno` 与 `yt-dlp.FFmpeg` |
| T-23 | ❌ **NOT INSTALLED（版本约束也不成立）** | 三个 profile 都没装 `dsh-video-lens`。npm registry 上该包只有 `0.3.1` 和 `0.3.2` 两个版本，`latest = 0.3.2` —— 所以「必须 ≥0.3.2」只能装 0.3.2，没有更高版本可选 |
| T-24 | ⚠️ **半通过：检索通、上传不通、知识库其实已初始化** | ① 清单说「库数=0，须先去初始化」——**已过期**：`GET /api/v1/knowledge/bases?Scope=all` 返回 1 个 `IsDefault: true` 的「默认知识库」（`7697152005729136137`，`ContentCount: 0`，创建时间就在今天）。② **检索 PASS**：`POST /api/v1/knowledge/search` `Code:0`，真实召回一篇 docx 讲义正文片段（带 `RecallContentID`/`OriginUrl`）。③ **上传 FAIL**：`.md`（455 B）与最小合法 `.pdf`（660 B）**都返回 `Code:40006 file parsing failed`**；`GET /knowledge/bases/<id>/items` → `Items: [], Total: 0`。40006 在代码里映射为 `INVALID_ARGUMENTS`，不是额度错误。本项共消耗 `knowledge` 池 4 次 |
| T-25 | ❌ **无实现可测** | `@klarkxy/dsh-zhihu` v0.2.4 **没有 `pdf_parse` 工具**。`lib/tools.js` 只注册 5 个搜索类 + 7 个 open-platform 工具；`tools` 池只出现在额度映射正则里（`open-platform.js:39`，`/api/v1/(pdf-parse\|ppt-generation)/tasks`），没有调用方。清单要求的 `pdf_parse` 与「分页 blocks」在当前插件里不存在 → `tools` 池 10 次额度**一次都没花** |
| T-26 | ❌ **无实现可测** | 同上：没有 `ppt-generation` 工具。清单说的「同一池 10 次/天」在代码里能确认（`zhihuQuotaGroup` 把这两个路径映射到 `tools`），但工具本身不存在 |

> ⚠️ 更正清单：「`tools` 池只有 10 次/天，别乱试」是对的，
> 但在当前插件版本下 **T-25/T-26 根本没东西可试**——不是额度风险，是能力缺口。


---

## 4. Tier 3 — 逐条结果

| # | 结论 | 证据 |
|---|---|---|
| T-31 | ✅ **PASS（错误不静默）** | 读码确认 `30001/30002/40003` → `RATE_LIMITED`，错误信息带 `code=30002` 与 `retryable: true`（`open-platform.js:396-427`）。无法人为把 100/天 用完（那要 100 次调用），改为**代码级确认 + 5000/100 的实测量级**：额度耗尽是显式抛错，不是静默空返回 |
| T-32 | ✅ **PASS（有专门分支 + 永不自动重试）** | `code === 30003` 单独分支：抛 `UPSTREAM_UNAVAILABLE`，文案「知乎开放平台被风控拒绝：… **请不要立即重试**」，`retryable: false`（`open-platform.js:416-419`）。同文件 281 行注释明确写 *"No requests are retried, including 429, exhausted quota, or risk-control denial"* |
| T-33 | ✅ **PASS（现状无冲突；陷阱机制已确认）** | 只有 1 个搜索插件（`dsh-free-search`），`--dump-config` 里 `searchProvider` 与 `fetchProvider` 两个字段**都在**、都是显式值。陷阱机制确认：`cordis.patch.yml` 的 config 是**整段替换**（本机 schema 的 `$comment` 原文：*"A patch config replaces the whole config."*），所以后装插件只写 `searchProvider` 会把 `fetchProvider` 抹掉 |
| T-34 | ⚠️ **只做只读演练（按你的选择，未真跑）** | 已比对清楚：脚本会回退到**最近备份** `_tmp\plugin-backups\20261016-123707\`，该备份是「装研究插件之前」的状态——`package.json` 只有 **7** 个依赖（当前 12），`cordis.patch.yml` 是空的 `[]`（当前 144 行）。**真跑 -Rollback 会删掉 5 个研究插件与 preset-standard 的修复**。已在 `_tmp\t34\restored-*` 里保留将恢复的两个文件供核对 |
| T-35 | ✅ **PASS** | `desktop`/`web`/`research` 三个 profile 的 `package.json` 里都没有 `metaso`/`dsh-web-search-*`；`node_modules` 里也没有。`dsh-web-search-metaso` 在 npm 上存在（latest 0.1.4）但**本机未安装**，不会触发「自定义事件类型让历史会话打不开」的历史坑 |

---

## 5. 额度消耗对账（实测）

| 池 | 每日免费 | 本次实际消耗 | 备注 |
|---|---|---|---|
| `global_search` | 5000 | **1** | T-12 |
| `zhihu_search` | 5000 | **1** | T-12 |
| `hot_list` | 100 | **1** | T-13 附加 |
| `zhida_openai` | 100 | **1** | T-14 |
| `knowledge` | 500 | **4** | 列表 1 + 上传 2 + 检索 1（T-24） |
| **`tools`** | **10** | **0** | 无工具可调（T-25/T-26） |
| 其它（`user_data`/`creator`/`question_discovery`） | — | **0** | |
| 知乎额度查询本身 | — | 0 | 查询不扣额度（代码注释确认） |

本地账本留痕：`_tmp\zhihu-call-policy\daily.json`（`calls: 5`）。

---

## 6. 顺带发现的 4 个插件真实缺陷（不是配置问题，值得提 issue）

| # | 插件 | 缺陷 | 证据 | 影响 |
|---|---|---|---|---|
| D-1 | `deep-read-summarize` | **`av` 依赖没 pin**：`faster-whisper 1.2.1` 只声明 `av>=11`，却调用 `av.open(..., metadata_errors=)`，而 av 19.x 删掉了该参数 → fresh venv 必然 `TypeError: open() got an unexpected keyword argument 'metadata_errors'` | `_tmp\t21\transcribe.log` 完整 traceback；av_probe 实测 19.0.1 FAIL / 19.0.0 FAIL / **18.1.0 OK** | **任何干净机器上视频转录 100% 失败**；本机靠 `av==18.1.0` 手动绕过。修法：插件 pin `av<19` 或升 faster-whisper |
| D-2 | `dsh-deepread` | **`map` 模式对长文稳定失败**：`模型输出 3 次均未得到合法 JSON：底层错误（模型返回了空结果）×2；输出被截断` | 会话内真工具调用返回原文 | `map` 模式（也是文档主推的「观点—证据—数据—关系」地图）在公众号长文上不可用 |
| D-3 | `dsh-deepread` | **`export: "md"` 不落盘**：工具描述说「文件写入工作区 `deepread-output/` 目录」，但两次带 `export=md` 调用后该目录不存在、工作区内也没有任何新增 `.md/.mm/.html` | `glob deepread-output/**` → 无文件；全库搜 `.mm` → 无 | 用户以为导出成功，实际磁盘上没有文件（与 T-19 同类的「假落盘」陷阱） |
| D-4 | `@klarkxy/dsh-zhihu` | **headless 组合下必然 pending**：`inject = ["zhihu","tools"]`，宿主半边要 `connection` + `webServer`，非 Web 层组合里整条插件链 pending，`zhihu_*` 工具一个都不注册 | `zhihu (@klarkxy/dsh-zhihu): pending (waiting for services: connection, webServer)`；`tools.js:740` | 想在 CLI/headless 里用知乎工具做不到；只能在 Web 层跑 |

---

## 7. 清单需要更新的地方（4 处描述与实测不符）

1. **第 6 节第 1 条**「重启 DSH + 新开一个会话」→ 不够/不准确。真正决定因素是这个会话跑在
   **哪个 profile**（研究插件在 `web`，本次 GUI 是 `desktop`）；而且本次实证里这些工具
   **在同一个会话中途就挂上了**，所以「老会话一定拿不到」也不成立。
2. **第 6 节第 2 条 / T-24**「先去初始化至少一个知识库，否则 T-24 必失败（40006）」→
   知识库**已经存在**（默认库，今天创建）；上传仍报 40006，所以 40006 与「没初始化」无关。
3. **T-25/T-26** 描述的 `pdf_parse` / PPT 生成工具**在 `@klarkxy/dsh-zhihu` v0.2.4 里不存在**，
   不是额度问题。
4. **T-22**「实测：本机都缺（yt-dlp/ffmpeg）」→ 这是**测试前**的状态；本次已按你的选择装好并实测通过。

另外两处「实测状态已变化」：
- T-19 的坑**真实存在但机制与清单描述略有差别**——脚本从不写文件是真的，
  但中性措辞下模型会自主落盘（run3），所以它是「模型可能漏第 8 步」，不是「必然漏」。
- T-11 的引擎可用面比清单假设的窄：**只有 Bing 与 AnySearch 可用**，
  DuckDuckGo 系列与 SearXNG 在本机网络下全不可达。

---

## 8. Tier 3 — 逐条结果

| # | 结论 | 证据 |
|---|---|---|
| T-31 | ✅ **PASS（错误不静默）** | 读码确认 `30001/30002/40003` → `RATE_LIMITED`，错误信息带 `code=30002` 与 `retryable: true`（`open-platform.js:396-427`）。无法人为把 100/天 用完（那要 100 次调用），改为**代码级确认 + 5000/100 的实测量级**：额度耗尽是显式抛错，不是静默空返回 |
| T-32 | ✅ **PASS（有专门分支 + 永不自动重试）** | `code === 30003` 单独分支：抛 `UPSTREAM_UNAVAILABLE`，文案「知乎开放平台被风控拒绝：… **请不要立即重试**」，`retryable: false`（`open-platform.js:416-419`）。同文件 281 行注释明确写 *"No requests are retried, including 429, exhausted quota, or risk-control denial"* |
| T-33 | ✅ **PASS（现状无冲突；陷阱机制已确认）** | 只有 1 个搜索插件（`dsh-free-search`），`--dump-config` 里 `searchProvider` 与 `fetchProvider` 两个字段**都在**、都是显式值。陷阱机制确认：`cordis.patch.yml` 的 config 是**整段替换**（本机 schema 的 `$comment` 原文：*"A patch config replaces the whole config."*），所以后装插件只写 `searchProvider` 会把 `fetchProvider` 抹掉 |
| T-34 | ⚠️ **只做只读演练（按你的选择，未真跑）** | 已比对清楚：脚本会回退到**最近备份** `_tmp\plugin-backups\20261016-123707\`，该备份是「装研究插件之前」的状态——`package.json` 只有 **7** 个依赖（当前 12），`cordis.patch.yml` 是空的 `[]`（当前 144 行）。**真跑 -Rollback 会删掉 5 个研究插件与 preset-standard 的修复**。已在 `_tmp\t34\restored-*` 里保留将恢复的两个文件供核对 |
| T-35 | ✅ **PASS** | `desktop`/`web`/`research` 三个 profile 的 `package.json` 里都没有 `metaso`/`dsh-web-search-*`；`node_modules` 里也没有。`dsh-web-search-metaso` 在 npm 上存在（latest 0.1.4）但**本机未安装**，不会触发「自定义事件类型让历史会话打不开」的历史坑 |

---

## 9. 交付物与证据位置

- 本报告：`docs\测试报告-2026-10-16.md`
- 新增知识笔记：`_knowledge\notes\2026-10-16-dsh-research-plugins-and-profile-mismatch.md`、
  `2026-10-16-zhihu-pools-and-media-prereqs.md`、`2026-10-16-dsh-dump-config-semantics.md`；
  `_knowledge\index.md` 已同步
- 探针与原始证据：`_tmp\zhihu-probe.mjs`、`_tmp\zhihu-kb-upload.mjs`、`_tmp\registry-probe.mjs`、
  `_tmp\read-session-tools.mjs`、`_tmp\web-dump-config.txt`、`_tmp\zhihu-call-policy\daily.json`、
  `_tmp\probe-free-search\evidence.json`、`_tmp\probe-pubmed\evidence.json`、
  `_tmp\probe-wechat\`、`_tmp\t19\REPORT.md`、`_tmp\t21\T21-EVIDENCE.md` + `transcript.txt`、
  `_tmp\t24\`、`_tmp\t34\`
- 为验证而新建的 DSH profile：`~\.dsh\profiles\research`（headless 模板 + 6 个研究插件，
  `node_modules` 是指向 `profiles\web\node_modules` 的 junction）。**它是本次唯一写到 `~\.dsh`
  的持久改动**，不需要可直接删掉整个目录。
- 本次装到工作区外的工具（你已批准）：`yt-dlp 2026.08.19`、`ffmpeg/ffprobe 9.0.2`
  （winget，含 `DenoLand.Deno`、`yt-dlp.FFmpeg`）、转写 venv 与模型缓存
  `%LOCALAPPDATA%\deep-read-summarize`（约 484 MB 模型）。

