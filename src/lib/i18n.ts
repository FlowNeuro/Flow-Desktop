import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEN from '../locales/en/common.json';
import playerEN from '../locales/en/player.json';
import settingsEN from '../locales/en/settings.json';

const resources = {
  en: {
    common: commonEN,
    player: playerEN,
    settings: settingsEN,
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    ns: ['common', 'player', 'settings'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
