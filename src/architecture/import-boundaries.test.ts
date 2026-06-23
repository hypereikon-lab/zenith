import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const browserOwnedRoots = [
  "src/app",
  "src/artifacts",
  "src/ui",
  "src/stages",
  "src/graphics",
  "src/media",
  "src/sketch",
  "src/plates",
  "src/inpaint",
  "src/scene",
  "src/services",
  "src/runway",
];

const browserEntrypoints = [
  "src/App.svelte",
  "src/routes/+page.svelte",
  "src/routes/+layout.svelte",
  "src/routes/+layout.ts",
];
const browserScanRoots = [...browserOwnedRoots, ...browserEntrypoints];
const serverScanRoots = ["src/lib/server", "src/routes/api"];
const nodeBuiltinModuleNames = new Set(
  builtinModules.flatMap((moduleName) => [moduleName, moduleName.replace(/^node:/, "")]),
);

describe("production import boundaries", () => {
  test("keeps shared contracts portable and side-effect free", () => {
    const violations: string[] = [];

    for (const filePath of productionSourceFiles(["src/lib/shared"])) {
      const text = sourceText(filePath);
      for (const imported of moduleSpecifiers(filePath)) {
        const resolved = resolveRepoSpecifier(filePath, imported);
        if (isNodeBuiltin(imported)) {
          violations.push(`${repoRelative(filePath)} imports Node builtin ${imported}`);
        } else if (imported.startsWith("$env")) {
          violations.push(`${repoRelative(filePath)} imports environment module ${imported}`);
        } else if (imported.startsWith("$lib/server")) {
          violations.push(`${repoRelative(filePath)} imports server module ${imported}`);
        } else if (imported === "@openai/codex-sdk") {
          violations.push(`${repoRelative(filePath)} imports the Codex SDK`);
        } else if (imported.endsWith(".svelte") || imported.endsWith(".svelte.js")) {
          violations.push(`${repoRelative(filePath)} imports Svelte/runtime module ${imported}`);
        } else if (resolved && !isInRoot(resolved, "src/lib/shared")) {
          violations.push(`${repoRelative(filePath)} imports outside shared contracts via ${imported}`);
        } else if (!resolved && imported !== "zod") {
          violations.push(`${repoRelative(filePath)} imports unapproved package ${imported}`);
        }
      }

      for (const pattern of sharedRuntimePatterns) {
        if (pattern.regex.test(text)) {
          violations.push(`${repoRelative(filePath)} references ${pattern.label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("keeps browser-owned modules away from server-only effects", () => {
    const violations: string[] = [];

    for (const filePath of productionSourceFiles(browserScanRoots)) {
      for (const imported of moduleSpecifiers(filePath)) {
        const resolved = resolveRepoSpecifier(filePath, imported);
        if (isNodeBuiltin(imported)) {
          violations.push(`${repoRelative(filePath)} imports Node builtin ${imported}`);
        } else if (imported === "@openai/codex-sdk") {
          violations.push(`${repoRelative(filePath)} imports the Codex SDK`);
        } else if (imported.startsWith("$env/dynamic/private") || imported.startsWith("$env/static/private")) {
          violations.push(`${repoRelative(filePath)} imports private environment module ${imported}`);
        } else if (imported.startsWith("$lib/server") || (resolved && isInRoot(resolved, "src/lib/server"))) {
          violations.push(`${repoRelative(filePath)} imports server-only module ${imported}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("keeps server services and API routes away from browser-owned modules", () => {
    const violations: string[] = [];

    for (const filePath of productionSourceFiles(serverScanRoots)) {
      for (const imported of moduleSpecifiers(filePath)) {
        const resolved = resolveRepoSpecifier(filePath, imported);
        if (resolved && isInAnyRoot(resolved, browserOwnedRoots)) {
          violations.push(`${repoRelative(filePath)} imports browser-owned module ${imported}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

const sharedRuntimePatterns = [
  { label: "Blob/File runtime media", regex: /\b(Blob|File)\b/ },
  { label: "HTML canvas/image/video types", regex: /\b(HTMLCanvasElement|HTMLImageElement|HTMLVideoElement)\b/ },
  { label: "browser globals", regex: /\b(window|document|localStorage)\b/ },
  { label: "object URL creation", regex: /\bURL\.createObjectURL\b/ },
  { label: "network fetch", regex: /\bfetch\s*\(/ },
];

function productionSourceFiles(roots: string[]): string[] {
  return roots
    .flatMap((root) => sourceFilesInRoot(path.join(repoRoot, root)))
    .filter((filePath) => {
      if (!filePath.endsWith(".ts") && !filePath.endsWith(".svelte")) return false;
      if (filePath.endsWith(".test.ts") || filePath.endsWith(".d.ts")) return false;
      return true;
    });
}

function sourceFilesInRoot(root: string): string[] {
  if (!statSync(root).isDirectory()) return [root];
  return walk(root);
}

function walk(root: string): string[] {
  const entries = readdirSync(root);
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry);
    if (statSync(fullPath).isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function moduleSpecifiers(filePath: string): string[] {
  const sourceFile = ts.createSourceFile(
    repoRelative(filePath),
    sourceText(filePath),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      specifiers.push(stringLiteralValue(node.moduleSpecifier));
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) specifiers.push(argument.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function sourceText(filePath: string): string {
  const text = readFileSync(filePath, "utf8");
  if (!filePath.endsWith(".svelte")) return text;
  return [...text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join("\n");
}

function stringLiteralValue(node: ts.Node): string {
  if (ts.isStringLiteral(node)) return node.text;
  throw new Error(`Expected string literal module specifier in ${node.getSourceFile().fileName}`);
}

function resolveRepoSpecifier(importerPath: string, specifier: string): string | null {
  if (specifier.startsWith("$lib/")) {
    return normalizeRepoPath(path.join("src/lib", specifier.slice("$lib/".length)));
  }
  if (specifier.startsWith("src/")) {
    return normalizeRepoPath(specifier);
  }
  if (!specifier.startsWith(".")) return null;
  return normalizeRepoPath(path.resolve(path.dirname(importerPath), specifier));
}

function normalizeRepoPath(filePath: string): string {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

function repoRelative(filePath: string): string {
  return normalizeRepoPath(filePath);
}

function isInAnyRoot(filePath: string, roots: string[]): boolean {
  return roots.some((root) => isInRoot(filePath, root));
}

function isInRoot(filePath: string, root: string): boolean {
  return filePath === root || filePath.startsWith(`${root}/`);
}

function isNodeBuiltin(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  const normalized = specifier.replace(/^node:/, "");
  if (nodeBuiltinModuleNames.has(normalized)) return true;
  const root = normalized.split("/")[0];
  return nodeBuiltinModuleNames.has(root);
}
