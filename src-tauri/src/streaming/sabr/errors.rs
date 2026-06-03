// SABR error taxonomy
use std::fmt;

#[derive(Debug, Clone)]
pub enum SabrError {
    // --- extractor-stage problems surfaced into a session ---
    NoStreamingData,
    NoDirectUrlsButSabrAvailable,
    NoPlayableFormats,
    PoTokenRequired,

    // --- protocol-stage problems ---
    HttpStatus(u16),
    UmpDecode(String),
    ServerError { kind: String, code: i32 },
    RedirectLoop,
    BackoffExceeded,
    AttestationRequired,
    ReloadRequired,
    SegmentTimeout,

    // --- transport ---
    Network(String),
    RemoteReset,
    Cancelled,
}

impl SabrError {
    pub fn code(&self) -> &'static str {
        match self {
            SabrError::NoStreamingData => "NoStreamingData",
            SabrError::NoDirectUrlsButSabrAvailable => "NoDirectUrlsButSabrAvailable",
            SabrError::NoPlayableFormats => "NoPlayableFormats",
            SabrError::PoTokenRequired => "PoTokenRequired",
            SabrError::HttpStatus(_) => "SabrHttpStatus",
            SabrError::UmpDecode(_) => "SabrUmpDecode",
            SabrError::ServerError { .. } => "SabrServerError",
            SabrError::RedirectLoop => "SabrRedirectLoop",
            SabrError::BackoffExceeded => "SabrBackoffExceeded",
            SabrError::AttestationRequired => "SabrAttestationRequired",
            SabrError::ReloadRequired => "SabrReloadRequired",
            SabrError::SegmentTimeout => "SabrSegmentTimeout",
            SabrError::Network(_) => "SabrNetwork",
            SabrError::RemoteReset => "RemoteReset",
            SabrError::Cancelled => "Cancelled",
        }
    }

    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            SabrError::HttpStatus(500..=599)
                | SabrError::Network(_)
                | SabrError::RemoteReset
                | SabrError::SegmentTimeout
                | SabrError::BackoffExceeded
        )
    }

    pub fn requires_reload(&self) -> bool {
        matches!(
            self,
            SabrError::ReloadRequired
                | SabrError::AttestationRequired
                | SabrError::HttpStatus(401 | 403)
        )
    }
}

impl fmt::Display for SabrError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SabrError::NoStreamingData => write!(f, "no streaming data in player response"),
            SabrError::NoDirectUrlsButSabrAvailable => {
                write!(f, "direct URLs unavailable; SABR metadata present")
            }
            SabrError::NoPlayableFormats => write!(f, "no playable formats"),
            SabrError::PoTokenRequired => write!(f, "a PO token is required for SABR playback"),
            SabrError::HttpStatus(code) => write!(f, "SABR request returned HTTP {code}"),
            SabrError::UmpDecode(msg) => write!(f, "UMP decode error: {msg}"),
            SabrError::ServerError { kind, code } => {
                write!(f, "SABR server error: type={kind}, code={code}")
            }
            SabrError::RedirectLoop => write!(f, "SABR redirect loop detected"),
            SabrError::BackoffExceeded => write!(f, "SABR backoff budget exceeded"),
            SabrError::AttestationRequired => {
                write!(f, "SABR attestation required (token refresh needed)")
            }
            SabrError::ReloadRequired => write!(f, "SABR session must reload player response"),
            SabrError::SegmentTimeout => write!(f, "timed out waiting for a SABR segment"),
            SabrError::Network(msg) => write!(f, "network error: {msg}"),
            SabrError::RemoteReset => write!(f, "remote closed the stream mid-body"),
            SabrError::Cancelled => write!(f, "SABR session cancelled"),
        }
    }
}

impl std::error::Error for SabrError {}

pub type SabrResult<T> = Result<T, SabrError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retryable_classification() {
        assert!(SabrError::HttpStatus(503).is_retryable());
        assert!(SabrError::RemoteReset.is_retryable());
        assert!(!SabrError::HttpStatus(403).is_retryable());
        assert!(!SabrError::AttestationRequired.is_retryable());
    }

    #[test]
    fn reload_classification() {
        assert!(SabrError::AttestationRequired.requires_reload());
        assert!(SabrError::HttpStatus(401).requires_reload());
        assert!(!SabrError::SegmentTimeout.requires_reload());
    }

    #[test]
    fn codes_are_stable() {
        assert_eq!(SabrError::ReloadRequired.code(), "SabrReloadRequired");
        assert_eq!(SabrError::HttpStatus(500).code(), "SabrHttpStatus");
    }
}
