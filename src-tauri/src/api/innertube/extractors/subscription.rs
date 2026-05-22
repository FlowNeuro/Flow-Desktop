use crate::api::innertube::InnertubeClient;
use crate::errors::AppResult;

impl InnertubeClient {
    pub fn parse_subscription_export(
        &self,
        data: &str,
    ) -> AppResult<Vec<(String, String)>> {
        let mut subscriptions = Vec::new();
        let lines: Vec<&str> = data.lines().collect();

        for line in lines {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Case 1: OPML XML Outline
            if trimmed.contains("<outline") {
                let channel_id = if let Some(pos) = trimmed.find("channel_id=") {
                    let start = pos + 11;
                    if let Some(end) = trimmed[start..].find('"').or_else(|| trimmed[start..].find('\'')) {
                        trimmed[start..start+end].to_string()
                    } else {
                        "".to_string()
                    }
                } else {
                    "".to_string()
                };

                let title = if let Some(pos) = trimmed.find("title=") {
                    let start = pos + 6;
                    if let Some(end) = trimmed[start..].find('"').or_else(|| trimmed[start..].find('\'')) {
                        trimmed[start..start+end].to_string()
                    } else {
                        "".to_string()
                    }
                } else {
                    "".to_string()
                };

                if !channel_id.is_empty() && channel_id.starts_with("UC") {
                    subscriptions.push((channel_id, if title.is_empty() { "Imported Channel".to_string() } else { title }));
                }
                continue;
            }

            // Case 2: Takeout CSV
            if trimmed.contains("Channel Id") || trimmed.contains("Channel Url") {
                continue;
            }

            let parts: Vec<&str> = trimmed.split(',').collect();
            if parts.len() >= 3 {
                let channel_id = parts[0].trim().to_string();
                let title = parts[2].trim().trim_matches('"').to_string();
                if channel_id.starts_with("UC") && channel_id.len() >= 20 {
                    subscriptions.push((channel_id, title));
                    continue;
                }
            }

            // Case 3: Raw URL or ID list
            if trimmed.starts_with("UC") && trimmed.len() >= 20 {
                subscriptions.push((trimmed.to_string(), "Imported Channel".to_string()));
            } else if let Some(pos) = trimmed.find("/channel/") {
                let channel_id = trimmed[pos + 9..].split('/').next().unwrap_or("").to_string();
                if channel_id.starts_with("UC") && channel_id.len() >= 20 {
                    subscriptions.push((channel_id, "Imported Channel".to_string()));
                }
            }
        }

        let mut seen = std::collections::HashSet::new();
        subscriptions.retain(|(id, _)| seen.insert(id.clone()));

        Ok(subscriptions)
    }
}
