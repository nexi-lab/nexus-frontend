const english = {
  'common.language': 'Language',
  'common.logout': 'Logout',
  'landing.admin': 'Admin',
  'landing.docs': 'Docs',
  'landing.nexus': 'Nexus',
};

export type TranslationKey = keyof typeof english;

export const translations = {
  en: english,
  ch: {
    'common.language': '语言',
    'common.logout': '退出',
    'landing.admin': '管理',
    'landing.docs': '文档',
    'landing.nexus': 'Nexus',
  },
} satisfies Record<'en' | 'ch', Record<TranslationKey, string>>;
