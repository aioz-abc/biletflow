import { useState } from 'react'
import './workspace.css'
import { screens } from './routes.js'

const events = [
  { id: 1, title: 'Almaty Tech Night', date: '25 сентября 2026', status: 'Upcoming' },
  { id: 2, title: 'Campus Open Day', date: '13 сентября 2026', status: 'Active' },
  { id: 3, title: 'Design Meetup', date: '10 сентября 2026', status: 'Completed' },
  { id: 4, title: 'Autumn Concert', date: '12 сентября 2026', status: 'Cancelled' },
]
const records = {
  users: [['U-01', 'Demo Organizer', 'organizer'], ['U-02', 'Demo Attendee', 'attendee']],
  events: events.map(event => [`E-0${event.id}`, event.title, event.status]),
  orders: [['O-01', 'Almaty Tech Night · 2 билета', '10 000 ₸'], ['O-02', 'Design Meetup · 1 билет', '2 500 ₸']],
}

function Login() {
  return <section className="mw-panel mw-login">
    <p className="mw-eyebrow">PLATFORM ADMIN</p><h2>Вход в управление</h2>
    <p>Макет формы входа. Авторизация будет подключена на этапе 2.</p>
    <label>Email<input type="email" placeholder="admin@example.com" disabled /></label>
    <label>Пароль<input type="password" placeholder="Подключение на этапе 2" disabled /></label>
    <button disabled>Войти — скоро</button>
    <a className="mw-button" href="/admin">Посмотреть демо панели →</a>
    <small>Демо открыто всем и не предоставляет административных прав.</small>
  </section>
}

function Dashboard() {
  const [type, setType] = useState('events')
  const [query, setQuery] = useState('')
  const rows = records[type].filter(row => row.join(' ').toLowerCase().includes(query.toLowerCase()))
  return <>
    <div className="mw-stats">{[['Пользователи', '2'], ['События', '4'], ['Заказы', '2']].map(([label, value]) => <section className="mw-panel" key={label}><p>{label}</p><strong>{value}</strong><small>Демонстрационные записи</small></section>)}</div>
    <section className="mw-panel"><h2>Поиск на платформе</h2><div className="mw-controls">
      <label>Категория<select value={type} onChange={event => setType(event.target.value)}><option value="events">События</option><option value="users">Пользователи</option><option value="orders">Заказы</option></select></label>
      <label>Поиск<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Название, имя или номер" /></label>
    </div><div className="mw-table"><table><thead><tr><th>ID</th><th>Запись</th><th>Статус / сведения</th></tr></thead><tbody>{rows.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>
    {rows.length === 0 && <p role="status">Ничего не найдено. Попробуйте другой запрос.</p>}</section>
  </>
}

function Campaign() {
  const [preview, setPreview] = useState(null)
  const [discountType, setDiscountType] = useState('percent')
  function submit(event) {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    const end = event.currentTarget.elements.ends_at
    end.setCustomValidity(data.ends_at <= data.starts_at ? 'Окончание должно быть позже начала.' : '')
    if (!event.currentTarget.reportValidity()) return
    setPreview(data)
  }
  return <div className="mw-columns"><form className="mw-panel" onSubmit={submit} onChange={() => setPreview(null)}>
    <h2>Настройки кампании</h2>
    <label>Событие<select name="event"><option>Almaty Tech Night</option></select></label>
    <label>Название<input name="name" required maxLength={120} placeholder="Студенческая скидка" /></label>
    <div className="mw-controls"><label>Тип скидки<select name="discount_type" value={discountType} onChange={event => setDiscountType(event.target.value)}><option value="percent">Процент</option><option value="fixed">Сумма в ₸</option></select></label>
    <label>{discountType === 'percent' ? 'Скидка, %' : 'Скидка, ₸'}<input name="discount_value" type="number" min="1" max={discountType === 'percent' ? 100 : 1000000} step="1" required /></label></div>
    <div className="mw-controls"><label>Начало<input name="starts_at" type="datetime-local" required onChange={event => event.currentTarget.form.elements.ends_at.setCustomValidity('')} /></label><label>Окончание<input name="ends_at" type="datetime-local" required onChange={event => event.target.setCustomValidity('')} /></label></div>
    <label>Максимум применений<input name="max_redemptions" type="number" min="1" step="1" required /></label>
    <label>Тип билета<select name="ticket_type"><option>Standard</option><option>VIP</option><option>Все типы</option></select></label>
    <button type="submit">Предпросмотр кампании</button><p>Данные не отправляются и не сохраняются. Код и Campaign QR появятся после подключения API.</p>
  </form><section className="mw-panel" aria-live="polite"><p className="mw-eyebrow">ПРЕДПРОСМОТР</p><h2>{preview?.name || 'Ваша кампания'}</h2>{preview ? <><p>{preview.event} · {preview.ticket_type}</p><strong className="mw-discount">−{preview.discount_value}{preview.discount_type === 'percent' ? '%' : ' ₸'}</strong><p>До {preview.max_redemptions} применений</p><p>{preview.starts_at.replace('T', ' ')} — {preview.ends_at.replace('T', ' ')}</p><p>Макет готов к обсуждению. Кампания не создана.</p></> : <p>Заполните форму, чтобы увидеть сводку предложения.</p>}</section></div>
}

function Analytics() {
  return <><section className="mw-panel"><h2>Almaty Tech Night</h2><p>Фиксированный набор примеров. Фильтры подключаются вместе с API аналитики.</p><div className="mw-controls"><label>Период<input type="text" value="8–14 сентября 2026" disabled /></label><label>Тип билета<select disabled><option>Все типы</option></select></label></div></section>
    <div className="mw-stats">{[['Продано / вместимость', '120 / 200'], ['Осталось', '80'], ['Продажи', '600 000 ₸'], ['Возвраты', '0 ₸'], ['Прошли на событие', '0 / 120'], ['Посещаемость', '0%']].map(([label, value]) => <section className="mw-panel" key={label}><p>{label}</p><strong>{value}</strong></section>)}</div>
    <div className="mw-columns"><section className="mw-panel"><h2>Продажи по дням</h2><p>Количество билетов · пример</p>{[['08.09', 20], ['09.09', 10], ['10.09', 30], ['11.09', 15], ['12.09', 25], ['13.09', 10], ['14.09', 10]].map(([day, count]) => <div className="mw-bar" key={day}><span>{day}</span><meter min="0" max="30" value={count} aria-label={`Билеты за ${day}`} /><span>{count}</span></div>)}</section>
    <section className="mw-panel"><h2>Кампании и типы билетов</h2><p>Standard: 100 билетов · 450 000 ₸</p><p>VIP: 20 билетов · 150 000 ₸</p><hr /><p>STUDENT: 12 применений · 12 билетов</p><p>Выручка кампании: 48 000 ₸</p><small>Выручка кампании входит в общие продажи.</small></section></div>
  </>
}

function History() {
  const [status, setStatus] = useState('all')
  return <><section className="mw-panel"><h2>Мои события</h2><label>Статус<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Все события</option>{['Upcoming', 'Active', 'Completed', 'Cancelled'].map(value => <option key={value}>{value}</option>)}</select></label>
    <div className="mw-table"><table><thead><tr><th>Событие</th><th>Дата</th><th>Статус</th></tr></thead><tbody>{events.filter(event => status === 'all' || event.status === status).map(event => <tr key={event.id}><td>{event.title}</td><td>{event.date}</td><td>{event.status}</td></tr>)}</tbody></table></div></section>
    <section className="mw-panel"><h2>Журнал действий · Almaty Tech Night</h2><p>Отдельный пример журнала; фильтр выше применяется только к списку событий.</p><ol className="mw-timeline">{[['13.09 · 15:20', 'Demo Organizer', 'Изменён лимит промокампании STUDENT'], ['12.09 · 11:40', 'Demo Organizer', 'Вместимость изменена: 180 → 200'], ['08.09 · 09:00', 'Demo Organizer', 'Событие опубликовано']].map(([time, actor, action]) => <li key={time}><small>{time} · {actor}</small><p>{action}</p></li>)}</ol></section></>
}

export default function MiratWorkspace({ path }) {
  const title = screens.find(([route]) => route === path)?.[1]
  return <div className="mw"><aside><a className="mw-brand" href="/">biletflow<span>WORKSPACE / PHASE 01</span></a><nav aria-label="Макеты Мирата">{screens.map(([route, label]) => <a key={route} href={route} aria-current={path === route ? 'page' : undefined}>{label}</a>)}</nav><p>Мират · Admin & Analytics<br />Отчёт 01 / 14 сентября</p></aside><main><header><p className="mw-eyebrow">BILETFLOW · ПРОТОТИП ИНТЕРФЕЙСА</p><h1>{title}</h1><p className="mw-notice">Демо · вымышленные данные · без подключения API</p></header>{path === '/admin/login' ? <Login /> : path === '/admin' ? <Dashboard /> : path.endsWith('/new') ? <Campaign /> : path.endsWith('/analytics') ? <Analytics /> : <History />}</main></div>
}
