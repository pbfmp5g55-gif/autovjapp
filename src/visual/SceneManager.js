import * as THREE from 'three';
import { VJLayer } from './VJLayer';
import { VisualEffectManager } from './VisualEffectManager';
import { PhotoPolygonizer } from './PhotoPolygonizer';
import { P5Manager } from './P5Manager';
import { AudioReactiveParticles } from './AudioReactiveParticles';
import { CommonEffects } from './CommonEffects'; // v1.3
import { BlobSwarmMode } from '../modes/BlobSwarmMode'; // New Mode




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
        this.objectCount = 30; // Max count for Mode 1
        this.currentPreset = 'L1';
        this.currentMode = '3D'; // 3D, Photo, 2D, Shader

        // Managers
        this.effects = new VisualEffectManager(this.renderer, this.scene, this.camera);
        this.commonEffects = new CommonEffects(this.renderer, this.scene, this.camera); // v1.3
        this.p5Manager = new P5Manager('p5-container');
        this.p5Manager.init(); // Initialize p5 instance
        this.photoPolygonizer = new PhotoPolygonizer(this.scene);
        this.particleSpawner = new AudioReactiveParticles(this.scene);
        this.blobSwarmMode = new BlobSwarmMode(this.scene, this.camera, this.renderer);

        // New Mode


        // Mode1 Logic State
        this.lastSpawnTime = 0;
        this.disappearTimer = 0;
        this.targetCount = 1;
        this.currentCount = 0;

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

            // Reset all visibilities first
            this.layers.forEach(l => l.group.visible = false);
            this.photoPolygonizer.group.visible = false;
            if (this.particleSpawner) this.particleSpawner.setVisible(false);
            this.blobSwarmMode.setVisible(false);

            if (this.currentMode === 'Photo') {
                this.photoPolygonizer.group.visible = true;
                // Disable shader effects for clearer photo view
                this.effects.setVMode('3D');
            } else if (this.currentMode === 'Shader') {
                // Set default shader params
                this.effects.setVMode('Noise');
            } else if (this.currentMode === 'HoloBlob') {
                this.blobSwarmMode.setVisible(true);
                this.effects.setVMode('3D');
            } else { // 3D Standard


                if (this.layers.length === 0) this.setupLayers();
                this.layers.forEach(l => l.group.visible = true);

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
        } else if (this.currentMode === 'HoloBlob') {
            if (this.blobSwarmMode && this.blobSwarmMode.presets.length > 0) {
                const presets = this.blobSwarmMode.presets;
                const next = presets[Math.floor(Math.random() * presets.length)].id;
                this.blobSwarmMode.applyPreset(next);
                console.log('Auto Preset (Holo):', next);
                return next;
            }
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

            if (presetId === 'L1') { // Random Cloud (formerly Pulse Core)
                // Randomize position for "Natural" feel
                const range = 15;
                const zRange = 40;
                layer.setPosition(
                    (Math.random() - 0.5) * range,
                    (Math.random() - 0.5) * range,
                    -Math.random() * zRange
                );
                layer.group.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            } else if (presetId === 'L1_Spiral') { // Pulse Core (Spiral)
                const r = 2;
                layer.setPosition(Math.cos(angleOffset) * r, Math.sin(angleOffset) * r, -i * 4);
                layer.group.rotation.set(0, 0, angleOffset);
            } else if (presetId === 'L2') { // Orbit Layers
                const radius = 5 + i * 2;
                const angle = t * Math.PI * 2;
                layer.setPosition(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
            } else if (presetId === 'L2_Eccentric') { // Orbit Layers (Eccentric)
                const radius = 6 + i * 2;
                const angle = t * Math.PI * 2;
                layer.setPosition(Math.cos(angle) * radius, Math.sin(angle * 1.5) * radius * 0.5, Math.sin(angle) * 5);
            } else if (presetId === 'L3') { // Stacked Wave
                layer.setPosition((t - 0.5) * 20, Math.sin(t * Math.PI) * 5, -i * 2);
            } else if (presetId === 'L3_Double') { // Stacked Wave (Double)
                const x = (t - 0.5) * 25;
                const y = Math.cos(t * Math.PI * 2) * 8;
                layer.setPosition(x, y, -i * 3);
            } else if (presetId === 'Matrix') { // Grid Layout
                const cols = Math.ceil(Math.sqrt(this.objectCount));
                const spacing = 4;
                layer.setPosition(
                    ((i % cols) - cols / 2) * spacing,
                    (Math.floor(i / cols) - cols / 2) * spacing,
                    0
                );
                layer.group.rotation.set(0, 0, 0);
            } else if (presetId === 'Tunnel') { // Tunnel Layout
                const angle = i * 0.5;
                const radius = 3;
                layer.setPosition(
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

    // HoloBlob Mode
    setHoloPreset(id) {
        if (this.blobSwarmMode) {
            this.blobSwarmMode.applyPreset(id);
        }
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

        // Zoom control disabled per user request
        if (this.currentMode === 'Photo') {
            this.camera.position.z = 8; // Closer for Photo mode to enhance impact
        } else {
            this.camera.position.z = 20; // Fixed Z for 3D Swarm
        }

        if (this.currentMode === '2D') {
            this.p5Manager.update(audio, midi);
            return; // Skip Three.js rendering if 2D mode
        }

        // Update active Three.js content
        if (this.currentMode === 'Photo') {
            this.photoPolygonizer.update(audio, midi);
        } else if (this.currentMode === 'HoloBlob') {
            this.blobSwarmMode.update(audio);
            // Bloom Control?
            if (this.blobSwarmMode.currentPreset.post.bloom) {
                this.commonEffects.bloomStrength = this.blobSwarmMode.currentPreset.post.bloomStrength;
            } else {
                this.commonEffects.bloomStrength = 0;
            }
        } else if (this.currentMode === '3D') {
            // Check Spawn
            if (this.particleSpawner.isActive) {
                this.particleSpawner.update(audio, midi);
            } else {
                // --- Mode 1 Logic: Audio Driven Polygon Swarm ---

                const now = performance.now();
                const rms = audio.rms || 0;

                // 1. Calculate Target Count
                // Quiet: 1-3, Normal: 4-7, High: 8-15, Peak: 16-30
                // Simple mapping logic
                let target = 0;
                if (rms < 0.2) target = Math.floor(THREE.MathUtils.mapLinear(rms, 0, 0.2, 1, 3));
                else if (rms < 0.5) target = Math.floor(THREE.MathUtils.mapLinear(rms, 0.2, 0.5, 4, 7));
                else if (rms < 0.8) target = Math.floor(THREE.MathUtils.mapLinear(rms, 0.5, 0.8, 8, 15));
                else target = Math.floor(THREE.MathUtils.mapLinear(rms, 0.8, 1.0, 16, 30));

                // Clamp
                target = Math.max(1, Math.min(30, target));
                this.targetCount = target;

                // Count Active Layers
                const activeLayers = this.layers.filter(l => l.isActive);
                const activeCount = activeLayers.length;
                this.currentCount = activeCount;

                // 2. Spawn Logic
                // Condition: Beat detected AND activeCount < targetCount AND Cooldown check
                const isBeat = audio.beat > 0.6; // Threshold for beat
                const spawnCooldownTime = 200; // ms 

                // Force spawn if less than min (3) to ensure visibility
                const forceSpawn = activeCount < 3;

                if ((forceSpawn || (isBeat && activeCount < target)) && (now - this.lastSpawnTime > spawnCooldownTime)) {
                    // Find RANDOM inactive layer
                    const inactiveLayers = this.layers.filter(l => !l.isActive);
                    if (inactiveLayers.length > 0) {
                        const inactiveLayer = inactiveLayers[Math.floor(Math.random() * inactiveLayers.length)];
                        inactiveLayer.spawn();
                        this.lastSpawnTime = now;
                    }
                }

                // 3. Disappear Logic
                // Condition: activeCount > targetCount persisted
                if (activeCount > target) {
                    this.disappearTimer += 16; // approx ms per frame
                    if (this.disappearTimer > 500) { // Delayed reaction (0.5s)
                        // Find one active layer to remove. 
                        // To look natural, maybe remove random or oldest? 
                        // Let's remove the one with highest index currently active (often 'outer' ones in some layouts) or just random.
                        // Random prevents pattern artifacts.
                        const activeCandidates = this.layers.filter(l => l.isActive && !l.isDisappearing);
                        if (activeCandidates.length > 0) {
                            const toRemove = activeCandidates[Math.floor(Math.random() * activeCandidates.length)];

                            // 4. Determine Disappear Type
                            // Beat/Low -> Suck, Mid -> Shrink, Low RMS -> Fade
                            let type = 'fade'; // Default

                            // Priority: Beat > Low > Mid > RMS
                            if (audio.beat > 0.7 || audio.low > 0.6) {
                                type = 'suck';
                            } else if (audio.mid > 0.6) {
                                type = 'shrink';
                            } else {
                                type = 'fade';
                            }

                            toRemove.disappear(type);
                            this.disappearTimer = 0; // Reset timer after action
                        }
                    }
                } else {
                    this.disappearTimer = 0;
                }

                // 5. Update All Layers
                // Also apply global motion (slow rotation of the whole group/camera perception)
                // SceneManager usually handles camera z, but here we can rotate individual layers in VJLayer.js or here.
                // VJLayer.js handles its own rotation.

                this.layers.forEach(layer => {
                    layer.update(audio, midi, midi);
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
