# C# LSP Server Selection

Default to `csharp-ls` unless there is a concrete reason to override it.

## `csharp-ls`

Use for most projects. It is a Roslyn-based LSP server and is the default for
this CLI. It is the best first choice for mixed support across SDK-style .NET,
.NET Core, and older targets such as .NET Framework 4.8 when suitable MSBuild
tooling is installed.

Typical request fields:

```json
{
  "lspServerKind": "csharp-ls"
}
```

No `lspServerArgs` are required by default.

## Roslyn Language Server

Use when the user explicitly wants the newer official Roslyn language server or
the environment has it installed and the project is modern .NET. The preset uses
`roslyn-language-server --stdio --autoLoadProjects`.

Typical request fields:

```json
{
  "lspServerKind": "roslyn"
}
```

## OmniSharp

Use as a legacy fallback when C# extension or older .NET Framework workflows
already depend on OmniSharp and `csharp-ls` cannot load the project. The preset
uses `omnisharp --languageserver`.

Typical request fields:

```json
{
  "lspServerKind": "omnisharp"
}
```

For repos with multiple `.sln` files, pass `solution` to force OmniSharp to load
one solution. The path may be absolute. If `workspace` is set, relative
solutions are resolved from that workspace; otherwise they are resolved from the
CLI current working directory:

```json
{
  "lspServerKind": "omnisharp",
  "solution": "C:/repo/legacy/LegacyApp.sln",
  "timeoutMs": 180000
}
```

The CLI adds `-s <solution>` to the OmniSharp command line. If `solution` is
present without `lspServerKind`, the CLI infers `omnisharp`.
If `workspace` is omitted, the CLI discovers it from `file`, then from
`solution` by walking up to `.git`; without `.git`, the `.sln` directory becomes
the workspace.

Legacy .NET Framework projects on Windows usually need .NET Framework runtime
and Visual Studio Build Tools/MSBuild. On macOS/Linux, legacy projects may need
Mono with MSBuild.

On Windows, the OmniSharp preset first checks
`CSHARP_LSP_CLI_OMNISHARP_PATH`, then `C:\dev\omnisharp\OmniSharp.exe`, then
falls back to `omnisharp` on PATH.

OmniSharp can take a while to initialize old-style MSBuild projects. Use
`timeoutMs` around 180000 for the first request against a legacy solution, and
prefer an absolute `solution` path when no explicit `workspace` is provided.

The CLI automatically tries to pin Visual Studio 2022 MSBuild through
OmniSharp's configuration environment variables. Override the MSBuild selection
per request when needed:

```json
{
  "lspServerKind": "omnisharp",
  "solution": "C:/repo/legacy/LegacyApp.sln",
  "omnisharpMsBuildPath": "C:/Program Files/Microsoft Visual Studio/2022/Community/MSBuild/Current/Bin",
  "omnisharpMsBuildName": "Visual Studio Community 2022",
  "timeoutMs": 180000
}
```

Set `omnisharpUseDefaultMsBuild` to `false` to let OmniSharp perform its own
MSBuild discovery. The same defaults can also be supplied globally with
`CSHARP_LSP_CLI_OMNISHARP_MSBUILD_PATH` and
`CSHARP_LSP_CLI_OMNISHARP_MSBUILD_NAME`.

## Custom Server

Use `custom` when a tool path is known exactly or a test fixture needs a fake
server.

```json
{
  "lspServerKind": "custom",
  "lspServerPath": "C:/tools/server.exe",
  "lspServerArgs": ["--stdio"]
}
```

The daemon session hash includes the resolved server path and args, so changing
server selection creates a separate long-lived session.
