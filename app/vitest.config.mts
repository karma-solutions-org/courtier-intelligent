import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Resolves packages for the browser the way `ng build` does.
 *
 * The browser project's conditions reach Vite with the Node project's `node`
 * appended to the `browser` the Angular CLI asks for. A package's `exports`
 * then resolve by key order, so `@firebase/firestore`, `jspdf` and its `fflate`,
 * which list "node" first, hand over their Node builds -- importing
 * `@grpc/grpc-js` or `worker_threads`, or reading `process` at module scope.
 * The CLI also leaves `browser` out of the main fields, so `exceljs`, which
 * keeps its browser build there, resolves to its Node `main`.
 *
 * So `node` goes, and the main fields are the ones the application build uses.
 */
const resolveLikeNgBuild: Plugin = {
  name: 'resolve-like-ng-build',
  enforce: 'post',
  configEnvironment(_name, config) {
    if (!config.resolve?.conditions?.includes('browser')) {
      return;
    }
    config.resolve.conditions = config.resolve.conditions.filter(
      (condition) => condition !== 'node',
    );
    config.resolve.mainFields = ['es2020', 'es2015', 'browser', 'module', 'main'];
  },
};

export default defineConfig({
  plugins: [resolveLikeNgBuild],
  server: {
    watch: {
      // The Angular CLI rebuilds on change and reruns the tests itself, so it
      // turns Vite's file watcher off with `watch: null`. In watch mode Vitest
      // then sets `watch ??= {}`, which turns it back on over the whole
      // workspace -- crawling every build output left there before the first
      // test can run. Ignoring every path gives it nothing to watch, as the
      // CLI meant.
      ignored: () => true,
    },
  },
  test: {
    // Vitest keeps mocks between tests unless told otherwise,
    // which leaks call counts across a file.
    restoreMocks: true,
    slowTestThreshold: 1000,
    // Transitions make a retried assertion wait out the animation before the
    // computed style it reads is the one being asserted.
    setupFiles: ['./src/app/core/utils/unit-test-utils/no-animations.setup.ts'],
  },
});
