import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { LspSession } from "../../src/lspSession.js";
import { createSessionConfig, resolveExecutable } from "../../src/serverConfig.js";

const csharpLs = resolveExecutable("csharp-ls");
const hasCsharpLs = csharpLs !== "csharp-ls" && fs.existsSync(csharpLs);
const maybeDescribe = hasCsharpLs ? describe : describe.skip;

maybeDescribe("real C# fixture with csharp-ls", () => {
  it("queries SDK-style project features", async () => {
    const workspace = path.resolve("tests/real-lsp/fixtures/sdk-project");
    const session = makeRealSession(workspace);
    await session.start();

    try {
      const definition = await session.execute({
        version: 1,
        operation: "definition",
        file: "Program.cs",
        line: 2,
        character: 27,
        timeoutMs: 60_000
      });
      const references = await session.execute({
        version: 1,
        operation: "references",
        file: "Program.cs",
        line: 5,
        character: 18,
        timeoutMs: 60_000
      });
      const hover = await session.execute({
        version: 1,
        operation: "hover",
        file: "Program.cs",
        line: 4,
        character: 21,
        timeoutMs: 60_000
      });
      const symbols = await session.execute({
        version: 1,
        operation: "documentSymbols",
        file: "Program.cs",
        timeoutMs: 60_000
      });
      const diagnostics = await session.execute({
        version: 1,
        operation: "diagnostics",
        file: "Program.cs",
        timeoutMs: 60_000
      });

      expect(JSON.stringify(definition)).toContain("Program.cs");
      expect(JSON.stringify(references)).toContain("Program.cs");
      expect(JSON.stringify(hover)).toContain("Greeter");
      expect(JSON.stringify(symbols)).toContain("Greeter");
      expect(JSON.stringify(diagnostics)).toContain("Program.cs");
    } finally {
      await session.shutdown();
    }
  });
});

const hasLegacyTooling =
  process.platform === "win32"
    ? spawnSync("where.exe", ["msbuild"], { stdio: "ignore" }).status === 0
    : spawnSync("which", ["msbuild"], { stdio: "ignore" }).status === 0 ||
      spawnSync("which", ["xbuild"], { stdio: "ignore" }).status === 0;
const maybeLegacyDescribe = hasCsharpLs && hasLegacyTooling ? describe : describe.skip;

maybeLegacyDescribe("legacy net48 fixture with csharp-ls", () => {
  it("starts against a legacy project when MSBuild tooling is present", async () => {
    const workspace = path.resolve("tests/real-lsp/fixtures/legacy-net48");
    const session = makeRealSession(workspace);
    await session.start();

    try {
      const symbols = await session.execute({
        version: 1,
        operation: "documentSymbols",
        file: "Program.cs",
        timeoutMs: 60_000
      });
      expect(JSON.stringify(symbols)).toContain("Program");
    } finally {
      await session.shutdown();
    }
  });
});

function makeRealSession(workspace: string): LspSession {
  return new LspSession(
    createSessionConfig(workspace, {
      kind: "csharp-ls",
      command: csharpLs,
      resolvedCommand: csharpLs,
      args: []
    })
  );
}
