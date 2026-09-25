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
input.addEventListener("keydown", (e) => {
  if (e.isComposing) return;

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
      toggleSelected();
      return;
    default:
      // 文字キーや Backspace など入力欄を編集するキーは入力欄モードに戻して既定動作に任せる
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key.length === 1 || e.key === "Backspace")) {
        setSelected(-1);
      }
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
