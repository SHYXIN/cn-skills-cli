export interface ParsedCliArgs {
  command: string;
  positional: string[];
  options: Record<string, string | boolean | string[]>;
}

/** 值可重复的选项（收集后续所有非 flag 参数） */
const VARIADIC_OPTIONS = new Set(['agent', 'skill']);

/**
 * 解析命令行参数，分离命令、位置参数和选项。
 * --agent / --skill 为变长选项：后面的连续非 flag 参数都归入该选项（数组）。
 */
export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const args = argv.slice(2);
  const command = args[0] || 'help';
  const positional: string[] = [];
  const options: Record<string, string | boolean | string[]> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (VARIADIC_OPTIONS.has(key)) {
        const values: string[] = [];
        while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          values.push(args[i + 1]);
          i++;
        }
        options[key] = values.length > 0 ? values : true;
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          options[key] = next;
          i++;
        } else {
          options[key] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, options };
}

/**
 * 解析 --agent 的值列表，兼容三种写法：
 * - 逗号分隔：a,b,c（Git Bash / cmd）
 * - 空格分隔单参数："a b c"（PowerShell 把数组拼成一个参数）
 * - 多参数数组：['a', 'b', 'c']（变长选项收集 / PowerShell 展开数组）
 * 布尔 true（--agent 后没跟值）返回空数组。
 */
export function parseAgentList(value: string | boolean | string[] | undefined): string[] {
  if (value === undefined || typeof value === 'boolean') return [];
  const parts = (Array.isArray(value) ? value : [value])
    .flatMap((s) => s.split(/[,\s]+/))
    .filter(Boolean);
  return [...new Set(parts)];
}
