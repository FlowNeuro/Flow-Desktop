import { SettingsGroup } from '../SettingsGroup';
import { SettingItem } from '../SettingItem';
import { Select } from '../../ui/Select';
import { usePreference } from '../../../lib/usePreference';
import { getString } from '../../../lib/i18n/index';
import { SETTINGS } from '../../../lib/settings/schema';
import { isSettingDisabledUntilWired } from '../../../lib/settings/values';

const QUALITY_OPTIONS = [
  { value: 'Auto', label: getString('quality_auto') }, { value: '2160p', label: '2160p (4K)' },
  { value: '1440p', label: '1440p' }, { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' }, { value: '480p', label: '480p' },
  { value: '360p', label: '360p' }, { value: '240p', label: '240p' }, { value: '144p', label: '144p' },
];

const LANGUAGE_OPTIONS = [
  { value: 'original', label: getString('settings_option_original') }, { value: 'af', label: 'Afrikaans' }, { value: 'am', label: 'Amharic' },
  { value: 'ar', label: 'Arabic' }, { value: 'az', label: 'Azerbaijani' }, { value: 'be', label: 'Belarusian' },
  { value: 'bg', label: 'Bulgarian' }, { value: 'bn', label: 'Bengali' }, { value: 'bs', label: 'Bosnian' },
  { value: 'ca', label: 'Catalan' }, { value: 'cs', label: 'Czech' }, { value: 'cy', label: 'Welsh' },
  { value: 'da', label: 'Danish' }, { value: 'de', label: 'German' }, { value: 'el', label: 'Greek' },
  { value: 'en', label: 'English' }, { value: 'es', label: 'Spanish' }, { value: 'et', label: 'Estonian' },
  { value: 'eu', label: 'Basque' }, { value: 'fa', label: 'Persian' }, { value: 'fi', label: 'Finnish' },
  { value: 'fil', label: 'Filipino' }, { value: 'fr', label: 'French' }, { value: 'gl', label: 'Galician' },
  { value: 'gu', label: 'Gujarati' }, { value: 'ha', label: 'Hausa' }, { value: 'he', label: 'Hebrew' },
  { value: 'hi', label: 'Hindi' }, { value: 'hr', label: 'Croatian' }, { value: 'hu', label: 'Hungarian' },
  { value: 'hy', label: 'Armenian' }, { value: 'id', label: 'Indonesian' }, { value: 'ig', label: 'Igbo' },
  { value: 'is', label: 'Icelandic' }, { value: 'it', label: 'Italian' }, { value: 'ja', label: 'Japanese' },
  { value: 'jv', label: 'Javanese' }, { value: 'ka', label: 'Georgian' }, { value: 'kk', label: 'Kazakh' },
  { value: 'km', label: 'Khmer' }, { value: 'kn', label: 'Kannada' }, { value: 'ko', label: 'Korean' },
  { value: 'ku', label: 'Kurdish' }, { value: 'ky', label: 'Kyrgyz' }, { value: 'lo', label: 'Lao' },
  { value: 'lt', label: 'Lithuanian' }, { value: 'lv', label: 'Latvian' }, { value: 'mk', label: 'Macedonian' },
  { value: 'ml', label: 'Malayalam' }, { value: 'mn', label: 'Mongolian' }, { value: 'mr', label: 'Marathi' },
  { value: 'ms', label: 'Malay' }, { value: 'my', label: 'Burmese' }, { value: 'ne', label: 'Nepali' },
  { value: 'nl', label: 'Dutch' }, { value: 'no', label: 'Norwegian' }, { value: 'or', label: 'Odia' },
  { value: 'pa', label: 'Punjabi' }, { value: 'pl', label: 'Polish' }, { value: 'ps', label: 'Pashto' },
  { value: 'pt', label: 'Portuguese' }, { value: 'ro', label: 'Romanian' }, { value: 'ru', label: 'Russian' },
  { value: 'rw', label: 'Kinyarwanda' }, { value: 'sd', label: 'Sindhi' }, { value: 'si', label: 'Sinhala' },
  { value: 'sk', label: 'Slovak' }, { value: 'sl', label: 'Slovenian' }, { value: 'so', label: 'Somali' },
  { value: 'sq', label: 'Albanian' }, { value: 'sr', label: 'Serbian' }, { value: 'su', label: 'Sundanese' },
  { value: 'sv', label: 'Swedish' }, { value: 'sw', label: 'Swahili' }, { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' }, { value: 'tg', label: 'Tajik' }, { value: 'th', label: 'Thai' },
  { value: 'tk', label: 'Turkmen' }, { value: 'tr', label: 'Turkish' }, { value: 'uk', label: 'Ukrainian' },
  { value: 'ur', label: 'Urdu' }, { value: 'uz', label: 'Uzbek' }, { value: 'vi', label: 'Vietnamese' },
  { value: 'yo', label: 'Yoruba' }, { value: 'zh', label: 'Chinese' }, { value: 'zh-Hant', label: 'Chinese (Traditional)' },
  { value: 'zu', label: 'Zulu' },
];

export function QualityTab() {
  const [qualityWifi, setQualityWifi] = usePreference(SETTINGS.DEFAULT_QUALITY_WIFI, '1080p');
  const [codec, setCodec] = usePreference(SETTINGS.DEFAULT_VIDEO_CODEC, 'H.264');
  const [shortsQuality, setShortsQuality] = usePreference(SETTINGS.SHORTS_QUALITY_WIFI, '720p');
  const [audioQuality, setAudioQuality] = usePreference(SETTINGS.MUSIC_AUDIO_QUALITY, 'Auto');
  const [audioLang, setAudioLang] = usePreference(SETTINGS.PREFERRED_AUDIO_LANGUAGE, 'original');

  return (
    <div className="space-y-6 pb-8">
      <SettingsGroup title={getString('settings_group_video_quality')}>
        <SettingItem title={getString('settings_default_resolution')} description={getString('settings_default_resolution_desc')}>
          <Select value={qualityWifi} onChange={setQualityWifi} options={QUALITY_OPTIONS} />
        </SettingItem>
        <SettingItem title={getString('settings_preferred_codec')} description={getString('settings_preferred_codec_desc')}>
          <Select value={codec} onChange={setCodec} options={[
            { value: 'Auto', label: getString('quality_auto') }, { value: 'H.264', label: 'H.264' },
            { value: 'VP9', label: 'VP9' }, { value: 'AV1', label: 'AV1' },
          ]} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_shorts_quality')}>
        <SettingItem title={getString('settings_shorts_resolution')} description={getString('settings_shorts_resolution_desc')}>
          <Select value={shortsQuality} onChange={setShortsQuality} options={QUALITY_OPTIONS} />
        </SettingItem>
      </SettingsGroup>

      <SettingsGroup title={getString('settings_group_audio')}>
        <SettingItem title={getString('settings_music_audio_quality')} description={getString('settings_music_audio_quality_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.MUSIC_AUDIO_QUALITY)}>
          <Select value={audioQuality} onChange={setAudioQuality} disabled={isSettingDisabledUntilWired(SETTINGS.MUSIC_AUDIO_QUALITY)} options={[
            { value: 'Auto', label: getString('quality_auto') }, { value: 'High', label: getString('settings_option_high') },
            { value: 'Medium', label: getString('settings_option_medium') }, { value: 'Low', label: getString('settings_option_low') },
          ]} />
        </SettingItem>
        <SettingItem title={getString('settings_audio_track_language')} description={getString('settings_audio_track_language_desc')} disabled={isSettingDisabledUntilWired(SETTINGS.PREFERRED_AUDIO_LANGUAGE)}>
          <Select value={audioLang} onChange={setAudioLang} options={LANGUAGE_OPTIONS} disabled={isSettingDisabledUntilWired(SETTINGS.PREFERRED_AUDIO_LANGUAGE)} />
        </SettingItem>
      </SettingsGroup>
    </div>
  );
}
