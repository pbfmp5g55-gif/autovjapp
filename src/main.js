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

    // Video Mode State
    this.selectedVideoId = null;
    this.isAssigningVideoNote = false;

    // Auto Pilot
    this.lastAutoSwitch = 0;
    this.autoSwitchInterval = 10; // seconds

    this.setupUI();
    this.currentInputType = 'MIC'; // Default
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
      this.updateInputState('MIC');
    });



    // MIDI Note Event Connection
    this.midi.onNoteOn = (note, vel) => {
      if (this.isAssigningVideoNote && this.selectedVideoId) {
        // Assign Note
        this.scene.videoManager.assignNote(this.selectedVideoId, note);
        this.isAssigningVideoNote = false;
        this.renderVideoList(); // Update UI
        const btn = document.getElementById('assignLearnBtn');
        if (btn) {
          btn.textContent = 'Learn Note';
          btn.style.background = '';
          btn.style.color = '';
        }
      } else {
        // Pass to Scene
        this.scene.onNoteOn(note, vel);

        // UI Highlight?
        // Maybe handle in render loop or CSS class toggle if we had a keyboard UI
      }
    };

    // Main HUD
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
        <div id="loadingOverlay"><div id="loadingBar"></div></div>

        <div class="control-row">
            <label>Mode:</label>
            <select id="mainModeSelect">
                <option value="3D" selected>1: 3D Mode</option>
                <option value="Photo">2: Photo Mode</option>
                <option value="2D">3: 2D Mode</option>
                <option value="Photo">2: Photo Mode</option>
                <option value="2D">3: 2D Mode</option>
                <option value="Shader">4: Shader FX</option>
                <option value="Video">5: Video Mode</option>
            </select>
        </div>

        <!-- Sub Controls -->
        <div id="subControls" class="control-group"></div>

        <!-- MIDI Settings (v1.3) -->
        <div style="margin-top:15px; border-top:1px solid rgba(255,255,255,0.2); padding-top:10px; width:100%;">
            <div class="control-row">
                <label style="font-weight:bold; color:#0ff;">MIDI Settings</label>
                <button id="toggleMidiSettings" style="font-size:0.7rem; padding:4px 8px;">Show/Hide</button>
            </div>
            <div id="midiSettingsPanel" style="display:none; margin-top:10px;">
                <div class="control-row">
                    <label>MIDI Input:</label>
                    <select id="midiInputSelect">
                        <option value="all">All Inputs</option>
                    </select>
                </div>
                <div class="control-row">
                    <label>MIDI Channel:</label>
                    <select id="midiChannelSelect">
                        <option value="all">All Channels</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                        <option value="7">7</option>
                        <option value="8">8</option>
                        <option value="9">9</option>
                        <option value="10">10</option>
                        <option value="11">11</option>
                        <option value="12">12</option>
                        <option value="13">13</option>
                        <option value="14">14</option>
                        <option value="15">15</option>
                        <option value="16">16</option>
                    </select>
                </div>
                <div style="font-size:0.7rem; color:#888; margin:5px 0;">
                    ℹ️ Bluetooth MIDI: Pair via OS then reload
                </div>
                <div class="control-row">
                    <button id="showCCMapping" style="width:100%; font-size:0.8rem;">CC Mapping Settings</button>
                </div>
            </div>
        </div>

        <div class="control-row" style="margin-top:15px; border-top:1px solid rgba(255,255,255,0.2); padding-top:10px;">
            <label><input type="checkbox" id="autoPilotCheck"> Auto Pilot</label>
        </div>

        <!-- Input Selector -->
         <div style="width:100%; text-align:left; font-size:0.8rem; color:#aaa; margin-top:10px;">Audio Input:</div>
        <div class="input-selector-group">
            <div id="inputMic" class="input-btn active mic">
                <span>🎤 MIC</span>
                <div class="mic-meter-bar" id="micMeterBar"></div>
            </div>
            <div id="inputSystem" class="input-btn">
                <span>🖥️ PC</span>
            </div>
            <div id="inputFile" class="input-btn">
                <span>📁 FILE</span>
                <input type="file" id="audioInput" accept="audio/*, .mp3, .wav, .m4a" style="display:none;">
            </div>
        </div>

        <div id="midiMonitor" style="margin-top:5px; font-size:10px; color:#888;">Waiting for MIDI...</div>
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

    // Input Selector Logic
    const micBtn = document.getElementById('inputMic');
    const systemBtn = document.getElementById('inputSystem');
    const fileBtn = document.getElementById('inputFile');
    const audioInput = document.getElementById('audioInput');

    micBtn.addEventListener('click', () => {
      this.updateInputState('MIC');
      this.audio.enableMicrophone();
    });

    systemBtn.addEventListener('click', () => {
      this.updateInputState('SYSTEM');
      this.audio.enableSystemAudio();
    });

    fileBtn.addEventListener('click', () => {
      // Trigger file input
      audioInput.click();
    });

    audioInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        // IMPORTANT: Resume context immediately on user action
        if (this.audio.context) await this.audio.context.resume();

        this.updateInputState('FILE');
        // Show Loading
        this.simulateLoading(1500, async () => {
          this.audio.playFile(e.target.files[0]);
        });
      }
    });

    // MIDI Settings Events (v1.3)
    document.getElementById('toggleMidiSettings').addEventListener('click', () => {
      const panel = document.getElementById('midiSettingsPanel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('midiInputSelect').addEventListener('change', (e) => {
      this.midi.setInput(e.target.value);
    });

    document.getElementById('midiChannelSelect').addEventListener('change', (e) => {
      this.midi.setChannel(e.target.value);
    });

    document.getElementById('showCCMapping').addEventListener('click', () => {
      this.showCCMappingModal();
    });

    // MIDI Input List update callback
    this.midi.onInputListChanged = (inputs) => {
      const select = document.getElementById('midiInputSelect');
      select.innerHTML = '<option value="all">All Inputs</option>';
      inputs.forEach(input => {
        const option = document.createElement('option');
        option.value = input.id;
        option.textContent = input.name;
        select.appendChild(option);
      });
      select.value = this.midi.selectedInputId;
    };

    // Restore MIDI settings
    document.getElementById('midiChannelSelect').value = this.midi.selectedChannel;

    this.updateSubUI('3D');
  }

  updateInputState(type) {
    this.currentInputType = type;
    const micBtn = document.getElementById('inputMic');
    const systemBtn = document.getElementById('inputSystem');
    const fileBtn = document.getElementById('inputFile');

    // Remove all active classes
    micBtn.classList.remove('active', 'mic');
    systemBtn.classList.remove('active', 'system');
    fileBtn.classList.remove('active', 'file');

    if (type === 'MIC') {
      micBtn.classList.add('active', 'mic');
    } else if (type === 'SYSTEM') {
      systemBtn.classList.add('active', 'system');
    } else {
      fileBtn.classList.add('active', 'file');
    }
  }

  simulateLoading(duration, callback) {
    const overlay = document.getElementById('loadingOverlay');
    const bar = document.getElementById('loadingBar');
    if (overlay) overlay.style.display = 'block';

    let start = performance.now();

    const loop = () => {
      const now = performance.now();
      const p = Math.min((now - start) / duration, 1.0);
      if (bar) bar.style.width = (p * 100) + '%';

      if (p < 1.0) {
        requestAnimationFrame(loop);
      } else {
        setTimeout(() => {
          if (overlay) overlay.style.display = 'none';
          if (bar) bar.style.width = '0%';
          if (callback) callback();
        }, 200);
      }
    };
    loop();
  }

  showCCMappingModal() {
    // CC Mappingモーダルを作成
    const modal = document.createElement('div');
    modal.id = 'ccMappingModal';
    modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.95);
      border: 2px solid #0ff;
      padding: 20px;
      z-index: 10000;
      max-height: 80vh;
      overflow-y: auto;
      min-width: 400px;
    `;

    const ccParams = [
      { key: 'cc1', label: 'CC1: Intensity' },
      { key: 'cc2', label: 'CC2: Hue / Palette' },
      { key: 'cc3', label: 'CC3: Speed' },
      { key: 'cc4', label: 'CC4: FX Amount' },
      { key: 'cc5', label: 'CC5: Trails' },
      { key: 'cc6', label: 'CC6: Glow / Emissive' },
      { key: 'cc7', label: 'CC7: Contrast' },
      { key: 'cc8', label: 'CC8: Zoom' },
      { key: 'cc9', label: 'CC9: Density' },
      { key: 'cc10', label: 'CC10: Size Variance' },
      { key: 'cc11', label: 'CC11: Noise Scale' },
      { key: 'cc12', label: 'CC12: Curl / Flow' },
      { key: 'cc13', label: 'CC13: Jitter' },
      { key: 'cc14', label: 'CC14: Beat Sensitivity' },
      { key: 'cc15', label: 'CC15: Background Fade' },
      { key: 'cc16', label: 'CC16: Preset-specific' }
    ];

    let html = '<h3 style="color:#0ff; margin-top:0;">CC Mapping Settings</h3>';
    html += '<p style="font-size:0.8rem; color:#888;">各パラメータにMIDI CCを割り当てます。Learnボタンを押してCCを送信してください。</p>';
    html += '<div style="margin-bottom:15px;">';

    ccParams.forEach(param => {
      // 現在のCC番号を取得
      let currentCC = 'None';
      for (let [ccNum, paramName] of Object.entries(this.midi.ccMapping)) {
        if (paramName === param.key) {
          currentCC = `CC${ccNum}`;
          break;
        }
      }

      html += `
        <div style="display:flex; align-items:center; margin:8px 0; font-size:0.85rem;">
          <span style="flex:1; color:#ccc;">${param.label}</span>
          <span id="ccMap_${param.key}" style="width:60px; text-align:center; color:#0f0;">${currentCC}</span>
          <button class="learnBtn" data-param="${param.key}" style="margin-left:10px; font-size:0.7rem; padding:3px 10px;">Learn</button>
        </div>
      `;
    });

    html += '</div>';
    html += '<div style="display:flex; gap:10px; margin-top:15px;">';
    html += '<button id="resetCCMapping" style="flex:1; padding:8px;">Reset to Default</button>';
    html += '<button id="closeCCMapping" style="flex:1; padding:8px; background:#444;">Close</button>';
    html += '</div>';

    modal.innerHTML = html;
    document.body.appendChild(modal);

    // Learn ボタン
    modal.querySelectorAll('.learnBtn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const param = e.target.getAttribute('data-param');
        this.midi.startLearn(param);
        e.target.textContent = 'Waiting...';
        e.target.style.background = '#ff0';
        e.target.style.color = '#000';
      });
    });

    // MIDI Learn完了コールバック
    this.midi.onLearnComplete = (param, ccNum) => {
      const span = document.getElementById(`ccMap_${param}`);
      if (span) span.textContent = `CC${ccNum}`;

      // ボタンをリセット
      modal.querySelectorAll('.learnBtn').forEach(btn => {
        btn.textContent = 'Learn';
        btn.style.background = '';
        btn.style.color = '';
      });
    };

    // Reset ボタン
    document.getElementById('resetCCMapping').addEventListener('click', () => {
      this.midi.resetCCMapping();
      modal.remove();
      this.showCCMappingModal(); // 再表示
    });

    // Close ボタン
    document.getElementById('closeCCMapping').addEventListener('click', () => {
      this.midi.cancelLearn();
      modal.remove();
    });
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
                </select>
            </div>
            <div class="control-row" style="margin-top:5px; font-size:0.8rem; color:#aaa;">
                <span>Polygons: Audio Reactive (Max 30)</span>
            </div>
          `;
      container.innerHTML = html;
      document.getElementById('threePresetSelect').addEventListener('change', (e) => this.scene.applyPreset(e.target.value));
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
      document.getElementById('photoInput').addEventListener('change', (e) => {
        if (e.target.files.length) {
          this.simulateLoading(2000, async () => {
            this.scene.loadPhoto(e.target.files[0]);
          });
        }
      });
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

    } else if (mode === 'Video') {
      const html = `
            <div class="control-row">
                <label>Videos</label>
                <label class="custom-file-upload" style="border:1px solid #0ff; color:#0ff; padding:2px 8px; font-size:0.8rem; cursor:pointer;">
                    + Add
                    <input type="file" id="videoUpload" multiple accept="video/mp4,video/webm" style="display:none;">
                </label>
            </div>
            
            <div id="videoList" class="video-list"></div>
            
            <div class="control-row" style="margin-top:10px;">
                <button id="assignLearnBtn" style="width:100%; font-size:0.8rem; padding:5px;">Assign to MIDI Note (Learn)</button>
            </div>

            <div style="margin-top:15px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
                <div class="control-row">
                    <label>Auto Pilot:</label>
                    <label><input type="checkbox" id="videoAutoPilotCheck"> Enable</label>
                </div>
                <div class="control-row">
                    <label style="font-size:0.8rem;">Interval: <span id="vIntervalVal">2000</span>ms</label>
                    <input type="range" id="videoIntervalRange" min="500" max="8000" step="100" value="2000">
                </div>
            </div>
        `;
      container.innerHTML = html;

      this.renderVideoList();

      // Events
      document.getElementById('videoUpload').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.scene.videoManager.addVideos(e.target.files, (id, status) => {
            this.renderVideoList();
          });
        }
      });

      document.getElementById('assignLearnBtn').addEventListener('click', (e) => {
        if (!this.selectedVideoId) {
          alert('Select a video first!');
          return;
        }
        this.isAssigningVideoNote = true;
        e.target.textContent = 'Press MIDI Note...';
        e.target.style.background = '#ff0';
        e.target.style.color = '#000';
      });

      // Auto Pilot
      const vm = this.scene.videoManager;
      const apCheck = document.getElementById('videoAutoPilotCheck');
      apCheck.checked = vm.autoPilot;
      apCheck.addEventListener('change', (e) => {
        vm.autoPilot = e.target.checked;
      });

      const intRange = document.getElementById('videoIntervalRange');
      intRange.value = vm.autoPilotInterval;
      intRange.addEventListener('input', (e) => {
        document.getElementById('vIntervalVal').textContent = e.target.value;
        vm.autoPilotInterval = parseInt(e.target.value);
      });
    }
  }

  renderVideoList() {
    const list = document.getElementById('videoList');
    if (!list) return;

    const videos = this.scene.videoManager.getVideoList();
    list.innerHTML = '';

    videos.forEach(v => {
      const div = document.createElement('div');
      div.className = 'video-item';
      if (this.selectedVideoId === v.id) div.classList.add('selected');

      let statusIcon = '';
      if (v.status === 'loading') statusIcon = '⏳';
      else if (v.status === 'error') statusIcon = '⚠️';

      let noteBadge = '';
      if (v.assignedNote !== null) {
        noteBadge = `<span class="note-badge">Note ${v.assignedNote}</span>`;
      }

      div.innerHTML = `
            <div class="info">${statusIcon} ${v.name}</div>
            ${noteBadge}
            <button class="remove-btn">×</button>
          `;

      div.addEventListener('click', (e) => {
        // Handle remove click
        if (e.target.classList.contains('remove-btn')) {
          this.scene.videoManager.removeVideo(v.id);
          if (this.selectedVideoId === v.id) this.selectedVideoId = null;
          this.renderVideoList();
          e.stopPropagation();
          return;
        }

        // Select
        this.selectedVideoId = v.id;
        this.renderVideoList();

        // Preview Playback
        this.scene.videoManager.triggerVideo(v.id);
      });

      list.appendChild(div);
    });
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

    // Live Meter Update
    if (this.currentInputType === 'MIC') {
      const meter = document.getElementById('micMeterBar');
      if (meter) {
        // RMS is roughly 0.0 to 1.0 (sometimes higher depending on engine normalisation)
        // Visual scale needed
        const vol = Math.min(audioData.rms * 300, 100);
        meter.style.width = vol + '%';
      }
    }

    const m = this.midi.ccs;
    document.getElementById('midiMonitor').innerText =
      `CC1:${m.cc1.toFixed(2)} CC2:${m.cc2.toFixed(2)} CC3:${m.cc3.toFixed(2)} CC4:${m.cc4.toFixed(2)} | CC5:${m.cc5.toFixed(2)} CC6:${m.cc6.toFixed(2)} CC7:${m.cc7.toFixed(2)} CC8:${m.cc8.toFixed(2)}`;
  }
}

new App();
