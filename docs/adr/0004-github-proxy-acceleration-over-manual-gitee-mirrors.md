# ADR-0004: GitHub 代理加速替代手动 Gitee 镜像

## Status

Accepted

## Context

国内用户安装 GitHub 上的 skill 仓需翻墙。原方案是为每个常用仓在 Gitee 建镜像（`SOURCE_ALIASES` 硬编码 + CNB/GitHub Actions 自动同步），代价是**每个新仓都要手动建镜像**。

`src/git.ts` 里其实已有 `GITHUB_MIRRORS` 自动探测，但因 `add.ts` 对 github 源先传入 `config.mirror.github`（默认 `https://github.com`），使 `cloneRepo` 的 `!mirrorUrl` 条件恒假，**自动探测从未生效**——死代码。且原清单里的 `kkgithub.com`、`gitmirror.com`、`hub.gitmirror.com` 实测已不可 clone。

## Decision

- 以**按需 GitHub 代理**为主路径，**不再为新仓手动建 Gitee 镜像**。
- 代理清单取**实测可 clone** 的 5 个：`gh-proxy.org`、`ghfast.top`、`ghproxy.net`、`gh-proxy.com`、`gitclone.com`。
- 选择机制：clone 前用 **`git ls-remote` 预探测**（每镜像约 6s 超时）选第一个可用者；clone 失败再逐个回退，最后回退直连 GitHub。
- 配置：新增 `githubProxy`（默认 `true`）与 `proxyList`（可覆盖）；探测结果缓存 `~/.cn-skills/mirror-cache.json`（带 TTL）。
- **保留** `SHYXIN/skills`、`mattpocock/skills`、`pstack` 的 Gitee 镜像（可控、可冻结版本，且同步已自动化）。

## Considered Options

- **全部取消 Gitee**：失去 `pstack` 的版本冻结能力（代理做不到冻结）。
- **自动化建 Gitee 镜像**（Gitee API 导入）：仍需 Gitee 账号/令牌，且长尾仓不值得建镜像。
- **克隆时逐个试而不预探测**：单个死镜像可能耗满 `CLONE_TIMEOUT_MS`（5 分钟）才换下一个，体验差。

## Consequences

- 长尾 GitHub 仓**零手动**即可安装；核心仓仍走可控的 Gitee。
- 依赖第三方代理的可用性；靠多镜像探测 + 回退 + 可配置清单缓解，清单失效时可热更新而不发版。
- `config.mirror.github` 的语义需澄清：其默认值 `https://github.com` 会短路自动探测，需与新的 `githubProxy` 开关协同。
