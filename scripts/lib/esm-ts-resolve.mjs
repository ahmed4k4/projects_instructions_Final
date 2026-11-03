/**
 * Resolve hook: let plain Node load code written for Vercel.
 *
 * Vercel ships the function as ESM, so its source imports
 * `../../src/server/geminiProxy.js` — correct there, because the compiled `.js`
 * exists. In this repo only `geminiProxy.ts` exists, so the harness maps
 * `.js` → `.ts` the way TypeScript's own resolver does.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith('.')) throw error;

    if (specifier.endsWith('.js')) {
      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    }
    if (!/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
