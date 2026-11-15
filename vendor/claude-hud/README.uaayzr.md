# claude-hud（UAayzr 内置版）

> 上游：https://github.com/jarrodwatts/claude-hud （MIT License，0.15.3）

实时状态栏 HUD：在输入框下方显示上下文用量、速率限制、工具活动、agents、todo 进度。UAayzr 每次交互后通过 stdin 传入会话 JSON，本程序打印的内容即状态栏显示内容。

## 架构（0.15 起重写）

上游 0.15 把 HUD 拆成 owner / logic / cage 三层，详见 `ARCHITECTURE.md`：

```
hud.mjs（owner 层）
  ├─ 读 stdin，准备数据
  ├─ spawn 子进程：
  │    node --permission --import=fence.mjs src/main.ts
  │      ↑ 沙箱内的 logic 层，只能读授权路径、只能写 data/
  └─ 过滤输出后打印
collector.mjs（唯一能起子进程的代码）
  └─ 在沙箱外执行 git / jj / vm_stat / extra-cmd
```

`fence.mjs` 把 logic 层的 import 限制在 7 个 builtin（`path`、`fs`、`fs/promises`、`os`、`url`、`crypto`、`readline`），`node:child_process`、`node:net` 等一律拒绝。

## UAayzr 内置形态（启动即显示）

**无需任何安装步骤**——UAayzr 启动后 HUD 自动显示在输入框下方：

- UAayzr 代码内置默认 `statusLine` 命令（`src/utils/statusLineDefaults.ts`）：用户显式配置 `settings.statusLine` 时优先，否则走内置 HUD
- 构建态：`node "<dist>/vendor/claude-hud/hud.mjs"`
- dev 态（`bun run dev`，无 `dist/`）：`bun "<repo>/vendor/claude-hud/hud.mjs"`
- 关闭 HUD：`~/.uaayzr/settings.json` 设 `"statusLineEnabled": false`，或临时设 `CLAUDE_HUD_DISABLE=1`

### Node 版本要求

**需要 Node ≥ 22.18**（依赖 TypeScript 类型剥离、`--permission`、`module.registerHooks`）。
低于该版本时状态栏显示一行中文升级提示，不影响 UAayzr 本身。
Bun 下会自动 relay 到 node（`hud.mjs:250`），所以 Bun 启动也需要系统里能找到 node。

## 运行时文件集

```
vendor/claude-hud/
├── hud.mjs          入口（owner 层）
├── collector.mjs    唯一能起子进程的代码
├── fence.mjs        沙箱内的 import 白名单
├── package.json     运行时读取（版本号 / transcript 游标键）
└── src/             49 个 .ts，logic 层，沙箱内运行
```

**不能打包成单文件**：`hud.mjs` 用 `import.meta.url` 定位同目录的 `src/main.ts` 和 `fence.mjs`，
打包后这两条路径失效，会静默产出空状态栏（实测退出码 0、无输出）。
因此 `build.ts` 和 `scripts/post-build.ts` 都用 `scripts/copy-hud.ts` 做整目录复制。

## 默认配置

`vendor/claude-hud/src/config.ts` 的 `DEFAULT_CONFIG` 保留了 UAayzr 的定制
（上游 0.15 把这几项默认关掉了）：

- `showTools` / `showAgents` / `showTodos` / `showDuration` / `showConfigCounts`: `true`
- `customLine: "Love UAayzr MiaoWu"`，`customLinePosition: 'last'`（拼在第一行末尾）
- 其余沿用上游默认：`expanded` 布局、git 状态开启、模型/项目/Context 进度条/用量默认显示

## 与上游的差异

路径适配只改了 **3 个根**，其余 8 个路径全部由 `collector.mjs` 的 `logicPaths()` 派生：

| 上游 | 本内置版 | 改动点 |
|---|---|---|
| `CLAUDE_CONFIG_DIR` env | `UAAYZR_CONFIG_DIR` env | `collector.mjs:29`、`hud.mjs:122` |
| `~/.claude` | `~/.uaayzr` | `collector.mjs:30` |
| `~/.claude.json` | `~/.uaayzr.json` | `collector.mjs:36` |
| 项目 `.claude/` | 项目 `.uaayzr/` | `collector.mjs:68` |
| `~/.claude/plugins/claude-hud/` | `~/.uaayzr/plugins/claude-hud/` | 由 configDir 派生 |

**文件名不变**：`CLAUDE.md`、`CLAUDE.local.md`、`settings.json`、`settings.local.json`、
`rules/`、`.mcp.json` 都沿用原名，与 UAayzr 主程序（`src/utils/claudemd.ts`）保持一致。

**其他品牌化**：i18n 的 3 处 "Claude Code" → "UAayzr Code"；4 处 `/hud` 提示改为中文说明
（内置版没有 `/hud` 斜杠命令）。

## 运行时数据目录

```
~/.uaayzr/plugins/claude-hud/
├── config.json          主配置（手工编辑）
├── heartbeat.json       上次渲染记录
├── data/                logic 层唯一可写的目录
│   ├── daily-cost.json  今日/本周花费账本
│   ├── speed-cache/     tok/s 缓存
│   └── transcript-cursors/  增量读取游标
└── stripped/            TypeScript 类型剥离缓存（按源码内容 + Node 版本哈希）
```

`~/.uaayzr/claude-hud.json` 是按配置目录的覆盖层（同名键覆盖 `config.json`）。

## 不包含的上游部分

`install.mjs`、`scripts/statusline.mjs`、`dist/index.js`、`skills/`、`verify/`、`tests/`、`maintainer/`。
因此 `hud install` 和 `/hud` 斜杠命令不可用；`node hud.mjs doctor|schema|preview|set|report` 仍可手工运行。

## 性能

约 240ms/次（0.10.0 约 140ms），多一层沙箱子进程。
首次渲染额外承担 `stripped/` 里 49 个文件的类型剥离，之后复用缓存。

## 升级流程

上游发新版时：

1. 从上游取 `hud.mjs`、`collector.mjs`、`fence.mjs`、`src/`、`package.json`、`LICENSE`、
   `README.md`、`ARCHITECTURE.md`、`CHANGELOG.md`
2. 重做品牌适配（见上方差异表，3 个根 + `PASSED_ENV` 白名单）
3. 恢复 `DEFAULT_CONFIG` 的 6 处定制（5 个 `show*` + `customLine`）
4. 重做 i18n 品牌化与 `/hud` 提示改写
5. `bun run build` 和 `bun run build:vite` 各跑一次验证
