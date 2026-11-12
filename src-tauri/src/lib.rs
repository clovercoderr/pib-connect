mod commands;
mod menu;
mod serial;
mod state;

use state::AppState;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn open_new_project_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("new-project") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }
    let _window = WebviewWindowBuilder::new(&app, "new-project", WebviewUrl::App("project.html".into()))
        .title("New Project - PIB Connect")
        .inner_size(400.0, 450.0)
        .resizable(false)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        // The settings window is prewarmed and hidden; force a reload on open
        // so latest frontend edits are always reflected.
        let _ = window.eval("window.location.reload()");
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }
    let _window = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Settings - PIB Connect")
        .inner_size(520.0, 640.0)
        .resizable(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .setup(|app| {
            menu::create_menu(app)?;

            // Prewarm settings window once so opening it later is instant.
            if app.get_webview_window("settings").is_none() {
                let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
                    .title("Settings - PIB Connect")
                    .inner_size(520.0, 640.0)
                    .resizable(true)
                    .visible(false)
                    .center()
                    .build()
                    .map_err(|e| e.to_string())?;
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();

            // Handle quit directly in Rust
            if id == "quit" {
                app.exit(0);
                return;
            }

            // Handle settings - open dedicated window
            if id == "settings" {
                let _ = open_settings_window(app.clone());
                return;
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("menu-event", id);
            }
        })
        .on_window_event(|window, event| {
            if window.label() == "settings" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::serial::list_serial_ports,
            commands::serial::connect_serial,
            commands::serial::connect_mock,
            commands::serial::disconnect_serial,
            commands::serial::get_connection_status,
            commands::motor::send_motor_position,
            commands::motor::send_all_positions,
            commands::media_web::start_media_web_server,
            commands::media_web::stop_media_web_server,
            commands::media_web::get_media_web_status,
            commands::media_web::set_media_web_content,
            open_new_project_window,
            open_settings_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
