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
          // React + ReactDOM MUST stay in the same chunk — splitting them causes
          // "Cannot access 'X' before initialization" crashes
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('react-is')
          ) {
            return 'react-vendor';
          }
          if (id.includes('node_modules')) {
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
