# ADR-0001: 用 Gitee 镜像服务国内用户

## Status

Accepted

## Context

`npx skills` 从 GitHub 拉取 skill 仓库，国内用户常需翻墙才能安装。cn-skills-cli 的定位是国内优化版，必须让国内用户免翻墙安装。

## Decision

- **国内路径走 Gitee**：`cn-skills` 以 HTTPS 从 `gitee.com` 克隆镜像仓库，无需 VPN。
- **GitHub 源自动镜像**：`SHYXIN/skills`、`mattpocock/skills` 等 GitHub 仓库通过各自的 GitHub Actions 镜像工作流推到 Gitee（owner 大小写差异：`SHYXIN` → `theshyxin`）。
- **`SOURCE_ALIASES` 显式桥接**：`src/source-parser.ts` 把常用 shorthand 直接映射到 Gitee 源（如 `SHYXIN/skills` → `gitee:theshyxin/skills`），避免运行时再探测，也处理 owner 大小写不一致。
- **国外路径保留**：显式 `github:` 前缀或原始 `owner/repo` 仍走 GitHub。

## Consequences

- 国内用户 `cn-skills add SHYXIN/skills` 自动走 Gitee，零配置免翻墙。
- 镜像仓库需与 GitHub 保持同步（每次 push 触发 Actions）。
- owner 大小写不一致由别名显式处理，不在运行时猜测。
