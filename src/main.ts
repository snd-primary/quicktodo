import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { HINT_TEXT, isClearDoneShortcut } from "./config";
import { loadTodos, saveTodos, type Todo } from "./store";

const win = getCurrentWindow();

const input = document.getElementById("input") as HTMLInputElement;
const list = document.getElementById("list") as HTMLUListElement;
const hint = document.getElementById("hint") as HTMLElement;
const clearDoneButton = document.getElementById("clear-done") as HTMLButtonElement;

let todos: Todo[] = [];
/** 選択中のインデックス。-1 は入力欄モード。 */
let selected = -1;

// ---- rendering -----------------------------------------------------------

function render(): void {
  list.replaceChildren(
    ...todos.map((t, i) => {
      const li = document.createElement("li");
      li.className = "todo" + (t.done ? " done" : "") + (i === selected ? " selected" : "");
      li.dataset.index = String(i);

      const box = document.createElement("span");
      box.className = "box";
      box.setAttribute("aria-hidden", "true");
      box.textContent = t.done ? "✓" : "";

      const text = document.createElement("span");
      text.className = "text";
      text.textContent = t.text;

      li.append(box, text);
      return li;
    }),
  );
  document.body.classList.toggle("list-mode", selected >= 0);
  const doneCount = todos.filter((t) => t.done).length;
  clearDoneButton.hidden = doneCount === 0;
  clearDoneButton.textContent = `済みを削除 (${doneCount})`;
  const sel = list.children[selected] as HTMLElement | undefined;
  sel?.scrollIntoView({ block: "nearest" });
}

function setSelected(i: number): void {
  selected = i;
  render();
}

// ---- actions -------------------------------------------------------------

function addFromInput(): void {
  const text = input.value.trim();
  input.value = "";
  if (!text) {
    if (selected >= 0) setSelected(-1);
    return;
  }
  todos.push({ id: crypto.randomUUID(), text, done: false, createdAt: Date.now() });
  selected = -1;
  render();
  void saveTodos(todos);
}

function toggleSelected(): void {
  const t = todos[selected];
  if (!t) return;
  t.done = !t.done;
  render();
  void saveTodos(todos);
}

/** 選択中の項目がチェック済みなら削除する。未チェックなら何もしない。 */
function deleteSelectedIfDone(): void {
  const t = todos[selected];
  if (!t || !t.done) return;
  todos.splice(selected, 1);
  if (selected >= todos.length) selected = todos.length - 1; // 空なら -1 になる
  render();
  void saveTodos(todos);
}

function clearDone(): void {
  if (!todos.some((t) => t.done)) return;
  todos = todos.filter((t) => !t.done);
  if (selected >= todos.length) selected = todos.length - 1; // 空なら -1 になる
  render();
  void saveTodos(todos);
}

function hideWindow(): void {
  void win.hide();
}

function focusInput(): void {
  if (selected !== -1) setSelected(-1);
  input.focus();
  const n = input.value.length;
  input.setSelectionRange(n, n);
}

// ---- keyboard ------------------------------------------------------------

// フォーカスは常に入力欄に置き、「リスト内の選択」は仮想的に扱う。
// こうすると文字キーで即入力に戻れ、日本語 IME も自然に動く。
// macOS の WKWebView (Safari 系) は IME の変換確定 Enter を
// compositionend の「後」に isComposing=false / keyCode=229 で keydown 発火する。
// そのため isComposing だけでは弾けず、keyCode 229 と直前の compositionend も見る。
let composing = false;
let composedAt = 0;
let spaceToggledAt = 0;
input.addEventListener("compositionstart", () => {
  composing = true;
});
input.addEventListener("compositionend", () => {
  composing = false;
  composedAt = performance.now();
});

// IME が有効な間は Space や文字キーも keyCode=229 で届くので、
// 229 の判定は Enter に限定する (Space でのチェック切替や文字入力を妨げないため)。
input.addEventListener("keydown", (e) => {
  if (e.isComposing || composing) return;
  // 変換確定の Enter (keyCode 229 / compositionend 直後) は無視する
  if (e.key === "Enter" && (e.keyCode === 229 || performance.now() - composedAt < 50)) return;

  if (e.key === "Escape") {
    e.preventDefault();
    hideWindow();
    return;
  }
  if (isClearDoneShortcut(e)) {
    e.preventDefault();
    clearDone();
    return;
  }
  // Cmd+W / Ctrl+W でも終了せず隠す
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "w") {
    e.preventDefault();
    hideWindow();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    addFromInput();
    return;
  }

  if (selected === -1) {
    // 入力欄モード
    if (e.key === "ArrowDown" && todos.length > 0) {
      e.preventDefault();
      setSelected(0);
    }
    return;
  }

  // リストモード
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (selected < todos.length - 1) setSelected(selected + 1);
      return;
    case "ArrowUp":
      e.preventDefault();
      if (selected === 0) focusInput();
      else setSelected(selected - 1);
      return;
    case " ":
      e.preventDefault();
      // IME 有効時に同じ Space の keydown が二重に届くことがあるので、直後の再発火は無視する
      if (performance.now() - spaceToggledAt < 30) return;
      spaceToggledAt = performance.now();
      toggleSelected();
      return;
    case "ArrowRight":
      e.preventDefault();
      deleteSelectedIfDone();
      return;
    default:
      // 文字キーや Backspace など入力欄を編集するキーは入力欄モードに戻して既定動作に任せる
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key.length === 1 || e.key === "Backspace")) {
        setSelected(-1);
      }
  }
});

// リストモードで IME 経由のスペース (全角含む) が入力欄に挿入されてしまった場合の保険。
// keydown を preventDefault できなかったときは、挿入された 1 文字を取り除いてチェックを切り替える。
input.addEventListener("input", (e) => {
  const ev = e as InputEvent;
  if (selected < 0 || ev.isComposing) return;
  if (ev.data !== " " && ev.data !== "\u3000") return;
  if (!ev.inputType.startsWith("insert") || ev.inputType === "insertFromPaste") return;
  const pos = input.selectionStart ?? input.value.length;
  input.value = input.value.slice(0, pos - 1) + input.value.slice(pos);
  input.setSelectionRange(pos - 1, pos - 1);
  // 通常は直前の keydown 側で切り替え済み。IME の確定は keydown から遅れて届くので窓は広めに取る。
  // keydown が一切来なかった場合だけここで切り替える。
  if (performance.now() - spaceToggledAt > 500) {
    spaceToggledAt = performance.now();
    toggleSelected();
  }
});

// 何かの拍子にフォーカスが外れても入力欄へ戻す
document.addEventListener("focusin", (e) => {
  if (e.target !== input) input.focus();
});
clearDoneButton.addEventListener("click", () => {
  clearDone();
  input.focus();
});
document.addEventListener("mousedown", (e) => {
  // クリックしても構わないが、フォーカスは入力欄に留める
  const li = (e.target as HTMLElement).closest<HTMLElement>("li.todo");
  e.preventDefault();
  if (li?.dataset.index !== undefined) {
    selected = Number(li.dataset.index);
    toggleSelected();
  }
  input.focus();
});
document.addEventListener("contextmenu", (e) => e.preventDefault());

// ---- window lifecycle ----------------------------------------------------

async function main(): Promise<void> {
  hint.textContent = HINT_TEXT;
  todos = await loadTodos();
  render();
  input.focus();

  // Rust 側がウィンドウを表示したとき
  await listen("quicktodo://shown", () => focusInput());
  await win.onFocusChanged(({ payload: focused }) => {
    if (focused) input.focus();
  });

  // 描画完了を Rust 側に通知 (これ以前にホットキーが押された場合は Rust が待ってから表示する)
  await emit("quicktodo://ready");
}

void main();
