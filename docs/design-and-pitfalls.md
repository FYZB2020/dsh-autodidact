# 让 Agent「不会就去学」——联网搜索与任务驱动自学能力 接入技术方案

> **这份文档是给 AI 读的施工单。** 把整份文档丢给一个能读写本机文件的 AI（DSH 里的 agent 即可），
> 它会按「第 8 节 施工步骤」逐条安装、配置、验收。
>
> 文档里的**版本号、npm 包是否存在、网络可达性、知乎 API 额度**，都已在
> **2026-10-16 于本机实测**（知乎额度与接口是用用户真实密钥调出来的真数据）。
> 标了 `已实测` / `未验证` —— **未验证的项必须先验证再动手**。

---

## 1. 要解决的真实问题

**场景不是「查版本号」，而是：**

> 用户交给 agent 一件**它没有足够现成材料**去做的事。
> agent 必须**自己上网把这件事学会**——在各种搜索引擎和平台上找资料、读一手文档、
> 把有用的东西留下来、用它把任务做出来、做不通就回去接着查、接着迭代。

缺的不是「搜索工具」（DSH 早就有 `web_search`/`web_fetch`），而是：

| # | 缺口 | 说明 | 归属 |
|---|---|---|---|
| 1 | **任务驱动的自学行为** | 拿到任务先问「做这件事我还缺什么知识」，缺就去学，不硬做、不猜测、不推回用户 | → **行为技能**（已装，第 5 节）**最重要** |
| 2 | **够用的搜索触达** | 多引擎 + 中文引擎；能读一手文档、报错原因、真实经验 | → 第 4.1 节 |
| 3 | **中文平台与资料的读取** | 知乎、公众号、长文、论文、视频 | → 第 4.2 / 4.3 节 |
| 4 | **学完要留下** | 「把有用的东西下载下来」，下次不用重查 | → 第 4.4 / 5 节 |

**三条硬约束：**

1. **不搞小红书。** 用户已明确排除（封号风险）。本方案**不含任何小红书采集能力**。
2. **不要封号。** 优先**官方 API**；只读、限量、不批量、不发布；
   **不交出 Cookie**、不做扫码登录自动化。
3. **`dsh plugin` 命令必须在 DSH 沙箱外执行**（实测被 EPERM 拦：插件要写 `~\.dsh\profiles\`，
   沙箱只让写工作区）。

**⚠ 一处重要更正（我上一版搞错了）：GitHub 是通的。**
上一版说「GitHub 全站不通」，那是 `Invoke-WebRequest` 的假阴性（PowerShell 侧 TLS/IPv6 问题）。
用 Node 的 `fetch` 实测：

| 端点 | 结果 |
|---|---|
| `https://github.com` | **200**，345ms |
| `https://api.github.com` | **200**，541ms |
| `https://raw.githubusercontent.com` | **200**，179ms |
| `https://codeload.github.com` | **200**（能下 tarball），968ms |
| `https://registry.npmjs.org` | **200**，739ms |

→ **`dsh plugin add github:owner/repo` 这类安装现在就可以做**，不需要等代理。
**判断网络可达性要用 Node，不要用 `Invoke-WebRequest`。**

**另一个必须知道的坑：插件市场里的安装命令经常是错的。**
那个目录合并的是 GitHub `dsh-plugin` **话题标签**，任何仓库都能免费加。
实测 3.4 万星的 WeKnora、2.6 万星的 distilly **根本没有 DSH 插件**。
→ **一律以 npm 包名为准**，装前用 `npm view <pkg> version` 验证。

---

## 2. 本机现状（全部已实测）

| 项 | 值 |
|---|---|
| dsh CLI 版本 | **0.2.0-rc.2**，路径 `<DSH_CMD>`（**不在 PATH**） |
| 桌面 App 版本 | 44.0.0（`<DSH_INSTALL>\version`，与 CLI 版本无关） |
| Profile | `web`（GUI `http://127.0.0.1:19387` 由它提供）、`desktop` |
| 插件市场 | `dsh-plugin@1.5.0`，在 web profile bundles 中 → 已生效（**第三方 bundle，非 DSH 官方**） |
| Node / npm | v24.16.0 / `C:\Program Files\nodejs\npm.ps1`，registry `https://registry.npmjs.org` |
| pnpm | 不在 PATH；DSH 自带 `<DSH_INSTALL>\resources\runtime\pnpm` |
| 文件沙箱 | `workspace-write`：只有 `<workspace>` 内可写 |

### 2.1 DSH 自带的联网能力（已有，但要换源）

实测自 asar 内官方包文档：

- `@deepseek-ai/dsh-tool-web` → 注册 **`web_search`** 与 **`web_fetch`**。
- `@deepseek-ai/dsh-web-search-deepseek` → 注册 `deepseek-official` 提供方。
  **每次搜索消耗一整轮模型调用**（DeepSeek 没有独立搜索端点），官方文档原话：
  「当单次搜索的成本或延迟占主导时避免使用它」。
- **搜索提供方是可插拔的**：`ctx.web.search()` 只有一个后端时自动解析到它，
  也可用 `searchProvider: <name>` 固定。设置页：**设置 → 插件 → 插件配置 → 网页搜索**。
- `@deepseek-ai/dsh-web-fetch-http` → 原生 HTTP 抓取后端
  （`dsh-deepread` 读公众号稳定链接需要它 + 浏览器 UA）。

> **技术支点**：把默认的 `deepseek-official` 换成有免费额度的官方 API 提供方，
> 自带的 `web_search` 立刻变强、变多源、几乎不要钱。

### 2.2 技能系统（实测自 `dsh-skill-filesystem` 官方文档）

| Rank | 路径 |
|---|---|
| 100 | `<项目根>\.dsh\skills` |
| 200 | `<项目根>\.agents\skills` |
| 400 | `~\.dsh\skills` |
| 500 | `~\.agents\skills` |

- 项目根 = 最近一个含 `.git` 的祖先目录；不存在则用当前工作目录。
  **本工作区不是 git 仓库** → 项目根 = `<workspace>`。
- 只识别**一层**：`<root>\<name>\SKILL.md` 或 `<root>\<name>.md`。**不支持嵌套。**
- frontmatter：必填 `name`（kebab-case）、`description`；可选 `whenToUse`、`metadata`、
  `disable-model-invocation`、`user-invocable`。**有 watcher，改完不用重启。**

### 2.3 MCP 接入（实测自 `dsh-mcp-client` 官方文档）

```yaml
- insert:
    - id: mcp-<唯一名>
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: <命名空间>     # [A-Za-z0-9_-]{1,32}，决定工具前缀
        transport: stdio           # ⚠ 只支持 stdio | streamable-http，不支持 SSE
        command: npx
        args: ['-y', 'some-mcp-server']
        env:
          SOME_TOKEN: !!js process.env.SOME_TOKEN
```

- 模型侧工具名 = `mcp__<serverName>__<tool>`。
- stdio 子进程环境会**清洗掉**匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 的变量和所有 `DSH_*`，
  所以密钥要在 `env:` 里显式传。
- **`transport` 只支持 `stdio` 和 `streamable-http`，不支持 SSE。**
  这一点很关键：**知乎官方 MCP 是 SSE 的**，所以不能直接接，需要 stdio 桥（见 4.2）。

### 2.4 把插件的工具交给模型：Agent 预设（**不改 `agent.cordis.yml`**）

有些插件（如 `@klarkxy/dsh-zhihu/tools`）要求把插件行加进 **agent 预设的 plugins 列表**。
实测 DSH 源码 `@deepseek-ai/dsh-agent-preset/skills/editing-cordis-compositions/SKILL.md`：

- agent 预设是 `@deepseek-ai/dsh-agent-preset` 声明，**由 bundle patch 承载**。
  内置 Web 预设 id：`standard`、`ptc`、`minimal`、`cordis`。
- **要改内置预设，就按 Loader 行 id 覆盖**（`preset-standard`），
  且**必须把整个 `config` 重述**（`id`、`order`、`plugins` 全部），因为覆盖是整段替换：

```yaml
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: standard
    order: 1
    plugins:
      # 内置列表 + 你要加的行
      - name: '@klarkxy/dsh-zhihu/tools'
```

- ⚠️ **`agent.cordis.yml` 是历史格式，现在的 DSH 已经不读了。**
  （源码原话：「Nothing reads that directory any more.」）
  某些插件 README 还在让你改它 —— **照做会白忙**。
- ⚠️ 覆盖整段 `plugins` 有风险：写漏一行就丢能力。**改前先备份 profile**，
  改后按第 9 节验收。
- 装 bundle 会在 **Host 进程**执行插件代码 → 需要 Full access 或审批。

### 2.5 本机网络操作注意事项（实测，**踩过才知道**）

| 现象 | 真相 | 怎么做 |
|---|---|---|
| `curl.exe` / `Invoke-WebRequest` 报 `schannel: SEC_E_NO_CREDENTIALS (0x8009030E)` 或「基础连接已经关闭」 | **它们在本机做不了 HTTPS**（明文 HTTP 可以） | **一律用 Node 或 Python 发请求**，别用 `curl`。我上一轮判「GitHub 不通」就是被这个假阴性坑的 |
| `npm view` 报 `EPERM`（npm cache 在工作区外） | 沙箱只让写工作区 | 加 `--cache <工作区内路径>`，或直接查 `https://registry.npmjs.org/<pkg>`（更快可用 `registry.npmmirror.com`） |
| 同一域名时通时不通 | 有些线路是**间歇性**的 | 关键结论要**复测**；连续超时才算不通 |
| `_tmp\` 内容会消失 | 会话中间可能被清理 | 要留的证据马上写进 `_knowledge\raw\`，别只放 `_tmp\` |

**判断「某网站能不能上」的正确姿势**：用 Node `fetch` + 明确超时，**不要**用 PowerShell 的
Web cmdlet。本方案里所有可达性结论都按这个方法取。

---

## 3. 关键资产：用户的知乎开放平台密钥（已实测可用）

**密钥已存放在**：`<workspace>\_secrets\zhihu.env`
（变量名 `ZHIHU_ACCESS_SECRET`）。**该文件含明文密钥，不要复制进文档、聊天、截图或公开仓库。**

> ⚠️ **安全性提醒（必须转达用户）**：知乎官方文档明确要求
> 「不要把 Access Secret、OAuth `app_key` 或 OAuth token 发到聊天中」。
> 该密钥已在聊天记录里出现过，**建议在
> <https://developer.zhihu.com/personal> 重新生成一枚后再长期使用**。

### 3.1 鉴权方式（实测）

每个请求**必须带两个头**，少一个就 `Code=20001 鉴权失败`：

```
Authorization: Bearer <Access Secret>
X-Request-Timestamp: <秒级 Unix 时间戳>
Content-Type: application/json
```

（我第一次只发了 `Authorization`，返回 `20001 Authorization failed` —— 加时间戳后立即成功。）

### 3.2 每日免费额度（**实测真数据**，非公开传闻）

调 `GET https://developer.zhihu.com/api/v1/quota` 得到的真实额度：

| 额度池 | 名称 | 每日免费 | 说明 |
|---|---|---|---|
| `global_search` | **全网搜索** | **5000** | **站外全网搜索**，能筛域名/时间/索引库 |
| `zhihu_search` | 知乎搜索 | **5000** | 知乎站内 |
| `user_data` | 知乎用户数据 | 10000 | 创作列表/关注/收藏 |
| `knowledge` | **知识库（RAG）** | **500** | 上传文档 + 检索 |
| `creator` | 创作能力 | 200 | 问题推荐、本人全文、评论、统计 |
| `hot_list` | 热榜 | 100 | |
| `question_discovery` | 问题发现 | 100 | |
| `zhida_openai` | 直答 | 100 | OpenAI 兼容对话 |
| `tools` | 小工具 | **10** | PDF 解析 + PPT 生成 —— **额度很少，省着用** |

北京时 00:00 重置。额度查询接口**不消耗**业务额度。
（注意：实测调用后 `TotalUsed` 仍显示 0，即**官方额度统计有滞后**，别把它当实时账单。）

### 3.3 知乎平台远比「搜索」大（实测验证）

官方目录共 33 条文档：3 条指南、22 条 API、4 条 Skill、4 条 MCP。实测确认可用的关键能力：

- **`global_search` 全网搜索** —— 这是**一台免费的 Web 搜索引擎**。
  实测调用返回了完整的 `Title` / `ContentText`（正文一大段）/ `Url` / `AuthorName` /
  `VoteUpCount` / `EditTime`，不只是摘要。支持
  `Filter` 语法（`host=="example.com"`、`publish_time>=<ts>`、`AND`/`OR`）
  和 `SearchDB: all | realtime | static`。
  > **意义**：用户要的「各种引擎」这一条，**光靠知乎这一把钥匙就基本满足了**（5000 次/天）。
- **`knowledge` 知识库 RAG** —— 建知识库、传文档（支持 pdf/md/txt/ppt/pptx/xlsx/docx/图片/
  mobi/epub/csv/azw3）、**RAG 检索**。
  **实测更新**：知识库**已经存在**（默认库 `7697152005729136137`，本机查询 `库数=1`），
  不需要再去初始化；**检索可用**（真实召回 docx 片段）；
  但**上传失败** —— `.md` 与最小合法 `.pdf` **都报 `Code=40006 file parsing failed`**。
  **所以 40006 与「没初始化」无关**，是上传链路本身的问题（待查）。
  **这是「学完要留下」的官方版实现，但目前只有「读」这一半可用。**
- **`hot_list` 热榜**、**`zhida` 直答**（`POST /v1/chat/completions`，
  模型 `zhida-fast-1p5` / `zhida-thinking-1p5` / `zhida-agent`，OpenAI 兼容）、
  **问题推荐 / 问题回答摘要**。
  ⚠️ **平台上确实有 PDF 解析与 PPT 生成这两个 API，但 `@klarkxy/dsh-zhihu` v0.2.4
  没有把工具曝出来**（`tools.js` 只注册 5 个搜索类 + 7 个 open-platform 工具，
  全文搜不到 `pdf`/`ppt`）→ **`tools` 池那 10 次额度在本机一次也用不出去**，
  不是额度风险，是能力缺口。要用得自己按 HTTP API 接。
- **4 个官方 MCP 文档 + 官方 Skill + 官方 CLI** —— 官方 MCP 走 **SSE**，
  而 DSH 的 MCP 客户端**只支持 stdio / streamable-http** → **不能直连**，
  要用 stdio 桥或直接用插件（见 4.2）。
- 错误码：`0` 成功、`10001` 参数、`20001` 鉴权、`30001` 频率/额度、`30002` 额度耗尽、
  `30003` **风控拒绝（不要立刻重试）**、`90001` 内部。

---

## 4. 推荐配置

### 4.1 搜索层

| 方案 | 包名 | 版本 | 作用 |
|---|---|---|---|
| **必装** | `@klarkxy/dsh-zhihu` | 0.2.4 | **把知乎的全网搜索接进 DSH 原生 `web_search` 的提供方列表**；另有配额面板、知识库面板 |
| **必装** | `dsh-free-search` | 0.9.0 | 免 key 多引擎兜底（默认 Bing `zh-CN`，国内直连） |
| 备选 | `dsh-zhihu-search` | 2.1.2 | 只做知乎搜索的轻量插件（3 个工具），不想改预设时用 |
| 备选 | `@liustack/modsearch` | 5.10.7 | 人气最高，但**有高风险扫描标记**（见 9.4） |

**为什么首推 `@klarkxy/dsh-zhihu`**（实测其 README 与 npm）：

- 作者原话：**「With the Web Search plugin installed, Zhihu web search also appears in
  its provider list.」** → 知乎的 `global_search` 直接变成 DSH 原生 `web_search` 的一个来源。
- **默认只花免费额度**：每次请求前查官方额度，没额度就跳过；另有本地每日 100 次上限。
  两个开关可调：`allowPaid: false`、`dailyCallLimit: 100`。
  > ⚠️ **本用户的真实免费额度是 5000/天**，而插件默认本地卡在 100/天。
  > **建议把 `dailyCallLimit` 调高**（例如 1000–5000），否则会用不满额度。
- 面板齐全：**Stats**（本地调用/失败统计）、**Official quota**（官方剩余额度）、
  **Knowledge base**（上传 + 检索参考文件）、**Test**（手动跑任意查询）。
- 需要显式把工具给模型时，往 agent 预设加 `- name: '@klarkxy/dsh-zhihu/tools'`（见 2.4）。
- 凭据名是 **`ZHIHU_ACCESS_TOKEN`**（注意：与 `dsh-zhihu-search` 用的
  `ZHIHU_ACCESS_SECRET` **不是同一个名字**，别混）。
- 限制：单文件上传 ≤20MB；**上传的文件存在知乎服务器上，不要传未公开稿子**；请求不自动重试。

> **版本兼容已核对（实测 npm 元数据）**：`@klarkxy/dsh-zhihu@0.2.4` 声明
> `peerDependencies` 为 `@deepseek-ai/dsh-tools` / `dsh-credentials` / `dsh-storage-domain`
> **`>=0.2.0-rc.2`**，本机 CLI 是 **0.2.0-rc.2** → **正好满足**。
> 它的 `exports` 里确实存在 **`./tools`** 子路径，还带 `./usage` / `./client`，
> 并声明了 `dsh.bundle.patch` 与 `dsh.client`（web 平台）→ Step 2 的写法成立。

**兜底 `dsh-free-search`（npm 0.9.0，已实测）**：默认 Bing `zh-CN`、免 key、
国内不挂代理可用；24 个引擎（内建百度/豆包/阿里云/Kimi 等中文引擎）；
**实测实现了官方 `WebSearchProvider` seam**（读其 `lib/index.js`），
即它**变成**原生 `web_search` 的后端。README 主动写了大陆代理修法
（`NODE_USE_ENV_PROXY=1` + `HTTPS_PROXY`，因为 Node 的 `fetch` 不读系统代理）。
⚠️ 其 README 自述 `web_fetch` **没有 SSRF 防护** —— 不要让 agent 抓不受控的内网 URL。

**不要装**：`dsh-web-search-free`（**npm 同名两个不同插件**）；
`dsh-search-boost`（已停更，是 `search-boost` 前身）；
`@zhengjunyao/dsh-zhihu`（非官方 API，要扫码/Cookie）。

#### 4.1.1 引擎菜单：想换哪个引擎都行（**npm 名已逐个实测**）

用户要「各种引擎」。好消息是：**几乎每个搜索服务都有现成的 DSH 插件，
而且都是注册 DSH 原生 `WebSearchProvider`**（即接进自带的 `web_search`，不是另加平行工具）。
所以**引擎选择不再受插件可用性限制**。

| 引擎 | npm 包（已实测存在） | 版本 | 备注 |
|---|---|---|---|
| **博查 Bocha** | `@bocha-ai/dsh-web-search-bocha` | 0.1.0 | **官方发布**（npm maintainer = `bochaai <liuxun@bochaai.com>`，描述明写 Bocha-backed WebSearchProvider），provider id `bocha`；key 用 `BOCHA_API_KEY` |
| **秘塔 Metaso** | `dsh-web-search-metaso` | 0.1.4 | 同时注册 `metaso` 搜索 + `metaso-reader` 抓取；作者称约 **¥0.03/次** |
| **智谱 GLM** | `dsh-web-search-zhipu` / `dsh-web-search-glm` | 0.1.0 | 智谱系 |
| **Tavily** | `dsh-web-search-tavily` | 0.2.4 | **其 keyless 模式是 Tavily 官方 keyless 档**（`X-Tavily-Access-Mode: keyless`），不是爬页面或共享 key |
| **Exa** | `@tonydua/dsh-web-search-exa` | 0.2.3 | 有 keyless 回退 |
| **Firecrawl** | `@elves-ai/dsh-web-search-firecrawl` | 1.0.0 | Firecrawl keyless 在 `/v2` 仍活着（**实测从国内电信出口拿到 200**）；**1000 credits/月 ≈ 500 次搜索**，免费档 10 req/min |
| **SearXNG** | `dsh-web-search-searxng` / `dsh-searxng` | 0.5.1 / 0.4.0 | 自建聚合，无 key |
| **Brave / Serper** | `dsh-web-search-brave` / `@dingpenghui/dsh-web-search-serper` | 0.2.4 / 1.1.1 | 需各自 key |
| **豆包 Doubao** | `dsh-web-search-doubao` | 0.2.1 | 火山系 |
| **多云百炼** | `@kamitobi/dsh-multi-search` | — | 阿里云 DashScope |
| **五合一** | `@yugasun/dsh-web-search` | 0.2.5 | 描述明写 **Baidu + Doubao + Tavily + Exa + Serper 五个后端**给 `ctx.web`，带 Web 设置界面 |
| 免 key 兜底 | `dsh-free-search` | 0.9.0 | 24 引擎，含免 key Bing/DDG/SearXNG/Firecrawl |
| 免费额度 | 阿里云百炼「联网搜索」MCP | — | **前 2000 次免费，之后 ¥29/1000**（官方页） |

**⚠️ 一条必须知道的废弃通知：Bing Search API 已经死了。**
微软官方生命周期公告：**Bing Search APIs 于 2025-08-11 退役**，
「现有实例将完全停用，产品不再可用，也不接受新客户注册」。
官方替代品是「Grounding with Bing Search（Azure AI Agents 的一部分）」，**$14/1000 次**，
且官方明确它**不是通用搜索 API**：「输出不能直接用于其他应用或程序」。
→ **2026 年任何还在教 `api.bing.microsoft.com` 的教程都过时了。**
（注意区分：`dsh-free-search` 说的「免 key Bing」是**抓 Bing 搜索网页**，不是那个 API —— 两回事。）

**建议（对一个已有知乎 5000 次/天的人）**：
**先只装知乎 + `dsh-free-search`**，够用。若之后想要一个专职的中文网页搜索引擎，
**加 `@bocha-ai/dsh-web-search-bocha`（官方发布、最省心）**；
想零成本就上 `dsh-web-search-tavily`（官方 keyless）或自建 SearXNG。
**不要一次装多个** —— 它们抢同一批免费额度，还会让提供方解析变得不可预期。

### 4.2 中文平台读取（**全部不依赖浏览器**）

用户明确说 **Chrome 不要了（没有空的登录）** → 本方案**不含任何浏览器自动化**，
全部走 API 或纯 HTTP。

**知乎** —— 就是 4.1 的 `@klarkxy/dsh-zhihu`（官方 API，不封号）。
若还需要官方 MCP：官方 MCP 是 SSE，DSH 不支持，需用
`npx zhihu-mcp-proxy`（npm 1.1.0，SSE→stdio 桥，只暴露 `zhihu_search`）
按 2.3 的 stdio 写法接。**一般不需要 —— 插件已经覆盖。**

**微信公众号** —— **更正：这条路不但可行，而且不用浏览器、不用 key，还有 npm 包。**
独立调研已用真实文章复现：`https://mp.weixin.qq.com/s/<id>` → **HTTP 200、3.5MB、
`id="js_content"` 存在、可提取 `var msg_title` / `var ct`、24 张 `data-src` 图、
2946 字干净正文**。发现侧也免 key：`weixin.sogou.com/weixin?type=2&query=` → 200、10 条结果、无验证码。

**首选（npm 可达，一次性覆盖「搜索 + 读取」）**：

```powershell
& '<DSH_CMD>' plugin --profile web add dsh-wechat-mp-search
```

`dsh-wechat-mp-search@0.1.1` —— **npm 上存在，并且自带一个 stdio MCP server**，
工具 `weixin_search` / `weixin_search_all` / `get_weixin_article_content`，零配置。
真正的反爬处理：会话 cookie jar（cookie 只发给 `weixin.sogou.com`）、抖动延迟、
403/429/503 时重建会话重试一次、`maxPages` 硬上限 30、明确区分 `blocked` 与 `error`。

**同级别 npm 备选**（都不需要 GitHub）：

| 包 | 说明 |
|---|---|
| `@wjx-ai/dsh-wx-reader@1.0.4` | 工具 `read_wechat_article`；README 称「不需要任何 Python 第三方包，不需要 Selenium / 浏览器，不需要配置 API Key」（仅 Python 3 标准库） |
| `dsh-wechat-article-fetcher@0.1.2` | 工具 `wechat_article_fetch` + 独立 CLI：`node lib/fetch_wechat_article.cjs "<url>" [--json] [--out <dir>]`。匿名即可拿到标题/作者/公众号/发布时间 + 结构化正文；给登录 cookie 还能拿读数、点赞、在看、评论 |
| `dsh-ab-wechat-scrape@0.5.11` | 直接写 Markdown 文件，`cookieJar` 默认开，带 SSRF 防护，`searchEngine: sogou` |

**GitHub 备选**（`dsh-weixin-reader`，**确认 npm 上 404，只有 GitHub**）：

```powershell
& '<DSH_CMD>' plugin --profile web add github:jack1545/dsh-weixin-reader
```

它用**宿主进程的 `fetch`** 抓取并解析成 Markdown，**零凭据、零第三方、零额度**；
刻意不用子进程（DSH 沙箱会 `EPERM` 拦子进程管道），宿主 `fetch` **继承 DSH 进程代理设置**；
硬白名单 `mp.weixin.qq.com`，不做批量抓取，**失败就大声报错不降级**。
局限：读不了临时分享链接（`src=11`），要用永久 `/s/` 链接；0★/无 tag → 当无维护，建议 fork。

> 微信公众平台官方 API **读不了别人的文章**（素材/草稿/发布全是自有账号作用域）。
> 搜狗微信只能做发现，结果链接是 `/link?url=` 跳转，需带 cookie jar 手动跟随。
> 另有 RSS 桥（wechat2rss.xlab.app / werss.app / feeddd.org）可达但由 JS 驱动，
> **取不到直链文章 URL**，不如上面的 npm 包。
> 备选：`dsh-deepread` 原生支持公众号稳定链接（需挂 `dsh-web-fetch-http` + 浏览器 UA）。

**通用网页抓取**（公开页/JS 渲染/反爬页，无登录态）：
```powershell
& '<DSH_CMD>' plugin --profile web add github:tc635807/better-crawler4agent
```
带 **SSRF 防护**，零凭据，能处理字体蜜罐、假成功/软 404。需 Python 3.10+ 与约 700MB Chromium。
**因为 GitHub 实测可达，这个现在就能装。**

**不要碰**：`dsh-socai`（只有 macOS 安装方式，且是小红书）、
`dsh-mediacrawler`（停更 + 钉死旧版 DSH + 上游非商业许可 + 含小红书）、
`redfox-community-dsh`（付费云 API 包装 + 含小红书）、
`linkdigest-mcp`（付费闭源、**不支持 B 站**、README 未提 DSH）。

### 4.3 长文、论文、视频

**首选 `deep-read-summarize`（npm，0.3.13，已实测）—— 最贴合「做一件事之前先学会它」。**

- **已在 DSH 0.2.0-rc.2 / Node 24 上验证**（正是本机版本）。
- 三波工作流：抓取 → **N 个子代理并行分块精读** → 合并 + 质量校验；
  输出带 YAML frontmatter 的 CommonMark；引用必须带页/节/段；失败的块**标记为空缺**。
- **视频字幕优先**：① B站官方 API 的 AI 字幕 / YouTube CC 直接用；
  ② 无字幕 → **本地转录**（`uv` 引导 Python 3.12 + `faster-whisper`，
  走**清华镜像** + `HF_ENDPOINT=https://hf-mirror.com`；自带 PyAV，**不需要另装 ffmpeg**）；
  ③ 再不行 → 降级并如实报告 `textSource`。
- **Windows 一等公民**（0.3.9 起）：`winget install poppler yt-dlp.yt-dlp astral-sh.uv`。
- **零凭据**，转录全在本机。
- ⚠️ **必须写进施工提示的坑**：它的 workflow 脚本沙箱**没有文件系统** ——
  脚本只返回 `{ok,kind,title,filePath,qualityPassed,note}`，
  **主 agent 必须自己用 `write` 把 `note` 写到 `filePath`**。

**配套 `dsh-deepread`（npm，1.0.1，已实测）—— 「读完变成自己的认知」。**

- 5 种模式：`quick` / `deep` / **`map`** / **`feynman`** / `book`。
  **`map`**：核心问题与结论、十类内容、**每条主张都配证据**（原文没有就明确写
  「原文未提供证据」）、关键数据表五要素、**四级置信度**、Mermaid 思维导图、可导 XMind。
  **`feynman`**：11 步循环，含**第 1/3/7/14/30 天间隔复习** —— 真正的「学会」。
- **PDF 用内置纯 JS 提取器**（支持中文 ToUnicode 映射、object-stream/xref-stream），
  **不需要外部 `pdftotext`**。
- **原生支持微信公众号稳定链接**、文件、粘贴文本；支持 2–10 篇批量对比。
- **零凭据**；全文缓存在 `$DSH_HOME/storages/`（7 天 TTL）。
- 附带可移植的 Agent Skill 形态（`npx skills@latest add xiehuan123/dsh-deepread`）。

**学术 API（把资料下载下来）**：
优先 **`dsh-pubmed`（npm 0.4.4，26 个工具、key 全可选）**；
`dsh-zotero`（npm 0.12.1，Zotero 本地 API，**读取免 key**，可下载 PDF 并代写笔记，
但需本机 Zotero 7+ 运行且开启 local API）。
⚠️ `dsh-ai4scholar` **需要付费 key + 额度**，不是免 key，可跳过（详见 4.4）。

**视频（实测有硬限制，必须如实告知用户）**：

- **YouTube 本机完全不可用** —— `youtube.com` 与 `/api/timedtext` 均超时。
  **没有免 key 的路子，必须有代理。**
- **B站：字幕**能**匿名拿到 —— ✅ 可用（本条曾被我判错，现已修正并独立复核）。**

  **正确端点（关键）**：`GET /x/v2/dm/view?aid=<aid>&oid=<cid>&type=1`，
  只带 `User-Agent`，**无 Cookie 无 Referer** → `code=0`，
  返回带 `auth_key` 的 `subtitle_url`（`http://` 改写成 `https://` 直接下载，200）。

  | 视频 | `view.subtitle.list` | `player/v2` | **`dm/view`** | 取回 |
  |---|---|---|---|---|
  | `BV1GJ411x7h7` | 12 轨、URL 全空 | 0 条 | **12 轨已签发** | **47 cue** |
  | `BV1nCWc6KEfS` | 0 轨 | 0 条 | **8 轨（ai-zh）** | **53 cue** |
  | `BV1xx411c7mD` | 0 轨 | 0 条 | 0 轨 | 真没字幕 |

  > **判据写死**：判断「有没有字幕」**只能看 `dm/view`**。
  > 看 `view` / `player/v2` 会得出**相反的错误结论** —— 我上一轮就是这么错的。
  > 三方范围扫描：`dm/view` **14/19 有轨**，而 `player/v2` **0/19**。

  - 附带：取视频列表用 `popular`（`code:0`）；`ranking/v2` → `-352` 风控。
  - 边界：付费/番剧/课程/充电专属匿名拿不到（与「未登录能否在网页播放」一致）；
    `auth_key` 有时效，**用前现取现下，不要缓存 URL**。
  - 现成脚本：`research\bili-probe\bili_subtitle.py`（他方产物，已验证）。

- **本地转录：本机已有可离线运行的资产，不必然要下 HuggingFace 权重。**
  - **SenseVoice int8 ONNX（239MB）本机已有**：
    `~\.dsh\speech-to-text\sensevoice\models\sensevoice-onnx\model.int8.onnx`
    —— **无需下载、无外网推理**；实测 126s 中文视频转 612 字，RTF 0.026。
  - **ffmpeg 本机也有**（只是**不在 PATH**，所以命令行直接调会报找不到）：
    `<LOCALAPPDATA>\Programs\OhMyPPT\resources\app.asar.unpacked\resources\ffmpeg\ffmpeg.exe`
  - 兜底脚本：`research\bili-probe\bili_fetch_asr.py`（匿名取音频 → ffmpeg → 本地 SenseVoice）。
  - ⚠️ **ASR 必须分段（默认 30 秒窗口）**：one-shot 喂长音频遇到音乐/非语音段会触发
    CTC 重复环 —— 实测 212s 音乐 one-shot 只出 48 字「goodbye goodbye…」，
    切 30s 窗口出 **619 字真歌词**。
  - （另一条路：`faster-whisper` 权重仍来自被墙的 HuggingFace；
    `hf-mirror.com` 实测**可用**（`model.bin` HEAD 200，461MB），但既然本机已有 SenseVoice，
    **视频转录不必走这条路**。）
- `dsh-video-understand`（npm 0.5.2，B站走 yt-dlp；**需 `LLM_API_KEY`**，默认 MiMo；
  **无字幕路径**，即有 CC 也走 ASR；「AVIS / 压缩 99.95%」是营销话术，意思是「不发视频只发文本层」；
  10★、约 7 周未更新）—— **备选**。
- `dsh-video-lens`（npm 0.3.2）**只读本地文件、不接受 URL**；
  ⚠️ **0.3.1 曾把 DSH 启动彻底弄挂**（钉旧 `dsh-tools` → `CallId` 导出错误 →
  「任一 Loader 条目失败则整棵树失败」）→ **只装 ≥0.3.2**。
- **不要装 `zimai233/dsh-video-downloader`**（只能下已拿到的直链；用 `yt-dlp`/`BBDown`）。

### 4.4 沉淀层

**第一优先是「行为技能 + 知识库目录」**（第 5 节），插件是加分项：

- **知乎知识库（官方 RAG）** —— 已含在 `@klarkxy/dsh-zhihu` 的 Knowledge base 面板里：
  上传参考文件 + RAG 检索，`knowledge` 池 **500/天**。
  ⚠️ 文件存在知乎服务器 → **不要传未公开稿子**；插件侧单文件 ≤20MB。
- **`dsh-obsidian`（npm 0.2.6）**：接本地 Obsidian vault，12 个工具，**纯本地文件系统**、
  **完全不联网络**；删除 = 移到 `.trash/`；**Windows 专门适配**。
  ⚠️ **至少 5 个插件都叫 `dsh-obsidian`**；带 `wiki_lint` 的是 `@qiqiangvae/dsh-obsidian`。
- **`clearai-dsh`（npm 0.5.5）**：Epistemic Loop —— 结论必须凭证据成立，而非自行宣告完成。
- **`dsh-run2skill`（npm 0.5.0-alpha.4）**：把纠正/约束整理成**可审核**的原生 Skill，确认后才落盘。
- **`dsh-knowledge`（0.5.2）/ `dsh-library`（0.2.20）**：本地 RAG。
  **等 `_knowledge\` 长到几百个文件、grep 不够用了再上。**
  - `dsh-library`：**「本地优先，零网络调用」**，混合检索 + 多样性重排 + 引用校验，**免 key**。
  - `dsh-knowledge`：免 key（**词法回退**，不必装 embedding API），但 **AGPL-3.0**，
    且安装时需要合并 `allowBuilds`，否则报 `ERR_PNPM_IGNORED_BUILDS`。
  - `dsh-kb-rag`（1.6.7）：SQLite RAG（BM25+向量+交叉编码器），免 key。
    ⚠️ **中文坑（官方 README 自述）**：**「BM25 按 token 匹配，中文查询会让混合排序的关键词那一路空转」**
    → **查询要写成英文词串**，否则关键词检索等于没有。
- **`dsh-zotero`（0.12.1）**：走本机 Zotero 的 `127.0.0.1:23119`，**读取免 key**；
  但**需要本机跑着 Zotero 7+ 并开启 local API**；写入需要 Zotero 10 且默认关闭。
- **`dsh-pubmed`（0.4.4）**：把 **PubMed + Europe PMC + OpenAlex + PubTator3 + Semantic Scholar
  打包成 26 个工具，所有 key 都是可选**（只影响速率）—— **最接近「免 key 多源学术全家桶」**，
  比逐条手打 REST 省事。**推荐加装。**
- ⚠️ **`dsh-ai4scholar`（0.3.7）需要 AI4Scholar 的 API key + 额度**（托管在 ai4scholar.net），
  **不是免 key**。38 个工具确实丰富，但要用就得注册充值 —— 有 `dsh-pubmed` + 直调 OpenAlex 就够，
  **可以跳过**。

**重型记忆层：暂不装。** 调研结论：WeKnora（3.4 万星）**没有 DSH 插件**；
distilly（2.6 万星）**不是插件**；EverOS 真插件仅 0.1.0、周下载约 100；
MemOS 真插件 npm 元数据**没有 repository 链接**且有描述逐字相同的第三方转发包（供应链异味）。
唯一像样的是 `@openviking/dsh-memory-plugin`（npm 0.5.26，官方 DSH 文档齐全），
但需**自建常驻服务 + embedding 模型 + VLM**。
**若日后要装，首选 `dsh-engramory`（npm 0.2.5）** —— 它加的是**约定**，
零基础设施、本地 Markdown、**爆炸半径最小**。

### 4.5 运维

```powershell
& '<DSH_CMD>' plugin --profile web add dshbase-catalog   # 离线目录检索
& '<DSH_CMD>' plugin --profile web add dsh-mcp-panel     # MCP 面板 + /mcp 诊断
& '<DSH_CMD>' plugin --profile web add dsh-mcp-lazy      # 多 MCP 时省 token
```

⚠️ `dshbase-catalog` 的目录**混入大量非插件条目**，且计数自相矛盾
（npm 描述 1700+ / README 1100+ / 站点 19990）→ **当「描述匹配器」用，绝不当安装保证**；
它也不能自己装，所谓 auto-install 是 agent 拿命令后自己执行。
**不建议装 `dshmarket`**（与已生效的 `dsh-plugin` 重复，且有弄挂 profile 的历史版本）。

### 4.6 其他值得接的 API（**本机逐个实测过**）

用户问「还有什么其他 API 放上去」。下面每一项都是**在本机用 Node `fetch` 真发过请求**的结果，
不是查来的传闻。先说结论：**其中 4 个现在就能用，而且不用装任何东西** ——
agent 自带 `web_fetch`，直接调这些 API 就行。

**✅ 实测可用（免 key，本机直连，无需代理）**

| API | 作用 | 实测 | 参考知识时怎么用 |
|---|---|---|---|
| **OpenAlex** | 2.5 亿+ 学术作品元数据：标题/作者/机构/引用/概念/开放获取链接 | **200，41KB** | 学一个陌生领域时的**第一站**：查奠基论文、综述、被引最多的文章 |
| **Crossref** | DOI 元数据（期刊/会议/卷期/作者） | **200** | 拿到 DOI 后补全出版信息、找正式出处 |
| **PubMed / NCBI E-utilities** | 生物医学文献（esearch/efetch） | **200** | 医学生命科学类任务 |
| **DOAJ** | 开放获取期刊论文 | **200** | 找能免费下载全文的论文 |
| **Unpaywall** | 用 DOI 找合法免费全文 PDF | 可达（要填邮箱） | 「把有用的东西下载下来」的关键一环 |
| **GitHub REST API** | 仓库/issue/README/release/代码搜索 | **200** | 查库怎么用、看 issue 里的真实报错原因 |
| **npm registry API** | 包版本/依赖/元数据 | **200**（254KB） | **装插件前核对包名是否真实存在**（本方案反复用到） |

**❌ 实测被墙（本机连不上，不要规划进去）**

| 服务 | 实测 |
|---|---|
| **Wikipedia API（en 与 zh）** | **连接超时** |
| **Wikidata 官方 SPARQL（query.wikidata.org）** | **连接超时** |
| **Jina Reader（`r.jina.ai`）** | **连接超时** |

**✅ 但有三个「绕过」实测可用（这条很重要，别因为 API 被墙就放弃维基数据）**

| 绕法 | 实测 | 说明 |
|---|---|---|
| **`dumps.wikimedia.org`** | **可达**，能列目录、能下载（实测下到 `zhwiki-latest-site_stats.sql.gz`） | 维基百科/维基词典/Wikidata 的**离线 dump 拿得到**，只是 API 被墙 |
| **Qlever Wikidata SPARQL** | **返回真实结果** `https://qlever.cs.uni-freiburg.de/api/wikidata?query=` | 目前**唯一能用的结构化实体知识端点**。坑：裸端点返回 404，必须带 `?query=`；**`wd:`/`wdt:` 未预注册，每个 PREFIX 都要自己声明**（与 WDQS 不同） |
| **DBpedia SPARQL** | `dbpedia.org/sparql` **可达** | 另一个实体知识备选 |

→ 需要维基类知识时：结构化查询走 **Qlever**，全量语料走 **dumps**，
一般性查证走 OpenAlex / Crossref / 知乎全网搜索。

**⚠️ 可达但被限流（要么等、要么申请 key）**

| 服务 | 实测 | 修法 |
|---|---|---|
| **arXiv API** | 我这次撞到 **429**；独立复测**成功（264ms）** | 规则是 **1 请求/3 秒**；带上真实 User-Agent 并放慢。⚠️ **它限流时也返回 HTTP 200**，要看内容判断 |
| **Semantic Scholar** | **429 `Too Many Requests`** | 免 key 是**全体匿名用户共享 1000 rps**（早已饱和）；申请免费 key → 独占 1 rps |
| **OpenAlex** | 可用，但**有隐藏额度** | 免 key 实测 **10 rps，且与同 IP 所有人共享「$0.10/天」预算**（`x-ratelimit-limit: 1000`，$0.0001/次）；**`mailto=` 不会提额**（官方 body 里明说），**翻页超过第 1 页需要 key**。免费 key 可由 agent 自助申请：`POST https://api.openalex.org/api-keys {"email":"..."}` → 邮件激活 |

**其它实测可用的免费源（免 key）**

| 源 | 用途 | 额度 |
|---|---|---|
| **知乎日报 legacy API** | `news-at.zhihu.com/api/4/news/latest` → 200，日期 + 5 条大图 + 4 条；`/api/4/news/{id}` → **完整正文（实测 3285 字 HTML）** | 免 key，无公开额度说明 |
| **Europe PMC / CORE / OpenAIRE / HAL / DataCite / OSF / bioRxiv** | 学术补充（bioRxiv **只有 interval/DOI，无关键词检索**） | CORE 免注册：**每 10 秒 1 批或 5 个单请求** |
| **MyMemory 翻译** | 免 key 翻译 | **匿名 5000 字符/天**，带 `de=<email>` 提到 50000；q ≤ 500 字节 |
| **Bing / 百度 / 搜狗 / 360 / Mojeek** | 免 key 搜索页 | 见 4.1 的 `dsh-free-search` |
| **`dsh-pubmed@0.4.4`** | 把 **PubMed + Europe PMC + OpenAlex + PubTator3 + Semantic Scholar 打包成 26 个工具，所有 key 可选** | 最接近「免 key 多源学术全家桶」 |

**⚠️ 这些知乎接口不要碰**：`www.zhihu.com` 与 `zhuanlan.zhihu.com` 返回 **403 + `zh-zse-ck` ZSE 风控**；
`api/v4/questions/*`、`api/v4/search_v3` 同样 403/400。
**不要试图绕过 ZSE**（违反 ToS 且对方在积极防守）—— 你有官方 API，走官方的。

**「学习性价比」最高的 5 个（结论）**

1. **知乎 `global_search`** —— 已有额度 5000/天，站外全网搜索 + 正文，**中文技术内容最强**。
2. **OpenAlex** —— 免费无限、本机直连，**任何陌生领域的学术入门**都靠它。
3. **GitHub API** —— 查「这个库到底怎么用/为什么报这个错」，`issue` 与 README 是一手来源。
4. **npm registry API** —— **验证包是否真实存在**，避免被插件市场的假命令坑（本方案反复需要）。
5. **OpenAlex + Unpaywall 组合** —— 找到论文 → 找到合法免费全文 → **下载进 `_knowledge\raw\`**。

**接法（按成本从低到高）**

1. **什么都不装**：让 agent 用 `web_fetch` 直接打这些 REST 端点（**推荐，零成本**）。
   例：`https://api.openalex.org/works?search=<关键词>&per-page=10`。
2. **想要独立工具**：按 2.3 写 MCP 配置接社区的 arXiv/PubMed MCP server
   （GitHub 已实测可达，这类 server 现在就能拉）。
3. **要中文引擎**：**博查 Bocha**（`open.bochaai.com` 本机实测 200 可达，需 key）是
   国内最常见的 LLM 搜索 API 之一；但**你已经有知乎 5000 次/天，先不必额外花钱**。

> **一句话**：搜索靠知乎（已付费额度且免费），学术靠 OpenAlex/Crossref/PubMed/DOAJ，
> 代码靠 GitHub/npm，**这四个方向都不需要新花钱、也不需要浏览器**。

---

## 5. 行为技能与知识库（**已装好，最重要的一件**）

### 5.1 技能 `research-autonomy`（已生效）

```
<workspace>\.dsh\skills\research-autonomy\SKILL.md   ← 已装，本会话生效
<workspace>\docs\research-autonomy\SKILL.md          ← 源文件备份
```

想让它对**所有工作区**生效（rank 400），由**用户手动**复制到
`~\.dsh\skills\research-autonomy\`（工作区 `AGENTS.md` 禁止 agent 自己往 `~\.dsh` 写）。

**技能核心是一个「任务驱动的自学循环」**：

```
Step 0  先说出缺口：「要做这件事，我还缺：___」
Step 1  把缺口写成 2–5 条关键词查询（报错原文加引号 / 带版本 / 带环境 / 中英双语 / site:）
Step 2  搜 —— 换引擎、换平台（官方文档 / 仓库 / issue / 知乎 / 论文 / 视频转录）
Step 3  读一手来源，有用的存进 _knowledge\raw\
Step 4  提炼成能直接用的东西（命令 / 配置 / 步骤 / 参数表 / 判断规则）
Step 5  用它把任务做出来，再拿来源核对
Step 6  不通就回到 Step 1 继续迭代（同一缺口 3 轮上限）
Step 7  写成笔记（含死路），下次不用重查
```

硬性约束：**不在缺知识的状态下硬做任务**；**绝不引用没 fetch 过的 URL**；
**绝不编造**工具名/参数/字段；**学到的必须留下**；**3 轮不收敛就如实上报**；
**保护账号**（优先官方 API、只读、**不搞小红书**、**不交 Cookie**）；**只写工作区内**。

### 5.2 知识库目录

```
<workspace>\_knowledge\
  index.md                     # 每个笔记一行
  raw\YYYY-MM-DD-<slug>.md     # 抓到的原文/配置/代码，逐字保留 ←「把有用的东西下载下来」
  notes\YYYY-MM-DD-<slug>.md   # 缺口 / 发现 / 怎么用 / 影响 / 未知
  lessons\<topic>.md           # 去重后的长期结论
```

```powershell
$k = '<workspace>\_knowledge'
foreach($d in @('raw','notes','lessons')){ New-Item -ItemType Directory -Force -Path "$k\$d" | Out-Null }
if (-not (Test-Path "$k\index.md")) {
  "# 知识库索引`n`n> 每查完一次留有价值的东西就加一行：`n> ``- <日期> <主题> — <一句话结论> (notes/<文件>)```n" |
    Set-Content "$k\index.md" -Encoding UTF8
}
```

规则：笔记短、**长材料进 `raw\`**；`lessons\` **先去重再更新**；**死路也要记**；
**绝不写密钥/Cookie/隐私**。本地这一层是**真相源**，知乎知识库是**云端索引**，两者可并存。

### 5.3 凭据文件与写入位置（实测）

`<workspace>\_secrets\zhihu.env` —— 变量名 `ZHIHU_ACCESS_SECRET`。
**该文件含明文密钥**：不要外发、不要进仓库、不要截图。

**怎么把它交给插件（两条路，实测过 DSH 的凭据机制）**：

1. **推荐：插件面板里填**（UI）。
   插件依赖 `@deepseek-ai/dsh-credentials`，凭据由 DSH 凭据库管理：
   **设置 → 插件 → Zhihu → Settings** 填入 Access Secret。
   这样密钥进 DSH 凭据库（`~/.dsh/.credentials.yaml` 的 `records`/`refs` 结构），
   **不会以明文散落在配置里**。
2. **或不走 UI**：在 `<DSH_HOME>\.env` 里加一行
   `ZHIHU_ACCESS_TOKEN=<Access Secret>`（DSH 启动时读取该文件；
   现有 `TAPNOW_TOKEN` 就是这么放的）。

> ⚠️ 两条路都要写 `~\.dsh\`，**在 DSH 沙箱内做不到**（沙箱只让写工作区）→
> **必须由用户在沙箱外操作，或由 installer 拿到 Full access 后执行。**
> **不要**把明文密钥写进 `cordis.patch.yml`（现有 `mcp-tapnow` 就是明文写 token 的反面教材）。

注意凭据**变量名不一样**，别混：
`@klarkxy/dsh-zhihu` 用 **`ZHIHU_ACCESS_TOKEN`**；
`dsh-zhihu-search` / `zhihu-mcp-proxy` 用 **`ZHIHU_ACCESS_SECRET`**。

---

## 6. 兜底：手写 MCP 接一个 API

有 API 没插件时，**不写插件，先写 MCP 配置**。编辑
`<DSH_HOME>\profiles\web\cordis.patch.yml`，字段见 2.3。
要点：**`transport` 只有 `stdio` 和 `streamable-http`（没有 SSE）**；
密钥放 `<DSH_HOME>\.env` 用 `!!js process.env.X` 引用；
`failOnStartupError: false` 保证坏插件不拖垮启动；装了 `dsh-mcp-panel` 后用 `/mcp` 诊断。

**SSE 服务怎么办**：写一个 stdio 桥（社区现成例子：`zhihu-mcp-proxy` 就是把
知乎官方 SSE MCP 桥成 stdio），或在 `command` 里用 `npx -y <bridge>` 包一层。

---

## 7. 施工步骤（给 installer AI）

> **前置条件**：`dsh plugin` 命令**必须在 DSH 沙箱外**的普通 PowerShell 里跑。
> GUI 里用 **设置 → 插件市场** 更简单，但**不要照抄市场里的命令** —— 先核对包名。

**Step 0 — 自检**

```powershell
& '<DSH_CMD>' --version      # 期望 0.2.0-rc.2
npm view @klarkxy/dsh-zhihu version                           # 期望 0.2.4
npm view dsh-free-search version                              # 期望 0.9.0
```

**Step 1 — 搜索层**

```powershell
& '<DSH_CMD>' plugin --profile web add @klarkxy/dsh-zhihu
& '<DSH_CMD>' plugin --profile web add dsh-free-search
```

装完在 **设置 → 插件 → Zhihu** 里填 Access Secret（凭据名 `ZHIHU_ACCESS_TOKEN`），
并**把 `dailyCallLimit` 调高**（默认为 100，而真实免费额度是 5000/天）；
`allowPaid` 保持 `false`。然后到 **设置 → 插件 → 插件配置 → 网页搜索**，
把知乎 / 免 key 引擎设为首选提供方，`deepseek-official` 留兜底。

**Step 2 — 把知乎工具交给模型（可选但推荐）**

按 2.4 覆盖 `preset-standard`，在 `plugins` 列表里加 `- name: '@klarkxy/dsh-zhihu/tools'`。
**改前备份 `<DSH_HOME>\profiles\web\cordis.patch.yml`。**
（不要去找 `agent.cordis.yml` —— DSH 已经不读它了。）

**Step 3 — 阅读层**

```powershell
& '<DSH_CMD>' plugin --profile web add deep-read-summarize
& '<DSH_CMD>' plugin --profile web add dsh-deepread
# 微信公众号：优先 npm 包（搜索+读取一体，自带 MCP server，不需要 GitHub）
& '<DSH_CMD>' plugin --profile web add dsh-wechat-mp-search
# 通用反爬抓取（可选，需 Python + Chromium）
& '<DSH_CMD>' plugin --profile web add github:tc635807/better-crawler4agent
# 学术多源全家桶（key 全可选）
& '<DSH_CMD>' plugin --profile web add dsh-pubmed
```

**Step 3b — 先验证一次「本地转录」能不能跑**（否则 B站无字幕的视频会退化失败）：
`faster-whisper` 的权重来自**被墙的 HuggingFace**，`HF_ENDPOINT` 镜像机制**未验证**。
随便拿一个短视频跑一次 `deep-read-summarize`，确认它真的能出 `textSource: transcription`；
跑不通就如实告诉用户「视频只能靠平台字幕或你自己贴文稿」。

**Step 4 — 沉淀层**

```powershell
Test-Path '<workspace>\.dsh\skills\research-autonomy\SKILL.md'  # 必须 True
# 建 _knowledge 目录（5.2 的脚本）
& '<DSH_CMD>' plugin --profile web add dsh-run2skill
& '<DSH_CMD>' plugin --profile web add dsh-obsidian   # 可选
```

**Step 5 — 运维（可选）**：`dshbase-catalog`、`dsh-mcp-panel`、`dsh-mcp-lazy`。

**Step 6 — 重启 DSH，跑第 8 节验收，如实汇报**：
哪些装上了、哪些失败、为什么；并把**知乎密钥已在聊天中出现过、建议轮换**这件事告诉用户。

---

## 8. 验收测试

| # | 测什么 | 怎么测 | 通过标准 |
|---|---|---|---|
| T1 | **任务驱动自学（最关键）** | 给一个**没有现成材料**的小任务，例如「用某个陌生库做 X」 | **先说出缺口**，再上网搜、读一手文档、写出能跑的东西；不是凭印象直接写 |
| T2 | **迭代行为** | 给一个第一次必然做不对的任务 | 失败后**回去改关键词重查**，而不是原地重试或放弃；3 轮内收敛或如实上报 |
| T3 | **留档** | 跑完 T1 检查 `_knowledge\` | `raw\` 有存下的原文，`notes\` 有带 sources 的笔记，`index.md` 多了一行 |
| T4 | 知乎额度可见 | 插件面板 **Official quota** | 显示 5000/5000 量级的搜索额度（与第 3.2 节一致） |
| T5 | **全网搜索真的进 `web_search`** | 在 **网页搜索** 提供方列表里找知乎 | 知乎出现在提供方列表中；用它能搜到站外网页 |
| T6 | 知乎工具可用（若做了 Step 2） | 让它搜一个知乎问题 | 调用 `zhihu_search` / `zhihu_global_search`，结果带来源链接 |
| T7 | 多引擎 | 问一个中文技术问题，要求换引擎各搜一次 | 能切引擎；结果带真实链接；说明实际打开了哪几个页面 |
| T8 | 知识库 RAG | 面板里传一个小文件 → 检索 | 上传成功且能检索到（消耗 `knowledge` 额度） |
| T9 | 长文/视频 | 给一篇论文 PDF、一个 B站链接 | `deep-read-summarize` 出摘要且 `textSource` 明确；`dsh-deepread` 的 `map` 出主张+证据+置信度 |
| T10 | 精读笔记真落盘 | 跑一次 `deep-read-summarize` | `filePath` 处**真有文件**（脚本沙箱不能写文件，必须主 agent 写） |
| T11 | 公众号 | 给一个 `mp.weixin.qq.com` 永久 `/s/` 链接 | `dsh-weixin-reader` 返回干净 Markdown；失败要大声报错而非降级 |
| T12 | **失败不编造** | 断网后问一个需要联网的事实 | 明确报告「查不到 / 网络不可达」，**不编造** |
| T13 | 技能被发现 | 新会话问「你有哪些技能」 | 列表含 `research-autonomy` |
| T14 | **没有小红书能力** | 问「能帮我刷小红书吗」 | 明确回答不做（封号风险）并给替代方案 |

**T1、T2、T12 是改造是否成功的真正判据。**

---

## 9. 风险与合规

### 9.1 凭据安全（最要紧）
- 知乎官方明确要求「**不要把 Access Secret 发到聊天中**」——
  **本密钥已经发过，建议去 <https://developer.zhihu.com/personal> 轮换**。
- 它现在存在 `_secrets\zhihu.env`（工作区内明文）。**不要外发、不要进仓库。**
- 安装时填进插件面板即可，**不要明文写进 `cordis.patch.yml`**。

### 9.2 账号安全
- **不做小红书**，任何形式都不做。
- 优先**官方 API**；只读、限量、不批量、不发布；**不交 Cookie**、不做扫码登录自动化。
- 明确**不采用** `@zhengjunyao/dsh-zhihu`（包装 `pyzhihu-cli`，需扫码/Cookie）。

### 9.3 数据外发
| 组件 | 外发到 |
|---|---|
| 知乎插件 / `global_search` / `zhihu_search` | 知乎（查询内容） |
| **知乎知识库上传** | **文件存在知乎服务器上 → 不要传未公开稿子**（≤20MB/文件） |
| `dsh-free-search` / `web_search` | 所选搜索引擎 |
| `deep-read-summarize` | **不外发**（转录在本机） |
| `dsh-deepread` | **不外发**（本地 PDF/文本提取） |
| `dsh-video-understand` L1/L2 | JPEG 帧 → MiMo API（L0 全本地） |

`dsh-free-search` 自述 `web_fetch` **无 SSRF 防护** → 不要让 agent 抓不受控的内网 URL。

### 9.4 第三方插件供应链
**dshbase 的「已验证」只等于「装得上、能启动、能跑一次问答」—— 不是安全审计。**
实测还发现：目录混入大量非插件条目；热门榜是上游仓库星数；不同来源对同一插件的
「已验证」状态互相矛盾。
本人亲自 fetch 的 `dshbase/plugins/modsearch` 页面**确实**给出 **⚠高风险**
（`越权访问` medium、`危险命令` high），但其它页面多显示「安全：尚未扫描」
（长页面里该块常被截断）→ **「没看到标记」≠「已审计安全」。**

### 9.5 已知会把 DSH 弄挂的插件
**`dsh-video-lens` 0.3.1** → 钉旧 `dsh-tools` → `CallId` 导出错误 →
DSH「任一 Loader 条目失败则整棵树失败」→ **整个应用起不来**。
**只装 ≥0.3.2**；恢复：`dsh plugin --profile web remove dsh-video-lens` 或客户端 Recovery 页。
**同理：Step 2 覆盖 agent 预设时写漏 `plugins` 一行也会丢能力 → 改前备份。**

### 9.6 未验证项（不要当事实）
1. `dsh-weixin-reader` 与 `better-crawler4agent` **未实际安装**（只核实了仓库与 tarball 可达）。
2. `@klarkxy/dsh-zhihu` 的**运行时行为**未在本机装过验证；但已实测确认
   其 `exports` 含 `./tools` 子路径、`dsh.bundle.patch` 存在、peer 范围与
   DSH 0.2.0-rc.2 匹配。其 README 说的 `agent.cordis.yml` 已确认是**废弃格式**，
   实际要按 2.4 改预设。
3. 知乎 `tools` 池只有 **10/天**（实测），PDF/PPT 能力很受限。
4. 官方额度统计有**滞后**（实测用完仍显示 `TotalUsed: 0`），别当实时账单。
5. 「小红书/微信无公开读取 API」来自通用认知，未重新拉取权威政策页。
   （**微信那条已被推翻**：实测 `mp.weixin.qq.com` 免 key 免浏览器就能读，见 4.2。）
6. **B站字幕是否需要 `SESSDATA`** —— 抽样 12/12 为空，属**推断**，非官方文档。
7. **`faster-whisper` 的 `HF_ENDPOINT` 镜像机制** —— 未验证（权重来自被墙的 HuggingFace）。
8. 以下免费额度数字**未验证**：DeepL Free 的 50 万字符/月、百度翻译免费额度、
   有道（文档写的是**赠送 ¥50 体验金**，不是每日免费额度）、Unpaywall 10 万/天、
   GDELT 是否免 key。
9. `mcp-server-fetch` 在 npm 上是 `0.0.1-security` —— **安全占位包，不是真工具**。

### 9.7 写入边界
所有产物必须在 `<workspace>\` 内。
知识库、下载的资料、笔记放 `_knowledge\`；凭据放 `_secrets\`。

---

## 10. 候选黑名单

| 插件 | 为什么不装 |
|---|---|
| `dsh-socai` / `dsh-mediacrawler` / `redfox-community-dsh` | 小红书自动化（用户已排除）；且分别是 macOS-only / 停更+非商业许可 / 付费云 API |
| `linkdigest-mcp` | 付费闭源 SaaS，**不支持 B 站**，README 未提 DSH |
| `dsh-wx-archive` | 2100laike 限额薄客户端（匿名 8 次/天），URL 外发，停更 |
| `dsh-wechat-collector` | 首跑运行时是 **macOS-only（launchd）**，且要你的微信账号扫码 |
| `zimai233/dsh-video-downloader` | 只能下已拿到的直链，无 yt-dlp/无解析/无 DASH 合并 |
| `@zhengjunyao/dsh-zhihu` | 非官方 API，包装 `pyzhihu-cli`，需扫码/Cookie |
| `dsh-ai4scholar` | **不是免 key**：需要 AI4Scholar 托管服务的 key + 额度。用 `dsh-pubmed` + 直调 OpenAlex 替代 |
| `@copylee/dsh-academic` | 它的 CNKI / Google Scholar 路径**用浏览器**，违反「不要 Chrome」；且 CNKI 本身无合法 API |
| `mcp-server-fetch`（npm） | 是 `0.0.1-security` **安全占位包**，不是可用工具 |
| 各类 **Wikipedia/Wikidata MCP server**（`@pipeworx/mcp-wikipedia`、`@cyanheads/wikipedia-mcp-server`、`@mrfentmen/wikipedia-mcp` 等） | **维基 API 本机全被墙，装了也用不了**。要用维基数据请走 Qlever SPARQL 或 `dumps.wikimedia.org` |
| `dsh-wechat-collector`（再列一次） | 除 macOS-only 外，它要**你的微信账号扫码**；已有免账号的 npm 方案（4.2），没必要冒险 |
| `dsh-web-search-free`（同名两个）/ `dsh-search-boost` | 名字撞车 / 已停更 |
| `dshmarket` | 与已生效的 `dsh-plugin` 重复；有越权标记 + 弄挂 profile 的历史版本 |
| `dsh-plugin-kit`（hyzyn） | slug 撞车（目录站指向另一仓库，catalog 有 3 个 owner）；无技能管理；聚合安装给模型**真 shell + Docker exec** |
| `dsh-memory-evolve` | 记忆推 git 分支（公开仓库 = 记忆公开）；权限面最宽 |
| `WeKnora` / `distilly` | **根本没有 DSH 插件**（目录站误列） |

---

## 11. 参考来源

- **知乎开放平台**：<https://developer.zhihu.com/docs>、
  个人中心 <https://developer.zhihu.com/personal>、
  额度 `GET /api/v1/quota`、知识库初始化 <https://zhida.zhihu.com/repositories/square>
- **知乎 API 字段级参考**（第三方整理，2026-09 快照）：
  <https://raw.githubusercontent.com/dawnswwwww/zhihu-cli/main/skills/zhihu-cli/references/api-reference.md>
- **知乎 DSH 插件**：<https://github.com/klarkxy/dsh-plugins/tree/main/plugins/dsh-zhihu>
  （插件 README 的 `agent.cordis.yml` 已废弃，以本文 2.4 为准）
- **DSH 官方包文档**（asar 内实测）：`dsh-tool-web`、`dsh-web-search-deepseek`、
  `dsh-mcp-client`、`dsh-skill-filesystem`、
  `dsh-agent-preset/skills/editing-cordis-compositions`
- **本机 npm 实测存在**：`@klarkxy/dsh-zhihu@0.2.4`、`dsh-free-search@0.9.0`、
  `dsh-zhihu-search@2.1.2`、`zhihu-mcp-proxy@1.1.0`、`deep-read-summarize@0.3.13`、
  `dsh-deepread@1.0.1`、`dsh-obsidian@0.2.6`、`clearai-dsh@0.5.5`、
  `dsh-run2skill@0.5.0-alpha.4`、`dsh-engramory@0.2.5`、`dsh-zotero@0.12.1`、
  `dshbase-catalog@0.3.58`、`dsh-mcp-panel@0.6.24`、`dsh-mcp-lazy@0.4.1`
- **微信公众号（npm 实测存在，均免 key、免浏览器）**：
  `dsh-wechat-mp-search@0.1.1`（**自带 stdio MCP server**）、
  `@wjx-ai/dsh-wx-reader@1.0.4`、`dsh-wechat-article-fetcher@0.1.2`、
  `dsh-ab-wechat-scrape@0.5.11`
- **学术（npm 实测存在）**：`dsh-pubmed@0.4.4`（26 工具，key 全可选）、
  `dsh-library@0.2.20`、`dsh-knowledge@0.5.2`、`dsh-kb-rag@1.6.7`
- **搜索引擎类插件（npm 实测存在，均注册原生 `WebSearchProvider`）**：
  `@bocha-ai/dsh-web-search-bocha@0.1.0`（**博查官方发布**）、
  `dsh-web-search-metaso@0.1.4`、`dsh-web-search-zhipu@0.1.0`、`dsh-web-search-glm@0.1.0`、
  `dsh-web-search-tavily@0.2.4`、`@tonydua/dsh-web-search-exa@0.2.3`、
  `@elves-ai/dsh-web-search-firecrawl@1.0.0`、`dsh-web-search-searxng@0.5.1`、
  `dsh-searxng@0.4.0`、`dsh-web-search-brave@0.2.4`、`dsh-web-search-doubao@0.2.1`、
  `@dingpenghui/dsh-web-search-serper@1.1.1`、`@yugasun/dsh-web-search@0.2.5`（五合一）
- **Bing Search API 已退役**（2025-08-11，微软官方生命周期公告）；
  替代品 Grounding with Bing Search 为 $14/1000 且非通用搜索 API
- **第三方实测报告留痕**：`_tmp\API-KNOWLEDGE-SOURCES-REPORT.md`、
  `_knowledge\lessons\keyless-apis-dsh-china.md`、`_tmp\apires\`（原始探测结果）
- **本机实测网络**：github.com / api.github.com / raw.githubusercontent.com /
  codeload.github.com / registry.npmjs.org / developer.zhihu.com —— **全部 200**
- **本机实测「其他 API」可达性**（见 4.6）：
  可用免 key —— OpenAlex、Crossref、PubMed E-utilities、DOAJ、Unpaywall、GitHub API、
  npm registry、**Qlever Wikidata SPARQL**、**dumps.wikimedia.org**、**mp.weixin.qq.com**、
  **weixin.sogou.com**、**news-at.zhihu.com（知乎日报）**、MyMemory；
  被墙 —— Wikipedia API(en/zh)、Wikidata 官方 SPARQL、Jina Reader、YouTube、
  Google News RSS、HuggingFace；
  限流 —— arXiv(1 请求/3 秒，限流时仍返 200)、Semantic Scholar(匿名池饱和)、OpenAlex(共享预算)
- **本机网络操作坑（见 2.5）**：`curl.exe` / `Invoke-WebRequest` **做不了 HTTPS**
  （`schannel: SEC_E_NO_CREDENTIALS`）→ 一律用 Node/Python；
  `npm view` 需 `--cache <工作区内路径>` 否则 `EPERM`
- **实测脚本留痕**：`_tmp\net_probe.mjs`、`_tmp\net_probe2.mjs`、`_tmp\zhihu_probe.mjs`、
  `_tmp\zhihu_capability_probe.mjs`、`_tmp\apiprobe.mjs`、`_tmp\apiprobe2.mjs`、
  `_tmp\catalog_scan*.txt`、`_tmp\asar_docs\`

---

## 附：一页速览（给用户看）

**要的是**：我给 AI 一件它没材料做的事，它**自己去网上把这件事学会**，然后做完、做好。

**最关键的好消息：你给的那把知乎钥匙，比想的值钱得多。**

实测你的密钥每天免费额度：

| 能力 | 每日免费 |
|---|---|
| **全网搜索**（站外整个互联网） | **5000 次** |
| 知乎站内搜索 | 5000 次 |
| 知乎用户数据 | 10000 次 |
| **知识库（传文档 + RAG 检索）** | 500 次 |
| 热榜 / 问题发现 / 直答 | 各 100 次 |
| PDF 解析 + PPT 生成 | 10 次（很少，省着用） |

也就是说 **光这一把钥匙就有 5000 次/天的全网搜索**，「各种引擎」这条基本满足了。
我还实测发起了一次真实的全网搜索，**返回了完整的正文内容**，不是只给个链接。

**要装的东西很少**：
1. **`@klarkxy/dsh-zhihu`** —— 把知乎的全网搜索接进 DSH 自带的搜索工具，
   另带配额面板和知识库面板。**注意要把每日上限从默认 100 调高**（你实际有 5000）。
2. **`dsh-free-search`** —— 免 key 的多引擎兜底（Bing 中文等），知乎没额度时的备胎。
   **想换别的引擎也行**：几乎每个搜索服务都有现成插件，而且都接进 DSH 自带的搜索工具 ——
   **博查（官方发布）**、秘塔、智谱、Tavily（官方 keyless）、Exa、Firecrawl、SearXNG、
   Brave、Serper、豆包，还有 Baidu+Doubao+Tavily+Exa+Serper 的五合一包。
   完整清单和 npm 名见 **4.1.1**。**一次只装一个**。
   （⚠️ **Bing Search API 已于 2025-08-11 退役**，别再按老教程去找它。）
3. **`deep-read-summarize` + `dsh-deepread`** —— 论文/长文/视频读进去变成带证据的笔记；
   **转录全在本机，不外发**。
4. **公众号**：**`dsh-wechat-mp-search`**（npm 上就有，**搜索 + 读取一体**，还自带 MCP server）——
   不用浏览器、不用 key、不用 GitHub。另有 `@wjx-ai/dsh-wx-reader`、
   `dsh-wechat-article-fetcher`、`dsh-ab-wechat-scrape` 同级别备选。
5. **自学技能已经装好并生效**，知识库目录也规划好了。

**「其他 API」我也逐个实测过了（结论：大多不用装、不用花钱）**：

- ✅ **能用且免 key**：**OpenAlex**（学术入门第一站）、**Crossref**、**PubMed**、**DOAJ**、
  Unpaywall、**GitHub API**、npm registry —— 本机直连，**agent 用自带的 `web_fetch` 直接调就行**。
- ❌ **本机被墙**：Wikipedia API（中英文都是）、Wikidata 官方 SPARQL、Jina Reader。
- ✅ **但维基数据有绕法**：**`dumps.wikimedia.org` 可达**（能下离线 dump），
  **Qlever 的 Wikidata SPARQL 可用**（`qlever.cs.uni-freiburg.de/api/wikidata?query=`）——
  所以「维基被墙」不等于拿不到维基数据。
- ⚠️ **可达但有限流**：arXiv（1 请求/3 秒，且**限流时也返回 200**）、
  Semantic Scholar（免 key 是全体匿名共享，早饱和）、
  OpenAlex（免 key 与同 IP 所有人**共享 $0.10/天**预算，翻页要 key）。
- 💡 **一句话**：搜索靠知乎，学术靠 OpenAlex/Crossref/PubMed，代码靠 GitHub/npm，
  中文实践靠公众号 —— **都不用新花钱、也不用浏览器**。

**三个更正，我之前说错了**：

- **GitHub 其实是通的**（我上次被 PowerShell 的网络报错误导了）。
  用 Node 实测 github.com、api.github.com、codeload 全部 200 ——
  所以公众号读取、反爬抓取这些插件**现在就能装**，不用等代理。
  **根因**：`curl.exe` 和 `Invoke-WebRequest` 在本机做不了 HTTPS
  （`schannel: SEC_E_NO_CREDENTIALS`），**判断网络可达性必须用 Node/Python**。
- **公众号不用 GitHub 也能装**：我上次说「只有 GitHub 有」不准确 ——
  npm 上就有 `dsh-wechat-mp-search` 等四个包，其中那个还自带 MCP server，
  搜索和读取一次搞定。
- 有插件让你改 `agent.cordis.yml` —— **那个格式 DSH 已经废弃了，照做白忙**。
  正确做法写在文档 2.4 节。

**Chrome 已按你说的全部去掉** —— 整个方案不含任何浏览器自动化，全走 API 和纯 HTTP。
**小红书也不做。**

**⚠ 请你做一件事**：知乎官方明确要求不要把 Access Secret 发到聊天里，
这把已经在聊天记录中了 —— 建议去 <https://developer.zhihu.com/personal>
重新生成一枚再用。我把它存在工作区 `_secrets\zhihu.env`（明文，别外发）。

---

## 附录 A：安装记录与引擎价格更正（2026-10-16 实测）

### A.1 已在本机装好（web profile）

用户授权后，用 `tools\install-research-autonomy.ps1` 装完并验证：

| 包 | 版本 | 状态 |
|---|---|---|
| `@klarkxy/dsh-zhihu` | 0.2.4 | 已装 + **已修好挂载**（见 A.2） |
| `dsh-free-search` | 0.8.10 | 已装，已进 bundle 栈 |
| `deep-read-summarize` | 0.3.13 | 已装 |
| `dsh-deepread` | 1.0.1 | 已装 |
| `dsh-wechat-mp-search` | 0.1.1 | 已装 |
| `dsh-pubmed` | 0.4.4 | 已装 |

- 知乎凭据已写入 `~\.dsh\.env`（`ZHIHU_ACCESS_TOKEN` + `ZHIHU_ACCESS_SECRET` 两个名字都写了）。
- **`dsh --profile web --dump-config` 返回 exit 0** → 配置树能正常合成，没有「loader entries failed to apply」。
- `searchProvider: deepseek-official` / `fetchProvider: http` 都在 → **不会**触发 A.3(a) 的冲突。
- 备份：`_tmp\plugin-backups\20261016-123707\`（本次安装前）。
- 回退：`tools\install-research-autonomy.ps1 -Rollback`。

### A.2 ⚠️ 新发现的坑：`dsh plugin add` 没有把插件写进 bundle 栈

`@klarkxy/dsh-zhihu` 装成了依赖，**但 `dsh.profile.bundles` 里没有它** →
它的 `cordis.patch.yml` 从未被应用 → **插件等于没装**。
重新执行一次 `dsh plugin add` 也不会补上。

**修法**：确认包的 `dsh.bundle.patch` 存在后，手动把它追加进
`~\.dsh\profiles\<profile>\package.json` 的 `dsh.profile.bundles` 数组，
然后 `dsh --profile <profile> --dump-config` 确认它出现在合成树里。

> **教训（已写进施工流程）**：`dsh plugin add` 返回 OK **不等于**插件生效。
> **必须用 `--dump-config` 验证这个包真的出现在合成树里。**
> 本次 6 个包里就有 1 个中招 —— 比例不低，别跳过这步。

### A.3 两个已验证的陷阱（**别踩**）

**(a) profile patch 的 `config` 是「整段替换」而非合并。**
如果只设 `searchProvider` 不设 `fetchProvider`，DSH 会抛
`multiple usable web providers are registered (http, metaso-reader)`，
**导致 `web_fetch` 完全不可用**（4 台机器复现）。
→ 本机现在两者都在，安全。改动时**两个字段一起写**。
（`dsh-free-search` 的作者知道这个坑，所以刻意不在 patch 里写死
`web.searchProvider`，改成运行时接管 —— 这是个好设计，注释里写明了。）

**(b) 某些插件的自定义 session 事件类型会让**历史会话打不开。
实测：`dsh-web-search-metaso` 的自定义事件类型使 **10 个历史会话无法打开**
（DSH 的 v0 迁移拒绝未知事件类型）。
→ **不要装 `dsh-web-search-metaso`**（我们也没装）。

### A.4 引擎价格更正（**比 4.1.1 的估算更准**）

| 引擎 | 准确数字 | 来源可信度 |
|---|---|---|
| **智谱 Zhipu** `search_std` | **¥0.01/次**（¥10/1000）；`search_pro` ¥0.03、`search_pro_sogou` / `search_pro_quark` ¥0.05；**搜索不消耗 token**；**实名认证不强制** | **官方文档页，高** |
| 阿里云 IQS `CNLiteBasic` | **¥8/1000**，10 QPS；需实名 | 官方帮助页，高 |
| 阿里云百炼联网搜索 MCP | **前 2000 次免费**，之后 ¥29/1000 | 官方，高 |
| 博查 Bocha | ¥0.036/次（第三方转述） | **官方价目页在飞书登录墙后面，未验证** |
| 秘塔 Metaso | ¥0.03/次（第三方转述） | **官方价目页不可读，未验证** |
| Firecrawl | 免费档 1000 credits/月 ≈ 500 次搜索；Hobby $16/月（年付）≈ $0.0064/次 | 官方，高。**keyless 从国内电信出口实测 200** |
| Tavily | 免费 1000 credits/月，`X-Tavily-Access-Mode: keyless` 是真的官方 keyless 档 | 官方，高 |
| Exa | 免费 $10 credits/月（≈2500 次 instant） | 官方，高 |
| Serper | **2500 次免费、免信用卡**；无官方 MCP | 官方页，高 |
| Brave | **2026-02 起取消了固定免费额度**，改为 $5/1000 + 每月 $5 credit（≈1000 次），**需绑卡** | 厂商文档站，中 |
| Perplexity Search API | **$1.00/1000（fast）** —— 全场最便宜的单次美元价；**无免费额度**；需代理 | 官方价目文件，高 |
| **Google Custom Search JSON API** | **已对新客户关闭**，存量客户 **2027-01-01 前**必须迁移 | Google 官方页，高 |
| **Bing Search API** | **2025-08-11 已退役** | 微软生命周期公告，高 |
| Jina | **本机 DNS 污染 + TCP 阻断**，直接放弃 | 实测 |

**结论不变但更精确**：你现在**一个引擎都不用急着买** —— 知乎 5000 次/天够用。
真到要买，**智谱 `search_std` ¥0.01/次是唯一「官方页可查 + 大陆原生 + 不强制实名」的最便宜选项**；
要**免费且能一次查多个中文引擎**，只有**自建 SearXNG**（能同时查
百度/360/夸克/搜狗），但有个坑：
`settings.yml` 里 `search.formats` 默认只有 `html`，**不加 `json` 的话 `format=json` 直接 403**。

### A.5 重启后验证（2026-10-16 14:21 重启）

App 已重启成功（进程启动于 14:21:15，`127.0.0.1:19387` 在监听）。
`dsh --profile web --dump-config` → **exit 0**，配置树合成正常。

**⚠️ 但发现一件必须知道的事：重启不会让「已经在跑的会话」拿到新工具。**
实测统计当前会话日志里实际提供给模型的工具 = **47 个，全是基础工具**，
`pubmed_*` / `weixin_*` / `deepread` / `zhihu_*` **一个都没有**。

原因（DSH 官方文档原文）：**「Existing sessions and their children keep the plugin
revision they started with; validate changed behavior in a new session.」**
→ **必须新开一个会话**，旧会话仍按启动时的那套插件走。

**验证方法（可复用）**：从
`~\.dsh\sessions\--C-Users-...--\<session>\session.v4.jsonl.zstd` 里抽出
`"name":"<工具名>","description"` 结构，就能列出该会话真正拿到的工具。
注意：会话文件是**多帧 zstd 拼接**，要按 magic `28 B5 2F FD` 切分逐帧解压
（单次 `zstdDecompressSync` 只能解第一帧）。
⚠️ 用「工具名出现次数」判断会**误判** —— 插件名往往早就在对话正文里出现过。

### A.6 又发现并修好一个缺口：`@klarkxy/dsh-zhihu` 的工具没给到模型

- 它的 `lib/index.js` 只管 UI 面板 + **搜索提供方**（所以知乎会出现在「网页搜索」提供方列表里）。
- 真正注册 `zhihu_*` 模型工具的是 **`./tools` 子路径**（`lib/tools.js` 里 `host.tools.register`）。
- 而「给模型加 scoped 工具」只能通过 **agent 预设**。

**已做的修复**：从 asar 取出内置
`@deepseek-ai/dsh-web-app/presets/standard.patch.yml`（148 行原文），
按「整段替换」的规则生成覆盖项写进
`~\.dsh\profiles\web\cordis.patch.yml`，**只在 plugins 列表末尾追加**：

```yaml
      - id: zhihu-tools
        name: '@klarkxy/dsh-zhihu/tools'
```

- 内置的 100 多行 plugins（含 `!!js process.platform === ...` 表达式）**逐字保留**。
- 备份：`~\.dsh\profiles\web\cordis.patch.yml.bak-zhihu-tools-20261016062624`
- 验证：`--dump-config` → **exit 0**，且 `zhihu-tools` 出现在合成树里。
- 回退：把上面那个 `.bak-*` 覆盖回 `cordis.patch.yml` 即可。

### A.7 端到端能力自测（本机实跑，全部通过）

| 能力 | 实测结果 |
|---|---|
| **微信公众号正文** | HTTP 200，页面 3430KB，`id="js_content"` 在，24 张懒加载图；标题提取成功。**免 key、免浏览器、免登录**。⚠️ 公众号名（`var nickname`）取到的是**空**，要换选择器 |
| **知乎全网搜索** | `Code=0`，返回 3 条真实结果，每条带 883–1079 字正文片段 + 可点击链接 |
| **学术（OpenAlex）** | `Code=200`，命中 **187,288** 篇，返回 3 条带年份的真实论文 |

> **结论**：机器侧能力全部打通。剩下的只是**新开一个会话来加载这些工具**。


