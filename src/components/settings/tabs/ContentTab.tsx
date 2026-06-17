import { SettingsGroup } from '../SettingsGroup';
import { SettingItem } from '../SettingItem';
import { ToggleSwitch } from '../../ui/ToggleSwitch';
import { Select } from '../../ui/Select';
import { useBoolPref, usePreference, useNumberPref } from '../../../lib/usePreference';
import { getString } from '../../../lib/i18n/index';
import { SETTINGS } from '../../../lib/settings/schema';
import { isSettingDisabledUntilWired } from '../../../lib/settings/values';

const REGION_OPTIONS = [
  { value: 'DZ', label: 'Algeria' }, { value: 'AR', label: 'Argentina' }, { value: 'AU', label: 'Australia' },
  { value: 'AT', label: 'Austria' }, { value: 'AZ', label: 'Azerbaijan' }, { value: 'BH', label: 'Bahrain' },
  { value: 'BD', label: 'Bangladesh' }, { value: 'BY', label: 'Belarus' }, { value: 'BE', label: 'Belgium' },
  { value: 'BO', label: 'Bolivia' }, { value: 'BA', label: 'Bosnia and Herzegovina' }, { value: 'BR', label: 'Brazil' },
  { value: 'BG', label: 'Bulgaria' }, { value: 'CA', label: 'Canada' }, { value: 'CL', label: 'Chile' },
  { value: 'CO', label: 'Colombia' }, { value: 'CR', label: 'Costa Rica' }, { value: 'HR', label: 'Croatia' },
  { value: 'CY', label: 'Cyprus' }, { value: 'CZ', label: 'Czechia' }, { value: 'DK', label: 'Denmark' },
  { value: 'DO', label: 'Dominican Republic' }, { value: 'EC', label: 'Ecuador' }, { value: 'EG', label: 'Egypt' },
  { value: 'SV', label: 'El Salvador' }, { value: 'EE', label: 'Estonia' }, { value: 'FI', label: 'Finland' },
  { value: 'FR', label: 'France' }, { value: 'GE', label: 'Georgia' }, { value: 'DE', label: 'Germany' },
  { value: 'GH', label: 'Ghana' }, { value: 'GR', label: 'Greece' }, { value: 'GT', label: 'Guatemala' },
  { value: 'HN', label: 'Honduras' }, { value: 'HK', label: 'Hong Kong' }, { value: 'HU', label: 'Hungary' },
  { value: 'IS', label: 'Iceland' }, { value: 'IN', label: 'India' }, { value: 'ID', label: 'Indonesia' },
  { value: 'IQ', label: 'Iraq' }, { value: 'IE', label: 'Ireland' }, { value: 'IL', label: 'Israel' },
  { value: 'IT', label: 'Italy' }, { value: 'JM', label: 'Jamaica' }, { value: 'JP', label: 'Japan' },
  { value: 'JO', label: 'Jordan' }, { value: 'KZ', label: 'Kazakhstan' }, { value: 'KE', label: 'Kenya' },
  { value: 'KW', label: 'Kuwait' }, { value: 'LV', label: 'Latvia' }, { value: 'LB', label: 'Lebanon' },
  { value: 'LY', label: 'Libya' }, { value: 'LI', label: 'Liechtenstein' }, { value: 'LT', label: 'Lithuania' },
  { value: 'LU', label: 'Luxembourg' }, { value: 'MY', label: 'Malaysia' }, { value: 'MT', label: 'Malta' },
  { value: 'MX', label: 'Mexico' }, { value: 'ME', label: 'Montenegro' }, { value: 'MA', label: 'Morocco' },
  { value: 'NP', label: 'Nepal' }, { value: 'NL', label: 'Netherlands' }, { value: 'NZ', label: 'New Zealand' },
  { value: 'NI', label: 'Nicaragua' }, { value: 'NG', label: 'Nigeria' }, { value: 'MK', label: 'North Macedonia' },
  { value: 'NO', label: 'Norway' }, { value: 'OM', label: 'Oman' }, { value: 'PK', label: 'Pakistan' },
  { value: 'PA', label: 'Panama' }, { value: 'PG', label: 'Papua New Guinea' }, { value: 'PY', label: 'Paraguay' },
  { value: 'PE', label: 'Peru' }, { value: 'PH', label: 'Philippines' }, { value: 'PL', label: 'Poland' },
  { value: 'PT', label: 'Portugal' }, { value: 'PR', label: 'Puerto Rico' }, { value: 'QA', label: 'Qatar' },
  { value: 'RO', label: 'Romania' }, { value: 'RU', label: 'Russia' }, { value: 'SA', label: 'Saudi Arabia' },
  { value: 'SN', label: 'Senegal' }, { value: 'RS', label: 'Serbia' }, { value: 'SG', label: 'Singapore' },
  { value: 'SK', label: 'Slovakia' }, { value: 'SI', label: 'Slovenia' }, { value: 'ZA', label: 'South Africa' },
  { value: 'KR', label: 'South Korea' }, { value: 'ES', label: 'Spain' }, { value: 'LK', label: 'Sri Lanka' },
  { value: 'SE', label: 'Sweden' }, { value: 'CH', label: 'Switzerland' }, { value: 'TW', label: 'Taiwan' },
  { value: 'TZ', label: 'Tanzania' }, { value: 'TH', label: 'Thailand' }, { value: 'TN', label: 'Tunisia' },
  { value: 'TR', label: 'Turkey' }, { value: 'UG', label: 'Uganda' }, { value: 'UA', label: 'Ukraine' },
  { value: 'AE', label: 'United Arab Emirates' }, { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' }, { value: 'UY', label: 'Uruguay' }, { value: 'VE', label: 'Venezuela' },
  { value: 'VN', label: 'Vietnam' }, { value: 'YE', label: 'Yemen' }, { value: 'ZW', label: 'Zimbabwe' },
];

export function ContentTab() {
  const [titleMaxLines, setTitleMaxLines] = useNumberPref(SETTINGS.VIDEO_TITLE_MAX_LINES, 1);
  const [downloadDialogStyle, setDownloadDialogStyle] = usePreference(SETTINGS.DOWNLOAD_DIALOG_STYLE, 'FULL');
  const [homeFeed, setHomeFeed] = useBoolPref(SETTINGS.HOME_FEED_ENABLED, true);
  const [appLogo, setAppLogo] = useBoolPref(SETTINGS.SHOW_APP_LOGO_ICON, true);
  const [shortsShelf, setShortsShelf] = useBoolPref(SETTINGS.SHORTS_SHELF_ENABLED, true);
  const [homeShortsShelf, setHomeShortsShelf] = useBoolPref(SETTINGS.HOME_SHORTS_SHELF_ENABLED, true);
  const [continueWatching, setContinueWatching] = useBoolPref(SETTINGS.CONTINUE_WATCHING_ENABLED, true);
  const [comments, setComments] = useBoolPref(SETTINGS.COMMENTS_ENABLED, true);
  const [relatedVideos, setRelatedVideos] = useBoolPref(SETTINGS.SHOW_RELATED_VIDEOS, true);
  const [hideWatched, setHideWatched] = useBoolPref(SETTINGS.HIDE_WATCHED_VIDEOS, false);
  const [disableShorts, setDisableShorts] = useBoolPref(SETTINGS.DISABLE_SHORTS_PLAYER, false);
  const [shortsNav, setShortsNav] = useBoolPref(SETTINGS.SHORTS_NAVIGATION_ENABLED, true);
  const [musicNav, setMusicNav] = useBoolPref(SETTINGS.MUSIC_NAVIGATION_ENABLED, true);
  const [categoriesTab, setCategoriesTab] = useBoolPref(SETTINGS.CATEGORIES_NAV_TAB_ENABLED, false);
  const [subsRefresh, setSubsRefresh] = useBoolPref(SETTINGS.SUBSCRIPTION_REFRESH_ON_STARTUP, false);
  const [subsShowVideos, setSubsShowVideos] = useBoolPref(SETTINGS.SUBSCRIPTION_SHOW_VIDEOS, true);
  const [subsShowShorts, setSubsShowShorts] = useBoolPref(SETTINGS.SUBSCRIPTION_SHOW_SHORTS, true);
  const [subsShowLive, setSubsShowLive] = useBoolPref(SETTINGS.SUBSCRIPTION_SHOW_LIVE, true);
  const [regionPicker, setRegionPicker] = useBoolPref(SETTINGS.SHOW_REGION_PICKER_IN_EXPLORE, true);
  const [trendingRegion, setTrendingRegion] = usePreference(SETTINGS.TRENDING_REGION, 'US');

  return (
    <div className="space-y-6 pb-8">
      <SettingsGroup title={getString('settings_group_layout')}>
        <SettingItem title={getString('settings_video_title_lines')} description={getString('settings_video_title_lines_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.VIDEO_TITLE_MAX_LINES)}>
          <Select value={String(titleMaxLines)} onChange={(v) => setTitleMaxLines(Number(v))} disabled={isSettingDisabledUntilWired(SETTINGS.VIDEO_TITLE_MAX_LINES)} options={[
            { value: '0', label: getString('settings_option_unlimited') }, { value: '1', label: getString('settings_option_one_line') }, { value: '2', label: getString('settings_option_two_lines') }, { value: '3', label: getString('settings_option_three_lines') },
          ]} />
        </SettingItem>
        <SettingItem title={getString('settings_download_dialog')} description={getString('settings_download_dialog_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.DOWNLOAD_DIALOG_STYLE)}>
          <Select value={downloadDialogStyle} onChange={setDownloadDialogStyle} disabled={isSettingDisabledUntilWired(SETTINGS.DOWNLOAD_DIALOG_STYLE)} options={[{ value: 'FULL', label: getString('settings_option_full') }, { value: 'COMPACT', label: getString('settings_option_compact') }]} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_feed')}>
        <SettingItem title={getString('settings_home_feed')} description={getString('settings_home_feed_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.HOME_FEED_ENABLED)}><ToggleSwitch checked={homeFeed} onChange={setHomeFeed} disabled={isSettingDisabledUntilWired(SETTINGS.HOME_FEED_ENABLED)} /></SettingItem>
        <SettingItem title={getString('settings_app_logo')} description={getString('settings_app_logo_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.SHOW_APP_LOGO_ICON)}><ToggleSwitch checked={appLogo} onChange={setAppLogo} disabled={isSettingDisabledUntilWired(SETTINGS.SHOW_APP_LOGO_ICON)} /></SettingItem>
        <SettingItem title={getString('settings_shorts_shelf')} description={getString('settings_shorts_shelf_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.SHORTS_SHELF_ENABLED)}><ToggleSwitch checked={shortsShelf} onChange={setShortsShelf} disabled={isSettingDisabledUntilWired(SETTINGS.SHORTS_SHELF_ENABLED)} /></SettingItem>
        <SettingItem title={getString('settings_home_shorts_shelf')} description={getString('settings_home_shorts_shelf_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.HOME_SHORTS_SHELF_ENABLED)}><ToggleSwitch checked={homeShortsShelf} onChange={setHomeShortsShelf} disabled={isSettingDisabledUntilWired(SETTINGS.HOME_SHORTS_SHELF_ENABLED)} /></SettingItem>
        <SettingItem title={getString('settings_continue_watching')} description={getString('settings_continue_watching_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.CONTINUE_WATCHING_ENABLED)}><ToggleSwitch checked={continueWatching} onChange={setContinueWatching} disabled={isSettingDisabledUntilWired(SETTINGS.CONTINUE_WATCHING_ENABLED)} /></SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_content')}>
        <SettingItem title={getString('settings_comments')} description={getString('settings_comments_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.COMMENTS_ENABLED)}><ToggleSwitch checked={comments} onChange={setComments} disabled={isSettingDisabledUntilWired(SETTINGS.COMMENTS_ENABLED)} /></SettingItem>
        <SettingItem title={getString('settings_related_videos')} description={getString('settings_related_videos_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.SHOW_RELATED_VIDEOS)}><ToggleSwitch checked={relatedVideos} onChange={setRelatedVideos} disabled={isSettingDisabledUntilWired(SETTINGS.SHOW_RELATED_VIDEOS)} /></SettingItem>
        <SettingItem title={getString('settings_hide_watched')} description={getString('settings_hide_watched_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.HIDE_WATCHED_VIDEOS)}><ToggleSwitch checked={hideWatched} onChange={setHideWatched} disabled={isSettingDisabledUntilWired(SETTINGS.HIDE_WATCHED_VIDEOS)} /></SettingItem>
        <SettingItem title={getString('settings_disable_shorts_player')} description={getString('settings_disable_shorts_player_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.DISABLE_SHORTS_PLAYER)}><ToggleSwitch checked={disableShorts} onChange={setDisableShorts} disabled={isSettingDisabledUntilWired(SETTINGS.DISABLE_SHORTS_PLAYER)} /></SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_nav_tabs')}>
        <SettingItem title={getString('settings_shorts_tab')} disabled={isSettingDisabledUntilWired(SETTINGS.SHORTS_NAVIGATION_ENABLED)}><ToggleSwitch checked={shortsNav} onChange={setShortsNav} disabled={isSettingDisabledUntilWired(SETTINGS.SHORTS_NAVIGATION_ENABLED)} /></SettingItem>
        <SettingItem title={getString('settings_music_tab')} disabled={isSettingDisabledUntilWired(SETTINGS.MUSIC_NAVIGATION_ENABLED)}><ToggleSwitch checked={musicNav} onChange={setMusicNav} disabled={isSettingDisabledUntilWired(SETTINGS.MUSIC_NAVIGATION_ENABLED)} /></SettingItem>
        <SettingItem title={getString('settings_categories_tab')} description={getString('settings_categories_tab_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.CATEGORIES_NAV_TAB_ENABLED)}><ToggleSwitch checked={categoriesTab} onChange={setCategoriesTab} disabled={isSettingDisabledUntilWired(SETTINGS.CATEGORIES_NAV_TAB_ENABLED)} /></SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_subscriptions')}>
        <SettingItem title={getString('settings_refresh_startup')} description={getString('settings_refresh_startup_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.SUBSCRIPTION_REFRESH_ON_STARTUP)}><ToggleSwitch checked={subsRefresh} onChange={setSubsRefresh} disabled={isSettingDisabledUntilWired(SETTINGS.SUBSCRIPTION_REFRESH_ON_STARTUP)} /></SettingItem>
        <SettingItem title={getString('settings_show_videos')} disabled={isSettingDisabledUntilWired(SETTINGS.SUBSCRIPTION_SHOW_VIDEOS)}><ToggleSwitch checked={subsShowVideos} onChange={setSubsShowVideos} disabled={isSettingDisabledUntilWired(SETTINGS.SUBSCRIPTION_SHOW_VIDEOS)} /></SettingItem>
        <SettingItem title={getString('settings_show_shorts')} disabled={isSettingDisabledUntilWired(SETTINGS.SUBSCRIPTION_SHOW_SHORTS)}><ToggleSwitch checked={subsShowShorts} onChange={setSubsShowShorts} disabled={isSettingDisabledUntilWired(SETTINGS.SUBSCRIPTION_SHOW_SHORTS)} /></SettingItem>
        <SettingItem title={getString('settings_show_live')} disabled={isSettingDisabledUntilWired(SETTINGS.SUBSCRIPTION_SHOW_LIVE)}><ToggleSwitch checked={subsShowLive} onChange={setSubsShowLive} disabled={isSettingDisabledUntilWired(SETTINGS.SUBSCRIPTION_SHOW_LIVE)} /></SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_region')}>
        <SettingItem title={getString('settings_region_picker')} description={getString('settings_region_picker_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.SHOW_REGION_PICKER_IN_EXPLORE)}><ToggleSwitch checked={regionPicker} onChange={setRegionPicker} disabled={isSettingDisabledUntilWired(SETTINGS.SHOW_REGION_PICKER_IN_EXPLORE)} /></SettingItem>
        <SettingItem title={getString('settings_trending_region')} disabled={isSettingDisabledUntilWired(SETTINGS.TRENDING_REGION)}><Select value={trendingRegion} onChange={setTrendingRegion} options={REGION_OPTIONS} disabled={isSettingDisabledUntilWired(SETTINGS.TRENDING_REGION)} /></SettingItem>
      </SettingsGroup>
    </div>
  );
}
