/**
 * Shim for dev server — `src/world/generated-world.ts` is requested directly
 * as `/src/world/generated-world.ts` by Vite HMR/sourcemap. The real
 * implementation lives in `src/world/generated-world/index.ts`.
 * Keeping both a file and a directory with the same base name is allowed
 * (`generated-world.ts` vs `generated-world/`).
 */
export * from "./generated-world/index.ts";
