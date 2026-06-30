//! WebSocket transport for Flow Local Sync.
//!
//! The transport is **plaintext `ws://`** — confidentiality and integrity come from the AES-GCM
//! payload encryption (`crypto.rs`), which sidesteps the impossibility of trusted TLS certs for
//! ephemeral LAN IPs. This module only moves opaque binary frames; it knows nothing about their
//! contents.
//!
//! The host binds an ephemeral port and accepts one connection (it advertises its LAN IP + port
//! in the QR). The client connects to that address. [`WsChannel`] is generic over the stream so
//! the same code serves both the accepted `TcpStream` and the client's `MaybeTlsStream`.

#![allow(clippy::must_use_candidate)]

use std::net::IpAddr;

use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, accept_async, connect_async};

use crate::sync::error::SyncError;

/// A binary-message channel over a WebSocket. Text frames are ignored; pings are answered;
/// a close (or stream end) surfaces as [`SyncError::ConnectionClosed`].
pub struct WsChannel<S> {
    ws: WebSocketStream<S>,
}

impl<S> WsChannel<S>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    pub fn new(ws: WebSocketStream<S>) -> Self {
        Self { ws }
    }

    /// Send one binary message.
    pub async fn send_binary(&mut self, data: Vec<u8>) -> Result<(), SyncError> {
        self.ws.send(Message::Binary(data.into())).await?;
        Ok(())
    }

    /// Receive the next binary message, transparently answering pings and skipping text/pong.
    pub async fn recv_binary(&mut self) -> Result<Vec<u8>, SyncError> {
        loop {
            match self.ws.next().await {
                Some(Ok(Message::Binary(payload))) => return Ok(payload.to_vec()),
                Some(Ok(Message::Ping(p))) => {
                    self.ws.send(Message::Pong(p)).await?;
                }
                Some(Ok(Message::Close(_))) | None => return Err(SyncError::ConnectionClosed),
                Some(Ok(_)) => {} // ignore text / pong / raw frame
                Some(Err(e)) => return Err(e.into()),
            }
        }
    }

    /// Best-effort graceful close.
    pub async fn close(&mut self) {
        let _ = self.ws.close(None).await;
    }
}

/// Bind an ephemeral port on all interfaces. Returns the listener and the chosen port.
pub async fn bind() -> Result<(TcpListener, u16), SyncError> {
    let listener = TcpListener::bind("0.0.0.0:0").await?;
    let port = listener.local_addr()?.port();
    Ok((listener, port))
}

/// The fixed WebSocket path both platforms dial/serve.
pub const WS_PATH: &str = "/flow-sync";

/// Accept one inbound connection and complete the WebSocket handshake (host role). The request
/// path is not enforced (any path the peer dials is accepted), but we serve `/flow-sync`.
pub async fn accept(listener: &TcpListener) -> Result<WsChannel<TcpStream>, SyncError> {
    let (stream, addr) = listener.accept().await?;
    tracing::info!(target: "flow::sync::transport", peer = %addr, "accepted TCP connection; upgrading to WebSocket");
    let ws = accept_async(stream).await.map_err(|e| {
        tracing::warn!(target: "flow::sync::transport", peer = %addr, "WebSocket upgrade failed: {e}");
        SyncError::from(e)
    })?;
    Ok(WsChannel::new(ws))
}

/// Connect to a host and complete the WebSocket handshake (client role). Dials the fixed
/// `/flow-sync` path so a host that enforces the path accepts us.
pub async fn connect(
    ip: &str,
    port: u16,
) -> Result<WsChannel<MaybeTlsStream<TcpStream>>, SyncError> {
    let url = format!("ws://{ip}:{port}{WS_PATH}");
    tracing::info!(target: "flow::sync::transport", %url, "dialing host");
    let (ws, _resp) = connect_async(&url).await.map_err(|e| {
        tracing::warn!(target: "flow::sync::transport", %url, "WebSocket connect failed: {e}");
        SyncError::from(e)
    })?;
    Ok(WsChannel::new(ws))
}

/// Best-effort LAN IPv4 for the QR code: skips loopback, link-local (169.254.x), and the
/// Docker-ish 172.16–172.31 range. Returns the first plausible address, or `None`.
pub fn lan_ip() -> Option<String> {
    let ifas = local_ip_address::list_afinet_netifas().ok()?;
    for (_name, ip) in ifas {
        if let IpAddr::V4(v4) = ip {
            if v4.is_loopback() || v4.is_link_local() {
                continue;
            }
            let o = v4.octets();
            if o[0] == 172 && (16..=31).contains(&o[1]) {
                continue;
            }
            return Some(v4.to_string());
        }
    }
    None
}
