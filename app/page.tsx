export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Federal Retirement Planner</h1>
      <p>
        Phase 0 scaffold. The calculation engine lives under <code>/lib</code> and is built and
        tested before any UI.
      </p>
      <p style={{ fontSize: '0.85rem', color: '#555' }}>
        Estimates and educational projections only — not financial, tax, or legal advice. Confirm
        with the Government of Canada Pension Centre and a qualified advisor before acting.
      </p>
    </main>
  );
}
