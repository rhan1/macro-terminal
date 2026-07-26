import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) return 'vendor-recharts'
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'vendor-react'
        },
      },
    },
  },
})
