import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const cliPath = path.resolve("dist/cli.js");
const hasDist = fs.existsSync(cliPath);
const maybeDescribe = hasDist ? describe : describe.skip;

maybeDescribe("CLI daemon smoke", () => {
  it("starts a daemon, queries a fake LSP server, and stops the session", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-lsp-cli-smoke-"));
    const stateDir = path.join(workspace, ".state");
    fs.mkdirSync(path.join(workspace, "src"));
    fs.writeFileSync(
      path.join(workspace, "src", "Program.cs"),
      "public class Program\n{\n    static void Main() {}\n}\n"
    );

    const serverArgs = [
      path.resolve("tests/fixtures/fake-lsp-server.mjs"),
      "--mode",
      "normal"
    ];
    const env = {
      ...process.env,
      CSHARP_LSP_CLI_STATE_DIR: stateDir,
      CSHARP_LSP_CLI_DAEMON_IDLE_MS: "5000"
    };

    const definition = runCli(
      {
        version: 1,
        operation: "definition",
        workspace,
        file: "src/Program.cs",
        line: 1,
        character: 14,
        lspServerKind: "custom",
        lspServerPath: process.execPath,
        lspServerArgs: serverArgs
      },
      env
    );

    expect(definition.status, definition.stderr).toBe(0);
    expect(JSON.parse(definition.stdout)).toMatchObject({
      version: 1,
      ok: true,
      operation: "definition",
      result: {
        path: "src/Program.cs"
      }
    });

    const stop = runCli(
      {
        version: 1,
        operation: "stop",
        workspace,
        lspServerKind: "custom",
        lspServerPath: process.execPath,
        lspServerArgs: serverArgs
      },
      env
    );

    expect(stop.status, stop.stderr).toBe(0);
    expect(JSON.parse(stop.stdout)).toMatchObject({
      version: 1,
      ok: true,
      operation: "stop",
      result: { stopped: true }
    });
  });
});

function runCli(request: unknown, env: NodeJS.ProcessEnv): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [cliPath], {
    input: JSON.stringify(request),
    encoding: "utf8",
    env
  });
}
