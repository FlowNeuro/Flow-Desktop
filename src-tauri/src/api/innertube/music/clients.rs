//! InnerTube client definitions and the music stream-resolution fallback order.
//!
//! Mirrors `FlowApp_mobile`'s `YouTubeClient` + `MusicPlayerUtils` client lists,
//! adapted for the desktop reality: the desktop has **no JS cipher/n-sig solver**,
//! so the stream resolver only uses clients that return *direct* (un-ciphered)
//! audio URLs. Web clients (which return `signatureCipher`) are excluded from the
//! direct-audio path but kept available for metadata via `WEB_REMIX`.

use serde_json::{json, Value};

const USER_AGENT_WEB: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

/// A single InnerTube client profile.
#[derive(Clone, Copy, Debug)]
pub struct MusicClient {
    pub name: &'static str,
    pub version: &'static str,
    pub client_id: &'static str,
    pub user_agent: &'static str,
    pub os_name: Option<&'static str>,
    pub os_version: Option<&'static str>,
    pub device_make: Option<&'static str>,
    pub device_model: Option<&'static str>,
    pub android_sdk_version: Option<&'static str>,
    /// Whether the player request should carry a `signatureTimestamp`.
    pub use_signature_timestamp: bool,
    /// Embedded player (sends a `thirdParty.embedUrl`) — bypasses age gating.
    pub is_embedded: bool,
    /// iOS-family client (we attach a PO token + signatureTimestamp like the
    /// existing video path does for `IOS`).
    pub is_ios_family: bool,
}

impl MusicClient {
    /// Build the `context` object for this client.
    #[must_use]
    pub fn context(&self, visitor_data: Option<&str>, hl: &str, gl: &str) -> Value {
        let mut client = json!({
            "clientName": self.name,
            "clientVersion": self.version,
            "hl": hl,
            "gl": gl,
            "utcOffsetMinutes": 0,
        });
        if let Some(v) = self.os_name {
            client["osName"] = json!(v);
        }
        if let Some(v) = self.os_version {
            client["osVersion"] = json!(v);
        }
        if let Some(v) = self.device_make {
            client["deviceMake"] = json!(v);
        }
        if let Some(v) = self.device_model {
            client["deviceModel"] = json!(v);
        }
        if let Some(v) = self.android_sdk_version {
            client["androidSdkVersion"] = json!(v);
        }
        if let Some(vd) = visitor_data {
            client["visitorData"] = json!(vd);
        }
        json!({ "client": client })
    }
}

// ---------------------------------------------------------------------------
// Client definitions
// ---------------------------------------------------------------------------

/// Primary YouTube Music client — browse/search/next metadata. Returns ciphered
/// stream URLs on desktop, so it is NOT used for direct stream resolution.
pub const WEB_REMIX: MusicClient = MusicClient {
    name: "WEB_REMIX",
    version: "1.20260213.01.00",
    client_id: "67",
    user_agent: USER_AGENT_WEB,
    os_name: None,
    os_version: None,
    device_make: None,
    device_model: None,
    android_sdk_version: None,
    use_signature_timestamp: true,
    is_embedded: false,
    is_ios_family: false,
};

pub const ANDROID_VR_1_43_32: MusicClient = MusicClient {
    name: "ANDROID_VR",
    version: "1.43.32",
    client_id: "28",
    user_agent: "com.google.android.apps.youtube.vr.oculus/1.43.32 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/107.0.5284.2)",
    os_name: Some("Android"),
    os_version: Some("12"),
    device_make: Some("Oculus"),
    device_model: Some("Quest 3"),
    android_sdk_version: Some("32"),
    use_signature_timestamp: false,
    is_embedded: false,
    is_ios_family: false,
};

pub const ANDROID_VR_1_61_48: MusicClient = MusicClient {
    name: "ANDROID_VR",
    version: "1.61.48",
    client_id: "28",
    user_agent: "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)",
    os_name: Some("Android"),
    os_version: Some("12"),
    device_make: Some("Oculus"),
    device_model: Some("Quest 3"),
    android_sdk_version: Some("32"),
    use_signature_timestamp: false,
    is_embedded: false,
    is_ios_family: false,
};

pub const ANDROID_VR_NO_AUTH: MusicClient = MusicClient {
    name: "ANDROID_VR",
    version: "1.61.48",
    client_id: "28",
    user_agent: "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Oculus Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)",
    os_name: Some("Android"),
    os_version: Some("12"),
    device_make: Some("Oculus"),
    device_model: Some("Quest 3"),
    android_sdk_version: Some("32"),
    use_signature_timestamp: false,
    is_embedded: false,
    is_ios_family: false,
};

pub const IOS: MusicClient = MusicClient {
    name: "IOS",
    version: "21.03.1",
    client_id: "5",
    user_agent: "com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)",
    os_name: Some("iOS"),
    os_version: Some("18.2.22C152"),
    device_make: Some("Apple"),
    device_model: Some("iPhone16,2"),
    android_sdk_version: None,
    use_signature_timestamp: true,
    is_embedded: false,
    is_ios_family: true,
};

pub const IPADOS: MusicClient = MusicClient {
    name: "IOS",
    version: "21.03.3",
    client_id: "5",
    user_agent: "com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)",
    os_name: Some("iPadOS"),
    os_version: Some("17.7.10.21H450"),
    device_make: Some("Apple"),
    device_model: Some("iPad7,6"),
    android_sdk_version: None,
    use_signature_timestamp: true,
    is_embedded: false,
    is_ios_family: true,
};

pub const ANDROID_MOBILE: MusicClient = MusicClient {
    name: "ANDROID",
    version: "21.03.38",
    client_id: "3",
    user_agent: "com.google.android.youtube/21.03.38 (Linux; U; Android 14) gzip",
    os_name: Some("Android"),
    os_version: Some("14"),
    device_make: Some("Google"),
    device_model: Some("Pixel 6 Pro"),
    android_sdk_version: Some("34"),
    use_signature_timestamp: true,
    is_embedded: false,
    is_ios_family: false,
};

pub const ANDROID_CREATOR: MusicClient = MusicClient {
    name: "ANDROID_CREATOR",
    version: "25.03.101",
    client_id: "14",
    user_agent: "com.google.android.apps.youtube.creator/25.03.101 (Linux; U; Android 15; en_US; Pixel 9 Pro Fold; Build/AP3A.241005.015.A2; Cronet/132.0.6779.0)",
    os_name: Some("Android"),
    os_version: Some("15"),
    device_make: Some("Google"),
    device_model: Some("Pixel 9 Pro Fold"),
    android_sdk_version: Some("35"),
    use_signature_timestamp: true,
    is_embedded: false,
    is_ios_family: false,
};

pub const TVHTML5_SIMPLY_EMBEDDED_PLAYER: MusicClient = MusicClient {
    name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    version: "2.0",
    client_id: "85",
    user_agent: "Mozilla/5.0 (PlayStation; PlayStation 4/12.02) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15",
    os_name: None,
    os_version: None,
    device_make: None,
    device_model: None,
    android_sdk_version: None,
    use_signature_timestamp: true,
    is_embedded: true,
    is_ios_family: false,
};

/// Ordered fallback chain for **direct** audio stream resolution on desktop.
///
/// Mirrors the spirit of `FlowApp_mobile`'s `FAST_DIRECT_STREAM_CLIENTS`: VR
/// (non-ABR `1.43.32` first — smoothest for music), then iOS/iPad, then the
/// Android phone/creator clients, then the embedded TV player as an
/// age-restriction bypass. Every one of these returns plain `url` fields, so no
/// cipher/n-sig solver is required.
pub const DIRECT_AUDIO_CLIENTS: &[MusicClient] = &[
    ANDROID_VR_1_43_32,
    ANDROID_VR_1_61_48,
    ANDROID_VR_NO_AUTH,
    IPADOS,
    IOS,
    ANDROID_MOBILE,
    ANDROID_CREATOR,
    TVHTML5_SIMPLY_EMBEDDED_PLAYER,
];
