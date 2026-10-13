# ADR-0003: 全量移植上游 agent 注册表 + 脚本化同步

## Status

Accepted

## Context

`cn-skills` 定位为 `npx skills`（`vercel-labs/skills`）的国内平替，但 `src/agents.ts` 的 agent 注册表只有约 30 项，且**缺失 `codebuddy`、`hermes-agent` 等**。`wangxin/skills` 的安装脚本默认目标 agent 含 `codebuddy`，而 `add` 命令对解析不到的 agent 名**静默丢弃**（`add.ts` 的 `.filter((a): a is AgentConfig => a !== undefined)`），于是 codebuddy 被无声跳过——即用户报告的「功能缺失」。

此外，所有「通用 agent」的 `globalSkillsDir` 被统一写成 `~/.agents/skills`，与上游「每个 agent 各自全局目录」的语义不符，使 `gemini-cli`（`~/.gemini/skills`）、`opencode`（`~/.config/opencode/skills`）、`github-copilot`（`~/.copilot/skills`）等的全局安装失效。

## Decision

- **全量移植**上游 `vercel-labs/skills` 的 agent 注册表（80+），每个 agent 使用**自己的** `globalSkillsDir`；项目级仍共享 `.agents/skills`。
- 安装器判定「通用 agent」改为 `skillsDir === '.agents/skills'`；全局安装时凡 `globalSkillsDir ≠ ~/.agents/skills` 的 agent 都建 symlink（失败回退 copy）。
- 新增上游没有的 **`workbuddy`**（`.workbuddy/skills` + `~/.workbuddy/skills`），标记 **`forceCopy`**：WorkBuddy 只扫全局目录、且 symlink 支持未知，恒用复制。
- 漂移用 **`scripts/sync-agents.ts`** 治理：从上游 `src/agents.ts`（raw）重新生成注册表，**保留 cn 特有项**（workbuddy、`forceCopy`）。

## Considered Options

- **最小补齐**（只加 `codebuddy` + `hermes-agent`）：下次仍会缺，治标不治本。
- **运行时按 agent 名推导目录**（`xxx → .xxx/skills`）：会猜错——`gemini-cli → .gemini/skills`、`github-copilot → .copilot/skills` 都不是简单拼接。
- **CI 只做漂移巡检**：只报警不解决，仍需人工同步。

## Consequences

- `cn-skills add ... --agent codebuddy` 等不再被静默丢弃；`wangxin/skills` 的 `install-cn.sh` 默认列表可加 `workbuddy`。
- 注册表随上游演进，靠 `sync-agents.ts` 一条命令对齐；cn 特有项需在生成器中显式保留，否则会被覆盖。
- `sync-workbuddy` 脚本保留为兜底（复制语义一致），但不再是唯一通道。
