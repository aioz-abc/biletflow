import { Routes, Route, Link, useLocation } from "react-router-dom";
import { useAuth } from "./auth/auth";
import RequireOrganizer from "./auth/RequireOrganizer.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import CreateEvent from "./pages/CreateEvent.jsx";
import EventDetail from "./pages/EventDetail.jsx";

function App() {
  const { user, isOrganizer, logout } = useAuth();
  const location = useLocation();
  // Login/Register are modals: keep Home rendered underneath them
  const isAuthModal = ["/login", "/register"].includes(location.pathname);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-2xl font-bold">Begemot.com</Link>

          <nav className="flex items-center gap-6">
            <Link to="/" className="text-gray-600 hover:text-black">
              Events
            </Link>

            {(!user || isOrganizer) && (
              <Link to="/organizer/events/new" className="text-gray-600 hover:text-black">
                Create Event
              </Link>
            )}

            {user ? (
              <>
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
        <Route path="/events/:id" element={<EventDetail />} />
        <Route
          path="/organizer/events/new"
          element={
            <RequireOrganizer>
              <CreateEvent />
            </RequireOrganizer>
          }
        />
      </Routes>
    </div>
  );
}

export default App;
