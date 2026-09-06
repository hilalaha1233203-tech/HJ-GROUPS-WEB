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
})
