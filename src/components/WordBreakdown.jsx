// src/components/WordBreakdown.jsx
import React from 'react';

const CHIP_CLASS = {
  prefix: 'chip-1',
  root: 'chip-2',
  suffix: 'chip-1',
  combining_form: 'chip-1',
};

export default function WordBreakdown({ word, onRootClick }) {
  const parts = word.word_components || [];
  if (parts.length === 0) return null;

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Word breakdown</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {parts.map((part, i) => {
          const { component } = part;
          const chipClass = CHIP_CLASS[component.component_type] || 'chip-1';
          const isRoot = component.component_type === 'root';
          return (
            <React.Fragment key={part.position}>
              {i > 0 && <span style={{ color: 'var(--ink-3)', marginTop: 6 }}>+</span>}
              <div style={{ textAlign: 'center' }}>
                {isRoot && onRootClick ? (
                  <button
                    className={`chip ${chipClass}`}
                    style={{ border: 'none', cursor: 'pointer' }}
                    onClick={() => onRootClick(component)}
                  >
                    {component.text}
                  </button>
                ) : (
                  <span className={`chip ${chipClass}`}>{component.text}</span>
                )}
                {component.meaning && (
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{component.meaning}</div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
