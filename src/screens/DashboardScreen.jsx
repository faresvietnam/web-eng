import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUS_TAG_CLASS = { new: 'tag-new', learning: 'tag-learning', difficult: 'tag-difficult' };

function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
}

export default function DashboardScreen({ onViewAllDifficult }) {
  const [summary, setSummary] = useState(null);
  const [chart, setChart] = useState(null);
  const [previewCards, setPreviewCards] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [chartDays, setChartDays] = useState(7);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getDashboard().then(setSummary).catch((err) => setError(err.message));
    api.getToday().then((data) => setPreviewCards(data.cards)).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    api.getReviewsChart(chartDays).then((data) => setChart(data.days)).catch((err) => setError(err.message));
  }, [chartDays]);

  if (error) return <div className="card" style={{ color: 'var(--red)' }}>Không tải được dashboard: {error}</div>;
  if (!summary || !chart || !previewCards) return <div>Đang tải...</div>;

  const maxCount = Math.max(1, ...chart.map((d) => d.new_learned + d.reviewed_count));
  const previewCard = previewCards.length > 0 ? previewCards[previewIndex % previewCards.length] : null;
  const totalWords = (summary.totals.new || 0) + (summary.totals.learning || 0) + (summary.totals.difficult || 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
      <div>
        <div className="card">
          <h2 style={{ margin: '0 0 14px', fontSize: 16 }}>Mục tiêu hôm nay</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>
            <span>Reviews</span><span>{summary.reviewed_today} / {summary.review_limit}</span>
          </div>
          <div className="bar-track" style={{ marginBottom: 16 }}>
            <div className="bar-fill" style={{ width: `${Math.min(100, (summary.reviewed_today / summary.review_limit) * 100)}%` }} />
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 13, color: 'var(--ink-2)' }}>
            <div>Tổng số từ <strong style={{ color: 'var(--ink)' }}>{totalWords}</strong></div>
            <div>New <strong style={{ color: 'var(--sb-dark)' }}>{summary.totals.new || 0}</strong></div>
            <div>Learning <strong style={{ color: 'var(--ink)' }}>{summary.totals.learning || 0}</strong></div>
            <div>Difficult <strong style={{ color: 'var(--red)' }}>{summary.totals.difficult || 0}</strong></div>
          </div>
        </div>

        {previewCard && (
          <div className="card" style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className={`tag ${STATUS_TAG_CLASS[previewCard.review_state.status] || 'tag-new'}`}>{previewCard.review_state.status}</span>
                {previewCard.word.part_of_speech && <span className="tag tag-pos">{previewCard.word.part_of_speech}</span>}
              </div>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{(previewIndex % previewCards.length) + 1}/{previewCards.length}</span>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 38, margin: 0, fontWeight: 800 }}>{previewCard.word.word}</h1>
                <button className="btn" style={{ borderRadius: '50%', width: 32, height: 32, padding: 0 }} onClick={() => speak(previewCard.word.word)} aria-label="Phát âm">🔊</button>
              </div>
              {previewCard.word.ipa && <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{previewCard.word.ipa}</span>}
            </div>
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Meaning (Vietnamese)</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{previewCard.word.meaning}</div>
            </div>
            {previewCard.word.segments && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Word breakdown</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {previewCard.word.segments.split('|').map((seg, i) => (
                    <React.Fragment key={seg}>
                      {i > 0 && <span style={{ color: 'var(--ink-3)' }}>+</span>}
                      <span className={`chip ${i === 0 ? 'chip-1' : 'chip-2'}`}>{seg}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
            {previewCard.word.example && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Example sentence</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{previewCard.word.example}</div>
                <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--ink-3)' }}>{previewCard.word.example_vi}</div>
              </div>
            )}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setPreviewIndex((i) => i + 1)}>Next</button>
          </div>
        )}
      </div>

      <div>
        <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Today</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <div className="stat"><div className="stat-label">New words</div><div className="stat-value" style={{ color: 'var(--sb-dark)' }}>{summary.new_learned_today}/{summary.new_limit}</div></div>
          <div className="stat"><div className="stat-label">Reviews due</div><div className="stat-value" style={{ color: 'var(--orange)' }}>{summary.due_count}</div></div>
          <div className="stat"><div className="stat-label">Streak</div><div className="stat-value" style={{ color: 'var(--green)' }}>{summary.streak}</div></div>
          <div className="stat"><div className="stat-label">Accuracy</div><div className="stat-value" style={{ color: 'var(--purple)' }}>{summary.accuracy === null ? 'N/A' : `${Math.round(summary.accuracy * 100)}%`}</div></div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Reviews</h3>
            <select
              className="input"
              style={{ width: 'auto', fontSize: 12, padding: '3px 8px' }}
              value={chartDays}
              onChange={(e) => setChartDays(Number(e.target.value))}
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 100 }}>
            {chart.map((d) => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', borderRadius: '6px 6px 0 0', background: 'var(--sb-light)', height: `${((d.new_learned + d.reviewed_count) / maxCount) * 100}%` }} />
                <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{d.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Difficult / Forgotten words</h3>
            <a
              href="#"
              style={{ fontSize: 12, fontWeight: 600 }}
              onClick={(e) => { e.preventDefault(); onViewAllDifficult && onViewAllDifficult(); }}
            >
              View all →
            </a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {summary.difficult_words.map((s) => (
              <div key={s.word_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.words.word}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{s.words.meaning}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>Forgotten {s.failure_count}x</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
