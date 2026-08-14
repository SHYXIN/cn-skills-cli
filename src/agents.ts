import { access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { AgentConfig } from './types.ts';

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Agent 注册表 — 支持 50+ 个 AI 编码 agent。
 * 每个 agent 有项目级 skills 目录和可选的全局目录。
 *
 * showInUniversalList: 是否在通用列表中显示（锁定在顶部，不可取消选择）
 */
export const agents: AgentConfig[] = [
  // ── 通用 agent（直接使用 .agents/skills） ──
  { name: 'amp', displayName: 'Amp', skillsDir: '.agents/skills', globalSkillsDir: join(homedir(), '.agents', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.agents')), showInUniversalList: true },
  { name: 'antigravity', displayName: 'Antigravity', skillsDir: '.agents/skills', globalSkillsDir: join(homedir(), '.agents', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.agents')), showInUniversalList: true },
  { name: 'codex', displayName: 'Codex', skillsDir: '.agents/skills', globalSkillsDir: join(homedir(), '.agents', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.codex')), showInUniversalList: true },
  { name: 'gemini-cli', displayName: 'Gemini CLI', skillsDir: '.agents/skills', globalSkillsDir: join(homedir(), '.agents', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.gemini')), showInUniversalList: true },
  { name: 'github-copilot', displayName: 'GitHub Copilot', skillsDir: '.agents/skills', globalSkillsDir: join(homedir(), '.agents', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.github')), showInUniversalList: true },
  { name: 'kimi-cli', displayName: 'Kimi Code CLI', skillsDir: '.agents/skills', globalSkillsDir: join(homedir(), '.agents', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.kimi')), showInUniversalList: true },
  { name: 'opencode', displayName: 'OpenCode', skillsDir: '.agents/skills', globalSkillsDir: join(homedir(), '.agents', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.opencode')), showInUniversalList: true },
  { name: 'warp', displayName: 'Warp', skillsDir: '.agents/skills', globalSkillsDir: join(homedir(), '.agents', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.warp')), showInUniversalList: true },
  { name: 'deepagents', displayName: 'Deep Agents', skillsDir: '.agents/skills', globalSkillsDir: join(homedir(), '.agents', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.deepagents')), showInUniversalList: true },
  { name: 'firebender', displayName: 'Firebender', skillsDir: '.agents/skills', globalSkillsDir: join(homedir(), '.agents', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.firebender')), showInUniversalList: true },

  // ── 非通用 agent（需要 symlink/copy） ──
  { name: 'claude-code', displayName: 'Claude Code', skillsDir: '.claude/skills', globalSkillsDir: join(homedir(), '.claude', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.claude')) },
  { name: 'cursor', displayName: 'Cursor', skillsDir: '.cursor/skills', globalSkillsDir: join(homedir(), '.cursor', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.cursor')) },
  { name: 'copilot', displayName: 'GitHub Copilot (Workspace)', skillsDir: '.github/skills', globalSkillsDir: undefined, detectInstalled: async () => dirExists(join(process.cwd(), '.github')) },
  { name: 'windsurf', displayName: 'Windsurf', skillsDir: '.windsurf/skills', globalSkillsDir: join(homedir(), '.windsurf', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.windsurf')) },
  { name: 'continue', displayName: 'Continue', skillsDir: '.continue/skills', globalSkillsDir: join(homedir(), '.continue', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.continue')) },
  { name: 'cline', displayName: 'Cline', skillsDir: '.cline/skills', globalSkillsDir: join(homedir(), '.cline', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.cline')) },
  { name: 'openhands', displayName: 'OpenHands', skillsDir: '.openhands/skills', globalSkillsDir: join(homedir(), '.openhands', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.openhands')) },
  { name: 'goose', displayName: 'Goose', skillsDir: '.goose/skills', globalSkillsDir: join(homedir(), '.goose', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.goose')) },
  { name: 'kiro-cli', displayName: 'Kiro CLI', skillsDir: '.kiro/skills', globalSkillsDir: join(homedir(), '.kiro', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.kiro')) },
  { name: 'qoder', displayName: 'Qoder', skillsDir: '.qoder/skills', globalSkillsDir: join(homedir(), '.qoder', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.qoder')) },
  { name: 'tabnine-cli', displayName: 'Tabnine CLI', skillsDir: '.tabnine/skills', globalSkillsDir: join(homedir(), '.tabnine', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.tabnine')) },
  { name: 'openclaw', displayName: 'OpenClaw', skillsDir: '.openclaw/skills', globalSkillsDir: join(homedir(), '.openclaw', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.openclaw')) },
  { name: 'trae-cn', displayName: 'Trae CN', skillsDir: '.trae/skills', globalSkillsDir: join(homedir(), '.trae', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.trae')) },
  { name: 'dexto', displayName: 'Dexto', skillsDir: '.dexto/skills', globalSkillsDir: join(homedir(), '.dexto', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.dexto')) },

  // ── 兼容性别名 ──
  { name: 'universal', displayName: 'Universal (.agents)', skillsDir: '.agents/skills', globalSkillsDir: join(homedir(), '.agents', 'skills'), detectInstalled: async () => dirExists(join(process.cwd(), '.agents')), showInUniversalList: true },
];

/** 获取通用 agent（始终包含在 .agents/skills 中） */
export function getUniversalAgents(): AgentConfig[] {
  return agents.filter((a) => a.showInUniversalList);
}

/** 获取非通用 agent */
export function getNonUniversalAgents(): AgentConfig[] {
  return agents.filter((a) => !a.showInUniversalList);
}

/** 检测当前项目中已安装的 agent */
export async function detectInstalledAgents(): Promise<AgentConfig[]> {
  const results = await Promise.all(
    agents.map(async (agent) => ({
      agent,
      installed: await agent.detectInstalled(),
    }))
  );
  return results.filter((r) => r.installed).map((r) => r.agent);
}

/** 根据名称获取 agent 配置 */
export function getAgentConfig(name: string): AgentConfig | undefined {
  return agents.find((a) => a.name === name);
}
