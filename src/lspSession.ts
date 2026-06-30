import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection
} from "vscode-jsonrpc/node";
import type { LspCliRequest } from "./schema.js";
import type { SessionConfig } from "./serverConfig.js";
import { CliError } from "./errors.js";
import { pathToUri, resolveWorkspacePath } from "./pathUtils.js";
import { toLspPosition } from "./position.js";
import {
  normalizeDiagnostics,
  normalizeDocumentSymbols,
  normalizeHover,
  normalizeLocationResult,
  normalizePullDiagnostics,
  normalizeWorkspaceSymbols
} from "./normalize.js";

interface OpenDocument {
  uri: string;
  filePath: string;
  version: number;
  contentHash: string;
  lastUsed: number;
}

interface PublishDiagnosticsParams {
  uri: string;
  diagnostics: unknown[];
}

interface InitializeResult {
  capabilities?: {
    diagnosticProvider?: unknown;
    [key: string]: unknown;
  };
}

const defaultRequestTimeoutMs = 30_000;
const defaultDocumentIdleMs = 10 * 60_000;

export class LspSession {
  private readonly openDocuments = new Map<string, OpenDocument>();
  private readonly diagnosticsByUri = new Map<string, unknown[]>();
  private connection: MessageConnection | undefined;
  private child: ChildProcessWithoutNullStreams | undefined;
  private capabilities: InitializeResult["capabilities"] = {};
  private crashed = false;
  private closeTimer: NodeJS.Timeout | undefined;

  public constructor(private readonly config: SessionConfig) {}

  public get hash(): string {
    return this.config.hash;
  }

  public async start(): Promise<void> {
    if (this.connection !== undefined) {
      return;
    }

    this.crashed = false;
    const child = spawn(this.config.server.command, this.config.server.args, {
      cwd: this.config.workspace,
      env: {
        ...process.env,
        ...(this.config.server.env ?? {})
      },
      stdio: "pipe",
      windowsHide: true
    });
    this.child = child;

    child.once("error", (error) => {
      this.crashed = true;
      process.stderr.write(`[csharp-lsp-cli] LSP spawn error: ${error.message}\n`);
    });

    child.once("exit", (code, signal) => {
      this.crashed = true;
      this.connection?.dispose();
      this.connection = undefined;
      process.stderr.write(
        `[csharp-lsp-cli] LSP exited code=${String(code)} signal=${String(signal)}\n`
      );
    });

    const connection = createMessageConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin),
      {
        error: (message) => process.stderr.write(`[csharp-lsp-cli] ${message}\n`),
        warn: (message) => process.stderr.write(`[csharp-lsp-cli] ${message}\n`),
        info: (message) => process.stderr.write(`[csharp-lsp-cli] ${message}\n`),
        log: (message) => process.stderr.write(`[csharp-lsp-cli] ${message}\n`)
      }
    );

    connection.onNotification(
      "textDocument/publishDiagnostics",
      (params: PublishDiagnosticsParams) => {
        this.diagnosticsByUri.set(params.uri, params.diagnostics);
      }
    );
    connection.listen();
    this.connection = connection;

    const initializeResult = await withTimeout(
      connection.sendRequest<InitializeResult>("initialize", {
        processId: process.pid,
        rootPath: this.config.workspace,
        rootUri: pathToUri(this.config.workspace),
        capabilities: clientCapabilities(),
        workspaceFolders: [
          {
            uri: pathToUri(this.config.workspace),
            name: path.basename(this.config.workspace)
          }
        ]
      }),
      this.config.initializeTimeoutMs,
      "INITIALIZE_TIMEOUT"
    );
    this.capabilities = initializeResult.capabilities ?? {};
    await this.sendNotification("initialized", {});
    this.startCloseTimer();
  }

  public async shutdown(): Promise<void> {
    this.closeTimer?.close();
    this.closeTimer = undefined;

    const connection = this.connection;
    this.connection = undefined;
    if (connection !== undefined) {
      try {
        await withTimeout(connection.sendRequest("shutdown"), 3_000, "SHUTDOWN_TIMEOUT");
        await this.sendNotification("exit", undefined, connection);
      } catch {
        await this.sendNotification("exit", undefined, connection);
      } finally {
        connection.dispose();
      }
    }

    if (this.child !== undefined && this.child.exitCode === null) {
      this.child.kill();
    }
    this.child = undefined;
    this.openDocuments.clear();
  }

  public async restart(): Promise<void> {
    await this.shutdown();
    this.diagnosticsByUri.clear();
    await this.start();
  }

  public async execute(request: LspCliRequest): Promise<unknown> {
    await this.ensureStarted();

    switch (request.operation) {
      case "definition":
        return this.definition(request);
      case "references":
        return this.references(request);
      case "hover":
        return this.hover(request);
      case "documentSymbols":
        return this.documentSymbols(request);
      case "workspaceSymbols":
        return this.workspaceSymbols(request);
      case "diagnostics":
        return this.diagnostics(request);
      case "status":
        return this.status();
      case "restart":
        await this.restart();
        return this.status();
      case "stop":
        await this.shutdown();
        return { stopped: true };
    }
  }

  private async definition(request: LspCliRequest): Promise<unknown> {
    const document = await this.prepareDocument(request);
    const result = await this.sendLspRequest(request, "textDocument/definition", {
      textDocument: { uri: document.uri },
      position: toLspPosition({
        line: request.line ?? 1,
        character: request.character ?? 1
      })
    });
    return normalizeLocationResult(this.config.workspace, result);
  }

  private async references(request: LspCliRequest): Promise<unknown> {
    const document = await this.prepareDocument(request);
    const result = await this.sendLspRequest(request, "textDocument/references", {
      textDocument: { uri: document.uri },
      position: toLspPosition({
        line: request.line ?? 1,
        character: request.character ?? 1
      }),
      context: {
        includeDeclaration: request.includeDeclaration ?? true
      }
    });
    return normalizeLocationResult(this.config.workspace, result);
  }

  private async hover(request: LspCliRequest): Promise<unknown> {
    const document = await this.prepareDocument(request);
    const result = await this.sendLspRequest(request, "textDocument/hover", {
      textDocument: { uri: document.uri },
      position: toLspPosition({
        line: request.line ?? 1,
        character: request.character ?? 1
      })
    });
    return normalizeHover(this.config.workspace, result);
  }

  private async documentSymbols(request: LspCliRequest): Promise<unknown> {
    const document = await this.prepareDocument(request);
    const result = await this.sendLspRequest(request, "textDocument/documentSymbol", {
      textDocument: { uri: document.uri }
    });
    return normalizeDocumentSymbols(this.config.workspace, result);
  }

  private async workspaceSymbols(request: LspCliRequest): Promise<unknown> {
    const result = await this.sendLspRequest(request, "workspace/symbol", {
      query: request.query ?? ""
    });
    return normalizeWorkspaceSymbols(this.config.workspace, result);
  }

  private async diagnostics(request: LspCliRequest): Promise<unknown> {
    if (request.file !== undefined) {
      const document = await this.prepareDocument(request);
      if (this.capabilities?.diagnosticProvider !== undefined) {
        const result = await this.sendLspRequest(request, "textDocument/diagnostic", {
          textDocument: { uri: document.uri }
        });
        return normalizePullDiagnostics(this.config.workspace, document.uri, result);
      }
      return normalizeDiagnostics(
        this.config.workspace,
        this.diagnosticsByUri as Map<string, never[]>,
        document.uri
      );
    }

    return normalizeDiagnostics(
      this.config.workspace,
      this.diagnosticsByUri as Map<string, never[]>
    );
  }

  private status(): unknown {
    return {
      session: this.config.hash,
      workspace: this.config.workspace,
      server: this.config.server,
      running: this.connection !== undefined && !this.crashed,
      openDocuments: this.openDocuments.size,
      diagnosticsDocuments: this.diagnosticsByUri.size
    };
  }

  private async ensureStarted(): Promise<void> {
    if (this.connection === undefined || this.crashed) {
      throw new CliError("LSP_SERVER_EXITED", "LSP server is not running.");
    }
  }

  private async prepareDocument(request: LspCliRequest): Promise<OpenDocument> {
    if (request.file === undefined) {
      throw new CliError("INVALID_REQUEST", `${request.operation} requires file.`);
    }

    const filePath = resolveWorkspacePath(this.config.workspace, request.file);
    const uri = pathToUri(filePath);
    const text = await fs.promises.readFile(filePath, "utf8");
    const contentHash = createHash("sha256").update(text).digest("hex");
    const existing = this.openDocuments.get(uri);
    const now = Date.now();

    if (existing === undefined) {
      const document: OpenDocument = {
        uri,
        filePath,
        version: 1,
        contentHash,
        lastUsed: now
      };
      await this.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: languageIdFor(filePath),
          version: document.version,
          text
        }
      });
      this.openDocuments.set(uri, document);
      return document;
    }

    existing.lastUsed = now;
    if (existing.contentHash !== contentHash) {
      existing.version += 1;
      existing.contentHash = contentHash;
      await this.sendNotification("textDocument/didChange", {
        textDocument: {
          uri,
          version: existing.version
        },
        contentChanges: [{ text }]
      });
    }

    return existing;
  }

  private async sendLspRequest(
    request: LspCliRequest,
    method: string,
    params: unknown
  ): Promise<unknown> {
    const connection = this.connection;
    if (connection === undefined || this.crashed) {
      throw new CliError("LSP_SERVER_EXITED", "LSP server is not running.");
    }

    try {
      return await withTimeout(
        connection.sendRequest(method, params),
        request.timeoutMs ?? defaultRequestTimeoutMs,
        "LSP_REQUEST_TIMEOUT"
      );
    } catch (error) {
      throw new CliError("LSP_REQUEST_FAILED", `${method} failed.`, {
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private startCloseTimer(): void {
    if (this.closeTimer !== undefined) {
      return;
    }

    const documentIdleMs = Number.parseInt(
      process.env.CSHARP_LSP_CLI_DOCUMENT_IDLE_MS ?? "",
      10
    ) || defaultDocumentIdleMs;
    this.closeTimer = setInterval(() => {
      void this.closeIdleDocuments(documentIdleMs);
    }, Math.min(documentIdleMs, 60_000));
    this.closeTimer.unref();
  }

  private async closeIdleDocuments(documentIdleMs: number): Promise<void> {
    const now = Date.now();
    for (const [uri, document] of this.openDocuments) {
      if (now - document.lastUsed < documentIdleMs) {
        continue;
      }

      await this.sendNotification("textDocument/didClose", {
        textDocument: { uri }
      });
      this.openDocuments.delete(uri);
    }
  }

  private async sendNotification(
    method: string,
    params?: unknown,
    connection = this.connection
  ): Promise<void> {
    if (connection === undefined) {
      return;
    }

    try {
      await connection.sendNotification(method, params);
    } catch (error) {
      process.stderr.write(
        `[csharp-lsp-cli] notification ${method} failed: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
    }
  }
}

function clientCapabilities(): unknown {
  return {
    textDocument: {
      definition: { linkSupport: true },
      references: {},
      hover: {
        contentFormat: ["markdown", "plaintext"]
      },
      documentSymbol: {
        hierarchicalDocumentSymbolSupport: true
      },
      publishDiagnostics: {
        relatedInformation: true,
        versionSupport: true,
        codeDescriptionSupport: true,
        dataSupport: true
      },
      diagnostic: {
        dynamicRegistration: false,
        relatedDocumentSupport: false
      },
      synchronization: {
        dynamicRegistration: false,
        willSave: false,
        willSaveWaitUntil: false,
        didSave: false
      }
    },
    workspace: {
      symbol: {
        resolveSupport: {
          properties: ["location.range"]
        }
      },
      workspaceFolders: true,
      configuration: true
    }
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  code: string
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new CliError(code, `operation timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    timeout?.close();
  }
}

function languageIdFor(filePath: string): string {
  return path.extname(filePath).toLowerCase() === ".cs" ? "csharp" : "csharp";
}
