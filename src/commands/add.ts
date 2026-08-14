import * as p from '@clack/prompts';
import pc from 'picocolors';
import { parseSource, resolveShorthand } from '../source-parser.ts';
import { cloneRepo, cleanupTempDir, GitCloneError } from '../git.ts';
import { discoverSkills, getSkillDisplayName } from '../skills.ts';
import { installSkillForAgent, sanitizeName, type InstallResult } from '../installer.ts';
import { detectInstalledAgents, getAgentConfig, agents, getUniversalAgents, getNonUniversalAgents } from '../agents.ts';
import { loadConfig } from '../config.ts';
import type { Skill, AgentConfig } from '../types.ts';

interface AddOptions {
  agent?: string[];
  global?: boolean;
  yes?: boolean;
  skill?: string[];
  source?: 'gitee' | 'github';
  copy?: boolean;
}

/**
 * 安装命令核心逻辑。
 *
 * 流程：
 * 1. 解析源 → 解析 shorthand → 克隆仓库
 * 2. 发现 skills → 选择要安装的 skill
 * 3. 检测已安装 agent → 选择目标 agent（通用 agent 始终包含）
 * 4. 选择安装范围（项目级 / 全局）
 * 5. 选择安装方式（symlink / copy）
 * 6. 安装 → 显示结果
 */
export async function runAdd(args: string[], options: AddOptions): Promise<void> {
  if (args.length === 0) {
    p.log.error('请提供 skill 源。例如：cn-skills add owner/repo');
    p.log.info('用法：cn-skills add <source> [--agent claude-code] [--global] [--yes] [--copy]');
    process.exit(1);
  }

  const config = await loadConfig();
  const sourceInput = args[0];

  // ── 1. 解析源 ──
  let parsed = parseSource(sourceInput);
  if (parsed.type === 'git' && parsed.url.includes('/')) {
    const priority = options.source ? [options.source] : config.sourcePriority;
    parsed = await resolveShorthand(parsed, priority);
  }

  const mirrorUrl =
    parsed.type === 'github' ? config.mirror.github
    : parsed.type === 'gitee' ? config.mirror.gitee
    : undefined;

  p.log.info(`源：${pc.cyan(parsed.url)} (${parsed.type})`);
  if (mirrorUrl && mirrorUrl !== parsed.url) {
    p.log.info(`镜像：${pc.dim(mirrorUrl)}`);
  }

  // ── 2. 克隆仓库 ──
  const spinner = p.spinner();
  spinner.start('正在克隆仓库...');

  let tempDir: string;
  try {
    tempDir = await cloneRepo(parsed.url, parsed.ref, mirrorUrl);
    spinner.stop('克隆完成');
  } catch (error) {
    spinner.stop('克隆失败');
    if (error instanceof GitCloneError) {
      p.log.error(error.message);
    } else {
      p.log.error(String(error));
    }
    process.exit(1);
  }

  // ── 3. 发现 skills ──
  let skills: Skill[];
  try {
    skills = await discoverSkills(tempDir, parsed.subpath);
  } catch (error) {
    p.log.error(`扫描 skills 失败：${error instanceof Error ? error.message : String(error)}`);
    await cleanupTempDir(tempDir);
    process.exit(1);
  }

  if (skills.length === 0) {
    p.log.warn('未找到任何 skill（SKILL.md）');
    await cleanupTempDir(tempDir);
    process.exit(0);
  }

  // ── 4. 选择要安装的 skill ──
  let selectedSkills: Skill[] = skills;
  if (options.skill && options.skill.length > 0) {
    selectedSkills = skills.filter((s) =>
      options.skill!.some(
        (name) => s.name.toLowerCase() === name.toLowerCase() ||
          getSkillDisplayName(s).toLowerCase() === name.toLowerCase()
      )
    );
    if (selectedSkills.length === 0) {
      p.log.warn('指定的 skill 名称未匹配到任何结果');
      await cleanupTempDir(tempDir);
      process.exit(0);
    }
  } else if (skills.length > 1 && !options.yes) {
    const choices = skills.map((s) => ({
      value: s.name,
      label: s.name,
      hint: s.description.slice(0, 60),
    }));
    const selected = await p.multiselect({
      message: '选择要安装的 skill',
      options: choices,
      required: false,
    });
    if (p.isCancel(selected) || selected.length === 0) {
      await cleanupTempDir(tempDir);
      process.exit(0);
    }
    selectedSkills = skills.filter((s) => selected.includes(s.name));
  }

  // ── 5. 检测已安装的 agent ──
  const installedAgents = await detectInstalledAgents();
  const universalAgents = getUniversalAgents();
  const nonUniversalAgents = getNonUniversalAgents();

  // 通用 agent 中已安装的
  const installedUniversal = universalAgents.filter((u) =>
    installedAgents.some((i) => i.name === u.name)
  );

  // 非通用 agent 中已安装的
  const installedNonUniversal = nonUniversalAgents.filter((n) =>
    installedAgents.some((i) => i.name === n.name)
  );

  // ── 6. 选择目标 agent ──
  let targetAgents: AgentConfig[];

  if (options.agent && options.agent.length > 0) {
    // 用户指定了 agent
    targetAgents = options.agent
      .map((name) => getAgentConfig(name))
      .filter((a): a is AgentConfig => a !== undefined);
    if (targetAgents.length === 0) {
      p.log.error('指定的 agent 未找到');
      await cleanupTempDir(tempDir);
      process.exit(1);
    }
  } else if (options.yes) {
    // 非交互模式：安装到所有已安装的 agent
    targetAgents = installedAgents.length > 0 ? installedAgents : [getAgentConfig('claude-code')!];
  } else {
    // 交互模式

    // 如果没有检测到任何 agent，显示全部列表
    if (installedAgents.length === 0) {
      const allChoices = agents.map((a) => ({
        value: a.name,
        label: a.displayName,
        hint: a.skillsDir,
      }));
      const selected = await p.multiselect({
        message: '选择要安装到的 agent',
        options: allChoices,
        required: false,
      });
      if (p.isCancel(selected) || selected.length === 0) {
        await cleanupTempDir(tempDir);
        process.exit(0);
      }
      targetAgents = agents.filter((a) => selected.includes(a.name));
    } else {
      // 显示已安装的 agent，通用 agent 锁定在顶部
      const lockedSection = installedUniversal.length > 0
        ? `\n  ── Universal (.agents/skills) ── always included ──\n${installedUniversal.map((u) => `    • ${u.displayName}`).join('\n')}\n`
        : '';

      if (lockedSection) {
        p.log.message(pc.dim(lockedSection));
      }

      const selectableChoices = installedNonUniversal.map((a) => ({
        value: a.name,
        label: a.displayName,
        hint: a.skillsDir,
      }));

      // 默认全选
      const defaultValues = installedNonUniversal.map((a) => a.name);

      const selected = await p.multiselect({
        message: '选择要复制/链接到的 agent',
        options: selectableChoices,
        required: false,
        initialValues: defaultValues,
      });

      if (p.isCancel(selected)) {
        await cleanupTempDir(tempDir);
        process.exit(0);
      }

      const selectedNonUniversal = installedNonUniversal.filter((a) => selected.includes(a.name));
      // 通用 agent 始终包含
      targetAgents = [...installedUniversal, ...selectedNonUniversal];

      if (targetAgents.length === 0) {
        targetAgents = installedUniversal.length > 0 ? installedUniversal : [getAgentConfig('claude-code')!];
      }
    }
  }

  // ── 7. 选择安装范围（项目级 / 全局） ──
  let isGlobal = options.global || false;
  if (!options.global && !options.yes) {
    const scopeChoice = await p.select({
      message: '安装范围',
      options: [
        { value: 'project', label: '项目级', hint: '安装到当前项目目录' },
        { value: 'global', label: '全局', hint: `安装到 ~/${'.agents/skills'}` },
      ],
      initialValue: 'project',
    });
    if (p.isCancel(scopeChoice)) {
      await cleanupTempDir(tempDir);
      process.exit(0);
    }
    isGlobal = scopeChoice === 'global';
  }

  // ── 8. 选择安装方式（symlink / copy） ──
  let installMode: 'symlink' | 'copy' = options.copy ? 'copy' : 'symlink';

  if (!options.copy && !options.yes) {
    // 检查是否有多个不同的目标目录
    const uniqueDirs = new Set(targetAgents.map((a) => a.skillsDir));
    if (uniqueDirs.size > 1) {
      const modeChoice = await p.select({
        message: '安装方式',
        options: [
          { value: 'symlink', label: 'Symlink（推荐）', hint: '单一数据源，更新方便' },
          { value: 'copy', label: '复制到所有 agent', hint: '每个 agent 独立副本' },
        ],
        initialValue: 'symlink',
      });
      if (p.isCancel(modeChoice)) {
        await cleanupTempDir(tempDir);
        process.exit(0);
      }
      installMode = modeChoice as 'symlink' | 'copy';
    } else {
      // 单一目标目录，直接复制
      installMode = 'copy';
    }
  }

  // ── 9. 显示安装摘要并确认 ──
  if (!options.yes) {
    const scopeLabel = isGlobal ? '全局' : '项目级';
    const modeLabel = installMode === 'symlink' ? 'Symlink' : '复制';
    const agentNames = targetAgents.map((a) => a.displayName).join(', ');

    console.log('');
    p.log.message(
      pc.bold('安装摘要') + '\n\n' +
      `  技能：${pc.cyan(selectedSkills.map((s) => s.name).join(', '))}\n` +
      `  范围：${scopeLabel}\n` +
      `  方式：${modeLabel}\n` +
      `  Agent：${agentNames}`
    );

    const confirm = await p.confirm({ message: '确认安装？', initialValue: true });
    if (p.isCancel(confirm) || !confirm) {
      await cleanupTempDir(tempDir);
      process.exit(0);
    }
  }

  // ── 10. 安装 ──
  const results: InstallResult[] = [];
  const cwd = process.cwd();

  for (const skill of selectedSkills) {
    for (const agent of targetAgents) {
      try {
        const result = await installSkillForAgent(skill, agent, isGlobal, installMode, cwd);
        results.push(result);

        if (result.skipped) {
          p.log.info(`⊘ ${pc.bold(skill.name)} → ${pc.dim(agent.displayName)} (跳过，agent 目录不存在)`);
        } else if (result.symlinkFailed) {
          p.log.warn(`⚠ ${pc.bold(skill.name)} → ${pc.dim(agent.displayName)} (symlink 失败，已复制)`);
        } else {
          const modeIcon = result.mode === 'symlink' ? '🔗' : '📄';
          p.log.success(`${modeIcon} ${pc.bold(skill.name)} → ${pc.dim(agent.displayName)}`);
        }
      } catch (error) {
        p.log.error(`✗ ${skill.name} → ${agent.displayName}：${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // ── 11. 清理 ──
  await cleanupTempDir(tempDir);

  // ── 12. 显示结果 ──
  if (results.length > 0) {
    console.log('');
    p.log.success(`安装完成！共安装 ${selectedSkills.length} 个 skill 到 ${targetAgents.length} 个 agent`);

    // 按 skill 分组显示
    for (const skill of selectedSkills) {
      const skillResults = results.filter((r) => r.skillName === sanitizeName(skill.name));
      if (skillResults.length === 0) continue;

      const canonicalPath = skillResults[0].canonicalPath;
      console.log(`\n  ${pc.bold(skill.name)}`);
      console.log(`    ${pc.dim(canonicalPath)}`);

      const universalResults = skillResults.filter((r) => targetAgents.find((a) => a.name === r.agentName)?.showInUniversalList);
      const symlinkResults = skillResults.filter((r) => r.mode === 'symlink' && !r.skipped && !targetAgents.find((a) => a.name === r.agentName)?.showInUniversalList);
      const copyResults = skillResults.filter((r) => r.mode === 'copy' && !r.skipped);
      const skippedResults = skillResults.filter((r) => r.skipped);

      if (universalResults.length > 0) {
        console.log(`    ${pc.green('universal:')} ${universalResults.map((r) => r.agentDisplayName).join(', ')}`);
      }
      if (symlinkResults.length > 0) {
        console.log(`    ${pc.cyan('symlinked:')} ${symlinkResults.map((r) => r.agentDisplayName).join(', ')}`);
      }
      if (copyResults.length > 0) {
        console.log(`    ${pc.yellow('copied:')} ${copyResults.map((r) => r.agentDisplayName).join(', ')}`);
      }
      if (skippedResults.length > 0) {
        console.log(`    ${pc.dim('skipped:')} ${skippedResults.map((r) => r.agentDisplayName).join(', ')}`);
      }
    }
    console.log('');
    p.log.message(pc.dim('提示：使用 skills 前请审查，它们以完整 agent 权限运行。'));
  }
}
