import { useI18n } from '@/i18n/I18nContext';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();

  const toggleLanguage = () => {
    setLanguage(language === 'zh' ? 'en' : 'zh');
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-300 transition-all hover:text-white"
      title={t('lang.switch')}
    >
      <Globe className="w-3.5 h-3.5" />
      <span className="font-medium">{language === 'zh' ? 'EN' : '中文'}</span>
    </button>
  );
}
