import { PUBLIC_CONTACTS } from '../config.js'

export function PublicContactBlock() {
  return (
    <section className="legal-public-contacts" aria-label="Контакты администрации сервиса">
      <h2>{PUBLIC_CONTACTS.platformTitle}</h2>
      <p className="legal-public-contacts-heading">{PUBLIC_CONTACTS.contactHeading}</p>
      {PUBLIC_CONTACTS.email || (PUBLIC_CONTACTS.telegram && PUBLIC_CONTACTS.telegramUrl) ? (
        <ul className="legal-public-contacts-list">
          {PUBLIC_CONTACTS.email && (
            <li>Email: <a href={'mailto:' + PUBLIC_CONTACTS.email}>{PUBLIC_CONTACTS.email}</a></li>
          )}
          {PUBLIC_CONTACTS.telegram && PUBLIC_CONTACTS.telegramUrl && (
            <li>Telegram: <a href={PUBLIC_CONTACTS.telegramUrl} target="_blank" rel="noopener noreferrer">{PUBLIC_CONTACTS.telegram}</a></li>
          )}
        </ul>
      ) : (
        <p>Контакты не настроены. Укажите контакты администратора в конфигурации своего экземпляра.</p>
      )}
    </section>
  )
}

export default PublicContactBlock
