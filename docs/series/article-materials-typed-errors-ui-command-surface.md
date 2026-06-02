# Article Materials: Typed Errors, Timings, And Command Surface

Suggested placement: development note 04, or a 04.5 interlude if the desktop workbench story needs its own article.

## Title Options

- `Typecho MCP Workbench 开发手记 04：从能用到可信，给 AI 操作加上飞行记录仪`
- `Typecho MCP Workbench 开发手记 04：错误要会说话，按钮也要懂分寸`
- `Typecho MCP Workbench 开发手记 04：可诊断、可审计、可被 AI 安全操作`
- `Typecho MCP Workbench 开发手记 04：一次失败应该留下什么线索`
- `Typecho MCP Workbench 开发手记 04：把发布按钮藏进 Review 里`

## Story Line

The project has crossed from "it works" into "it can be trusted under supervision." SSH detection, the PHP agent, drafts, updates, snapshots, publish checks, and media flows already work. The next question is whether an AI-operated blog tool can explain failures, show where time went, and prevent risky actions from becoming casual clicks.

Typed errors answer the first part. Failures now carry `code`, `type`, `stage`, `retryable`, `hint`, and `operationId` where available. That lets a future agent distinguish policy denial from SSH failure, cache failure, target detection, remote exec, agent RPC, or DB/remote-agent problems.

Operation timings answer the second part. Instead of one total duration, the workbench can record stages such as `detect`, `deploy`, `exec`, `rpc`, `cache`, and `local`. Slow reads can then be investigated by stage rather than by guesswork.

The command surface answers the third part. Low-risk actions can move into right-click and kebab menus, but publish, rollback, delete, plugin/theme/settings writes, and similar operations must open review/confirm flows. Menus should say `Open publish review` or `Open rollback review`, not execute the dangerous action directly.

## Screenshot Checklist

- Request log entry with operation timings.
- Policy denial for publish without confirmation.
- Debug Bundle v2 top-level structure.
- UI context/kebab menu showing `Open publish review`.
- Snapshot menu showing `Open rollback review` without direct rollback execution.
- Roadmap showing Trust Core Hardening and Workbench UX Foundation.

## Draft Paragraph

做到这一轮时，Typecho MCP Workbench 已经不只是能推送文章了。它开始有一套解释自己的方式：错误会告诉你失败发生在哪一层，耗时会告诉你时间花在哪一步，request log 会把这些线索沉淀下来，UI 则把危险动作从普通按钮和右键菜单里拿出来，放回 review、policy 和 human confirmation 的路径里。

这对一个 AI Vibe Coding 项目很关键。AI 可以帮我操作博客，但它不能把“能调用工具”误解成“可以替人按下最终发布”。一个可信的 MCP workbench 不应该追求一路畅通，而应该追求每一步都有证据、有边界、有可解释的失败。
