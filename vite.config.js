import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

// 三个入口：
//   index.html  学生端（练习 + 各游戏 + 比赛）
//   board.html  比赛大屏（投影用，免登录只读）
//   admin-next.html 教师后台反馈试点
export default defineConfig({
  root: path.resolve('frontend'),
  plugins: [vue()],
  build: {
    outDir: path.resolve('public'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: path.resolve('frontend/index.html'),
        board: path.resolve('frontend/board.html'),
        adminNext: path.resolve('frontend/admin-next.html')
      }
    }
  }
});
