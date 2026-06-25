import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const hasDist = fs.existsSync(path.resolve("dist/cli.js"));
const maybeDescribe = hasDist ? describe : describe.skip;

maybeDescribe("release tarball", () => {
  it("packs only published files and installs the bin", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "csharp-lsp-pack-"));
    const pack = runNpm(["pack", "--json", "--pack-destination", temp]);
    expect(pack.status, pack.error?.message ?? pack.stderr).toBe(0);

    const packResult = JSON.parse(pack.stdout) as Array<{
      filename: string;
      files: Array<{ path: string }>;
    }>;
    const tarball = path.join(temp, packResult[0]?.filename ?? "");
    const packedFiles = new Set(packResult[0]?.files.map((file) => file.path));

    expect(packedFiles.has("dist/cli.js")).toBe(true);
    expect(packedFiles.has("README.md")).toBe(true);
    expect(packedFiles.has("LICENSE")).toBe(true);
    expect([...packedFiles].some((file) => file.startsWith("skill/csharp-lsp/"))).toBe(true);
    expect([...packedFiles].some((file) => file.startsWith("src/"))).toBe(false);
    expect([...packedFiles].some((file) => file.startsWith("tests/"))).toBe(false);

    const installRoot = path.join(temp, "install");
    const install = runNpm(["install", "--prefix", installRoot, tarball]);
    expect(install.status, install.error?.message ?? install.stderr).toBe(0);

    const bin = process.platform === "win32"
      ? path.join(installRoot, "node_modules", ".bin", "csharp-lsp-cli.cmd")
      : path.join(installRoot, "node_modules", ".bin", "csharp-lsp-cli");
    const version = runInstalledBin(bin, ["--version"]);
    expect(version.status, version.stderr).toBe(0);
    expect(JSON.parse(version.stdout)).toMatchObject({
      version: 1,
      ok: true,
      result: { version: "0.1.0" }
    });
  });
});

function runNpm(args: string[]): ReturnType<typeof spawnSync> {
  if (process.env.npm_execpath !== undefined) {
    return spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
  }

  return spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32"
  });
}

function runInstalledBin(bin: string, args: string[]): ReturnType<typeof spawnSync> {
  if (process.platform !== "win32") {
    return spawnSync(bin, args, { encoding: "utf8" });
  }

  const command = ["call", bin, ...args].join(" ");
  return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", command], {
    encoding: "utf8"
  });
}
