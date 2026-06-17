import type { StringKey } from "../i18n/index";

export type SettingValueType = "boolean" | "number" | "string" | "json";
export type SettingArea =
  | "player"
  | "content"
  | "quality"
  | "network"
  | "downloads"
  | "data"
  | "extensions";
export type SettingReadiness = "wired" | "partial" | "persisted-only" | "deferred";
export type SettingVisibility = "visible" | "disabled-until-wired" | "internal";
export type SettingExportScope = "app-data" | "private" | "internal";

export interface SettingDefinition {
  key: string;
  area: SettingArea;
  type: SettingValueType;
  defaultValue: string;
  readiness: SettingReadiness;
  visibility: SettingVisibility;
  exportScope: SettingExportScope;
  allowedValues?: readonly string[];
  min?: number;
  max?: number;
  noteKey?: StringKey;
}

export const SETTINGS = {
  AUTOPLAY_ENABLED: "autoplay_enabled",
  VIDEO_LOOP_ENABLED: "video_loop_enabled",
  SKIP_SILENCE_ENABLED: "skip_silence_enabled",
  STABLE_VOLUME_ENABLED: "stable_volume_enabled",
  ALLOW_VOLUME_BOOST: "allow_volume_boost",
  REMEMBER_PLAYBACK_SPEED: "remember_playback_speed",
  PLAYBACK_SPEED: "playback_speed",
  CUSTOM_SPEEDS_ENABLED: "custom_speeds_enabled",
  CUSTOM_SPEED_PRESETS: "custom_speed_presets",
  LONG_PRESS_PLAYBACK_SPEED: "long_press_playback_speed",
  SPEED_SLIDER_ENABLED: "speed_slider_enabled",
  DOUBLE_TAP_SEEK_SECONDS: "double_tap_seek_seconds",
  SUBTITLES_ENABLED: "subtitles_enabled",
  PREFERRED_SUBTITLE_LANGUAGE: "preferred_subtitle_language",
  SUBTITLE_FONT_SIZE: "subtitle_font_size",
  SUBTITLE_BOLD: "subtitle_bold",
  MINI_PLAYER_SHOW_SKIP_CONTROLS: "mini_player_show_skip_controls",
  MINI_PLAYER_SHOW_NEXT_PREV_CONTROLS: "mini_player_show_next_prev_controls",
  SLIDER_STYLE: "slider_style",
  SHOW_FULLSCREEN_TITLE: "show_fullscreen_title",
  ADAPTIVE_PLAYER_SIZE_ENABLED: "adaptive_player_size_enabled",
  AUTO_PIP_ENABLED: "auto_pip_enabled",
  MANUAL_PIP_BUTTON_ENABLED: "manual_pip_button_enabled",

  GRID_ITEM_SIZE: "grid_item_size",
  VIDEO_TITLE_MAX_LINES: "video_title_max_lines",
  DOWNLOAD_DIALOG_STYLE: "download_dialog_style",
  RELATED_CARD_STYLE: "related_card_style",
  HOME_FEED_ENABLED: "home_feed_enabled",
  SHOW_APP_LOGO_ICON: "show_app_logo_icon",
  SHORTS_SHELF_ENABLED: "shorts_shelf_enabled",
  HOME_SHORTS_SHELF_ENABLED: "home_shorts_shelf_enabled",
  CONTINUE_WATCHING_ENABLED: "continue_watching_enabled",
  COMMENTS_ENABLED: "comments_enabled",
  COMMENTS_PREVIEW_ENABLED: "comments_preview_enabled",
  SHOW_RELATED_VIDEOS: "show_related_videos",
  HIDE_WATCHED_VIDEOS: "hide_watched_videos",
  DISABLE_SHORTS_PLAYER: "disable_shorts_player",
  VIDEO_CARD_ACTIONS_ENABLED: "video_card_actions_enabled",
  VIDEO_CARD_MARK_WATCHED_ENABLED: "video_card_mark_watched_enabled",
  SHORTS_NAVIGATION_ENABLED: "shorts_navigation_enabled",
  MUSIC_NAVIGATION_ENABLED: "music_navigation_enabled",
  SEARCH_NAV_TAB_ENABLED: "search_nav_tab_enabled",
  CATEGORIES_NAV_TAB_ENABLED: "categories_nav_tab_enabled",
  SUBSCRIPTION_REFRESH_ON_STARTUP: "subscription_refresh_on_startup",
  SUBSCRIPTION_SHOW_VIDEOS: "subscription_show_videos",
  SUBSCRIPTION_SHOW_SHORTS: "subscription_show_shorts",
  SUBSCRIPTION_SHOW_LIVE: "subscription_show_live",
  SHOW_REGION_PICKER_IN_EXPLORE: "show_region_picker_in_explore",
  TRENDING_REGION: "trending_region",

  DEFAULT_QUALITY_WIFI: "default_quality_wifi",
  DEFAULT_VIDEO_CODEC: "default_video_codec",
  SHORTS_QUALITY_WIFI: "shorts_quality_wifi",
  MUSIC_AUDIO_QUALITY: "music_audio_quality",
  PREFERRED_AUDIO_LANGUAGE: "preferred_audio_language",

  BUFFER_PROFILE: "buffer_profile",
  MIN_BUFFER_MS: "min_buffer_ms",
  MAX_BUFFER_MS: "max_buffer_ms",
  BUFFER_FOR_PLAYBACK_MS: "buffer_for_playback_ms",
  BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS: "buffer_for_playback_after_rebuffer_ms",
  MEDIA_CACHE_SIZE_MB: "media_cache_size_mb",
  PROXY_ENABLED: "proxy_enabled",
  PROXY_TYPE: "proxy_type",
  PROXY_HOST: "proxy_host",
  PROXY_PORT: "proxy_port",
  PROXY_USERNAME: "proxy_username",
  PROXY_PASSWORD: "proxy_password",

  DEFAULT_DOWNLOAD_QUALITY: "default_download_quality",
  PARALLEL_DOWNLOAD_ENABLED: "parallel_download_enabled",
  DOWNLOAD_THREADS: "download_threads",
  DOWNLOAD_LOCATION: "download_location",
  MUSIC_DOWNLOAD_LOCATION: "music_download_location",

  AUTO_BACKUP_FREQUENCY: "auto_backup_frequency",
  AUTO_BACKUP_TYPE: "auto_backup_type",

  SPONSORBLOCK_ENABLED: "sponsorblock_enabled",
  DEARROW_ENABLED: "dearrow_enabled",
  DEARROW_BADGE_ENABLED: "dearrow_badge_enabled",
  RYTD_ENABLED: "rytd_enabled",
  SB_SUBMIT_ENABLED: "sb_submit_enabled",
  SPONSORBLOCK_USER_ID: "sponsorblock_user_id",
  SPONSORBLOCK_SERVER: "sponsorblock_server",
  SPONSORBLOCK_COLORS: "sponsorblock_colors",
  SPONSORBLOCK_CATEGORIES: "sponsorblock_categories",
  SPONSORBLOCK_SAVED_MINUTES: "sponsorblock_saved_minutes",
  SPONSORBLOCK_SAVED_SECONDS: "sponsorblock_saved_seconds",
  SPONSORBLOCK_SKIPPED_SEGMENTS: "sponsorblock_skipped_segments",
} as const;

export type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS];

const bool = (
  key: SettingKey,
  area: SettingArea,
  defaultValue: boolean,
  readiness: SettingReadiness,
  visibility: SettingVisibility = "visible",
  noteKey?: StringKey,
): SettingDefinition => ({
  key,
  area,
  type: "boolean",
  defaultValue: String(defaultValue),
  readiness,
  visibility,
  exportScope: visibility === "internal" ? "internal" : "app-data",
  noteKey,
});

const str = (
  key: SettingKey,
  area: SettingArea,
  defaultValue: string,
  readiness: SettingReadiness,
  allowedValues?: readonly string[],
  visibility: SettingVisibility = "visible",
  exportScope: SettingExportScope = "app-data",
  noteKey?: StringKey,
): SettingDefinition => ({
  key,
  area,
  type: "string",
  defaultValue,
  readiness,
  visibility,
  exportScope,
  allowedValues,
  noteKey,
});

const num = (
  key: SettingKey,
  area: SettingArea,
  defaultValue: number,
  readiness: SettingReadiness,
  min?: number,
  max?: number,
  visibility: SettingVisibility = "visible",
  noteKey?: StringKey,
): SettingDefinition => ({
  key,
  area,
  type: "number",
  defaultValue: String(defaultValue),
  readiness,
  visibility,
  exportScope: visibility === "internal" ? "internal" : "app-data",
  min,
  max,
  noteKey,
});

const json = (
  key: SettingKey,
  area: SettingArea,
  defaultValue: string,
  readiness: SettingReadiness,
  visibility: SettingVisibility = "visible",
  exportScope: SettingExportScope = "app-data",
  noteKey?: StringKey,
): SettingDefinition => ({
  key,
  area,
  type: "json",
  defaultValue,
  readiness,
  visibility,
  exportScope,
  noteKey,
});

const SPEED_VALUES = ["0.25", "0.5", "0.75", "1.0", "1.25", "1.5", "1.75", "2.0"] as const;
const QUALITY_VALUES = ["Auto", "2160p", "1440p", "1080p", "720p", "480p", "360p", "240p", "144p"] as const;

export const SETTING_DEFINITIONS = [
  bool(SETTINGS.AUTOPLAY_ENABLED, "player", true, "persisted-only"),
  bool(SETTINGS.VIDEO_LOOP_ENABLED, "player", false, "persisted-only"),
  bool(SETTINGS.SKIP_SILENCE_ENABLED, "player", false, "deferred", "disabled-until-wired", "settings_note_skip_silence_requires_audio_analysis"),
  bool(SETTINGS.STABLE_VOLUME_ENABLED, "player", false, "deferred", "disabled-until-wired", "settings_note_stable_volume_requires_audio_pipeline"),
  bool(SETTINGS.ALLOW_VOLUME_BOOST, "player", false, "deferred", "disabled-until-wired", "settings_note_volume_boost_requires_audio_gain"),
  bool(SETTINGS.REMEMBER_PLAYBACK_SPEED, "player", false, "persisted-only"),
  str(SETTINGS.PLAYBACK_SPEED, "player", "1.0", "persisted-only", SPEED_VALUES),
  bool(SETTINGS.CUSTOM_SPEEDS_ENABLED, "player", false, "persisted-only"),
  str(SETTINGS.CUSTOM_SPEED_PRESETS, "player", "", "persisted-only"),
  str(SETTINGS.LONG_PRESS_PLAYBACK_SPEED, "player", "2.0", "persisted-only", ["1.5", "2.0", "2.5", "3.0", "4.0"]),
  bool(SETTINGS.SPEED_SLIDER_ENABLED, "player", false, "persisted-only"),
  num(SETTINGS.DOUBLE_TAP_SEEK_SECONDS, "player", 10, "persisted-only", 5, 30),
  bool(SETTINGS.SUBTITLES_ENABLED, "player", false, "persisted-only"),
  str(SETTINGS.PREFERRED_SUBTITLE_LANGUAGE, "player", "en", "persisted-only"),
  str(SETTINGS.SUBTITLE_FONT_SIZE, "player", "14", "persisted-only", ["10", "12", "14", "16", "18", "20", "24"]),
  bool(SETTINGS.SUBTITLE_BOLD, "player", true, "persisted-only"),
  bool(SETTINGS.MINI_PLAYER_SHOW_SKIP_CONTROLS, "player", false, "deferred", "disabled-until-wired", "settings_note_no_video_mini_player"),
  bool(SETTINGS.MINI_PLAYER_SHOW_NEXT_PREV_CONTROLS, "player", false, "deferred", "disabled-until-wired", "settings_note_no_video_mini_player"),
  str(SETTINGS.SLIDER_STYLE, "player", "DEFAULT", "persisted-only", ["DEFAULT", "METROLIST", "METROLIST_SLIM", "SQUIGGLY", "SLIM"]),
  bool(SETTINGS.SHOW_FULLSCREEN_TITLE, "player", false, "persisted-only"),
  bool(SETTINGS.ADAPTIVE_PLAYER_SIZE_ENABLED, "player", true, "persisted-only"),
  bool(SETTINGS.AUTO_PIP_ENABLED, "player", false, "persisted-only"),
  bool(SETTINGS.MANUAL_PIP_BUTTON_ENABLED, "player", true, "persisted-only"),

  str(SETTINGS.GRID_ITEM_SIZE, "content", "BIG", "persisted-only", ["BIG", "SMALL"]),
  num(SETTINGS.VIDEO_TITLE_MAX_LINES, "content", 1, "persisted-only", 0, 3),
  str(SETTINGS.DOWNLOAD_DIALOG_STYLE, "content", "FULL", "deferred", ["FULL", "COMPACT"], "disabled-until-wired", "app-data", "settings_note_download_modal_required"),
  str(SETTINGS.RELATED_CARD_STYLE, "content", "FULL_WIDTH", "persisted-only", ["FULL_WIDTH", "COMPACT"]),
  bool(SETTINGS.HOME_FEED_ENABLED, "content", true, "persisted-only"),
  bool(SETTINGS.SHOW_APP_LOGO_ICON, "content", true, "persisted-only"),
  bool(SETTINGS.SHORTS_SHELF_ENABLED, "content", true, "persisted-only"),
  bool(SETTINGS.HOME_SHORTS_SHELF_ENABLED, "content", true, "persisted-only"),
  bool(SETTINGS.CONTINUE_WATCHING_ENABLED, "content", true, "persisted-only"),
  bool(SETTINGS.COMMENTS_ENABLED, "content", true, "persisted-only"),
  bool(SETTINGS.COMMENTS_PREVIEW_ENABLED, "content", true, "deferred", "disabled-until-wired", "settings_note_comment_preview_target_missing"),
  bool(SETTINGS.SHOW_RELATED_VIDEOS, "content", true, "persisted-only"),
  bool(SETTINGS.HIDE_WATCHED_VIDEOS, "content", false, "persisted-only"),
  bool(SETTINGS.DISABLE_SHORTS_PLAYER, "content", false, "persisted-only"),
  bool(SETTINGS.VIDEO_CARD_ACTIONS_ENABLED, "content", false, "persisted-only"),
  bool(SETTINGS.VIDEO_CARD_MARK_WATCHED_ENABLED, "content", false, "persisted-only"),
  bool(SETTINGS.SHORTS_NAVIGATION_ENABLED, "content", true, "persisted-only"),
  bool(SETTINGS.MUSIC_NAVIGATION_ENABLED, "content", true, "persisted-only"),
  bool(SETTINGS.SEARCH_NAV_TAB_ENABLED, "content", false, "persisted-only"),
  bool(SETTINGS.CATEGORIES_NAV_TAB_ENABLED, "content", false, "deferred", "disabled-until-wired", "settings_note_categories_route_missing"),
  bool(SETTINGS.SUBSCRIPTION_REFRESH_ON_STARTUP, "content", false, "persisted-only"),
  bool(SETTINGS.SUBSCRIPTION_SHOW_VIDEOS, "content", true, "persisted-only"),
  bool(SETTINGS.SUBSCRIPTION_SHOW_SHORTS, "content", true, "persisted-only"),
  bool(SETTINGS.SUBSCRIPTION_SHOW_LIVE, "content", true, "persisted-only"),
  bool(SETTINGS.SHOW_REGION_PICKER_IN_EXPLORE, "content", true, "deferred", "disabled-until-wired", "settings_note_explore_target_needs_confirmation"),
  str(SETTINGS.TRENDING_REGION, "content", "US", "persisted-only"),

  str(SETTINGS.DEFAULT_QUALITY_WIFI, "quality", "1080p", "persisted-only", QUALITY_VALUES),
  str(SETTINGS.DEFAULT_VIDEO_CODEC, "quality", "H.264", "persisted-only", ["Auto", "H.264", "VP9", "AV1"]),
  str(SETTINGS.SHORTS_QUALITY_WIFI, "quality", "720p", "deferred", QUALITY_VALUES, "disabled-until-wired", "app-data", "settings_note_shorts_playback_path_missing"),
  str(SETTINGS.MUSIC_AUDIO_QUALITY, "quality", "Auto", "persisted-only", ["Auto", "High", "Medium", "Low"]),
  str(SETTINGS.PREFERRED_AUDIO_LANGUAGE, "quality", "original", "persisted-only"),

  str(SETTINGS.BUFFER_PROFILE, "network", "STABLE", "persisted-only", ["AGGRESSIVE", "STABLE", "DATASAVER", "CUSTOM"]),
  num(SETTINGS.MIN_BUFFER_MS, "network", 30000, "persisted-only", 5000, 120000),
  num(SETTINGS.MAX_BUFFER_MS, "network", 50000, "persisted-only", 25000, 120000),
  num(SETTINGS.BUFFER_FOR_PLAYBACK_MS, "network", 2500, "persisted-only", 500, 5000),
  num(SETTINGS.BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS, "network", 5000, "persisted-only", 2500, 10000),
  num(SETTINGS.MEDIA_CACHE_SIZE_MB, "network", 500, "deferred", 0, 2000, "disabled-until-wired", "settings_note_media_cache_accounting_missing"),
  bool(SETTINGS.PROXY_ENABLED, "network", false, "persisted-only"),
  str(SETTINGS.PROXY_TYPE, "network", "http", "persisted-only", ["http", "socks5", "socks4"]),
  str(SETTINGS.PROXY_HOST, "network", "", "persisted-only"),
  str(SETTINGS.PROXY_PORT, "network", "8080", "persisted-only"),
  str(SETTINGS.PROXY_USERNAME, "network", "", "persisted-only", undefined, "visible", "private"),
  str(SETTINGS.PROXY_PASSWORD, "network", "", "persisted-only", undefined, "visible", "private"),

  str(SETTINGS.DEFAULT_DOWNLOAD_QUALITY, "downloads", "720p", "deferred", QUALITY_VALUES, "disabled-until-wired", "app-data", "settings_note_download_manager_missing"),
  bool(SETTINGS.PARALLEL_DOWNLOAD_ENABLED, "downloads", true, "deferred", "disabled-until-wired", "settings_note_download_manager_missing"),
  num(SETTINGS.DOWNLOAD_THREADS, "downloads", 3, "deferred", 1, 8, "disabled-until-wired", "settings_note_download_manager_missing"),
  str(SETTINGS.DOWNLOAD_LOCATION, "downloads", "", "deferred", undefined, "disabled-until-wired", "app-data", "settings_note_download_manager_missing"),
  str(SETTINGS.MUSIC_DOWNLOAD_LOCATION, "downloads", "", "deferred", undefined, "disabled-until-wired", "app-data", "settings_note_download_manager_missing"),

  str(SETTINGS.AUTO_BACKUP_FREQUENCY, "data", "NONE", "persisted-only", ["NONE", "DAILY", "WEEKLY", "MONTHLY"]),
  str(SETTINGS.AUTO_BACKUP_TYPE, "data", "APP_DATA", "persisted-only", ["APP_DATA", "BRAIN", "MASTER"]),

  bool(SETTINGS.SPONSORBLOCK_ENABLED, "extensions", true, "partial"),
  bool(SETTINGS.DEARROW_ENABLED, "extensions", true, "partial"),
  bool(SETTINGS.DEARROW_BADGE_ENABLED, "extensions", true, "partial"),
  bool(SETTINGS.RYTD_ENABLED, "extensions", true, "partial"),
  bool(SETTINGS.SB_SUBMIT_ENABLED, "extensions", false, "persisted-only"),
  str(SETTINGS.SPONSORBLOCK_USER_ID, "extensions", "", "persisted-only", undefined, "visible", "private"),
  str(SETTINGS.SPONSORBLOCK_SERVER, "extensions", "https://sponsor.ajay.app", "partial"),
  json(SETTINGS.SPONSORBLOCK_COLORS, "extensions", "{}", "partial"),
  json(SETTINGS.SPONSORBLOCK_CATEGORIES, "extensions", "{}", "partial"),
  num(SETTINGS.SPONSORBLOCK_SAVED_MINUTES, "extensions", 0, "partial", 0, undefined, "internal"),
  num(SETTINGS.SPONSORBLOCK_SAVED_SECONDS, "extensions", 0, "partial", 0, undefined, "internal"),
  num(SETTINGS.SPONSORBLOCK_SKIPPED_SEGMENTS, "extensions", 0, "partial", 0, undefined, "internal"),
] as const satisfies readonly SettingDefinition[];

export const SETTING_DEFINITIONS_BY_KEY: ReadonlyMap<SettingKey, SettingDefinition> = new Map(
  SETTING_DEFINITIONS.map((definition) => [definition.key as SettingKey, definition]),
);

export const SETTING_EXPORT_KEYS = SETTING_DEFINITIONS
  .filter((definition) => definition.exportScope === "app-data")
  .map((definition) => definition.key);
