//! In-page WEB player-response extraction via a hidden youtube.com WebView.
//!
//! Bot-walled videos (e.g. `LOGIN_REQUIRED` on every token-free HTTP client)
//! return a *playable* response when the request is issued from inside a real
//! youtube.com page — verified: the HTTP WEB `/player` is `UNPLAYABLE` while the
//! same video loaded in a real browser yields `ytInitialPlayerResponse` with
//! `status: OK` + a `serverAbrStreamingUrl`. A real-browser *pot replayed over
//! HTTP does not* help (tested), so the request must originate in-page.
//!
//! Flow: open a hidden WebView at `youtube.com/watch?v=ID` with an init script
//! that polls for `ytInitialPlayerResponse` and hands it back via a Tauri command
//! (`flow_submit_player_response`). Modern WEB is SABR-only (no direct URLs), so
//! the recovered response is routed through the existing SABR engine.
//!
//! Requires the `yt-extract-capability` capability (remote IPC for youtube.com).
//! Returns `None` without a GUI app handle, so callers degrade gracefully.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde_json::Value;
use tauri::Manager;
use tokio::sync::oneshot;
use tracing::{debug, warn};

const WINDOW_LABEL: &str = "flow-yt-extract";
const EXTRACT_TIMEOUT: Duration = Duration::from_secs(20);

fn pending() -> &'static Mutex<HashMap<String, oneshot::Sender<String>>> {
    static PENDING: OnceLock<Mutex<HashMap<String, oneshot::Sender<String>>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Fulfil a pending extraction from the `flow_submit_player_response` command.
pub fn resolve(id: &str, json: &str) {
    if let Some(sender) = pending().lock().unwrap().remove(id) {
        let _ = sender.send(json.to_string());
    }
}

/// Extract `ytInitialPlayerResponse` for `video_id` from a hidden youtube.com
/// WebView. Returns the parsed response (parse as the usual player JSON), or
/// `None` if there is no GUI, the window can't open, or it times out.
pub async fn fetch_player_response_in_page(video_id: &str) -> Option<Value> {
    let app = super::webview_pot::app_handle()?;
    let port = {
        let manager = app.try_state::<crate::streaming::proxy::StreamingManager>()?;
        manager.get_port()
    };

    let id = uuid::Uuid::new_v4().to_string();
    let (sender, receiver) = oneshot::channel();
    pending().lock().unwrap().insert(id.clone(), sender);

    let url = format!("https://www.youtube.com/watch?v={video_id}&hl=en&gl=US");
    let script = INIT_SCRIPT
        .replace("__REQ_ID__", &id)
        .replace("__VIDEO__", video_id)
        .replace("__PORT__", &port.to_string());

    let app_for_build = app.clone();
    let build = app.run_on_main_thread(move || {
        if let Some(existing) = app_for_build.get_webview_window(WINDOW_LABEL) {
            let _ = existing.close();
        }
        if let Ok(parsed) = tauri::Url::parse(&url) {
            match tauri::WebviewWindowBuilder::new(
                &app_for_build,
                WINDOW_LABEL,
                tauri::WebviewUrl::External(parsed),
            )
            .visible(false)
            .skip_taskbar(true)
            .focused(false)
            .initialization_script(&script)
            .build()
            {
                Ok(_) => debug!("Opened hidden YouTube extraction WebView"),
                Err(error) => warn!(%error, "Failed to open YouTube extraction WebView"),
            }
        }
    });
    if build.is_err() {
        pending().lock().unwrap().remove(&id);
        return None;
    }

    let outcome = tokio::time::timeout(EXTRACT_TIMEOUT, receiver).await;
    pending().lock().unwrap().remove(&id);

    let app_for_close = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = app_for_close.get_webview_window(WINDOW_LABEL) {
            let _ = window.close();
        }
    });

    match outcome {
        Ok(Ok(json)) => match serde_json::from_str::<Value>(&json) {
            Ok(value) => Some(value),
            Err(error) => {
                warn!(%error, "Failed to parse in-page player response");
                None
            }
        },
        _ => None,
    }
}

/// Injected before page scripts (every navigation). Accepts cookie consent so the
/// real watch page (with `ytInitialPlayerResponse`) loads, then POSTs it to the
/// local proxy. YouTube's watch-page CSP has no `connect-src`, so this cross-
/// origin fetch to the loopback proxy is allowed (Tauri remote IPC is not). A
/// `text/plain` body keeps it a CORS-simple request (no preflight).
const INIT_SCRIPT: &str = r#"
(function () {
  var PORT = '__PORT__';
  var BASE = 'http://127.0.0.1:' + PORT;
  function diag(tag) {
    try {
      fetch(BASE + '/ytdiag?msg=' + encodeURIComponent(tag + ' host=' + (location.hostname || '?') + ' ytIPR=' + (!!window.ytInitialPlayerResponse)));
    } catch (e) {}
  }
  try {
    // Top frame only — skip ad/analytics subframes (tpc.googlesyndication.com etc).
    if (window.top !== window.self) return;
    var ID = '__REQ_ID__', VIDEO = '__VIDEO__';
    try { document.cookie = 'SOCS=CAE=; path=/; domain=.youtube.com'; } catch (e) {}
    diag('start');
    var sent = false, reloaded = false;
    function tick() {
      if (sent) return;
      var host = location.hostname || '';
      if (host.indexOf('consent') >= 0 || host.indexOf('google.com') >= 0) {
        if (!reloaded) {
          reloaded = true;
          try { document.cookie = 'SOCS=CAE=; path=/; domain=.youtube.com'; } catch (e) {}
          diag('consent-reload');
          try { location.replace('https://www.youtube.com/watch?v=' + VIDEO + '&hl=en&gl=US'); } catch (e) {}
        }
        return;
      }
      var r = window.ytInitialPlayerResponse;
      if (r && r.playabilityStatus) {
        sent = true;
        diag('found-' + (r.playabilityStatus.status || '?'));
        try {
          fetch(BASE + '/ytresult?id=' + encodeURIComponent(ID), {
            method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(r)
          });
        } catch (e) { diag('posterr'); }
      }
    }
    var iv = setInterval(tick, 250);
    setTimeout(function () { if (!sent) diag('t8'); }, 8000);
    setTimeout(function () { if (!sent) diag('t15'); try { clearInterval(iv); } catch (e) {} }, 15000);
  } catch (e) {
    diag('scripterr-' + (e && e.message ? e.message : 'x'));
  }
})();
"#;
