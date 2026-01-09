import * as THREE from 'three';
import { VJLayer } from './VJLayer';
import { VisualEffectManager } from './VisualEffectManager';
import { PhotoPolygonizer } from './PhotoPolygonizer';

export class SceneManager {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

        this.layers = [];
        this.objectCount = 5;
        this.currentPreset = 'L1';
        this.isPhotoMode = false;

        this.photoPolygonizer = new PhotoPolygonizer(this.scene);
        this.effects = new VisualEffectManager(this.renderer, this.scene, this.camera);

        this.init();
    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        document.body.appendChild(this.renderer.domElement);

        this.camera.position.z = 10;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(5, 5, 10);
        this.scene.add(pointLight);

        this.setupLayers();

        window.addEventListener('resize', () => this.onResize());
    }

    setupLayers() {
        if (this.isPhotoMode) {
            this.layers.forEach(l => l.group.visible = false);
            this.photoPolygonizer.group.visible = true;
            return;
        }

        // Standard Mode
        this.photoPolygonizer.group.visible = false;

        // Re-create if needed or just toggle visibility
        if (this.layers.length !== this.objectCount) {
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
        } else {
            this.layers.forEach(l => l.group.visible = true);
        }
    }

    setShowPhoto(enable) {
        this.isPhotoMode = enable;
        this.setupLayers();
    }

    async loadPhoto(file) {
        await this.photoPolygonizer.processImage(file);
        this.setShowPhoto(true);
    }

    setPhotoPolyCount(count) {
        this.photoPolygonizer.setPolygonCount(count);
    }

    setPolyMode(mode) {
        this.photoPolygonizer.setMode(mode);
    }

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

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.effects.onResize();
    }

    update(audio, midi) {
        // CC3: Camera Distance
        this.camera.position.z = 5 + midi.cc3 * 15;

        if (this.isPhotoMode) {
            this.photoPolygonizer.update(audio, midi);
        } else {
            this.layers.forEach(layer => layer.update(audio, midi, midi));
        }

        this.effects.render(audio, midi);
    }

    setObjectCount(count) {
        this.objectCount = count;
        this.setupLayers();
    }
}
