export type AgentType =
  | 'claude-code'
  | 'cursor'
  | 'codex'
  | 'copilot'
  | 'windsurf'
  | 'continue'
  | 'cline'
  | 'opencode'
  | 'openhands'
  | 'goose'
  | 'aider-desk'
  | 'amp'
  | 'antigravity'
  | 'augment'
  | 'bob'
  | 'openclaw'
  | 'codearts-agent'
  | 'codebuddy'
  | 'codemaker'
  | 'codestudio'
  | 'command-code'
  | 'cortex'
  | 'crush'
  | 'deepagents'
  | 'devin'
  | 'dexto'
  | 'droid'
  | 'firebender'
  | 'forgecode'
  | 'gemini-cli'
  | 'hermes-agent'
  | 'iflow-cli'
  | 'junie'
  | 'kilo'
  | 'kimi-cli'
  | 'kiro-cli'
  | 'kode'
  | 'mcpjam'
  | 'mistral-vibe'
  | 'mux'
  | 'neovate'
  | 'pi'
  | 'qoder'
  | 'qwen-code'
  | 'replit'
  | 'roo'
  | 'rovodev'
  | 'tabnine-cli'
  | 'trae'
  | 'trae-cn'
  | 'warp'
  | 'zencoder'
  | 'pochi'
  | 'adal'
  | 'universal';

export interface Skill {
  name: string;
  description: string;
  path: string;
  rawContent?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentConfig {
  name: string;
  displayName: string;
  skillsDir: string;
  globalSkillsDir: string | undefined;
  detectInstalled: () => Promise<boolean>;
  /** 是否属于「通用 agent 集合」（默认 true；false 表示不属于） */
  showInUniversalList?: boolean;
  /** 是否在交互提示的锁定区显示（默认 true） */
  showInUniversalPrompt?: boolean;
  /** 无视全局 symlink/copy 模式，恒用复制 */
  forceCopy?: boolean;
  /** 项目级安装时，即使 agent 根目录不存在也默认创建（不跳过 symlink） */
  createProjectSkillsDirByDefault?: boolean;
}

export interface ParsedSource {
  type: 'github' | 'gitlab' | 'gitee' | 'git' | 'local' | 'well-known';
  url: string;
  subpath?: string;
  localPath?: string;
  ref?: string;
  skillFilter?: string;
}

export interface CnSkillsConfig {
  sourcePriority: ('gitee' | 'github')[];
  mirror: {
    github: string;
    gitee: string;
  };
  installMode: 'symlink' | 'copy';
  preferredAgents: string[];
  indexUrl: string;
  /** 是否启用 GitHub 代理加速（默认 true） */
  githubProxy: boolean;
  /** GitHub 代理清单（可覆盖默认）；空数组表示用内置默认清单 */
  proxyList: string[];
  /** 已知 GitLab 实例 host 列表（默认含 gitlab.com）；配置公司私有 GitLab host 后，其 URL/SSH 形式会被识别为 gitlab 源 */
  gitlabHosts: string[];
}

export const DEFAULT_CONFIG: CnSkillsConfig = {
  sourcePriority: ['gitee', 'github'],
  mirror: {
    github: 'https://github.com',
    gitee: 'https://gitee.com',
  },
  installMode: 'symlink',
  preferredAgents: ['claude-code'],
  indexUrl: 'https://gitee.com/cn-skills/index/raw/main/zh-skills.json',
  githubProxy: true,
  proxyList: [],
  gitlabHosts: ['gitlab.com'],
};

export interface ZhSkillEntry {
  name: string;
  description: string;
  source: 'gitee' | 'github';
  owner: string;
  repo: string;
  category: string;
  tags: string[];
}
