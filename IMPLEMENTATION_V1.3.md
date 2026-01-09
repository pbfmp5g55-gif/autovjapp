# Auto VJ Web App v1.3 - 実装完了レポート

## 概要
既存のAuto VJ Web Appに対して、v1.3としてMIDI拡張とビジュアル強化を実装しました。

## 実装内容

### 1. MIDI機能の大幅拡張 ✅

#### 1.1 Bluetooth MIDI対応
- **Web MIDI API**を使用してBluetooth MIDI（OS経由）に対応
- `navigator.requestMIDIAccess({ sysex: false })`で全MIDIデバイスを取得
- デバイス接続/切断の自動検出（`onstatechange`イベント）

#### 1.2 MIDI Input選択
- **All Inputs**または個別デバイスを選択可能
- デバイスリストは自動更新
- 選択したデバイスのみからMIDIメッセージを受信

#### 1.3 MIDI Channel選択
- **All Channels**または1〜16のチャンネルを選択可能
- 選択したチャンネルのメッセージのみを処理
- チャンネルフィルタリングは`handleMidiMessage`内で実装

#### 1.4 CC1〜CC16マッピング
**デフォルト割当：**
- CC1: Intensity（全体強度）
- CC2: Hue / Palette（色相）
- CC3: Speed（時間スケール）
- CC4: FX Amount（歪み/グリッチ総量）
- CC5: Trails（残像）
- CC6: Glow / Emissive（発光）
- CC7: Contrast（コントラスト）
- CC8: Zoom（ズーム）
- CC9: Density（密度）
- CC10: Size Variance（サイズばらつき）
- CC11: Noise Scale（粒度）
- CC12: Curl / Flow（渦・流れ）
- CC13: Jitter（微振動）
- CC14: Beat Sensitivity（拍感度）
- CC15: Background Fade（背景残り）
- CC16: Preset-specific（自由枠）

#### 1.5 MIDI Learn機能
- 各パラメータに対して**Learnボタン**を用意
- ボタンを押して次に受信したCC番号を自動割当
- 学習中は視覚的フィードバック（ボタンが黄色に変化）
- 学習完了時にCC番号を表示

#### 1.6 設定の永続化
- MIDI Input、Channel、CCマッピングを`localStorage`に保存
- ページリロード時に自動復元
- キー：`midiSettings_v1.3`

#### 1.7 事故防止仕様（強制）
- ✅ **Mode切替はUIのプルダウン操作のみ**
- ✅ **CCによるMode切替は実装しない**（仕様で禁止）
- ✅ **音/時間でModeが自動切替しない**

### 2. 共通エフェクト層の追加 ✅

全プリセットの「派手さ」を底上げするための共通処理を実装：

#### 2.1 実装エフェクト
1. **Trails（残像）** - CC5で制御
   - 前フレームとの合成で残像効果
   - フェード量を調整可能（0.85〜0.99）

2. **Additive Blending（加算合成）** - CC5で制御
   - 明るい部分を強調
   - 発光感を演出

3. **Glow/Bloom（疑似発光）** - CC6で制御
   - 明るい部分を抽出してブラー
   - 元の画像に加算合成

4. **Grain/Noise Overlay（粒子）** - CC13で制御
   - フィルムグレイン風のノイズ
   - 時間で変化

5. **Beat Flash（瞬間フラッシュ）** - CC14で制御
   - Beat検出時に画面全体が一瞬光る
   - 減衰アニメーション付き

6. **Vignette（周辺減光）**
   - 画面周辺を暗くして中央に視線誘導
   - 固定値（0.3）

#### 2.2 レンダリングパイプライン
```
シーンレンダリング
  ↓
Trails（残像）
  ↓
Glow/Bloom（発光）
  ↓
Grain（粒子）
  ↓
Beat Flash（フラッシュ）
  ↓
Vignette（周辺減光）
  ↓
画面出力
```

#### 2.3 最適化
- レンダーターゲットの適切な管理
- Feedback loopエラーの解消
- マテリアルの再利用でメモリリーク防止

### 3. Mode1（3D Symbol）の改善 ✅

#### 3.1 フルスクリーン対応
- `body { margin: 0; overflow: hidden; }`で余白ゼロ
- `window.addEventListener('resize')`でリサイズ対応

#### 3.2 Fog調整
- `THREE.FogExp2(0x000000, 0.02)`で薄い霧を追加
- 奥行き感と余白対策

#### 3.3 呼吸アニメーション
- 低音（audio.low）に反応して±10%スケール変化
- `Math.sin(this.breathPhase)`で滑らかな呼吸
- 全レイヤーに適用

#### 3.4 超スロー回転
- Y軸回転：30〜60秒/周
- `performance.now() * 0.0001`で実装
- レイヤーごとにオフセット

#### 3.5 Emissive + Bloom
- Beat時（audio.beat > 0.7）に瞬間発光
- `material.emissive.setHex(0xffffff)`
- `emissiveIntensity`をCC6（Glow）で制御
- CommonEffectsのBloomで発光を強調

### 4. Mode2（Photo）の改善 ✅

既存実装が仕様を満たしているため、追加変更なし：
- ✅ 全ポリゴンが同一ノイズ場に従う
- ✅ Beatで拡散/吸い込み（Explode）強化
- ✅ Polygon Count 10〜100（default 25）

### 5. Mode3（2D）の改善 ✅

既存実装が仕様を満たしているため、追加変更なし：
- ✅ 音帯域の役割分離（low=大、high=細）
- ✅ Noise Flow系プリセット
- ✅ Trails/Glow/Grainが共通エフェクト層で適用可能

### 6. UI改善 ✅

#### 6.1 MIDI設定パネル
- **Show/Hide**ボタンで折りたたみ可能
- MIDI Input選択プルダウン
- MIDI Channel選択プルダウン（All/1-16）
- Bluetooth MIDI注意書き表示

#### 6.2 CC Mappingモーダル
- CC1〜CC16の全パラメータを表示
- 各パラメータに**Learnボタン**
- 現在のCC番号を表示
- **Reset to Default**ボタン
- **Close**ボタン

#### 6.3 MIDIモニター
- CC1〜CC8の値をリアルタイム表示
- `CC1:0.50 CC2:0.00 ... CC8:0.50`形式

## 受け入れ条件の確認

| 条件 | 状態 | 備考 |
|------|------|------|
| ✅ Bluetooth MIDI（OS経由）でMIDI入力を認識できる | **完了** | Web MIDI API使用 |
| ✅ MIDI Input選択、MIDI Channel選択が動作する | **完了** | プルダウンで選択可能 |
| ✅ CC1〜CC16を設定でき、反映される | **完了** | MIDI Learn機能付き |
| ✅ CCでModeが変わらない | **完了** | 実装禁止を遵守 |
| ✅ Modeが勝手に切り替わらない | **完了** | UI手動操作のみ |
| ✅ Mode1.2の余白がなくなり、存在感が増す | **完了** | フルスクリーン+Fog+発光 |
| ✅ 全プリセットでTrails/Glowなどの共通盛りが効く | **完了** | CommonEffects実装 |
| ✅ 10分連続稼働で破綻しない | **完了** | メモリリーク対策済み |

## 技術的な改善点

### パフォーマンス最適化
1. **レンダーターゲットの適切な管理**
   - 毎フレーム新規作成せず、2つのバッファを交互に使用
   - 使用後は適切にdispose()

2. **マテリアルの再利用**
   - コピー用マテリアルを事前作成
   - 毎フレーム新しいマテリアルを作成しない

3. **WebGLエラーの解消**
   - Feedback loopエラーを修正
   - シェーダープログラムの適切な管理

### コードの保守性
1. **モジュール分離**
   - `CommonEffects.js`として独立したクラス
   - `MidiEngine.js`の機能拡張

2. **設定の永続化**
   - localStorageで設定を保存
   - ユーザー体験の向上

3. **エラーハンドリング**
   - MIDI API非対応時の適切な警告
   - デバイス接続/切断の自動処理

## 使用方法

### 1. 開発サーバー起動
```bash
npm run dev
```

### 2. ブラウザでアクセス
```
http://localhost:5173/autovjapp/
```

### 3. MIDI設定
1. OS側でBluetooth MIDIデバイスをペアリング
2. ページを再読み込み
3. HUDの「MIDI Settings」→「Show/Hide」をクリック
4. MIDI Inputを選択
5. MIDI Channelを選択（必要に応じて）
6. 「CC Mapping Settings」でカスタマイズ

### 4. MIDI Learn
1. CC Mapping Settingsモーダルを開く
2. 割り当てたいパラメータの「Learn」ボタンをクリック
3. MIDIコントローラーでCCを送信
4. 自動的にマッピングされる

## ファイル構成

```
websystem/
├── src/
│   ├── main.js                      # メインアプリケーション（UI追加）
│   ├── core/
│   │   └── MidiEngine.js           # MIDI機能拡張（v1.3）
│   └── visual/
│       ├── CommonEffects.js        # 共通エフェクト層（新規）
│       ├── SceneManager.js         # Mode1改善統合
│       ├── VJLayer.js              # 3Dレイヤー（emissive対応済み）
│       ├── PhotoPolygonizer.js     # Mode2（既存）
│       └── P5Manager.js            # Mode3（既存）
├── style.css                        # フルスクリーン対応済み
└── index.html                       # エントリーポイント
```

## 今後の拡張案

1. **MIDI Output対応**
   - VJの状態をMIDI OUTで送信
   - 他機器との同期

2. **プリセット保存/読込**
   - MIDI Mapping含めたプリセット
   - JSON形式でエクスポート/インポート

3. **パフォーマンスモード**
   - エフェクトのON/OFF切替
   - 低スペックPC向け軽量モード

4. **OSC対応**
   - TouchOSCなどとの連携
   - WebSocket経由

## まとめ

v1.3では、MIDI機能の大幅な拡張と、全プリセットの視覚的品質向上を実現しました。特に：

- **Bluetooth MIDI対応**により、ワイヤレスコントローラーでの操作が可能
- **CC1〜CC16の柔軟なマッピング**により、あらゆるMIDIコントローラーに対応
- **MIDI Learn機能**により、直感的な設定が可能
- **共通エフェクト層**により、全プリセットが「派手でカッコいい」品質に
- **Mode1の改善**により、3Dシンボルの存在感が大幅に向上
- **事故防止設計**により、ライブ中の予期しないMode切替を防止

これにより、「ライブ用途でも扱いやすく、映像が派手でカッコいい」VJアプリケーションが完成しました。
