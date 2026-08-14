import { symlink, unlink, mkdir, readdir, readFile, writeFile, lstat, rm, realpath } from 'fs/promises';
import { join, basename, dirname, resolve, normalize, sep, relative } from 'path';
import { homedir, tmpdir, platform } from 'os';
import { AGENTS_DIR, SKILLS_SUBDIR } from './constants.ts';
import type { AgentConfig, Skill } from './types.ts';

export function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isPathSafe(targetPath: string, basePath: string): boolean {
  const normalizedTarget = normalize(resolve(targetPath));
  const normalizedBase = normalize(resolve(basePath));
  return normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase;
}

/**
 * 创建符号链接。
 * Windows 使用 junction（不需要管理员权限），Unix 使用标准 symlink。
 */
async function createSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    await mkdir(dirname(linkPath), { recursive: true });

    // 移除已存在的 symlink/文件/目录
    try {
      const stats = await lstat(linkPath);
      if (stats.isSymbolicLink() || stats.isFile() || stats.isDirectory()) {
        await unlink(linkPath);
      }
    } catch {
      // 不存在
    }

    // 使用相对路径创建 symlink
    const relativePath = relative(dirname(linkPath), target);
    const symlinkType = platform() === 'win32' ? 'junction' : undefined;
    await symlink(relativePath, linkPath, symlinkType);
    return true;
  } catch {
    return false;
  }
}

/**
 * 递归复制目录。
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '__pycache__') continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      const content = await readFile(srcPath);
      await writeFile(destPath, content);
    }
  }
}

/**
 * 获取通用 skills 目录（canonical 位置）。
 * 所有 skill 先安装到这里，其他 agent 通过 symlink 指向这里。
 */
function getCanonicalSkillsDir(isGlobal: boolean, cwd: string): string {
  if (isGlobal) {
    return join(homedir(), AGENTS_DIR, SKILLS_SUBDIR);
  }
  return join(cwd, AGENTS_DIR, SKILLS_SUBDIR);
}

/**
 * 判断 agent 是否是通用 agent（直接使用 .agents/skills）。
 */
function isUniversalAgent(agent: AgentConfig): boolean {
  return agent.showInUniversalList === true || agent.skillsDir === '.agents/skills';
}

/**
 * 安装结果。
 */
export interface InstallResult {
  skillName: string;
  agentName: string;
  agentDisplayName: string;
  path: string;
  canonicalPath: string;
  mode: 'symlink' | 'copy';
  skipped: boolean;
  symlinkFailed: boolean;
}

/**
 * 安装单个 skill 到指定 agent。
 *
 * 流程：
 * 1. 复制 skill 文件到通用目录（.agents/skills/<name>）
 * 2. 如果是通用 agent，直接返回（已经在正确位置）
 * 3. 如果是非通用 agent，创建 symlink 从 agent 目录指向通用目录
 * 4. 如果 symlink 失败，fallback 到 copy
 */
export async function installSkillForAgent(
  skill: Skill,
  agent: AgentConfig,
  isGlobal: boolean,
  mode: 'symlink' | 'copy',
  cwd?: string
): Promise<InstallResult> {
  const workDir = cwd || process.cwd();
  const skillName = sanitizeName(skill.name);
  const canonicalDir = join(getCanonicalSkillsDir(isGlobal, workDir), skillName);

  // 安全检查
  const canonicalBase = getCanonicalSkillsDir(isGlobal, workDir);
  if (!isPathSafe(canonicalDir, canonicalBase)) {
    throw new Error(`路径遍历检测：${canonicalDir}`);
  }

  // ── 复制模式：直接复制到 agent 目录 ──
  if (mode === 'copy') {
    const agentBase = isGlobal && agent.globalSkillsDir
      ? agent.globalSkillsDir
      : join(workDir, agent.skillsDir);
    const agentDir = join(agentBase, skillName);
    await copyDirectory(skill.path, agentDir);
    return {
      skillName,
      agentName: agent.name,
      agentDisplayName: agent.displayName,
      path: agentDir,
      canonicalPath: canonicalDir,
      mode: 'copy',
      skipped: false,
      symlinkFailed: false,
    };
  }

  // ── Symlink 模式 ──

  // 1. 复制到通用目录
  await copyDirectory(skill.path, canonicalDir);

  // 2. 通用 agent 直接返回（已经在正确位置）
  if (isUniversalAgent(agent)) {
    return {
      skillName,
      agentName: agent.name,
      agentDisplayName: agent.displayName,
      path: canonicalDir,
      canonicalPath: canonicalDir,
      mode: 'symlink',
      skipped: false,
      symlinkFailed: false,
    };
  }

  // 3. 非通用 agent：创建 symlink
  const agentBase = isGlobal && agent.globalSkillsDir
    ? agent.globalSkillsDir
    : join(workDir, agent.skillsDir);
  const agentDir = join(agentBase, skillName);

  // 检查 agent 配置目录是否存在（项目级）
  if (!isGlobal) {
    const agentRootDir = join(workDir, agent.skillsDir.split('/')[0]);
    if (!agentRootDir || !await dirExists(agentRootDir)) {
      return {
        skillName,
        agentName: agent.name,
        agentDisplayName: agent.displayName,
        path: canonicalDir,
        canonicalPath: canonicalDir,
        mode: 'symlink',
        skipped: true, // agent 目录不存在，跳过 symlink
        symlinkFailed: false,
      };
    }
  }

  // 创建 symlink
  const symlinkCreated = await createSymlink(canonicalDir, agentDir);
  if (!symlinkCreated) {
    // symlink 失败，fallback 到 copy
    await copyDirectory(skill.path, agentDir);
    return {
      skillName,
      agentName: agent.name,
      agentDisplayName: agent.displayName,
      path: agentDir,
      canonicalPath: canonicalDir,
      mode: 'symlink',
      skipped: false,
      symlinkFailed: true,
    };
  }

  return {
    skillName,
    agentName: agent.name,
    agentDisplayName: agent.displayName,
    path: agentDir,
    canonicalPath: canonicalDir,
    mode: 'symlink',
    skipped: false,
    symlinkFailed: false,
  };
}

/**
 * 列出所有已安装的 skills。
 */
export async function listInstalledSkills(): Promise<
  { name: string; path: string; agent: string; scope: string }[]
> {
  const results: { name: string; path: string; agent: string; scope: string }[] = [];
  const cwd = process.cwd();

  // 通用目录（项目级）
  const projectUniversal = join(cwd, AGENTS_DIR, SKILLS_SUBDIR);
  try {
    const entries = await readdir(projectUniversal, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        results.push({ name: entry.name, path: join(projectUniversal, entry.name), agent: 'universal', scope: '项目' });
      }
    }
  } catch {}

  // 通用目录（全局级）
  const globalUniversal = join(homedir(), AGENTS_DIR, SKILLS_SUBDIR);
  try {
    const entries = await readdir(globalUniversal, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        results.push({ name: entry.name, path: join(globalUniversal, entry.name), agent: 'universal', scope: '全局' });
      }
    }
  } catch {}

  // 各 agent 目录
  for (const agent of await import('./agents.ts').then((m) => m.agents)) {
    // 项目级
    const projectDir = join(cwd, agent.skillsDir);
    try {
      const entries = await readdir(projectDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          results.push({ name: entry.name, path: join(projectDir, entry.name), agent: agent.displayName, scope: '项目' });
        }
      }
    } catch {}

    // 全局级
    if (agent.globalSkillsDir) {
      try {
        const entries = await readdir(agent.globalSkillsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() || entry.isSymbolicLink()) {
            results.push({ name: entry.name, path: join(agent.globalSkillsDir, entry.name), agent: agent.displayName, scope: '全局' });
          }
        }
      } catch {}
    }
  }

  return results;
}

/**
 * 移除已安装的 skill。
 */
export async function removeSkill(name: string, agent: AgentConfig, isGlobal: boolean, cwd?: string): Promise<boolean> {
  const workDir = cwd || process.cwd();
  const skillName = sanitizeName(name);

  // 移除 agent 目录中的 skill
  const agentBase = isGlobal && agent.globalSkillsDir
    ? agent.globalSkillsDir
    : join(workDir, agent.skillsDir);
  const agentDir = join(agentBase, skillName);

  try {
    await rm(agentDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}
