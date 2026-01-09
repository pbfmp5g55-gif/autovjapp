import * as THREE from 'three';

export class VisualEffectManager {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.currentMode = 'Normal';

        this.init();
    }

    init() {
        this.fsQuadScene = new THREE.Scene();
        this.fsQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

        this.effectMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                time: { value: 0 },
                vMode: { value: 0 },
                subMode: { value: 0 },
                intensity: { value: 1.0 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                audioLow: { value: 0 },
                audioMid: { value: 0 },
                audioHigh: { value: 0 },
                audioBeat: { value: 0 },
                modeParam: { value: 0 },
                subParam: { value: 0.5 },
                isMono: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float time;
                uniform int vMode;
                uniform int subMode;
                uniform float intensity;
                uniform vec2 resolution;
                uniform float audioLow;
                uniform float audioMid;
                uniform float audioHigh;
                uniform float audioBeat;
                uniform float modeParam;
                uniform float subParam;
                uniform float isMono;
                
                varying vec2 vUv;

                // --- Noise Util ---
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }
                float fbm(vec2 p) {
                    float v = 0.0;
                    float a = 0.5;
                    for(int i=0; i<4; i++){
                        v += a * noise(p);
                        p *= 2.0;
                        a *= 0.5;
                    }
                    return v;
                }
                
                vec2 kaleidoscope(vec2 uv, float sides) {
                    vec2 p = uv - 0.5;
                    float r = length(p);
                    float a = atan(p.y, p.x);
                    float tau = 6.28318;
                    a = mod(a, tau/sides);
                    a = abs(a - tau/sides/2.0);
                    return r * vec2(cos(a), sin(a));
                }

                float power(float x, float y) {
                    return pow(max(x, 0.0), y);
                }

                // --- Patterns ---
                vec3 createPattern(vec2 uv) {
                    float n = fbm(uv * 3.0 + time * 0.2);
                    float c = sin(uv.x * 10.0 + time) * cos(uv.y * 10.0 - time);
                    vec3 col = vec3(0.0);
                    col.r = sin(n * 6.28 + time) * 0.5 + 0.5;
                    col.g = sin(n * 6.28 + time + 2.0) * 0.5 + 0.5;
                    col.b = sin(n * 6.28 + time + 4.0) * 0.5 + 0.5;
                    col += vec3(c * 0.2);
                    col += vec3(audioBeat * 0.5);
                    return col;
                }

                void main() {
                    vec2 uv = vUv;
                    int m = 0; 
                    if (subMode == 1) m = 1; else if (subMode == 2) m = 2; 
                    
                    vec3 color = vec3(0.0);
                    
                    if (m == 0) { // NOISE
                        float shift = power(audioHigh, 2.0) * intensity * 0.1;
                        float glitchY = floor(uv.y * (10.0 + audioLow*50.0));
                        float offset = hash(vec2(glitchY, time)) * shift;
                        vec2 gUv = uv + vec2(offset, 0.0);
                        
                        float r = fbm(gUv * (10.0 + subParam * 20.0) + vec2(time));
                        float g = fbm(gUv * (10.0 + subParam * 20.0) + vec2(time + 0.1));
                        float b = fbm(gUv * (10.0 + subParam * 20.0) + vec2(time + 0.2));
                        float q = 4.0 + audioMid * 10.0;
                        r = floor(r * q) / q; g = floor(g * q) / q; b = floor(b * q) / q;
                        color = vec3(r, g, b);
                        
                        float sl = sin(uv.y * 800.0) * 0.5 + 0.5;
                        color *= (0.8 + sl * 0.2);
                        if (audioBeat > 0.8 && hash(vec2(time)) > 0.8) color = 1.0 - color;
                    
                    } else if (m == 1) { // KALEIDO
                        float sides = 4.0 + floor(subParam * 8.0);
                        vec2 kUv = kaleidoscope(uv, sides);
                        vec2 pUv = kUv;
                        pUv += vec2(sin(time), cos(time));
                        pUv *= (1.0 + audioLow * 2.0);
                        color = createPattern(pUv * 2.0);
                        float d = length(uv - 0.5);
                        color *= smoothstep(0.5, 0.0, d);
                        color += vec3(audioHigh * 0.5);

                    } else if (m == 2) { // OP ART
                        float freq1 = 50.0 + subParam * 100.0;
                        float freq2 = 52.0 + subParam * 100.0 + audioLow * 20.0;
                        float p1 = sin(uv.x * freq1 + time);
                        float p2 = sin(uv.y * freq2 + time);
                        float moire = p1 * p2;
                        moire = smoothstep(0.1, 0.2, abs(moire));
                        vec3 c1 = vec3(0.5 + 0.5*sin(time), 0.5, 0.8);
                        vec3 c2 = vec3(0.1, 0.1, 0.1);
                        color = mix(c2, c1, moire);
                        float r = length(uv - 0.5);
                        color += vec3(sin(r * 50.0 - time * 5.0) * audioBeat * 0.5);
                    }
                    
                    // --- MONO FILTER ---
                    if (isMono > 0.5) {
                        float gray = dot(color, vec3(0.299, 0.587, 0.114));
                        color = vec3(gray);
                        color = smoothstep(0.05, 0.95, color); // Boost contrast
                    }

                    if (vMode == 0) {
                         vec4 scene = texture2D(tDiffuse, vUv);
                         gl_FragColor = mix(scene, vec4(color, 1.0), 0.0); // 3D pass-through
                    } else {
                         gl_FragColor = vec4(color, 1.0);
                    }
                }
            `
        });

        this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.effectMaterial);
        this.fsQuadScene.add(this.fsQuad);
    }

    setVMode(modeStr) {
        const mapping = { '3D': 0, 'Noise': 1, 'Composite': 2 };
        this.effectMaterial.uniforms.vMode.value = mapping[modeStr] ?? 0;
    }

    setSubMode(modeStr) {
        const mapping = { 'Normal': 0, 'Kaleidoscope': 1, 'OpArt': 2 };
        this.effectMaterial.uniforms.subMode.value = mapping[modeStr] ?? 0;
    }

    setColorMode(isMono) {
        this.effectMaterial.uniforms.isMono.value = isMono ? 1.0 : 0.0;
    }

    onResize() {
        this.renderTarget.setSize(window.innerWidth, window.innerHeight);
        this.effectMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }

    render(audio, midi) {
        this.effectMaterial.uniforms.time.value += 0.01 + (audio.beat * 0.1);
        this.effectMaterial.uniforms.intensity.value = midi.cc1;
        this.effectMaterial.uniforms.audioLow.value = audio.low;
        this.effectMaterial.uniforms.audioMid.value = audio.mid;
        this.effectMaterial.uniforms.audioHigh.value = audio.high;
        this.effectMaterial.uniforms.audioBeat.value = audio.beat;
        this.effectMaterial.uniforms.modeParam.value = 0;
        this.effectMaterial.uniforms.subParam.value = midi.cc4;

        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.clear();
        if (this.effectMaterial.uniforms.vMode.value === 0) {
            this.renderer.render(this.scene, this.camera);
        } else {
            this.renderer.render(this.fsQuadScene, this.fsQuadCamera);
        }

        return this.renderTarget.texture;
    }
}
