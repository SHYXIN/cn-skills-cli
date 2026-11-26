import { join } from 'path';
import { homedir } from 'os';

export const AGENTS_DIR = '.agents';
export const SKILLS_SUBDIR = 'skills';
export const UNIVERSAL_SKILLS_DIR = '.agents/skills';

export const CONFIG_DIR = join(homedir(), '.cn-skills');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export const CLONE_TIMEOUT_MS = 300_000; // 5 minutes

/** 稀疏尝试的单候选预算：正常 6~72s 即完成，超时早断、快速换候选（整仓克隆仍用 CLONE_TIMEOUT_MS） */
export const SPARSE_ATTEMPT_TIMEOUT_MS = 120_000;

export const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '__pycache__'];

/** Standard skill search directories (same as npx skills) */
export const SKILL_SEARCH_DIRS = [
  'skills',
  'skills/.curated',
  'skills/.experimental',
  'skills/.system',
  '.agents/skills',
  '.claude/skills',
  '.cline/skills',
  '.codebuddy/skills',
  '.codex/skills',
  '.commandcode/skills',
  '.continue/skills',
  '.github/skills',
  '.goose/skills',
  '.iflow/skills',
  '.junie/skills',
  '.kilocode/skills',
  '.kiro/skills',
  '.mux/skills',
  '.neovate/skills',
  '.opencode/skills',
  '.openhands/skills',
  '.pi/skills',
  '.qoder/skills',
  '.roo/skills',
  '.trae/skills',
  '.windsurf/skills',
  '.zencoder/skills',
];
