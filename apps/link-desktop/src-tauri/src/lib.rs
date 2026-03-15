mod commands;
mod sidecar;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};
use tracing_subscriber::EnvFilter;

use commands::{
    check_for_updates, export_diagnostics_bundle, get_app_paths, get_daemon_status,
    get_desktop_preferences, install_update, open_data_dir, open_logs_dir, read_daemon_log_tail,
    reset_desktop_state, restart_daemon, set_desktop_preferences, start_daemon, stop_daemon,
};
use sidecar::DesktopAppState;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let state = DesktopAppState::load(app.handle())?;
            app.manage(state.clone());
            build_tray(app)?;
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = state.start_daemon(&app_handle).await;
            });
            Ok(())
        })
        .on_window_event(|event| {
            if let WindowEvent::CloseRequested { api, .. } = event.event() {
                let app = event.window().app_handle();
                if cfg!(any(target_os = "macos", target_os = "windows")) {
                    if let Some(state) = app.try_state::<DesktopAppState>() {
                        let should_hide =
                            tauri::async_runtime::block_on(state.close_to_tray_enabled());
                        if should_hide {
                            event.window().hide().ok();
                            api.prevent_close();
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_paths,
            get_desktop_preferences,
            set_desktop_preferences,
            reset_desktop_state,
            get_daemon_status,
            start_daemon,
            stop_daemon,
            restart_daemon,
            open_logs_dir,
            open_data_dir,
            read_daemon_log_tail,
            export_diagnostics_bundle,
            check_for_updates,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("tauri application error");
}

fn build_tray(app: &mut tauri::App) -> anyhow::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open app", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart-daemon", "Restart daemon", true, None::<&str>)?;
    let status = MenuItem::with_id(app, "show-status", "Show status", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit app", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &restart, &status, &quit])?;

    let app_handle = app.handle().clone();
    TrayIconBuilder::with_id("animus-link-tray")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "restart-daemon" => {
                if let Some(state) = app.try_state::<DesktopAppState>() {
                    let state = state.inner().clone();
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = state.restart_daemon(&app).await;
                    });
                }
            }
            "show-status" => {
                if let Some(state) = app.try_state::<DesktopAppState>() {
                    let state = state.inner().clone();
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = state.emit_status(&app).await;
                    });
                }
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(&app_handle)?;
    Ok(())
}
