# csharp-lsp-cli

`csharp-lsp-cli` is a TypeScript/Node ESM CLI that sends one JSON request to a
long-lived daemon. The daemon owns the C# language server process and speaks LSP
over stdio.

The package is private and intended for local tarball installs only.

## CLI

The public CLI accepts exactly:

- `--help`
- `--version`
- stdin JSON request with no command-line arguments

All modes write one JSON response to stdout. Human-readable errors and logs go to
stderr.

```json
{
  "version": 1,
  "operation": "definition",
  "workspace": "path/to/project",
  "file": "src/main.cs",
  "line": 10,
  "character": 5
}
```

External line and character values are 1-based. LSP positions are converted to
0-based internally.

## LSP servers

The default server is `csharp-ls`. Override it per request with
`lspServerPath`, `lspServerArgs`, or `lspServerKind`.

Useful presets:

- `csharp-ls`: default, good coverage for SDK-style projects and older targets
  such as .NET Framework 4.8 when the machine has suitable MSBuild tooling.
- `roslyn`: official Roslyn LSP style invocation with `--stdio --autoLoadProjects`.
- `omnisharp`: legacy fallback using `--languageserver`.

## Request operations

Supported operations are `definition`, `references`, `hover`,
`documentSymbols`, `workspaceSymbols`, `diagnostics`, `status`, `stop`, and
`restart`.

## Local install smoke

```sh
npm install
npm run build
npm test
npm pack --json
```

## GitHub release

Releases are built only by GitHub Actions when a tag matching `v*` is pushed.
`dist/` is generated in the workflow and is not committed.

```sh
git tag v0.1.0
git push origin v0.1.0
```

The workflow uploads the npm tarball to the GitHub Release. Install from that
tarball instead of the npm registry:

```sh
npm install https://github.com/Lin-WeiChen-Taiwan/csharp-lsp-cli/releases/download/v0.1.0/csharp-lsp-cli-0.1.0.tgz
```
