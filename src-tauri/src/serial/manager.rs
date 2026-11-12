use serialport::SerialPortInfo;
use std::io::Write;
use std::time::Duration;

pub trait PortWriter: Send {
    fn write_packet(&mut self, data: &[u8]) -> Result<(), String>;
}

struct RealPort {
    port: Box<dyn serialport::SerialPort>,
}

impl PortWriter for RealPort {
    fn write_packet(&mut self, data: &[u8]) -> Result<(), String> {
        self.port.write_all(data).map_err(|e| e.to_string())?;
        self.port.flush().map_err(|e| e.to_string())
    }
}

pub struct SerialManager {
    port: Option<Box<dyn PortWriter>>,
    port_name: Option<String>,
}

impl SerialManager {
    pub fn new() -> Self {
        Self {
            port: None,
            port_name: None,
        }
    }

    pub fn list_ports() -> Result<Vec<SerialPortInfo>, String> {
        serialport::available_ports().map_err(|e| e.to_string())
    }

    pub fn connect(&mut self, port_name: &str, baud_rate: u32) -> Result<(), String> {
        let port = serialport::new(port_name, baud_rate)
            .timeout(Duration::from_millis(100))
            .open()
            .map_err(|e| format!("Failed to open {}: {}", port_name, e))?;

        self.port = Some(Box::new(RealPort { port }));
        self.port_name = Some(port_name.to_string());
        Ok(())
    }

    pub fn connect_mock(&mut self) -> Result<(), String> {
        self.port = Some(Box::new(super::mock::MockPort::new()));
        self.port_name = Some("MOCK".to_string());
        Ok(())
    }

    pub fn disconnect(&mut self) -> Result<(), String> {
        self.port = None;
        self.port_name = None;
        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.port.is_some()
    }

    pub fn send_packet(&mut self, data: &[u8]) -> Result<(), String> {
        match &mut self.port {
            Some(port) => port.write_packet(data),
            None => Err("Not connected to any serial port".to_string()),
        }
    }

    #[allow(dead_code)]
    pub fn port_name(&self) -> Option<&str> {
        self.port_name.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_connection() {
        let mut manager = SerialManager::new();
        assert!(!manager.is_connected());

        manager.connect_mock().unwrap();
        assert!(manager.is_connected());
        assert_eq!(manager.port_name(), Some("MOCK"));

        let packet = crate::serial::packet::build_goal_position_packet(1, 512);
        manager.send_packet(&packet).unwrap();

        manager.disconnect().unwrap();
        assert!(!manager.is_connected());
        assert_eq!(manager.port_name(), None);
    }

    #[test]
    fn test_send_without_connection() {
        let mut manager = SerialManager::new();
        let packet = crate::serial::packet::build_goal_position_packet(1, 512);
        let result = manager.send_packet(&packet);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Not connected to any serial port");
    }

    #[test]
    fn test_list_ports() {
        // Should not error even if no ports available
        let result = SerialManager::list_ports();
        assert!(result.is_ok());
    }
}
