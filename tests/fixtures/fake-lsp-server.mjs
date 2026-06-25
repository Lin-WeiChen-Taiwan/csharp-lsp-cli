#!/usr/bin/env node
import fs from "node:fs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const mode = args.get("--mode") ?? "normal";
const marker = args.get("--marker");
let input = Buffer.alloc(0);
const openDocuments = new Map();

process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  drain();
});

function drain() {
  while (true) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      return;
    }

    const header = input.slice(0, headerEnd).toString("ascii");
    const match = /Content-Length: (\d+)/i.exec(header);
    if (!match) {
      process.exit(2);
    }

    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (input.length < bodyEnd) {
      return;
    }

    const body = input.slice(bodyStart, bodyEnd).toString("utf8");
    input = input.slice(bodyEnd);
    handle(JSON.parse(body));
  }
}

function handle(message) {
  if (message.method === "initialize") {
    respond(message.id, {
      capabilities: {
        definitionProvider: true,
        referencesProvider: true,
        hoverProvider: true,
        documentSymbolProvider: true,
        workspaceSymbolProvider: true,
        textDocumentSync: 2,
        ...(mode === "diagnostic-provider"
          ? { diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } }
          : {})
      }
    });
    return;
  }

  if (message.method === "initialized") {
    return;
  }

  if (message.method === "textDocument/didOpen") {
    const uri = message.params.textDocument.uri;
    openDocuments.set(uri, message.params.textDocument.text);
    publishDiagnostics(uri, "fake diagnostic");
    return;
  }

  if (message.method === "textDocument/didChange") {
    const uri = message.params.textDocument.uri;
    openDocuments.set(uri, message.params.contentChanges[0].text);
    publishDiagnostics(uri, "changed diagnostic");
    return;
  }

  if (message.method === "textDocument/didClose") {
    openDocuments.delete(message.params.textDocument.uri);
    return;
  }

  if (message.method === "textDocument/definition") {
    if (mode === "crash-definition-once" && marker && !fs.existsSync(marker)) {
      fs.writeFileSync(marker, "crashed");
      process.exit(42);
    }
    respond(message.id, location(message.params.textDocument.uri));
    return;
  }

  if (message.method === "textDocument/references") {
    respond(message.id, [
      location(message.params.textDocument.uri),
      {
        uri: message.params.textDocument.uri,
        range: {
          start: { line: 3, character: 4 },
          end: { line: 3, character: 11 }
        }
      }
    ]);
    return;
  }

  if (message.method === "textDocument/hover") {
    if (mode === "timeout-hover") {
      return;
    }
    respond(message.id, {
      contents: { kind: "markdown", value: "**Program**" },
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 7 }
      }
    });
    return;
  }

  if (message.method === "textDocument/documentSymbol") {
    respond(message.id, [
      {
        name: "Program",
        kind: 5,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 4, character: 1 }
        },
        selectionRange: {
          start: { line: 0, character: 13 },
          end: { line: 0, character: 20 }
        }
      }
    ]);
    return;
  }

  if (message.method === "workspace/symbol") {
    respond(message.id, [
      {
        name: "Program",
        kind: 5,
        location: location(process.argv[1])
      }
    ]);
    return;
  }

  if (message.method === "textDocument/diagnostic") {
    respond(message.id, {
      kind: "full",
      items: [diagnostic("pull diagnostic")]
    });
    return;
  }

  if (message.method === "shutdown") {
    respond(message.id, null);
    return;
  }

  if (message.method === "exit") {
    process.exit(0);
  }
}

function location(uri) {
  return {
    uri,
    range: {
      start: { line: 1, character: 2 },
      end: { line: 1, character: 9 }
    }
  };
}

function diagnostic(message) {
  return {
    range: {
      start: { line: 0, character: 1 },
      end: { line: 0, character: 2 }
    },
    severity: 1,
    source: "fake-lsp",
    message
  };
}

function publishDiagnostics(uri, message) {
  send({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: {
      uri,
      diagnostics: [diagnostic(message)]
    }
  });
}

function respond(id, result) {
  send({
    jsonrpc: "2.0",
    id,
    result
  });
}

function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}
