# 发布指南：建仓库 + 把这份 kit 推上去

---

## 一、建仓库时怎么填

| 字段 | 建议值 | 说明 |
|---|---|---|
| **Repository name** | `dsh-autodidact` | 可改，但改了要同步告诉推送方 |
| **Description** | `Task-driven self-education for DeepSeek Harness: search + read + keep what you learn. Zero cookies, no browser automation.` | 中文可用：`给 DeepSeek Harness 装上"不会就去学"的能力：多引擎搜索 + 中文平台 + 学术文献，零 Cookie、无浏览器自动化` |
| **Visibility** | `Public` | 想先私有也行，推送流程一样 |
| **Add a README file** | ❌ **不要勾** | 仓库里已经有 README.md，勾了会产生冲突的初始提交 |
| **Add .gitignore** | ❌ **不要勾** | 已自带（且已实测能挡住 `.env` / `_secrets/`） |
| **Choose a license** | ❌ **不要勾** | 已自带 LICENSE（默认 MIT，请把 `<你的名字>` 改成你的） |

**Topics（标签，建完在仓库页 ⚙️ 里加）建议**：

```
deepseek-harness  dsh  dsh-plugin  web-search  research-agent
chinese  wechat  bilibili  pubmed  ai-agent  self-learning
```

> ⚠️ **建仓库时先不要勾任何"初始化"选项**，仓库保持**空的**（0 commit），推送脚本会自动创建初始提交。

---

## 二、推送：两条路，选一条

### 路 A：让 AI 帮你推（推荐，省事）

**为什么不用 `git push`：** 本机实测 `github.com` 这个域名**不可达 / 不稳定**
（`git ls-remote` 92 秒后失败：`schannel: server closed abruptly`；
对照实验里 `git` 访问 gitee 只需 1 秒 —— 说明 **git 本身没问题，是 GitHub 这个域名的问题**）。
但 **`api.github.com` 稳定可达**（实测 288–412ms）。

所以走 **GitHub REST API**（`install/push-to-github.mjs`：blob → tree → commit → ref），
不走 `git push`。

#### 你需要做的（3 步）

**1) 建一个最小权限的 token**

GitHub → Settings → Developer settings → **Personal access tokens → Fine-grained tokens** → Generate new token

- **Repository access**：`Only select repositories` → 只选你刚建的那个
- **Permissions** → `Repository permissions` → **`Contents: Read and write`**（其余全部留 `No access`）
- 有效期按需（用完就撤）

> ❌ 不要用 classic token 的 `repo` 全权作用域 —— 权限过大。

**2) 把 token 放进环境变量（不要贴进聊天）**

```powershell
# Windows：写进用户环境变量，重开终端生效
setx GITHUB_TOKEN "github_pat_xxxxxxxx"
```

或者放进 DSH 的凭据文件（AI 能从环境读到，不会打印）：

```
# ~/.dsh/.env
GITHUB_TOKEN=github_pat_xxxxxxxx
```

> **推荐用 `~/.dsh/.env` 这种方式**：推送脚本会自己去读它，**不需要重启 DSH**，
> 而且 token 既不会出现在聊天记录里，也不会留在命令历史里。
> （`setx` 写的是用户环境变量，**已经跑起来的 DSH 进程读不到**，反而更麻烦。）

**3) 告诉 AI 这两样**（token 不用给）

- 你的 GitHub 用户名（`owner`）
- 仓库名（`repo`，若与 `dsh-autodidact` 不同）

AI 会先跑 `--dry-run` 给你看清单，再真推，最后把仓库链接给你。

#### 用完请撤销

推送完成后，去 GitHub 把那个 fine-grained token **Revoke**。

---

### 路 B：你自己推

```powershell
cd <kit 目录>

# 先干跑，看要推什么
node install/push-to-github.mjs --owner <你的用户名> --repo <仓库名> --dry-run

# 设好 token 后真推
$env:GITHUB_TOKEN="github_pat_xxx"
node install/push-to-github.mjs --owner <你的用户名> --repo <仓库名> `
     --message "chore: initial import" `
     --description "Task-driven self-education for DeepSeek Harness" `
     --topics "deepseek-harness,dsh,dsh-plugin,web-search,research-agent,chinese"
```

> 如果你的网络能正常访问 `github.com`（正常网络环境下），也可以用标准 git：
> ```bash
> git add -A && git commit -m "chore: initial import"
> git remote add origin https://github.com/<owner>/<repo>.git
> git push -u origin main
> ```
> 本仓库已经 `git init` 过，且 `.gitignore` 已验证能挡住密钥。

---

### 路 C：零凭据（不推荐但可行）

让 AI 把 `dsh-autodidact` 打成 zip，你在 GitHub 网页上 **Add file → Upload files** 拖进去。
缺点：网页上传不能建目录结构（会平铺），且超过 100 个文件会很痛苦。**本 kit 只有 19 个文件**，勉强可行。

---

## 三、推送前必做（已内置，可自动跑）

```bash
# 一键自检：语法 / SKILL frontmatter / 死链 / .gitignore / 密钥 / 绝对路径
node install/self-test.mjs

# 单独跑密钥闸门（退出码非 0 就别推）
node install/scan-secrets.mjs
```

**建议把闸门挂成 pre-commit 钩子**：

```bash
# .git/hooks/pre-commit
#!/bin/sh
node install/scan-secrets.mjs || exit 1
```

---

## 四、推送后检查清单

- [ ] 仓库首页能看到 README 正常渲染（标题、表格、代码块）
- [ ] **仓库里没有 `.env`、没有 `_secrets/`**（去 Files 里搜一眼）
- [ ] `LICENSE` 里的 `<你的名字>` 已换成你的
- [ ] `install/self-test.mjs` 在仓库里能跑通（clone 下来验一次最稳）
- [ ] Topics 已加上
- [ ] 临时 token 已撤销
- [ ] 如果想加 CI，见下

---

## 五、可选：加一条最简 CI

`.github/workflows/check.yml`：

```yaml
name: check
on: [push, pull_request]
jobs:
  selftest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: 发布前闸门
        run: node install/scan-secrets.mjs
      - name: 自检
        run: node install/self-test.mjs
```

作用：**任何人提交含密钥或绝对路径的改动都会被 CI 拦下**。

---

## 六、发布时建议在 README 里额外声明的

1. **实测环境**：`2026-10-16 · Windows 11 · DSH 0.2.0-rc.2 · 无代理 · 中国大陆出口`。
   网络可达性会变，已逐项标注 实测/未测/被墙。
2. **本仓库只含配置与脚本**，不含任何第三方插件本体；插件各自遵循其许可。
3. **合规**：抓取能力仅建议个人研究学习用途，不要批量抓取或二次分发受版权保护的内容。
4. **已知缺陷**：见 `docs/known-defects.md`（6 条），发布时保留这份诚实清单比隐藏它更有价值。
