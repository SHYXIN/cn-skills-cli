import type { ParsedSource } from './types.ts';

/**
 * Hardcoded source aliases — maps shorthand names to actual repos.
 * Users can also use gitee:owner/repo or github:owner/repo prefixes.
 */
const SOURCE_ALIASES: Record<string, string> = {
  // 流行的中国 skill 仓库：shorthand → 显式 Gitee 源，国内免翻墙
  'SHYXIN/skills': 'gitee:theshyxin/skills',
  'mattpocock/skills': 'gitee:theshyxin/matt-skills',
  // 公司 GitLab skill 仓库：deepexi 同事一键安装（默认 develop 分支）
  'deepexi/skills': 'https://gitlab.deepexi.com/deepsense/skills#develop',
};

/**
 * 已知 GitLab 实例 host。除 gitlab.com 外，可通过配置 `gitlabHosts` 注册公司私有实例
 * （如 gitlab.deepexi.com），使其 HTTPS/SSH URL 被识别为 gitlab 源并支持 /-/tree/ 子路径。
 */
const KNOWN_GITLAB_HOSTS = new Set(['gitlab.com', 'gitlab.deepexi.com']);

/**
 * 供调用方在加载配置后注册额外的 GitLab host（幂等）。
 */
export function registerGitlabHosts(hosts: string[]): void {
  for (const h of hosts) {
    const host = h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (host) KNOWN_GITLAB_HOSTS.add(host);
  }
}

function isKnownGitlabHost(host: string): boolean {
  return KNOWN_GITLAB_HOSTS.has(host.toLowerCase());
}

/** 构造匹配已知 GitLab host 的 URL 正则（支持子组路径 + /-/tree/branch/subpath） */
function gitlabUrlRegex(): RegExp {
  const hosts = [...KNOWN_GITLAB_HOSTS].map((h) => h.replace(/\./g, '\\.')).join('|');
  return new RegExp(`^https?:\\/\\/(?:${hosts})\\/(.+?)\\/([^/]+?)(?:\\/-\\/tree\\/([^/]+)(?:\\/(.+))?)?$`);
}

function isLocalPath(input: string): boolean {
  return (
    input.startsWith('/') ||
    input.startsWith('./') ||
    input.startsWith('../') ||
    input.startsWith('~') ||
    /^[a-zA-Z]:[\\/]/.test(input) ||
    input === '.' ||
    input === '..'
  );
}

function sanitizeSubpath(subpath: string): string | undefined {
  const cleaned = subpath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (cleaned.includes('..') || cleaned.includes('//')) return undefined;
  return cleaned || undefined;
}

function looksLikeGitSource(input: string): boolean {
  return (
    isLocalPath(input) ||
    input.includes('://') ||
    input.includes('@') ||
    input.includes('/') ||
    input.endsWith('.git')
  );
}

/**
 * Parse a source string into a structured ParsedSource.
 *
 * Supported formats:
 * - Local: /path, ./path, ../path, C:\path, ~, ., ..
 * - Gitee: https://gitee.com/owner/repo, gitee:owner/repo
 * - GitHub: https://github.com/owner/repo, github:owner/repo
 * - GitLab: https://gitlab.com/owner/repo, gitlab:owner/repo
 * - Shorthand: owner/repo (resolved later based on config priority)
 * - Git SSH: git@host:owner/repo.git
 * - Well-known: any other HTTP(S) URL
 * - Fragment refs: input#branch@skill-name
 */
export function parseSource(input: string): ParsedSource {
  // 提取片段引用（#branch@skill 或 #branch）
  let ref: string | undefined;
  let skillFilter: string | undefined;
  let cleanInput = input;

  const hashIdx = input.indexOf('#');
  if (hashIdx !== -1 && looksLikeGitSource(input)) {
    const fragment = input.slice(hashIdx + 1);
    cleanInput = input.slice(0, hashIdx);

    const atIdx = fragment.indexOf('@');
    if (atIdx !== -1) {
      ref = decodeURIComponent(fragment.slice(0, atIdx));
      skillFilter = decodeURIComponent(fragment.slice(atIdx + 1));
    } else {
      ref = decodeURIComponent(fragment);
    }
  }

  // 先检查别名
  const alias = SOURCE_ALIASES[cleanInput];
  if (alias) {
    // 别名目标可自带默认 ref（如 #develop）；用户显式指定的 ref 优先
    const aliasHashIdx = alias.indexOf('#');
    const aliasBase = aliasHashIdx !== -1 ? alias.slice(0, aliasHashIdx) : alias;
    const aliasRef = aliasHashIdx !== -1 ? alias.slice(aliasHashIdx + 1) : undefined;
    const mergedRef = ref || aliasRef;
    return parseSource(
      aliasBase + (mergedRef ? `#${mergedRef}` : '') + (skillFilter ? `@${skillFilter}` : '')
    );
  }

  // 本地路径
  if (isLocalPath(cleanInput)) {
    return { type: 'local', url: cleanInput, localPath: cleanInput, ref, skillFilter };
  }

  // gitee: 前缀
  if (cleanInput.startsWith('gitee:')) {
    const rest = cleanInput.slice(6);
    const parts = rest.split('/');
    if (parts.length >= 2) {
      const subpathParts = parts.slice(2).filter(Boolean);
      const subpath = subpathParts.length > 0 ? sanitizeSubpath(subpathParts.join('/')) : undefined;
      return {
        type: 'gitee',
        url: `https://gitee.com/${parts[0]}/${parts[1]}`,
        subpath,
        ref,
        skillFilter,
      };
    }
  }

  // github: 前缀
  if (cleanInput.startsWith('github:')) {
    const rest = cleanInput.slice(7);
    const parts = rest.split('/');
    if (parts.length >= 2) {
      const subpathParts = parts.slice(2).filter(Boolean);
      const subpath = subpathParts.length > 0 ? sanitizeSubpath(subpathParts.join('/')) : undefined;
      return {
        type: 'github',
        url: `https://github.com/${parts[0]}/${parts[1]}`,
        subpath,
        ref,
        skillFilter,
      };
    }
  }

  // gitlab: 前缀
  if (cleanInput.startsWith('gitlab:')) {
    const rest = cleanInput.slice(7);
    const parts = rest.split('/');
    if (parts.length >= 2) {
      const subpathParts = parts.slice(2).filter(Boolean);
      const subpath = subpathParts.length > 0 ? sanitizeSubpath(subpathParts.join('/')) : undefined;
      return {
        type: 'gitlab',
        url: `https://gitlab.com/${parts[0]}/${parts[1]}`,
        subpath,
        ref,
        skillFilter,
      };
    }
  }

  // Gitee URL
  const giteeUrlMatch = cleanInput.match(/^https?:\/\/gitee\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/);
  if (giteeUrlMatch) {
    const [, owner, repo, branch, treePath] = giteeUrlMatch;
    const subpath = treePath ? sanitizeSubpath(treePath) : undefined;
    return {
      type: 'gitee',
      url: `https://gitee.com/${owner}/${repo}`,
      subpath,
      ref: ref || branch,
      skillFilter,
    };
  }

  // GitHub URL
  const githubUrlMatch = cleanInput.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/);
  if (githubUrlMatch) {
    const [, owner, repo, branch, treePath] = githubUrlMatch;
    const subpath = treePath ? sanitizeSubpath(treePath) : undefined;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}`,
      subpath,
      ref: ref || branch,
      skillFilter,
    };
  }

  // GitLab URL（支持子组；host 可含公司私有实例，见 registerGitlabHosts）
  const gitlabUrlMatch = cleanInput.match(gitlabUrlRegex());
  if (gitlabUrlMatch) {
    const [, group, repo, branch, treePath] = gitlabUrlMatch;
    const subpath = treePath ? sanitizeSubpath(treePath) : undefined;
    const host = new URL(cleanInput).host;
    return {
      type: 'gitlab',
      url: `https://${host}/${group}/${repo}`,
      subpath,
      ref: ref || branch,
      skillFilter,
    };
  }

  // Git SSH：git@host:owner/repo.git
  const sshMatch = cleanInput.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const [, host, path] = sshMatch;
    const url = `https://${host}/${path}`;
    if (host === 'gitee.com') return { type: 'gitee', url, ref, skillFilter };
    if (host === 'github.com') return { type: 'github', url, ref, skillFilter };
    if (isKnownGitlabHost(host)) return { type: 'gitlab', url, ref, skillFilter };
    return { type: 'git', url: cleanInput, ref, skillFilter };
  }

  // 直接的 .git URL
  if (cleanInput.endsWith('.git')) {
    if (cleanInput.includes('gitee.com')) return { type: 'gitee', url: cleanInput, ref, skillFilter };
    if (cleanInput.includes('github.com')) return { type: 'github', url: cleanInput, ref, skillFilter };
    if ([...KNOWN_GITLAB_HOSTS].some((h) => cleanInput.includes(h))) {
      return { type: 'gitlab', url: cleanInput, ref, skillFilter };
    }
    return { type: 'git', url: cleanInput, ref, skillFilter };
  }

  // 简写：owner/repo（无协议、无主机、无已知域名）
  // 排除含 :// 或已知域名后缀的情况
  const shorthandMatch = cleanInput.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/(.+))?$/);
  const hasKnownDomain = /\.(com|org|net|io|cn|dev)\b/.test(cleanInput) || cleanInput.includes('://');
  if (shorthandMatch && !hasKnownDomain) {
    const [, owner, repo, sub] = shorthandMatch;
    const subpath = sub ? sanitizeSubpath(sub) : undefined;
    // 简写在安装流程中根据配置优先级解析
    return {
      type: 'git', // placeholder — resolved by resolver
      url: `${owner}/${repo}`,
      subpath,
      ref,
      skillFilter,
    };
  }

  // 已知 URL（HTTP(S) URL 或含已知域名后缀的路径）
  if (
    cleanInput.startsWith('http://') ||
    cleanInput.startsWith('https://') ||
    /\.(com|org|net|io|cn|dev)\b/.test(cleanInput)
  ) {
    return { type: 'well-known', url: cleanInput, ref, skillFilter };
  }

  // Fallback: treat as git URL
  return { type: 'git', url: cleanInput, ref, skillFilter };
}

/**
 * Resolve a shorthand source to a concrete URL based on config priority.
 * Tries Gitee first (if configured), then GitHub.
 */
export async function resolveShorthand(
  parsed: ParsedSource,
  priority: ('gitee' | 'github')[]
): Promise<ParsedSource> {
  if (parsed.type !== 'git' || !parsed.url.includes('/')) return parsed;

  const parts = parsed.url.split('/');
  if (parts.length < 2) return parsed;

  const owner = parts[0];
  const repo = parts[1];

  for (const source of priority) {
    const baseUrl = source === 'gitee' ? 'https://gitee.com' : 'https://github.com';
    const fullUrl = `${baseUrl}/${owner}/${repo}`;

    if (await repoExists(fullUrl, source)) {
      return {
        ...parsed,
        type: source,
        url: fullUrl,
      };
    }
  }

  // Fallback: return as GitHub (original behavior)
  return {
    ...parsed,
    type: 'github',
    url: `https://github.com/${owner}/${repo}`,
  };
}

/**
 * Check if a repo exists on the given source.
 */
async function repoExists(url: string, source: 'gitee' | 'github'): Promise<boolean> {
  try {
    if (source === 'gitee') {
      // Gitee API: https://gitee.com/api/v5/repos/{owner}/{repo}
      const apiUrl = url.replace('https://gitee.com/', 'https://gitee.com/api/v5/repos/');
      const res = await fetch(apiUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } else {
      // GitHub API
      const apiUrl = url.replace('https://github.com/', 'https://api.github.com/repos/');
      const res = await fetch(apiUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    }
  } catch {
    return false;
  }
}
