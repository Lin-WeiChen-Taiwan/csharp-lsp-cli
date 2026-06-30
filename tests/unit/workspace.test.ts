import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverWorkspace } from "../../src/workspace.js";

describe("workspace discovery", () => {
  it("uses explicit workspace first", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-lsp-workspace-"));
    const cwd = path.join(root, "cwd");
    const explicit = path.join(root, "explicit");
    fs.mkdirSync(cwd);
    fs.mkdirSync(explicit);

    expect(
      discoverWorkspace(cwd, {
        workspace: explicit,
        file: "x.cs",
        solution: "App.sln"
      })
    ).toBe(explicit);
  });

  it("walks from target file to nearest .git", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-lsp-workspace-"));
    fs.mkdirSync(path.join(root, ".git"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    const file = path.join(root, "src", "Program.cs");
    fs.writeFileSync(file, "class Program {}\n");

    expect(discoverWorkspace(path.join(root, "src"), { file })).toBe(root);
  });

  it("falls back to cwd", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-lsp-workspace-"));
    expect(discoverWorkspace(root, {})).toBe(root);
  });

  it("walks from solution to nearest .git when workspace is omitted", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-lsp-workspace-"));
    fs.mkdirSync(path.join(root, ".git"));
    fs.mkdirSync(path.join(root, "solutions"), { recursive: true });
    const solution = path.join(root, "solutions", "App.sln");
    fs.writeFileSync(solution, "\n");

    expect(discoverWorkspace(os.tmpdir(), { solution })).toBe(root);
  });

  it("falls back to solution directory when no .git exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-lsp-workspace-"));
    const solutionDir = path.join(root, "solutions");
    fs.mkdirSync(solutionDir, { recursive: true });

    expect(discoverWorkspace(root, { solution: "solutions/App.sln" })).toBe(
      solutionDir
    );
  });
});
