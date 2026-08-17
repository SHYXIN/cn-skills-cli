# ADR-0002: `cn-skills add` 的 skill 发现与选择体验

## Status

Accepted

## Context

用户执行 `cn-skills add SHYXIN/skills` 后，克隆成功却没有弹出「选择要安装哪些 skill」的列表，且只安装了 `skill-curator` 一个 skill。

根因：`discoverSkills` 的 skill 发现逻辑分两步——
1. 标准目录一层扫描（`SKILL_SEARCH_DIRS`）；
2. 递归兜底 `findSkillDirs`，但被错误地写成 `if (skills.length === 0)`（只在**一个都没找到**时才跑）。

`SHYXIN/skills` 的真实结构是 `skills/skill-curator/`（直接一层可见）+ `skills/skills/<bucket>/<skill>/`（多层嵌套）。一层扫描命中了 `skill-curator`（1 个），于是递归兜底被跳过，其余 21 个嵌套 skill 全被漏掉，导致 `skills.length === 1`，`add` 里的多选分支（`skills.length > 1`）不触发，直接进确认界面。

参考对象 `npx skills add` 的行为：克隆后弹出**按插件/分类分组的多选列表**（每项带完整描述、可整组勾选），安装摘要也按分类分组、每个 skill 单独一行显示装到的 agent。用户希望 `cn-skills` 达到同等观感，且全程免翻墙（走 Gitee）。

## Decision

- **发现逻辑改为始终递归**：移除 `if (skills.length === 0)` 门控，标准目录扫描与 `findSkillDirs` 递归结果始终合并（按 skill name 去重）。这样无论 skill 在扁平目录还是任意深度的 bucket 里，都能被全部发现。
- **选择列表按类别分组**：多选列表使用 `@clack/prompts` 的 `group`（取 skill 父目录名，即 bucket：`teaching` / `productivity` / `skills` …）+ `detail`（完整描述）+ `showDetail: true`，对齐 `npx skills` 的交互。
- **安装摘要按类别分组**：预安装「安装摘要」与已安装的结果面板都按类别分组展示 skill，而不是把所有名字挤在一行。
- **安全风险评估不做**：`npx skills` 的 Gen/Socket/Snyk 风险评估在国内网络基本调不通，且超出本次范围，暂不实现。

## Consequences

- `cn-skills add <repo>` 能正确发现仓库里全部 skill，并弹出多选让用户勾选（对齐 `npx skills` 体验），国内用户无需退回 `npx skills`。
- 多层 bucket 结构的仓库（SHYXIN/skills、mattpocock/skills）安装体验一致。
- `getSkillCategory(skill)` 作为归类辅助函数加入 `src/skills.ts`，供 `add` 命令的选择/摘要分组复用，并有对应单元测试覆盖。
