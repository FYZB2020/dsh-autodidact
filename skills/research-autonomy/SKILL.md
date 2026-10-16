---
name: research-autonomy
description: Task-driven self-education protocol. Use when a task is assigned but the knowledge or source material needed to do it well is missing, incomplete, or unverified. Requires searching engines and platforms for the material, reading primary sources, keeping what is useful, applying it, and iterating until the task can actually be completed.
whenToUse: A task is assigned and you lack the material, method, parameters, or domain knowledge to do it properly. Also when a step fails and the cause is unknown, when a tool or platform behaves unexpectedly, when the user says 自己去查 / 自己学 / 上网搜 / 找资料 / 调研 / 学一下, or when you would otherwise have to guess, improvise, or hand the problem back to the user.
metadata:
  role: behavioral-protocol
  scope: "applies to the agent's own behaviour; installed for the agent to use, not a document to hand over"
  pairs_with: "a search plugin (dsh-free-search) + official-API plugins (dsh-zhihu-search) + docs/联网搜索与自主学习-技术方案.md"
---

# research-autonomy — 不会就去学，学完再干

This skill exists because the failure mode is **not** "the agent can't search" —
`web_search` / `web_fetch` are already available. The failure mode is that when a task
needs material the agent does not have, it **guesses, improvises, produces something
shallow, or hands the problem back**. That is not acceptable. **Go learn it.**

> 核心原则：**任务开始前先问「要把它做好，我还缺什么知识/材料？」**
> 缺什么就去网上学什么。**没有材料就是没学会；没学会就不要硬做。**

## 0. Iron rules

1. **Never start producing on a task whose required knowledge you don't have.**
   First list what you are missing, then go get it. Producing first and patching later
   is how shallow output happens.
2. **Search engines and platforms, not just one fetch.** Use the search tool(s) available.
   If one engine returns nothing useful, change the query, then change the engine.
3. **Never cite a URL you did not fetch.** A search snippet is a lead, not evidence.
4. **Never invent** a tool name, flag, parameter, config key, API field, or citation.
   If you did not read it in a fetched source or a local file, you do not know it.
5. **Keep what you learn.** Useful material gets downloaded/saved into the workspace
   (section 5). Research you throw away is research you will repeat.
6. **Iterate; don't stall and don't loop forever.** Refine queries and re-search while
   progress is being made. Cap it (section 4), then report precisely what is missing.
7. **Write only inside the session workspace.** Material and notes go under
   `<workspace>\_knowledge\`. Never to the user profile, `%TEMP%`, or `~\.dsh`.
8. **Protect the user's accounts.** Prefer official APIs and read-only access.
   **Do not automate 小红书 (Xiaohongshu) — the user has ruled it out for ban risk.**
   Never enter credentials, never reuse a session cookie the user did not hand over.

## 1. Trigger

Trigger when the task needs knowledge/material you do not currently have:

- the task names a domain, tool, library, API, format, or platform you haven't verified;
- you would need to guess a parameter, config, method, threshold, or recipe;
- a step failed and the cause is not understood;
- the same step has now failed twice;
- the user asks for a comparison, a plan, a migration, an integration, or "how do I";
- the user says 自己去查 / 自己学 / 搜一下 / 找资料 / 调研 / 学一下;
- you catch yourself writing "应该可以", "一般来说", "I think", "probably", "通常是".

Do **not** trigger for: arithmetic, formatting, rephrasing text already in context,
or facts the user supplied.

## 2. The loop (per task)

### Step 0 — Name the gap before doing anything

Write one line: **"要做这件事，我还缺：___"**. Examples of legitimate gaps:
the official API's auth model; the correct CLI flag for this tool version;
the file format's required fields; how the platform's rate limit works;
what other people's working setup looks like; the failure cause of this error.

If the gap list is empty, skip to doing the task — but only if you can cite where
each piece of knowledge came from.

### Step 1 — Turn each gap into searchable queries

Write 2–5 concrete **keyword** queries per gap. Query craft that actually works:

- quote exact error text verbatim: `"EPERM: operation not permitted, open"`
- include the version: `dsh 0.2.0-rc.2 plugin config`
- include the environment: `Windows 11 powershell npm global PATH`
- search the **cause**, not the symptom: not "render failed" but
  `libreoffice headless pptx to pdf "--convert-to" fails`
- go bilingual: 中文 + English — upstream docs are usually English, experience
  reports are often Chinese
- use site hints when you know the home: `site:github.com <project>`
- name the artefact you want: `example config`, `docker-compose`, `最佳实践`, `踩坑`

### Step 2 — Search, and use more than one engine/platform

Use every search surface available (native `web_search`, the installed search plugin,
MCP search servers). **Prefer the agent-oriented search APIs (`exa`, `tavily`) when the
plugin offers them** — they return model-ready clean text instead of raw HTML, which
saves context tokens as well as round trips. Fall back to scraped engines (Bing) for
Chinese-language material. Then search where the material actually lives:

| Need | Where to search |
|---|---|
| API / library / tool用法 | **Context7（MCP，先查这个）**、official docs、the project repo、CHANGELOG |
| 报错原因 | the exact error string, the repo's issues, Stack Overflow |
| 真实使用经验 / 踩坑 | 知乎（用官方 API 工具）、技术博客、公众号 |
| 论文 / 规范 | arXiv, Semantic Scholar, 官方标准文档 |
| 视频教程 | 视频转录工具（字幕优先），不要"看"你打不开的视频 |
| 现成配置/模板 | GitHub 搜索、包文档、官方示例目录 |

**If the first pass is thin, change the query before changing anything else.**

### Step 3 — Read primary sources, and keep them

Rank: official docs / project repo / maintainer release notes / the issue thread
**>** Q&A and blogs **>** aggregators and AI-written SEO pages.
Fetch the top 2–3 and read them properly. **Save what is worth re-reading** (section 5):
the page text, the example config, the code snippet, the API field list.
One page read fully beats ten pages skimmed.

### Step 4 — Distil into something you can act with

Convert reading into a usable artefact: the exact command, the config snippet,
the ordered steps, the parameter table, the decision rule. If you cannot write it as
something you could hand to a colleague, you have not finished learning it.
Cross-check: if two sources disagree, say so, name both, prefer the newer/more
authoritative, and mark anything single-sourced as unverified.

### Step 5 — Apply it to the task, then verify against the source

Do the task using what you learned. Then check your output against the source:
right version? right flag? right field name? If the result looks wrong, you probably
misread — go back to Step 1 rather than patching by guesswork.

### Step 6 — Iterate, with a budget

Each round: what failed → what specifically do I still not know → new query.
Refine while you are learning something new. **Stop after 3 rounds** on the same gap
and escalate (section 4).

### Step 7 — Sediment, so the next session starts ahead

Write the note (section 5), including dead ends. Then answer the user.

## 3. Escalation ladder for material you cannot reach

Work up; stop as soon as you have the text. Report which rung you needed.

1. `web_fetch` the URL directly.
2. A text-extraction mirror / reader endpoint, if one is available.
3. The site-specific tool (Zhihu official-API tools, WeChat-article readers,
   video-subtitle/transcript tools).
4. A real logged-in browser, for pages that genuinely need the user's own session
   (WeChat 公众号 anti-bot pages, other login walls). **Not for 小红书 — excluded.**
5. If a login or paid key is genuinely required, **stop and ask the user**.
6. If it still fails, state plainly: "these sources are unreachable with the current
   setup", record the gap, and say exactly what would unblock it (a proxy, a key, the
   text pasted in). **Do not silently substitute a guess for the missing material.**

For **videos**: get the transcript/subtitles (platform subtitles first, local
transcription as fallback). Never summarise a video you could not access.

## 4. Budget and honesty

- Batch related lookups — 5 queries in one pass beats 5 round trips.
- Stop searching when two independent primary sources agree, or when another search
  cannot change the decision.
- After **3 rounds** on one gap, report: what is known, what is unknown, what you need.
  An honest "still missing X, here is why" is a good outcome. A confident guess is not.
- Never let "I could not find it" turn into "therefore it probably works like this".

## 5. Persist — the learning half

```
<workspace>\_knowledge\
  index.md                  # one line per note; keeps retrieval cheap
  raw\YYYY-MM-DD-<slug>.md  # fetched source text, kept verbatim (the "download it" part)
  notes\YYYY-MM-DD-<slug>.md
  lessons\<topic>.md        # durable, deduplicated conclusions
```

Note template:

```markdown
---
topic: <short topic>
date: <YYYY-MM-DD>
confidence: high | medium | low
task: <which task needed this>
sources:
  - <url actually fetched>
  - <url actually fetched>
---

## Gap
<what I did not know, with exact error text / version / platform>

## What I found
<the answer, specific: flag name, config key, field, version, threshold>

## How to use it
<the command / snippet / steps that now work>

## What it changes
<the decision this affected in the task>

## Still unknown
<open questions, and what would resolve them>
```

Rules:
- Long material goes into `raw\` verbatim; notes stay short.
- Before writing a `lessons\` entry, check whether one exists and **update it**.
  A lessons file that says the same thing twice is a bug.
- Record **dead ends and unreachable sources** so they are not re-attempted blindly.
- Append one line to `index.md` per new note:
  `- <date> <topic> — <one-line conclusion> (notes/<file>)`.
- Never store secrets, tokens, cookies, or personal data.

## 6. Reporting

End the answer with a short evidence block:

```
学到/用到的来源：
- <title> — <url>   (primary)
- <title> — <url>   (corroborates / contradicts)
置信度：high | medium | low — <why>
已保存：_knowledge\notes\YYYY-MM-DD-<slug>.md
仍缺：<what is still unknown, and what would unblock it>
```

If the protocol did not run, say why ("this is arithmetic on values you gave me").

## 7. Anti-patterns this skill exists to kill

- Producing a deliverable on a task you have not understood, then polishing it.
- Asking the user for information that is one search away.
- Searching the symptom once, getting nothing, and improvising.
- Pasting a search snippet as if it were the documentation.
- Reading ten summaries instead of two primary sources.
- Declaring success while a factual dependency is unverified.
- Doing good research and not writing it down, so the next session repeats it.
- Reaching for a login-walled platform when an official API exists
  (and never automating 小红书).
- Writing material outside the workspace (see the workspace `AGENTS.md`).
