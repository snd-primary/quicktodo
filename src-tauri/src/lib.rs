//! quicktodo: 常駐型・キーボード専用の最小 TODO アプリ (Rust 側)。
//!
//! 設定値はこのファイル冒頭の定数で変更する。

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Listener, Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

// ---- 設定 -------------------------------------------------------------------

/// ウィンドウの表示/非表示をトグルするグローバルショートカット。
pub const TOGGLE_SHORTCUT: &str = "CommandOrControl+Shift+Space";

/// ウィンドウがフォーカスを失ったら隠す (ランチャー的な挙動)。
pub const HIDE_ON_BLUR: bool = true;

/// 初回起動時にログイン時自動起動を有効化する。
pub const ENABLE_AUTOSTART: bool = true;

/// 保存ファイル名 (アプリデータディレクトリ直下)。フロントエンド側 src/config.ts と一致させる。
pub const STORE_FILE: &str = "todos.json";

// -----------------------------------------------------------------------------

const MAIN_WINDOW: &str = "main";
const EVENT_SHOWN: &str = "quicktodo://shown";
const EVENT_READY: &str = "quicktodo://ready";
const AUTOSTART_MARKER: &str = ".autostart-initialized";

/// フロントエンドの描画完了を待つための状態。
#[derive(Default)]
struct Readiness {
    ready: AtomicBool,
    pending_show: AtomicBool,
}

fn show_window(app: &AppHandle) {
    let readiness = app.state::<Readiness>();
    if !readiness.ready.load(Ordering::SeqCst) {
        // まだリストを描画し終えていないので、ready を受け取ってから表示する
        readiness.pending_show.store(true, Ordering::SeqCst);
        return;
    }
    if let Some(w) = app.get_webview_window(MAIN_WINDOW) {
        let _ = w.center();
        let _ = w.show();
        let _ = w.set_focus();
        let _ = app.emit_to(MAIN_WINDOW, EVENT_SHOWN, ());
    }
}

fn hide_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN_WINDOW) {
        let _ = w.hide();
    }
}

fn toggle_window(app: &AppHandle) {
    let Some(w) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let visible = w.is_visible().unwrap_or(false);
    let focused = w.is_focused().unwrap_or(false);
    if visible && focused {
        hide_window(app);
    } else {
        show_window(app);
    }
}

/// 保存ファイルが壊れていたら `todos.json.bak` に退避する。
/// ファイルが無い場合は何もしない (フロントエンドが空リストで新規作成する)。
fn sanitize_store_file(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let path = dir.join(STORE_FILE);
    let Ok(bytes) = std::fs::read(&path) else {
        return;
    };
    let valid = match serde_json::from_slice::<serde_json::Value>(&bytes) {
        Ok(serde_json::Value::Object(map)) => match map.get("todos") {
            None | Some(serde_json::Value::Array(_)) => true,
            Some(_) => false,
        },
        _ => false,
    };
    if !valid {
        let bak = dir.join(format!("{STORE_FILE}.bak"));
        match std::fs::rename(&path, &bak) {
            Ok(()) => eprintln!("quicktodo: store file was corrupted; moved to {}", bak.display()),
            Err(e) => eprintln!("quicktodo: failed to move corrupted store file: {e}"),
        }
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "表示", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("quicktodo")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        });

    #[cfg(target_os = "macos")]
    {
        let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
        builder = builder.icon(icon).icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }
    }

    builder.build(app)?;
    Ok(())
}

/// 初回起動時のみ autostart を有効化する。dev ビルドでは何もしない。
fn init_autostart(app: &AppHandle) {
    if !ENABLE_AUTOSTART || cfg!(debug_assertions) {
        return;
    }
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let marker = dir.join(AUTOSTART_MARKER);
    if marker.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&dir);
    match app.autolaunch().enable() {
        Ok(()) => {
            let _ = std::fs::write(&marker, b"");
        }
        Err(e) => eprintln!("quicktodo: failed to enable autostart: {e}"),
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(Readiness::default())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            sanitize_store_file(&handle);
            build_tray(&handle)?;
            init_autostart(&handle);

            // フロントエンドの描画完了を待ち、保留中の表示要求があれば表示する
            let ready_handle = handle.clone();
            handle.listen(EVENT_READY, move |_| {
                let readiness = ready_handle.state::<Readiness>();
                readiness.ready.store(true, Ordering::SeqCst);
                if readiness.pending_show.swap(false, Ordering::SeqCst) {
                    show_window(&ready_handle);
                }
            });

            let shortcut: Shortcut = TOGGLE_SHORTCUT.parse()?;
            app.global_shortcut().register(shortcut)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                // × / Cmd+W / Alt+F4 では終了せず隠す
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if HIDE_ON_BLUR => {
                let _ = window.hide();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running quicktodo");
}
