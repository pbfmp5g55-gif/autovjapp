import * as THREE from 'three';
import { VJLayer } from './VJLayer';
import { VisualEffectManager } from './VisualEffectManager';
import { PhotoPolygonizer } from './PhotoPolygonizer';
import { P5Manager } from './P5Manager';
import { AudioReactiveParticles } from './AudioReactiveParticles';
import { CommonEffects } from './CommonEffects'; // v1.3

export class SceneManager {
    constructor() {
        this.scene = new THREE.Scene();
        // Fog
        this.scene.fog = new THREE.FogExp2(0x000000, 0.01);

        // Lighting (Ensure lights are present)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // 0.5 -> 0.8
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 1.5); // 1.0 -> 1.5
        pointLight.position.set(5, 5, 10);
        this.scene.add(pointLight);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 5;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Add ID for switching
        this.renderer.domElement.id = 'three-canvas';
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '1';

        document.body.appendChild(this.renderer.domElement);

        this.layers = [];
        this.objectCount = 5;
        this.currentPreset = 'L1';
        this.currentMode = '3D'; // 3D, Photo, 2D, Shader

        // Managers
        this.effects = new VisualEffectManager(this.renderer, this.scene, this.camera);
        this.commonEffects = new CommonEffects(this.renderer, this.scene, this.camera); // v1.3
        this.p5Manager = new P5Manager('p5-container');
        this.p5Manager.init(); // Initialize p5 instance
        this.photoPolygonizer = new PhotoPolygonizer(this.scene);
        this.particleSpawner = new AudioReactiveParticles(this.scene);

        // Mode1改善用：呼吸アニメーション
        this.breathPhase = 0;

        this.setupLayers();

        window.addEventListener('resize', () => this.onResize());
    }

    init() {
        // THREE setup
        // this.renderer.setSize(window.innerWidth, window.innerHeight); // Moved to constructor
        // this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Moved to constructor
        // document.body.appendChild(this.renderer.domElement); // Moved to constructor
        // this.renderer.domElement.id = 'three-canvas'; // Moved to constructor

        // this.camera.position.z = 10; // Moved to constructor

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(5, 5, 10);
        this.scene.add(pointLight);

        // P5 setup
        this.p5Manager.init();

        this.setupLayers();

        window.addEventListener('resize', () => this.onResize());
    }

    setMode(mode) {
        if (this.currentMode === mode) return;
        this.currentMode = mode;
        console.log('Switched to Mode:', mode);

        this.updateVisibility();
    }

    updateVisibility() {
        const threeCanvas = document.getElementById('three-canvas');

        if (this.currentMode === '2D') {
            this.p5Manager.setVisible(true);
            if (threeCanvas) threeCanvas.style.display = 'none';
        } else {
            this.p5Manager.setVisible(false);
            if (threeCanvas) threeCanvas.style.display = 'block';

            if (this.currentMode === 'Photo') {
                this.layers.forEach(l => l.group.visible = false);
                this.photoPolygonizer.group.visible = true;
                if (this.particleSpawner) this.particleSpawner.setVisible(false); // Hide Spawner

                // Disable shader effects for clearer photo view
                this.effects.setVMode('3D');
            } else if (this.currentMode === 'Shader') {
                if (this.layers.length > 0) this.layers.forEach(l => l.group.visible = false);
                this.photoPolygonizer.group.visible = false;
                if (this.particleSpawner) this.particleSpawner.setVisible(false); // Hide Spawner

                // Set default shader params
                this.effects.setVMode('Noise');
            } else { // 3D Standard
                if (this.layers.length === 0) this.setupLayers();
                this.layers.forEach(l => l.group.visible = true);
                this.photoPolygonizer.group.visible = false;

                // Normal view
                this.effects.setVMode('3D');
                this.effects.setSubMode('Normal');
            }
        }
    }

    setupLayers() {
        // Re-create standard 3D layers
        this.layers.forEach(l => this.scene.remove(l.group));
        this.layers = [];

        const roles = ['Low', 'Mid', 'High', 'Beat', 'Ambient'];
        for (let i = 0; i < this.objectCount; i++) {
            const role = roles[i % roles.length];
            const layer = new VJLayer(i, this.objectCount, role);
            this.layers.push(layer);
            this.scene.add(layer.group);
        }
        this.applyPreset(this.currentPreset);

        // Initial visibility check
        this.updateVisibility();
    }

    // --- Mode Specific Setters ---

    // Shader FX Mode
    setShaderPreset(preset) {
        // preset: 'Noise', 'Kaleido', 'OpArt'
        if (preset === 'Noise') {
            this.effects.setVMode('Noise');
            this.effects.setSubMode('Normal');
        } else if (preset === 'Kaleido') {
            this.effects.setVMode('Composite'); // Mix
            this.effects.setSubMode('Kaleidoscope');
        } else if (preset === 'OpArt') {
            this.effects.setVMode('Composite');
            this.effects.setSubMode('OpArt');
        }
    }

    setShaderColorMode(isMono) {
        this.effects.setColorMode(isMono);
    }

    // Auto Pilot Logic
    autoSwitchPreset() {
        if (this.currentMode === '3D') {
            const presets = ['L1', 'L1_Spiral', 'L2', 'L2_Eccentric', 'L3', 'Matrix', 'Tunnel', 'Spawn']; // Added Spawn
            const next = presets[Math.floor(Math.random() * presets.length)];
            this.applyPreset(next);
            console.log('Auto Prese (3D):', next);
            return next; // Return for UI update
        } else if (this.currentMode === 'Photo') {
            // Toggle Style
            const styles = ['Delaunay', 'Voronoi'];
            const next = styles[Math.floor(Math.random() * styles.length)];
            this.setPolyMode(next);
            console.log('Auto Preset (Photo):', next);
            return next;
        } else if (this.currentMode === '2D') {
            const presets = ['Noise Field', 'Glitch Scan', 'Kaleido Mirror', 'Op Art Moiré', 'Particle Constellation'];
            const next = presets[Math.floor(Math.random() * presets.length)];
            this.setP5Preset(next);
            console.log('Auto Preset (2D):', next);
            return next;
        } else if (this.currentMode === 'Shader') {
            const presets = ['Noise', 'Kaleido', 'OpArt'];
            const next = presets[Math.floor(Math.random() * presets.length)];
            this.setShaderPreset(next);
            console.log('Auto Preset (Shader):', next);
            return next;
        }
    }

    // 3D Mode
    applyPreset(presetId) {
        this.currentPreset = presetId;

        // Handle "Spawn" Preset specially
        if (presetId === 'Spawn') {
            this.particleSpawner.setVisible(true);
            this.layers.forEach(l => l.group.visible = false);
            return;
        } else {
            this.particleSpawner.setVisible(false);
            if (this.currentMode === '3D') {
                this.layers.forEach(l => l.group.visible = true);
            }
        }

        this.layers.forEach((layer, i) => {
            const t = i / this.layers.length;
            const angleOffset = (i / this.layers.length) * Math.PI * 2;

            if (presetId === 'L1') { // Pulse Core (Z-Stacked)
                layer.group.position.set(0, 0, -i * 3);
                layer.group.rotation.set(0, 0, 0);
            } else if (presetId === 'L1_Spiral') { // Pulse Core (Spiral)
                const r = 2;
                layer.group.position.set(Math.cos(angleOffset) * r, Math.sin(angleOffset) * r, -i * 4);
                layer.group.rotation.set(0, 0, angleOffset);
            } else if (presetId === 'L2') { // Orbit Layers
                const radius = 5 + i * 2;
                const angle = t * Math.PI * 2;
                layer.group.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
            } else if (presetId === 'L2_Eccentric') { // Orbit Layers (Eccentric)
                const radius = 6 + i * 2;
                const angle = t * Math.PI * 2;
                layer.group.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.5) * radius * 0.5, Math.sin(angle) * 5);
            } else if (presetId === 'L3') { // Stacked Wave
                layer.group.position.set((t - 0.5) * 20, Math.sin(t * Math.PI) * 5, -i * 2);
            } else if (presetId === 'L3_Double') { // Stacked Wave (Double)
                const x = (t - 0.5) * 25;
                const y = Math.cos(t * Math.PI * 2) * 8;
                layer.group.position.set(x, y, -i * 3);
            } else if (presetId === 'Matrix') { // Grid Layout
                const cols = Math.ceil(Math.sqrt(this.objectCount));
                const spacing = 4;
                layer.group.position.set(
                    ((i % cols) - cols / 2) * spacing,
                    (Math.floor(i / cols) - cols / 2) * spacing,
                    0
                );
                layer.group.rotation.set(0, 0, 0);
            } else if (presetId === 'Tunnel') { // Tunnel Layout
                const angle = i * 0.5;
                const radius = 3;
                layer.group.position.set(
                    Math.cos(angle) * radius,
                    Math.sin(angle) * radius,
                    -i * 2 + 10
                );
                layer.group.rotation.set(0, 0, angle);
            }
        });
    }

    setObjectCount(count) {
        this.objectCount = count;
        this.setupLayers();
    }

    // Photo Mode
    async loadPhoto(file) {
        await this.photoPolygonizer.processImage(file);
        // Do not force switch mode, user must use UI, or maybe safe to switch?
        // Spec says: Mode switch is manual only. 
        // But for UX, if user uploads photo, maybe select Photo mode?
        // Let's stick to strict manual mode switch as requested, or switch with visual feedback.
        // For now, just load data.
    }

    setPhotoPolyCount(count) {
        this.photoPolygonizer.setPolygonCount(count);
    }

    setPolyMode(mode) {
        this.photoPolygonizer.setMode(mode);
    }

    // 2D Mode
    setP5Preset(name) {
        this.p5Manager.setPreset(name);
    }

    // Main Loop
    update(audio, midiRaw) {
        // Mode 1 (3D) の場合の明るさ補正
        // ユーザー要望: Mode 1のみCC制限を入れたい（暗すぎて見えないのを防ぐ）
        const midi = { ...midiRaw }; // シャローコピーして使用

        if (this.currentMode === '3D') {
            midi.cc1 = Math.max(midi.cc1, 0.5); // Intensity Min 50%
            midi.cc6 = Math.max(midi.cc6, 0.4); // Glow Min 40%
        } else if (this.currentMode === '2D') {
            // 2Dモードは補正なし（または必要ならここに追加）
            // 既存コードに合わせて補正済みmidiを渡すように変更するため、ここでは何もしない
            // ただしP5Managerは生のmidiを参照している箇所があるかもしれないので注意
            // P5Manager.update(audio, midiRaw.ccs) としていたが、統一する
        }

        const camZ = 5 + midi.cc3 * 15;
        this.camera.position.z = camZ;

        if (this.currentMode === '2D') {
            this.p5Manager.update(audio, midi);
            return; // Skip Three.js rendering if 2D mode
        }

        // Update active Three.js content
        if (this.currentMode === 'Photo') {
            this.photoPolygonizer.update(audio, midi);
        } else if (this.currentMode === '3D') {
            // Check Spawn
            if (this.particleSpawner.isActive) {
                this.particleSpawner.update(audio, midi);
            } else {
                // Mode1改善：呼吸アニメーション + 超スロー回転
                this.breathPhase += 0.01;
                const breathScale = 1.0 + Math.sin(this.breathPhase) * 0.1 * audio.low; // 呼吸（低音で±10%）
                const slowRotation = performance.now() * 0.0001; // 超スロー回転（30〜60秒/周）

                this.layers.forEach((layer, i) => {
                    layer.update(audio, midi, midi);

                    // 呼吸スケール適用
                    layer.group.scale.setScalar(breathScale);

                    // 超スロー回転（Y軸）
                    layer.group.rotation.y = slowRotation + i * 0.5;

                    // Beat時の瞬間発光（emissive）
                    if (audio.beat > 0.7) {
                        layer.group.children.forEach(child => {
                            if (child.material && child.material.emissive) {
                                child.material.emissive.setHex(0xffffff);
                                child.material.emissiveIntensity = audio.beat * midi.cc6; // CC6でGlow制御
                            }
                        });
                    } else {
                        layer.group.children.forEach(child => {
                            if (child.material && child.material.emissive) {
                                child.material.emissive.setHex(0x000000);
                                child.material.emissiveIntensity = 0;
                            }
                        });
                    }
                });
            }
        } else if (this.currentMode === 'Shader') {
            // Nothing to update for scene objects as they are hidden
        }

        // v1.3: VisualEffectManagerでシーンを描画し、その結果をCommonEffectsに渡す
        // これにより Mode 1, 2, 4 すべてで共通パイプラインを通る
        const sourceTexture = this.effects.render(audio, midi);
        this.commonEffects.render(audio, midi, sourceTexture);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.effects.onResize();
        this.commonEffects.onResize(); // v1.3
        // P5 handles resize internally via windowResized
    }
}
