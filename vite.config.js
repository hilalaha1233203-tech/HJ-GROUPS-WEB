import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const ensureAppDefaultExport = () => ({
  name: 'ensure-app-default-export',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/App.jsx')) return null
    if (/\bexport\s+default\s+App\b/.test(code)) return null
    return {
      code: `${code}\n\nexport default App\n`,
      map: null,
    }
  },
})

export default defineConfig({
  plugins: [ensureAppDefaultExport(), react()],
  resolve: {
    // Keep React and ReactDOM on one root-installed copy. This prevents Vite
    // from mixing optimized chunks when node_modules has stale/duplicate copies.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Rebuild the dev dependency graph so a previously cached react-dom/client
    // chunk cannot be paired with a different react-dom root bundle.
    force: true,
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4173',
        changeOrigin: true,
      },
    },
  },
})
