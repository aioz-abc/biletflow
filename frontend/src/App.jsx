import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold">Biletflow</h1>

          <nav className="flex gap-6">
            <Link to="/" className="text-gray-600 hover:text-black">
              Events
            </Link>

            <a href="#" className="text-gray-600 hover:text-black">
              Create Event
            </a>

            <Link to="/login" className="text-gray-600 hover:text-black">
              Login
            </Link>
          </nav>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </div>
  );
}

export default App;