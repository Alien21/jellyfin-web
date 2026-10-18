/// <reference types="vitest" />
/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { buildPath } from './scripts/build-paths.mts';

export default defineConfig({
    cacheDir: buildPath('_temp', 'vite'),
    plugins: [ tsconfigPaths() ],
    test: {
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
