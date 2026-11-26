# cn-skills（cn-skills-cli）

中国优化的 AI Agent Skills 安装工具。

支持 **Gitee/GitHub 双源**、**镜像加速**、**稀疏拉取**、**中文技能索引**，兼容 `npx skills` 的目录结构。

> **npm 包名**：`cn-skills-cli`
> **命令名**：`cn-skills`

## 安装

```bash
npm install -g cn-skills-cli
```

安装后使用 `cn-skills` 命令：

```bash
cn-skills --version
```

也可以用 npx 直接运行：

```bash
npx cn-skills-cli add owner/repo
```

## 快速开始

```bash
# 从 Gitee 安装（shorthand 模式，自动探测源）
cn-skills add owner/repo

# 从 GitHub 安装
cn-skills add github:owner/repo

# 从 Gitee 安装
cn-skills add gitee:owner/repo

# 搜索中文技能索引
cn-skills search 代码审查

# 列出已安装的 skills
cn-skills list

# 移除 skill
cn-skills remove my-skill

# 查看/初始化配置
cn-skills config --init
```

## 支持的源格式

| 格式 | 示例 |
|------|------|
| Shorthand（自动选源） | `owner/repo` |
| Gitee 前缀 | `gitee:owner/repo` |
| GitHub 前缀 | `github:owner/repo` |
| Gitee URL | `https://gitee.com/owner/repo` |
| GitHub URL | `https://github.com/owner/repo` |
| Git SSH | `git@gitee.com:owner/repo.git` |
| 本地路径 | `./local/path` |

## 配置

配置文件路径：`~/.cn-skills/config.json`

```json
{
  "sourcePriority": ["gitee", "github"],
  "mirror": {
    "github": "https://github.com",
    "gitee": "https://gitee.com"
  },
  "installMode": "symlink",
  "preferredAgents": ["claude-code"],
  "indexUrl": "https://gitee.com/cn-skills/index/raw/main/zh-skills.json"
}
```

### 配置项说明

- **sourcePriority**：shorthand 模式下的源优先级，默认 Gitee 优先
- **mirror**：镜像地址，可将 GitHub 替换为 fastgit 等加速镜像
- **installMode**：安装模式，`symlink`（符号链接）或 `copy`（复制）
- **preferredAgents**：默认安装的 agent
- **indexUrl**：中文技能索引地址

### 稀疏拉取（GitHub 大仓库加速）

GitHub 源安装/更新时自动启用 **partial clone**：只检出技能目录，跳过仓库其余内容。技能目录由本地 `git ls-tree` 推导（不走 API），服务端或代理不支持 `--filter` 时自动回退整仓浅克隆，行为永不劣于旧版。实测巨型仓库收益：211 MiB / 2 分半 → 5.6 MiB / 6 秒（详见 `docs/adr/0005-sparse-fetch-for-github-sources.md`）。

## 与 npx skills 的关系

- **兼容目录结构**：安装到相同的 `.claude/skills/`、`.agents/skills/` 等目录
- **可混用**：`cn-skills` 和 `npx skills` 安装的 skill 可以共存
- **额外功能**：Gitee 支持、镜像加速、中文索引、中文界面

## 技术架构

```
src/
├── cli.ts              # CLI 入口，命令路由
├── commands/
│   ├── add.ts          # 安装命令
│   ├── search.ts       # 搜索中文索引
│   ├── list.ts         # 列出已安装
│   └── remove.ts       # 移除 skill
├── source-parser.ts    # 源解析（支持 Gitee/GitHub/GitLab/本地）
├── git.ts              # Git 克隆（支持镜像加速）
├── skills.ts           # Skill 发现（扫描 SKILL.md）
├── installer.ts        # 安装到 agent 目录
├── agents.ts           # Agent 配置（10+ 个 agent）
├── config.ts           # 配置文件管理
├── index-fetcher.ts    # 中文索引获取（四级降级）
├── frontmatter.ts      # YAML frontmatter 解析
├── constants.ts        # 常量定义
└── types.ts            # TypeScript 类型
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev -- add owner/repo

# 类型检查
npm run type-check

# 运行测试
npm test

# 构建
npm run build
```

## License

MIT
