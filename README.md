# dsh-autodidact

> 给 DeepSeek Harness（DSH）装上一套**任务驱动自学**能力：
> 接到没有现成材料的任务时，自己去多个引擎和中文平台查、读一手来源、
> 把有用的留下、用它把活干完、不通就回去重查。
> **零 Cookie、零浏览器自动化、不交账号。**

**autodidact** /ˌɔːtəʊˈdaɪdækt/ — 自学成才者。
名字就是这套东西的全部主张：**不会，就去学**。
（仓库名是理念，里面的技能 `research-autonomy` 是机制。）

---

## 它解决什么问题

DSH 本来就有 `web_search` / `web_fetch`。真正的短板是**行为**：
遇到不会的，它更容易凭印象编、或者把问题推回给你。

所以这套东西的核心不是"装了个搜索插件"，而是：

**1 个行为技能（硬规则） + 6 个数据源插件 + 1 套本地知识库规范**

其中**最重要的那个技能**，强制它：先说出缺什么 → 搜 → 读一手来源 → 落档 → 用它干活
→ 不通回去重查（3 轮上限）。并硬性禁止：凭记忆答可变事实、引用没打开过的链接、
编造工具名、查完不写。

---

## 仓库内容

```
├── README.md                     ← 本文件
├── .env.example                  ← 凭据模板（复制成 .env，不会进仓库）
├── .gitignore                    ← 已排除 .env / _secrets / 大文件
├── LICENSE
├── install/
│   ├── install.ps1               ← 一键安装（自动探测 dsh 与 profile，无硬编码路径）
│   └── check-env.mjs             ← 环境与网络自检
├── skills/research-autonomy/
│   └── SKILL.md                  ← ★ 核心：自学行为协议
├── tools/
│   └── bili_lecture.mjs          ← B站「字幕 + 热门评论」一次取，长视频自动分块
└── docs/
    ├── capability-coverage.md       能搜哪些地方（逐项标注 实测/未测/被墙）
    ├── verification-checklist.md    装完怎么验收
    ├── design-and-pitfalls.md       完整技术方案（含所有踩坑记录）
    ├── performance.md               时间花在哪、怎么提速
    ├── known-defects.md             已知缺陷（诚实清单）
    ├── bilibili-notes.md            B站字幕/评论的实测结论（含"死路"）
    ├── keyless-apis-china.md        中国大陆可用的免 key 数据源
    └── triggering-the-skill.md      **怎么触发技能、怎么确认它真跑了** ← 要用它就看这份
```

---

## 快速开始

### 0）前置条件

| 需要 | 检查 | 说明 |
|---|---|---|
| DSH | `dsh --version` | 建议 ≥ `0.2.0-rc.2` |
| Node.js | `node --version` | ≥ 22 |
| 知乎开放平台账号 | 见 §2 | **免费额度很大，强烈建议配** |
| PowerShell 5.1+ | — | Windows 用户；macOS/Linux 用 `dsh plugin` 手装（见 §1 备选） |

**不需要**：不需要 Chrome 或任何浏览器登录态，不需要小红书账号，不需要付费。

### 1）装插件

```powershell
# 先干跑，只看要装什么
.\install\install.ps1 -DryRun

# 真装（profile 名字务必按下面 §1.1 确认）
.\install\install.ps1 -Profile <你的 profile>
```

不想用脚本就手动：

```powershell
$dsh = '<你的 dsh 路径>'   # 例如 macOS/Linux 上直接就是 dsh
foreach ($p in @('@klarkxy/dsh-zhihu','dsh-free-search','deep-read-summarize',
                 'dsh-deepread','dsh-wechat-mp-search','dsh-pubmed')) {
  & $dsh plugin --profile <你的 profile> add $p
}
```

#### 1.1 ⚠️ 最容易装错的地方：先确认 **profile**

**装错 profile = 插件完全不生效**，而且返回的还是成功。

```powershell
# Windows：从监听端口反查正在跑的那个 profile
$pid2 = (Get-NetTCPConnection -LocalPort 19387 -State Listen).OwningProcess
Get-CimInstance Win32_Process -Filter "ProcessId=$pid2" | Select-Object -ExpandProperty CommandLine
```

命令行里出现的 `...\profiles\<名字>` 就是答案（桌面版通常是 `desktop`）。
`dsh web` 命令行启动通常是 `web`。**两者互不相通。**

#### 1.2 装完必须验证"真的挂上了"

`dsh plugin add` 返回 OK **不等于**插件生效 —— 实测遇到过包装上了但没写进
`dsh.profile.bundles`，配置从未被应用，**等于没装**。

```powershell
& $dsh --profile <你的 profile> --dump-config | Select-String 'zhihu|free-search|wechat|pubmed|deepread'
```

每个包名都要出现。缺哪个，手工补进 `~/.dsh/profiles/<profile>/package.json` 的
`dsh.profile.bundles` 数组，再重新确认。

> `desktop` profile 会被 CLI 拒绝（`managed exclusively by the Electron application`）。
> 此时靠结构校验 + 重启后看工具是否出现。

#### 1.3 知乎工具需要额外一步

`@klarkxy/dsh-zhihu` 的基础部分（面板 + 搜索提供方）装上即生效；
但 `zhihu_search` 等**模型工具**在 `./tools` 子路径里，**必须挂进 agent 预设**：
在 `~/.dsh/profiles/<profile>/cordis.patch.yml` 追加一个
`preset-standard` 覆盖项，在 `plugins` 列表**末尾**加上：

```yaml
      - id: zhihu-tools
        name: '@klarkxy/dsh-zhihu/tools'
```

> ⚠️ 覆盖是**整段替换**语义，plugins 必须是内置预设的**完整副本** + 这一行，写漏就丢能力。
> ⚠️ **不要去找 `agent.cordis.yml`** —— 那是已废弃格式，现在的 DSH 不读它。

### 2）配置 API

#### 2.1 知乎开放平台（强烈建议）

1. 打开 <https://developer.zhihu.com/>，注册/登录
2. 进个人中心 <https://developer.zhihu.com/personal>
3. **创建 Access Secret**，复制那串字符
4. 只读用途**不需要** app-id / app-secret

**实测免费额度**：

| 能力 | 每日免费 |
|---|---|
| **全网搜索**（站外整个互联网） | **5000 次** |
| 知乎站内搜索 | 5000 次 |
| 知乎用户数据 | 10000 次 |
| 知识库（上传 + 检索） | 500 次 |
| 热榜 / 问题发现 / 直答 | 各 100 次 |
| PDF 解析 + PPT 生成 | 10 次 |

**⚠️ 三个变量名不一样，对应不同使用者（同一个 Secret 填三遍）：**

| 使用者 | 变量名 |
|---|---|
| `@klarkxy/dsh-zhihu` | **`ZHIHU_ACCESS_TOKEN`** |
| `dsh-zhihu-search` / `zhihu-mcp-proxy` | **`ZHIHU_ACCESS_SECRET`** |
| `dsh-free-search` 的知乎搜索引擎 | **`ZHIHU_API_KEY`** |

三个都写进 `~/.dsh/.env`（或复制 `.env.example` 为 `.env` 后填入）：

```
ZHIHU_ACCESS_TOKEN=<你的 Access Secret>
ZHIHU_ACCESS_SECRET=<同一个值>
ZHIHU_API_KEY=<同一个值>
```

**⚠️ `.env` 只在 DSH 启动时读 —— 改完必须重启。**

也可以在 **设置 → 插件 → Zhihu** 面板里填（存进 DSH 凭据库，更规范）。
**不要把密钥明文写进 `cordis.patch.yml`。**

#### 2.2 初始化知乎知识库（想让云端 RAG 能用）

去 <https://zhida.zhihu.com/repositories/square> 登录并初始化（会创建默认知识库）。

> **如实说明**：实测中**即使知识库已存在，上传仍会报 `Code=40006 file parsing failed`**
> （检索是通的，写不进去）。**不要指望它一定可用**；本地知识库（见 §3）才可靠。

#### 2.3 搜索 API：**优先 Exa 与 Tavily**

**★ 建议把这两个放最优先。** 它们都是「给 AI agent 用的搜索 API」：返回的是
**能直接喂模型的干净文本**（不是原始 HTML）—— 省的不只是搜索本身，**更是上下文 token**。

| | 注册 | 免费额度（2026-10-16 官方页核实） | 单价 |
|---|---|---|---|
| **Exa** | <https://dashboard.exa.ai/onboarding-guest> | **每月 $10 credits** + 一次性 $10 开户奖励，**不要付款方式** | Search **$4/1k 请求**（≤10 条结果） |
| **Tavily** | <https://app.tavily.com/home> | **每月 1000 API credits**（每月 1 日重置），**不要信用卡** | PAYGO **$0.008/credit**；另有学生免费档 |

两个 key 写进 `~/.dsh/.env`，或在 **设置 → 插件 → 插件配置 → 网页搜索** 面板里填
（面板存 `~/.dsh/.credentials.yaml`，优先级最高）：

```
EXA_API_KEY=<Exa 的 key>
TAVILY_API_KEY=<Tavily 的 key>
```

**不配也能用**：Exa 有 keyless 回退、Tavily 有官方 keyless 档
（`X-Tavily-Access-Mode: keyless`）。**填了只是额度内更稳、更快。**

> **引擎顺序**在 **设置 → 插件 → 插件配置 → 网页搜索 → 回退顺序** 里调。面板原话：
> *"Top to bottom is the fallback order. The preferred engine is still tried first."*
> `dsh-free-search` 的默认回退链**已经是 `exa → tavily → …` 打头**；
> 而「首选引擎」是**每次调用时**指定的（调用 `advanced_search` 时带 `engine` 参数）。

**不配任何 key 也已经有 8 个引擎可用**：Bing（中文）、AnySearch、**Exa**、**Tavily**、
Keenable、Firecrawl、Parallel、DeepSeek 官方搜索。

想更宽再考虑：**智谱 `search_std` ¥0.01/次**（最便宜的靠谱付费选项）、
阿里云百炼联网搜索（前 2000 次免费）、秘塔/博查（约 ¥0.03–0.036/次）。
博查有官方 DSH 插件：`@bocha-ai/dsh-web-search-bocha`。

> ⚠️ **Bing Search API 已于 2025-08-11 退役**，别再找 `api.bing.microsoft.com`。
> （`dsh-free-search` 里的"免 key Bing"是抓搜索网页，不是那个 API。）

#### 2.4 MCP 数据源：Context7（查库/框架的**最新**文档）

[Context7](https://context7.com) 是 Upstash 的 MCP 服务器（ThoughtWorks 技术雷达评为 **Trial**）：
它**直接从库的源码仓库取最新文档和可运行代码示例**，注入模型上下文 —— 专门治
「模型拿过时训练数据编 API」。对我们这种"经常要写某个库的代码"的场景，价值很直接。

DSH 的 MCP 是**按条目显式开启**的：在 profile 的 `cordis.patch.yml` 里加一条
`@deepseek-ai/dsh-mcp-client`。

```yaml
- id: mcp-context7
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: context7
    transport: streamable-http
    url: https://mcp.context7.com/mcp
```

**重启 DSH 后**，工具会以 `mcp__context7__resolve-library-id` 与
`mcp__context7__query-docs` 出现；在提示词里加一句 **`use context7`** 就会去查
（先解析出库 ID，再取该库的文档）。

| | |
|---|---|
| **keyless** | ✅ 可用（2026-10-16 实测：`initialize` HTTP 200，服务器 **Context7 v4.4.2**，协议 `2025-06-18`，2 个工具） |
| **想要更高频率上限** | 去 <https://context7.com/dashboard> 领免费 key，写进 `~/.dsh/.env` 的 `CONTEXT7_API_KEY`，再把下面两行注释去掉 |
| **鉴权头** | `headers: { Authorization: !!js "\`Bearer ${process.env.CONTEXT7_API_KEY}\`" }` |

> ⚠️ **MCP 条目是启动时装载的** —— 改完 `cordis.patch.yml` 必须重启 DSH 才生效。

### 3）启用技能 + 建知识库

```bash
# 把技能复制到工作区（只对该工作区生效）
mkdir -p .dsh/skills && cp -r skills/research-autonomy .dsh/skills/

# 或对所有工作区生效
cp -r skills/research-autonomy ~/.dsh/skills/
```

> 想让它**触发**、想知道它**到底跑没跑**（而不是敷衍你），看
> **[docs/triggering-the-skill.md](docs/triggering-the-skill.md)** —— 三种说法、
> 三处可见痕迹、以及它不听话时怎么拿它自己的规矩压它。

知识库目录（技能会自动往里写）：

```
<工作区>/_knowledge/
  index.md                  # 每个笔记一行
  raw/日期-主题.md           # 抓到的原文，逐字保留
  notes/日期-主题.md         # 缺口 / 发现 / 怎么用 / 影响 / 未知
  lessons/主题.md            # 去重后的长期结论（含"死路"）
```

### 4）验证

**重启 DSH**，**新开一个会话**（预设改动要新会话生效），然后逐条问：

| # | 问法 | 期望 |
|---|---|---|
| 1 | 「列出你名字里带 `zhihu`/`weixin`/`pubmed`/`deepread` 的工具」 | 能看到 |
| 2 | 「搜一条今天的 AI 新闻，给出链接，说明你实际打开了哪几个页面」 | 真实链接 + 说清抓过哪些 |
| 3 | 「用知乎搜一个具体问题」 | 走知乎工具，带来源 |
| 4 | 给一个 `mp.weixin.qq.com/s/...` 永久链接 | 返回干净正文 |
| **5** | **给一个你没有现成材料的小任务** | **它先说出缺什么再去搜** ← 最关键 |
| **6** | 断网后问一个需要联网的事实 | **如实说"查不到"，不编造** |

**第 5、6 条才是判据**，前 4 条只证明"装上了"。

---

## B站工具：`tools/bili_lecture.mjs`

一次拿到**字幕 + 热门评论**，长视频自动分块。**无需 Cookie、无需登录、无需 key。**

```bash
node tools/bili_lecture.mjs BV1GJ411x7h7
node tools/bili_lecture.mjs BV1GJ411x7h7 --lang zh --comments 20 --out ./out
node tools/bili_lecture.mjs BV1nCWc6KEfS --chunk 300      # 长视频分块
```

产出（默认 `./bili-output/`）：
`<BV>.subtitle.txt` / `.srt` / `.comments.md` / **`.lecture.md`（合并包，直接喂模型）**

### 为什么不用 `player/v2`

```
❌ player/v2  → subtitles: []   （接口返回成功、对象存在、列表为空，极具迷惑性）
✅ x/v2/dm/view?aid=&oid=&type=1 → 签发带 auth_key 的可用 URL
```

**判断"有没有字幕"只能看 `dm/view`。** 实测：19 条视频 `dm/view` 14 条有轨，
而 `player/v2` 是 **0/19**。

### 为什么还要读评论

**字幕只有单一叙述口径**（视频说了什么），**评论区才有**：纠错勘误、时间戳重点、
补充资料、反驳与争议。实测最高赞评论 **766,990 赞**，一句话把视频总结完了。

```
✅ x/v2/reply/main?type=1&oid=<aid>&mode=3&next=0&ps=20   （不要签名、不要 cookie）
❌ x/v2/reply/wbi/main  → -403（需要 WBI 签名）
```

### 字幕的限制（如实说）

- **只有"有字幕轨"的视频才有**；没有的走音频转录
- **AI 轨 ≠ 人类 CC 轨**（人类 CC 轨在 `view` 里 URL 是空的）
- **`auth_key` 有时效** → 用前现取现下，**不要缓存 URL**
- **付费/番剧/课程/充电专属** 匿名拿不到
- **长视频信息量巨大**：80 分钟讲座 = 1581 条 cue / 两万字 → 必须分块

---

## 已知缺陷（别当配置问题排查）

| # | 位置 | 缺陷 |
|---|---|---|
| D-1 | `deep-read-summarize` | **没 pin `av`** → 干净 venv 装到 av 19.x，视频转录 **100% 失败**（`TypeError: ... metadata_errors`）。修法：`uv pip install "av==18.1.0"` |
| D-2 | `dsh-deepread` | `map` 模式对长文 3 次重试全废 → 长文改用 `quick`/`deep` |
| D-3 | `dsh-deepread` | `export:"md"` **不落盘 = 静默假成功** → 自己 `Test-Path` 确认 |
| D-4 | `@klarkxy/dsh-zhihu` | headless 组合下必然 pending（需 `connection`+`webServer`） |
| D-5 | 知乎知识库 | 上传必报 `40006`（检索可用，写入不通） |
| D-6 | 知乎 PDF/PPT | 平台有 API，但插件 v0.2.4 没曝出工具 |

详见 [docs/known-defects.md](docs/known-defects.md)。

---

## 故障排查

| 现象 | 原因 | 怎么办 |
|---|---|---|
| **插件装了但工具不出现** | **装错 profile**（最常见）／预设没改／会话太老 | 按 §1.1 确认 profile；预设改动要**新会话**；重启 |
| `plugin add` 成功但没生效 | 没写进 `dsh.profile.bundles` | 手工补进 `package.json`，再 `--dump-config` 验证 |
| 知乎引擎报 `not configured` | 变量名不对／`.env` 改了没重启 | 三个名字都写（§2.1），然后**重启** |
| `curl` / `Invoke-WebRequest` 报 TLS 错 | 该环境下 curl/PowerShell 做不了 HTTPS（`schannel SEC_E_NO_CREDENTIALS`） | **改用 Node/Python 发请求** —— 别据此判断"网断了" |
| 搜索很慢、卡很久 | 首选引擎不可达，在回退链里逐个超时（ddg/searxng 各 ~10.8s） | 首选固定 `bing`；别测 ddg/searxng |
| 命令跑很久 | 递归扫了大目录 | 限定目录；**大 JSON 用 Node 解析，别用 `ConvertFrom-Json`** |
| 视频转录失败 | av 版本（见 D-1） | `uv pip install "av==18.1.0"` |

---

## 边界与合规

**能做**：公开网页搜索、微信公众号、B站（字幕+评论）、学术文献、GitHub、中文财经数据。

**不能做**：

- ❌ 需要**你的账号登录**才能看的内容（本项目**零 Cookie、零浏览器自动化**）
- ❌ Wikipedia / Wikidata 的 **API**（大陆常见被墙；替代：`dumps.wikimedia.org`、Qlever SPARQL）
- ❌ Google 系（News RSS、YouTube、translate）—— 常见超时
- ❌ 小红书（**主动排除**，自动化有封号风险）

**合规要点**：

1. **只读、限量、不批量、不发布**；遵守各平台条款与版权，不要二次分发受版权保护的内容。
2. **不要为搜索能力交出 Cookie / 密码。**
3. 本仓库只含配置与脚本，**不含任何第三方插件本体**；插件各自遵循其许可。

---

## 环境与实测声明

本文所有「实测」结论取自 **2026-10-16 · Windows 11 · DSH 0.2.0-rc.2 · 无代理 · 中国大陆出口**。
网络可达性会随时间和网络环境变化，`docs/capability-coverage.md` 里逐项标注了
**实测 / 未测 / 被墙**三种状态 —— 请不要把"未测"当"可用"。
