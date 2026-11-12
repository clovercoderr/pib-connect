use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

pub fn create_menu(app: &tauri::App) -> tauri::Result<()> {
    // File menu
    let new_project = MenuItemBuilder::with_id("new_project", "Create Project")
        .accelerator("Cmd+N")
        .build(app)?;
    let open_project = MenuItemBuilder::with_id("open_project", "Open...")
        .accelerator("Cmd+O")
        .build(app)?;
    let save_project = MenuItemBuilder::with_id("save_project", "Save")
        .accelerator("Cmd+S")
        .build(app)?;
    let close_project = MenuItemBuilder::with_id("close", "Close")
        .accelerator("Cmd+W")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_project)
        .separator()
        .item(&open_project)
        .item(&save_project)
        .item(&close_project)
        .build()?;

    // Edit menu — predefined items wire Cmd+C/V/X/A/Z/Shift+Z to the system
    // selectors so copy/paste works in inputs and Monaco. Without this menu,
    // macOS doesn't forward the shortcuts to the webview at all.
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, Some("Undo"))?)
        .item(&PredefinedMenuItem::redo(app, Some("Redo"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("Cut"))?)
        .item(&PredefinedMenuItem::copy(app, Some("Copy"))?)
        .item(&PredefinedMenuItem::paste(app, Some("Paste"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("Select All"))?)
        .build()?;

    // View menu
    let view_3d = MenuItemBuilder::with_id("view_3d", "3D View")
        .accelerator("Cmd+1")
        .build(app)?;
    let view_nocode = MenuItemBuilder::with_id("view_nocode", "No-Code")
        .accelerator("Cmd+2")
        .build(app)?;
    let view_python = MenuItemBuilder::with_id("view_python", "Python")
        .accelerator("Cmd+3")
        .build(app)?;
    let toggle_split = MenuItemBuilder::with_id("toggle_split", "Toggle Split View")
        .accelerator("Cmd+\\")
        .build(app)?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&view_3d)
        .item(&view_nocode)
        .item(&view_python)
        .separator()
        .item(&toggle_split)
        .build()?;

    // Program menu
    let run_program = MenuItemBuilder::with_id("run_program", "Run")
        .accelerator("Cmd+R")
        .build(app)?;
    let stop_program = MenuItemBuilder::with_id("stop_program", "Stop")
        .accelerator("Cmd+.")
        .build(app)?;

    let program_menu = SubmenuBuilder::new(app, "Program")
        .item(&run_program)
        .item(&stop_program)
        .build()?;

    // PIB menu (settings, docs, etc.)
    let settings = MenuItemBuilder::with_id("settings", "Settings...")
        .accelerator("Cmd+,")
        .build(app)?;
    let docs = MenuItemBuilder::with_id("docs", "Documentation")
        .accelerator("Cmd+/")
        .build(app)?;

    let pib_menu = SubmenuBuilder::new(app, "PIB")
        .item(&settings)
        .item(&docs)
        .build()?;

    // Window menu
    let minimize = MenuItemBuilder::with_id("minimize", "Minimize")
        .accelerator("Cmd+M")
        .build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit PIB Connect")
        .accelerator("Cmd+Q")
        .build(app)?;
    let fullscreen = MenuItemBuilder::with_id("fullscreen", "Enter Full Screen")
        .accelerator("Cmd+Ctrl+F")
        .build(app)?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&minimize)
        .separator()
        .item(&quit)
        .separator()
        .item(&fullscreen)
        .build()?;

    // Help menu
    let about = MenuItemBuilder::with_id("about", "About PIB Connect")
        .build(app)?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&about)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&program_menu)
        .item(&pib_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()?;

    app.set_menu(menu)?;

    Ok(())
}


