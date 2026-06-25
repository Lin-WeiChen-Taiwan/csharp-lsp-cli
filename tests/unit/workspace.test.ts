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

    expect(discoverWorkspace(cwd, { workspace: explicit, file: "x.cs" })).toBe(explicit);
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
});
