import { Routes, Route, Link, useLocation } from "react-router-dom";
import { useAuth } from "./auth/auth";
import RequireAuth from "./auth/RequireAuth.jsx";
import RequireOrganizer from "./auth/RequireOrganizer.jsx";
import Account from "./pages/Account.jsx";
import Checkout from "./pages/Checkout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import EventSales from "./pages/EventSales.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import CreateEvent from "./pages/CreateEvent.jsx";
import EventDetail from "./pages/EventDetail.jsx";
import MyEvents from "./pages/MyEvents.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Ticket from "./pages/Ticket.jsx";
import OrganizerLayout from "./components/OrganizerLayout.jsx";

function App() {
  const { user, isOrganizer, logout } = useAuth();
  const location = useLocation();
  // Login/Register are modals: keep Home rendered underneath them
  const isAuthModal = ["/login", "/register", "/forgot-password", "/reset-password"].includes(location.pathname);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-2xl font-bold">Begemot.com</Link>

          <nav className="flex items-center gap-6">
            <Link to="/" className="text-gray-600 hover:text-black">
              Events
            </Link>

            {!user && (
              <Link to="/organizer/events/new" className="text-gray-600 hover:text-black">
                Create Event
              </Link>
            )}

            {isOrganizer && (
              <Link to="/organizer" className="text-gray-600 hover:text-black">
                Dashboard
              </Link>
            )}

            {user ? (
              <>
                <Link to="/account" className="text-gray-600 hover:text-black">
                  My Tickets
                </Link>
                <span className="text-gray-600">{user.first_name || user.email}</span>
                <button onClick={logout} className="text-gray-600 hover:text-black">
                  Logout
                </button>
              </>
            ) : (
              <Link to="/login" className="text-gray-600 hover:text-black">
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>

      {isAuthModal && <Home />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/checkout/:orderId" element={<RequireAuth><Checkout /></RequireAuth>} />
        <Route path="/tickets/:id" element={<RequireAuth><Ticket /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="/organizer" element={<RequireOrganizer><OrganizerLayout /></RequireOrganizer>}>
          <Route index element={<Dashboard />} />
          <Route path="events" element={<MyEvents />} />
          {/* Keys: leaving an edit page for "new" must start from an empty form */}
          <Route path="events/new" element={<CreateEvent key="new" />} />
          <Route path="events/:id" element={<EventSales />} />
          <Route path="events/:id/edit" element={<CreateEvent key="edit" />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
