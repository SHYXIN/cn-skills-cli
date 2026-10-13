# cn-skills-cli

中国优化的 `npx skills` 平替——把 AI agent skills 从 GitHub / Gitee / GitLab 安装到本地 agent 配置目录，带 Gitee 镜像加速与中文技能索引，让国内用户免翻墙安装。

## Language

**Agent**:
技能被安装进去的编程助手——如 `codebuddy`、`claude-code`、`codex`、`workbuddy`。是一个安装目标。
_避免_：assistant、bot

**Agent registry**:
`src/agents.ts` 里全部 agent 的注册表，定义每个 agent 的项目级/全局 skills 目录与检测方式。全量对齐上游 `vercel-labs/skills`，由 `scripts/sync-agents.ts` 生成（保留 cn 特有项）。
_避免_：agent list、agent table

**Universal agent**:
`skillsDir === '.agents/skills'` 的 agent——项目级共享同一目录、无需 symlink；全局安装时若 `globalSkillsDir ≠ ~/.agents/skills` 仍需 symlink。
_避免_：common agent、shared agent

**forceCopy**:
`AgentConfig` 上的覆盖标记，令某 agent 无视全局 symlink/copy 模式、恒用复制（`workbuddy` 用，因其只扫全局目录且 symlink 支持未知）。
_避免_：noSymlink、copyOnly

**Skill source**:
托管一个或多个技能的 git 仓库（或子路径）——如 `SHYXIN/skills`、`mattpocock/skills`。由 `parseSource` / `resolveShorthand` 解析为具体 URL + 平台。
_避免_：skill repo、skill pack

**Source alias**:
`SOURCE_ALIASES`（`src/source-parser.ts`）里写死的 shorthand → 显式源的映射，如 `SHYXIN/skills` → `gitee:theshyxin/skills`。用来桥接 GitHub 与 Gitee 之间的 owner 大小写不一致。
_避免_：shortcut、mapping

**Gitee mirror**:
GitHub skill 仓库在 Gitee 上的副本，让国内用户以 HTTPS 从 `gitee.com` 克隆，无需翻墙。由源仓库的 GitHub Actions 镜像工作流保持同步。**仅保留给核心仓**（`SHYXIN/skills`、`mattpocock/skills`、`pstack`）；长尾仓改走 GitHub proxy（见 ADR-0004）。
_避免_：backup、fork

**GitHub proxy**:
前缀式按需代理，把 `https://github.com/owner/repo` 映射为 `https://<proxy>/https://github.com/owner/repo`（`gitclone.com` 形态为 `gitclone.com/github.com/owner/repo`）。用于替代为新仓手动建 Gitee 镜像。
_避免_：mirror（与 Gitee mirror 混淆）

**Mirror probe**:
clone 前用 `git ls-remote` 对候选代理做的一次轻量可用性探测，选第一个可用者；clone 失败再逐个回退。结果缓存于 `~/.cn-skills/mirror-cache.json`。
_避免_：health check、ping

**Skill bucket**:
skill 仓库里按主题归类的子目录，如 `skills/skills/teaching/`、`skills/skills/productivity/`。一个 skill 的「类别」取其父目录名（`getSkillCategory`）。`discoverSkills` 必须递归扫描，否则 bucket 里的 skill 会被漏掉（见 ADR-0002）。
_避免_：category、group（在 `add` 交互里已用「类别」指代 bucket）

## Relationships

- 一个 **Agent** 安装多个 **Skill**
- 一个 **Skill source** 暴露多个 **Skill**
- 一个 **Source alias** 把一个 shorthand 指向一个 **Gitee mirror**（或其他显式源）
