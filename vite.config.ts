import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://mai.val.run',
        changeOrigin: true,
      },
      '/login': {
        target: 'https://mai.val.run',
        changeOrigin: true,
      },
      '/register': {
        target: 'https://mai.val.run',
        changeOrigin: true,
      },
      '/verify-login': {
        target: 'https://mai.val.run',
        changeOrigin: true,
      },
      '/verify-register': {
        target: 'https://mai.val.run',
        changeOrigin: true,
      },
      '/resend-code': {
        target: 'https://mai.val.run',
        changeOrigin: true,
      },
    },
  },
})
