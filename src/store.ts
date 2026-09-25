import { load, type Store } from "@tauri-apps/plugin-store";
import { STORE_FILE, STORE_VERSION } from "./config";

export type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number; // epoch ms
};

export type StoreShape = {
  version: typeof STORE_VERSION;
  todos: Todo[];
};

let store: Store | null = null;

function isTodo(v: unknown): v is Todo {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.text === "string" &&
    typeof o.done === "boolean" &&
    typeof o.createdAt === "number"
  );
}

/**
 * 保存ファイルを読み込み、TODO 一覧を返す。
 * ファイルが無い・読めない・形が違う場合は空配列を返す
 * (壊れたファイルの .bak 退避は Rust 側が起動時に行う)。
 */
export async function loadTodos(): Promise<Todo[]> {
  try {
    store = await load(STORE_FILE, {
      autoSave: false,
      defaults: { version: STORE_VERSION, todos: [] } satisfies StoreShape,
    });
    const raw = await store.get<unknown>("todos");
    return Array.isArray(raw) ? raw.filter(isTodo) : [];
  } catch (err) {
    console.error("failed to load store:", err);
    store = null;
    return [];
  }
}

/** 追加・トグル・一括削除のたびに即時保存する。 */
export async function saveTodos(todos: Todo[]): Promise<void> {
  if (!store) {
    try {
      store = await load(STORE_FILE, { autoSave: false });
    } catch (err) {
      console.error("failed to open store:", err);
      return;
    }
  }
  try {
    await store.set("version", STORE_VERSION);
    await store.set("todos", todos);
    await store.save();
  } catch (err) {
    console.error("failed to save store:", err);
  }
}
