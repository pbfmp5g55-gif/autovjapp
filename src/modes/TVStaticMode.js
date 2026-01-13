import * as THREE from 'three';
import vertShader from '../shaders/tv_static.vert?raw';
import fragShader from '../shaders/tv_static.frag?raw';
import presetsData from '../presets/tvStaticPresets.json';

export class TVStaticMode {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        this.presets = presetsData;
        this.currentPreset = this.presets[0];

        // Material
        // Create ShaderMaterial for TV Static
        this.material = new THREE.ShaderMaterial({
            vertexShader: vertShader,
            fragmentShader: fragShader,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },

                // Audio
                uVol: { value: 0 },
                uLow: { value: 0 },
                uHigh: { value: 0 },
                uOnset: { value: 0 },

                // Params
                uAmount: { value: 0.5 },
                uContrast: { value: 1.0 },
                uGrainSize: { value: 2.0 },
                uFlickerSpeed: { value: 1.0 },
                uScanlines: { value: 0.5 },
                uHorizontalJitter: { value: 0.0 },
                uVignette: { value: 0.5 },
                uMono: { value: true }
            },
            transparent: true, // Allow blending if needed, though static usually opaque
            depthWrite: false, // Background
            depthTest: false
        });

        // Fullscreen Quad Mesh
        // Using a large plane attached to camera or in front of it.
        // Similar strategy to NoiseReactor: Large Plane at z=0 (Camera at z=5)
        // Ensure aspect ratio covers screen.
        this.geometry = new THREE.PlaneGeometry(30 * window.innerWidth / window.innerHeight, 30);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.z = -10; // Behind objects if any, but this is fullscreen mode.

        this.group = new THREE.Group();
        this.group.add(this.mesh);

        // Initial Preset
        this.applyPreset(this.currentPreset.id);

        // Initially invisible controlled by SceneManager
        this.group.visible = false;
        this.scene.add(this.group);
    }

    applyPreset(id) {
        const p = this.presets.find(x => x.id === id);
        if (!p) return;
        this.currentPreset = p;

        const u = this.material.uniforms;
        u.uAmount.value = p.amount;
        u.uContrast.value = p.contrast;
        u.uGrainSize.value = p.grainSize;
        u.uFlickerSpeed.value = p.flickerSpeed;
        u.uScanlines.value = p.scanlines;
        u.uHorizontalJitter.value = p.horizontalJitter;
        u.uVignette.value = p.vignette;
        u.uMono.value = p.mono;
    }

    update(audio) {
        if (!this.group.visible) return;

        const u = this.material.uniforms;
        u.uTime.value = performance.now() * 0.001;

        // Audio Update
        u.uVol.value = audio.rms;
        u.uLow.value = audio.low;
        u.uHigh.value = audio.high;
        u.uOnset.value = (audio.beat > 0.6) ? 1.0 : (u.uOnset.value * 0.85); // Decay
    }

    setVisible(v) {
        this.group.visible = v;
    }

    onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.material.uniforms.uResolution.value.set(w, h);

        // Update Plane Aspect
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.geometry = new THREE.PlaneGeometry(30 * w / h, 30);
        }
    }
}
