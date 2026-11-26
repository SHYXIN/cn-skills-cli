import { describe, it, expect } from 'vitest';
import { applyProxy, sparseCloneArgs, GitCloneError } from '../src/git.ts';

describe('applyProxy', () => {
  it('前缀式代理：整 URL 前置', () => {
    expect(applyProxy('https://github.com/o/r', 'https://gh-proxy.org')).toBe(
      'https://gh-proxy.org/https://github.com/o/r'
    );
  });

  it('gitclone.com 路径式：域名替换为路径', () => {
    expect(applyProxy('https://github.com/o/r', 'https://gitclone.com')).toBe(
      'https://gitclone.com/github.com/o/r'
    );
  });
});

describe('sparseCloneArgs', () => {
  it('携带 partial clone 与稀疏检出的全部标志', () => {
    const args = sparseCloneArgs('https://github.com/o/r', undefined);
    expect(args).toContain('--depth');
    expect(args).toContain('--no-recurse-submodules');
    expect(args).toContain('--filter=blob:none');
    expect(args).toContain('--sparse');
    expect(args[args.length - 1]).toBe('https://github.com/o/r');
    expect(args).not.toContain('--branch');
  });

  it('指定 ref 时插入 --branch', () => {
    const args = sparseCloneArgs('https://github.com/o/r', 'dev');
    const idx = args.indexOf('--branch');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('dev');
  });
});

describe('GitCloneError', () => {
  it('保留 url 与分类标记', () => {
    const err = new GitCloneError('boom', 'https://github.com/o/r', true, false);
    expect(err.url).toBe('https://github.com/o/r');
    expect(err.isTimeout).toBe(true);
    expect(err.isAuthError).toBe(false);
    expect(err instanceof Error).toBe(true);
  });
});
