import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { docsSite } from './src/site/docs/build/plugin.ts'

// The run site's build (rer build --site, src/site/pages.tsx): the docs virtual module and React, none of the Worker's plugins.
export default defineConfig({ plugins: [docsSite(), react()] })
