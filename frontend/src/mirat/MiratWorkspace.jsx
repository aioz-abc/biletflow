import { useState } from 'react'
import './workspace.css'
import { screens } from './routes.js'

const events = [
  { id: 1, title: 'Almaty Tech Night', date: '25 сентября 2026', status: 'Upcoming' },
  { id: 2, title: 'Campus Open Day', date: '13 сентября 2026', status: 'Active' },
  { id: 3, title: 'Design Meetup', date: '10 сентября 2026', status: 'Completed' },
  { id: 4, title: 'Autumn Concert', date: '12 сентября 2026', status: 'Cancelled' },
]
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
  return <div className="mw"><aside><a className="mw-brand" href="/">biletflow<span>WORKSPACE / PHASE 01</span></a><nav aria-label="Макеты Мирата">{screens.map(([route, label]) => <a key={route} href={route} aria-current={path === route ? 'page' : undefined}>{label}</a>)}</nav><p>Мират · Admin & Analytics<br />Отчёт 01 / 14 сентября</p></aside><main><header><p className="mw-eyebrow">BILETFLOW · ПРОТОТИП ИНТЕРФЕЙСА</p><h1>{title}</h1><p className="mw-notice">Демо · вымышленные данные · без подключения API</p></header>{path.endsWith('/analytics') ? <Analytics /> : <History />}</main></div>
}
