
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ command }) => {
    return {
        // 開発時は'/'、ビルド時(GitHub Pages用)は'/autovjapp/'
        base: command === 'build' ? '/autovjapp/' : '/',
        build: {
            outDir: 'dist',
            assetsDir: 'assets',
            rollupOptions: {
                input: {
                    main: resolve(__dirname, 'index.html'),
                    vj: resolve(__dirname, 'vj.html'),
                    '3d': resolve(__dirname, 'modes/3d.html'),
                    '2d': resolve(__dirname, 'modes/2d.html'),
                    photo: resolve(__dirname, 'modes/photo.html'),
                    shader: resolve(__dirname, 'modes/shader.html'),
                    video: resolve(__dirname, 'modes/video.html'),
                    holoblob: resolve(__dirname, 'modes/holoblob.html'),
                    tvstatic: resolve(__dirname, 'modes/tvstatic.html'),
                }
            }
        }
    };
});
