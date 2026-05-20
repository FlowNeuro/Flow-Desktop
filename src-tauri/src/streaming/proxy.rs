use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use futures_util::StreamExt;
use tracing::{info, error};

#[derive(Clone)]
pub enum StreamSessionKind {
    Remote { remote_url: String },
    Inline { body: Vec<u8> },
}

#[derive(Clone)]
pub struct StreamSession {
    pub kind: StreamSessionKind,
    pub content_type: String,
    pub expires_at: u64,
    pub user_agent: String,
}

#[derive(Clone)]
pub struct StreamingManager {
    sessions: Arc<Mutex<HashMap<String, StreamSession>>>,
    port: u16,
}

impl StreamingManager {
    pub fn new() -> (Self, std::net::TcpListener) {
        // Bind to a random available port on 127.0.0.1
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("Failed to bind streaming proxy");
        let port = listener.local_addr().unwrap().port();

        let manager = Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            port,
        };

        (manager, listener)
    }

    pub fn get_port(&self) -> u16 {
        self.port
    }

    pub fn register_session(&self, token: String, remote_url: String, content_type: String, user_agent: String) {
        self.register_remote_session(token, remote_url, content_type, user_agent);
    }

    pub fn register_remote_session(&self, token: String, remote_url: String, content_type: String, user_agent: String) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let session = StreamSession {
            kind: StreamSessionKind::Remote { remote_url },
            content_type,
            expires_at: now + 3600, // 1 hour expiration
            user_agent,
        };
        let mut lock = self.sessions.lock().unwrap();
        lock.insert(token, session);

        // Periodically prune expired sessions
        lock.retain(|_, s| s.expires_at > now);
    }

    pub fn register_inline_session(&self, token: String, body: Vec<u8>, content_type: String) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let session = StreamSession {
            kind: StreamSessionKind::Inline { body },
            content_type,
            expires_at: now + 3600,
            user_agent: String::new(),
        };
        let mut lock = self.sessions.lock().unwrap();
        lock.insert(token, session);
        lock.retain(|_, s| s.expires_at > now);
    }

    pub fn get_session(&self, token: &str) -> Option<StreamSession> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let mut lock = self.sessions.lock().unwrap();
        
        if let Some(session) = lock.get(token) {
            if session.expires_at > now {
                return Some(StreamSession {
                    kind: session.kind.clone(),
                    content_type: session.content_type.clone(),
                    expires_at: session.expires_at,
                    user_agent: session.user_agent.clone(),
                });
            } else {
                lock.remove(token);
            }
        }
        None
    }
}

pub async fn start_proxy_server(manager: StreamingManager, std_listener: std::net::TcpListener) {
    std_listener.set_nonblocking(true).expect("Failed to set nonblocking");
    let listener = TcpListener::from_std(std_listener).expect("Failed to convert TcpListener");

    info!("Starting local media proxy on 127.0.0.1:{}", manager.get_port());
    let client = reqwest::Client::builder()
        .build()
        .unwrap_or_default();

    loop {
        match listener.accept().await {
            Ok((socket, _)) => {
                let mgr = manager.clone();
                let clt = client.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(socket, mgr, clt).await {
                        info!("Streaming connection closed: {:?}", e);
                    }
                });
            }
            Err(e) => {
                error!("Proxy server accept failed: {:?}", e);
            }
        }
    }
}

async fn handle_connection(
    mut socket: TcpStream,
    manager: StreamingManager,
    client: reqwest::Client,
 ) -> std::io::Result<()> {
    let mut buffer = vec![0u8; 4096];
    let bytes_read = socket.read(&mut buffer).await?;
    if bytes_read == 0 {
        return Ok(());
    }

    let request_str = String::from_utf8_lossy(&buffer[..bytes_read]);
    let mut lines = request_str.lines();
    
    // Parse Request Line: "GET /stream/TOKEN HTTP/1.1"
    let req_line = match lines.next() {
        Some(line) => line,
        None => return Ok(()),
    };

    let parts: Vec<&str> = req_line.split_whitespace().collect();
    if parts.len() < 2 || parts[0] != "GET" {
        // Send a simple 400 Bad Request
        socket.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n").await?;
        return Ok(());
    }

    let request_url = match reqwest::Url::parse(&format!("http://localhost{}", parts[1])) {
        Ok(url) => url,
        Err(_) => {
            socket.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n").await?;
            return Ok(());
        }
    };

    let path = request_url.path();
    let (token, target_url_override) = if let Some(token) = path.strip_prefix("/stream/") {
        (token.trim_start_matches('/'), None)
    } else if let Some(token) = path.strip_prefix("/proxy/") {
        let override_url = request_url
            .query_pairs()
            .find_map(|(key, value)| (key == "url").then(|| value.into_owned()));
        (token.trim_start_matches('/'), override_url)
    } else {
        socket.write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\nUnknown proxy route").await?;
        return Ok(());
    };

    // Look up the stream token
    let session = match manager.get_session(token) {
        Some(s) => s,
        None => {
            socket.write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\nVideo stream session not found or expired").await?;
            return Ok(());
        }
    };

    if let StreamSessionKind::Inline { body } = session.kind {
        let response_headers = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
            session.content_type,
            body.len()
        );
        socket.write_all(response_headers.as_bytes()).await?;
        socket.write_all(&body).await?;
        return Ok(());
    }

    // Find Range header if any
    let mut range_header = None;
    for line in lines {
        if line.to_lowercase().starts_with("range:") {
            range_header = Some(line.to_string());
            break;
        }
    }

    // Build the remote request to YouTube
    let target_url = target_url_override.unwrap_or_else(|| match &session.kind {
        StreamSessionKind::Remote { remote_url } => remote_url.clone(),
        StreamSessionKind::Inline { .. } => String::new(),
    });

    let mut req_builder = client.get(&target_url)
        .header("User-Agent", &session.user_agent);

    if let Some(ref range) = range_header {
        // Extract bytes specifications from "Range: bytes=X-Y"
        if let Some(pos) = range.find('=') {
            let spec = &range[pos + 1..];
            req_builder = req_builder.header("Range", format!("bytes={}", spec));
        }
    }

    // Perform YouTube stream request
    let response = match req_builder.send().await {
        Ok(res) => res,
        Err(e) => {
            error!("Failed to fetch YouTube stream: {:?}", e);
            socket.write_all(b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\nFailed to proxy media stream").await?;
            return Ok(());
        }
    };

    let status = response.status();
    let headers = response.headers();

    // Construct response headers for the video player
    let content_type = headers
        .get("Content-Type")
        .and_then(|h| h.to_str().ok())
        .unwrap_or(session.content_type.as_str());

    let content_length = headers
        .get("Content-Length")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("0");

    let mut response_headers = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\n",
        status.as_u16(),
        status.canonical_reason().unwrap_or(""),
        content_type,
        content_length
    );

    // Forward crucial headers for seeking (range requests)
    if let Some(range_val) = headers.get("Content-Range").and_then(|h| h.to_str().ok()) {
        response_headers.push_str(&format!("Content-Range: {}\r\n", range_val));
    }
    if let Some(accept_val) = headers.get("Accept-Ranges").and_then(|h| h.to_str().ok()) {
        response_headers.push_str(&format!("Accept-Ranges: {}\r\n", accept_val));
    } else {
        response_headers.push_str("Accept-Ranges: bytes\r\n");
    }

    response_headers.push_str("Access-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n");

    // Write headers back to socket
    socket.write_all(response_headers.as_bytes()).await?;

    // Pipe response stream chunks back to the socket
    let mut stream = response.bytes_stream();
    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                if let Err(_) = socket.write_all(&chunk).await {
                    // Client disconnected early (e.g. video stopped or sought), clean exit
                    break;
                }
            }
            Err(e) => {
                error!("Error reading YouTube stream chunk: {:?}", e);
                break;
            }
        }
    }

    Ok(())
}
