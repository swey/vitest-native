/**
 * Alias expansion for jest-compat's synchronous requireActual. See
 * src/jest-compat/aliases.mjs — resolution goes through Node, which knows
 * nothing about resolve.alias.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- .mjs runtime module without types
import { expandAlias, parseAliasTable, resolveAliased } from "../src/jest-compat/aliases.mjs";

function fixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-alias-"));
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return root;
}

describe("parseAliasTable", () => {
  it("reads the serialized table", () => {
    expect(parseAliasTable('[{"find":"@/","replacement":"/src/"}]')).toEqual([
      { find: "@/", replacement: "/src/" },
    ]);
  });

  it("treats a missing or unreadable value as no aliases", () => {
    expect(parseAliasTable(undefined)).toEqual([]);
    expect(parseAliasTable("")).toEqual([]);
    expect(parseAliasTable("{not json")).toEqual([]);
    expect(parseAliasTable('{"find":"@/"}')).toEqual([]);
  });
});

describe("expandAlias", () => {
  const table = [
    { find: "@/components/", replacement: "/proj/src/ui/" },
    { find: "@/", replacement: "/proj/src/" },
    { regex: "^~assets/(.*)$", replacement: "/proj/assets/$1" },
  ];

  it("replaces a string prefix", () => {
    expect(expandAlias("@/services/orders", table)).toBe("/proj/src/services/orders");
  });

  it("applies the first match, so a longer prefix wins", () => {
    expect(expandAlias("@/components/button", table)).toBe("/proj/src/ui/button");
  });

  it("applies a serialized RegExp with its capture groups", () => {
    expect(expandAlias("~assets/logo.png", table)).toBe("/proj/assets/logo.png");
  });

  it("leaves anything else alone", () => {
    expect(expandAlias("react-native", table)).toBe("react-native");
    expect(expandAlias("@scope/package", table)).toBe("@scope/package");
    expect(expandAlias("./relative", table)).toBe("./relative");
  });

  it("ignores entries without a string replacement", () => {
    expect(expandAlias("@/x", [{ find: "@/", replacement: undefined } as never])).toBe("@/x");
  });
});

describe("resolveAliased", () => {
  it("finds the file behind an extensionless alias", () => {
    const root = fixture({ "src/services/orders.ts": "export const x = 1;\n" });
    const table = [{ find: "@/", replacement: `${root}/src/` }];

    expect(resolveAliased("@/services/orders", table)).toBe(
      path.join(root, "src/services/orders.ts"),
    );
  });

  it("finds an index file for a directory specifier", () => {
    const root = fixture({ "src/services/index.tsx": "export const x = 1;\n" });
    const table = [{ find: "@/", replacement: `${root}/src/` }];

    expect(resolveAliased("@/services", table)).toBe(path.join(root, "src/services/index.tsx"));
  });

  it("keeps an exact path as given", () => {
    const root = fixture({ "src/a.js": "module.exports = {};\n" });
    const table = [{ find: "@/", replacement: `${root}/src/` }];

    expect(resolveAliased("@/a.js", table)).toBe(path.join(root, "src/a.js"));
  });

  it("returns null when no alias matches, leaving resolution to the caller", () => {
    const table = [{ find: "@/", replacement: "/proj/src/" }];

    expect(resolveAliased("react-native", table)).toBeNull();
    expect(resolveAliased("@/missing", table)).toBeNull();
    expect(resolveAliased("anything", [])).toBeNull();
  });

  it("does not mistake a directory for a module", () => {
    const root = fixture({ "src/services/orders.ts": "export const x = 1;\n" });
    const table = [{ find: "@/", replacement: `${root}/src/` }];

    // `@/services` alone is a directory here, and there is no index file in it.
    expect(resolveAliased("@/services", table)).toBeNull();
  });
});

describe("plugin: handing the alias table to the worker", () => {
  const SERVE_ENV = { command: "serve", mode: "test" } as const;

  async function envFor(alias: unknown): Promise<Record<string, string>> {
    const { reactNative } = await import("../src/index.js");
    const plugin = reactNative({ engine: "mock" }) as any;
    const result = await plugin.config({ root: process.cwd(), resolve: { alias } }, SERVE_ENV);
    return result.test.env;
  }

  it("serializes string and RegExp entries, longest prefix first", async () => {
    const env = await envFor([
      { find: "@/", replacement: "/proj/src/" },
      { find: /^~assets\/(.*)$/, replacement: "/proj/assets/$1" },
      { find: "@/components/", replacement: "/proj/src/ui/" },
    ]);

    expect(JSON.parse(env.VITEST_NATIVE_ALIASES)).toEqual([
      { find: "@/components/", replacement: "/proj/src/ui/" },
      { find: "@/", replacement: "/proj/src/" },
      { regex: "^~assets\\/(.*)$", flags: "", replacement: "/proj/assets/$1" },
    ]);
  });

  it("accepts the object form as well", async () => {
    const env = await envFor({ "@": "/proj/src" });

    expect(JSON.parse(env.VITEST_NATIVE_ALIASES)).toEqual([
      { find: "@", replacement: "/proj/src" },
    ]);
  });

  it("stays out of the env when there is nothing usable to pass", async () => {
    expect((await envFor(undefined)).VITEST_NATIVE_ALIASES).toBeUndefined();
    expect(
      (await envFor([{ find: "@/", replacement: () => "/proj/src/" }])).VITEST_NATIVE_ALIASES,
    ).toBeUndefined();
  });
});
