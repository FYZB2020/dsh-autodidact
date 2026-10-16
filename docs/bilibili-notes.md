---
topic: B站视频内容（字幕/转录）在无登录态下的可得性
date: 2026-10-16
confidence: high
status: 已修正 —— 初版结论错误，经独立复核推翻
task: 判断本机能否在不登录、不装浏览器的前提下拿到 B站视频的真实内容
sources:
  - https://api.bilibili.com/x/v2/dm/view  (本机独立复核，取回 100 条 cue)
  - https://api.bilibili.com/x/player/v2  (本机实调 30 次，全空 —— 这是错误结论的来源)
  - https://api.bilibili.com/x/web-interface/view  (本机实调)
  - https://raw.githubusercontent.com/avldya/bilibili-sub-cli/main/README.md
  - research/bili-probe/B站内容获取能力判定.md  (他方完整判定 + 两个独立校验员证据包)
  - research/verify-subtitle/REPORT.md、research/verify-asr/00_VERDICT.md
---

## Gap

方案里写着「B站字幕很可能需要 `SESSDATA`，**属推断，未验证**」。
如果成立，视频学习必须改设计；如果不成立，视频这条路可以直接用。

## What I found（**修正后的结论**）

> ⚠️ **本文件的初版结论是错的**（原判「无登录态下拿不到字幕」）。
> 已由独立复核推翻，下面是正确结论。**错误的原因见最后一节 —— 那才是最有价值的部分。**

**结论：无登录、不装浏览器，B站字幕能拿到，而且有两条独立路径。**

### 路径①（首选）：`dm/view` 匿名签发字幕 URL

```
GET https://api.bilibili.com/x/v2/dm/view?aid=<aid>&oid=<cid>&type=1
Header: 仅 User-Agent（无 Cookie、无 Referer）
→ code=0，data.subtitle.subtitles[] 每条带 subtitle_url + auth_key
→ subtitle_url 是 http:// ，改成 https:// 直接下载 → 200
```

本机独立复核（我自己新写的脚本，不用对方代码）：

| 视频 | `view.subtitle.list` | `player/v2` | **`dm/view`** | 实际取回 |
|---|---|---|---|---|
| `BV1GJ411x7h7` | 12 轨、**URL 全空** | 0 条 | **12 轨、URL 已签发** | **47 cue**，首句「永不放弃你——瑞克·艾斯里」 |
| `BV1nCWc6KEfS` | **0 轨** | 0 条 | **8 轨（ai-zh 等）** | **53 cue**，首句「搞清楚一种蛋白质的结构有多难」 |
| `BV1xx411c7mD` | 0 轨 | 0 条 | 0 轨 | 真没字幕 |

→ 3 条里 2 条成功，**共取回 100 条 cue**。

**关键机制**：B站把字幕 URL 从 `view` / `player` 这两个「文档化」接口里摘掉了，
但**播放器前端自己调用的 `x/v2/dm/view` 仍然匿名签发带 `auth_key` 的可用 URL**。
`need_login_subtitle` 的真实语义是「本站有需登录才在 `player` 里列出的轨」，
**不等于「字幕被封锁」**。

### 路径②（兜底）：匿名音频 + 本机离线 ASR

```
playurl（匿名可取 DASH 音频 30216/30232/30280，range GET 返回 206，不需要 Referer）
→ ffmpeg 转 16k 单声道
→ 本机 SenseVoice int8 ONNX 转写
```

- **模型本机已有，不需要下载、不需要外网推理**：
  `~\.dsh\speech-to-text\sensevoice\models\sensevoice-onnx\model.int8.onnx`（239MB）
- ffmpeg 本机已有（**不在 PATH**，见下）
- 实测 126s 中文视频 → 612 字连贯文稿，RTF 0.026

### 两个必须记住的实现坑（他方校验员发现，我已采纳）

1. **ASR 必须分段**：one-shot 喂 1–5 分钟，遇到音乐/非语音段会触发 CTC 重复环。
   实测同一段 212s 音频：30s 窗口 → 619 字真歌词，而 212s one-shot → 48 字
   「goodbye goodbye…」循环。**默认用 30 秒窗口。**
2. **LFR 前端**：须按 `sherpa-onnx/csrc/lfr.cc`——左补 3 帧、右端复制末帧、
   `out = 1+(T-1)//shift`。错了会**每行错位 30ms 并丢尾帧**。

## How to use it

**判据（写死，别再搞错）**：
- **判断「有没有字幕」只能看 `dm/view`**，看 `view` 或 `player/v2` 会得出错误结论。
- `dm/view` 返回 0 轨 ⇒ 真的没字幕 ⇒ 走 ASR 兜底。

现成脚本（他方产物，在 `research\bili-probe\`）：
```powershell
$py = '<DSH_HOME>\dsh-runtimes\...'
& $py '<workspace>\research\bili-probe\bili_subtitle.py' BV1GJ411x7h7 --lang zh
& '<LOCALAPPDATA>\Programs\Python\Python311\python.exe' `
  '<workspace>\research\bili-probe\bili_fetch_asr.py' BV1nCWc6KEfS --lang zh --itn
```

## What it changes

- **视频学习这条路可用**，而且不依赖 `deep-read-summarize` 的 faster-whisper 路径
  → **也就不需要为转录去下 461MB 的 HuggingFace 权重**（SenseVoice 本机已有）。
- `deep-read-summarize` 的「B站官方字幕优先」**可能仍是走 `player/v2` 而拿不到东西**
  → 若实际使用时字幕为空，**改用 `research\bili-probe\bili_subtitle.py`**，
  它是已验证可用的那条路。
- 边界：付费/番剧/课程/充电专属匿名拿不到（与「未登录能否在网页播放」一致）；
  `auth_key` 有时效，**用前现取现下，不要缓存 URL**。

## Still unknown

- `deep-read-summarize` 内部的 B站字幕实现走的是哪个端点（未读源码验证）。
- 大范围（数百条）下 `dm/view` 的成功率与风控阈值；19 条样本是 14/19。

## ⚠️ 我为什么会判错（**最重要的一节**）

**初版只枚举了 5 个面**：`view`、`player/v2`、`player/wbi/v2`、无签名 CDN 直猜、播放页 HTML。
全部失败后，我**把「文档化接口拿不到」当成了「拿不到」** —— 甚至用 30 条视频
把错误结论「坐实」成了 30/30 的高置信度数字。

**错误不在样本量，在枚举范围。** 30 条视频全用同一个错端点，只会把错误结论
变得更「可信」。高置信度 ≠ 正确，**用错方法时，样本越大错得越自信**。

正确做法（已写进 `research-autonomy` 的精神）：
**判定「某能力被封」之前，必须覆盖「前端实际调用面」，而不只是文档化接口。**
可操作的做法：查该平台**用户脚本 / 浏览器扩展 / 开源客户端**的源码，
看它们实际打哪个端点 —— 本次正是从第三方用户脚本 `beefreely` 的 `fetchSubtitle()`
里发现它用的是 `dm/view`。

## 追加（2026-10-16）：**评论区也能匿名读，而且比只有字幕强**

用户问「只用字幕是不是有点限制？读评论区会不会更好」——**实测证明评论能匿名拿，且价值很高。**

| 端点 | 是否需要签名/cookie | 结果 |
|---|---|---|
| **`x/v2/reply/main?type=1&oid=<aid>&mode=3&next=0&ps=20`** | **都不要** | ✅ `code=0`，163ms，**一次 20 条** ← **首选** |
| `x/v2/reply?type=1&oid=<aid>&sort=2&ps=20&pn=1` | 不要 | ✅ `code=0`，105ms，但只回 3 条（旧接口） |
| `x/v2/reply/reply?type=1&oid=<aid>&root=<rpid>&ps=10&pn=1` | 不要 | ✅ `code=0`，可取楼中楼（样例视频有 2205 条） |
| `x/v2/reply/wbi/main?...` | 需要 WBI | ❌ `code=-403 访问权限不足` |

`oid` 就是视频的 **`aid`**（`view` 接口取），`type=1`。

**为什么评论比字幕更有价值**（对「提高认知」而言）：

- **字幕只记录「视频里说了什么」——它是单一口径。**
- 评论区才有：**纠错与勘误**（「其实 X 是 Y」）、**时间戳重点**、
  补充资料链接、**反驳与争议分布**、以及高赞共识。
- 实测样例：最高赞 **766,990 赞**的评论是一句精辟总结 —— 这种信号字幕里没有。

**建议的组合用法**（而不是二选一）：

1. **字幕当主干**（视频讲了什么），**评论区 Top-N 按热度当增量**（哪里错、哪里重要、在争什么）；
2. 长视频：字幕分块摘要后再叠加评论，否则 80 分钟讲座单字幕就有 **1581 cue / 20,264 字**，直接喂模型很贵；
3. 付费/番剧/课程内容匿名**评论和字幕都拿不到**（与「未登录能否在网页播放」一致）。

## 死路（别再试）
- ~~用 `player/v2` / `view.subtitle.list` 判断有没有字幕~~ → 会得出相反的错误结论。
- ~~用 `ranking/v2` 取视频列表~~ → `code=-352` 风控；用 `popular`。
- ~~`view/conclusion/get`（AI 总结）~~ → `code=-403 访问权限不足`。
- ~~`dm/web/view`（protobuf）~~ → 只回 309 字节弹幕配置，无字幕；以 JSON 版 `dm/view` 为准。
