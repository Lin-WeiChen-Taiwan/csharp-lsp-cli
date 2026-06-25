import { describe, expect, it } from "vitest";
import { createSessionConfig, resolveServerConfig } from "../../src/serverConfig.js";

describe("session hash", () => {
  it("is stable for equivalent workspace and server config", () => {
    const server = resolveServerConfig({
      version: 1,
      operation: "status",
      lspServerPath: "csharp-ls",
      lspServerArgs: ["--loglevel", "error"]
    });
    const a = createSessionConfig("C:/repo/project", server);
    const b = createSessionConfig("C:/repo/project", server);

    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it("changes when server args change", () => {
    const a = createSessionConfig(
      "C:/repo/project",
      resolveServerConfig({
        version: 1,
        operation: "status",
        lspServerPath: "csharp-ls",
        lspServerArgs: ["a"]
      })
    );
    const b = createSessionConfig(
      "C:/repo/project",
      resolveServerConfig({
        version: 1,
        operation: "status",
        lspServerPath: "csharp-ls",
        lspServerArgs: ["b"]
      })
    );

    expect(a.hash).not.toBe(b.hash);
  });
});
