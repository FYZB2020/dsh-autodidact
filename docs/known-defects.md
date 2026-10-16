---
topic: 研究插件栈的 4 个真实缺陷（非配置问题，值得提 issue）
date: 2026-10-16
confidence: high
task: 执行 docs\verification-checklist.md 时暴露
sources:
  - docs/verification-checklist.md  (逐条实测清单)
  - 完整 traceback（当时留在临时目录，未随仓库发布）
  - 本机 venv 复核：av-18.1.0 已 pin
  - 会话内真工具调用（D-2 / D-3）
  - @klarkxy/dsh-zhihu lib/tools.js:740（D-4）
---

## Gap

清单只验「装上了没」，没验「干净机器上是否必然失败」。跑完之后暴露出 4 个
**插件自身**的缺陷 —— 这些不是本机配置问题，换台机器一样会踩。

## What I found

### D-1（最严重）`deep-read-summarize` 的 `av` 依赖没 pin → 干净机器 100% 转录失败

- `faster-whisper 1.2.1` 只声明 `av>=11`，但内部调用
  `av.open(..., metadata_errors=)`，而 **av 19.x 删掉了这个参数**。
- 结果：fresh venv 装到 av 19.x → `TypeError: open() got an unexpected keyword
  argument 'metadata_errors'`。
- 实测版本矩阵：**19.0.1 FAIL / 19.0.0 FAIL / 18.1.0 OK**。
- 本机已手工绕过：venv 里是 `av-18.1.0`（已复核确认）。
- **上游修法**：插件 pin `av<19`，或升级 faster-whisper。

> ⚠️ **对使用者的实际含义**：视频转录在本机能跑，是因为被手工修过。
> **换机器/重建 venv 会再次失败**，要先 `uv pip install "av==18.1.0"`。

### D-2 `dsh-deepread` 的 `map` 模式对长文稳定失败

- 公众号长文实测：`模型输出 3 次均未得到合法 JSON：底层错误（模型返回了空结果）×2；输出被截断`。
- 3 次重试全废，**不是输入问题**。
- 影响：`map`（官方主推的「观点—证据—数据—关系」地图）在长文上不可用。
- 可用替代：`quick` / `deep` 模式实测正常。

### D-3 `dsh-deepread` 的 `export:"md"` 不落盘（**静默假成功**）

- 工具描述写「文件写入工作区 `deepread-output/` 目录」，但两次 `export=md` 调用后
  **该目录不存在**，全库也没有任何新增 `.md/.mm/.html`。
- 这是**和 T-19 同一类的坑**：调用返回成功、磁盘上没有东西。
- 用法：**别信工具说的"已导出"，自己 `Test-Path` 一下**。

### D-4 `@klarkxy/dsh-zhihu` 在 headless 组合下必然 pending

- `lib/tools.js:740` 的 `inject = ["zhihu","tools"]`，宿主半边需要
  `connection` + `webServer` 两个服务。
- 非 Web 层组合（headless/CLI）里整条链 pending，`zhihu_*` 工具一个都不注册，
  报 `pending (waiting for services: connection, webServer)`。
- **含义**：想在 CLI/headless 里用知乎工具做不到，只能在 Web 层跑。

## How to use it

- 装 `deep-read-summarize` 后、跑视频之前：先确认 venv 里 `av` 是 18.x；
  否则 `uv pip install "av==18.1.0"`。
- 用 `deepread` 时：长文别用 `map`；要落盘别信 `export`，自己检查文件。
- 要在 headless 里用知乎能力：只能直连官方 API，别指望插件工具。

## What it changes

- 「视频那条路能不能用」的答案从「能」修正为「**本机能（已打补丁），换机器要重新打**」。
- 「`deepread` 能导出报告」从「能」修正为「**声明与实现不符，必须自己核**」。

## Still unknown

- D-2 是模型侧问题还是提示词/JSON 解析问题（未读 `dsh-deepread` 源码定位）。
- D-3 是权限、路径还是根本没实现（未读源码）。
- 这 4 个缺陷是否已有人提过 issue（未查上游仓库 issue 列表）。
