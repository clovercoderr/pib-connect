use std::sync::{
    atomic::AtomicBool,
    Arc, Mutex,
};

use crate::serial::manager::SerialManager;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaWebContent {
    pub media_type: String,
    pub source: String,
    pub title: String,
    pub updated_at_ms: u64,
}

impl Default for MediaWebContent {
    fn default() -> Self {
        Self {
            media_type: "none".to_string(),
            source: String::new(),
            title: "Media Display".to_string(),
            updated_at_ms: 0,
        }
    }
}

pub struct MediaWebServer {
    pub running: bool,
    pub port: u16,
    pub stop_flag: Option<Arc<AtomicBool>>,
    pub handle: Option<std::thread::JoinHandle<()>>,
}

impl MediaWebServer {
    fn new() -> Self {
        Self {
            running: false,
            port: 0,
            stop_flag: None,
            handle: None,
        }
    }
}

pub struct AppState {
    pub serial_manager: Mutex<SerialManager>,
    pub media_web_content: Arc<Mutex<MediaWebContent>>,
    pub media_web_server: Mutex<MediaWebServer>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            serial_manager: Mutex::new(SerialManager::new()),
            media_web_content: Arc::new(Mutex::new(MediaWebContent::default())),
            media_web_server: Mutex::new(MediaWebServer::new()),
        }
    }
}
