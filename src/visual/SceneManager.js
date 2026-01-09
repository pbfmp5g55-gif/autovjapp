import * as THREE from 'three';
import { VJLayer } from './VJLayer';
import { VisualEffectManager } from './VisualEffectManager';
import { PhotoPolygonizer } from './PhotoPolygonizer';
import { P5Manager } from './P5Manager';

export class SceneManager {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

        this.layers = [];
        this.objectCount = 5;
        this.currentPreset = 'L1';

        // Mode state
        this.currentMode = '3D'; // '3D', 'Photo', '2D'

        this.photoPolygonizer = new PhotoPolygonizer(this.scene);
        this.effects = new VisualEffectManager(this.renderer, this.scene, this.camera);
        this.p5Manager = new P5Manager('p5-container');

        this.init();
    }

    init() {
        // THREE setup
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        document.body.appendChild(this.renderer.domElement);
        this.renderer.domElement.id = 'three-canvas';

        this.camera.position.z = 10;

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
                // Disable shader effects for clearer photo view
                this.effects.setVMode('3D');
            } else if (this.currentMode === 'Shader') {
                // Show layers, Enable Effects
                if (this.layers.length === 0) this.setupLayers();
                this.layers.forEach(l => l.group.visible = true);
                this.photoPolygonizer.group.visible = false;

                // Set default shader params, preset will override
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

    // Auto Pilot Logic
    autoSwitchPreset() {
        if (this.currentMode === '3D') {
            const presets = ['L1', 'L1_Spiral', 'L2', 'L2_Eccentric', 'L3', 'Matrix', 'Tunnel'];
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
    update(audio, midi) {
        const camZ = 5 + midi.cc3 * 15;
        this.camera.position.z = camZ;

        if (this.currentMode === '2D') {
            this.p5Manager.update(audio, midi);
            return; // Skip Three.js rendering if 2D mode
        }

        // Update active Three.js content
        if (this.currentMode === 'Photo') {
            this.photoPolygonizer.update(audio, midi);
        } else {
            this.layers.forEach(layer => layer.update(audio, midi, midi));
        }

        this.effects.render(audio, midi);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.effects.onResize();
        // P5 handles resize internally via windowResized
    }
}
