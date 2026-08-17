import { readdir, readFile, stat } from 'fs/promises';
import { join, basename, dirname, resolve, normalize, sep } from 'path';
import { parseFrontmatter } from './frontmatter.ts';
import { SKIP_DIRS, SKILL_SEARCH_DIRS } from './constants.ts';
import type { Skill } from './types.ts';

/**
 * Check if a SKILL.md file exists in the given directory.
 */
async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    const skillPath = join(dir, 'SKILL.md');
    const stats = await stat(skillPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Parse a SKILL.md file and return a Skill object.
 */
export async function parseSkillMd(skillMdPath: string): Promise<Skill | null> {
  try {
    const content = await readFile(skillMdPath, 'utf-8');
    const { data } = parseFrontmatter(content);

    if (!data.name || !data.description) return null;
    if (typeof data.name !== 'string' || typeof data.description !== 'string') return null;

    return {
      name: data.name,
      description: data.description,
      path: dirname(skillMdPath),
      rawContent: content,
      metadata: data.metadata as Record<string, unknown> | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Validate that a resolved subpath stays within the base directory.
 */
export function isSubpathSafe(basePath: string, subpath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(join(basePath, subpath)));
  return (
    normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase
  );
}

/**
 * Recursively find directories containing SKILL.md files.
 */
async function findSkillDirs(dir: string, depth = 0, maxDepth = 5): Promise<string[]> {
  if (depth > maxDepth) return [];

  try {
    const [hasSkill, entries] = await Promise.all([
      hasSkillMd(dir),
      readdir(dir, { withFileTypes: true }).catch(() => [] as any[]),
    ]);

    const currentDir = hasSkill ? [dir] : [];

    const subDirResults = await Promise.all(
      entries
        .filter((entry: any) => entry.isDirectory() && !SKIP_DIRS.includes(entry.name))
        .map((entry: any) => findSkillDirs(join(dir, entry.name), depth + 1, maxDepth))
    );

    return [...currentDir, ...subDirResults.flat()];
  } catch {
    return [];
  }
}

/**
 * Discover skills in a directory, searching standard locations first.
 */
export async function discoverSkills(
  basePath: string,
  subpath?: string
): Promise<Skill[]> {
  const skills: Skill[] = [];
  const seenNames = new Set<string>();

  if (subpath && !isSubpathSafe(basePath, subpath)) {
    throw new Error(
      `Invalid subpath: "${subpath}" resolves outside the repository directory.`
    );
  }

  const searchPath = subpath ? join(basePath, subpath) : basePath;

  // 如果直接指向一个 skill
  if (await hasSkillMd(searchPath)) {
    const skill = await parseSkillMd(join(searchPath, 'SKILL.md'));
    if (skill) return [skill];
  }

  // 搜索标准 skill 目录
  for (const dir of SKILL_SEARCH_DIRS) {
    const fullDir = join(searchPath, dir);
    try {
      const entries = await readdir(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = join(fullDir, entry.name);
          if (await hasSkillMd(skillDir)) {
            const skill = await parseSkillMd(join(skillDir, 'SKILL.md'));
            if (skill && !seenNames.has(skill.name)) {
              skills.push(skill);
              seenNames.add(skill.name);
            }
          }
        }
      }
    } catch {
      // 目录不存在，跳过
    }
  }

  // 递归搜索兜底：始终运行，补齐标准目录一层扫描遗漏的嵌套 skill（bucket 结构）。
  // 注意：不能用 `if (skills.length === 0)` 门控——一旦一层扫描命中任意 skill，
  // 嵌套在 bucket 里的其余 skill 就会被永久漏掉。
  const allSkillDirs = await findSkillDirs(searchPath);
  for (const skillDir of allSkillDirs) {
    const skill = await parseSkillMd(join(skillDir, 'SKILL.md'));
    if (skill && !seenNames.has(skill.name)) {
      skills.push(skill);
      seenNames.add(skill.name);
    }
  }

  return skills;
}

/**
 * 返回 skill 所属的类别（bucket）——取其父目录名。
 * 用于安装时的分组展示（如 teaching / productivity / skills）。
 */
export function getSkillCategory(skill: Skill): string {
  return basename(dirname(skill.path));
}

export function getSkillDisplayName(skill: Skill): string {
  return skill.name || basename(skill.path);
}
