# DSH profile patch 与 MCP 接入：一次完整的踩坑记录

> 2026-10-17 实测于 DSH `0.2.0-rc.2`（Windows · profile `desktop`）。
> 目标：把一个远端 MCP 服务器（Context7）接进 DSH。
> **记录这两个坑是因为它们都是「静默失败」—— 不报错、不生效**，
> 而**从症状反推会得出方向错误的结论**（下面第 5 节展开）。

---

## 1. ★ patch 里新增条目必须用 `- insert:`，写在顶层会被静默忽略

配置位置：`<DSH_HOME>/profiles/<profile>/cordis.patch.yml`

那个文件**自己的开头注释**就写着语义：

> a top-level YAML array of loader patch entries (**id-targeted config overrides**,
> disables, and **insert lists**; `!!js` expressions allowed)

- **顶层行 = 覆盖一个「已存在」的 id**（不存在就是 `entry not found`）
- **新增条目 → 必须包在 `- insert:` 里**

正确形态（app 自带 `templates/mcp/` 的模板就是这个形状）：

```yaml
- insert:
    - id: mcp-context7
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: context7
        transport: streamable-http
        url: https://mcp.context7.com/mcp
        failOnStartupError: true
        headers:
          Authorization: !!js '`Bearer ${process.env.CONTEXT7_API_KEY}`'
```

**为什么难查：**

| 症状 | 会把你带向哪里 |
|---|---|
| 不报错、不生效 | 先怀疑网络 / 端点 / 鉴权（全都是无辜的） |
| 会话日志里搜插件名，**搜不到任何加载痕迹** | 得出「它根本没被读到」这种**方向错误**的结论 |
| 搜到的命中的全是**自己调试时的命令输出** | 误以为「有痕迹」 |

> 反过来说：**同一个文件里，覆盖已有 id 的顶层条目是完全正常的** ——
> 例如改 `ui-chat` 的 `transcriptView`、改 `speech-to-text` 的 `defaultProvider`，
> 它们本来就写在顶层，而且必须写在顶层。

## 2. `<DSH_HOME>/.env` **不会**进宿主进程环境

实测：重启 DSH 后，在**宿主的子进程**里读这些变量**都是空**。
→ patch 里的 `!!js process.env.X` 会拿到 `undefined`，拼出 `Bearer undefined`。

**正确做法：写成真正的环境变量。**

- Windows：`setx NAME value`（用户级；**只对新进程生效 → 改完要重启 DSH**）
- macOS / Linux：shell 配置，或启动器的环境设置

## 3. 官方 MCP 客户端怎么接（可复用）

| 项 | 值 |
|---|---|
| 包名 | `@deepseek-ai/dsh-mcp-client` |
| 从哪来 | **打包在 app 里**（用 app 自带那份即可）；**npm 上那个是旧版本，不要装** |
| 工具名 | `mcp__<serverName>__<tool>` |
| 必填字段 | `serverName`（`[A-Za-z0-9_-]{1,32}`，作用域内唯一）、`transport`，以及 `url`（http）或 `command`/`args`（stdio） |
| 常用可选 | `headers`、`failOnStartupError`(默认 false)、`toolCallTimeoutMs`(默认 60s)、`reconnect.*`、`maxInstructionBytes`(默认 32KB) |
| 生效时机 | **启动时装载 → 改完必须重启 DSH** |

> **建议显式写 `failOnStartupError: true`**：否则连不上时只是「悄悄少几个工具」，
> 没有任何明显提示；写上之后至少它是**出声**的。

## 4. Context7 这个服务器本身（顺便记下）

- 端点：`https://mcp.context7.com/mcp`（Streamable HTTP）
- **keyless 可用**（匿名）；免费 key（`ctx7sk-…`）只是**提高频率上限**
- 工具与参数（**实测出来的，别猜**）：
  - `resolve-library-id` → 要 **`query` + `libraryName` 两个都填**
  - `query-docs` → 要 **`libraryId` + `query`**（`language` 可选）
- 一次提问最多调 3 次；一次只查一个概念，别把多个主题塞进一个 query
- 输出形态：**带源码链接**的文档 + 可运行代码。例：取 Cordis 的文档会给出
  `packages/core/src/registry.ts` / `fiber.ts` / `reflect.ts` 的片段

## 5. 报告这类结论时的三条纪律

1. **从「缺少痕迹」推不出「没有发生」。** 本次就因为"日志里搜不到插件名"而先走错了方向。
2. **能实测的不要推断。** 宿主环境变量可以直接在它的子进程里读；
   MCP 有没有挂上可以直接看工具列表。
3. **读一手机制说明。** 这次的答案就在目标文件自己的注释里、以及 app 自带的模板里 ——
   比任何二手转述都准。

### 附：两个有用的排查手法

- **宿主环境**：DSH 起的 shell 是宿主的子进程 → 在其中读环境变量即可反映宿主的真实环境。
- **会话日志**：`session.v4.jsonl.zstd` 是**多帧** zstd 拼接的 ——
  流式解压只会出第一帧 ✗，需要按 zstd magic（`28 B5 2F FD`）**分帧逐帧解压** ✓。
