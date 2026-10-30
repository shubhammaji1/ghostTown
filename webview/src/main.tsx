import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Config } from '../../packages/shared/src/index.js';
import './style.css';
declare function acquireVsCodeApi(): { postMessage: (message: unknown) => void };
const vscode = acquireVsCodeApi();
function Studio() {
  const [config, setConfig] = useState<Config>();
  const [tab, setTab] = useState<'personas' | 'scenarios'>('personas');
  const [selected, setSelected] = useState(0);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.data?.type === 'state') {
        setConfig(event.data.config);
        setDirty(false);
        setMessage('Configuration loaded');
      }
      if (event.data?.type === 'result') setMessage(String(event.data.message));
    };
    window.addEventListener('message', receive);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    if (config) {
      const item = config[tab][selected];
      setText(item ? JSON.stringify(item, null, 2) : '');
    }
  }, [config, tab, selected]);
  if (!config)
    return (
      <main>
        <h1>GhostTown Studio</h1>
        <p role="status">Loading project configuration…</p>
      </main>
    );
  const items = config[tab];
  function update(next: Config) {
    setConfig(next);
    setDirty(true);
    setMessage('Unsaved changes');
  }
  function apply() {
    try {
      const item = JSON.parse(text);
      const next = structuredClone(config!);
      (next[tab] as unknown[])[selected] = item;
      update(next);
    } catch {
      setMessage('Enter valid JSON before applying changes');
    }
  }
  function duplicate() {
    const next = structuredClone(config!);
    const item = structuredClone(next[tab][selected]);
    if (!item) return;
    item.id = `${item.id.slice(0, 45)}-copy-${Date.now().toString(36)}`;
    item.name += ' (copy)';
    (next[tab] as unknown[]).push(item);
    update(next);
    setSelected(next[tab].length - 1);
  }
  function remove() {
    const next = structuredClone(config!);
    if (next[tab].length < 2) {
      setMessage('Keep at least one item');
      return;
    }
    next[tab].splice(selected, 1);
    setSelected(Math.max(0, selected - 1));
    update(next);
  }
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">LOCAL USER TESTING</p>
          <h1>GhostTown Studio</h1>
          <p>Define who explores, what they do, and what success means.</p>
        </div>
        <span className="badge">{config.mode}</span>
      </header>
      <section className="target">
        <label htmlFor="target">Target on extension host</label>
        <input
          id="target"
          value={config.target}
          onChange={(e) => update({ ...config, target: e.target.value })}
        />
        <label htmlFor="mode">Mode</label>
        <select
          id="mode"
          value={config.mode}
          onChange={(e) => update({ ...config, mode: e.target.value as Config['mode'] })}
        >
          <option>deterministic</option>
          <option>ai</option>
          <option>hybrid</option>
        </select>
      </section>
      <nav aria-label="Configuration type">
        <button
          className={tab === 'personas' ? 'active' : ''}
          onClick={() => {
            setTab('personas');
            setSelected(0);
          }}
        >
          Population · {config.personas.length}
        </button>
        <button
          className={tab === 'scenarios' ? 'active' : ''}
          onClick={() => {
            setTab('scenarios');
            setSelected(0);
          }}
        >
          Scenarios · {config.scenarios.length}
        </button>
      </nav>
      <div className="workspace">
        <section className="items" aria-label={tab}>
          {items.map((item, index) => (
            <button
              key={index}
              className={`item ${selected === index ? 'selected' : ''}`}
              onClick={() => setSelected(index)}
            >
              <strong>{item.name}</strong>
              <span>{item.id}</span>
            </button>
          ))}
        </section>
        <section className="editor">
          <div className="toolbar">
            <strong>{items[selected]?.name}</strong>
            <button onClick={duplicate}>Duplicate</button>
            <button onClick={remove}>Delete</button>
          </div>
          <label htmlFor="definition">Validated JSON definition</label>
          <textarea
            id="definition"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button onClick={apply}>Apply definition</button>
          <p className="hint">
            AI exploration uses only explicit explorationSelectors. Assertions always verify the
            final outcome. Values and goals must use synthetic data.
          </p>
        </section>
      </div>
      <footer>
        <div role="status" aria-live="polite">
          {message}
        </div>
        <div className="actions">
          <button onClick={() => vscode.postMessage({ type: 'import' })}>Import config</button>
          <button onClick={() => vscode.postMessage({ type: 'export', config })}>
            Export config
          </button>
          <button className="primary" onClick={() => vscode.postMessage({ type: 'save', config })}>
            Save project{dirty ? ' *' : ''}
          </button>
        </div>
      </footer>
      <p className="hint">
        Apply definition before saving. Configuration is schema validated by the extension. Live
        runs and evidence remain separate from this editor.
      </p>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Studio />);
