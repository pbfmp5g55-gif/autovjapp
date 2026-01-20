
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
    return {
        // 開発時は'/'、ビルド時(GitHub Pages用)は'/autovjapp/'
        base: command === 'build' ? '/autovjapp/' : '/',
        build: {
            outDir: 'dist',
            assetsDir: 'assets',
        }
    };
});
