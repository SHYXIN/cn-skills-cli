import { describe, it, expect } from 'vitest';
import { skillDirsFromPaths } from '../src/sparse.ts';

describe('skillDirsFromPaths', () => {
  it('提取所有 SKILL.md 的父目录', () => {
    const dirs = skillDirsFromPaths([
      'skills/a/SKILL.md',
      'skills/b/SKILL.md',
      '.agents/skills/dsh-doc/SKILL.md',
      'README.md',
      'docs/guide.md',
    ]);
    expect(dirs).toEqual(['skills/a', 'skills/b', '.agents/skills/dsh-doc']);
  });

  it('仓库根的 SKILL.md 不登记（cone 模式恒检出根目录文件）', () => {
    const dirs = skillDirsFromPaths(['SKILL.md', 'sub/SKILL.md']);
    expect(dirs).toEqual(['sub']);
  });

  it('大小写敏感：badge-skill.md 不是 SKILL.md（Windows 实测教训）', () => {
    const dirs = skillDirsFromPaths([
      'skills/x/badge-skill.md',
      'skills/x/SKILL.md',
      '.agents/notes/archived/feature/2026-08-06-bundled-dsh-badge-skill.md',
    ]);
    expect(dirs).toEqual(['skills/x']);
  });

  it('子路径结尾之外的相似名不匹配', () => {
    const dirs = skillDirsFromPaths(['skills/a/my-skill.md']);
    expect(dirs).toEqual([]);
  });

  it('subpath 过滤：仅保留子路径之内（含子路径根本身）的目录', () => {
    const dirs = skillDirsFromPaths(
      ['skills/a/SKILL.md', 'other/b/SKILL.md', 'skills/SKILL.md', 'SKILL.md'],
      'skills'
    );
    expect(dirs).toEqual(['skills/a', 'skills']);
  });

  it('同名目录去重', () => {
    const dirs = skillDirsFromPaths(['skills/a/SKILL.md', 'skills/a/SKILL.md']);
    expect(dirs).toEqual(['skills/a']);
  });

  it('空输入返回空清单', () => {
    expect(skillDirsFromPaths([])).toEqual([]);
  });
});
