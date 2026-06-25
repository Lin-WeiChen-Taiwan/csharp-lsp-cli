import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LspSession } from "../../src/lspSession.js";
import { createSessionConfig } from "../../src/serverConfig.js";
import { handleRequest } from "../../src/daemon.js";
import type { LspCliRequest } from "../../src/schema.js";

const fakeServer = path.resolve("tests/fixtures/fake-lsp-server.mjs");

let workspace: string;
let session: LspSession | undefined;

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-lsp-fake-"));
  fs.mkdirSync(path.join(workspace, "src"));
  fs.writeFileSync(
    path.join(workspace, "src", "Program.cs"),
    "public class Program\n{\n    static void Main() {}\n}\n"
  );
});

afterEach(async () => {
  await session?.shutdown();
  session = undefined;
});

describe("fake LSP server integration", () => {
  it("frames stdio, initializes, opens documents, and normalizes definition", async () => {
    session = makeSession(["--mode", "normal"]);
    await session.start();

    const result = await session.execute(positionRequest("definition"));

    expect(result).toEqual({
      uri: expect.stringMatching(/^file:/),
      path: "src/Program.cs",
      range: {
        start: { line: 2, character: 3 },
        end: { line: 2, character: 10 }
      }
    });
  });

  it("sends didChange when disk content changes", async () => {
    session = makeSession(["--mode", "normal"]);
    await session.start();

    await session.execute(positionRequest("definition"));
    fs.writeFileSync(
      path.join(workspace, "src", "Program.cs"),
      "public class Program\n{\n    static void Main() { }\n}\n"
    );
    await session.execute(positionRequest("definition"));
    await delay(50);

    const diagnostics = await session.execute({
      version: 1,
      operation: "diagnostics",
      file: "src/Program.cs"
    });

    expect(JSON.stringify(diagnostics)).toContain("changed diagnostic");
  });

  it("returns push diagnostics", async () => {
    session = makeSession(["--mode", "normal"]);
    await session.start();

    await session.execute(positionRequest("definition"));
    await delay(50);
    const diagnostics = await session.execute({
      version: 1,
      operation: "diagnostics",
      file: "src/Program.cs"
    });

    expect(JSON.stringify(diagnostics)).toContain("fake diagnostic");
  });

  it("returns pull diagnostics when the server advertises diagnosticProvider", async () => {
    session = makeSession(["--mode", "diagnostic-provider"]);
    await session.start();

    const diagnostics = await session.execute({
      version: 1,
      operation: "diagnostics",
      file: "src/Program.cs"
    });

    expect(JSON.stringify(diagnostics)).toContain("pull diagnostic");
  });

  it("times out slow LSP requests", async () => {
    session = makeSession(["--mode", "timeout-hover"]);
    await session.start();

    await expect(
      session.execute({
        ...positionRequest("hover"),
        timeoutMs: 25
      })
    ).rejects.toThrow(/textDocument\/hover failed/);
  });

  it("restarts once after an LSP crash", async () => {
    const marker = path.join(workspace, "crash-marker");
    session = makeSession(["--mode", "crash-definition-once", "--marker", marker]);
    await session.start();

    const response = await handleRequest(
      session,
      JSON.stringify({ request: positionRequest("definition") })
    );

    expect(response.ok).toBe(true);
    expect(response.retried).toBe(true);
    expect(JSON.stringify(response.result)).toContain("src/Program.cs");
  });
});

function makeSession(args: string[]): LspSession {
  return new LspSession(
    createSessionConfig(workspace, {
      kind: "custom",
      command: process.execPath,
      resolvedCommand: process.execPath,
      args: [fakeServer, ...args]
    })
  );
}

function positionRequest(operation: "definition" | "references" | "hover"): LspCliRequest {
  return {
    version: 1,
    operation,
    file: "src/Program.cs",
    line: 1,
    character: 14
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
