use crate::api::innertube::InnertubeClient;
use crate::errors::{AppError, AppResult};
use serde_json::Value;

pub fn get_client_id(client_name: &str) -> &'static str {
    match client_name {
        "WEB" => "1",
        "WEB_REMIX" => "67",
        "WEB_CREATOR" => "62",
        "TVHTML5" => "7",
        "TVHTML5_SIMPLY_EMBEDDED_PLAYER" => "85",
        "IOS" => "5",
        "ANDROID" => "3",
        "ANDROID_VR" => "28",
        "ANDROID_CREATOR" => "14",
        "VISIONOS" => "101",
        _ => "1",
    }
}

#[allow(dead_code)]
pub fn custom_url_encode(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.as_bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*b as char);
            }
            b' ' => {
                encoded.push('+');
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

impl InnertubeClient {
    pub async fn post_innertube(
        &self,
        endpoint: &str,
        client_name: &str,
        client_version: &str,
        payload: &mut Value,
    ) -> AppResult<Value> {
        let user_agent = match (client_name, client_version) {
            ("IOS", "21.03.3") => {
                "com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)"
            }
            ("IOS", _) => {
                "com.google.ios.youtube/19.29.1 (iPhone14,5; U; CPU iOS 17_5_1 like Mac OS X; en_US)"
            }
            ("ANDROID_VR", _) => {
                "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)"
            }
            ("ANDROID", "21.03.38") => {
                "com.google.android.youtube/21.03.38 (Linux; U; Android 14) gzip"
            }
            _ => {
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        };

        if let Some(obj) = payload.as_object_mut() {
            if !obj.contains_key("context") {
                obj.insert(
                    "context".to_string(),
                    serde_json::json!({
                        "client": {
                            "clientName": client_name,
                            "clientVersion": client_version,
                            "hl": "en",
                            "gl": "US",
                            "utcOffsetMinutes": 0
                        }
                    }),
                );
            }
        }

        let mut custom_referer = None;
        if let Some(obj) = payload.as_object_mut() {
            if let Some(val) = obj.remove("custom_referer") {
                if let Some(s) = val.as_str() {
                    custom_referer = Some(s.to_string());
                }
            }
        }

        let url = format!(
            "https://www.youtube.com/youtubei/v1/{}?prettyPrint=false",
            endpoint
        );
        let client_id = get_client_id(client_name);

        let mut req = self
            .client
            .post(&url)
            .header(reqwest::header::USER_AGENT, user_agent)
            .header("X-YouTube-Client-Name", client_id)
            .header("X-YouTube-Client-Version", client_version)
            .header("Origin", "https://www.youtube.com")
            .header("Cookie", "SOCS=CAE=") // Bypasses cookie consent blocks!
            .json(payload);

        if let Some(ref ref_url) = custom_referer {
            req = req.header("Referer", ref_url);
        } else {
            req = req.header("Referer", "https://www.youtube.com");
        }

        let res = req
            .send()
            .await
            .map_err(|e| AppError::Extractor(format!("Network error: {}", e)))?;

        let status = res.status();
        let res_json = res
            .json::<Value>()
            .await
            .map_err(|e| AppError::Extractor(format!("JSON parse error: {}", e)))?;

        if !status.is_success() {
            return Err(AppError::Extractor(format!(
                "Innertube returned status {}: {}",
                status,
                res_json["error"]["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
            )));
        }

        Ok(res_json)
    }

    // Helper to fetch watch-next details (lyrics & related browse pointers) from WEB_REMIX
    pub async fn fetch_watch_next_metadata(
        &self,
        video_id: &str,
    ) -> AppResult<(
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> {
        let mut payload = serde_json::json!({
            "videoId": video_id
        });

        let res = self
            .post_innertube("next", "WEB_REMIX", "67", &mut payload)
            .await?;

        let lyrics_tab = res["contents"]["singleColumnMusicWatchNextResultsRenderer"]
            ["tabbedRenderer"]["watchNextTabbedResultsRenderer"]["tabs"]
            .as_array()
            .and_then(|tabs| tabs.get(1))
            .and_then(|tab| tab.get("tabRenderer"));

        let lyrics_browse_id = lyrics_tab
            .and_then(|renderer| renderer["endpoint"]["browseEndpoint"]["browseId"].as_str())
            .map(|s| s.to_string());

        let lyrics_params = lyrics_tab
            .and_then(|renderer| renderer["endpoint"]["browseEndpoint"]["params"].as_str())
            .map(|s| s.to_string());

        let related_tab = res["contents"]["singleColumnMusicWatchNextResultsRenderer"]
            ["tabbedRenderer"]["watchNextTabbedResultsRenderer"]["tabs"]
            .as_array()
            .and_then(|tabs| tabs.get(2))
            .and_then(|tab| tab.get("tabRenderer"));

        let related_browse_id = related_tab
            .and_then(|renderer| renderer["endpoint"]["browseEndpoint"]["browseId"].as_str())
            .map(|s| s.to_string());

        let related_params = related_tab
            .and_then(|renderer| renderer["endpoint"]["browseEndpoint"]["params"].as_str())
            .map(|s| s.to_string());

        Ok((
            lyrics_browse_id,
            lyrics_params,
            related_browse_id,
            related_params,
        ))
    }
}
