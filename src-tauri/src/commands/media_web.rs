use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream, UdpSocket},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tauri::State;

use crate::state::{AppState, MediaWebContent, MediaWebServer};

const DEFAULT_MEDIA_WEB_PORT: u16 = 1592;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaWebStatus {
    pub running: bool,
    pub port: u16,
    pub host_ip: String,
    pub url: String,
    pub content: MediaWebContent,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn resolve_host_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }

    "127.0.0.1".to_string()
}

fn build_status(state: &AppState) -> Result<MediaWebStatus, String> {
    let (running, port) = {
        let server = state.media_web_server.lock().map_err(|e| e.to_string())?;
        (server.running, server.port)
    };

    let content = state
        .media_web_content
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    let host_ip = resolve_host_ip();
    let url = if running {
        format!("http://{}:{}/", host_ip, port)
    } else {
        String::new()
    };

    Ok(MediaWebStatus {
        running,
        port,
        host_ip,
        url,
        content,
    })
}

fn stop_server_locked(server: &mut MediaWebServer) {
    if let Some(stop_flag) = server.stop_flag.take() {
        stop_flag.store(true, Ordering::Relaxed);
    }

    if let Some(handle) = server.handle.take() {
        let _ = handle.join();
    }

    server.running = false;
    server.port = 0;
}

fn media_html() -> &'static str {
    r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PIB Media Display</title>
    <style>
      :root {
        color-scheme: dark;
      }

      html,
      body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: radial-gradient(circle at 20% 10%, #1f2a44, #090b12 55%);
        color: #dce4ff;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      }

      .shell {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(8, 12, 22, 0.58);
        backdrop-filter: blur(8px);
      }

      .title {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(220, 228, 255, 0.9);
      }

      .status {
        font-size: 12px;
        color: rgba(220, 228, 255, 0.6);
      }

      .content {
        flex: 1;
        display: grid;
        place-items: center;
        padding: 14px;
      }

      .card {
        width: min(96vw, 1280px);
        height: min(86vh, 860px);
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(8, 10, 18, 0.65);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
        display: grid;
        place-items: center;
        overflow: hidden;
      }

      .empty {
        color: rgba(220, 228, 255, 0.6);
        font-size: 18px;
      }

      img,
      video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000;
      }

      .audio-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
      }

      .audio-label {
        font-size: 14px;
        color: rgba(220, 228, 255, 0.72);
      }

      audio {
        width: min(80vw, 720px);
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="header">
        <div class="title" id="title">PIB Media Display</div>
        <div class="status" id="status">Waiting for media...</div>
      </div>
      <section class="content">
        <div class="card" id="card">
          <div class="empty">No media selected yet.</div>
        </div>
      </section>
    </main>

    <script>
      let lastUpdate = 0;

      const titleEl = document.getElementById("title");
      const statusEl = document.getElementById("status");
      const cardEl = document.getElementById("card");

      function resetCard() {
        while (cardEl.firstChild) {
          cardEl.removeChild(cardEl.firstChild);
        }
      }

      function showEmpty(message) {
        resetCard();
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = message;
        cardEl.appendChild(empty);
      }

      function render(data) {
        titleEl.textContent = data.title || "PIB Media Display";

        if (!data.mediaType || data.mediaType === "none" || !data.source) {
          statusEl.textContent = "Waiting for media...";
          showEmpty("No media selected yet.");
          return;
        }

        statusEl.textContent = data.mediaType.toUpperCase() + " live";
        resetCard();

        if (data.mediaType === "image") {
          const img = document.createElement("img");
          img.src = data.source;
          img.alt = data.title || "image";
          cardEl.appendChild(img);
          return;
        }

        if (data.mediaType === "video") {
          const video = document.createElement("video");
          video.src = data.source;
          video.autoplay = true;
          video.loop = true;
          video.controls = true;
          video.playsInline = true;
          cardEl.appendChild(video);
          return;
        }

        if (data.mediaType === "audio") {
          const wrap = document.createElement("div");
          wrap.className = "audio-wrap";

          const label = document.createElement("div");
          label.className = "audio-label";
          label.textContent = data.title || "Now playing";

          const audio = document.createElement("audio");
          audio.src = data.source;
          audio.autoplay = true;
          audio.controls = true;

          wrap.appendChild(label);
          wrap.appendChild(audio);
          cardEl.appendChild(wrap);
          return;
        }

        showEmpty("Unsupported media type: " + data.mediaType);
      }

      async function pollState() {
        try {
          const res = await fetch("/api/state?ts=" + Date.now(), { cache: "no-store" });
          if (!res.ok) {
            statusEl.textContent = "Server error";
            return;
          }

          const data = await res.json();
          const updated = Number(data.updatedAtMs || 0);

          if (updated !== lastUpdate) {
            lastUpdate = updated;
            render(data);
          }
        } catch {
          statusEl.textContent = "Connection lost";
        }
      }

      pollState();
      setInterval(pollState, 1000);
    </script>
  </body>
</html>
"#
}

fn write_response(
    stream: &mut TcpStream,
    status_line: &str,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let headers = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        status_line,
        content_type,
        body.len(),
    );

    stream.write_all(headers.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()?;
    Ok(())
}

fn handle_connection(
    stream: &mut TcpStream,
    content: &Arc<Mutex<MediaWebContent>>,
) -> std::io::Result<()> {
    let mut buffer = [0_u8; 8192];
    let bytes_read = stream.read(&mut buffer)?;
    if bytes_read == 0 {
        return Ok(());
    }

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let request_line = request.lines().next().unwrap_or_default();
    let path = request_line.split_whitespace().nth(1).unwrap_or("/");

    if path == "/" || path.starts_with("/?") {
        return write_response(stream, "200 OK", "text/html; charset=utf-8", media_html().as_bytes());
    }

    if path.starts_with("/api/state") {
        let state_json = {
            let state = content.lock().map_err(|_| {
                std::io::Error::new(std::io::ErrorKind::Other, "state lock poisoned")
            })?;
            serde_json::to_vec(&*state).map_err(|e| {
                std::io::Error::new(std::io::ErrorKind::Other, format!("json encode failed: {e}"))
            })?
        };

        return write_response(stream, "200 OK", "application/json", &state_json);
    }

    if path == "/health" {
        return write_response(stream, "200 OK", "text/plain; charset=utf-8", b"ok");
    }

    write_response(
        stream,
        "404 Not Found",
        "text/plain; charset=utf-8",
        b"not found",
    )
}

fn run_server(
    listener: TcpListener,
    stop_flag: Arc<AtomicBool>,
    content: Arc<Mutex<MediaWebContent>>,
) {
    while !stop_flag.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                if let Err(err) = handle_connection(&mut stream, &content) {
                    log::warn!("media web request failed: {err}");
                }
            }
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(50));
            }
            Err(err) => {
                log::warn!("media web accept failed: {err}");
                thread::sleep(Duration::from_millis(120));
            }
        }
    }
}

#[tauri::command]
pub fn start_media_web_server(
    state: State<AppState>,
    port: Option<u16>,
) -> Result<MediaWebStatus, String> {
    let selected_port = port.unwrap_or(DEFAULT_MEDIA_WEB_PORT);
    if selected_port == 0 {
        return Err("Port must be greater than 0".to_string());
    }

    let mut server = state.media_web_server.lock().map_err(|e| e.to_string())?;

    if server.running && server.port == selected_port {
        drop(server);
        return build_status(&state);
    }

    stop_server_locked(&mut server);

    let listener = TcpListener::bind(("0.0.0.0", selected_port))
        .map_err(|e| format!("Failed to bind media server on port {selected_port}: {e}"))?;

    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to configure media server socket: {e}"))?;

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_clone = stop_flag.clone();
    let content = state.media_web_content.clone();

    let handle = thread::Builder::new()
        .name("pib-media-web".to_string())
        .spawn(move || run_server(listener, stop_flag_clone, content))
        .map_err(|e| format!("Failed to start media server thread: {e}"))?;

    server.running = true;
    server.port = selected_port;
    server.stop_flag = Some(stop_flag);
    server.handle = Some(handle);

    drop(server);
    build_status(&state)
}

#[tauri::command]
pub fn stop_media_web_server(state: State<AppState>) -> Result<MediaWebStatus, String> {
    let mut server = state.media_web_server.lock().map_err(|e| e.to_string())?;
    stop_server_locked(&mut server);
    drop(server);
    build_status(&state)
}

#[tauri::command]
pub fn get_media_web_status(state: State<AppState>) -> Result<MediaWebStatus, String> {
    build_status(&state)
}

#[tauri::command]
pub fn set_media_web_content(
    state: State<AppState>,
    media_type: String,
    source: String,
    title: Option<String>,
) -> Result<(), String> {
    let normalized_type = media_type.trim().to_ascii_lowercase();
    if normalized_type != "image"
        && normalized_type != "video"
        && normalized_type != "audio"
        && normalized_type != "none"
    {
        return Err("mediaType must be one of: image, video, audio, none".to_string());
    }

    let mut content = state
        .media_web_content
        .lock()
        .map_err(|e| e.to_string())?;

    content.media_type = normalized_type;
    content.source = source;
    content.title = title.unwrap_or_else(|| "Media Display".to_string());
    content.updated_at_ms = now_ms();

    Ok(())
}
