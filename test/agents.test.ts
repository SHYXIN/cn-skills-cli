import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { homedir } from 'os';
import {
  agents,
  getAgentConfig,
  getUniversalAgents,
  getNonUniversalAgents,
} from '../src/agents.ts';

describe('agent 注册表', () => {
  it('应包含 codebuddy（回归：曾缺失导致 --agent codebuddy 被静默丢弃）', () => {
    const codebuddy = getAgentConfig('codebuddy');
    expect(codebuddy).toBeDefined();
    expect(codebuddy!.skillsDir).toBe('.codebuddy/skills');
    expect(codebuddy!.globalSkillsDir).toBe(join(homedir(), '.codebuddy/skills'));
  });

  it('应包含 workbuddy，且恒用复制模式', () => {
    const workbuddy = getAgentConfig('workbuddy');
    expect(workbuddy).toBeDefined();
    expect(workbuddy!.globalSkillsDir).toBe(join(homedir(), '.workbuddy/skills'));
    expect(workbuddy!.forceCopy).toBe(true);
  });

  it('应包含 hermes-agent', () => {
    expect(getAgentConfig('hermes-agent')).toBeDefined();
  });

  it('每个 agent 的 name 唯一', () => {
    const names = agents.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('每个 agent 都具备必填字段', () => {
    for (const a of agents) {
      expect(a.name).toBeTruthy();
      expect(a.displayName).toBeTruthy();
      expect(a.skillsDir).toBeTruthy();
      expect(typeof a.detectInstalled).toBe('function');
    }
  });

  it('通用 agent 的 skillsDir 均为 .agents/skills', () => {
    for (const a of getUniversalAgents()) {
      expect(a.skillsDir).toBe('.agents/skills');
    }
  });

  it('非通用 agent 的 skillsDir 均不为 .agents/skills', () => {
    for (const a of getNonUniversalAgents()) {
      expect(a.skillsDir).not.toBe('.agents/skills');
    }
  });

  it('非通用 + 所有 skillsDir=.agents/skills 的 agent 应覆盖全部', () => {
    const universalAll = agents.filter((a) => a.skillsDir === '.agents/skills');
    expect(getNonUniversalAgents().length + universalAll.length).toBe(agents.length);
  });

  it('getUniversalAgents 是「通用且未隐藏」的子集', () => {
    for (const a of getUniversalAgents()) {
      expect(a.skillsDir).toBe('.agents/skills');
      expect(a.showInUniversalList).not.toBe(false);
    }
  });
});
