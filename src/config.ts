/**
 * フロントエンド側の設定値。すべてここで変更する。
 *
 * ウィンドウ表示/非表示のグローバルショートカットと、フォーカス喪失時に隠す挙動は
 * Rust 側 (src-tauri/src/lib.rs) の定数で管理している。
 */

/** 保存ファイル名。アプリデータディレクトリ直下に置かれる。 */
export const STORE_FILE = "todos.json";

/** 保存データのスキーマバージョン。 */
export const STORE_VERSION = 1 as const;

/** チェック済み項目を一括削除するショートカット (CommandOrControl+Shift+Backspace) の判定。 */
export function isClearDoneShortcut(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Backspace";
}

/** 最下部に表示するヒント。 */
export const HINT_TEXT = "Enter 追加  ↑↓ 移動  Space チェック  → 済みを削除  Esc 隠す";
