import { NavLink, Outlet } from 'react-router-dom'

const linkClass = ({ isActive }) =>
  `block rounded px-3 py-2 ${isActive ? 'bg-gray-200 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`

// Organizer dashboard shell: side navigation + the page in <Outlet />.
// Mirat's analytics views (SRS 4.15) get their own child route and link here.
export default function OrganizerLayout() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 md:flex-row">
      <nav aria-label="Organizer" className="shrink-0 md:w-52">
        <ul className="flex flex-wrap gap-1 md:flex-col">
          <li><NavLink to="/organizer" end className={linkClass}>Overview</NavLink></li>
          <li><NavLink to="/organizer/events" end className={linkClass}>My events</NavLink></li>
          <li><NavLink to="/organizer/events/new" className={linkClass}>Create event</NavLink></li>
          <li><NavLink to="/support" className={linkClass}>Support cases</NavLink></li>
          {/* Mirat's campaign portal is a separate page with its own login (main.jsx) */}
          <li>
            <a href="/organizer/campaigns/new" className={linkClass({ isActive: false })}>Promo campaigns ↗</a>
          </li>
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
