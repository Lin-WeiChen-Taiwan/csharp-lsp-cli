import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fsPathToWorkspacePath,
  pathToUri,
  resolveWorkspacePath,
  uriToFsPath,
  uriToWorkspacePath
} from "../../src/pathUtils.js";

describe("path and URI conversion", () => {
  it("round-trips file paths through file URIs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-lsp-path-"));
    const file = path.join(root, "src", "Program.cs");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "class Program {}\n");

    const uri = pathToUri(file);
    expect(uri.startsWith("file:")).toBe(true);
    expect(path.normalize(uriToFsPath(uri))).toBe(path.normalize(file));
  });

  it("resolves workspace-relative paths", () => {
    const workspace = path.resolve("workspace");
    expect(resolveWorkspacePath(workspace, "src/Program.cs")).toBe(
      path.join(workspace, "src", "Program.cs")
    );
  });

  it("returns slash-separated workspace paths", () => {
    const workspace = path.resolve("workspace");
    const file = path.join(workspace, "src", "Program.cs");
    expect(fsPathToWorkspacePath(workspace, file)).toBe("src/Program.cs");
    expect(uriToWorkspacePath(workspace, pathToUri(file))).toBe("src/Program.cs");
  });
});
