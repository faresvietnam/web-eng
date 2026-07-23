import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';

const EMPTY_FORM = { word: '', meaning: '', category: '', part_of_speech: '', ipa: '', example: '', example_vi: '', prefix: '', root: '', suffix: '' };

const FIELDS = [
  { key: 'word', label: 'Word', placeholder: 'unbelievable' },
  { key: 'meaning', label: 'Meaning', placeholder: 'không thể tin được' },
  { key: 'category', label: 'Category', placeholder: 'appearance' },
  { key: 'part_of_speech', label: 'Part of speech', placeholder: 'adjective' },
  { key: 'ipa', label: 'IPA', placeholder: '/ʌnbɪˈliːvəbl/' },
  { key: 'prefix', label: 'Prefix', placeholder: 'un' },
  { key: 'root', label: 'Root', placeholder: 'believ' },
  { key: 'suffix', label: 'Suffix', placeholder: 'able' },
];

const TEMPLATE_CSV =
  'word,meaning,category,part_of_speech,ipa,example,example_vi,prefix,root,suffix\n' +
  'unbelievable,không thể tin được,appearance,adjective,/ʌnbɪˈliːvəbl/,It is unbelievable.,Nó thật khó tin.,un,believ,able\n';
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`;

export default function ImportScreen({ editingWord, onDone }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [formError, setFormError] = useState(null);
  const [importError, setImportError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

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
        prefix: editingWord.prefix?.prefix || '',
        root: editingWord.root?.root || '',
        suffix: editingWord.suffix?.suffix || '',
      });
    }
  }, [editingWord]);

  function handleFieldChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function readCsvFile(file) {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result));
    reader.onerror = () => setImportError('Không đọc được file. Vui lòng thử lại.');
    reader.readAsText(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) readCsvFile(file);
  }

  function handleFileInputChange(e) {
    const file = e.target.files && e.target.files[0];
    if (file) readCsvFile(file);
    e.target.value = '';
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
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            style={{
              border: `1.5px dashed ${isDragging ? 'var(--sb)' : 'var(--line)'}`,
              borderRadius: 12,
              padding: 32,
              textAlign: 'center',
              background: '#fafafa',
            }}
          >
            <div style={{ fontSize: 15, marginBottom: 4 }}>Drag &amp; drop a CSV file here</div>
            <a
              href="#"
              style={{ fontSize: 14, fontWeight: 600 }}
              onClick={(e) => { e.preventDefault(); fileInputRef.current.click(); }}
            >
              or click to browse
            </a>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
          </div>
          <div className="card" style={{ background: '#fafafa' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>CSV format tip</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 10 }}>
              Columns: word, meaning, category, part_of_speech, ipa, example, example_vi, prefix, root, suffix
            </div>
            <a href={TEMPLATE_HREF} download="template.csv" style={{ fontSize: 13, fontWeight: 600 }}>
              ↓ Download template.csv
            </a>
          </div>
        </div>
        <form onSubmit={handleImport}>
          <textarea
            className="input"
            rows={4}
            placeholder="word,meaning,category,part_of_speech,ipa,example,example_vi,prefix,root,suffix"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>Import</button>
        </form>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 10 }}>
          CSV format tip — Columns: word, meaning, category, part_of_speech, ipa, example, example_vi, prefix, root, suffix
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
