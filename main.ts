// main.ts — make.fun bounty runner for gta6-meme-x-01.
//
// Job: take POST.json from the repository root and publish a byte-for-byte
// copy into the output directory so the coordinator can pick it up after the
// user posts the real X status URL. Nothing else happens here: no network,
// no clock reads, no files touched outside the repo.
//
// Usage:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// On success it stays silent (exit 0). On any failure it prints a clear,
// single-line error to stderr and exits non-zero.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the directory that contains this script (the repo root). */
const repoRoot: string = dirname(fileURLToPath(import.meta.url));

/** Where POST.json is copied to. Defaults to <repoRoot>/out when unset. */
const outputDir: string =
  process.env.MAKEFUN_OUTPUT_DIR && process.env.MAKEFUN_OUTPUT_DIR.length > 0
    ? process.env.MAKEFUN_OUTPUT_DIR
    : join(repoRoot, "out");

const sourcePath: string = join(repoRoot, "POST.json");
const targetDir: string = isAbsolute(outputDir) ? outputDir : resolve(process.cwd(), outputDir);
const targetPath: string = join(targetDir, "POST.json");

function fail(message: string): never {
  process.stderr.write(`main.ts: ${message}\n`);
  process.exit(1);
}

if (!existsSync(sourcePath)) {
  fail(`missing source file ${sourcePath}`);
}

try {
  mkdirSync(targetDir, { recursive: true });
} catch (error) {
  fail(`could not create output directory ${targetDir}: ${(error as Error).message}`);
}

try {
  copyFileSync(sourcePath, targetPath);
} catch (error) {
  fail(`could not copy to ${targetPath}: ${(error as Error).message}`);
}
