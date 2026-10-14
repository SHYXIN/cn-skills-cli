import { describe, it, expect } from 'vitest';
import { parseCliArgs, parseAgentList } from '../src/args.ts';

describe('parseAgentList', () => {
  it('应解析逗号分隔（Git Bash / cmd 风格）', () => {
    expect(parseAgentList('codebuddy,claude-code,codex,workbuddy')).toEqual([
      'codebuddy',
      'claude-code',
      'codex',
      'workbuddy',
    ]);
  });

  it('应解析 PowerShell 数组被拼接成的单个空格参数', () => {
    // PowerShell: --agent a,b,c 传给 node 时变成 "a b c" 一个参数
    expect(parseAgentList('codebuddy claude-code codex workbuddy')).toEqual([
      'codebuddy',
      'claude-code',
      'codex',
      'workbuddy',
    ]);
  });

  it('应解析逗号+空格混排', () => {
    expect(parseAgentList('codebuddy, claude-code codex,workbuddy')).toEqual([
      'codebuddy',
      'claude-code',
      'codex',
      'workbuddy',
    ]);
  });

  it('应解析变长多参数（--agent a b c）', () => {
    expect(parseAgentList(['codebuddy', 'claude-code'])).toEqual(['codebuddy', 'claude-code']);
  });

  it('布尔 true（--agent 后无值）返回空数组', () => {
    expect(parseAgentList(true)).toEqual([]);
    expect(parseAgentList(undefined)).toEqual([]);
  });

  it('应去重', () => {
    expect(parseAgentList('codebuddy,codebuddy')).toEqual(['codebuddy']);
  });
});

describe('parseCliArgs', () => {
  it('变长选项 --agent 收集后续连续非 flag 参数', () => {
    const r = parseCliArgs(['node', 'cli', 'add', 'owner/repo', '--agent', 'codebuddy', 'codex', '--global']);
    expect(r.command).toBe('add');
    expect(r.positional).toEqual(['owner/repo']);
    expect(r.options.agent).toEqual(['codebuddy', 'codex']);
    expect(r.options.global).toBe(true);
  });

  it('普通选项仍取单值', () => {
    const r = parseCliArgs(['node', 'cli', 'add', 'repo', '--source', 'gitee']);
    expect(r.options.source).toBe('gitee');
  });

  it('--agent 后无值时为 true', () => {
    const r = parseCliArgs(['node', 'cli', 'add', 'repo', '--agent']);
    expect(r.options.agent).toBe(true);
  });
});
