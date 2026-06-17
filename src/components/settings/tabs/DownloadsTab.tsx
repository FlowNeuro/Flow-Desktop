import { FolderOpen } from 'lucide-react';
import { SettingsGroup } from '../SettingsGroup';
import { SettingItem } from '../SettingItem';
import { ToggleSwitch } from '../../ui/ToggleSwitch';
import { Select } from '../../ui/Select';
import { useBoolPref, usePreference, useNumberPref } from '../../../lib/usePreference';
import { pickFolder } from '../../../lib/dialogs';
import { getString } from '../../../lib/i18n/index';
import { SETTINGS } from '../../../lib/settings/schema';

export function DownloadsTab() {
  const [downloadQuality, setDownloadQuality] = usePreference(SETTINGS.DEFAULT_DOWNLOAD_QUALITY, '720p');
  const [parallelDownload, setParallelDownload] = useBoolPref(SETTINGS.PARALLEL_DOWNLOAD_ENABLED, true);
  const [threads, setThreads] = useNumberPref(SETTINGS.DOWNLOAD_THREADS, 3);
  const [downloadPath, setDownloadPath] = usePreference(SETTINGS.DOWNLOAD_LOCATION, '');
  const [musicPath, setMusicPath] = usePreference(SETTINGS.MUSIC_DOWNLOAD_LOCATION, '');

  const browseVideoFolder = async () => {
    const path = await pickFolder(getString('settings_video_download_folder'));
    if (path) setDownloadPath(path);
  };

  const browseMusicFolder = async () => {
    const path = await pickFolder(getString('settings_music_download_folder'));
    if (path) setMusicPath(path);
  };

  return (
    <div className="space-y-6 pb-8">
      <SettingsGroup title={getString('settings_group_download_quality')}>
        <SettingItem title={getString('settings_download_quality')} description={getString('settings_download_quality_desc')}>
          <Select value={downloadQuality} onChange={setDownloadQuality} options={[
            { value: 'Auto', label: getString('quality_auto') }, { value: '2160p', label: '2160p (4K)' },
            { value: '1440p', label: '1440p' }, { value: '1080p', label: '1080p' },
            { value: '720p', label: '720p' }, { value: '480p', label: '480p' }, { value: '360p', label: '360p' },
          ]} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_performance')}>
        <SettingItem title={getString('settings_parallel_fragments')} description={getString('settings_parallel_fragments_desc')}>
          <ToggleSwitch checked={parallelDownload} onChange={setParallelDownload} />
        </SettingItem>
        <SettingItem title={getString('settings_concurrent_threads')} description={getString('settings_concurrent_threads_desc')}>
          <Select value={String(threads)} onChange={(v) => setThreads(Number(v))} options={[
            { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' },
            { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' },
          ]} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_storage_paths')}>
        <div className="flex items-center justify-between px-5 py-4 hover:bg-surface-container transition-colors duration-200 ease-out">
          <div className="flex-1 min-w-0 mr-4">
            <div className="text-sm font-medium text-neutral-200">{getString('settings_video_download_folder')}</div>
            <div className="text-xs text-neutral-400 mt-0.5 truncate">{downloadPath || getString('settings_system_default_videos')}</div>
          </div>
          <button onClick={browseVideoFolder} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-200 bg-surface-container-high hover:bg-surface-container-highest rounded-md border border-neutral-700 transition-colors duration-200 ease-out cursor-pointer">
            <FolderOpen size={14} />
            {getString('settings_browse')}
          </button>
        </div>
        <div className="border-t border-neutral-800/50" />
        <div className="flex items-center justify-between px-5 py-4 hover:bg-surface-container transition-colors duration-200 ease-out">
          <div className="flex-1 min-w-0 mr-4">
            <div className="text-sm font-medium text-neutral-200">{getString('settings_music_download_folder')}</div>
            <div className="text-xs text-neutral-400 mt-0.5 truncate">{musicPath || getString('settings_system_default_music')}</div>
          </div>
          <button onClick={browseMusicFolder} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-200 bg-surface-container-high hover:bg-surface-container-highest rounded-md border border-neutral-700 transition-colors duration-200 ease-out cursor-pointer">
            <FolderOpen size={14} />
            {getString('settings_browse')}
          </button>
        </div>
      </SettingsGroup>
    </div>
  );
}
