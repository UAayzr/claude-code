# Bundled notification sounds

本目录的 5 个 mp3 音效来自 [`agent-notifications`](https://github.com/777genius/agent-notifications)（© 2025 777genius，**GPL-3.0**）的 `sounds/` 目录，按 UAayzr Code 自用部署整合。

## 场景 → 音效映射（继承自 agent-notifications 的 statuses 语义）

| 音效 | 语义（源自其 config） | UAayzr Code 的 notificationType |
|---|---|---|
| `question.mp3` | 提问/批准/API 错误/会话限额——「需要用户注意」 | `permission_prompt`、`worker_permission_prompt`、`elicitation_dialog`、`elicitation_url_dialog`、`idle_prompt`、`computer_use_enter`（及未知类型兜底） |
| `task-complete.mp3` | 任务完成 | `computer_use_exit`、`auth_success` |
| `review-complete.mp3` | 审查完成 | （备用） |
| `plan-ready.mp3` | 计划就绪 | （备用） |
| `error.mp3` | 错误 | （备用） |

播放方式：Windows 通知通道经 PowerShell MCI（winmm.dll，系统解码器）流式播放 `play s wait`，无 ffmpeg/转码依赖。跨机器：音效随 git 分发（`.gitattributes` 标记 `*.mp3 binary`），build 与 build:vite 双管道复制入 `dist/vendor/sounds/`。

> 许可证提醒：音效来源项目为 GPL-3.0。自用部署无碍；**若本仓库公开分发，需自行评估音效资产的许可证兼容性**。