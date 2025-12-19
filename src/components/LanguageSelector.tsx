import { Globe } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from '../i18n/useTranslation';
import { Button } from './ui/button';

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const languageOptions = [
    { value: 'en' as const, labelEn: 'English', labelCh: 'English' },
    { value: 'ch' as const, labelEn: '中文', labelCh: '中文' },
  ] as const;

  const getLabel = (option: typeof languageOptions[number]) => {
    return language === 'ch' ? option.labelCh : option.labelEn;
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        title={t('common.language')}
        className="h-9 w-9"
      >
        <Globe className="h-4 w-4" />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Menu */}
          <div className="absolute right-0 top-full mt-2 z-[999] min-w-[140px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            {languageOptions.map((option) => {
              const isActive = language === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setLanguage(option.value);
                    setIsOpen(false);
                  }}
                  className={`relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground ${
                    isActive ? 'bg-accent text-accent-foreground' : ''
                  }`}
                >
                  <span>{getLabel(option)}</span>
                  {isActive && (
                    <span className="ml-auto text-xs">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
