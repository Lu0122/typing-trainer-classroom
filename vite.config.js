import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
export default defineConfig({ root: path.resolve('frontend'), plugins: [vue()], build: { outDir: path.resolve('public'), emptyOutDir: false, rollupOptions: { input: path.resolve('frontend/index.html') } } });
