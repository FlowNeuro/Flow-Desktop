import { SettingsGroup } from '../SettingsGroup';
import { SettingItem } from '../SettingItem';
import { ToggleSwitch } from '../../ui/ToggleSwitch';
import { Select } from '../../ui/Select';
import { TextInput } from '../../ui/TextInput';
import { useBoolPref, usePreference, useNumberPref } from '../../../lib/usePreference';
import { getString } from '../../../lib/i18n/index';

export function PlayerTab() {
  const [autoplay, setAutoplay] = useBoolPref('autoplay_enabled', true);
  const [loop, setLoop] = useBoolPref('video_loop_enabled', false);
  const [skipSilence, setSkipSilence] = useBoolPref('skip_silence_enabled', false);
  const [stableVolume, setStableVolume] = useBoolPref('stable_volume_enabled', false);
  const [volumeBoost, setVolumeBoost] = useBoolPref('allow_volume_boost', false);

  const [rememberSpeed, setRememberSpeed] = useBoolPref('remember_playback_speed', false);
  const [playbackSpeed, setPlaybackSpeed] = usePreference('playback_speed', '1.0');
  const [customSpeeds, setCustomSpeeds] = useBoolPref('custom_speeds_enabled', false);
  const [customPresets, setCustomPresets] = usePreference('custom_speed_presets', '');
  const [longPressSpeed, setLongPressSpeed] = usePreference('long_press_playback_speed', '2.0');
  const [speedSlider, setSpeedSlider] = useBoolPref('speed_slider_enabled', false);

  const [doubleTapSeek, setDoubleTapSeek] = useNumberPref('double_tap_seek_seconds', 10);

  const [subtitles, setSubtitles] = useBoolPref('subtitles_enabled', false);
  const [subtitleLang, setSubtitleLang] = usePreference('preferred_subtitle_language', 'en');
  const [subtitleSize, setSubtitleSize] = usePreference('subtitle_font_size', '14');
  const [subtitleBold, setSubtitleBold] = useBoolPref('subtitle_bold', true);

  const [miniSkip, setMiniSkip] = useBoolPref('mini_player_show_skip_controls', false);
  const [miniNextPrev, setMiniNextPrev] = useBoolPref('mini_player_show_next_prev_controls', false);

  const [sliderStyle, setSliderStyle] = usePreference('slider_style', 'DEFAULT');
  const [fullscreenTitle, setFullscreenTitle] = useBoolPref('show_fullscreen_title', false);
  const [adaptiveSize, setAdaptiveSize] = useBoolPref('adaptive_player_size_enabled', true);

  const [autoPip, setAutoPip] = useBoolPref('auto_pip_enabled', false);
  const [pipButton, setPipButton] = useBoolPref('manual_pip_button_enabled', true);

  return (
    <div className="space-y-6 pb-8">
      <SettingsGroup title={getString('settings_group_playback')}>
        <SettingItem title={getString('settings_autoplay')} description={getString('settings_autoplay_desc')}>
          <ToggleSwitch checked={autoplay} onChange={setAutoplay} />
        </SettingItem>
        <SettingItem title={getString('settings_loop_video')} description={getString('settings_loop_video_desc')}>
          <ToggleSwitch checked={loop} onChange={setLoop} />
        </SettingItem>
        <SettingItem title={getString('settings_skip_silence')} description={getString('settings_skip_silence_desc')}>
          <ToggleSwitch checked={skipSilence} onChange={setSkipSilence} />
        </SettingItem>
        <SettingItem title={getString('settings_stable_volume')} description={getString('settings_stable_volume_desc')}>
          <ToggleSwitch checked={stableVolume} onChange={setStableVolume} />
        </SettingItem>
        <SettingItem title={getString('settings_volume_boost')} description={getString('settings_volume_boost_desc')}>
          <ToggleSwitch checked={volumeBoost} onChange={setVolumeBoost} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_speed')}>
        <SettingItem title={getString('settings_remember_speed')} description={getString('settings_remember_speed_desc')}>
          <ToggleSwitch checked={rememberSpeed} onChange={setRememberSpeed} />
        </SettingItem>
        <SettingItem title={getString('settings_default_speed')}>
          <Select value={playbackSpeed} onChange={setPlaybackSpeed} options={[
            { value: '0.25', label: '0.25x' }, { value: '0.5', label: '0.5x' },
            { value: '0.75', label: '0.75x' }, { value: '1.0', label: '1.0x' },
            { value: '1.25', label: '1.25x' }, { value: '1.5', label: '1.5x' },
            { value: '1.75', label: '1.75x' }, { value: '2.0', label: '2.0x' },
          ]} />
        </SettingItem>
        <SettingItem title={getString('settings_custom_speed_presets')} description={getString('settings_custom_speed_presets_desc')}>
          <ToggleSwitch checked={customSpeeds} onChange={setCustomSpeeds} />
        </SettingItem>
        {customSpeeds && (
          <SettingItem title={getString('settings_speed_values')} description={getString('settings_speed_values_desc')}>
            <TextInput value={customPresets} onChange={setCustomPresets} placeholder="0.5,1.0,1.5,2.0" className="w-48" />
          </SettingItem>
        )}
        <SettingItem title={getString('settings_long_press_speed')} description={getString('settings_long_press_speed_desc')}>
          <Select value={longPressSpeed} onChange={setLongPressSpeed} options={[
            { value: '1.5', label: '1.5x' }, { value: '2.0', label: '2.0x' },
            { value: '2.5', label: '2.5x' }, { value: '3.0', label: '3.0x' }, { value: '4.0', label: '4.0x' },
          ]} />
        </SettingItem>
        <SettingItem title={getString('settings_speed_slider')} description={getString('settings_speed_slider_desc')}>
          <ToggleSwitch checked={speedSlider} onChange={setSpeedSlider} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_seek')}>
        <SettingItem title={getString('settings_seek_interval')} description={getString('settings_seek_interval_desc')}>
          <Select value={String(doubleTapSeek)} onChange={(v) => setDoubleTapSeek(Number(v))} options={[
            { value: '5', label: '5s' }, { value: '10', label: '10s' }, { value: '15', label: '15s' },
            { value: '20', label: '20s' }, { value: '30', label: '30s' },
          ]} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_subtitles')}>
        <SettingItem title={getString('settings_closed_captions')} description={getString('settings_closed_captions_desc')}>
          <ToggleSwitch checked={subtitles} onChange={setSubtitles} />
        </SettingItem>
        <SettingItem title={getString('settings_preferred_language')}>
          <Select value={subtitleLang} onChange={setSubtitleLang} options={[
            { value: 'en', label: 'English' }, { value: 'es', label: 'Spanish' },
            { value: 'fr', label: 'French' }, { value: 'de', label: 'German' },
            { value: 'pt', label: 'Portuguese' }, { value: 'ja', label: 'Japanese' },
            { value: 'ko', label: 'Korean' }, { value: 'zh', label: 'Chinese' },
            { value: 'ar', label: 'Arabic' }, { value: 'hi', label: 'Hindi' }, { value: 'ru', label: 'Russian' },
          ]} />
        </SettingItem>
        <SettingItem title={getString('settings_font_size')}>
          <Select value={subtitleSize} onChange={setSubtitleSize} options={[
            { value: '10', label: '10' }, { value: '12', label: '12' }, { value: '14', label: '14' },
            { value: '16', label: '16' }, { value: '18', label: '18' }, { value: '20', label: '20' }, { value: '24', label: '24' },
          ]} />
        </SettingItem>
        <SettingItem title={getString('settings_bold_subtitles')}>
          <ToggleSwitch checked={subtitleBold} onChange={setSubtitleBold} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_mini_player')}>
        <SettingItem title={getString('settings_skip_controls')} description={getString('settings_skip_controls_desc')}>
          <ToggleSwitch checked={miniSkip} onChange={setMiniSkip} />
        </SettingItem>
        <SettingItem title={getString('settings_next_previous')} description={getString('settings_next_previous_desc')}>
          <ToggleSwitch checked={miniNextPrev} onChange={setMiniNextPrev} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_pip')}>
        <SettingItem title={getString('settings_auto_pip')} description={getString('settings_auto_pip_desc')}>
          <ToggleSwitch checked={autoPip} onChange={setAutoPip} />
        </SettingItem>
        <SettingItem title={getString('settings_pip_toggle')} description={getString('settings_pip_toggle_desc')}>
          <ToggleSwitch checked={pipButton} onChange={setPipButton} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_player_appearance')}>
        <SettingItem title={getString('settings_seekbar_style')}>
          <Select value={sliderStyle} onChange={setSliderStyle} options={[
            { value: 'DEFAULT', label: 'Default' }, { value: 'METROLIST', label: 'Metro' },
            { value: 'METROLIST_SLIM', label: 'Metro Slim' }, { value: 'SQUIGGLY', label: 'Squiggly' }, { value: 'SLIM', label: 'Slim' },
          ]} />
        </SettingItem>
        <SettingItem title={getString('settings_fullscreen_title')} description={getString('settings_fullscreen_title_desc')}>
          <ToggleSwitch checked={fullscreenTitle} onChange={setFullscreenTitle} />
        </SettingItem>
        <SettingItem title={getString('settings_adaptive_player')} description={getString('settings_adaptive_player_desc')}>
          <ToggleSwitch checked={adaptiveSize} onChange={setAdaptiveSize} />
        </SettingItem>
      </SettingsGroup>
    </div>
  );
}
