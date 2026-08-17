import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { discoverSkills, getSkillCategory } from '../src/skills.ts';

let tmp: string;

async function writeSkill(base: string, relPath: string, name: string, description: string): Promise<void> {
  const dir = join(base, relPath);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n`);
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'cn-skills-discover-'));
  // 精确复现 SHYXIN/skills 的真实结构：
  // - skill-curator 直接在 skills/ 下（一层扫描能找到它）
  // - 其余技能在 skills/skills/<bucket>/<skill>/ 多层里（一层扫描漏掉）
  await writeSkill(tmp, 'skills/skill-curator', 'skill-curator', '技能整理工具');
  await writeSkill(tmp, 'skills/skills/teaching/socratic-tutor', 'socratic-tutor', '自适应教学技能');
  await writeSkill(tmp, 'skills/skills/productivity/anysearch', 'anysearch', '实时搜索引擎');
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('discoverSkills', () => {
  it('递归发现 bucket 下的所有 skill，而不只是一层', async () => {
    const skills = await discoverSkills(tmp);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(['anysearch', 'skill-curator', 'socratic-tutor']);
  });

  it('按子路径发现时也能递归', async () => {
    const skills = await discoverSkills(tmp, 'skills/skills/teaching');
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(['socratic-tutor']);
  });
});

describe('getSkillCategory', () => {
  it('返回 skill 所在 bucket（父目录名）', async () => {
    const skills = await discoverSkills(tmp);
    const teaching = skills.find((s) => s.name === 'socratic-tutor')!;
    const curator = skills.find((s) => s.name === 'skill-curator')!;
    expect(getSkillCategory(teaching)).toBe('teaching');
    // skill-curator 直接在 skills/ 下，父目录即 skills 容器
    expect(getSkillCategory(curator)).toBe('skills');
  });
});
