import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const EMPTY_FORM = { word: '', meaning: '', category: '', part_of_speech: '', ipa: '', example: '', example_vi: '', segments: '' };

const FIELDS = [
  { key: 'word', label: 'Word', placeholder: 'beautiful' },
  { key: 'meaning', label: 'Meaning', placeholder: 'đẹp' },
  { key: 'category', label: 'Category', placeholder: 'appearance' },
  { key: 'part_of_speech', label: 'Part of speech', placeholder: 'adjective' },
  { key: 'ipa', label: 'IPA', placeholder: '/ˈbjuːtɪfəl/' },
  { key: 'segments', label: 'Segments', placeholder: 'beauty|ful' },
];

export default function ImportScreen({ editingWord, onDone }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [formError, setFormError] = useState(null);
  const [importError, setImportError] = useState(null);

  useEffect(() => {
    if (editingWord) {
      setForm({
        word: editingWord.word,
        meaning: editingWord.meaning,
        category: editingWord.category || '',
        part_of_speech: editingWord.part_of_speech || '',
        ipa: editingWord.ipa || '',
        example: editingWord.example || '',
        example_vi: editingWord.example_vi || '',
        segments: editingWord.segments || '',
      });
    }
  }, [editingWord]);

  function handleFieldChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    try {
      if (editingWord) {
        await api.updateWord(editingWord.id, form);
      } else {
        await api.createWord(form);
      }
      setForm(EMPTY_FORM);
      onDone();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function handleImport(e) {
    e.preventDefault();
    setImportError(null);
    try {
      const result = await api.importCsv(csvText);
      setImportResult(result);
      setCsvText('');
    } catch (err) {
      setImportError(err.message);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Import vocabulary</h1>

      <div className="card">
        <div className="seg" style={{ marginBottom: 16 }}>
          <span className="seg-opt checked">CSV / Excel</span>
          <span className="seg-opt">Paste text</span>
          <span className="seg-opt">From clipboard</span>
        </div>
        <form onSubmit={handleImport}>
          <textarea
            className="input"
            rows={4}
            placeholder="word,meaning,category,part_of_speech,ipa,example,example_vi,segments"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>Import</button>
        </form>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 10 }}>
          CSV format tip — Columns: word, meaning, category, part_of_speech, ipa, example, example_vi, segments
        </div>
        {importError && <div style={{ color: 'var(--red)', marginTop: 10 }}>{importError}</div>}
        {importResult && (
          <div style={{ marginTop: 10 }}>
            <p>Đã import: {importResult.imported}</p>
            {importResult.errors.length > 0 && (
              <ul>
                {importResult.errors.map((e, i) => <li key={i}>Dòng {e.line}: {e.reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 16, margin: '0 0 12px' }}>{editingWord ? 'Sửa từ' : 'Hoặc thêm thủ công'}</h3>
      <form className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} onSubmit={handleSubmit}>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{f.label}</label>
            <input
              className="input"
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={(e) => handleFieldChange(f.key, e.target.value)}
            />
          </div>
        ))}
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Example</label>
          <input className="input" placeholder="She has a beautiful smile." value={form.example} onChange={(e) => handleFieldChange('example', e.target.value)} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Example (VI)</label>
          <input className="input" placeholder="Cô ấy có nụ cười đẹp." value={form.example_vi} onChange={(e) => handleFieldChange('example_vi', e.target.value)} />
        </div>
        {formError && <div style={{ gridColumn: 'span 2', color: 'var(--red)' }}>{formError}</div>}
        <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary">Lưu từ</button>
          {editingWord && <button type="button" className="btn btn-secondary" onClick={onDone}>Hủy</button>}
        </div>
      </form>
    </div>
  );
}
