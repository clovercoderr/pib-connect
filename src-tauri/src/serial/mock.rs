use super::manager::PortWriter;
use log::info;

pub struct MockPort;

impl MockPort {
    pub fn new() -> Self {
        info!("Mock serial port created");
        Self
    }
}

impl PortWriter for MockPort {
    fn write_packet(&mut self, data: &[u8]) -> Result<(), String> {
        info!(
            "MOCK TX: [{}]",
            data.iter()
                .map(|b| format!("0x{:02X}", b))
                .collect::<Vec<_>>()
                .join(", ")
        );
        Ok(())
    }
}
