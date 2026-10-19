/// <reference types="vitest" />
/// <reference types="vite/client" />
import { defineConfig } from 'vite';
// eslint-disable-next-line import/no-unresolved -- The Node resolver does not follow Vitest's config subpath export.
import { configDefaults } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { buildPath } from './scripts/build-paths.mts';

export default defineConfig({
    cacheDir: buildPath('_temp', 'vite'),
    plugins: [ tsconfigPaths() ],
    test: {
        // Generated output and temporary checkouts can contain copied test sources.
        exclude: [...configDefaults.exclude, '_temp/**', '_output/**', '_artifacts/**', '_tests/**'],
        reporters: [ 'default', 'json', 'junit' ],
        outputFile: {
            json: buildPath('_tests', 'vitest.json'),
            junit: buildPath('_tests', 'vitest.xml')
        },
        coverage: {
            include: [ 'src' ],
            reportsDirectory: buildPath('_tests', 'coverage')
        },
        environment: 'jsdom',
        restoreMocks: true
    }
});
