
import { defineConfig } from 'vite';

export default defineConfig({
    // GitHub Pagesのリポジトリ名に合わせてパス設定
    base: '/autovjapp/',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});
