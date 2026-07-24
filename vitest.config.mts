import { defineConfig } from "vitest/config";
// Named .mts, not .ts. package.json has no "type": "module", so a .ts config is
// loaded through vitest/dist/config.cjs, which require()s vite - and vite ships
// ESM only. On Node 20 that is ERR_REQUIRE_ESM and vitest never starts; on Node
// 22 require(esm) is supported so it passed. CI Audit runs 20.11.1 and the deploy
// runs 22.x, which is exactly why one was red and the other green. A .mts config
// is always loaded as ESM, so neither Node version takes the require path.

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
  },
});
