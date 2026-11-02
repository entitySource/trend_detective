/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `@/` = src/, the import style the copied registry components (src/components/ui) use.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Relative base so the static build works on Cloudflare Pages or any sub-path.
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
})
