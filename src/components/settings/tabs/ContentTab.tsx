import { SettingsGroup } from '../SettingsGroup';
import { SettingItem } from '../SettingItem';
import { ToggleSwitch } from '../../ui/ToggleSwitch';
import { Select } from '../../ui/Select';
import { useBoolPref, usePreference, useNumberPref } from '../../../lib/usePreference';
import { getString } from '../../../lib/i18n/index';

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
  const [gridSize, setGridSize] = usePreference('grid_item_size', 'BIG');
  const [titleMaxLines, setTitleMaxLines] = useNumberPref('video_title_max_lines', 1);
  const [downloadDialogStyle, setDownloadDialogStyle] = usePreference('download_dialog_style', 'FULL');
  const [homeFeed, setHomeFeed] = useBoolPref('home_feed_enabled', true);
  const [appLogo, setAppLogo] = useBoolPref('show_app_logo_icon', true);
  const [shortsShelf, setShortsShelf] = useBoolPref('shorts_shelf_enabled', true);
  const [homeShortsShelf, setHomeShortsShelf] = useBoolPref('home_shorts_shelf_enabled', true);
  const [continueWatching, setContinueWatching] = useBoolPref('continue_watching_enabled', true);
  const [comments, setComments] = useBoolPref('comments_enabled', true);
  const [commentsPreview, setCommentsPreview] = useBoolPref('comments_preview_enabled', true);
  const [relatedVideos, setRelatedVideos] = useBoolPref('show_related_videos', true);
  const [hideWatched, setHideWatched] = useBoolPref('hide_watched_videos', false);
  const [disableShorts, setDisableShorts] = useBoolPref('disable_shorts_player', false);
  const [cardActions, setCardActions] = useBoolPref('video_card_actions_enabled', false);
  const [markWatched, setMarkWatched] = useBoolPref('video_card_mark_watched_enabled', false);
  const [relatedCardStyle, setRelatedCardStyle] = usePreference('related_card_style', 'FULL_WIDTH');
  const [shortsNav, setShortsNav] = useBoolPref('shorts_navigation_enabled', true);
  const [musicNav, setMusicNav] = useBoolPref('music_navigation_enabled', true);
  const [searchTab, setSearchTab] = useBoolPref('search_nav_tab_enabled', false);
  const [categoriesTab, setCategoriesTab] = useBoolPref('categories_nav_tab_enabled', false);
  const [subsRefresh, setSubsRefresh] = useBoolPref('subscription_refresh_on_startup', false);
  const [subsShowVideos, setSubsShowVideos] = useBoolPref('subscription_show_videos', true);
  const [subsShowShorts, setSubsShowShorts] = useBoolPref('subscription_show_shorts', true);
  const [subsShowLive, setSubsShowLive] = useBoolPref('subscription_show_live', true);
  const [regionPicker, setRegionPicker] = useBoolPref('show_region_picker_in_explore', true);
  const [trendingRegion, setTrendingRegion] = usePreference('trending_region', 'US');

  return (
    <div className="space-y-6 pb-8">
      <SettingsGroup title={getString('settings_group_layout')}>
        <SettingItem title={getString('settings_music_grid_scale')} description={getString('settings_music_grid_scale_desc')}>
          <Select value={gridSize} onChange={setGridSize} options={[{ value: 'BIG', label: 'Large' }, { value: 'SMALL', label: 'Compact' }]} />
        </SettingItem>
        <SettingItem title={getString('settings_video_title_lines')} description={getString('settings_video_title_lines_desc')}>
          <Select value={String(titleMaxLines)} onChange={(v) => setTitleMaxLines(Number(v))} options={[
            { value: '0', label: 'Unlimited' }, { value: '1', label: '1 line' }, { value: '2', label: '2 lines' }, { value: '3', label: '3 lines' },
          ]} />
        </SettingItem>
        <SettingItem title={getString('settings_download_dialog')} description={getString('settings_download_dialog_desc')}>
          <Select value={downloadDialogStyle} onChange={setDownloadDialogStyle} options={[{ value: 'FULL', label: 'Full' }, { value: 'COMPACT', label: 'Compact' }]} />
        </SettingItem>
        <SettingItem title={getString('settings_related_style')}>
          <Select value={relatedCardStyle} onChange={setRelatedCardStyle} options={[{ value: 'FULL_WIDTH', label: 'Full Width' }, { value: 'COMPACT', label: 'Compact' }]} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_feed')}>
        <SettingItem title={getString('settings_home_feed')} description={getString('settings_home_feed_desc')}><ToggleSwitch checked={homeFeed} onChange={setHomeFeed} /></SettingItem>
        <SettingItem title={getString('settings_app_logo')} description={getString('settings_app_logo_desc')}><ToggleSwitch checked={appLogo} onChange={setAppLogo} /></SettingItem>
        <SettingItem title={getString('settings_shorts_shelf')} description={getString('settings_shorts_shelf_desc')}><ToggleSwitch checked={shortsShelf} onChange={setShortsShelf} /></SettingItem>
        <SettingItem title={getString('settings_home_shorts_shelf')} description={getString('settings_home_shorts_shelf_desc')}><ToggleSwitch checked={homeShortsShelf} onChange={setHomeShortsShelf} /></SettingItem>
        <SettingItem title={getString('settings_continue_watching')} description={getString('settings_continue_watching_desc')}><ToggleSwitch checked={continueWatching} onChange={setContinueWatching} /></SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_content')}>
        <SettingItem title={getString('settings_comments')} description={getString('settings_comments_desc')}><ToggleSwitch checked={comments} onChange={setComments} /></SettingItem>
        <SettingItem title={getString('settings_comment_preview')} description={getString('settings_comment_preview_desc')}><ToggleSwitch checked={commentsPreview} onChange={setCommentsPreview} /></SettingItem>
        <SettingItem title={getString('settings_related_videos')} description={getString('settings_related_videos_desc')}><ToggleSwitch checked={relatedVideos} onChange={setRelatedVideos} /></SettingItem>
        <SettingItem title={getString('settings_hide_watched')} description={getString('settings_hide_watched_desc')}><ToggleSwitch checked={hideWatched} onChange={setHideWatched} /></SettingItem>
        <SettingItem title={getString('settings_disable_shorts_player')} description={getString('settings_disable_shorts_player_desc')}><ToggleSwitch checked={disableShorts} onChange={setDisableShorts} /></SettingItem>
        <SettingItem title={getString('settings_card_actions')} description={getString('settings_card_actions_desc')}><ToggleSwitch checked={cardActions} onChange={setCardActions} /></SettingItem>
        <SettingItem title={getString('settings_mark_watched')} description={getString('settings_mark_watched_desc')}><ToggleSwitch checked={markWatched} onChange={setMarkWatched} /></SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_nav_tabs')}>
        <SettingItem title={getString('settings_shorts_tab')}><ToggleSwitch checked={shortsNav} onChange={setShortsNav} /></SettingItem>
        <SettingItem title={getString('settings_music_tab')}><ToggleSwitch checked={musicNav} onChange={setMusicNav} /></SettingItem>
        <SettingItem title={getString('settings_search_tab')} description={getString('settings_search_tab_desc')}><ToggleSwitch checked={searchTab} onChange={setSearchTab} /></SettingItem>
        <SettingItem title={getString('settings_categories_tab')} description={getString('settings_categories_tab_desc')}><ToggleSwitch checked={categoriesTab} onChange={setCategoriesTab} /></SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_subscriptions')}>
        <SettingItem title={getString('settings_refresh_startup')} description={getString('settings_refresh_startup_desc')}><ToggleSwitch checked={subsRefresh} onChange={setSubsRefresh} /></SettingItem>
        <SettingItem title={getString('settings_show_videos')}><ToggleSwitch checked={subsShowVideos} onChange={setSubsShowVideos} /></SettingItem>
        <SettingItem title={getString('settings_show_shorts')}><ToggleSwitch checked={subsShowShorts} onChange={setSubsShowShorts} /></SettingItem>
        <SettingItem title={getString('settings_show_live')}><ToggleSwitch checked={subsShowLive} onChange={setSubsShowLive} /></SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_region')}>
        <SettingItem title={getString('settings_region_picker')} description={getString('settings_region_picker_desc')}><ToggleSwitch checked={regionPicker} onChange={setRegionPicker} /></SettingItem>
        <SettingItem title={getString('settings_trending_region')}><Select value={trendingRegion} onChange={setTrendingRegion} options={REGION_OPTIONS} /></SettingItem>
      </SettingsGroup>
    </div>
  );
}
