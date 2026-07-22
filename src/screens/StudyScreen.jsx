import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { speak } from '../speak.js';

const STATUS_TAG_CLASS = { new: 'tag-new', learning: 'tag-learning', difficult: 'tag-difficult' };

function buildMcOptions(correctWord, pool, byField) {
  const others = pool.filter((w) => w.id !== correctWord.id);
  const sameCategory = others.filter((w) => w.category === correctWord.category);
  const candidates = sameCategory.length >= 3 ? sameCategory : others;
  const distractors = [...candidates].sort(() => Math.random() - 0.5).slice(0, 3);
  const options = [...distractors, correctWord].sort(() => Math.random() - 0.5);
  return options.map((w) => ({ id: w.id, label: byField(w) }));
}

export default function StudyScreen() {
  const [cards, setCards] = useState(null);
  const [allWords, setAllWords] = useState([]);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [outcome, setOutcome] = useState('good');
  const [mistakeMade, setMistakeMade] = useState(false);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [inputError, setInputError] = useState(false);

  useEffect(() => {
    api.getToday().then((data) => setCards(data.cards));
    api.getWords().then((data) => setAllWords(data.words)).catch(() => {});
  }, []);

  // Every hook below must run unconditionally on every render, before any
  // early return — otherwise React sees a different number of hooks called
  // between the loading/empty/done states and the loaded state, crashing
  // with "Rendered more hooks than during the previous render". So `card`
  // and everything derived from it are computed null-safely here, and the
  // early-return checks happen further down, after all hooks have run.
  const card = cards && index < cards.length ? cards[index] : null;
  const word = card ? card.word : null;
  const exercise_type = card ? card.exercise_type : null;
  const status = card && card.review_state ? card.review_state.status : 'new';
  const segments = word && word.segments ? word.segments.split('|') : [];
  const distractorPool = allWords.length > 0 ? allWords : cards ? cards.map((c) => c.word) : [];

  // Computed once per card (keyed on the `word` object reference, which is
  // stable across re-renders of the same card but changes when the card
  // actually changes) so the option order/sample doesn't reshuffle when
  // answering triggers a re-render — otherwise the user's actual wrong pick
  // can vanish from the list on the reveal frame. Keying on `index` alone is
  // NOT enough: on the very first render `cards` is still null (so `word` is
  // null) while `index` is already 0, and once `cards` loads a moment later
  // `index` is still 0 — so a `[index]`-only memo would stay locked onto the
  // stale "no word yet" result of `null` forever.
  const mcOptions = useMemo(() => {
    if (!word) return null;
    if (exercise_type === 'mc_en_vi') return buildMcOptions(word, distractorPool, (w) => w.meaning);
    if (exercise_type === 'mc_vi_en') return buildMcOptions(word, distractorPool, (w) => w.word);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);

  // The word is the question itself only for mc_en_vi — auto-read it as soon
  // as the question appears.
  useEffect(() => {
    if (word && exercise_type === 'mc_en_vi') speak(word.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);

  // For segment/full_type, the word only appears once revealed (after a
  // correct submit or "Xem đáp án") — read it at that point. mc_vi_en is
  // handled separately in handleMcChoice (reads the chosen option instead).
  useEffect(() => {
    if (answered && (exercise_type === 'segment' || exercise_type === 'full_type')) {
      speak(word.word);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered]);

  if (cards === null) return <div>Đang tải...</div>;
  if (cards.length === 0) return <div>Không có thẻ nào cần học hôm nay 🎉</div>;
  if (index >= cards.length) return <div>Đã hoàn thành hàng đợi hôm nay 🎉</div>;

  function goNext() {
    api.postReview(word.id, { exercise_type, result: outcome })
      .catch(() => {})
      .finally(() => {
        setAnswered(false);
        setSelectedId(null);
        setMistakeMade(false);
        setSegmentIndex(0);
        setTextInput('');
        setInputError(false);
        setIndex((i) => i + 1);
      });
  }

  function handleMcChoice(choiceId) {
    if (answered) return;
    setSelectedId(choiceId);
    setOutcome(choiceId === word.id ? 'good' : 'again');
    setAnswered(true);
    if (exercise_type === 'mc_vi_en') {
      const chosen = mcOptions.find((opt) => opt.id === choiceId);
      if (chosen) speak(chosen.label);
    }
  }

  function handleSegmentSubmit(e) {
    e.preventDefault();
    const expected = segments[segmentIndex];
    if (textInput.trim().toLowerCase() === expected.toLowerCase()) {
      setInputError(false);
      setSegmentIndex((s) => s + 1);
      setTextInput('');
    } else {
      setInputError(true);
      setMistakeMade(true);
    }
  }

  function handleFullWordSubmit(e) {
    e.preventDefault();
    if (textInput.trim().toLowerCase() === word.word.toLowerCase()) {
      setOutcome(mistakeMade ? 'hard' : 'good');
      setAnswered(true);
    } else {
      setInputError(true);
      setMistakeMade(true);
      setTextInput('');
    }
  }

  function handleShowAnswer() {
    setOutcome('again');
    setAnswered(true);
  }

  const isDifficultCopy = exercise_type === 'full_type' && status === 'difficult';
  const showWordHeading = answered || exercise_type === 'mc_en_vi' || isDifficultCopy;

  return (
    <div className="card" style={{ maxWidth: 680, margin: '0 auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className={`tag ${STATUS_TAG_CLASS[status] || 'tag-new'}`}>{status}</span>
          {word.part_of_speech && <span className="tag tag-pos">{word.part_of_speech}</span>}
        </div>
        <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{index + 1}/{cards.length}</span>
      </div>

      {showWordHeading ? (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 48, margin: 0, fontWeight: 800 }}>{word.word}</h1>
            <button className="btn" style={{ borderRadius: '50%', width: 38, height: 38, padding: 0 }} onClick={() => speak(word.word)} aria-label="Phát âm">🔊</button>
          </div>
          {word.ipa && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ color: 'var(--ink-3)' }}>{word.ipa}</span>
              <button className="btn" style={{ borderRadius: '50%', width: 22, height: 22, padding: 0, fontSize: 12 }} onClick={() => speak(word.word)} aria-label="Phát âm">🔊</button>
            </div>
          )}
        </div>
      ) : exercise_type === 'mc_vi_en' ? (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Từ nào có nghĩa là:</p>
          <h1 style={{ fontSize: 32, margin: 0, fontWeight: 800 }}>{word.meaning}</h1>
        </div>
      ) : null}

      {!answered && mcOptions && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {mcOptions.map((opt) => (
            <button key={opt.id} className="opt-btn" onClick={() => handleMcChoice(opt.id)}>{opt.label}</button>
          ))}
        </div>
      )}

      {answered && mcOptions && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {mcOptions.map((opt) => {
            const cls = opt.id === word.id ? 'correct' : opt.id === selectedId ? 'incorrect' : 'faded';
            return <button key={opt.id} className={`opt-btn ${cls}`} disabled>{opt.label}</button>;
          })}
        </div>
      )}

      {!answered && exercise_type === 'segment' && segmentIndex < segments.length && (
        <form onSubmit={handleSegmentSubmit} style={{ marginBottom: 24 }}>
          <p>
            {segments.map((seg, i) => (
              <span key={i}>{i < segmentIndex ? seg : i === segmentIndex ? '____' : '....'} </span>
            ))}
          </p>
          <input
            className={`input${inputError ? ' input-error' : ''}`}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">Enter</button>
            <button type="button" className="btn btn-secondary" onClick={handleShowAnswer}>Xem đáp án</button>
          </div>
        </form>
      )}

      {!answered && exercise_type === 'segment' && segmentIndex >= segments.length && (
        <form onSubmit={handleFullWordSubmit} style={{ marginBottom: 24 }}>
          <p>Nhập lại toàn bộ từ:</p>
          <input
            className={`input${inputError ? ' input-error' : ''}`}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">Enter</button>
            <button type="button" className="btn btn-secondary" onClick={handleShowAnswer}>Xem đáp án</button>
          </div>
        </form>
      )}

      {!answered && exercise_type === 'full_type' && (
        <form onSubmit={handleFullWordSubmit} style={{ marginBottom: 24 }}>
          <p>{isDifficultCopy ? 'Chép lại từ tiếng Anh:' : `Nhập từ tiếng Anh cho nghĩa: "${word.meaning}"`}</p>
          <input
            className={`input${inputError ? ' input-error' : ''}`}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary">Enter</button>
            {!isDifficultCopy && (
              <button type="button" className="btn btn-secondary" onClick={handleShowAnswer}>Xem đáp án</button>
            )}
          </div>
        </form>
      )}

      {(answered || isDifficultCopy) && (
        <div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Meaning (Vietnamese)</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{word.meaning}</div>
          </div>

          {word.segments && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>Word breakdown</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {segments.map((seg, i) => (
                  <React.Fragment key={seg}>
                    {i > 0 && <span style={{ color: 'var(--ink-3)' }}>+</span>}
                    <span className={`chip ${i === 0 ? 'chip-1' : 'chip-2'}`}>{seg}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {word.example && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 4 }}>Example sentence</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{word.example}</div>
              <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{word.example_vi}</span>
                <button className="btn" style={{ borderRadius: '50%', width: 20, height: 20, padding: 0 }} onClick={() => speak(word.example)} aria-label="Phát âm">🔊</button>
              </div>
            </div>
          )}
        </div>
      )}

      {answered && (
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={goNext}>Thẻ tiếp theo →</button>
      )}
    </div>
  );
}
