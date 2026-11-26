/**
 * 稀疏拉取的路径推导（纯函数）。
 *
 * 输入 `git ls-tree -r --name-only HEAD` 的输出（正斜杠文件路径），
 * 输出需要稀疏检出的技能目录。大小写敏感：`badge-skill.md` 之类的
 * 文件不会被误判为 SKILL.md（Windows 上的教训）。
 */
export function skillDirsFromPaths(paths: string[], subpath?: string): string[] {
  const dirs = new Set<string>();
  for (const path of paths) {
    let dir: string;
    if (path === 'SKILL.md') {
      // 仓库根的 SKILL.md：cone 模式恒检出根目录文件，无需登记
      dir = '';
    } else if (path.endsWith('/SKILL.md')) {
      dir = path.slice(0, -'/SKILL.md'.length);
    } else {
      continue;
    }
    if (subpath) {
      // 子路径过滤：仅保留子路径之内（含子路径根本身）的技能目录
      if (dir !== subpath && !dir.startsWith(`${subpath}/`)) continue;
    }
    if (dir) dirs.add(dir);
  }
  return [...dirs];
}
