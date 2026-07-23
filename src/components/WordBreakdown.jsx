// src/components/WordBreakdown.jsx
import React from 'react';

const PART_CONFIG = [
  { key: 'prefix', chipClass: 'chip-1', getText: (data) => data.prefix },
  { key: 'root', chipClass: 'chip-2', getText: (data) => data.root },
  { key: 'suffix', chipClass: 'chip-1', getText: (data) => data.suffix },
];

export default function WordBreakdown({ word, onRootClick }) {
  const parts = PART_CONFIG
    .map((cfg) => (word[cfg.key] ? { ...cfg, data: word[cfg.key] } : null))
    .filter(Boolean);

  if (parts.length === 0) return null;

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Word breakdown</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {parts.map((part, i) => {
          const text = part.getText(part.data);
          return (
            <React.Fragment key={part.key}>
              {i > 0 && <span style={{ color: 'var(--ink-3)', marginTop: 6 }}>+</span>}
              <div style={{ textAlign: 'center' }}>
                {part.key === 'root' && onRootClick ? (
                  <button
                    className={`chip ${part.chipClass}`}
                    style={{ border: 'none', cursor: 'pointer' }}
                    onClick={() => onRootClick(part.data)}
                  >
                    {text}
                  </button>
                ) : (
                  <span className={`chip ${part.chipClass}`}>{text}</span>
                )}
                {part.data.meaning && (
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{part.data.meaning}</div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
