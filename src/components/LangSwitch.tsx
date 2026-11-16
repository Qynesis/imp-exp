import { setLang, useLang, type Lang } from '@/i18n/lang'
import { cls } from '@/ui'

/** English / বাংলা. Each label is written in its own language, so it is never translated. */
export function LangSwitch({ dark }: { dark?: boolean }) {
  const lang = useLang()
  const opt = (value: Lang, label: string) => (
    <button type="button" className={cls('lang-btn', lang === value && 'on')} aria-pressed={lang === value} lang={value} onClick={() => setLang(value)}>{label}</button>
  )
  return (
    <div className={cls('lang-switch', dark && 'dark')} role="group" aria-label="Language / ভাষা" data-no-translate>
      {opt('en', 'English')}
      {opt('bn', 'বাংলা')}
    </div>
  )
}
