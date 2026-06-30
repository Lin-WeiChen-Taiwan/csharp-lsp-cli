import fs from "node:fs";
import path from "node:path";

export function discoverWorkspace(
  cwd: string,
  options: { workspace?: string; file?: string; solution?: string }
): string {
  if (options.workspace !== undefined) {
    return path.resolve(cwd, options.workspace);
  }

  if (options.file !== undefined) {
    const gitWorkspace = findGitRoot(pathStartDir(cwd, options.file));
    if (gitWorkspace !== undefined) {
      return gitWorkspace;
    }
  }

  if (options.solution !== undefined) {
    const solutionPath = resolveInputPath(cwd, options.solution);
    const gitWorkspace = findGitRoot(path.dirname(solutionPath));
    if (gitWorkspace !== undefined) {
      return gitWorkspace;
    }
    return path.dirname(solutionPath);
  }

  return path.resolve(cwd);
}

function pathStartDir(cwd: string, inputPath: string): string {
  const resolved = resolveInputPath(cwd, inputPath);
  return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
    ? resolved
    : path.dirname(resolved);
}

function resolveInputPath(cwd: string, inputPath: string): string {
  return path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.resolve(cwd, inputPath);
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
