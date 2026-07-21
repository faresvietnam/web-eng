import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' },
  { key: 'difficult', label: 'Difficult' },
];

const STATUS_TAG_CLASS = { new: 'tag-new', learning: 'tag-learning', difficult: 'tag-difficult' };
const STATUS_LABEL = { new: 'New', learning: 'Learning', difficult: 'Difficult' };

function formatNextReview(iso) {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'Hôm nay';
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `${minutes} phút nữa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ nữa`;
  const days = Math.round(hours / 24);
  return `${days} ngày nữa`;
}

export default function VocabularyScreen({ onEdit }) {
  const [words, setWords] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  function reload() {
    const params = {};
    if (filter !== 'all') params.status = filter;
    if (search) params.q = search;
    api.getWords(params).then((data) => setWords(data.words));
  }

  useEffect(reload, [filter, search]);

  async function handleDelete(id) {
    await api.deleteWord(id);
    reload();
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, margin: '0 0 20px' }}>Danh sách từ vựng</h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="seg">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`seg-opt${filter === f.key ? ' checked' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ width: 260 }}
          placeholder="Tìm theo từ, nghĩa, chủ đề..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="card" style={{ padding: 4 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Từ</th><th>Loại từ</th><th>Nghĩa</th><th>Chủ đề</th><th>Trạng thái</th><th>Ôn tiếp theo</th><th></th>
            </tr>
          </thead>
          <tbody>
            {words.map((w) => {
              const state = w.review_state?.[0];
              const status = state?.status || 'new';
              return (
                <tr key={w.id}>
                  <td style={{ fontWeight: 600 }}>{w.word}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{w.part_of_speech}</td>
                  <td>{w.meaning}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{w.category}</td>
                  <td><span className={`tag ${STATUS_TAG_CLASS[status]}`}>{STATUS_LABEL[status]}</span></td>
                  <td style={{ color: 'var(--ink-2)' }}>{state ? formatNextReview(state.next_review_at) : ''}</td>
                  <td>
                    <button className="btn btn-secondary" onClick={() => onEdit(w)}>Sửa</button>{' '}
                    <button className="btn btn-secondary" onClick={() => handleDelete(w.id)}>Xóa</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
