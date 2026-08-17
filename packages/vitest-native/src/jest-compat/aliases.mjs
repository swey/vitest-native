// Alias expansion for jest-compat's synchronous requireActual/requireMock.
//
// Those two resolve through Node (createRequire), which knows nothing about
// `resolve.alias` — so `jest.requireActual('@/services/foo')` throws
// MODULE_NOT_FOUND even though the same specifier resolves everywhere else in
// the suite. That pattern is common in Jest suites migrated from React Native
// setups, where Babel maps tsconfig paths.
//
// The plugin serializes the alias table into VITEST_NATIVE_ALIASES at config
// time; the functions here expand a matching entry to a path Node can resolve.
import fs from "node:fs";

// Extensions Metro and TypeScript resolve for an extensionless specifier. Node
// only knows .js/.json/.node, so an alias pointing into a TS source tree needs
// these probed explicitly.
const SUFFIXES = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

/** Parses the serialized table; anything unreadable yields no aliases. */
export function parseAliasTable(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Applies the first matching alias, mirroring Vite's own semantics: a string
 * `find` is a prefix replacement, a serialized RegExp is applied as written.
 * Returns the specifier unchanged when nothing matches.
 */
export function expandAlias(specifier, table) {
  if (typeof specifier !== "string") return specifier;
  for (const entry of table) {
    if (typeof entry?.replacement !== "string") continue;
    if (typeof entry.regex === "string") {
      const pattern = new RegExp(entry.regex, entry.flags);
      if (pattern.test(specifier)) return specifier.replace(pattern, entry.replacement);
      continue;
    }
    if (typeof entry.find === "string" && entry.find && specifier.startsWith(entry.find)) {
      return entry.replacement + specifier.slice(entry.find.length);
    }
  }
  return specifier;
}

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    // A directory, a missing path, or an unreadable one: not a module file.
    return false;
  }
}

/**
 * The path an aliased specifier points at, or null when no alias matches or the
 * target does not exist. Callers keep their own resolution for that case, so a
 * miss here stays their MODULE_NOT_FOUND rather than becoming a different error.
 */
export function resolveAliased(specifier, table) {
  const expanded = expandAlias(specifier, table);
  if (expanded === specifier) return null;
  if (isFile(expanded)) return expanded;
  for (const suffix of SUFFIXES) {
    if (isFile(expanded + suffix)) return expanded + suffix;
  }
  return null;
}
