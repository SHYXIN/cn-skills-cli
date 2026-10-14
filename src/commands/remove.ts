import * as p from '@clack/prompts';
import pc from 'picocolors';
import { removeSkill } from '../installer.ts';
import { detectInstalledAgents, getAgentConfig } from '../agents.ts';
import { getCnSkillLockPath, type SkillLockFile } from '../skill-lock.ts';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { sanitizeName } from '../installer.ts';

interface RemoveOptions {
  agent?: string[];
  global?: boolean;
  yes?: boolean;
}

/**
 * 移除已安装的 skill。
 */
export async function runRemove(args: string[], options: RemoveOptions): Promise<void> {
  if (args.length === 0) {
    p.log.error('请提供要移除的 skill 名称');
    p.log.info('用法：cn-skills remove <skill-name> [--agent claude-code]');
    process.exit(1);
  }

  const skillName = args[0];

  // 确定目标 agent
  let targetAgents: { name: string; displayName: string }[];
  if (options.agent && options.agent.length > 0) {
    targetAgents = options.agent.map((name) => ({ name, displayName: name }));
  } else {
    const installed = await detectInstalledAgents();
    targetAgents = installed.map((a) => ({ name: a.name, displayName: a.displayName }));
  }

  if (targetAgents.length === 0) {
    p.log.error('未检测到任何 agent');
    process.exit(1);
  }

  // 确认
  if (!options.yes) {
    const confirm = await p.confirm({
      message: `确认移除 "${skillName}"？`,
      initialValue: false,
    });
    if (p.isCancel(confirm) || !confirm) {
      process.exit(0);
    }
  }

  // 执行移除
  let removed = 0;
  for (const agentInfo of targetAgents) {
    const agentConfig = getAgentConfig(agentInfo.name);
    if (!agentConfig) continue;

    const success = await removeSkill(skillName, agentConfig, options.global || false);
    if (success) {
      p.log.success(`✓ 已从 ${agentInfo.displayName} 移除 ${skillName}`);
      removed++;
    }
  }

  if (removed === 0) {
    p.log.warn(`未找到已安装的 "${skillName}"`);
  } else {
    p.log.success(`\n移除完成！共从 ${removed} 个 agent 移除了 ${skillName}`);
  }

  // 清理 lock 记录（cn-skills 自己的 lock；上游 npx skills 的 lock 不动，
  // 避免破坏 npx skills 自己的 update 流程）
  try {
    const name = sanitizeName(skillName);
    const lockPath = getCnSkillLockPath();
    const raw = readFileSync(lockPath, 'utf-8');
    const lock = JSON.parse(raw) as SkillLockFile;
    if (lock.skills && lock.skills[name]) {
      delete lock.skills[name];
      writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
      p.log.info(pc.dim(`已清理 lock 记录：${name}`));
    }
  } catch {
    // lock 不存在或损坏，忽略
  }
}
