import { join } from 'path';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir, homedir } from 'os';
import { spawn } from 'child_process';
import { CLONE_TIMEOUT_MS, CONFIG_DIR } from './constants.ts';

export class GitCloneError extends Error {
  readonly url: string;
  readonly isTimeout: boolean;
  readonly isAuthError: boolean;

  constructor(message: string, url: string, isTimeout = false, isAuthError = false) {
    super(message);
    this.name = 'GitCloneError';
    this.url = url;
    this.isTimeout = isTimeout;
    this.isAuthError = isAuthError;
  }
}

/**
 * 内置 GitHub 代理清单（按优先级排序）。
 * 均经实测可 `git clone`（见 ADR-0004）。前四个为前缀式，gitclone.com 为路径式。
 */
export const DEFAULT_GITHUB_PROXIES = [
  'https://gh-proxy.org',
  'https://ghfast.top',
  'https://ghproxy.net',
  'https://gh-proxy.com',
  'https://gitclone.com',
];

const MIRROR_CACHE_FILE = join(CONFIG_DIR, 'mirror-cache.json');
const MIRROR_CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时
const PROBE_TIMEOUT_MS = 6000;

interface MirrorCache {
  proxy: string;
  ts: number;
}

async function readMirrorCache(): Promise<MirrorCache | undefined> {
  try {
    const raw = await readFile(MIRROR_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as MirrorCache;
    if (typeof parsed.proxy === 'string' && typeof parsed.ts === 'number') return parsed;
  } catch {
    // 无缓存或损坏
  }
  return undefined;
}

async function writeMirrorCache(proxy: string): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(MIRROR_CACHE_FILE, JSON.stringify({ proxy, ts: Date.now() }), 'utf-8');
  } catch {
    // 缓存写入失败不影响主流程
  }
}

/**
 * 把 GitHub 原始 URL 映射到代理 URL。
 * - 前缀式：https://github.com/o/r → https://<proxy>/https://github.com/o/r
 * - gitclone.com：https://github.com/o/r → https://gitclone.com/github.com/o/r
 */
export function applyProxy(originalUrl: string, proxy: string): string {
  if (proxy.includes('gitclone.com')) {
    return originalUrl.replace('https://github.com', `${proxy}/github.com`);
  }
  return `${proxy}/${originalUrl}`;
}

const GIT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_LFS_SKIP_SMUDGE: '1',
  GIT_ASKPASS: 'echo',
  GCM_INTERACTIVE: 'never',
};

/**
 * 用 `git ls-remote` 轻量探测某 URL 是否可 clone。
 * 比 HEAD 探测代理根 URL 更能真实反映「能否 clone」。
 */
function probeCloneUrl(cloneUrl: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('git', ['ls-remote', '--exit-code', cloneUrl, 'HEAD'], {
      env: { ...process.env, ...GIT_ENV },
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/**
 * 按可用性排序代理：命中新鲜缓存则提到最前；否则逐个探测，把第一个可用者提到最前。
 * 其余代理保持原顺序作为回退候选。
 */
async function orderProxiesByProbe(url: string, proxies: string[]): Promise<string[]> {
  const ordered = [...proxies];

  const cached = await readMirrorCache();
  if (cached && Date.now() - cached.ts < MIRROR_CACHE_TTL_MS) {
    const idx = ordered.indexOf(cached.proxy);
    if (idx > 0) {
      ordered.splice(idx, 1);
      ordered.unshift(cached.proxy);
    }
    if (idx >= 0) return ordered;
  }

  for (const proxy of ordered) {
    if (await probeCloneUrl(applyProxy(url, proxy))) {
      ordered.splice(ordered.indexOf(proxy), 1);
      ordered.unshift(proxy);
      await writeMirrorCache(proxy);
      break;
    }
  }
  return ordered;
}

export interface CloneOptions {
  ref?: string;
  /** 是否启用 GitHub 代理加速 */
  proxyEnabled?: boolean;
  /** 自定义代理清单（空则用内置默认） */
  proxyList?: string[];
}

function cloneTimeoutMs(): number {
  const env = Number(process.env.CN_SKILLS_CLONE_TIMEOUT_MS);
  return Number.isFinite(env) && env > 0 ? env : CLONE_TIMEOUT_MS;
}

/** 用 child_process.spawn 直接调用 git 克隆单个 URL。 */
function doClone(cloneUrl: string, ref: string | undefined): Promise<string> {
  const tempDirPromise = mkdtemp(join(tmpdir(), 'cn-skills-'));

  return tempDirPromise.then(
    (tempDir) =>
      new Promise<string>((resolve, reject) => {
        const args = ['clone', '--depth', '1', '--no-recurse-submodules'];
        if (ref) args.push('--branch', ref);
        args.push(cloneUrl, tempDir);

        const child = spawn('git', args, {
          env: { ...process.env, ...GIT_ENV },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stderr = '';
        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          rm(tempDir, { recursive: true, force: true }).catch(() => {});
          reject(
            new GitCloneError(
              `克隆超时（${Math.round(cloneTimeoutMs() / 1000)}秒）。\n` +
                `  - 仓库太大：设置环境变量 CN_SKILLS_CLONE_TIMEOUT_MS=600000\n` +
                `  - 网络慢：重试，或手动克隆后传本地路径\n` +
                `  - 私有仓库：确保已配置 SSH 密钥或 HTTPS 凭据`,
              cloneUrl,
              true,
              false
            )
          );
        }, cloneTimeoutMs());

        child.on('close', async (code) => {
          clearTimeout(timeout);
          if (code === 0) {
            resolve(tempDir);
            return;
          }

          await rm(tempDir, { recursive: true, force: true }).catch(() => {});

          const isAuthError =
            stderr.includes('Authentication failed') ||
            stderr.includes('could not read Username') ||
            stderr.includes('Permission denied') ||
            stderr.includes('Repository not found') ||
            stderr.includes('fatal: repository') ||
            stderr.includes('Could not resolve host');

          if (isAuthError) {
            reject(
              new GitCloneError(
                `认证失败：${cloneUrl}\n` +
                  `  - 私有仓库：确保你有访问权限\n` +
                  `  - SSH：检查密钥 ssh -T git@github.com\n` +
                  `  - HTTPS：配置 git 凭据\n` +
                  `  - 网络：检查是否能访问该域名`,
                cloneUrl,
                false,
                true
              )
            );
            return;
          }

          reject(new GitCloneError(`克隆失败：${cloneUrl}\n${stderr || `退出码 ${code}`}`, cloneUrl, false, false));
        });

        child.on('error', async (err) => {
          clearTimeout(timeout);
          await rm(tempDir, { recursive: true, force: true }).catch(() => {});
          reject(new GitCloneError(`无法执行 git 命令：${err.message}\n请确保已安装 git。`, cloneUrl, false, false));
        });
      })
  );
}

/**
 * 克隆仓库，支持 GitHub 代理加速。
 *
 * 流程（github 源且启用代理时）：
 * 1. `git ls-remote` 预探测，把第一个可用代理提到最前；
 * 2. 按序尝试各代理 clone，失败则回退下一个；
 * 3. 最后回退直连 GitHub。
 * 认证错误立即抛出，不做无谓重试。
 */
export async function cloneRepo(url: string, options: CloneOptions = {}): Promise<string> {
  const { ref, proxyEnabled = false, proxyList = [] } = options;
  const isGithub = url.includes('github.com');

  const candidates: string[] = [];
  if (isGithub && proxyEnabled) {
    const proxies = proxyList.length > 0 ? proxyList : DEFAULT_GITHUB_PROXIES;
    const ordered = await orderProxiesByProbe(url, proxies);
    for (const proxy of ordered) candidates.push(applyProxy(url, proxy));
  }
  candidates.push(url); // 直连兜底

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await doClone(candidate, ref);
    } catch (error) {
      if (error instanceof GitCloneError && error.isAuthError) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new GitCloneError(`克隆失败：${url}`, url);
}

/**
 * 安全清理临时目录。
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  const normalizedDir = dir.replace(/\\/g, '/');
  const normalizedTmp = tmpdir().replace(/\\/g, '/');
  if (!normalizedDir.startsWith(normalizedTmp)) {
    throw new Error('Attempted to clean up directory outside of temp directory');
  }
  await rm(dir, { recursive: true, force: true });
}
