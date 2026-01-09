
import { defineConfig } from 'vite';

export default defineConfig({
    // GitHub Pagesのリポジトリ名に合わせてパス解決されるように相対パスを使用
    base: './',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});
