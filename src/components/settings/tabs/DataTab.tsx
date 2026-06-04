import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Download, Trash2 } from 'lucide-react';
import { SettingsGroup } from '../SettingsGroup';
import { SettingItem } from '../SettingItem';
import { Select } from '../../ui/Select';
import { Button } from '../../ui/Button';
import { usePreference } from '../../../lib/usePreference';
import { getSetting, setSetting, clearWatchHistory, getWatchHistory } from '../../../lib/api/db';
import { pickSaveFile } from '../../../lib/dialogs';
import { isTauriEnv } from '../../../lib/api/env';
import { getString } from '../../../lib/i18n/index';

const EXPORT_KEYS = [
  'autoplay_enabled', 'video_loop_enabled', 'skip_silence_enabled', 'stable_volume_enabled',
  'allow_volume_boost', 'remember_playback_speed', 'playback_speed', 'custom_speeds_enabled',
  'custom_speed_presets', 'long_press_playback_speed', 'speed_slider_enabled',
  'double_tap_seek_seconds', 'subtitles_enabled', 'preferred_subtitle_language',
  'subtitle_font_size', 'subtitle_bold', 'slider_style', 'show_fullscreen_title',
  'adaptive_player_size_enabled', 'auto_pip_enabled', 'manual_pip_button_enabled',
  'mini_player_show_skip_controls', 'mini_player_show_next_prev_controls',
  'grid_item_size', 'video_title_max_lines', 'download_dialog_style', 'home_feed_enabled',
  'show_app_logo_icon', 'shorts_shelf_enabled', 'home_shorts_shelf_enabled',
  'continue_watching_enabled', 'comments_enabled', 'comments_preview_enabled',
  'show_related_videos', 'hide_watched_videos', 'disable_shorts_player',
  'video_card_actions_enabled', 'video_card_mark_watched_enabled', 'related_card_style',
  'shorts_navigation_enabled', 'music_navigation_enabled', 'search_nav_tab_enabled',
  'categories_nav_tab_enabled', 'subscription_refresh_on_startup',
  'subscription_show_videos', 'subscription_show_shorts', 'subscription_show_live',
  'show_region_picker_in_explore', 'trending_region', 'default_quality_wifi',
  'default_video_codec', 'shorts_quality_wifi', 'music_audio_quality',
  'preferred_audio_language', 'buffer_profile', 'min_buffer_ms', 'max_buffer_ms',
  'buffer_for_playback_ms', 'buffer_for_playback_after_rebuffer_ms', 'media_cache_size_mb',
  'proxy_enabled', 'proxy_type', 'proxy_host', 'proxy_port', 'proxy_username',
  'default_download_quality', 'parallel_download_enabled', 'download_threads',
  'download_location', 'music_download_location', 'auto_backup_frequency', 'auto_backup_type',
  'sponsorblock_enabled', 'dearrow_enabled', 'rytd_enabled',
];

export function DataTab() {
  const navigate = useNavigate();
  const [backupFrequency, setBackupFrequency] = usePreference('auto_backup_frequency', 'NONE');
  const [backupType, setBackupType] = usePreference('auto_backup_type', 'APP_DATA');
  const [historyCount, setHistoryCount] = useState(0);
  const [subCount, setSubCount] = useState(0);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const load = async () => {
      const history = await getWatchHistory(100, 0);
      setHistoryCount(history.length);
      const subsJson = await getSetting('subscriptions');
      if (subsJson) { try { setSubCount(JSON.parse(subsJson).length); } catch {} }
    };
    load();
  }, []);

  const handleClearData = async () => {
    if (!confirm(getString('settings_clear_confirm'))) return;
    setClearing(true);
    try {
      await clearWatchHistory();
      await setSetting('subscriptions', '[]');
      await setSetting('user_playlists', '[]');
      setHistoryCount(0);
      setSubCount(0);
    } catch (e) {
      console.error('Failed to reset data', e);
    } finally {
      setClearing(false);
    }
  };

  const handleExport = async () => {
    try {
      const strings: Record<string, unknown> = {};
      const booleans: Record<string, unknown> = {};
      const ints: Record<string, unknown> = {};
      const floats: Record<string, unknown> = {};

      for (const key of EXPORT_KEYS) {
        const val = await getSetting(key);
        if (val === null) continue;
        if (val === 'true' || val === 'false') { booleans[key] = val === 'true'; }
        else if (/^\d+$/.test(val)) { ints[key] = parseInt(val, 10); }
        else if (/^\d+\.\d+$/.test(val)) { floats[key] = parseFloat(val); }
        else { strings[key] = val; }
      }

      const exported = { strings, booleans, ints, floats };
      const jsonStr = JSON.stringify(exported, null, 2);
      const defaultName = `flow_backup_${new Date().toISOString().slice(0, 10)}.json`;

      if (await isTauriEnv()) {
        const savePath = await pickSaveFile(getString('settings_export_data'), defaultName, [{ name: 'JSON', extensions: ['json'] }]);
        if (savePath) {
          const { writeTextFile } = await import('@tauri-apps/plugin-dialog').then(() => import('@tauri-apps/api').then(m => m as any)).catch(() => ({ writeTextFile: null }));
          if (writeTextFile) { await writeTextFile(savePath, jsonStr); return; }
        }
      }

      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <SettingsGroup title={getString('settings_group_auto_backup')}>
        <SettingItem title={getString('settings_backup_frequency')} description={getString('settings_backup_frequency_desc')}>
          <Select value={backupFrequency} onChange={setBackupFrequency} options={[
            { value: 'NONE', label: 'Disabled' }, { value: 'DAILY', label: 'Daily' },
            { value: 'WEEKLY', label: 'Weekly' }, { value: 'MONTHLY', label: 'Monthly' },
          ]} />
        </SettingItem>
        <SettingItem title={getString('settings_backup_scope')} description={getString('settings_backup_scope_desc')}>
          <Select value={backupType} onChange={setBackupType} options={[
            { value: 'APP_DATA', label: 'Settings & History' }, { value: 'BRAIN', label: 'NeuroEngine Only' }, { value: 'MASTER', label: 'All Data' },
          ]} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_database')}>
        <SettingItem title={getString('settings_history_records')}><span className="text-sm font-mono text-neutral-100">{historyCount}</span></SettingItem>
        <SettingItem title={getString('settings_subscriptions_count')}><span className="text-sm font-mono text-neutral-100">{subCount}</span></SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_actions')}>
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 hover:bg-surface-container transition-colors duration-200 ease-out">
            <div className="flex-1 min-w-0 mr-4">
              <div className="text-sm font-medium text-neutral-200">{getString('settings_import_restore')}</div>
              <div className="text-xs text-neutral-400 mt-0.5">{getString('settings_import_restore_desc')}</div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate('/settings/import')}><Upload size={14} />{getString('settings_import')}</Button>
          </div>
          <div className="border-t border-neutral-800/50" />
          <div className="flex items-center justify-between px-5 py-4 hover:bg-surface-container transition-colors duration-200 ease-out">
            <div className="flex-1 min-w-0 mr-4">
              <div className="text-sm font-medium text-neutral-200">{getString('settings_export_data')}</div>
              <div className="text-xs text-neutral-400 mt-0.5">{getString('settings_export_data_desc')}</div>
            </div>
            <Button variant="secondary" size="sm" onClick={handleExport}><Download size={14} />{getString('settings_export')}</Button>
          </div>
          <div className="border-t border-neutral-800/50" />
          <div className="flex items-center justify-between px-5 py-4 hover:bg-surface-container transition-colors duration-200 ease-out">
            <div className="flex-1 min-w-0 mr-4">
              <div className="text-sm font-medium text-neutral-200">{getString('settings_clear_cache')}</div>
              <div className="text-xs text-neutral-400 mt-0.5">{getString('settings_clear_cache_desc')}</div>
            </div>
            <Button variant="destructive" size="sm" onClick={handleClearData} disabled={clearing}><Trash2 size={14} />{clearing ? getString('settings_clearing') : getString('clear')}</Button>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
}
