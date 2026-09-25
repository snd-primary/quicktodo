# quicktodo

自分専用の、常駐型・キーボード専用の最小 TODO アプリ。
「今やっていること・考えていること」を思いついた瞬間に書き出し、チェックして、まとめて消す。それ以外の機能は持たない。

- Tauri v2 + Vite + vanilla TypeScript (UI フレームワークなし)
- 起動時はウィンドウを出さずトレイに常駐。グローバルホットキーで表示/非表示をトグル
- macOS / Windows 対応

## ホットキー

| キー | 状態 | 動作 |
|---|---|---|
| `Cmd/Ctrl+Shift+Space` | グローバル | ウィンドウの表示/非表示をトグル |
| `Enter` | 入力欄 | 入力内容を末尾に追加 (前後の空白は除去、空なら無視) |
| `↓` | 入力欄 | リストの先頭項目を選択 |
| `↑` / `↓` | リスト | 選択を上下に移動。先頭で `↑` を押すと入力欄に戻る |
| `Space` | リスト | 選択中項目のチェックをトグル |
| 任意の文字キー | リスト | 入力欄に戻ってその文字を入力 |
| `Cmd/Ctrl+Shift+Backspace` | どこでも | チェック済み項目をすべて削除 (確認なし)。最下部の「済みを削除 (N)」ボタンのクリックでも同じ |
| `Esc` | どこでも | ウィンドウを隠す |
| `Cmd+W` / `×` / `Alt+F4` | ウィンドウ | 終了せず隠す |

アプリの終了はトレイメニューの「終了」からのみ行う。
ウィンドウがフォーカスを失うと自動で隠れる (定数で OFF にできる)。

## ビルド手順

### 必要なもの

- Node.js 20+ / npm
- Rust (stable) — <https://rustup.rs>
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Windows: Visual Studio Build Tools (C++ ワークロード) と WebView2 ランタイム

### 開発

```sh
npm install
npm run tauri dev
```

dev ビルドではログイン時自動起動の登録は行わない (開発用バイナリのパスが登録されるのを避けるため)。

### リリースビルド

```sh
npm install
npm run tauri build
```

成果物は `src-tauri/target/release/bundle/` 以下に生成される。

- macOS: `macos/quicktodo.app`, `dmg/quicktodo_0.1.0_aarch64.dmg`
- Windows: `nsis/quicktodo_0.1.0_x64-setup.exe`, `msi/quicktodo_0.1.0_x64_en-US.msi`

`src-tauri/Cargo.toml` の `[profile.release]` は `opt-level = "s"`, `lto = true`, `codegen-units = 1`, `strip = true`, `panic = "abort"` を指定している。

### ビルドサイズ (macOS arm64, 2026-09-26 時点)

| 成果物 | サイズ |
|---|---|
| `target/release/quicktodo` (実行ファイル単体) | 3.4 MB (3,420,080 bytes) |
| `bundle/macos/quicktodo.app` | 3.3 MB |
| `bundle/dmg/quicktodo_0.1.0_aarch64.dmg` | 1.6 MB (1,616,165 bytes) |

Rust 1.98.1 / Tauri 2.11 / macOS 26 (Apple Silicon) でのビルド。Windows 版のサイズは未計測。

## 保存ファイルの場所

`tauri-plugin-store` を使い、アプリデータディレクトリ直下の `todos.json` に保存する。

| OS | パス |
|---|---|
| macOS | `~/Library/Application Support/com.snd.quicktodo/todos.json` |
| Windows | `%APPDATA%\com.snd.quicktodo\todos.json` |

```json
{ "version": 1, "todos": [{ "id": "…", "text": "…", "done": false, "createdAt": 1758800000000 }] }
```

追加・チェック・一括削除のたびに即時保存する。
ファイルが無ければ空リストで起動する。JSON として壊れている、または `todos` が配列でない場合は、起動時に `todos.json.bak` へ退避してから空リストで起動する (既存の `.bak` は上書き)。

同じディレクトリの `.autostart-initialized` は「自動起動を初回に有効化済み」のマーカー。消すと次回起動時に再度有効化する。

## 定数の変更箇所

設定画面は無い。設定値はソース内の定数で持つ。

| 設定 | 場所 | 定数 |
|---|---|---|
| 表示/非表示のグローバルホットキー | `src-tauri/src/lib.rs` | `TOGGLE_SHORTCUT` (`"CommandOrControl+Shift+Space"`) |
| フォーカス喪失時に隠す | `src-tauri/src/lib.rs` | `HIDE_ON_BLUR` (`true`) |
| ログイン時自動起動を初回に有効化 | `src-tauri/src/lib.rs` | `ENABLE_AUTOSTART` (`true`) |
| 保存ファイル名 | `src-tauri/src/lib.rs` と `src/config.ts` | `STORE_FILE` (`"todos.json"`、両方を揃える) |
| チェック済み一括削除のキー判定 | `src/config.ts` | `isClearDoneShortcut()` |
| 最下部のヒント文 | `src/config.ts` | `HINT_TEXT` |
| ウィンドウサイズ・常に手前・装飾なし | `src-tauri/tauri.conf.json` | `app.windows[0]` (420×480) |
| トレイメニュー項目 | `src-tauri/src/lib.rs` | `build_tray()` |

ホットキーの書式は `tauri-plugin-global-shortcut` の形式 (`CommandOrControl`, `Shift`, `Alt`, `Super` などを `+` で連結)。

## 実装メモ

- キーボードフォーカスは常に入力欄に置き、「リスト内の選択」は仮想的に扱っている。文字キーで即入力に戻れ、日本語 IME の変換中 (`isComposing`) は Space / Enter をリスト操作として扱わない。
- macOS では `ActivationPolicy::Accessory` で Dock に出ない。Windows では `skipTaskbar` でタスクバーに出ない。
- ホットキーがフロントエンドの初回描画より先に押された場合、Rust 側は描画完了イベント (`quicktodo://ready`) を待ってからウィンドウを表示する。

## 非スコープ

項目の編集・並べ替え・個別削除、期限・優先度・タグ・複数リスト、検索・フィルタ、同期・通知、設定画面、Undo は実装しない。
