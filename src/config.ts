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

/** ヘルプ画面を開閉するショートカット (CommandOrControl+/) の判定。 */
export function isHelpShortcut(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "/";
}

/**
 * ヘルプ画面に表示するショートカット一覧。表示用の文字列で、実際の判定は各ハンドラにある。
 * キーは半角スペース区切りで複数書ける。⌘ ⇧ ⌫ は macOS 以外では Ctrl / Shift / Backspace に置き換えて表示する。
 */
export const HELP_SECTIONS: { title: string; rows: [keys: string, action: string][] }[] = [
  {
    title: "どこでも",
    rows: [
      // 実際の値は src-tauri/src/lib.rs の TOGGLE_SHORTCUT
      ["⌘⇧Space", "ウィンドウを表示 / 非表示"],
      ["Esc", "ウィンドウを隠す (ヘルプ・編集中は閉じる / 取り消し)"],
      ["⌘⇧⌫", "済み項目をすべて削除"],
      ["⌘/", "このヘルプを開閉"],
    ],
  },
  {
    title: "入力欄",
    rows: [
      ["Enter", "入力内容を追加"],
      ["↓", "リストの先頭を選択"],
    ],
  },
  {
    title: "リスト",
    rows: [
      ["↑ ↓", "選択を移動 (先頭で ↑ は入力欄へ)"],
      ["Space", "チェックを切り替え"],
      ["←", "テキストを編集"],
      ["→", "済みなら削除"],
      ["文字キー", "入力欄に戻って入力"],
    ],
  },
  {
    title: "編集中",
    rows: [
      ["Enter", "確定 (空なら元のまま)"],
      ["Esc", "取り消し"],
    ],
  },
];

/** 最下部に表示するヒント。 */
export const HINT_TEXT = "Enter 追加  ↑↓ 移動  Space チェック  ← 編集  → 済みを削除  Esc 隠す";
