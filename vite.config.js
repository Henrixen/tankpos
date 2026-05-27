import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'react-vendor';
            }
            if (id.includes('supabase') || id.includes('postgrest')) {
              return 'supabase-vendor';
            }
            if (id.includes('leaflet') || id.includes('mapbox') || id.includes('maplibre')) {
              return 'map-vendor';
            }
            return 'vendor';
          }
        }
      }
    }
  }
})
