import React from 'react';

export default function SettingsScreen() {
  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Settings</h1>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Số từ mới tối đa mỗi ngày</label>
          <input className="input" type="number" value={20} readOnly />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Số lượt ôn tối đa mỗi ngày</label>
          <input className="input" type="number" value={100} readOnly />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Giọng đọc (TTS)</label>
          <div className="seg">
            <span className="seg-opt checked">en-US</span>
            <span className="seg-opt">en-GB</span>
          </div>
        </div>
      </div>
    </div>
  );
}
