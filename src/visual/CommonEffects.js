import * as THREE from 'three';

/**
 * 共通エフェクト層（v1.3）
 * 全プリセットの「派手さ」を底上げするための共通処理
 * - Trails（残像）
 * - Additive Blending（加算合成）
 * - Glow/Bloom（疑似発光）
 * - Grain/Noise Overlay（粒子）
 * - Beat Flash（瞬間フラッシュ）
 * - Vignette（周辺減光）
 */
export class CommonEffects {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        // パラメータ
        this.trailsAmount = 0.5;      // CC5
        this.glowAmount = 0.5;        // CC6
        this.grainAmount = 0.1;       // CC13
        this.beatSensitivity = 0.5;   // CC14
        this.backgroundFade = 0.5;    // CC15

        // レンダーターゲット（Trails用）
        this.trailsTarget = new THREE.WebGLRenderTarget(
            window.innerWidth,
            window.innerHeight,
            {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            }
        );

        // フルスクリーンクワッド用のシーン
        this.quadScene = new THREE.Scene();
        this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Trails用マテリアル
        this.trailsMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tDiffuse: { value: null },
                tPrev: { value: this.trailsTarget.texture },
                uFade: { value: 0.95 },
                uAdditive: { value: 0.5 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D tDiffuse;
                uniform sampler2D tPrev;
                uniform float uFade;
                uniform float uAdditive;
                in vec2 vUv;
                out vec4 fragColor;

                void main() {
                    vec4 current = texture(tDiffuse, vUv);
                    vec4 prev = texture(tPrev, vUv);
                    
                    // 残像（フェード）
                    vec4 trails = mix(current, prev * uFade, 0.8);
                    
                    // 加算合成
                    vec4 additive = current + prev * uAdditive;
                    
                    fragColor = mix(trails, additive, 0.3);
                }
            `
        });

        // Glow/Bloom用マテリアル（簡易版）
        this.glowMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tDiffuse: { value: null },
                uGlowAmount: { value: 0.5 },
                uThreshold: { value: 0.7 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D tDiffuse;
                uniform float uGlowAmount;
                uniform float uThreshold;
                in vec2 vUv;
                out vec4 fragColor;

                void main() {
                    vec4 color = texture(tDiffuse, vUv);
                    
                    // 明るい部分を抽出
                    float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                    vec3 glow = color.rgb * smoothstep(uThreshold, 1.0, brightness);
                    
                    // ブラー（簡易版：周辺サンプリング）
                    vec2 texelSize = 1.0 / vec2(1920.0, 1080.0);
                    vec3 blur = vec3(0.0);
                    for(float x = -2.0; x <= 2.0; x++) {
                        for(float y = -2.0; y <= 2.0; y++) {
                            vec2 offset = vec2(x, y) * texelSize * 2.0;
                            vec4 sampleCol = texture(tDiffuse, vUv + offset);
                            float b = dot(sampleCol.rgb, vec3(0.299, 0.587, 0.114));
                            blur += sampleCol.rgb * smoothstep(uThreshold, 1.0, b);
                        }
                    }
                    blur /= 25.0;
                    
                    // 元の色に加算
                    vec3 result = color.rgb + blur * uGlowAmount;
                    
                    fragColor = vec4(result, color.a);
                }
            `
        });

        // Grain/Noise Overlay用マテリアル
        this.grainMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tDiffuse: { value: null },
                uGrainAmount: { value: 0.1 },
                uTime: { value: 0.0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D tDiffuse;
                uniform float uGrainAmount;
                uniform float uTime;
                in vec2 vUv;
                out vec4 fragColor;

                // ランダム関数
                float random(vec2 st) {
                    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
                }

                void main() {
                    vec4 color = texture(tDiffuse, vUv);
                    
                    // グレイン（時間で変化）
                    float grain = random(vUv * uTime) * 2.0 - 1.0;
                    vec3 result = color.rgb + grain * uGrainAmount;
                    
                    fragColor = vec4(result, color.a);
                }
            `
        });

        // Beat Flash用マテリアル
        this.beatFlashMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tDiffuse: { value: null },
                uFlashAmount: { value: 0.0 },
                uFlashColor: { value: new THREE.Color(1, 1, 1) }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D tDiffuse;
                uniform float uFlashAmount;
                uniform vec3 uFlashColor;
                in vec2 vUv;
                out vec4 fragColor;

                void main() {
                    vec4 color = texture(tDiffuse, vUv);
                    vec3 result = mix(color.rgb, uFlashColor, uFlashAmount);
                    fragColor = vec4(result, color.a);
                }
            `
        });

        // Vignette用マテリアル
        this.vignetteMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tDiffuse: { value: null },
                uVignetteAmount: { value: 0.3 },
                uVignetteSize: { value: 0.5 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D tDiffuse;
                uniform float uVignetteAmount;
                uniform float uVignetteSize;
                in vec2 vUv;
                out vec4 fragColor;

                void main() {
                    vec4 color = texture(tDiffuse, vUv);
                    
                    // 中心からの距離
                    vec2 center = vUv - 0.5;
                    float dist = length(center);
                    float vignette = smoothstep(uVignetteSize, uVignetteSize - 0.5, dist);
                    
                    vec3 result = color.rgb * mix(1.0 - uVignetteAmount, 1.0, vignette);
                    fragColor = vec4(result, color.a);
                }
            `
        });

        // フルスクリーンクワッド
        const quadGeometry = new THREE.PlaneGeometry(2, 2);
        this.quad = new THREE.Mesh(quadGeometry, this.trailsMaterial);
        this.quadScene.add(this.quad);

        // 中間レンダーターゲット
        this.tempTarget = new THREE.WebGLRenderTarget(
            window.innerWidth,
            window.innerHeight
        );

        // コピー用マテリアル（再利用）
        this.copyMaterial = new THREE.MeshBasicMaterial({ map: null });

        // 中間バッファ（再利用）
        const pars = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        };
        this.buffer1 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, pars);
        this.buffer2 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, pars);

        // Beat検出用
        this.lastBeatTime = 0;
        this.beatFlashDecay = 0;
    }

    // パラメータ更新（MIDIから）
    updateParams(midi) {
        this.trailsAmount = midi.cc5;
        this.glowAmount = midi.cc6;
        this.grainAmount = midi.cc13 * 0.2; // 0〜0.2
        this.beatSensitivity = midi.cc14;
        this.backgroundFade = midi.cc15;

        // マテリアルに反映
        this.trailsMaterial.uniforms.uFade.value = 0.85 + this.trailsAmount * 0.14; // 0.85〜0.99
        this.trailsMaterial.uniforms.uAdditive.value = this.trailsAmount * 0.8;
        this.glowMaterial.uniforms.uGlowAmount.value = this.glowAmount;
        this.grainMaterial.uniforms.uGrainAmount.value = this.grainAmount;
    }

    // Beat検出とFlash
    detectBeat(audio) {
        const beatThreshold = 0.7 + (1.0 - this.beatSensitivity) * 0.2;
        if (audio.beat > beatThreshold) {
            const now = performance.now();
            if (now - this.lastBeatTime > 100) { // 100ms間隔
                this.beatFlashDecay = 1.0;
                this.lastBeatTime = now;
            }
        }

        // フラッシュの減衰
        this.beatFlashDecay *= 0.85;
        this.beatFlashMaterial.uniforms.uFlashAmount.value = this.beatFlashDecay * this.beatSensitivity;
    }

    // エフェクトを適用してレンダリング
    render(audio, midi, sourceTexture = null) {
        this.updateParams(midi);
        this.detectBeat(audio);

        // 時間更新
        this.grainMaterial.uniforms.uTime.value = performance.now() * 0.001;

        // sourceTextureがnullの場合は、現在のシーンをレンダリング
        let currentTexture;
        if (!sourceTexture) {
            this.renderer.setRenderTarget(this.tempTarget);
            this.renderer.clear(); // 確実にクリア
            this.renderer.render(this.scene, this.camera);
            currentTexture = this.tempTarget.texture;
        } else {
            currentTexture = sourceTexture;
        }

        // 1. Trails
        this.quad.material = this.trailsMaterial;
        this.trailsMaterial.uniforms.tDiffuse.value = currentTexture;
        this.trailsMaterial.uniforms.tPrev.value = this.trailsTarget.texture;
        this.renderer.setRenderTarget(this.buffer1);
        this.renderer.render(this.quadScene, this.quadCamera);

        // Trailsターゲットを更新（コピー）
        this.renderer.setRenderTarget(this.trailsTarget);
        this.copyMaterial.map = this.buffer1.texture;
        this.quad.material = this.copyMaterial;
        this.renderer.render(this.quadScene, this.quadCamera);

        // 2. Glow/Bloom
        this.quad.material = this.glowMaterial;
        this.glowMaterial.uniforms.tDiffuse.value = this.buffer1.texture;
        this.renderer.setRenderTarget(this.buffer2);
        this.renderer.render(this.quadScene, this.quadCamera);

        // 3. Grain
        this.quad.material = this.grainMaterial;
        this.grainMaterial.uniforms.tDiffuse.value = this.buffer2.texture;
        this.renderer.setRenderTarget(this.buffer1);
        this.renderer.render(this.quadScene, this.quadCamera);

        // 4. Beat Flash
        this.quad.material = this.beatFlashMaterial;
        this.beatFlashMaterial.uniforms.tDiffuse.value = this.buffer1.texture;
        this.renderer.setRenderTarget(this.buffer2);
        this.renderer.render(this.quadScene, this.quadCamera);

        // 5. Vignette（最終）
        this.quad.material = this.vignetteMaterial;
        this.vignetteMaterial.uniforms.tDiffuse.value = this.buffer2.texture;
        this.renderer.setRenderTarget(null); // 画面に出力
        this.renderer.render(this.quadScene, this.quadCamera);
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.trailsTarget.setSize(width, height);
        this.tempTarget.setSize(width, height);

        if (this.buffer1) this.buffer1.setSize(width, height);
        if (this.buffer2) this.buffer2.setSize(width, height);
    }
}
