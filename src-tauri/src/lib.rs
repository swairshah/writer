use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.set_title("Writer").unwrap();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Writer");
}
