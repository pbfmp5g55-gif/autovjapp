import { AudioEngine } from './core/AudioEngine';
import { MidiEngine } from './core/MidiEngine';
import { SceneManager } from './visual/SceneManager';

class App {
  constructor() {
    this.audio = new AudioEngine();
    this.midi = new MidiEngine();
    this.scene = new SceneManager();

    this.isStarted = false;
    this.setupUI();
  }

  setupUI() {
    // Create start overlay
    const overlay = document.createElement('div');
    overlay.id = 'overlay';
    overlay.innerHTML = `
      <div class="content">
        <h1>Multi-Polygon VJ</h1>
        
        <div class="guide" style="text-align: left; margin: 20px auto; max-width: 400px; line-height: 1.6; color: #ccc;">
            <h3>Quick Guide:</h3>
            <ul style="list-style: none; padding: 0;">
                <li>🎵 <strong>Audio:</strong> Use Microphone or Upload MP3/WAV.</li>
                <li>🖼️ <strong>Visuals:</strong> Generative 3D or Upload Photo.</li>
                <li>🎛️ <strong>Control:</strong> Turn on "Auto Pilot" or use MIDI (CC1-6).</li>
            </ul>
        </div>

        <button id="startBtn">CONFIRM & START VJ</button>
        <p style="font-size: 0.8rem; opacity: 0.7;">Mic & MIDI Permission Required</p>
        
        <!-- AdSense Slot -->
        <div style="margin-top: 20px; min-width: 300px; min-height: 250px; background: rgba(255,255,255,0.05);">
            <ins class="adsbygoogle"
                 style="display:block"
                 data-ad-client="ca-pub-6590253658108388"
                 data-ad-slot="0000000000"
                 data-ad-format="auto"
                 data-full-width-responsive="true"></ins>
            <script>
                 (adsbygoogle = window.adsbygoogle || []).push({});
            </script>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('startBtn').addEventListener('click', () => {
      this.start();
      overlay.style.display = 'none';
    });

    // ... HUD setup ...

    // Simple HUD
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div class="controls">
        <select id="vModeSelect">
          <option value="3D">Base: 3D Objects</option>
          <option value="Noise">Base: Pure Generative</option>
          <option value="Composite">Base: Hybrid Mix</option>
        </select>
        <select id="effectSelect">
          <option value="Normal">VJ Mode: Auto (CC5)</option>
          <option value="Kaleidoscope">VJ Mode: Kaleidoscope/Mirror</option>
          <option value="OpArt">VJ Mode: OpArt/Moiré</option>
        </select>
        <select id="presetSelect">
          <option value="L1">L1: Pulse Core</option>
          <option value="L1_Spiral">L1: Spiral</option>
          <option value="L2">L2: Orbit Layers</option>
          <option value="L2_Eccentric">L2: Eccentric</option>
          <option value="L3">L3: Stacked Wave</option>
          <option value="L3_Double">L3: Double Wave</option>
          <option value="Matrix">L4: Matrix Grid</option>
          <option value="Tunnel">L4: Time Tunnel</option>
        </select>
        <select id="countSelect">
          <option value="5" selected>Count: 5</option>
          <option value="10">Count: 10</option>
          <option value="20">Count: 20</option>
          <option value="50">Count: 50</option>
        </select>
        <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" id="autoPilotCheck">
            <label for="autoPilotCheck" style="color: cyan; cursor: pointer;">Auto Pilot (Random CC)</label>
        </div>
        <button id="wireframeBtn">Wireframe</button>
        <div style="flex-basis: 100%; height: 0;"></div> <!-- Break row -->
        <button id="micBtn">Use Mic</button>
        <label for="audioInput" class="custom-file-upload">
            Load Audio
        </label>
        <input type="file" id="audioInput" accept="audio/*, .mp3, .wav, .m4a, .aac, .ogg" style="display: none;">
        
        <div style="flex-basis: 100%; height: 10px;"></div> <!-- Spacer -->
        
        <!-- Photo Mode Controls -->
        <label for="photoInput" class="custom-file-upload" style="border-color: #ff00ff; color: #ff00ff;">
            Upload Photo
        </label>
        <input type="file" id="photoInput" accept="image/*, .jpg, .jpeg, .png, .webp" style="display: none;">
        
        <select id="photoModeSelect">
            <option value="Delaunay">Mode: Low-poly Triangle</option>
            <option value="StainedGlass">Mode: Stained Glass</option>
        </select>
        
        <div style="display: flex; flex-direction: column; color: white;">
            <label id="polyCountLabel" style="font-size: 0.8rem;">Poly Count: 25 (Rec: 20-30)</label>
            <input type="range" id="polyCountRange" min="10" max="100" value="25" step="1" style="width: 150px;">
        </div>
      </div>
      <div id="midiMonitor">CC1: 0 | CC2: 0 | CC3: 0 | CC4: 0 | CC5: 0 | CC6: 0</div>
    `;
    document.body.appendChild(hud);

    // Toggle button (always visible)
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggleHudBtn';
    toggleBtn.innerHTML = 'UI';
    document.body.appendChild(toggleBtn);

    const toggleHUD = () => {
      hud.classList.toggle('hidden');
    };

    toggleBtn.addEventListener('click', toggleHUD);
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'h') toggleHUD();
    });

    document.getElementById('vModeSelect').addEventListener('change', (e) => {
      this.scene.effects.setVMode(e.target.value);
    });
    document.getElementById('effectSelect').addEventListener('change', (e) => {
      this.scene.effects.setSubMode(e.target.value);
    });
    document.getElementById('presetSelect').addEventListener('change', (e) => {
      this.scene.applyPreset(e.target.value);
    });
    document.getElementById('countSelect').addEventListener('change', (e) => {
      this.scene.setObjectCount(parseInt(e.target.value));
    });
    document.getElementById('autoPilotCheck').addEventListener('change', (e) => {
      this.midi.toggleAutoPilot(e.target.checked);
    });
    document.getElementById('wireframeBtn').addEventListener('click', () => {
      const state = !this.scene.layers[0].material.wireframe;
      this.scene.layers.forEach(l => l.setWireframe(state));
    });

    // Audio Controls
    document.getElementById('micBtn').addEventListener('click', () => {
      this.audio.enableMicrophone();
    });
    document.getElementById('audioInput').addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        // iOS Fix: Must resume context inside the event handler
        if (this.audio.context) {
          await this.audio.context.resume();
        }
        this.audio.playFile(e.target.files[0]);
      }
    });

    // Photo Controls
    document.getElementById('photoInput').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.scene.loadPhoto(e.target.files[0]);
        // Switch dropdown to show we are in photo mode (optional visual cue)
      }
    });
    document.getElementById('photoModeSelect').addEventListener('change', (e) => {
      this.scene.setPolyMode(e.target.value);
      if (this.scene.isPhotoMode) {
        // Regenerate if already in photo mode
        // We need to store last file or just wait for next update?
        // Ideally re-process. SceneManager doesn't store file.
        // For now, mode change applies on next load or we can trigger re-process if we store image data in Polygonizer.
        // Actually Polygonizer stores nothing currently. 
        // Let's just set the mode property. Next Upload will use it.
        // Or better: Re-run with existing image data in Polygonizer if possible.
        // Polygonizer has ctx/canvas, so it can regenerate!
        this.scene.photoPolygonizer.createMeshes(
          this.scene.photoPolygonizer.generatePoints(
            this.scene.photoPolygonizer.ctx.getImageData(0, 0, this.scene.photoPolygonizer.canvas.width, this.scene.photoPolygonizer.canvas.height),
            this.scene.photoPolygonizer.polygonCountBase
          ),
          this.scene.photoPolygonizer.ctx.getImageData(0, 0, this.scene.photoPolygonizer.canvas.width, this.scene.photoPolygonizer.canvas.height)
        );
      }
    });
    document.getElementById('polyCountRange').addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('polyCountLabel').innerText = `Poly Count: ${val}`;
      this.scene.setPhotoPolyCount(val);
    });
    document.getElementById('polyCountRange').addEventListener('change', () => {
      // Trigger regen on release
      if (this.scene.isPhotoMode) {
        const p = this.scene.photoPolygonizer;
        const imgData = p.ctx.getImageData(0, 0, p.canvas.width, p.canvas.height);
        p.createMeshes(p.generatePoints(imgData, p.polygonCountBase), imgData);
      }
    });
  }

  async start() {
    await this.audio.init();
    await this.midi.init();
    this.isStarted = true;
    this.animate();
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const time = performance.now() * 0.001;
    this.midi.updateAutoPilot(time);

    const audioData = this.audio.update();
    this.scene.update(audioData, this.midi.ccs);

    // Update monitor
    const m = this.midi.ccs;
    let modeStr = 'Noise/Glitch';
    if (m.cc5 >= 0.33 && m.cc5 < 0.66) modeStr = 'Kaleidoscope/Mirror';
    else if (m.cc5 >= 0.66) modeStr = 'OpArt/Moiré';

    document.getElementById('midiMonitor').innerText =
      `CC1: ${m.cc1.toFixed(2)} | CC2: ${m.cc2.toFixed(2)} | CC3: ${m.cc3.toFixed(2)} | CC4: ${m.cc4.toFixed(2)} | CC5: ${m.cc5.toFixed(2)} (${modeStr}) | CC6: ${m.cc6.toFixed(2)}`;
  }
}

new App();
