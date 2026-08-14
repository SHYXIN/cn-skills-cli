# cn-skills-cli

中国优化的 `npx skills` 平替——把 AI agent skills 从 GitHub / Gitee / GitLab 安装到本地 agent 配置目录，带 Gitee 镜像加速与中文技能索引，让国内用户免翻墙安装。

## Language

**Agent**:
技能被安装进去的编程助手——当前为 `codebuddy`、`claude-code`、`codex`。是一个安装目标。
_避免_：assistant、bot

**Skill source**:
托管一个或多个技能的 git 仓库（或子路径）——如 `SHYXIN/skills`、`mattpocock/skills`。由 `parseSource` / `resolveShorthand` 解析为具体 URL + 平台。
_避免_：skill repo、skill pack

**Source alias**:
`SOURCE_ALIASES`（`src/source-parser.ts`）里写死的 shorthand → 显式源的映射，如 `SHYXIN/skills` → `gitee:theshyxin/skills`。用来桥接 GitHub 与 Gitee 之间的 owner 大小写不一致。
_避免_：shortcut、mapping

**Gitee mirror**:
GitHub skill 仓库在 Gitee 上的副本，让国内用户以 HTTPS 从 `gitee.com` 克隆，无需翻墙。由源仓库的 GitHub Actions 镜像工作流保持同步。
_避免_：backup、fork

## Relationships

- 一个 **Agent** 安装多个 **Skill**
- 一个 **Skill source** 暴露多个 **Skill**
- 一个 **Source alias** 把一个 shorthand 指向一个 **Gitee mirror**（或其他显式源）
