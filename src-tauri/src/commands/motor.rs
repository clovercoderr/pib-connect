use crate::serial::packet;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn send_motor_position(
    state: State<AppState>,
    motor_id: u8,
    position: u16,
) -> Result<(), String> {
    let pkt = packet::build_goal_position_packet(motor_id, position);
    let mut manager = state.serial_manager.lock().map_err(|e| e.to_string())?;
    manager.send_packet(&pkt)
}

#[tauri::command]
pub fn send_all_positions(
    state: State<AppState>,
    positions: Vec<(u8, u16)>,
) -> Result<(), String> {
    let mut manager = state.serial_manager.lock().map_err(|e| e.to_string())?;
    for (motor_id, position) in positions {
        let pkt = packet::build_goal_position_packet(motor_id, position);
        manager.send_packet(&pkt)?;
    }
    Ok(())
}
