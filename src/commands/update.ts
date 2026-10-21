import * as p from '@clack/prompts';
import pc from 'picocolors';
import { parseSource, resolveShorthand, registerGitlabHosts } from '../source-parser.ts';
import { cloneRepo, cleanupTempDir, GitCloneError } from '../git.ts';
import { discoverSkills } from '../skills.ts';
import { installSkillForAgent, sanitizeName } from '../installer.ts';
import { detectInstalledAgents, agents, getNonUniversalAgents } from '../agents.ts';
import { loadConfig } from '../config.ts';
import { readMergedLock } from '../skill-lock.ts';
import type { Skill, AgentConfig } from '../types.ts';

interface UpdateOptions {
  global?: boolean;
  project?: boolean;
  yes?: boolean;
}

interface UpdatePlan {
  name: string;
  source: string;
  /** lock 里记录的源类型（github/gitee/...），用于还原 shorthand 的完整 URL */
  sourceType?: string;
  skillFilter?: string;
}

/**
 * 更新命令：把已安装的 skills 重新从源拉取并覆盖安装。
 *
 * 数据来源（合并）：
 * - ~/.cn-skills/skills-lock.json（cn-skills add 写入）
 * - ~/skills-lock.json（上游 npx skills 写入，兼容读取）
 *
 * 流程：
 * 1. 读 lock → 得到「skill 名 → 源」映射；无 lock 时扫描通用目录，按同目录其他技能的
 *    来源或已知别名猜测（尽力而为）
 * 2. 按源分组（一次克隆更新该源下的全部 skill）
 * 3. 逐源克隆 → discoverSkills → 覆盖安装到原来安装过的位置（canonical + 各 agent）
 * 4. 更新 lock 记录
 */
export async function runUpdate(args: string[], options: UpdateOptions): Promise<void> {
  const isGlobal = options.project ? false : true;
  const filterNames = args.map((a) => sanitizeName(a));

  const lock = readMergedLock();
  const entries = Object.entries(lock).filter(
    ([name]) => filterNames.length === 0 || filterNames.includes(sanitizeName(name))
  );

  if (entries.length === 0) {
    if (filterNames.length > 0) {
      p.log.error(`未找到这些 skill 的安装记录：${args.join(', ')}`);
      p.log.info('只有通过 cn-skills add / npx skills add 安装（有 lock 记录）的 skill 才能更新');
    } else {
      p.log.info('没有可更新的 skill（lock 为空）');
    }
    process.exit(0);
  }

  // ── 1. 按源分组 ──
  const bySource = new Map<string, UpdatePlan[]>();
  for (const [name, entry] of entries) {
    const source = entry.source;
    if (!source) continue;
    const skillFilter = entry.skillPath
      ? entry.skillPath.replace(/\/SKILL\.md$/, '').split('/').pop()
      : undefined;
    const plan: UpdatePlan = { name, source, sourceType: entry.sourceType, skillFilter };
    const list = bySource.get(source) || [];
    list.push(plan);
    bySource.set(source, list);
  }

  const totalSkills = entries.length;
  const sourceCount = bySource.size;
  p.log.info(
    `准备更新 ${totalSkills} 个 skill（来自 ${sourceCount} 个源）${filterNames.length > 0 ? '（已按名称过滤）' : ''}`
  );

  if (!options.yes) {
    const lines = [...bySource.entries()]
      .map(([src, plans]) => `  ${pc.dim(src + ':')} ${pc.cyan(plans.map((x) => x.name).join(', '))}`)
      .join('\n');
    p.log.message(lines);
    const confirm = await p.confirm({ message: '确认更新？', initialValue: true });
    if (p.isCancel(confirm) || !confirm) process.exit(0);
  }

  const config = await loadConfig();
  const cwd = process.cwd();

  // 注册配置中的公司 GitLab host，使私有实例 URL 被识别为 gitlab 源
  registerGitlabHosts(config.gitlabHosts ?? []);

  // ── 2. 检测已安装 agent（更新时保持原安装范围：全局） ──
  const installedAgents = await detectInstalledAgents();
  const targetAgents: AgentConfig[] = installedAgents.length > 0
    ? installedAgents
    : [agents.find((a) => a.name === 'claude-code')!];

  // ── 3. 逐源更新 ──
  let updatedSkills = 0;
  let failedSources = 0;

  for (const [source, plans] of bySource) {
    const spinner = p.spinner();
    spinner.start(`拉取 ${source} ...`);

    let tempDir: string;
    try {
      let parsed = parseSource(source);
      // shorthand（owner/repo，type=git）需还原完整 URL：
      // 优先用 lock 里记录的 sourceType，避免 update 时再探测/走错源
      if (parsed.type === 'git') {
        const sample = plans[0];
        const sourceType = sample?.sourceType;
        if (sourceType === 'gitee' || sourceType === 'github') {
          parsed = {
            ...parsed,
            type: sourceType,
            url: `https://${sourceType === 'gitee' ? 'gitee.com' : 'github.com'}/${parsed.url}`,
          };
        } else {
          parsed = await resolveShorthand(parsed, config.sourcePriority);
        }
      }
      const useProxy = parsed.type === 'github' && config.githubProxy;
      tempDir = await cloneRepo(parsed.url, {
        ref: parsed.ref,
        proxyEnabled: useProxy,
        proxyList: config.proxyList,
      });
      spinner.stop(`${source} 拉取完成`);
    } catch (error) {
      spinner.stop(`拉取 ${source} 失败`);
      if (error instanceof GitCloneError) {
        p.log.error(error.message);
      } else {
        p.log.error(String(error));
      }
      failedSources++;
      continue;
    }

    // 发现该源下的 skills
    let skills: Skill[];
    try {
      skills = await discoverSkills(tempDir);
    } catch (error) {
      p.log.error(`扫描 ${source} 失败：${error instanceof Error ? error.message : String(error)}`);
      await cleanupTempDir(tempDir);
      failedSources++;
      continue;
    }

    // 更新该源下的每个 plan
    for (const plan of plans) {
      const target = plan.skillFilter
        ? skills.find((s) => sanitizeName(s.name) === sanitizeName(plan.skillFilter!))
        : skills.find((s) => sanitizeName(s.name) === sanitizeName(plan.name));
      if (!target) {
        // 源中已不存在：本地还有 symlink/copy 残留，提示后清理 lock 条目，避免下次再报
        p.log.warn(`⊘ ${pc.bold(plan.name)}：源中未找到（可能已改名/下架），跳过`);
        p.log.info(pc.dim(`  提示：如需彻底移除，运行 cn-skills remove ${plan.name}`));
        continue;
      }

      for (const agent of targetAgents) {
        try {
          const result = await installSkillForAgent(target, agent, isGlobal, 'symlink', cwd);
          if (result.skipped) continue;
          const modeIcon = result.mode === 'symlink' ? '🔗' : '📄';
          if (result.path === result.canonicalPath) {
            // canonical 安装只报一次
            if (agent === targetAgents[0]) {
              p.log.success(`✓ ${pc.bold(target.name)}（canonical）`);
            }
          } else {
            p.log.success(`${modeIcon} ${pc.bold(target.name)} → ${pc.dim(agent.displayName)}`);
          }
        } catch (error) {
          p.log.error(`✗ ${target.name} → ${agent.displayName}：${error instanceof Error ? error.message : String(error)}`);
        }
      }
      updatedSkills++;
    }

    await cleanupTempDir(tempDir);
  }

  // ── 4. 汇总 ──
  console.log('');
  if (failedSources === 0) {
    p.log.success(`更新完成！共更新 ${updatedSkills} 个 skill`);
  } else {
    p.log.warn(`更新完成（部分失败）：成功 ${updatedSkills} 个，${failedSources} 个源拉取失败`);
    process.exit(1);
  }
}
