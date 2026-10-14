import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface SkillLockEntry {
  /** 安装来源，如 "SHYXIN/skills" 或完整 URL / 本地路径 */
  source: string;
  sourceType?: string;
  /** 仓库内 SKILL.md 相对路径，如 "skills/teaching/socratic-tutor/SKILL.md" */
  skillPath?: string;
  computedHash?: string;
}

export interface SkillLockFile {
  version: number;
  skills: Record<string, SkillLockEntry>;
}

/** cn-skills 自己的 lock（add 时写入） */
export function getCnSkillLockPath(): string {
  return join(homedir(), '.cn-skills', 'skills-lock.json');
}

/** 上游 npx skills 的 lock（读取兼容，让 npx 装的技能也能 update） */
export function getUpstreamSkillLockPath(): string {
  return join(homedir(), 'skills-lock.json');
}

function readLockFile(path: string): Record<string, SkillLockEntry> {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as SkillLockFile;
    if (raw && typeof raw.skills === 'object' && raw.skills !== null) return raw.skills;
  } catch {
    // 不存在或损坏
  }
  return {};
}

/** 合并视图：cn-skills lock 优先，上游 npx skills lock 兜底 */
export function readMergedLock(
  cnLockPath?: string,
  upstreamLockPath?: string
): Record<string, SkillLockEntry> {
  const upstream = readLockFile(upstreamLockPath ?? getUpstreamSkillLockPath());
  const ours = readLockFile(cnLockPath ?? getCnSkillLockPath());
  return { ...upstream, ...ours };
}

/** 记录/更新一条安装记录（供 update 使用） */
export function writeLockEntry(
  name: string,
  entry: SkillLockEntry,
  cnLockPath?: string
): void {
  const path = cnLockPath ?? getCnSkillLockPath();
  let skills: Record<string, SkillLockEntry> = {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as SkillLockFile;
    if (raw && typeof raw.skills === 'object' && raw.skills !== null) skills = raw.skills;
  } catch {
    // 首次写入
  }
  skills[name] = entry;
  const lock: SkillLockFile = { version: 1, skills };
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(lock, null, 2) + '\n');
}
