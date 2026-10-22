import my from '../../../public/locales/my.json';
// Native dialogs are outside the DOM translation observer. Always resolve the
// complete message at action time, after the user has chosen a language.
export function localizedText(message: string, language = typeof document === 'undefined' ? 'en' : document.documentElement.lang): string {
  return language === 'my' ? (my as Record<string,string>)[message] ?? message : message;
}
