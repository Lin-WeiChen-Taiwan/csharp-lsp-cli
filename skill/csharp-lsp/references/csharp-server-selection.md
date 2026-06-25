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

Legacy .NET Framework projects on Windows usually need .NET Framework runtime
and Visual Studio Build Tools/MSBuild. On macOS/Linux, legacy projects may need
Mono with MSBuild.

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
