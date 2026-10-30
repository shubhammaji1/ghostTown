import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
function Playground() {
  const path = location.pathname;
  const fixed = new URLSearchParams(location.search).get('fixed') === '1';
  const [result, setResult] = useState('');
  const [query, setQuery] = useState('');
  return (
    <main>
      <header>
        <span>GHOSTTOWN / CONTROLLED FIXTURES</span>
        <h1>Your first population.</h1>
        <p>Synthetic data. Deliberate failures. Evidence you can inspect.</p>
      </header>
      <nav>
        {[
          ['/', 'Home'],
          ['/register', 'Register'],
          ['/login', 'Login'],
          ['/search', 'Search'],
          ['/product', 'Product'],
          ['/contact', 'Contact'],
          ['/settings', 'Settings'],
        ].map(([href, name]) => (
          <a key={href} href={href}>
            {name}
          </a>
        ))}
      </nav>
      <section>
        <h2>{path === '/' ? 'Test playground' : path.slice(1)}</h2>
        {path === '/' && (
          <>
            <p>
              Registration intentionally fails. Add <code>?fixed=1</code> to repair it and rerun the
              same assertion.
            </p>
            <a href="/missing">Broken navigation</a>
            <p>
              <a href="/overflow">Mobile overflow fixture</a> ·{' '}
              <a href="/keyboard">Keyboard fixture</a>
            </p>
            <button
              onClick={() => {
                void fetch('/api/error').then(() =>
                  setResult('API request completed with a seeded error'),
                );
              }}
            >
              Trigger API error
            </button>
          </>
        )}
        {(path === '/register' || path === '/login' || path === '/contact') && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setResult(fixed ? 'Account created' : 'Processing…');
            }}
          >
            <label>
              Email
              <input id="email" type="email" required />
            </label>
            <label>
              Password
              <input id="password" type="password" required />
            </label>
            <button type="submit">Create account</button>
          </form>
        )}
        {path === '/search' && (
          <>
            <label>
              Search
              <input id="query" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button
              onClick={() => setResult(query ? 'Found synthetic result' : 'Enter a search term')}
            >
              Search
            </button>
          </>
        )}
        {path === '/product' && (
          <>
            <h3>Synthetic product</h3>
            <button onClick={() => setResult('Added synthetic item')}>Add to test basket</button>
          </>
        )}
        {path === '/settings' && (
          <>
            <label>
              Display name
              <input id="display-name" />
            </label>
            <button
              onClick={() => setResult(fixed ? 'Saved' : 'Saved — but no data was persisted')}
            >
              Save settings
            </button>
          </>
        )}
        {path === '/overflow' && (
          <div className="overflow">This content deliberately exceeds a phone viewport.</div>
        )}
        {path === '/keyboard' && (
          <div id="unreachable" onClick={() => setResult('Activated')}>
            Intentionally keyboard-inaccessible control
          </div>
        )}
        <p id="result" role="status">
          {result}
        </p>
      </section>
      <footer>Use disposable accounts only. These fixtures are not a real service.</footer>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Playground />);
