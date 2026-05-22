use serde_json::Value;
use crate::api::innertube::InnertubeClient;

pub fn get_ios_context(visitor_data: Option<String>, po_token: Option<String>) -> Value {
    let mut client = serde_json::json!({
        "clientName": "IOS",
        "clientVersion": "19.29.1",
        "hl": "en",
        "gl": "US",
        "utcOffsetMinutes": 0,
        "deviceMake": "Apple",
        "deviceModel": "iPhone14,5",
        "osName": "iOS",
        "osVersion": "17.5.1"
    });

    if let Some(vd) = visitor_data {
        client["visitorData"] = Value::String(vd);
    }

    let mut context = serde_json::json!({
        "client": client,
    });

    if let Some(token) = po_token {
        context["serviceIntegrityDimensions"] = serde_json::json!({
            "poToken": token
        });
    }

    context
}

pub fn get_android_vr_context(visitor_data: Option<String>) -> Value {
    let mut client = serde_json::json!({
        "clientName": "ANDROID_VR",
        "clientVersion": "1.61.48",
        "hl": "en",
        "gl": "US",
        "utcOffsetMinutes": 0,
        "deviceMake": "Oculus",
        "deviceModel": "Quest 3",
        "osName": "Android",
        "osVersion": "12",
        "androidSdkVersion": "32"
    });

    if let Some(vd) = visitor_data {
        client["visitorData"] = Value::String(vd);
    }

    serde_json::json!({
        "client": client,
    })
}

impl InnertubeClient {
    pub async fn fetch_visitor_data(&self) -> Option<String> {
        let mut payload = serde_json::json!({});
        if let Ok(res) = self.post_innertube("visitor_id", "WEB", "2.20260120.01.00", &mut payload).await {
            if let Some(vd) = res["responseContext"]["visitorData"].as_str() {
                return Some(vd.to_string());
            }
        }
        None
    }
}
