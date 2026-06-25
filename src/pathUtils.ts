import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function resolveWorkspacePath(workspace: string, file: string): string {
  return path.isAbsolute(file) ? path.normalize(file) : path.resolve(workspace, file);
}

export function pathToUri(filePath: string): string {
  return pathToFileURL(path.resolve(filePath)).href;
}

export function uriToFsPath(uri: string): string {
  return fileURLToPath(uri);
}

export function uriToWorkspacePath(workspace: string, uri: string): string {
  return fsPathToWorkspacePath(workspace, uriToFsPath(uri));
}

export function fsPathToWorkspacePath(workspace: string, filePath: string): string {
  const relative = path.relative(workspace, filePath);
  if (relative === "") {
    return ".";
  }
  return relative.split(path.sep).join("/");
}
