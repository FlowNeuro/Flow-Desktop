use futures_util::StreamExt;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tracing::{debug, error, info, warn};

use super::sabr::{SabrError, SabrSessionManager, SabrTrack};

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
struct CachedResponse {
    status_code: u16,
    reason: String,
    content_type: String,
    content_range: Option<String>,
    accept_ranges: String,
    body: Vec<u8>,
    cached_at: u64,
}

#[derive(Clone)]
pub struct StreamingManager {
    sessions: Arc<Mutex<HashMap<String, StreamSession>>>,
    response_cache: Arc<Mutex<HashMap<String, CachedResponse>>>,
    port: u16,
    sabr: SabrSessionManager,
}

const MAX_CACHED_RESPONSE_BYTES: usize = 32 * 1024 * 1024;
const MAX_TOTAL_CACHE_BYTES: usize = 192 * 1024 * 1024;
const CACHE_TTL_SECONDS: u64 = 30 * 60;
const MAX_UPSTREAM_RECOVERIES: u32 = 6;
const MAX_HEADER_BYTES: usize = 32 * 1024;

const CORS_HEADERS: &str = "Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
Access-Control-Allow-Headers: Range, Content-Type, Origin, Accept\r\n\
Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\r\n";

impl StreamingManager {
    pub fn new() -> (Self, std::net::TcpListener) {
        let listener =
            std::net::TcpListener::bind("127.0.0.1:0").expect("Failed to bind streaming proxy");
        let port = listener.local_addr().unwrap().port();

        let manager = Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            response_cache: Arc::new(Mutex::new(HashMap::new())),
            port,
            sabr: SabrSessionManager::new(),
        };

        (manager, listener)
    }

    pub fn get_port(&self) -> u16 {
        self.port
    }

    pub fn sabr(&self) -> &SabrSessionManager {
        &self.sabr
    }

    pub fn register_session(
        &self,
        token: String,
        remote_url: String,
        content_type: String,
        user_agent: String,
    ) {
        self.register_remote_session(token, remote_url, content_type, user_agent);
    }

    pub fn register_remote_session(
        &self,
        token: String,
        remote_url: String,
        content_type: String,
        user_agent: String,
    ) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let session = StreamSession {
            kind: StreamSessionKind::Remote { remote_url },
            content_type,
            expires_at: now + 3600,
            user_agent,
        };
        let mut lock = self.sessions.lock().unwrap();
        lock.insert(token, session);
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
                return Some(session.clone());
            }
            lock.remove(token);
        }
        None
    }

    fn get_cached_response(&self, key: &str) -> Option<CachedResponse> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let mut cache = self.response_cache.lock().unwrap();
        cache.retain(|_, response| now.saturating_sub(response.cached_at) <= CACHE_TTL_SECONDS);
        cache.get(key).cloned()
    }

    fn store_cached_response(&self, key: String, response: CachedResponse) {
        if response.body.len() > MAX_CACHED_RESPONSE_BYTES {
            return;
        }

        let mut cache = self.response_cache.lock().unwrap();
        cache.insert(key, response);

        let mut total_bytes: usize = cache.values().map(|cached| cached.body.len()).sum();
        while total_bytes > MAX_TOTAL_CACHE_BYTES {
            let oldest_key = cache
                .iter()
                .min_by_key(|(_, cached)| cached.cached_at)
                .map(|(key, _)| key.clone());

            if let Some(oldest_key) = oldest_key {
                if let Some(removed) = cache.remove(&oldest_key) {
                    total_bytes = total_bytes.saturating_sub(removed.body.len());
                }
            } else {
                break;
            }
        }
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

// ---------------------------------------------------------------------------
// HTTP request parsing
// ---------------------------------------------------------------------------

struct RequestHead {
    method: String,
    // Path + query as received.
    target: String,
    range: Option<String>,
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n")
}

async fn read_request_head(socket: &mut TcpStream) -> std::io::Result<Option<RequestHead>> {
    let mut buf = Vec::with_capacity(2048);
    let mut tmp = [0u8; 4096];
    loop {
        if let Some(end) = find_header_end(&buf) {
            return Ok(parse_head(&buf[..end]));
        }
        if buf.len() > MAX_HEADER_BYTES {
            return Ok(None);
        }
        let n = socket.read(&mut tmp).await?;
        if n == 0 {
            return Ok(parse_head(&buf));
        }
        buf.extend_from_slice(&tmp[..n]);
    }
}

fn parse_head(bytes: &[u8]) -> Option<RequestHead> {
    let text = String::from_utf8_lossy(bytes);
    let mut lines = text.split("\r\n");
    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_string();
    let target = parts.next()?.to_string();

    let mut range = None;
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("range") {
                range = Some(value.trim().to_string());
            }
        }
    }
    Some(RequestHead {
        method,
        target,
        range,
    })
}

// ---------------------------------------------------------------------------
// Response writers
// ---------------------------------------------------------------------------

async fn write_status_only(
    socket: &mut TcpStream,
    status: u16,
    reason: &str,
    body: &str,
) -> std::io::Result<()> {
    let headers = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n{CORS_HEADERS}Connection: close\r\n\r\n",
        body.len()
    );
    socket.write_all(headers.as_bytes()).await?;
    socket.write_all(body.as_bytes()).await?;
    Ok(())
}

async fn write_options(socket: &mut TcpStream) -> std::io::Result<()> {
    let headers = format!(
        "HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n{CORS_HEADERS}Access-Control-Max-Age: 600\r\nConnection: close\r\n\r\n"
    );
    socket.write_all(headers.as_bytes()).await
}

// Write a complete in-memory body (200/inline/SABR segment).
async fn write_full_body(
    socket: &mut TcpStream,
    content_type: &str,
    cache_control: &str,
    body: &[u8],
    head_only: bool,
) -> std::io::Result<()> {
    let headers = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\n{CORS_HEADERS}Cache-Control: {cache_control}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    socket.write_all(headers.as_bytes()).await?;
    if !head_only {
        socket.write_all(body).await?;
    }
    Ok(())
}

async fn write_cached_response(
    socket: &mut TcpStream,
    cached: CachedResponse,
    head_only: bool,
) -> std::io::Result<()> {
    let mut response_headers = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\n",
        cached.status_code,
        cached.reason,
        cached.content_type,
        cached.body.len()
    );
    if let Some(content_range) = cached.content_range {
        response_headers.push_str(&format!("Content-Range: {content_range}\r\n"));
    }
    response_headers.push_str(&format!("Accept-Ranges: {}\r\n", cached.accept_ranges));
    response_headers.push_str(CORS_HEADERS);
    response_headers
        .push_str("Cache-Control: private, max-age=1800\r\nConnection: keep-alive\r\n\r\n");

    socket.write_all(response_headers.as_bytes()).await?;
    if !head_only {
        socket.write_all(&cached.body).await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

pub async fn start_proxy_server(manager: StreamingManager, std_listener: std::net::TcpListener) {
    std_listener
        .set_nonblocking(true)
        .expect("Failed to set nonblocking");
    let listener = TcpListener::from_std(std_listener).expect("Failed to convert TcpListener");

    info!(
        "Starting local media proxy on 127.0.0.1:{}",
        manager.get_port()
    );
    let client = reqwest::Client::builder()
        .no_gzip()
        .no_brotli()
        .no_deflate()
        .build()
        .unwrap_or_default();

    loop {
        match listener.accept().await {
            Ok((socket, _)) => {
                let mgr = manager.clone();
                let clt = client.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(socket, mgr, clt).await {
                        debug!("Streaming connection closed: {:?}", e);
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
    let head = match read_request_head(&mut socket).await? {
        Some(h) => h,
        None => {
            write_status_only(&mut socket, 400, "Bad Request", "Malformed request").await?;
            return Ok(());
        }
    };

    let method = head.method.to_ascii_uppercase();
    if method == "OPTIONS" {
        return write_options(&mut socket).await;
    }
    if method != "GET" && method != "HEAD" {
        write_status_only(&mut socket, 405, "Method Not Allowed", "Unsupported method").await?;
        return Ok(());
    }
    let head_only = method == "HEAD";

    let request_url = match reqwest::Url::parse(&format!("http://localhost{}", head.target)) {
        Ok(url) => url,
        Err(_) => {
            write_status_only(&mut socket, 400, "Bad Request", "Bad request target").await?;
            return Ok(());
        }
    };
    let path = request_url.path().to_string();

    if path.starts_with("/sabr/") {
        return handle_sabr_route(&mut socket, &manager, &path, head_only).await;
    }

    // Legacy direct/inline routes ------------------------------------------------
    let (token, target_url_override) = if let Some(token) = path.strip_prefix("/stream/") {
        (token.trim_start_matches('/').to_string(), None)
    } else if let Some(token) = path.strip_prefix("/proxy/") {
        let override_url = request_url
            .query_pairs()
            .find_map(|(key, value)| (key == "url").then(|| value.into_owned()));
        (token.trim_start_matches('/').to_string(), override_url)
    } else {
        write_status_only(&mut socket, 404, "Not Found", "Unknown proxy route").await?;
        return Ok(());
    };

    let session = match manager.get_session(&token) {
        Some(s) => s,
        None => {
            write_status_only(
                &mut socket,
                404,
                "Not Found",
                "Video stream session not found or expired",
            )
            .await?;
            return Ok(());
        }
    };

    if let StreamSessionKind::Inline { body } = &session.kind {
        return write_full_body(
            &mut socket,
            &session.content_type,
            "no-store",
            body,
            head_only,
        )
        .await;
    }

    let target_url = target_url_override.unwrap_or_else(|| match &session.kind {
        StreamSessionKind::Remote { remote_url } => remote_url.clone(),
        StreamSessionKind::Inline { .. } => String::new(),
    });

    relay_remote(
        &mut socket,
        &client,
        &manager,
        &session,
        &target_url,
        head.range.as_deref(),
        &path,
        head_only,
    )
    .await
}

// Parse a `bytes=START-END` style range spec into (start, end_inclusive).
fn parse_range_spec(range: Option<&str>) -> (u64, Option<u64>) {
    let Some(range) = range else {
        return (0, None);
    };
    let spec = range.split('=').nth(1).unwrap_or(range).trim();
    let mut parts = spec.split('-');
    let start = parts.next().and_then(|s| s.trim().parse::<u64>().ok()).unwrap_or(0);
    let end = parts
        .next()
        .and_then(|s| if s.trim().is_empty() { None } else { s.trim().parse::<u64>().ok() });
    (start, end)
}

#[allow(clippy::too_many_arguments)]
async fn relay_remote(
    socket: &mut TcpStream,
    client: &reqwest::Client,
    manager: &StreamingManager,
    session: &StreamSession,
    target_url: &str,
    client_range: Option<&str>,
    path: &str,
    head_only: bool,
) -> std::io::Result<()> {
    let (range_start, range_end) = parse_range_spec(client_range);
    let range_key = match (range_start, range_end) {
        (s, Some(e)) => format!("{s}-{e}"),
        (s, None) if client_range.is_some() => format!("{s}-"),
        _ => "full".to_string(),
    };
    let cache_key = format!("{target_url}|{range_key}");

    if let Some(cached) = manager.get_cached_response(&cache_key) {
        return write_cached_response(socket, cached, head_only).await;
    }

    let mut headers_written = false;
    let mut bytes_relayed: u64 = 0;
    let mut attempt: u32 = 0;
    let mut content_length_value: usize = 0;
    let mut should_cache = false;
    let mut content_type_value = session.content_type.clone();
    let mut content_range_value: Option<String> = None;
    let mut accept_ranges_value = "bytes".to_string();
    let mut status_code_value: u16 = 200;
    let mut reason_value = "OK".to_string();
    let mut cached_body: Option<Vec<u8>> = None;

    loop {
        let effective_start = range_start + bytes_relayed;
        let needs_range = client_range.is_some() || bytes_relayed > 0;
        let range_header = if needs_range {
            match range_end {
                Some(end) => Some(format!("bytes={effective_start}-{end}")),
                None => Some(format!("bytes={effective_start}-")),
            }
        } else {
            None
        };

        let mut req = client
            .get(target_url)
            .header("User-Agent", &session.user_agent)
            .header("Accept-Encoding", "identity");
        if let Some(rh) = &range_header {
            req = req.header("Range", rh);
        }

        let response = match req.send().await {
            Ok(res) => res,
            Err(e) => {
                if headers_written {
                    warn!("Upstream re-request failed after partial relay: {e}");
                    return Ok(());
                }
                error!("Failed to fetch upstream stream: {:?}", e);
                return write_status_only(socket, 502, "Bad Gateway", "Failed to proxy media stream")
                    .await;
            }
        };

        if !headers_written {
            let status = response.status();
            status_code_value = status.as_u16();
            reason_value = status.canonical_reason().unwrap_or("OK").to_string();
            let headers = response.headers();
            content_type_value = headers
                .get("Content-Type")
                .and_then(|h| h.to_str().ok())
                .unwrap_or(session.content_type.as_str())
                .to_string();
            let content_length = headers
                .get("Content-Length")
                .and_then(|h| h.to_str().ok())
                .unwrap_or("0");
            content_length_value = content_length.parse::<usize>().unwrap_or(0);
            content_range_value = headers
                .get("Content-Range")
                .and_then(|h| h.to_str().ok())
                .map(ToOwned::to_owned);
            accept_ranges_value = headers
                .get("Accept-Ranges")
                .and_then(|h| h.to_str().ok())
                .unwrap_or("bytes")
                .to_string();

            should_cache = status.is_success()
                && content_length_value > 0
                && content_length_value <= MAX_CACHED_RESPONSE_BYTES
                && (client_range.is_some() || path.starts_with("/proxy/"));

            let mut response_headers = format!(
                "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\n",
                status.as_u16(),
                status.canonical_reason().unwrap_or(""),
                content_type_value,
                content_length
            );
            if let Some(range_val) = content_range_value.as_deref() {
                response_headers.push_str(&format!("Content-Range: {range_val}\r\n"));
            }
            response_headers.push_str(&format!("Accept-Ranges: {accept_ranges_value}\r\n"));
            response_headers.push_str(CORS_HEADERS);
            response_headers
                .push_str("Cache-Control: private, max-age=1800\r\nConnection: keep-alive\r\n\r\n");

            socket.write_all(response_headers.as_bytes()).await?;
            headers_written = true;

            if head_only {
                return Ok(());
            }
            if should_cache {
                cached_body = Some(Vec::with_capacity(content_length_value));
            }
        }

        // Stream the body; on a clean finish we break, recover on a reset.
        let mut stream = response.bytes_stream();
        let mut clean_finish = true;
        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    if let Some(body) = cached_body.as_mut() {
                        if body.len() + chunk.len() <= MAX_CACHED_RESPONSE_BYTES {
                            body.extend_from_slice(&chunk);
                        } else {
                            cached_body = None;
                        }
                    }
                    if socket.write_all(&chunk).await.is_err() {
                        return Ok(());
                    }
                    bytes_relayed += chunk.len() as u64;
                }
                Err(e) => {
                    clean_finish = false;
                    warn!(
                        "Upstream stream chunk error after {bytes_relayed} bytes (attempt {attempt}): {e}"
                    );
                    cached_body = None; 
                    break;
                }
            }
        }

        if clean_finish {
            break;
        }

        attempt += 1;
        if attempt > MAX_UPSTREAM_RECOVERIES {
            warn!("Giving up upstream recovery after {attempt} attempts");
            break;
        }
        if content_length_value > 0 && bytes_relayed as usize >= content_length_value {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(150 * u64::from(attempt))).await;
    }

    if let Some(body) = cached_body {
        if body.len() == content_length_value && content_length_value > 0 {
            manager.store_cached_response(
                cache_key,
                CachedResponse {
                    status_code: status_code_value,
                    reason: reason_value,
                    content_type: content_type_value,
                    content_range: content_range_value,
                    accept_ranges: accept_ranges_value,
                    body,
                    cached_at: now_secs(),
                },
            );
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// SABR routes
// ---------------------------------------------------------------------------

fn sabr_track_content_type(mime: &str, is_audio: bool) -> &'static str {
    let webm = mime.contains("webm");
    match (is_audio, webm) {
        (true, true) => "audio/webm",
        (true, false) => "audio/mp4",
        (false, true) => "video/webm",
        (false, false) => "video/mp4",
    }
}

fn sabr_error_status(err: &SabrError) -> (u16, &'static str) {
    match err {
        SabrError::SegmentTimeout | SabrError::BackoffExceeded => (503, "Service Unavailable"),
        SabrError::AttestationRequired | SabrError::ReloadRequired => (409, "Conflict"),
        SabrError::NoPlayableFormats | SabrError::NoStreamingData => (404, "Not Found"),
        SabrError::HttpStatus(code) => {
            if *code == 403 || *code == 401 {
                (403, "Forbidden")
            } else {
                (502, "Bad Gateway")
            }
        }
        _ => (502, "Bad Gateway"),
    }
}

async fn handle_sabr_route(
    socket: &mut TcpStream,
    manager: &StreamingManager,
    path: &str,
    head_only: bool,
) -> std::io::Result<()> {
    // /sabr/{session}/{...}
    let segments: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    if segments.len() < 3 {
        return write_status_only(socket, 404, "Not Found", "Bad SABR route").await;
    }
    let session_id = segments[1];

    let handle = match manager.sabr().activate(session_id) {
        Ok(h) => h,
        Err(e) => {
            let (code, reason) = sabr_error_status(&e);
            return write_status_only(socket, code, reason, &format!("SABR: {e}")).await;
        }
    };
    let engine = handle.engine.clone();

    match segments[2..] {
        ["manifest.mpd"] => {
            let timing = match engine.wait_timing(std::time::Duration::from_secs(8)).await {
                Ok(t) => t,
                Err(e) => {
                    let (code, reason) = sabr_error_status(&e);
                    warn!(session = %session_id, error = %e, "sabr_manifest_timeout");
                    return write_status_only(socket, code, reason, &format!("SABR manifest: {e}"))
                        .await;
                }
            };
            let base = format!(
                "http://127.0.0.1:{}/sabr/{}",
                manager.get_port(),
                session_id
            );
            let xml = super::sabr::manifest::build_dash_manifest(&base, engine.selected(), &timing);
            info!(session = %session_id, "sabr_manifest_served");
            write_full_body(socket, "application/dash+xml", "no-store", xml.as_bytes(), head_only)
                .await
        }
        [track, "init"] => {
            let Some(track) = SabrTrack::parse(track) else {
                return write_status_only(socket, 404, "Not Found", "Unknown track").await;
            };
            match engine.get_init(track).await {
                Ok(bytes) => {
                    let mime = track_mime(engine.selected(), track);
                    let ct = sabr_track_content_type(&mime, track == SabrTrack::Audio);
                    write_full_body(socket, ct, "private, max-age=3600", &bytes, head_only).await
                }
                Err(e) => {
                    let (code, reason) = sabr_error_status(&e);
                    write_status_only(socket, code, reason, &format!("SABR init: {e}")).await
                }
            }
        }
        [track, "seg", number] => {
            let Some(track) = SabrTrack::parse(track) else {
                return write_status_only(socket, 404, "Not Found", "Unknown track").await;
            };
            let Ok(sequence) = number.parse::<i32>() else {
                return write_status_only(socket, 400, "Bad Request", "Bad segment number").await;
            };
            match engine.get_segment(track, sequence).await {
                Ok(bytes) => {
                    let mime = track_mime(engine.selected(), track);
                    let ct = sabr_track_content_type(&mime, track == SabrTrack::Audio);
                    write_full_body(socket, ct, "no-store", &bytes, head_only).await
                }
                Err(e) => {
                    let (code, reason) = sabr_error_status(&e);
                    debug!(session = %session_id, seq = sequence, error = %e, "sabr_segment_unavailable");
                    write_status_only(socket, code, reason, &format!("SABR seg: {e}")).await
                }
            }
        }
        ["health"] => {
            let state = engine.debug_state().await;
            let json = serde_json::to_string(&state).unwrap_or_else(|_| "{}".to_string());
            write_full_body(socket, "application/json", "no-store", json.as_bytes(), head_only)
                .await
        }
        _ => write_status_only(socket, 404, "Not Found", "Unknown SABR route").await,
    }
}

fn track_mime(selected: &super::sabr::SelectedFormats, track: SabrTrack) -> String {
    match track {
        SabrTrack::Audio => selected.audio.mime_type.clone(),
        SabrTrack::Video => selected.video.mime_type.clone(),
    }
}
