import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    force: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Do NOT split React — let it bundle naturally to avoid
          // "Cannot access 'X' before initialization" circular ref crashes
          if (id.includes('node_modules')) {
            if (id.includes('supabase') || id.includes('postgrest')) {
              return 'supabase-vendor';
            }
            if (id.includes('leaflet') || id.includes('mapbox') || id.includes('maplibre')) {
              return 'map-vendor';
            }
            // Everything else (including react) goes into one vendor chunk
            return 'vendor';
          }
        }
      }
    }
  }
})
