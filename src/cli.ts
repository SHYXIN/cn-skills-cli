#!/usr/bin/env node

import pc from 'picocolors';
import { readFileSync } from 'fs';
import { runAdd } from './commands/add.ts';
import { runFind } from './commands/find.ts';
import { runList } from './commands/list.ts';
import { runRemove } from './commands/remove.ts';
import { runUpdate } from './commands/update.ts';
import { parseCliArgs, parseAgentList } from './args.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const VERSION = pkg.version;

function showHelp(): void {
  console.log(`
${pc.bold('cn-skills')} v${VERSION}
${pc.dim('中国优化的 AI Agent Skills 安装工具')}

${pc.bold('用法：')}
  cn-skills <command> [options]

${pc.bold('命令：')}
  ${pc.cyan('add')} <source>     安装 skill
  ${pc.cyan('update')} [名称...]  更新已安装的 skills（重新从源拉取覆盖）
  ${pc.cyan('find')} [关键词]    从 skills.sh 搜索 skills（对齐 npx skills find）
  ${pc.cyan('list')}            列出已安装的 skills
  ${pc.cyan('remove')} <name>   移除已安装的 skill
  ${pc.cyan('config')}          查看/初始化配置文件
  ${pc.cyan('help')}            显示帮助信息
  ${pc.cyan('version')}         显示版本号

${pc.bold('add 命令选项：')}
  ${pc.dim('--agent <name>')}    指定 agent（默认自动检测）
  ${pc.dim('--global')}          全局安装（~/.agents/skills/）
  ${pc.dim('--yes')}             跳过确认
  ${pc.dim('--source <gitee|github>')}  强制使用指定源
  ${pc.dim('--copy')}            复制模式（默认 symlink）

${pc.bold('示例：')}
  cn-skills add gitee:owner/repo
  cn-skills add github:anthropics/skills
  cn-skills add owner/repo --source gitee
  cn-skills find python          # 从 GitHub 搜索 python 相关 skills
  cn-skills find                 # 浏览热门 skills
  cn-skills list
  cn-skills remove my-skill

${pc.bold('支持的源格式：')}
  ${pc.dim('·')} owner/repo               shorthand（按配置优先级自动选择源）
  ${pc.dim('·')} gitee:owner/repo         强制从 Gitee 安装
  ${pc.dim('·')} github:owner/repo        强制从 GitHub 安装
  ${pc.dim('·')} https://gitee.com/...    完整 URL
  ${pc.dim('·')} https://github.com/...   完整 URL
  ${pc.dim('·')} git@host:owner/repo.git  SSH 地址
  ${pc.dim('·')} ./local/path             本地路径

${pc.bold('GitHub 加速：')}
  自动检测可用镜像（gh-proxy.org / kkgithub.com 等）
  无需手动配置，克隆 GitHub 仓库时自动加速
`);
}

function showVersion(): void {
  console.log(`cn-skills v${VERSION}`);
}

async function main(): Promise<void> {
  const { command, positional, options } = parseCliArgs(process.argv);
  const agentList = parseAgentList(options.agent as string | boolean | string[] | undefined);

  try {
    switch (command) {
      case 'add':
      case 'install':
        await runAdd(positional, {
          agent: agentList.length > 0 ? agentList : undefined,
          global: options.global as boolean,
          yes: options.yes as boolean,
          skill: parseAgentList(options.skill as string | boolean | string[] | undefined),
          source: options.source as 'gitee' | 'github' | undefined,
          copy: options.copy as boolean,
        });
        break;

      case 'find':
        await runFind(positional);
        break;

      case 'update':
      case 'upgrade':
        await runUpdate(positional, {
          global: options.global as boolean,
          project: options.project as boolean,
          yes: options.yes as boolean,
        });
        break;

      case 'list':
      case 'ls':
        await runList();
        break;

      case 'remove':
      case 'rm':
      case 'uninstall':
        await runRemove(positional, {
          agent: agentList.length > 0 ? agentList : undefined,
          global: options.global as boolean,
          yes: options.yes as boolean,
        });
        break;

      case 'config':
        const { loadConfig, initConfig, CONFIG_FILE } = await import('./config.ts');
        if (options.init) {
          await initConfig();
          console.log(`配置文件已初始化：${CONFIG_FILE}`);
        } else {
          const config = await loadConfig();
          console.log(`配置文件路径：${CONFIG_FILE}`);
          console.log(JSON.stringify(config, null, 2));
        }
        break;

      case 'version':
      case '-v':
      case '--version':
        showVersion();
        break;

      case 'help':
      case '-h':
      case '--help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error(pc.red('错误：'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
