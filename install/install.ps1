<#
  安装脚本：把研究/自学能力包装进指定的 DSH profile。
  =====================================================================
  设计原则（针对"别人拿去也能跑"）：
    - 不硬编码任何绝对路径：dsh 位置自动探测，也可用 -DshCmd / 环境变量覆盖
    - 不硬编码密钥：从环境变量读，或交互输入；绝不写进脚本、绝不写进仓库
    - 不走 by 引用仓库外的文件：所有路径相对本仓库根
    - 装一个验一个，失败即停；动手前先备份

  用法：
    .\install.ps1 -DryRun                     # 只看清单
    .\install.ps1 -Profile desktop            # 装核心包
    .\install.ps1 -Profile desktop -IncludeOptional
    .\install.ps1 -Profile desktop -Rollback  # 回退到最近备份
#>

[CmdletBinding()]
param(
    [string] $Profile = '',
    [switch] $IncludeOptional,
    [switch] $DryRun,
    [switch] $Rollback,
    [string] $DshCmd = '',
    [string] $KitRoot = ''
)

$ErrorActionPreference = 'Stop'

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }
function Step($msg) { Write-Host ''; Write-Host ('=== ' + $msg + ' ===') -ForegroundColor Cyan }

# ---------------------------------------------------------------- 定位仓库根
if (-not $KitRoot) {
    $self = $PSCommandPath; if (-not $self) { $self = $MyInvocation.MyCommand.Path }
    if (-not $self) { Say '无法确定脚本位置，请用 -KitRoot 指定仓库根目录' 'Red'; exit 1 }
    $KitRoot = Split-Path -Parent (Split-Path -Parent $self)
}
$KitRoot = (Resolve-Path $KitRoot).Path

# ---------------------------------------------------------------- 定位 dsh
function Find-Dsh {
    param([string] $Override)
    if ($Override) {
        if (Test-Path $Override) { return (Resolve-Path $Override).Path }
        throw "指定的 -DshCmd 不存在：$Override"
    }
    if ($env:DSH_CMD -and (Test-Path $env:DSH_CMD)) { return (Resolve-Path $env:DSH_CMD).Path }

    # 1) PATH
    $onPath = Get-Command dsh -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }

    # 2) 从"正在运行的 DSH 进程"反推安装根。
    #    进程命令行里同时含 "...\resources\runtime\..." 与 "...\resources\app.asar\..."，
    #    取这两者之前的那个盘符路径就是安装根。
    #    ⚠️ 不要递归扫整盘（C:\、D:\）—— 实测有过一次 214 秒的教训。
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name like '%DeepSeek%'" -ErrorAction SilentlyContinue
        $roots = New-Object System.Collections.ArrayList
        foreach ($pr in $procs) {
            $cl = $pr.CommandLine
            if (-not $cl) { continue }
            foreach ($m in [regex]::Matches($cl, '([A-Za-z]:\\[^"''\s]*?)\\resources\\(?:runtime|app\.asar)')) {
                [void]$roots.Add($m.Groups[1].Value)
            }
        }
        foreach ($root in ($roots | Select-Object -Unique)) {
            foreach ($rel in @('resources\runtime\cli\bin\dsh.cmd', 'runtime\cli\bin\dsh.cmd')) {
                $cand = Join-Path $root $rel
                if (Test-Path $cand) { return (Resolve-Path $cand).Path }
            }
        }
    } catch { }

    # 3) 少量常见布局（浅层、定点，不递归整盘）
    $cands = @()
    if ($env:DSH_HOME) { $cands += (Join-Path (Split-Path $env:DSH_HOME -Parent) 'resources\runtime\cli\bin\dsh.cmd') }
    foreach ($base in @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (-not $base) { continue }
        $cands += (Join-Path $base 'Programs\@deepseek-ai\dsh-desktop\resources\runtime\cli\bin\dsh.cmd')
        $cands += (Join-Path $base 'DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd')
        $cands += (Join-Path $base '@deepseek-ai\dsh-desktop\resources\runtime\cli\bin\dsh.cmd')
    }
    foreach ($c in $cands) { if ($c -and (Test-Path $c)) { return (Resolve-Path $c).Path } }

    throw '找不到 dsh。请用 -DshCmd <路径> 指定（例如 <DSH_INSTALL>\resources\runtime\cli\bin\dsh.cmd），或把 dsh 加进 PATH。'
}

# ---------------------------------------------------------------- profile 探测
function Find-Profiles { Get-ChildItem (Join-Path $env:USERPROFILE '.dsh\profiles') -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name }

function Detect-ActiveProfile {
    # 尝试从监听端口反查正在跑的 profile（桌面版常驻 19387）
    foreach ($port in @(19387, 3080)) {
        try {
            $pid2 = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1).OwningProcess
            if ($pid2) {
                $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$pid2" -ErrorAction SilentlyContinue).CommandLine
                if ($cl -and $cl -match 'profiles[\\/]([^\\/\s"]+)') { return $Matches[1] }
            }
        } catch { }
    }
    return ''
}

# ---------------------------------------------------------------- 回退模式
if ($Rollback) {
    Step '回退到最近一次备份'
    if (-not $Profile) { $Profile = Detect-ActiveProfile }
    if (-not $Profile) { Say '请用 -Profile 指定要回退的 profile' 'Red'; exit 1 }
    $bk = Join-Path $KitRoot '_backups'
    $latest = if (Test-Path $bk) { Get-ChildItem $bk -Directory | Sort-Object Name -Descending | Select-Object -First 1 } else { $null }
    if (-not $latest) { Say ('找不到备份目录：' + $bk) 'Red'; exit 1 }
    $profDir = Join-Path $env:USERPROFILE ('.dsh\profiles\' + $Profile)
    Say ('从备份恢复：' + $latest.FullName) 'Yellow'
    foreach ($f in @('package.json', 'cordis.patch.yml')) {
        $src = Join-Path $latest.FullName $f
        if (Test-Path $src) { Copy-Item $src (Join-Path $profDir $f) -Force; Say ('  已恢复 ' + $f) 'Green' }
    }
    Say '已回退。请重启 DSH。' 'Yellow'
    exit 0
}

# ---------------------------------------------------------------- 预检
Step '0. 预检'
$dsh = Find-Dsh -Override $DshCmd
Say ('dsh CLI   : ' + $dsh)
Say ('版本      : ' + (& $dsh --version 2>&1 | Select-Object -First 1))
Say ('仓库根    : ' + $KitRoot)

if (-not $Profile) {
    $auto = Detect-ActiveProfile
    $all = Find-Profiles
    Say ('可用 profile：' + ($all -join ', '))
    if ($auto) { Say ('探测到正在使用的 profile：' + $auto) 'Green' }
    else { Say '探测不到正在使用的 profile —— 请用 -Profile 指定' 'Yellow' }
    Say '⚠️ 装错 profile = 插件完全不生效。请确认后重跑。' 'Yellow'
    exit 1
}
$profDir = Join-Path $env:USERPROFILE ('.dsh\profiles\' + $Profile)
if (-not (Test-Path $profDir)) { Say ('profile 目录不存在：' + $profDir) 'Red'; exit 1 }

$nodeOk = $false
try { & node --version | Out-Null; $nodeOk = ($LASTEXITCODE -eq 0) } catch { $nodeOk = $false }
if (-not $nodeOk) { Say 'node 不可用 —— 请先安装 Node.js >= 22' 'Red'; exit 1 }

$probe = Join-Path $KitRoot 'install\check-env.mjs'
$rawProbe = & node $probe 2>&1; $probeCode = $LASTEXITCODE
Say ('网络检查  : ' + (@($rawProbe) | Select-Object -First 1) + $(if ($probeCode -eq 0) { ' ✅' } else { ' ❌' }))
if ($probeCode -ne 0) { Say 'npm registry 不可达 —— 先解决网络' 'Red'; exit 1 }

# ---------------------------------------------------------------- 清单
$core = @(
    @{ Pkg = '@klarkxy/dsh-zhihu';   Why = '知乎官方 API：搜索/热榜/直答/知识库（额度大）' },
    @{ Pkg = 'dsh-free-search';      Why = '免 key 多引擎搜索（接进原生 web_search）' },
    @{ Pkg = 'deep-read-summarize';  Why = '书/论文/视频/网页精读（转录在本机）' },
    @{ Pkg = 'dsh-deepread';         Why = '观点/证据/置信度、费曼读书法' },
    @{ Pkg = 'dsh-wechat-mp-search'; Why = '微信公众号搜索 + 正文抓取（免 key）' },
    @{ Pkg = 'dsh-pubmed';           Why = '学术文献 26 个工具（key 可选）' }
)
$optional = @(
    @{ Pkg = 'dsh-obsidian';                   Why = '本地 Obsidian 读写' },
    @{ Pkg = 'dshbase-catalog';                Why = '离线插件目录检索' },
    @{ Pkg = 'dsh-mcp-panel';                  Why = 'MCP 管理面板' },
    @{ Pkg = 'dsh-mcp-lazy';                   Why = '多 MCP 时省 token' },
    @{ Pkg = '@bocha-ai/dsh-web-search-bocha'; Why = '博查官方搜索引擎（需 key）' }
)
$list = if ($IncludeOptional) { @($core + $optional) } else { @($core) }

Step '1. 安装清单'
foreach ($i in $list) { Say ('  - ' + $i.Pkg.PadRight(34) + $i.Why) }
if ($DryRun) { Say ''; Say '-DryRun：只列清单，未做改动。' 'Green'; exit 0 }

# ---------------------------------------------------------------- 备份
Step '2. 备份 profile'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bkDir = Join-Path (Join-Path $KitRoot '_backups') $stamp
New-Item -ItemType Directory -Force -Path $bkDir | Out-Null
foreach ($f in @('package.json', 'cordis.patch.yml')) {
    $src = Join-Path $profDir $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $bkDir $f) -Force; Say ('  已备份 ' + $f) 'Green' }
}
Say ('备份位置：' + $bkDir) 'Green'
Say ('回退命令：.\install\install.ps1 -Profile ' + $Profile + ' -Rollback')

# ---------------------------------------------------------------- 安装
Step '3. 逐个安装（装一个验一个，失败即停）'
$ok = New-Object System.Collections.ArrayList
$bad = New-Object System.Collections.ArrayList
$n = 0
foreach ($i in $list) {
    $n++
    Say ''
    Say ('[' + $n + '/' + $list.Count + '] ' + $i.Pkg) 'White'
    $out = & $dsh plugin --profile $Profile add $i.Pkg 2>&1
    if ($LASTEXITCODE -eq 0) { Say '   OK' 'Green'; [void]$ok.Add($i.Pkg) }
    else {
        Say '   失败：' 'Red'
        $out | Select-Object -Last 12 | ForEach-Object { Say ('     ' + $_) 'DarkGray' }
        [void]$bad.Add($i.Pkg); Say ''; Say '停下，先解决这一个。' 'Yellow'; break
    }
}

# ---------------------------------------------------------------- 凭据
Step '4. 知乎凭据（从环境变量或交互读取，绝不写进仓库）'
$envFile = Join-Path $env:USERPROFILE '.dsh\.env'
$secret = $env:ZHIHU_ACCESS_SECRET
if (-not $secret -and (Test-Path $envFile)) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^ZHIHU_ACCESS_SECRET=' } | Select-Object -First 1
    if ($line) { $secret = $line.Split('=', 2)[1].Trim() }
}
if (-not $secret) {
    Say '没有找到知乎 Access Secret（环境变量 ZHIHU_ACCESS_SECRET 或 ~\.dsh\.env）。' 'Yellow'
    Say '可以稍后在 设置 → 插件 → Zhihu 面板里填；或现在粘贴（不会存进仓库）：' 'Yellow'
    $sec = Read-Host -Prompt '  Access Secret（直接回车跳过）'
    if ($sec) { $secret = $sec.Trim() }
}
if ($secret) {
    $already = (Test-Path $envFile) -and ((Get-Content $envFile -Raw) -match 'ZHIHU_ACCESS_TOKEN')
    if ($already) { Say '~\.dsh\.env 里已有知乎凭据，跳过。' 'Green' }
    else {
        Add-Content -Path $envFile -Value '' -Encoding UTF8
        foreach ($k in @('ZHIHU_ACCESS_TOKEN', 'ZHIHU_ACCESS_SECRET', 'ZHIHU_API_KEY')) {
            Add-Content -Path $envFile -Value ($k + '=' + $secret) -Encoding UTF8
        }
        Say ('已写入 ' + $envFile + '（三个变量名都写了，插件按需取用）') 'Green'
        Say '⚠️ .env 只在 DSH 启动时读 —— 必须重启才生效。' 'Yellow'
    }
} else {
    Say '跳过凭据写入。记得稍后在插件面板里填。' 'Yellow'
}

# ---------------------------------------------------------------- 收尾
Step '5. 结果'
Say ('成功 ' + $ok.Count + ' 个') 'Green'
foreach ($p in $ok) { Say ('  OK   ' + $p) 'Green' }
if ($bad.Count -gt 0) { Say ('失败 ' + $bad.Count + ' 个') 'Red'; foreach ($p in $bad) { Say ('  FAIL ' + $p) 'Red' } }

Say ''
Say '接下来手动做三件事：' 'Yellow'
Say ('  1. 重启 DSH（凭据改动只在启动时读）。profile 用的是：' + $Profile)
Say '  2. 设置 → 插件 → 插件配置 → 网页搜索：把免 key 引擎设为首选，deepseek-official 留兜底。'
Say '  3. 复制 skills\research-autonomy 到工作区的 .dsh\skills\ 下，让它对新会话生效。'
Say ''
Say '然后用 README 里的「验证清单」逐条打勾 —— 尤其第 5、6 条（会不会先查、会不会编造）。'
