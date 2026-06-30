import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  daemonResponseTimeoutMs,
  daemonStartupDeadlineMs
} from "../../src/daemonClient.js";
import { createSessionConfig, resolveServerConfig } from "../../src/serverConfig.js";

describe("daemon client timeouts", () => {
  it("waits for the request timeout plus transport headroom", () => {
    expect(
      daemonResponseTimeoutMs({
        version: 1,
        operation: "status",
        timeoutMs: 180_000
      })
    ).toBe(185_000);
  });

  it("includes LSP initialize time in daemon startup deadline", () => {
    const workspace = path.resolve("workspace");
    const server = resolveServerConfig(
      {
        version: 1,
        operation: "status",
        lspServerKind: "omnisharp",
        solution: "Legacy.sln"
      },
      workspace
    );
    const session = createSessionConfig(workspace, server);

    expect(
      daemonStartupDeadlineMs(
        {
          version: 1,
          operation: "status"
        },
        session
      )
    ).toBe(215_000);
  });
});
