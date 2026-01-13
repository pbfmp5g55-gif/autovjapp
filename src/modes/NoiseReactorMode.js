import * as THREE from 'three';
import vertShader from '../shaders/noise_reactor.vert?raw';
import fragShader from '../shaders/noise_reactor.frag?raw';
import presetsData from '../presets/noiseReactorPresets.json';

export class NoiseReactorMode {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        this.presets = presetsData;
        this.currentPreset = this.presets[0];
        this.startTime = performance.now();

        // Render Targets for Ping-Pong Feedback
        const pars = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        };
        const size = new THREE.Vector2();
        this.renderer.getSize(size);

        this.targetA = new THREE.WebGLRenderTarget(size.width, size.height, pars);
        this.targetB = new THREE.WebGLRenderTarget(size.width, size.height, pars);
        this.writeBuffer = this.targetA;
        this.readBuffer = this.targetB;

        // Material
        this.material = new THREE.ShaderMaterial({
            vertexShader: vertShader,
            fragmentShader: fragShader,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: size },
                uPrevTexture: { value: null }, // Will be assigned ReadBuffer
                uFeedbackEnabled: { value: true }, // Controlled by preset
                uFeedbackDecay: { value: 0.9 },
                uFeedbackSmear: { value: 0.1 },

                // Audio
                uLow: { value: 0 },
                uMid: { value: 0 },
                uHigh: { value: 0 },
                uVol: { value: 0 },
                uOnset: { value: 0 },

                // Params (Initialized)
                uType: { value: 0 },
                uScale: { value: 1.0 },
                uDetail: { value: 1.0 },
                uFlowSpeed: { value: 0.2 },
                uWarpStrength: { value: 0.3 },
                uWarpScale: { value: 1.0 },
                uContrast: { value: 1.0 },
                uQuantize: { value: 0.0 },

                uColorMode: { value: 0 },
                uHueShiftSpeed: { value: 0.1 },
                uSaturation: { value: 1.0 },
                uBrightness: { value: 1.0 }
            }
        });

        // Fullscreen Quad
        // Since SceneManager uses a camera with z=5. We can put this mesh in a separate Scene for display.
        // But for now, let's put it far away.
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(30 * window.innerWidth / window.innerHeight, 30), this.material);
        this.mesh.position.z = -10;
        this.group = new THREE.Group();
        this.group.add(this.mesh);
        this.scene.add(this.group);

        this.applyPreset(this.currentPreset.id);
    }

    applyPreset(id) {
        const p = this.presets.find(x => x.id === id);
        if (!p) return;
        this.currentPreset = p;

        const u = this.material.uniforms;

        // Noise
        // Map types to int
        const types = { 'flow': 0, 'granular': 1, 'interference': 2, 'glitch': 3 };
        u.uType.value = types[p.noise.type];
        u.uScale.value = p.noise.scale;
        u.uDetail.value = p.noise.detail;
        u.uFlowSpeed.value = p.noise.flowSpeed;
        u.uWarpStrength.value = p.noise.warpStrength;
        u.uWarpScale.value = p.noise.warpScale;
        u.uContrast.value = p.noise.contrast;
        u.uQuantize.value = p.noise.quantize;

        // Color
        const c_modes = { 'rainbow': 0, 'gradient': 1, 'mono': 2 };
        u.uColorMode.value = c_modes[p.color.mode];
        u.uHueShiftSpeed.value = p.color.hueShiftSpeed;
        u.uSaturation.value = p.color.saturation;
        u.uBrightness.value = p.color.brightness;

        // Feedback
        if (p.feedback.mode === 'off') {
            u.uFeedbackEnabled.value = false;
        } else {
            // auto or on -> true
            u.uFeedbackEnabled.value = true;
        }
        u.uFeedbackDecay.value = p.feedback.decay;
        u.uFeedbackSmear.value = p.feedback.smear;
    }

    update(audio) {
        const u = this.material.uniforms;
        u.uTime.value = (performance.now() - this.startTime) * 0.001;
        u.uLow.value = audio.low;
        u.uMid.value = audio.mid;
        u.uHigh.value = audio.high;
        u.uVol.value = audio.rms;

        // Smooth onset
        if (audio.beat > 0.6) u.uOnset.value = 1.0;
        else u.uOnset.value *= 0.9;

        this.computeAndDisplay();
    }

    computeAndDisplay() {
        // Hide mesh from main scene to avoid loop
        this.mesh.visible = false;

        // Use a temporary scene for calculation
        if (!this.compScene) {
            this.compScene = new THREE.Scene();
            this.compCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            this.compMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
            this.compScene.add(this.compMesh);
        }

        // 1. Update Uniforms (Audio, Time, PrevTex)
        this.material.uniforms.uPrevTexture.value = this.readBuffer.texture;

        // 2. Render to WriteBuffer
        this.renderer.setRenderTarget(this.writeBuffer);
        // Clear logic handled by renderer usually, but standard simple render is fine
        this.renderer.render(this.compScene, this.compCamera);
        this.renderer.setRenderTarget(null);

        // 3. Swap
        const temp = this.readBuffer;
        this.readBuffer = this.writeBuffer;
        this.writeBuffer = temp;

        // 4. Setup Display Mesh
        if (!this.displayMaterial) {
            this.displayMaterial = new THREE.MeshBasicMaterial({ map: this.readBuffer.texture });
            // Ensure display material handles transparency if needed, but noise reactor is opaque usually
        }
        this.displayMaterial.map = this.readBuffer.texture;
        this.mesh.material = this.displayMaterial;
        this.mesh.visible = true; // Visible for main render
    }


    setVisible(v) {
        this.group.visible = v;
    }

    onResize() {
        const size = new THREE.Vector2();
        this.renderer.getSize(size);
        this.material.uniforms.uResolution.value = size;
        this.targetA.setSize(size.width, size.height);
        this.targetB.setSize(size.width, size.height);

        // Update Plane Size
        if (this.mesh && this.mesh.geometry) {
            this.mesh.geometry.dispose();
            this.mesh.geometry = new THREE.PlaneGeometry(30 * window.innerWidth / window.innerHeight, 30);
        }
    }

    setQuality(level) {
        // level: 0=Low, 1=Med, 2=High
        // Adjust texture size?
        // For now just toggle feedback off if low?
        if (level === 0) {
            this.material.uniforms.uFeedbackEnabled.value = false;
        } else {
            // restore preset setting
            this.applyPreset(this.currentPreset.id);
        }
    }
}
