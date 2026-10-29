/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base so the static build works on Cloudflare Pages or any sub-path.
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
})
