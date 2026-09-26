import { defineConfig } from 'vitest/config'

// Standalone from vite.config.ts: the electron plugins must not run under the test runner.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts']
    }
})
