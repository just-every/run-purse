import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { demoSockets } from './src/modules/demo/vite.mjs'

// Only `vite dev` loads the local-only entry and the checkout's dev key; a build
// keeps src/server.ts and never sees either (rer build checks its output).
const local = (name: string) => process.env[name] ? { [name]: process.env[name] } : {}
const serve = { main: './src/server.dev.ts', vars: { ...local('RER_DEV_ORIGIN'), ...local('RER_DEV_KEY'), ...local('RER_DEV_IDENTITY'), ...local('RER_DEMO'), ...local('RER_DEMO_EXPIRES') } }

// `vite dev` serves only the folders the app is built from (and what they
// import), never the rest of the checkout: not rer's private folders (the dev
// key, installer state), export archives, settings or local data.
const server = { fs: { allow: ['src', 'public', 'node_modules'], deny: ['**/.rer/**', '**/.seed/**', '**/exports/**', '**/*.rer'] } }

// The existing journey flag selects a test-only fetch dependency in dev. Builds
// and ordinary local development retain the production transport, regardless of CI.
export default defineConfig(({ command, isPreview }) => {
    const testScreening = command === 'serve' && !isPreview && process.env.RER_SERVER_JOURNEY === '1'
    return {
        server: testScreening ? { ...server, fs: { ...server.fs, allow: [...server.fs.allow, 'tests'] } } : server,
        resolve: { alias: testScreening ? [{ find: /^\.\/screening-fetch$/, replacement: fileURLToPath(new URL('./tests/screening-fetch.ts', import.meta.url)) }] : [] },
        plugins: [demoSockets(), cloudflare({ inspectorPort: false, viteEnvironment: { name: 'ssr' }, persistState: { path: process.env.RER_STATE_DIR ?? '.wrangler/state' }, ...(command === 'serve' && !isPreview ? { config: serve } : process.env.RER_DEV_ORIGIN ? { config: { vars: local('RER_DEV_ORIGIN') } } : {}) }), tanstackStart(), react()],
    }
})
