import fs from "node:fs";
import path from "node:path";

export function discoverWorkspace(
  cwd: string,
  options: { workspace?: string; file?: string }
): string {
  if (options.workspace !== undefined) {
    return path.resolve(cwd, options.workspace);
  }

  if (options.file !== undefined) {
    const filePath = path.isAbsolute(options.file)
      ? options.file
      : path.resolve(cwd, options.file);
    const startDir = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
      ? filePath
      : path.dirname(filePath);
    const gitWorkspace = findGitRoot(startDir);
    if (gitWorkspace !== undefined) {
      return gitWorkspace;
    }
  }

  return path.resolve(cwd);
}

export function findGitRoot(startDir: string): string | undefined {
  let current = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}
