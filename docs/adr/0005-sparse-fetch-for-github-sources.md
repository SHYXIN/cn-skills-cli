# ADR-0005: GitHub 源启用稀疏拉取（partial clone 只检出技能目录）

## Status

Accepted

## Context

`add`/`update` 的拉取环节是整仓浅克隆（`--depth 1`）。小仓库无所谓，但遇到巨型仓库（如 `deepseek-ai/deepseek-harness`，浅克隆 211 MiB / 国内实测 2 分 32 秒）时，为了抽出几十 KB 的技能文件要付出整仓代价，且每次 `update` 都重复付费。ADR-0004 的 gh-proxy 系代理只提速、不减量。

另一条路是克隆前用 GitHub Trees API 解析技能目录再稀疏检出——实测被否决：`api.github.com` 国内直连不可靠（10s 超时），API 层是 Liability。

## Decision

GitHub 源（`type=github`，含 shorthand 解析结果）默认启用稀疏快车道：

1. `git clone --depth 1 --filter=blob:none --sparse [--branch <ref>]`——partial clone 只落 tree 元数据与根目录文件；
2. 本地 `git ls-tree -r --name-only HEAD` 推导全部 SKILL.md 所在目录（纯本地执行、零额外网络；不走 api.github.com）。注意路径匹配**大小写敏感**且必须整段匹配 `/SKILL.md`——`badge-skill.md` 之类的文件不得误判（Windows 实测教训）；
3. `git sparse-checkout set --cone --stdin` 仅检出技能目录（目录清单经 stdin 传入，规避 Windows 命令行长度上限）；
4. 任一步骤在某候选失败（如 gitclone.com 路径式代理不支持 filter）→ 换下一个候选；全部候选失败 → 回退整仓浅克隆（ADR-0004 行为，永不比改造前更差）。

Gitee / GitLab / 本地路径源不启用（Gitee 对 partial clone 的支持未验证，且这些仓库普遍较小）。子路径安装（subpath）时技能目录按子路径过滤；`update` 不带 subpath（全仓扫描语义）。

实测收益（deepseek-harness `--skill dsh-doc`，国内网络）：整仓 211 MiB / 2m32s → 稀疏 5.6 MiB / 6s；端到端冒烟（含 tsx 启动与代理探测）3m09s → 29s，产物完整（SKILL.md + references + templates + 14 locale 文件）。

## Considered Options

- **GitHub Trees API 预解析目录**：被实测否决——`api.github.com` 国内直连 10s 超时，且匿名限流 60 次/时。
- **`--no-checkout` + ls-tree + set**：`set` 后工作树不落盘（无显式 checkout 不 materialize），实测否决。
- **维持整仓浅克隆**：巨型仓库不可用（211 MiB / 2.5 分钟，update 反复付费）。

## Consequences

- 巨型 GitHub 仓库的 add/update 从分钟级降到秒级；`update` 即重新稀疏拉取上游 HEAD，快照漂移问题在工具层消解。
- 上游 vercel-labs/skills 仍是整仓克隆——如需对齐可另行回 PR。
- 依赖：git ≥ 2.26（`sparse-checkout set --cone`）；服务端 `uploadpack.allowFilter`（GitHub 默认开启）。代理兼容性实测（2026-11-26）：GitHub 直连 / gh-proxy.org / gh-proxy.com / ghproxy.net ✅，gitclone.com 路径式代理 ❌（回退路径覆盖），ghfast.top 本机连接失败（网络问题，非协议问题）。
- 稀疏尝试用独立紧凑预算 `SPARSE_ATTEMPT_TIMEOUT_MS`（120s，正常 6~72s 即完成）：坏候选早断早换，避免每个候选吃满整仓的 300s 使最坏情况翻倍；网络劣化时稀疏链全部超时会落回整仓克隆（慢但不劣化正确性）。
- ls-tree 与 sparse-checkout 失败一律走回退，不改变任何既有错误语义与文案。
