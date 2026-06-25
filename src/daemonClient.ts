import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { LspCliRequest } from "./schema.js";
import type { SessionConfig } from "./serverConfig.js";
import { getSocketPath, getStateDir } from "./serverConfig.js";
import { CliError } from "./errors.js";

interface DaemonIpcResponse {
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  retried: boolean;
}

export interface DaemonClientResponse extends DaemonIpcResponse {
  session: string;
}

export async function sendRequestToDaemon(
  session: SessionConfig,
  request: LspCliRequest
): Promise<DaemonClientResponse> {
  const socketPath = getSocketPath(session.hash);
  const existing = await trySend(socketPath, request, 1_000);
  if (existing !== undefined) {
    return { ...existing, session: session.hash };
  }

  await startDaemon(socketPath, session);

  const deadline = Date.now() + 65_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const response = await trySend(socketPath, request, 2_000).catch((error) => {
      lastError = error;
      return undefined;
    });
    if (response !== undefined) {
      return { ...response, session: session.hash };
    }
    await delay(100);
  }

  throw new CliError("DAEMON_START_FAILED", "daemon did not become ready.", {
    socketPath,
    lastError: lastError instanceof Error ? lastError.message : String(lastError)
  });
}

async function startDaemon(
  socketPath: string,
  session: SessionConfig
): Promise<void> {
  if (process.platform !== "win32") {
    fs.mkdirSync(path.dirname(socketPath), { recursive: true });
    if (fs.existsSync(socketPath)) {
      fs.rmSync(socketPath, { force: true });
    }
  } else {
    fs.mkdirSync(getStateDir(), { recursive: true });
  }

  const daemonPath = fileURLToPath(new URL("./daemon.js", import.meta.url));
  const sessionPayload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const child = spawn(
    process.execPath,
    [daemonPath, "--socket", socketPath, "--session", sessionPayload],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }
  );
  child.unref();
}

async function trySend(
  socketPath: string,
  request: LspCliRequest,
  timeoutMs: number
): Promise<DaemonIpcResponse | undefined> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let done = false;
    let buffer = "";

    const timeout = setTimeout(() => {
      finish(undefined);
      socket.destroy();
    }, timeoutMs);

    const finish = (response: DaemonIpcResponse | undefined): void => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timeout);
      resolve(response);
    };

    socket.once("connect", () => {
      socket.write(`${JSON.stringify({ request })}\n`);
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
    });

    socket.once("error", (error) => {
      if (
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ECONNREFUSED")
      ) {
        finish(undefined);
        return;
      }
      clearTimeout(timeout);
      reject(error);
    });

    socket.once("end", () => {
      if (done) {
        return;
      }
      try {
        const line = buffer.trim();
        if (line.length === 0) {
          finish(undefined);
          return;
        }
        finish(JSON.parse(line) as DaemonIpcResponse);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
