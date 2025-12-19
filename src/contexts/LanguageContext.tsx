import { createContext, useContext, useEffect, useState } from 'react';

export type Language = 'en' | 'ch';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    // Check localStorage first
    const stored = localStorage.getItem('nexus-language') as Language | null;
    if (stored === 'en' || stored === 'ch') {
      return stored;
    }
    // Default to English
    return 'en';
  });

  useEffect(() => {
    // Update HTML lang attribute
    document.documentElement.lang = language;
    
    // Save to localStorage
    localStorage.setItem('nexus-language', language);
  }, [language]);

  const setLanguage = (newLanguage: Language) => {
    setLanguageState(newLanguage);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
