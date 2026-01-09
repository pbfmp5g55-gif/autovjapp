import './style.css';
import { SceneManager } from './visual/SceneManager';
import { AudioEngine } from './core/AudioEngine';
import { MidiEngine } from './core/MidiEngine';

class App {
  constructor() {
    this.scene = new SceneManager();
    this.audio = new AudioEngine();
    this.midi = new MidiEngine();
    this.isStarted = false;

    // Auto Pilot
    this.lastAutoSwitch = 0;
    this.autoSwitchInterval = 10; // seconds

    this.setupUI();
    this.animate();
  }

  performAutoSwitch() {
    // Instant switch
    const newPreset = this.scene.autoSwitchPreset();
    if (newPreset) this.reflectPresetChange(this.scene.currentMode, newPreset);
  }

  setupUI() {
    // Top Overlay
    const overlay = document.createElement('div');
    overlay.id = 'overlay';
    overlay.innerHTML = `
      <div class="content">
        <h1>Multi-Polygon VJ | Auto Visualizer</h1>
        <div class="guide" style="text-align: left; margin: 20px auto; max-width: 400px; line-height: 1.6; color: #ccc;">
            <h3>Mode Guide:</h3>
            <ul style="list-style: none; padding: 0;">
                <li><strong>Mode 1 (3D):</strong> Layered objects responding to sound.</li>
                <li><strong>Mode 2 (Photo):</strong> Upload image -> 2.5D Polygons.</li>
                <li><strong>Mode 3 (2D):</strong> Generative p5.js visuals.</li>
                <li><strong>Mode 4 (Shader):</strong> Noise, Glitch, Kaleidoscope FX.</li>
            </ul>
        </div>
        <button id="startBtn">START VJ</button>
        <p style="font-size: 0.8rem; opacity: 0.7;">Mic & MIDI Permission Required</p>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('startBtn').addEventListener('click', () => {
      this.start();
      overlay.style.display = 'none';
      this.scene.setMode('3D');
      this.updateSubUI('3D');
    });

    // Main HUD
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
        <div class="control-row">
            <label>Mode:</label>
            <select id="mainModeSelect">
                <option value="3D" selected>1: 3D Mode</option>
                <option value="Photo">2: Photo Mode</option>
                <option value="2D">3: 2D Mode</option>
                <option value="Shader">4: Shader FX</option>
            </select>
        </div>

        <!-- Sub Controls -->
        <div id="subControls" class="control-group"></div>

        <div class="control-row" style="margin-top:15px; border-top:1px solid #444; padding-top:10px;">
            <label><input type="checkbox" id="autoPilotCheck"> Auto Pilot</label>
        </div>

        <div class="control-row">
            <button id="micBtn">Mic input</button>
        </div>
        
        <div class="control-row">
            <label class="custom-file-upload">
                File Audio
                <input type="file" id="audioInput" accept="audio/*, .mp3, .wav, .m4a" style="display:none;">
            </label>
        </div>

        <div id="midiMonitor" style="margin-top:10px; font-size:10px; color:#888;">Waiting for MIDI...</div>
    `;
    document.body.appendChild(hud);

    // Toggle Button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggleHudBtn';
    toggleBtn.innerText = 'UI';
    document.body.appendChild(toggleBtn);
    toggleBtn.addEventListener('click', () => { hud.classList.toggle('hidden'); });

    // Events
    document.getElementById('mainModeSelect').addEventListener('change', (e) => {
      const mode = e.target.value;
      this.scene.setMode(mode);
      this.updateSubUI(mode);
    });

    document.getElementById('autoPilotCheck').addEventListener('change', (e) => {
      this.midi.toggleAutoPilot(e.target.checked);
      if (e.target.checked) this.lastAutoSwitch = performance.now() * 0.001;
    });

    document.getElementById('micBtn').addEventListener('click', () => {
      this.audio.enableMicrophone();
    });
    document.getElementById('audioInput').addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        if (this.audio.context) await this.audio.context.resume();
        this.audio.playFile(e.target.files[0]);
      }
    });

    this.updateSubUI('3D');
  }

  updateSubUI(mode) {
    const container = document.getElementById('subControls');
    container.innerHTML = '';

    if (mode === '3D') {
      const html = `
            <div class="control-row">
                <label>Preset:</label>
                <select id="threePresetSelect">
                    <option value="L1">Layered Pulse</option>
                    <option value="L1_Spiral">Spiral Core</option>
                    <option value="L2">Orbit Layers</option>
                    <option value="L2_Eccentric">Eccentric Orbit</option>
                    <option value="L3">Stacked Wave</option>
                    <option value="Matrix">Matrix Grid</option>
                    <option value="Tunnel">Tunnel Vision</option>
                    <option value="Spawn">Spawn: Dynamic Audio</option>
                </select>
            </div>
            <div class="control-row">
                <label>Layers:</label>
                <select id="layerCountSelect">
                    <option value="3">3</option>
                    <option value="5" selected>5</option>
                    <option value="10">10</option>
                </select>
            </div>
          `;
      container.innerHTML = html;
      document.getElementById('threePresetSelect').addEventListener('change', (e) => this.scene.applyPreset(e.target.value));
      document.getElementById('layerCountSelect').addEventListener('change', (e) => this.scene.setObjectCount(parseInt(e.target.value)));
      document.getElementById('threePresetSelect').value = this.scene.currentPreset;

    } else if (mode === 'Photo') {
      const html = `
            <div class="control-row">
                <label class="custom-file-upload" style="border-color:#ff00ff; color:#ff00ff; width:100%; text-align:center;">
                    Select Photo
                    <input type="file" id="photoInput" accept="image/*" style="display:none;">
                </label>
            </div>
            <div class="control-row">
                <label>Style:</label>
                <select id="photoStyleSelect">
                    <option value="Delaunay">Delaunay</option>
                    <option value="Voronoi">Superpixel</option>
                </select>
            </div>
            <div class="control-row">
                <label>Polygons: <span id="polyVal">25</span></label>
                <input type="range" id="polyRange" min="10" max="100" value="25">
            </div>
            <button id="regenBtn" style="width:100%; margin-top:5px; font-size:0.8rem; padding:5px;">Regenerate</button>
          `;
      container.innerHTML = html;
      document.getElementById('photoInput').addEventListener('change', (e) => { if (e.target.files.length) this.scene.loadPhoto(e.target.files[0]); });
      document.getElementById('photoStyleSelect').addEventListener('change', (e) => this.scene.setPolyMode(e.target.value));
      document.getElementById('polyRange').addEventListener('input', (e) => document.getElementById('polyVal').innerText = e.target.value);
      document.getElementById('polyRange').addEventListener('change', (e) => this.scene.setPhotoPolyCount(parseInt(e.target.value)));
      document.getElementById('regenBtn').addEventListener('click', () => this.scene.setPhotoPolyCount(parseInt(document.getElementById('polyRange').value)));

    } else if (mode === '2D') {
      const html = `
            <div class="control-row">
                <label>Preset:</label>
                <select id="p5PresetSelect">
                    <option value="Noise Field">Noise Field</option>
                    <option value="Glitch Scan">Glitch Scan</option>
                    <option value="Kaleido Mirror">Kaleido Mirror</option>
                    <option value="Op Art Moiré">Op Art Moiré</option>
                    <option value="Particle Constellation">Particle Constellation</option>
                </select>
            </div>
          `;
      container.innerHTML = html;
      document.getElementById('p5PresetSelect').addEventListener('change', (e) => this.scene.setP5Preset(e.target.value));
      document.getElementById('p5PresetSelect').value = this.scene.p5Manager.currentPreset;

    } else if (mode === 'Shader') {
      const html = `
            <div class="control-row">
                <label>Effect:</label>
                <select id="shaderPresetSelect">
                    <option value="Noise">Noise / Glitch</option>
                    <option value="Kaleido">Kaleidoscope</option>
                    <option value="OpArt">OpArt / Moiré</option>
                </select>
            </div>
             <div class="control-row">
                <label>Color:</label>
                <select id="shaderColorSelect">
                    <option value="Color">Full Color</option>
                    <option value="Mono">Monochrome</option>
                </select>
            </div>
          `;
      container.innerHTML = html;
      document.getElementById('shaderPresetSelect').addEventListener('change', (e) => this.scene.setShaderPreset(e.target.value));
      document.getElementById('shaderColorSelect').addEventListener('change', (e) => {
        this.scene.setShaderColorMode(e.target.value === 'Mono');
      });
    }
  }

  reflectPresetChange(mode, newValue) {
    if (mode === '3D') {
      const el = document.getElementById('threePresetSelect');
      if (el) el.value = newValue;
    } else if (mode === 'Photo') {
      const el = document.getElementById('photoStyleSelect');
      if (el) el.value = newValue;
    } else if (mode === '2D') {
      const el = document.getElementById('p5PresetSelect');
      if (el) el.value = newValue;
    } else if (mode === 'Shader') {
      const el = document.getElementById('shaderPresetSelect');
      if (el) el.value = newValue;
    }
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

    if (this.midi.isAutoPilot && this.isStarted) {
      if (time - this.lastAutoSwitch > this.autoSwitchInterval) {
        this.performAutoSwitch();
        this.lastAutoSwitch = time;
      }
    }

    const audioData = this.audio.update();
    this.scene.update(audioData, this.midi.ccs);

    const m = this.midi.ccs;
    document.getElementById('midiMonitor').innerText =
      `CC1:${m.cc1.toFixed(2)} CC2:${m.cc2.toFixed(2)} CC3:${m.cc3.toFixed(2)} CC4:${m.cc4.toFixed(2)}`;
  }
}

new App();
