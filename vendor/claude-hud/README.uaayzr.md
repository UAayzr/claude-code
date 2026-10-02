# claude-hud（UAayzr 内置版）

> 上游：https://github.com/jarrodwatts/claude-hud （MIT License，0.10.0）

实时状态栏 HUD：在输入框下方显示上下文用量、速率限制、工具活动、agents、todo 进度。UAayzr 每次交互后通过 stdin 传入会话 JSON，本程序打印的内容即状态栏显示内容。

## UAayzr 内置形态（启动即显示）

**无需任何安装步骤**——UAayzr 启动后 HUD 自动显示在输入框下方：

- UAayzr 代码内置默认 `statusLine` 命令（`src/utils/statusLineDefaults.ts`）：用户显式配置 `settings.statusLine` 时优先，否则走内置 HUD
- 构建态（`dist/vendor/claude-hud/index.js`）用 `node` 执行产物；dev 态（`bun run dev`，无 dist/）用 `bun` 直接跑 TS 源码
- 关闭 HUD：`~/.uaayzr/settings.json` 设 `"statusLineEnabled": false`

## 默认配置

`vendor/claude-hud/src/config.ts` 的 `DEFAULT_CONFIG` 已对齐用户官方 claude-hud 配置：

- `showTools` / `showAgents` / `showTodos` / `showDuration` / `showConfigCounts`: true
- `customLine: "Love UAayzr MiaoWu"`，`customLinePosition: 'first'`（拼在第一行）
- 其余沿用上游默认：`expanded` 布局、git 状态开启、模型/项目/Context 进度条/用量默认显示

## 与上游的差异

**路径适配**（上游为官方 Claude Code 编写，写死官方路径；本内置版已改为 UAayzr 目录）：

| 上游 | 本内置版 |
|---|---|
| `~/.claude`（用户配置目录） | `~/.uaayzr`（`UAAYZR_CONFIG_DIR` env 优先） |
| `~/.claude.json`（全局配置） | `~/.uaayzr.json` |
| `~/.claude/plugins/claude-hud/`（插件目录） | `~/.uaayzr/plugins/claude-hud/` |
| `CLAUDE_CONFIG_DIR` env | 不再 honored（只用 `UAAYZR_CONFIG_DIR`） |
| 项目 `.claude/` 配置计数 | 项目 `.uaayzr/` 配置计数 |

**其他**：不包含上游的 `scripts/setup.mjs` / `statusline.mjs` launcher（无插件缓存多版本场景，`statusLine` 命令由 UAayzr 代码直接注入）。

## 配置自定义

配置文件 `~/.uaayzr/plugins/claude-hud/config.json`（不存在则用 `DEFAULT_CONFIG`）。常用项：

```json
{
  "lineLayout": "expanded",
  "display": {
    "showTools": true,
    "showAgents": true,
    "showTodos": true,
    "showDuration": true,
    "showConfigCounts": true,
    "customLine": "Love UAayzr MiaoWu"
  },
  "colors": { "context": "cyan" }
}
```

完整配置项见上游 README（`vendor/claude-hud/README.md`）。

## 升级

上游发新版时：替换 `vendor/claude-hud/` 下的 `src/`、`package.json`、`LICENSE`、`README.md` → 重新做一遍上面的「路径适配」（见差异表）→ `bun run build`。