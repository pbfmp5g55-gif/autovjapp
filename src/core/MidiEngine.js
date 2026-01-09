export class MidiEngine {
    constructor() {
        // CC値（0.0〜1.0）
        this.ccs = {
            cc1: 0.5,  // Intensity
            cc2: 0,    // Hue / Palette
            cc3: 0.5,  // Speed
            cc4: 0,    // FX Amount
            cc5: 0,    // Trails
            cc6: 0.5,  // Glow / Emissive
            cc7: 0.5,  // Contrast
            cc8: 0.5,  // Zoom
            cc9: 0.5,  // Density
            cc10: 0.5, // Size Variance
            cc11: 0.5, // Noise Scale
            cc12: 0.5, // Curl / Flow
            cc13: 0,   // Jitter
            cc14: 0.5, // Beat Sensitivity
            cc15: 0.5, // Background Fade
            cc16: 0.5  // Preset-specific
        };

        // MIDI設定
        this.midiAccess = null;
        this.selectedInputId = 'all'; // 'all' or device ID
        this.selectedChannel = 'all'; // 'all' or 1-16
        this.availableInputs = [];

        // CCマッピング（CC番号 → パラメータ名）
        // デフォルト割当
        this.ccMapping = {
            1: 'cc1',   // Intensity
            2: 'cc2',   // Hue
            3: 'cc3',   // Speed
            4: 'cc4',   // FX Amount
            5: 'cc5',   // Trails
            6: 'cc6',   // Glow
            7: 'cc7',   // Contrast
            8: 'cc8',   // Zoom
            9: 'cc9',   // Density
            10: 'cc10', // Size Variance
            11: 'cc11', // Noise Scale
            12: 'cc12', // Curl
            13: 'cc13', // Jitter
            14: 'cc14', // Beat Sensitivity
            15: 'cc15', // Background Fade
            16: 'cc16'  // Preset-specific
        };

        // MIDI Learn状態
        this.isLearning = false;
        this.learningTarget = null; // 'cc1', 'cc2', etc.

        this.isInitialized = false;
        this.isAutoPilot = false;

        // 設定を復元
        this.loadSettings();
    }

    async init() {
        if (this.isInitialized) return;
        if (!navigator.requestMIDIAccess) {
            console.warn('Web MIDI API not supported');
            return;
        }

        try {
            // sysex: false でBluetooth MIDIも含めて取得
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });

            // デバイスリスト更新
            this.updateInputList();

            // デバイス接続/切断の監視
            this.midiAccess.onstatechange = () => {
                console.log('MIDI device state changed');
                this.updateInputList();
            };

            // 初期接続
            this.connectInputs();

            this.isInitialized = true;
            console.log('MidiEngine v1.3 initialized');
        } catch (err) {
            console.error('Failed to initialize MidiEngine:', err);
        }
    }

    updateInputList() {
        this.availableInputs = [];
        if (!this.midiAccess) return;

        const inputs = this.midiAccess.inputs.values();
        for (let input of inputs) {
            this.availableInputs.push({
                id: input.id,
                name: input.name || 'Unknown Device',
                manufacturer: input.manufacturer || '',
                state: input.state
            });
        }

        // UIコールバック（外部から設定）
        if (this.onInputListChanged) {
            this.onInputListChanged(this.availableInputs);
        }
    }

    connectInputs() {
        if (!this.midiAccess) return;

        const inputs = this.midiAccess.inputs.values();
        for (let input of inputs) {
            // 既存のリスナーをクリア
            input.onmidimessage = null;

            // 選択されたデバイスのみ接続
            if (this.selectedInputId === 'all' || input.id === this.selectedInputId) {
                input.onmidimessage = (msg) => this.handleMidiMessage(msg);
                console.log(`Connected to MIDI input: ${input.name}`);
            }
        }
    }

    handleMidiMessage(msg) {
        const [status, data1, data2] = msg.data;
        const type = status & 0xf0;
        const channel = (status & 0x0f) + 1; // 1-16

        // チャンネルフィルタ
        if (this.selectedChannel !== 'all' && channel !== parseInt(this.selectedChannel)) {
            return;
        }

        if (type === 0xb0) { // Control Change
            const ccNum = data1;
            const val = data2 / 127.0;

            // MIDI Learn中
            if (this.isLearning && this.learningTarget) {
                this.ccMapping[ccNum] = this.learningTarget;
                this.isLearning = false;
                console.log(`MIDI Learn: CC${ccNum} → ${this.learningTarget}`);
                this.saveSettings();

                // UIコールバック
                if (this.onLearnComplete) {
                    this.onLearnComplete(this.learningTarget, ccNum);
                }
                return;
            }

            // 通常のCC処理
            const paramName = this.ccMapping[ccNum];
            if (paramName && this.ccs.hasOwnProperty(paramName)) {
                this.ccs[paramName] = val;
                console.log(`MIDI CC${ccNum} (${paramName}): ${val.toFixed(2)}`);
            }
        }
    }

    // MIDI Input選択
    setInput(inputId) {
        this.selectedInputId = inputId;
        this.connectInputs();
        this.saveSettings();
    }

    // MIDI Channel選択
    setChannel(channel) {
        this.selectedChannel = channel; // 'all' or '1'-'16'
        this.saveSettings();
    }

    // MIDI Learn開始
    startLearn(targetParam) {
        // targetParam: 'cc1', 'cc2', etc.
        this.isLearning = true;
        this.learningTarget = targetParam;
        console.log(`MIDI Learn started for ${targetParam}. Send a CC message...`);
    }

    // MIDI Learn中止
    cancelLearn() {
        this.isLearning = false;
        this.learningTarget = null;
    }

    // CCマッピングを手動設定
    setCCMapping(ccNum, paramName) {
        this.ccMapping[ccNum] = paramName;
        this.saveSettings();
    }

    // CCマッピングをリセット
    resetCCMapping() {
        this.ccMapping = {
            1: 'cc1', 2: 'cc2', 3: 'cc3', 4: 'cc4',
            5: 'cc5', 6: 'cc6', 7: 'cc7', 8: 'cc8',
            9: 'cc9', 10: 'cc10', 11: 'cc11', 12: 'cc12',
            13: 'cc13', 14: 'cc14', 15: 'cc15', 16: 'cc16'
        };
        this.saveSettings();
    }

    // 設定保存
    saveSettings() {
        const settings = {
            selectedInputId: this.selectedInputId,
            selectedChannel: this.selectedChannel,
            ccMapping: this.ccMapping
        };
        localStorage.setItem('midiSettings_v1.3', JSON.stringify(settings));
    }

    // 設定復元
    loadSettings() {
        const saved = localStorage.getItem('midiSettings_v1.3');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                this.selectedInputId = settings.selectedInputId || 'all';
                this.selectedChannel = settings.selectedChannel || 'all';
                this.ccMapping = settings.ccMapping || this.ccMapping;
                console.log('MIDI settings loaded from localStorage');
            } catch (e) {
                console.error('Failed to load MIDI settings:', e);
            }
        }
    }

    getCombined(audioVal, midiVal) {
        const mix = 0.4;
        return audioVal * (1 - mix) + midiVal * mix;
    }

    updateAutoPilot(time) {
        if (!this.isAutoPilot) return;

        // Auto Pilot: CC値を自動変化（MIDI入力がない場合のデモ用）
        this.ccs.cc1 = (Math.sin(time * 0.5) * 0.5 + 0.5) * 0.8 + 0.2;
        this.ccs.cc2 = (time * 0.1) % 1.0;
        this.ccs.cc3 = Math.sin(time * 0.2) * 0.4 + 0.5;
        this.ccs.cc4 = Math.max(0, Math.sin(time * 1.5) * Math.sin(time * 0.5));
        this.ccs.cc5 = Math.sin(time * 0.3) * 0.5 + 0.5;
        this.ccs.cc6 = Math.sin(time * 0.8) * 0.5 + 0.5;
        this.ccs.cc7 = Math.sin(time * 0.4) * 0.5 + 0.5;
        this.ccs.cc8 = Math.sin(time * 0.6) * 0.5 + 0.5;
    }

    toggleAutoPilot(enable) {
        this.isAutoPilot = enable;
        console.log(`Auto Pilot: ${enable}`);
    }
}
