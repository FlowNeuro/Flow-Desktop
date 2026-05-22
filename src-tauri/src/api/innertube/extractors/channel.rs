use serde_json::Value;
use tracing::debug;
use crate::api::innertube::InnertubeClient;
use crate::errors::{AppError, AppResult};
use crate::models::channel::{ChannelDetails, ChannelVideosResponse};
use crate::models::video::VideoSummary;
use crate::api::innertube::core::utils::{
    parse_duration_seconds, parse_mixed_number_word_to_long, normalize_youtube_image_url,
    extract_channel_id_from_video_renderer
};

fn extract_videos_from_browse(val: &Value) -> (Vec<VideoSummary>, Option<String>) {
    let mut items = Vec::new();
    let mut next_page_token = None;

    let top_channel_id = val.get("metadata")
        .and_then(|m| m.get("channelMetadataRenderer"))
        .and_then(|c| c.get("externalId").or_else(|| c.get("externalChannelId")))
        .and_then(|id| id.as_str())
        .map(|s| s.to_string());

    let top_channel_name = val.get("header")
        .and_then(|h| h.get("pageHeaderRenderer"))
        .and_then(|p| p.get("content"))
        .and_then(|c| c.get("pageHeaderViewModel"))
        .and_then(|ph| ph.get("title"))
        .and_then(|t| t.get("dynamicTextViewModel"))
        .and_then(|d| d.get("text"))
        .and_then(|t| t.get("content"))
        .and_then(|s| s.as_str())
        .or_else(|| {
            val.get("metadata")
                .and_then(|m| m.get("channelMetadataRenderer"))
                .and_then(|c| c.get("title"))
                .and_then(|s| s.as_str())
        })
        .unwrap_or("Unknown Channel")
        .to_string();

    let mut process_array = |arr: &Vec<Value>| {
        for item in arr {
            if let Some(video) = item.get("gridVideoRenderer") {
                if let Some(video_id) = video.get("videoId").and_then(|v| v.as_str()) {
                    let title = video.get("title")
                        .and_then(|t| t.get("runs").and_then(|r| r.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("text")).and_then(|s| s.as_str()).or_else(|| t.get("simpleText").and_then(|s| s.as_str())))
                        .unwrap_or_default()
                        .to_string();
                    
                    let channel_name = video.get("shortBylineText")
                        .and_then(|b| b.get("runs").and_then(|r| r.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("text")).and_then(|s| s.as_str()))
                        .or_else(|| video.get("longBylineText").and_then(|b| b.get("runs").and_then(|r| r.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("text")).and_then(|s| s.as_str())))
                        .unwrap_or_default()
                        .to_string();

                    let thumbnail_url = video.get("thumbnail")
                        .and_then(|th| th.get("thumbnails").and_then(|t| t.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("url")).and_then(|s| s.as_str()))
                        .map(|s| s.to_string());

                    let duration_text = video.get("thumbnailOverlays")
                        .and_then(|o| o.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|first| first.get("thumbnailOverlayTimeStatusRenderer"))
                        .and_then(|t| t.get("text"))
                        .and_then(|txt| txt.get("runs").and_then(|r| r.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("text")).and_then(|s| s.as_str()).or_else(|| txt.get("simpleText").and_then(|s| s.as_str())))
                        .unwrap_or_default();

                    let duration_seconds = if duration_text.is_empty() {
                        None
                    } else {
                        Some(parse_duration_seconds(duration_text))
                    };

                    let published_text = video.get("publishedTimeText")
                        .and_then(|p| p.get("simpleText").and_then(|s| s.as_str()).or_else(|| p.get("runs").and_then(|r| r.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("text")).and_then(|s| s.as_str())))
                        .map(|s| s.to_string());

                    let view_count_text = video.get("viewCountText")
                        .and_then(|v| v.get("simpleText").and_then(|s| s.as_str()).or_else(|| v.get("runs").and_then(|r| r.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("text")).and_then(|s| s.as_str())))
                        .map(|s| s.to_string());

                    let channel_id = extract_channel_id_from_video_renderer(video);

                    items.push(VideoSummary {
                        id: video_id.to_string(),
                        title,
                        channel_name,
                        channel_id,
                        thumbnail_url,
                        duration_seconds,
                        published_text,
                        view_count_text,
                    });
                }
            } else if let Some(video) = item.get("richItemRenderer") {
                if let Some(content_video) = video.get("content").and_then(|c| c.get("videoRenderer")) {
                    let video_id = content_video.get("videoId").and_then(|v| v.as_str()).unwrap_or_default();
                    if !video_id.is_empty() {
                        let title = content_video.get("title")
                            .and_then(|t| t.get("runs").and_then(|r| r.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("text")).and_then(|s| s.as_str()).or_else(|| t.get("simpleText").and_then(|s| s.as_str())))
                            .unwrap_or_default()
                            .to_string();

                        let channel_name = content_video.get("shortBylineText")
                            .and_then(|b| b.get("runs").and_then(|r| r.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("text")).and_then(|s| s.as_str()))
                            .unwrap_or_default()
                            .to_string();

                        let thumbnail_url = content_video.get("thumbnail")
                            .and_then(|th| th.get("thumbnails").and_then(|t| t.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("url")).and_then(|s| s.as_str()))
                            .map(|s| s.to_string());

                        let duration_text = content_video.get("lengthText")
                            .and_then(|l| l.get("runs").and_then(|r| r.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("text")).and_then(|s| s.as_str()).or_else(|| l.get("simpleText").and_then(|s| s.as_str())))
                            .unwrap_or_default();

                        let duration_seconds = if duration_text.is_empty() {
                            None
                        } else {
                            Some(parse_duration_seconds(duration_text))
                        };

                        let published_text = content_video.get("publishedTimeText")
                            .and_then(|p| p.get("simpleText").and_then(|s| s.as_str()).or_else(|| p.get("runs").and_then(|r| r.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("text")).and_then(|s| s.as_str())))
                            .map(|s| s.to_string());

                        let view_count_text = content_video.get("viewCountText")
                            .and_then(|v| v.get("simpleText").and_then(|s| s.as_str()).or_else(|| v.get("runs").and_then(|r| r.as_array()).and_then(|arr| arr.first()).and_then(|f| f.get("text")).and_then(|s| s.as_str())))
                            .map(|s| s.to_string());

                        let channel_id = extract_channel_id_from_video_renderer(content_video);

                        items.push(VideoSummary {
                            id: video_id.to_string(),
                            title,
                            channel_name,
                            channel_id,
                            thumbnail_url,
                            duration_seconds,
                            published_text,
                            view_count_text,
                        });
                    }
                } else if let Some(lockup) = video.get("content").and_then(|c| c.get("lockupViewModel")) {
                    let video_id = lockup.get("contentId").and_then(|v| v.as_str()).unwrap_or_default();
                    if !video_id.is_empty() {
                        let title = lockup.get("metadata")
                            .and_then(|m| m.get("lockupMetadataViewModel"))
                            .and_then(|lm| lm.get("title"))
                            .and_then(|t| t.get("content"))
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string();

                        let channel_name = top_channel_name.clone();
                        let channel_id = top_channel_id.clone();

                        let thumbnail_url = lockup.get("contentImage")
                            .and_then(|ci| ci.get("thumbnailViewModel"))
                            .and_then(|tv| tv.get("image"))
                            .and_then(|img| img.get("sources"))
                            .and_then(|s| s.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|src| src.get("url"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        let mut duration_text = "";
                        if let Some(overlays) = lockup.get("contentImage")
                            .and_then(|ci| ci.get("thumbnailViewModel"))
                            .and_then(|tv| tv.get("overlays"))
                            .and_then(|o| o.as_array())
                        {
                            for overlay in overlays {
                                if let Some(bottom) = overlay.get("thumbnailBottomOverlayViewModel") {
                                    if let Some(badges) = bottom.get("badges").and_then(|b| b.as_array()) {
                                        if let Some(badge) = badges.first().and_then(|b| b.get("thumbnailBadgeViewModel")) {
                                            if let Some(text) = badge.get("text").and_then(|t| t.as_str()) {
                                                duration_text = text;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        let duration_seconds = if duration_text.is_empty() {
                            None
                        } else {
                            Some(parse_duration_seconds(duration_text))
                        };

                        let mut view_count_text = None;
                        let mut published_text = None;
                        if let Some(meta) = lockup.get("metadata")
                            .and_then(|m| m.get("lockupMetadataViewModel"))
                            .and_then(|lm| lm.get("metadata"))
                            .and_then(|m| m.get("contentMetadataViewModel"))
                            .and_then(|cm| cm.get("metadataRows"))
                            .and_then(|r| r.as_array())
                        {
                            if let Some(row) = meta.first() {
                                if let Some(parts) = row.get("metadataParts").and_then(|p| p.as_array()) {
                                    if parts.len() >= 2 {
                                        if let Some(p0) = parts[0].get("text").and_then(|t| t.get("content")).and_then(|c| c.as_str()) {
                                            view_count_text = Some(p0.to_string());
                                        }
                                        if let Some(p1) = parts[1].get("text").and_then(|t| t.get("content")).and_then(|c| c.as_str()) {
                                            published_text = Some(p1.to_string());
                                        }
                                    } else if parts.len() == 1 {
                                        if let Some(p0) = parts[0].get("text").and_then(|t| t.get("content")).and_then(|c| c.as_str()) {
                                            if p0.contains("view") || p0.contains("watching") {
                                                view_count_text = Some(p0.to_string());
                                            } else {
                                                published_text = Some(p0.to_string());
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        items.push(VideoSummary {
                            id: video_id.to_string(),
                            title,
                            channel_name,
                            channel_id,
                            thumbnail_url,
                            duration_seconds,
                            published_text,
                            view_count_text,
                        });
                    }
                }
            } else if let Some(cont) = item.get("continuationItemRenderer") {
                if let Some(token) = cont.get("continuationEndpoint")
                    .and_then(|e| e.get("continuationCommand"))
                    .and_then(|c| c.get("token"))
                    .and_then(|t| t.as_str())
                {
                    next_page_token = Some(token.to_string());
                }
            }
        }
    };

    if let Some(actions) = val.get("onResponseReceivedActions").and_then(|v| v.as_array()) {
        for action in actions {
            if let Some(items_arr) = action.get("appendContinuationItemsAction")
                .and_then(|a| a.get("continuationItems"))
                .and_then(|c| c.as_array())
            {
                process_array(items_arr);
            } else if let Some(items_arr) = action.get("reloadContinuationItemsCommand")
                .and_then(|r| r.get("continuationItems"))
                .and_then(|c| c.as_array())
            {
                process_array(items_arr);
            }
        }
    }

    if let Some(tabs) = val.get("contents")
        .and_then(|c| c.get("twoColumnBrowseResultsRenderer"))
        .and_then(|t| t.get("tabs"))
        .and_then(|t| t.as_array())
    {
        for tab in tabs {
            if let Some(tab_renderer) = tab.get("tabRenderer") {
                if let Some(content) = tab_renderer.get("content") {
                    if let Some(contents_arr) = content.get("richGridRenderer").and_then(|r| r.get("contents")).and_then(|c| c.as_array()) {
                        process_array(contents_arr);
                    }
                    
                    if let Some(sections) = content.get("sectionListRenderer").and_then(|s| s.get("contents")).and_then(|c| c.as_array()) {
                        for section in sections {
                            if let Some(items_arr) = section.get("itemSectionRenderer").and_then(|i| i.get("contents")).and_then(|c| c.as_array()) {
                                for sub_item in items_arr {
                                    if let Some(grid_items) = sub_item.get("gridRenderer").and_then(|g| g.get("items")).and_then(|i| i.as_array()) {
                                        process_array(grid_items);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    (items, next_page_token)
}

impl InnertubeClient {
    pub async fn get_channel_details(
        &self,
        channel_id: &str,
    ) -> AppResult<ChannelDetails> {
        let channel_id_trimmed = channel_id.trim();
        if channel_id_trimmed.is_empty() {
            return Err(AppError::Validation("Channel ID cannot be empty".into()));
        }

        debug!(channel_id = %channel_id_trimmed, "[get_channel_details] Starting channel details fetch");

        let mut payload = serde_json::json!({
            "browseId": channel_id_trimmed
        });

        let res = self.post_innertube("browse", "WEB", "2.20260120.01.00", &mut payload).await?;

        debug!(
            channel_id = %channel_id_trimmed,
            has_metadata = !res["metadata"]["channelMetadataRenderer"].is_null(),
            has_header = !res["header"].is_null(),
            "[get_channel_details] Browse response received"
        );

        let metadata = res.get("metadata").and_then(|m| m.get("channelMetadataRenderer")).unwrap_or(&Value::Null);
        let header = res.get("header").unwrap_or(&Value::Null);

        let id = metadata.get("externalChannelId")
            .or_else(|| metadata.get("externalId"))
            .and_then(|v| v.as_str())
            .or_else(|| {
                res.get("responseContext")
                    .and_then(|rc| rc.get("serviceTrackingParams"))
                    .and_then(|s| s.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|first| first.get("params"))
                    .and_then(|p| p.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|first| first.get("value"))
                    .and_then(|v| v.as_str())
            })
            .unwrap_or(channel_id_trimmed)
            .to_string();

        let name = metadata.get("title")
            .and_then(|v| v.as_str())
            .or_else(|| {
                header.get("c4TabbedHeaderRenderer")
                    .and_then(|c4| c4.get("title"))
                    .and_then(|v| v.as_str())
            })
            .or_else(|| {
                header.get("pageHeaderRenderer")
                    .and_then(|ph| ph.get("content"))
                    .and_then(|c| c.get("pageHeaderViewModel"))
                    .and_then(|ph| ph.get("title"))
                    .and_then(|t| t.get("dynamicTextViewModel"))
                    .and_then(|d| d.get("text"))
                    .and_then(|t| t.get("content"))
                    .and_then(|s| s.as_str())
            })
            .unwrap_or("Unknown Channel")
            .to_string();

        let description = metadata.get("description")
            .and_then(|v| v.as_str())
            .or_else(|| {
                res.get("microformat")
                    .and_then(|m| m.get("microformatDataRenderer"))
                    .and_then(|md| md.get("description"))
                    .and_then(|v| v.as_str())
            })
            .map(|s| s.to_string());

        let avatar_url = metadata.get("avatar")
            .and_then(|a| a.get("thumbnails"))
            .and_then(|t| t.as_array())
            .and_then(|arr| arr.first())
            .and_then(|first| first.get("url"))
            .and_then(|v| v.as_str())
            .or_else(|| {
                header.get("c4TabbedHeaderRenderer")
                    .and_then(|c4| c4.get("avatar"))
                    .and_then(|a| a.get("thumbnails"))
                    .and_then(|t| t.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|first| first.get("url"))
                    .and_then(|v| v.as_str())
            })
            .or_else(|| {
                header.get("pageHeaderRenderer")
                    .and_then(|ph| ph.get("content"))
                    .and_then(|c| c.get("pageHeaderViewModel"))
                    .and_then(|ph| ph.get("image"))
                    .and_then(|img| img.get("decoratedAvatarViewModel"))
                    .and_then(|dav| dav.get("avatar"))
                    .and_then(|av| av.get("avatarViewModel"))
                    .and_then(|avm| avm.get("image"))
                    .and_then(|img| img.get("sources"))
                    .and_then(|s| s.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|first| first.get("url"))
                    .and_then(|v| v.as_str())
            })
            .map(normalize_youtube_image_url);

        let banner_url = header.get("c4TabbedHeaderRenderer")
            .and_then(|c4| c4.get("banner"))
            .and_then(|b| b.get("thumbnails"))
            .and_then(|t| t.as_array())
            .and_then(|arr| arr.first())
            .and_then(|first| first.get("url"))
            .and_then(|v| v.as_str())
            .or_else(|| {
                header.get("pageHeaderRenderer")
                    .and_then(|ph| ph.get("content"))
                    .and_then(|c| c.get("pageHeaderViewModel"))
                    .and_then(|ph| ph.get("banner"))
                    .and_then(|b| b.get("imageBannerViewModel"))
                    .and_then(|ib| ib.get("image"))
                    .and_then(|img| img.get("sources"))
                    .and_then(|s| s.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|first| first.get("url"))
                    .and_then(|v| v.as_str())
            })
            .map(normalize_youtube_image_url);

        let mut subscriber_count = None;
        let mut subscriber_count_text = None;

        if let Some(text) = header.get("c4TabbedHeaderRenderer")
            .and_then(|c4| c4.get("subscriberCountText"))
            .and_then(|s| s.get("simpleText"))
            .and_then(|v| v.as_str())
        {
            subscriber_count_text = Some(text.to_string());
            subscriber_count = Some(parse_mixed_number_word_to_long(text));
        } else if let Some(runs) = header.get("c4TabbedHeaderRenderer")
            .and_then(|c4| c4.get("subscriberCountText"))
            .and_then(|s| s.get("runs"))
            .and_then(|r| r.as_array())
        {
            if let Some(text) = runs.first().and_then(|r| r.get("text")).and_then(|v| v.as_str()) {
                subscriber_count_text = Some(text.to_string());
                subscriber_count = Some(parse_mixed_number_word_to_long(text));
            }
        } else if let Some(rows) = header.get("pageHeaderRenderer")
            .and_then(|ph| ph.get("content"))
            .and_then(|c| c.get("pageHeaderViewModel"))
            .and_then(|ph| ph.get("metadata"))
            .and_then(|m| m.get("contentMetadataViewModel"))
            .and_then(|cm| cm.get("metadataRows"))
            .and_then(|r| r.as_array())
        {
            for row in rows {
                if let Some(parts) = row.get("metadataParts").and_then(|p| p.as_array()) {
                    for part in parts {
                        if let Some(text) = part.get("text").and_then(|t| t.get("content")).and_then(|c| c.as_str()) {
                            if text.contains("subscriber") {
                                subscriber_count_text = Some(text.to_string());
                                subscriber_count = Some(parse_mixed_number_word_to_long(text));
                                break;
                            }
                        }
                    }
                }
            }
        }

        let mut verified = false;
        if let Some(badges) = header.get("c4TabbedHeaderRenderer")
            .and_then(|c4| c4.get("badges"))
            .and_then(|b| b.as_array())
        {
            for badge in badges {
                if let Some(style) = badge.get("metadataBadgeRenderer").and_then(|m| m.get("style")).and_then(|s| s.as_str()) {
                    if style == "BADGE_STYLE_TYPE_VERIFIED" || style == "BADGE_STYLE_TYPE_VERIFIED_ARTIST" {
                        verified = true;
                        break;
                    }
                }
            }
        }
        if !verified {
            if let Some(label) = header.get("pageHeaderRenderer")
                .and_then(|ph| ph.get("content"))
                .and_then(|c| c.get("pageHeaderViewModel"))
                .and_then(|ph| ph.get("title"))
                .and_then(|t| t.get("dynamicTextViewModel"))
                .and_then(|d| d.get("rendererContext"))
                .and_then(|rc| rc.get("accessibilityContext"))
                .and_then(|ac| ac.get("label"))
                .and_then(|v| v.as_str())
            {
                if label.contains("Verified") || label.contains("verified") {
                    verified = true;
                }
            }
        }

        Ok(ChannelDetails {
            id,
            name,
            description,
            avatar_url,
            banner_url,
            subscriber_count,
            subscriber_count_text,
            verified,
        })
    }

    pub async fn get_channel_videos(
        &self,
        channel_id: &str,
        page_token: Option<String>,
    ) -> AppResult<ChannelVideosResponse> {
        let channel_id_trimmed = channel_id.trim();
        if channel_id_trimmed.is_empty() {
            return Err(AppError::Validation("Channel ID cannot be empty".into()));
        }

        let mut payload = if let Some(ref token) = page_token {
            serde_json::json!({
                "continuation": token
            })
        } else {
            serde_json::json!({
                "browseId": channel_id_trimmed,
                "params": "EgZ2aWRlb3PyBgQKAjoA"
            })
        };

        let res = self.post_innertube("browse", "WEB", "2.20260120.01.00", &mut payload).await?;
        let (videos, next_page_token) = extract_videos_from_browse(&res);

        Ok(ChannelVideosResponse {
            channel_id: channel_id_trimmed.to_string(),
            videos,
            next_page_token,
        })
    }
}
