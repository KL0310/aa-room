import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 使用相對路徑，部署在 GitHub Pages 的子路徑（/aa-room/）也能正常載入資源
export default defineConfig({
  base: './',
  plugins: [vue()],
  test: {
    environment: 'node',
  },
})
