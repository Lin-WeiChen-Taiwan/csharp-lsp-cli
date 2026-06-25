import { fsPathToWorkspacePath, uriToFsPath, uriToWorkspacePath } from "./pathUtils.js";
import { toExternalRange, type LspRange } from "./position.js";

interface LspLocation {
  uri: string;
  range: LspRange;
}

interface LspLocationLink {
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange: LspRange;
  originSelectionRange?: LspRange;
}

interface LspDiagnostic {
  range: LspRange;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
  tags?: number[];
}

interface LspSymbolInformation {
  name: string;
  kind: number;
  location?: LspLocation;
  containerName?: string;
}

interface LspDocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}

export function normalizeLocationResult(workspace: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeLocationLike(workspace, item));
  }

  return normalizeLocationLike(workspace, value);
}

export function normalizeHover(workspace: string, value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const hover = value as { contents?: unknown; range?: LspRange };
  return {
    contents: normalizeHoverContents(hover.contents),
    ...(hover.range === undefined
      ? {}
      : { range: toExternalRange(hover.range) }),
    workspace
  };
}

export function normalizeDocumentSymbols(workspace: string, value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => {
    if (isDocumentSymbol(item)) {
      return normalizeDocumentSymbol(item);
    }
    return normalizeSymbolInformation(workspace, item as LspSymbolInformation);
  });
}

export function normalizeWorkspaceSymbols(workspace: string, value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => normalizeSymbolInformation(workspace, item as LspSymbolInformation));
}

export function normalizeDiagnostics(
  workspace: string,
  diagnosticsByUri: Map<string, LspDiagnostic[]>,
  onlyUri?: string
): unknown {
  const entries = onlyUri === undefined
    ? [...diagnosticsByUri.entries()]
    : [[onlyUri, diagnosticsByUri.get(onlyUri) ?? []] as const];

  return entries.map(([uri, diagnostics]) => ({
    uri,
    path: uriToWorkspacePath(workspace, uri),
    diagnostics: diagnostics.map(normalizeDiagnostic)
  }));
}

export function normalizePullDiagnostics(
  workspace: string,
  uri: string,
  value: unknown
): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const result = value as { items?: LspDiagnostic[] };
  return [
    {
      uri,
      path: uriToWorkspacePath(workspace, uri),
      diagnostics: (result.items ?? []).map(normalizeDiagnostic)
    }
  ];
}

function normalizeLocationLike(workspace: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && "targetUri" in value) {
    const link = value as LspLocationLink;
    return {
      targetUri: link.targetUri,
      targetPath: uriToWorkspacePath(workspace, link.targetUri),
      targetRange: toExternalRange(link.targetRange),
      targetSelectionRange: toExternalRange(link.targetSelectionRange),
      ...(link.originSelectionRange === undefined
        ? {}
        : { originSelectionRange: toExternalRange(link.originSelectionRange) })
    };
  }

  const location = value as LspLocation;
  return {
    uri: location.uri,
    path: uriToWorkspacePath(workspace, location.uri),
    range: toExternalRange(location.range)
  };
}

function normalizeHoverContents(contents: unknown): string[] {
  if (contents === undefined || contents === null) {
    return [];
  }

  if (typeof contents === "string") {
    return [contents];
  }

  if (Array.isArray(contents)) {
    return contents.flatMap((item) => normalizeHoverContents(item));
  }

  if (typeof contents === "object") {
    const object = contents as { value?: unknown; language?: unknown };
    if (typeof object.value === "string") {
      return [object.value];
    }
  }

  return [String(contents)];
}

function isDocumentSymbol(value: unknown): value is LspDocumentSymbol {
  return (
    value !== null &&
    typeof value === "object" &&
    "range" in value &&
    "selectionRange" in value
  );
}

function normalizeDocumentSymbol(symbol: LspDocumentSymbol): unknown {
  return {
    name: symbol.name,
    ...(symbol.detail === undefined ? {} : { detail: symbol.detail }),
    kind: symbol.kind,
    range: toExternalRange(symbol.range),
    selectionRange: toExternalRange(symbol.selectionRange),
    children: (symbol.children ?? []).map(normalizeDocumentSymbol)
  };
}

function normalizeSymbolInformation(workspace: string, symbol: LspSymbolInformation): unknown {
  return {
    name: symbol.name,
    kind: symbol.kind,
    ...(symbol.containerName === undefined
      ? {}
      : { containerName: symbol.containerName }),
    ...(symbol.location === undefined
      ? {}
      : { location: normalizeLocationLike(workspace, symbol.location) })
  };
}

function normalizeDiagnostic(diagnostic: LspDiagnostic): unknown {
  return {
    range: toExternalRange(diagnostic.range),
    ...(diagnostic.severity === undefined ? {} : { severity: diagnostic.severity }),
    ...(diagnostic.code === undefined ? {} : { code: diagnostic.code }),
    ...(diagnostic.source === undefined ? {} : { source: diagnostic.source }),
    message: diagnostic.message,
    ...(diagnostic.tags === undefined ? {} : { tags: diagnostic.tags })
  };
}

export function normalizeUriWorkspacePath(workspace: string, uri: string): string {
  return fsPathToWorkspacePath(workspace, uriToFsPath(uri));
}
