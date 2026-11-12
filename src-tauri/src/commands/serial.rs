use crate::serial::manager::SerialManager;
use crate::state::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct PortInfo {
    pub name: String,
    pub port_type: String,
}

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<PortInfo>, String> {
    let ports = SerialManager::list_ports()?;
    Ok(ports
        .into_iter()
        .map(|p| PortInfo {
            name: p.port_name,
            port_type: format!("{:?}", p.port_type),
        })
        .collect())
}

#[tauri::command]
pub fn connect_serial(
    state: State<AppState>,
    port_name: String,
    baud_rate: u32,
) -> Result<(), String> {
    let mut manager = state.serial_manager.lock().map_err(|e| e.to_string())?;
    manager.connect(&port_name, baud_rate)
}

#[tauri::command]
pub fn connect_mock(state: State<AppState>) -> Result<(), String> {
    let mut manager = state.serial_manager.lock().map_err(|e| e.to_string())?;
    manager.connect_mock()
}

#[tauri::command]
pub fn disconnect_serial(state: State<AppState>) -> Result<(), String> {
    let mut manager = state.serial_manager.lock().map_err(|e| e.to_string())?;
    manager.disconnect()
}

#[tauri::command]
pub fn get_connection_status(state: State<AppState>) -> Result<bool, String> {
    let manager = state.serial_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.is_connected())
}
