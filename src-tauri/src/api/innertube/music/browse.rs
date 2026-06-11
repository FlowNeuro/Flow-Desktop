//! Browse-surface extractors: home, explore, charts, moods & genres, new
//! releases, and mood/genre detail. All anonymous, all `WEB_REMIX` via
//! [`InnertubeClient::music_browse`].

use serde_json::Value;

use super::endpoints;
use super::parse::endpoint::{browse_id, browse_params};
use super::parse::runs::runs_text;
use super::parse::{continuation, shelves};
use crate::api::innertube::InnertubeClient;
use crate::errors::AppResult;
use crate::models::music::{
    AlbumItem, ChartSection, ChartsPage, ExplorePage, MoodAndGenreItem, YTItem,
};
use crate::models::music_pages::{MoodGenrePage, MusicHomePage, MusicShelf};

impl InnertubeClient {
    /// Typed music home (carousels + chips), with continuation paging.
    pub(crate) async fn music_home_page(
        &self,
        continuation_token: Option<&str>,
    ) -> AppResult<MusicHomePage> {
        let visitor = self.music_visitor_data().await;
        let res = if let Some(c) = continuation_token {
            self.music_browse(None, None, Some(c), visitor.as_deref()).await?
        } else {
            self.music_browse(Some(endpoints::BROWSE_HOME), None, None, visitor.as_deref())
                .await?
        };

        let chips = shelves::parse_chips(&res);
        let mut sections: Vec<MusicShelf> = Vec::new();

        for section in shelves::section_list_contents(&res) {
            if let Some(shelf) = shelves::parse_section(&section) {
                sections.push(shelf);
            }
        }
        if let Some(arr) = res["continuationContents"]["sectionListContinuation"]["contents"]
            .as_array()
        {
            for section in arr {
                if let Some(shelf) = shelves::parse_section(section) {
                    sections.push(shelf);
                }
            }
        }

        let next = continuation::from_continuations(
            &res["contents"]["singleColumnBrowseResultsRenderer"]["tabs"][0]["tabRenderer"]
                ["content"]["sectionListRenderer"],
        )
        .or_else(|| {
            continuation::from_continuations(
                &res["continuationContents"]["sectionListContinuation"],
            )
        })
        .or_else(|| continuation::from_continuations(&res["contents"]["sectionListRenderer"]));

        Ok(MusicHomePage {
            chips,
            sections,
            continuation: next,
        })
    }

    /// Explore page = new-release albums + moods/genres (each its own browse).
    pub(crate) async fn music_explore_page(&self) -> AppResult<ExplorePage> {
        let new_release_albums = self.music_new_releases().await.unwrap_or_default();
        let mood_and_genres = self.music_moods().await.unwrap_or_default();
        Ok(ExplorePage {
            new_release_albums,
            mood_and_genres,
        })
    }

    /// New-release albums grid.
    pub(crate) async fn music_new_releases(&self) -> AppResult<Vec<AlbumItem>> {
        let visitor = self.music_visitor_data().await;
        let res = self
            .music_browse(Some(endpoints::BROWSE_NEW_RELEASES), None, None, visitor.as_deref())
            .await?;
        let mut albums = Vec::new();
        for section in shelves::section_list_contents(&res) {
            if let Some(shelf) = shelves::parse_section(&section) {
                for item in shelf.items {
                    if let YTItem::Album(a) = item {
                        albums.push(a);
                    }
                }
            }
        }
        Ok(albums)
    }

    /// Mood & genre navigation buttons.
    pub(crate) async fn music_moods(&self) -> AppResult<Vec<MoodAndGenreItem>> {
        let visitor = self.music_visitor_data().await;
        let res = self
            .music_browse(Some(endpoints::BROWSE_MOODS), None, None, visitor.as_deref())
            .await?;
        let mut moods = Vec::new();
        for section in shelves::section_list_contents(&res) {
            let buttons = section["gridRenderer"]["items"]
                .as_array()
                .or_else(|| section["musicCarouselShelfRenderer"]["contents"].as_array());
            if let Some(buttons) = buttons {
                for btn in buttons {
                    if let Some(m) = parse_mood_button(btn) {
                        moods.push(m);
                    }
                }
            }
        }
        Ok(moods)
    }

    /// Browse into a mood/genre (grid of playlists), with paging.
    pub(crate) async fn music_mood_genre(
        &self,
        browse_id_str: &str,
        params: Option<&str>,
        continuation_token: Option<&str>,
    ) -> AppResult<MoodGenrePage> {
        let visitor = self.music_visitor_data().await;
        let res = if let Some(c) = continuation_token {
            self.music_browse(None, None, Some(c), visitor.as_deref()).await?
        } else {
            self.music_browse(Some(browse_id_str), params, None, visitor.as_deref())
                .await?
        };

        let title = runs_text(&res["header"]["musicHeaderRenderer"]["title"]).unwrap_or_default();
        let mut items: Vec<YTItem> = Vec::new();
        for section in shelves::section_list_contents(&res) {
            if let Some(shelf) = shelves::parse_section(&section) {
                items.extend(shelf.items);
            }
        }
        let next = continuation::from_continuations(&res["contents"]["sectionListRenderer"])
            .or_else(|| {
                continuation::from_continuations(
                    &res["continuationContents"]["sectionListContinuation"],
                )
            });

        Ok(MoodGenrePage {
            title,
            items,
            continuation: next,
        })
    }

    /// Music charts (trending / top / genres), with paging.
    pub(crate) async fn music_charts_page(
        &self,
        continuation_token: Option<&str>,
    ) -> AppResult<ChartsPage> {
        let visitor = self.music_visitor_data().await;
        let res = if let Some(c) = continuation_token {
            self.music_browse(None, None, Some(c), visitor.as_deref()).await?
        } else {
            self.music_browse(
                Some(endpoints::BROWSE_CHARTS),
                Some(endpoints::CHARTS_PARAMS),
                None,
                visitor.as_deref(),
            )
            .await?
        };

        let mut sections: Vec<ChartSection> = Vec::new();
        for section in shelves::section_list_contents(&res) {
            if let Some(shelf) = shelves::parse_section(&section) {
                if shelf.items.is_empty() {
                    continue;
                }
                sections.push(ChartSection {
                    chart_type: determine_chart_type(&shelf, &section),
                    title: shelf.title,
                    items: shelf.items,
                });
            }
        }

        let next = continuation::from_continuations(&res["contents"]["sectionListRenderer"])
            .or_else(|| {
                continuation::from_continuations(
                    &res["continuationContents"]["sectionListContinuation"],
                )
            });

        Ok(ChartsPage {
            sections,
            continuation: next,
        })
    }
}

fn parse_mood_button(btn: &Value) -> Option<MoodAndGenreItem> {
    let r = &btn["musicNavigationButtonRenderer"];
    let title = runs_text(&r["buttonText"])?;
    let stripe_color = r["solid"]["leftStripeColor"].as_u64().unwrap_or(0);
    let nav = &r["clickCommand"];
    let browse = browse_id(nav)?;
    Some(MoodAndGenreItem {
        title,
        stripe_color,
        browse_id: browse,
        params: browse_params(nav),
    })
}

fn determine_chart_type(shelf: &MusicShelf, section: &Value) -> String {
    if section.get("gridRenderer").is_some() {
        return "NewReleases".to_string();
    }
    let lower = shelf.title.to_ascii_lowercase();
    if lower.contains("trend") {
        "Trending".to_string()
    } else if lower.contains("top") {
        "Top".to_string()
    } else {
        "Genre".to_string()
    }
}
