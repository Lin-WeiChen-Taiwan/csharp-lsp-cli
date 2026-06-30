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

For workspaces with multiple solutions, load one solution with OmniSharp by
passing `solution`. The path can be absolute. If `workspace` is set, relative
solutions are resolved from `workspace`; otherwise they are resolved from the
CLI current working directory:

```json
{
  "version": 1,
  "operation": "status",
  "lspServerKind": "omnisharp",
  "solution": "C:/repo/app/App.sln",
  "timeoutMs": 180000
}
```

The OmniSharp preset starts the server with `--languageserver -s <solution>`.
When `workspace` is omitted, the CLI discovers it from `file`, then from
`solution` by walking up to `.git`; if no `.git` exists, it uses the `.sln`
directory.

On Windows, the OmniSharp preset first checks
`CSHARP_LSP_CLI_OMNISHARP_PATH`, then `C:\dev\omnisharp\OmniSharp.exe`, then
falls back to `omnisharp` on `PATH`.

Legacy .NET Framework solutions can take longer to initialize than SDK-style
projects, so the OmniSharp preset uses a longer initialize timeout by default.
For large solutions, pass a larger `timeoutMs` on the first request.

For OmniSharp on Windows, the CLI automatically tries to pin Visual Studio 2022
MSBuild through OmniSharp's configuration environment variables. Override it per
request when needed:

```json
{
  "version": 1,
  "operation": "status",
  "lspServerKind": "omnisharp",
  "solution": "C:/repo/app/App.sln",
  "omnisharpMsBuildPath": "C:/Program Files/Microsoft Visual Studio/2022/Community/MSBuild/Current/Bin",
  "omnisharpMsBuildName": "Visual Studio Community 2022",
  "timeoutMs": 180000
}
```

Set `omnisharpUseDefaultMsBuild` to `false` to disable the automatic VS2022
MSBuild override. The same defaults can also be set with
`CSHARP_LSP_CLI_OMNISHARP_MSBUILD_PATH` and
`CSHARP_LSP_CLI_OMNISHARP_MSBUILD_NAME`.

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
git tag vX.Y.Z
git push origin vX.Y.Z
```

The workflow uploads both the versioned npm tarball and a stable latest asset.
Install it globally from the stable latest URL instead of the npm registry:

```sh
npm install -g https://github.com/Lin-WeiChen-Taiwan/csharp-lsp-cli/releases/latest/download/csharp-lsp-cli.tgz
```

Then verify the command is on PATH:

```sh
csharp-lsp-cli --version
```

Use the versioned asset when you need a reproducible install.

Avoid running a local `npm install` from protected directories such as
`C:\Windows\System32`; npm will try to write `package-lock.json` in the current
directory.
