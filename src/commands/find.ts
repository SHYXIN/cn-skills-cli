import * as p from '@clack/prompts';
import pc from 'picocolors';
import { runAdd } from './add.ts';

interface SearchSkill {
  id: string;       // 完整路径，如 "wshobson/agents/python-performance-optimization"
  skillId: string;  // skill 名称，如 "python-performance-optimization"
  name: string;     // 显示名称
  installs: number; // 安装量
  source: string;   // 来源，如 "wshobson/agents"
}

const SEARCH_API_BASE = 'https://skills.sh';

function formatInstalls(count: number): string {
  if (!count || count <= 0) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M installs`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K installs`;
  return `${count} install${count === 1 ? '' : 's'}`;
}

/**
 * 从 skills.sh API 搜索 skills。
 */
async function searchSkillsAPI(query: string): Promise<SearchSkill[]> {
  try {
    const url = `${SEARCH_API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { skills?: SearchSkill[] };
    return (data.skills || []) as SearchSkill[];
  } catch {
    return [];
  }
}

/**
 * 搜索 skills 并交互式选择安装。
 * 对齐 npx skills find 命令，数据源为 skills.sh。
 * 显示格式参考 skills-cn：source@name installs + skills.sh 链接
 */
export async function runFind(args: string[]): Promise<void> {
  const keyword = args.join(' ');

  if (!keyword) {
    p.log.info('交互式搜索模式');
    p.log.info('提示：可以直接传关键词，如：cn-skills find python');
  }

  const spinner = p.spinner();
  spinner.start(keyword ? `正在搜索 "${keyword}"...` : '正在加载热门 skills...');

  let results: SearchSkill[];
  try {
    results = keyword
      ? await searchSkillsAPI(keyword)
      : await searchSkillsAPI('agent-skills');
    spinner.stop(`找到 ${results.length} 个 skill`);
  } catch (error) {
    spinner.stop('搜索失败');
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (results.length === 0) {
    p.log.warn('未找到匹配的 skill');
    p.log.info('尝试：cn-skills find python');
    p.log.info('浏览：https://skills.sh');
    process.exit(0);
  }

  // 显示搜索结果 — 格式：source@name installs
  console.log('');
  p.log.message(pc.dim('Install with cn-skills add <owner/repo@skill>'));
  console.log('');

  for (const skill of results.slice(0, 10)) {
    const pkg = skill.source;
    const installs = formatInstalls(skill.installs);
    console.log(
      `${pc.cyan(`${pkg}@${skill.name}`)}${installs ? ` ${pc.green(installs)}` : ''}`
    );
    console.log(`${pc.dim(`└ https://skills.sh/${skill.id}`)}`);
    console.log('');
  }

  // 让用户选择
  const choices = results.slice(0, 10).map((skill) => ({
    value: skill,
    label: pc.cyan(`${skill.source}@${skill.name}`),
    hint: formatInstalls(skill.installs),
  }));

  const selected = await p.select({
    message: `找到 ${results.length} 个 skill，选择一个查看详情`,
    options: choices,
  });

  if (p.isCancel(selected)) process.exit(0);

  const skill = selected as SearchSkill;

  // 显示详情
  console.log('');
  p.log.message(
    `${pc.bold(skill.name)}\n\n` +
      `  来源：${skill.source}\n` +
      `  安装量：${formatInstalls(skill.installs)}\n` +
      `  链接：https://skills.sh/${skill.id}`
  );

  // 询问是否安装
  const shouldInstall = await p.confirm({
    message: '是否安装此 skill？',
    initialValue: true,
  });

  if (p.isCancel(shouldInstall) || !shouldInstall) {
    process.exit(0);
  }

  // 用 source（owner/repo）安装
  await runAdd([skill.source], { yes: false, skill: [skill.skillId] });
}
