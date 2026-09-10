function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold">Biletflow</h1>

          <nav className="flex gap-6">
            <a href="#" className="text-gray-600 hover:text-black">
              Events
            </a>
            <a href="#" className="text-gray-600 hover:text-black">
              Create Event
            </a>
            <a href="#" className="text-gray-600 hover:text-black">
              Login
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-6 py-20">
          <h2 className="max-w-3xl text-5xl font-bold tracking-tight">
            Discover events in Kazakhstan
          </h2>

          <p className="mt-6 max-w-2xl text-lg text-gray-600">
            Find events, get your digital tickets, and enjoy your experience.
          </p>

          <div className="mt-8 flex gap-4">
            <button className="rounded-lg bg-black px-6 py-3 font-medium text-white">
              Explore events
            </button>

            <button className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium">
              Create an event
            </button>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-20">
          <h3 className="text-2xl font-semibold">Upcoming events</h3>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border bg-white p-6">
              <h4 className="text-xl font-semibold">Event name</h4>
              <p className="mt-2 text-gray-600">Astana · September 20</p>
            </div>

            <div className="rounded-xl border bg-white p-6">
              <h4 className="text-xl font-semibold">Event name</h4>
              <p className="mt-2 text-gray-600">Almaty · September 25</p>
            </div>

            <div className="rounded-xl border bg-white p-6">
              <h4 className="text-xl font-semibold">Event name</h4>
              <p className="mt-2 text-gray-600">Astana · October 2</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App