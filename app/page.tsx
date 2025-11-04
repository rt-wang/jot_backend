export default function HomePage() {
  return (
    <div style={{ 
      fontFamily: 'system-ui, sans-serif', 
      padding: '2rem',
      maxWidth: '600px',
      margin: '0 auto'
    }}>
      <h1>Memory Lens API</h1>
      <p>Backend server is running.</p>
      <ul>
        <li>
          <a href="/api/health" style={{ color: '#0070f3' }}>
            GET /api/health
          </a> - Health check
        </li>
      </ul>
      <p style={{ marginTop: '2rem', color: '#666' }}>
        See <a href="https://github.com" style={{ color: '#0070f3' }}>documentation</a> for API usage.
      </p>
    </div>
  );
}

