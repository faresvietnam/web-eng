// src/screens/WordPartsScreen.jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const SECTIONS = [
  { type: 'prefix', label: 'Tiền tố', title: 'Prefix (tiền tố)' },
  { type: 'root', label: 'Gốc từ', title: 'Root (gốc từ)' },
  { type: 'suffix', label: 'Hậu tố', title: 'Suffix (hậu tố)' },
  { type: 'combining_form', label: 'Dạng kết hợp', title: 'Combining form (dạng kết hợp)' },
];

function PartTable({ section }) {
  const [items, setItems] = useState([]);
  const [newText, setNewText] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const [newRootSubtype, setNewRootSubtype] = useState('');
  const [error, setError] = useState(null);
  const isRoot = section.type === 'root';

  function reload() {
    api.getComponents(section.type).then((data) => setItems(data.components)).catch((err) => setError(err.message));
  }

  useEffect(reload, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createComponent({
        component_type: section.type,
        text: newText,
        meaning: newMeaning,
        root_subtype: isRoot && newRootSubtype ? newRootSubtype : null,
      });
      setNewText('');
      setNewMeaning('');
      setNewRootSubtype('');
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMeaningBlur(item, meaning) {
    try {
      await api.updateComponent(item.id, {
        component_type: section.type,
        text: item.text,
        meaning,
        root_subtype: item.root_subtype,
      });
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRootSubtypeChange(item, rootSubtype) {
    try {
      await api.updateComponent(item.id, {
        component_type: section.type,
        text: item.text,
        meaning: item.meaning,
        root_subtype: rootSubtype || null,
      });
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteComponent(id);
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
          <tr><th>{section.label}</th><th>Nghĩa</th>{isRoot && <th>Loại</th>}<th></th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={{ fontWeight: 600 }}>{item.text}</td>
              <td>
                <input
                  className="input"
                  defaultValue={item.meaning || ''}
                  onBlur={(e) => handleMeaningBlur(item, e.target.value)}
                />
              </td>
              {isRoot && (
                <td>
                  <select
                    className="input"
                    defaultValue={item.root_subtype || ''}
                    onChange={(e) => handleRootSubtypeChange(item, e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="free_root">Free</option>
                    <option value="bound_root">Bound</option>
                  </select>
                </td>
              )}
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
        {isRoot && (
          <select className="input" value={newRootSubtype} onChange={(e) => setNewRootSubtype(e.target.value)}>
            <option value="">—</option>
            <option value="free_root">Free</option>
            <option value="bound_root">Bound</option>
          </select>
        )}
        <button type="submit" className="btn btn-primary">Thêm</button>
      </form>
    </div>
  );
}

export default function WordPartsScreen() {
  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Gốc từ</h1>
      {SECTIONS.map((section) => <PartTable key={section.type} section={section} />)}
    </div>
  );
}
