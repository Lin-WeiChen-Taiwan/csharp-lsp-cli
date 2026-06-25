import net from "node:net";
import { Buffer } from "node:buffer";
import { pathToFileURL } from "node:url";
import { LspSession } from "./lspSession.js";
import { CliError, toErrorObject } from "./errors.js";
import type { LspCliRequest } from "./schema.js";
import type { SessionConfig } from "./serverConfig.js";

interface DaemonArgs {
  socketPath: string;
  session: SessionConfig;
}

const defaultDaemonIdleMs = 20 * 60_000;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const session = new LspSession(args.session);
  await session.start();

  let lastUsed = Date.now();
  let stopping = false;
  const server = net.createServer((socket) => {
    let buffer = "";
    let handled = false;
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (handled || !buffer.includes("\n")) {
        return;
      }
      handled = true;
      void (async () => {
        lastUsed = Date.now();
        const response = await handleRequest(session, buffer);
        socket.end(`${JSON.stringify(response)}\n`);
        if (response.stopped === true && !stopping) {
          stopping = true;
          server.close(() => {
            process.exit(0);
          });
        }
      })().catch((error) => {
        socket.end(
          `${JSON.stringify({
            ok: false,
            error: toErrorObject(error),
            retried: false
          })}\n`
        );
      });
    });
  });

  server.listen(args.socketPath);

  const idleMs = Number.parseInt(
    process.env.CSHARP_LSP_CLI_DAEMON_IDLE_MS ?? "",
    10
  ) || defaultDaemonIdleMs;
  const idleTimer = setInterval(() => {
    if (Date.now() - lastUsed < idleMs || stopping) {
      return;
    }
    stopping = true;
    void session.shutdown().finally(() => {
      server.close(() => {
        process.exit(0);
      });
    });
  }, Math.min(idleMs, 60_000));
  idleTimer.unref();
}

export async function handleRequest(
  session: LspSession,
  payload: string
): Promise<{ ok: boolean; result?: unknown; error?: unknown; retried: boolean; stopped?: boolean }> {
  let request: LspCliRequest;
  try {
    const parsed = JSON.parse(payload.trim()) as { request?: LspCliRequest };
    if (parsed.request === undefined) {
      throw new CliError("INVALID_DAEMON_REQUEST", "missing request.");
    }
    request = parsed.request;
  } catch (error) {
    return {
      ok: false,
      error: toErrorObject(error),
      retried: false
    };
  }

  let retried = false;
  try {
    const result = await session.execute(request);
    return {
      ok: true,
      result,
      retried,
      stopped: request.operation === "stop"
    };
  } catch (error) {
    if (isRetryable(error) && request.operation !== "stop") {
      retried = true;
      try {
        await session.restart();
        const result = await session.execute(request);
        return {
          ok: true,
          result,
          retried
        };
      } catch (retryError) {
        return {
          ok: false,
          error: toErrorObject(retryError),
          retried
        };
      }
    }

    return {
      ok: false,
      error: toErrorObject(error),
      retried
    };
  }
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof CliError &&
    [
      "LSP_SERVER_EXITED",
      "LSP_REQUEST_FAILED",
      "LSP_REQUEST_TIMEOUT",
      "INITIALIZE_TIMEOUT"
    ].includes(error.code)
  );
}

function parseArgs(argv: string[]): DaemonArgs {
  const socketIndex = argv.indexOf("--socket");
  const sessionIndex = argv.indexOf("--session");
  const socketPath = socketIndex >= 0 ? argv[socketIndex + 1] : undefined;
  const sessionPayload = sessionIndex >= 0 ? argv[sessionIndex + 1] : undefined;

  if (socketPath === undefined || sessionPayload === undefined) {
    throw new CliError("INVALID_DAEMON_ARGS", "daemon requires --socket and --session.");
  }

  const session = JSON.parse(
    Buffer.from(sessionPayload, "base64url").toString("utf8")
  ) as SessionConfig;
  return { socketPath, session };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`[csharp-lsp-cli] daemon failed: ${String(error)}\n`);
    process.exit(1);
  });
}
