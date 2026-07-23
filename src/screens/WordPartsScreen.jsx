// src/screens/WordPartsScreen.jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const SECTIONS = [
  { key: 'prefix', label: 'Tiền tố', title: 'Prefix (tiền tố)', column: 'prefix', listKey: 'prefixes', get: api.getPrefixes, create: api.createPrefix, update: api.updatePrefix, remove: api.deletePrefix },
  { key: 'root', label: 'Gốc từ', title: 'Root (gốc từ)', column: 'root', listKey: 'roots', get: api.getRoots, create: api.createRoot, update: api.updateRoot, remove: api.deleteRoot },
  { key: 'suffix', label: 'Hậu tố', title: 'Suffix (hậu tố)', column: 'suffix', listKey: 'suffixes', get: api.getSuffixes, create: api.createSuffix, update: api.updateSuffix, remove: api.deleteSuffix },
];

function PartTable({ section }) {
  const [items, setItems] = useState([]);
  const [newText, setNewText] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const [error, setError] = useState(null);

  function reload() {
    section.get().then((data) => setItems(data[section.listKey])).catch((err) => setError(err.message));
  }

  useEffect(reload, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError(null);
    try {
      await section.create({ [section.column]: newText, meaning: newMeaning });
      setNewText('');
      setNewMeaning('');
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMeaningBlur(item, meaning) {
    try {
      await section.update(item.id, { [section.column]: item[section.column], meaning });
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await section.remove(id);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{section.title}</h3>
      {error && <div style={{ color: 'var(--red)', marginBottom: 10 }}>{error}</div>}
      <table className="table">
        <thead>
          <tr><th>{section.label}</th><th>Nghĩa</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={{ fontWeight: 600 }}>{item[section.column]}</td>
              <td>
                <input
                  className="input"
                  defaultValue={item.meaning || ''}
                  onBlur={(e) => handleMeaningBlur(item, e.target.value)}
                />
              </td>
              <td>
                <button className="btn btn-secondary" onClick={() => handleDelete(item.id)}>Xóa</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input className="input" placeholder={section.label} value={newText} onChange={(e) => setNewText(e.target.value)} />
        <input className="input" placeholder="Nghĩa" value={newMeaning} onChange={(e) => setNewMeaning(e.target.value)} />
        <button type="submit" className="btn btn-primary">Thêm</button>
      </form>
    </div>
  );
}

export default function WordPartsScreen() {
  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Gốc từ</h1>
      {SECTIONS.map((section) => <PartTable key={section.key} section={section} />)}
    </div>
  );
}
