#!/usr/bin/env node
/**
 * 从上游 vercel-labs/skills 的 `src/agents.ts` 重新生成 cn-skills 的 agent 注册表条目区。
 *
 * 设计（见 ADR-0003）：
 * - 只替换 `src/agents.ts` 中 `>>> GENERATED AGENTS START` 与 `<<< GENERATED AGENTS END` 之间的内容；
 * - prelude（helper 函数）与 postlude（getUniversalAgents 等）由 cn-skills 自行维护；
 * - cn 特有项（workbuddy、copilot）在 markers 之外，天然不受影响。
 *
 * 用法：npm run sync-agents
 */
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_FILE = join(__dirname, '..', 'src', 'agents.ts');

const UPSTREAM_URLS = [
  'https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts',
  'https://raw.githubusercontent.com/vercel-labs/skills/master/src/agents.ts',
  'https://gh-proxy.org/https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts',
  'https://ghfast.top/https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts',
];

const START_MARKER = '  // >>> GENERATED AGENTS START (scripts/sync-agents.ts) >>>';
const END_MARKER = '  // <<< GENERATED AGENTS END <<<';

async function fetchUpstream(): Promise<string> {
  // 优先本地克隆（离线/墙内可用）：CN_SKILLS_UPSTREAM_AGENTS=/path/to/vercel-lab-skills/src/agents.ts
  const localPath = process.env.CN_SKILLS_UPSTREAM_AGENTS?.trim();
  if (localPath) {
    try {
      return await readFile(localPath, 'utf-8');
    } catch (e) {
      throw new Error(`读取本地上游文件失败：${localPath}（${e instanceof Error ? e.message : String(e)}）`);
    }
  }

  let lastErr: unknown;
  for (const url of UPSTREAM_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.text();
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `无法获取上游 agents.ts：${lastErr instanceof Error ? lastErr.message : String(lastErr)}\n` +
      `  提示：可设置 CN_SKILLS_UPSTREAM_AGENTS 指向本地 vercel-lab-skills/src/agents.ts`
  );
}

/** 从上游源码提取 agents 对象体，并转换为 cn-skills 的数组条目格式。 */
function extractEntries(upstreamSrc: string): { names: string[]; block: string } {
  const src = upstreamSrc.replace(/\r\n/g, '\n');
  const objMatch = src.match(/export const agents[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!objMatch) throw new Error('未能在上游源码中定位 `export const agents = { ... }`');
  const body = objMatch[1];

  const entryRe = /^ {2}(?:'([a-z0-9-]+)'|([a-z0-9-]+)): \{\n([\s\S]*?)\n {2}\},?$/gm;
  const entries: string[] = [];
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(body)) !== null) {
    const name = m[1] || m[2];
    const inner = m[3];
    names.push(name);
    entries.push(`  {\n${inner}\n  },`);
  }
  if (entries.length === 0) throw new Error('未能从上游 agents 对象中解析出任何条目');
  return { names, block: entries.join('\n') };
}

/** 读取当前本地生成区里的 agent 名（用于打印差异）。 */
function currentNames(localSrc: string): string[] {
  const startIdx = localSrc.indexOf(START_MARKER);
  const endIdx = localSrc.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return [];
  const block = localSrc.slice(startIdx + START_MARKER.length, endIdx);
  const names: string[] = [];
  const re = /name: '([a-z0-9-]+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) names.push(m[1]);
  return names;
}

async function main(): Promise<void> {
  const upstream = await fetchUpstream();
  const { names, block } = extractEntries(upstream);

  const local = await readFile(AGENTS_FILE, 'utf-8');
  const startIdx = local.indexOf(START_MARKER);
  const endIdx = local.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error('未能在 src/agents.ts 中找到生成标记');
  }

  const before = local.slice(0, startIdx + START_MARKER.length);
  const after = local.slice(endIdx);
  const next = `${before}\n${block}\n${after}`;

  if (next === local) {
    console.log(`✅ 已是最新，上游 ${names.length} 个 agent，无需改动。`);
    return;
  }

  await writeFile(AGENTS_FILE, next, 'utf-8');

  const prev = new Set(currentNames(local));
  const now = new Set(names);
  const added = names.filter((n) => !prev.has(n));
  const removed = [...prev].filter((n) => !now.has(n));

  console.log(`✅ 已同步上游 ${names.length} 个 agent 到 src/agents.ts`);
  if (added.length) console.log(`  + 新增：${added.join(', ')}`);
  if (removed.length) console.log(`  - 移除：${removed.join(', ')}（如为 cn 特有项请检查 markers 是否被破坏）`);
  if (!added.length && !removed.length) console.log('  （条目内容有更新，名称集合未变）');
}

main().catch((err) => {
  console.error('❌ sync-agents 失败：', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
