import { join } from 'path';
import { mkdtemp, rm, mkdir, readFile, writeFile, cp, stat } from 'fs/promises';
import { tmpdir, homedir } from 'os';
import { spawn } from 'child_process';
import { CLONE_TIMEOUT_MS, SPARSE_ATTEMPT_TIMEOUT_MS, CONFIG_DIR } from './constants.ts';
import { skillDirsFromPaths } from './sparse.ts';

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
  /**
   * 稀疏快车道：partial clone（--filter=blob:none --sparse）只检出技能目录。
   * 提供即启用（仅 GitHub 源生效，其他源忽略）；技能目录经本地 ls-tree 推导
   * （不走 API）；服务端不支持 filter 时自动回退整仓浅克隆（原有行为）。
   * subpath：稀疏检出时的子路径过滤（与 discoverSkills 的 subpath 语义一致）。
   */
  sparse?: { subpath?: string };
}

function cloneTimeoutMs(): number {
  const env = Number(process.env.CN_SKILLS_CLONE_TIMEOUT_MS);
  return Number.isFinite(env) && env > 0 ? env : CLONE_TIMEOUT_MS;
}

/** 认证/网络错误标记（与历史行为保持一致的一组子串匹配） */
const CLONE_AUTH_ERROR_MARKERS = [
  'Authentication failed',
  'could not read Username',
  'Permission denied',
  'Repository not found',
  'fatal: repository',
  'Could not resolve host',
];

interface GitResult {
  ok: true;
  stdout: string;
}

interface GitFailure {
  ok: false;
  /** 错误文本（超时 / 无法执行 / stderr 或退出码） */
  error: string;
  /** 超时标记（区别于 git 自身报错，供错误分类用） */
  timeout?: true;
}

/**
 * 带超时地运行一次 git 命令。
 * 成功返回 { ok: true, stdout }；失败返回 { ok: false, error }。
 * stdinInput 非空时写入子进程标准输入（供 sparse-checkout --stdin 使用）。
 */
function runGit(args: string[], timeoutMs: number, stdinInput?: string): Promise<GitResult | GitFailure> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      env: { ...process.env, ...GIT_ENV },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, error: `超时（${Math.round(timeoutMs / 1000)}秒）`, timeout: true });
    }, timeoutMs);

    child.stdin?.end(stdinInput ?? '');

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true, stdout } : { ok: false, error: stderr || `退出码 ${code}` });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `无法执行 git 命令：${err.message}\n请确保已安装 git。` });
    });
  });
}

/** 组装稀疏克隆的 git 参数（partial clone + cone 稀疏检出，初始仅检出根目录文件）。 */
export function sparseCloneArgs(cloneUrl: string, ref: string | undefined): string[] {
  const args = ['clone', '--depth', '1', '--no-recurse-submodules', '--filter=blob:none', '--sparse'];
  if (ref) args.push('--branch', ref);
  args.push(cloneUrl);
  return args;
}

/** 把 runGit 的失败结果分类成带语义标记的 GitCloneError（超时 / 认证 / 其他）。 */
function classifyCloneError(cloneUrl: string, failure: GitFailure): GitCloneError {
  if (failure.timeout) {
    return new GitCloneError(
      `克隆超时（${Math.round(cloneTimeoutMs() / 1000)}秒）。\n` +
        `  - 仓库太大：设置环境变量 CN_SKILLS_CLONE_TIMEOUT_MS=600000\n` +
        `  - 网络慢：重试，或手动克隆后传本地路径\n` +
        `  - 私有仓库：确保已配置 SSH 密钥或 HTTPS 凭据`,
      cloneUrl,
      true,
      false
    );
  }
  const err = failure.error;
  if (err.startsWith('无法执行 git 命令')) {
    return new GitCloneError(err, cloneUrl, false, false);
  }
  const isAuthError = CLONE_AUTH_ERROR_MARKERS.some((m) => err.includes(m));
  if (isAuthError) {
    return new GitCloneError(
      `认证失败：${cloneUrl}\n` +
        `  - 私有仓库：确保你有访问权限\n` +
        `  - SSH：检查密钥 ssh -T git@github.com\n` +
        `  - HTTPS：配置 git 凭据\n` +
        `  - 网络：检查是否能访问该域名`,
      cloneUrl,
      false,
      true
    );
  }
  return new GitCloneError(`克隆失败：${cloneUrl}\n${err}`, cloneUrl, false, false);
}

/** 用 child_process.spawn 直接调用 git 克隆单个 URL（整仓浅克隆）。 */
async function doClone(cloneUrl: string, ref: string | undefined): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'cn-skills-'));

  const args = ['clone', '--depth', '1', '--no-recurse-submodules'];
  if (ref) args.push('--branch', ref);
  args.push(cloneUrl, tempDir);

  const result = await runGit(args, cloneTimeoutMs());
  if (result.ok) return tempDir;

  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  throw classifyCloneError(cloneUrl, result);
}

/**
 * 稀疏克隆：partial clone（--filter=blob:none --sparse）+ 本地 ls-tree 推导技能目录，
 * cone 模式仅检出技能目录。服务端需支持 filter 能力：GitHub 直连与透传 git 协议的
 * 前缀代理（gh-proxy.org 等）支持；gitclone.com 路径式代理不支持——失败由 cloneRepo
 * 回退整仓浅克隆。
 * 巨型仓库收益实测：deepseek-harness 整仓浅克隆 211 MiB / 2.5 分钟 → 稀疏 5.6 MiB / 6 秒。
 */
async function doSparseClone(
  cloneUrl: string,
  ref: string | undefined,
  subpath?: string
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'cn-skills-'));

  const args = sparseCloneArgs(cloneUrl, ref);
  args.push(tempDir);
  // 稀疏尝试用独立紧凑预算：正常 6~72s 即完成，吊死的候选早断早换，
  // 不给每个候选吃满整仓的 300s（最坏情况不比改造前更差）
  let result = await runGit(args, SPARSE_ATTEMPT_TIMEOUT_MS);
  if (!result.ok) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    // 克隆步失败按整仓同款语义分类（认证错误须携带 isAuthError，供 cloneRepo 立即上抛）
    throw classifyCloneError(cloneUrl, result);
  }

  // 列出 HEAD 全部文件路径（blob:none 下 tree 元数据已就位，本地执行、零额外网络），
  // 据此推导技能目录，避开 api.github.com（国内直连不可靠，实测 10s 超时）。
  result = await runGit(['-C', tempDir, 'ls-tree', '-r', '--name-only', 'HEAD'], SPARSE_ATTEMPT_TIMEOUT_MS);
  if (result.ok) {
    const dirs = skillDirsFromPaths(result.stdout.split(/\r?\n/).filter(Boolean), subpath);
    if (dirs.length > 0) {
      // 目录清单经 stdin 传入，规避 Windows 命令行长度上限（技能数可到数百）
      result = await runGit(
        ['-C', tempDir, 'sparse-checkout', 'set', '--cone', '--stdin'],
        SPARSE_ATTEMPT_TIMEOUT_MS,
        dirs.join('\n')
      );
    }
  }

  if (!result.ok) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    // 仅作内部信令：cloneRepo 对该类失败一律换候选/回退整仓，不会到达用户
    throw new GitCloneError(`稀疏克隆失败：${cloneUrl}\n${result.error}`, cloneUrl, result.timeout === true, false);
  }
  return tempDir;
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
  const { ref, proxyEnabled = false, proxyList = [], sparse } = options;
  const isGithub = url.includes('github.com');

  const candidates: string[] = [];
  if (isGithub && proxyEnabled) {
    const proxies = proxyList.length > 0 ? proxyList : DEFAULT_GITHUB_PROXIES;
    const ordered = await orderProxiesByProbe(url, proxies);
    for (const proxy of ordered) candidates.push(applyProxy(url, proxy));
  }
  candidates.push(url); // 直连兜底

  // ── 稀疏快车道：partial clone 只检出技能目录（仅 GitHub 源，其他源忽略）──
  // 逐候选尝试（代理优先、直连兜底）；候选不支持 filter（如 gitclone.com 路径式代理）
  // 时失败换下一个；全部候选失败则落回下方整仓浅克隆（原有行为）。
  if (sparse && isGithub) {
    for (const candidate of candidates) {
      try {
        return await doSparseClone(candidate, ref, sparse.subpath);
      } catch (error) {
        // 认证错误立即上抛（与整仓循环同语义），其余失败换下一个候选
        if (error instanceof GitCloneError && error.isAuthError) throw error;
      }
    }
  }

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

/**
 * 把本地目录复制进临时目录，作为 cloneRepo 的本地路径等价物。
 *
 * 本地目录可能不是 git 仓库（无 .git），无法走 git clone；
 * 复制到临时目录后与克隆产物形态一致，后续 skill 扫描流程不变。
 * 路径不存在或不是目录时抛出 GitCloneError，与 clone 失败同构。
 */
export async function copyLocalDir(localPath: string): Promise<string> {
  const st = await stat(localPath).catch(() => undefined);
  if (!st?.isDirectory()) {
    throw new GitCloneError(`本地目录不存在或不是目录：${localPath}`, localPath);
  }
  const tempDir = await mkdtemp(join(tmpdir(), 'cn-skills-'));
  await cp(localPath, tempDir, { recursive: true });
  return tempDir;
}
