import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function SettingsScreen() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api.getSettings().then(setSettings).catch((err) => setMessage({ type: 'error', text: err.message }));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.updateSettings(settings);
      setSettings(saved);
      setMessage({ type: 'success', text: 'Đã lưu' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Settings</h1>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Số từ mới tối đa mỗi ngày</label>
          <input
            className="input"
            type="number"
            min="1"
            value={settings ? settings.new_daily_limit : ''}
            disabled={!settings}
            onChange={(e) => setSettings({ ...settings, new_daily_limit: Number(e.target.value) })}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Số lượt ôn tối đa mỗi ngày</label>
          <input
            className="input"
            type="number"
            min="1"
            value={settings ? settings.review_daily_limit : ''}
            disabled={!settings}
            onChange={(e) => setSettings({ ...settings, review_daily_limit: Number(e.target.value) })}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Giọng đọc (TTS)</label>
          <div className="seg">
            <span className="seg-opt checked">en-US</span>
            <span className="seg-opt">en-GB</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={!settings || saving}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
          {message && (
            <span style={{ fontSize: 13, color: message.type === 'error' ? 'var(--red)' : 'var(--green)' }}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
