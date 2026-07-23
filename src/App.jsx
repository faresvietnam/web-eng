import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import DashboardScreen from './screens/DashboardScreen.jsx';
import StudyScreen from './screens/StudyScreen.jsx';
import VocabularyScreen from './screens/VocabularyScreen.jsx';
import ImportScreen from './screens/ImportScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import WordPartsScreen from './screens/WordPartsScreen.jsx';
import { supabase } from './supabaseClient.js';
import LoginScreen from './screens/LoginScreen.jsx';
import { renderDailyGoalText, dailyGoalProgress } from './dailyGoal.js';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'learn', label: 'Learn' },
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'import', label: 'Import' },
  { key: 'wordparts', label: 'Gốc từ' },
  { key: 'settings', label: 'Settings' },
];

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [editingWord, setEditingWord] = useState(null);
  const [dailyGoal, setDailyGoal] = useState(null);
  const [rootFilter, setRootFilter] = useState(null);

  useEffect(() => {
    if (session) {
      api.getDashboard().then(setDailyGoal);
    }
  }, [activeTab, session]);

  function handleEditWord(word) {
    setEditingWord(word);
    setActiveTab('import');
  }

  function handleImportDone() {
    setEditingWord(null);
    setActiveTab('vocabulary');
  }

  function handleRootClick(root) {
    setRootFilter(root);
    setActiveTab('vocabulary');
  }

  function handleClearRootFilter() {
    setRootFilter(null);
  }

  if (session === undefined) {
    return null;
  }
  if (!session) {
    return <LoginScreen />;
  }

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">V</div>
          <div>
            <div className="sidebar-title">My Vocab</div>
            <div className="sidebar-subtitle">Master vocabulary daily.</div>
          </div>
        </div>
        <div className="sidebar-nav">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`navitem${tab.key === activeTab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="card sidebar-widget">
            <div className="sidebar-widget-title">☁️ Cloud sync</div>
            <div className="sidebar-widget-text">Dữ liệu được lưu trên Supabase, tự động đồng bộ.</div>
          </div>
          <div className="card sidebar-widget">
            <div className="sidebar-widget-title">🔥 Daily goal</div>
            <div className="sidebar-widget-text">{renderDailyGoalText(dailyGoal)}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${dailyGoalProgress(dailyGoal)}%` }} />
            </div>
          </div>
          <div className="card sidebar-widget" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {session.user.user_metadata?.avatar_url ? (
              <img
                src={session.user.user_metadata.avatar_url}
                alt=""
                style={{ width: 36, height: 36, borderRadius: '50%', flex: 'none' }}
              />
            ) : (
              <div className="sidebar-logo">
                {(session.user.user_metadata?.full_name || session.user.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {session.user.user_metadata?.full_name || session.user.email}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {session.user.email}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
            Đăng xuất
          </button>
        </div>
      </nav>
      <div className="main">
        <div className="topbar">
          <input className="input topbar-search" placeholder="Search words, tags, examples..." />
        </div>
        <main className="content">
          {activeTab === 'dashboard' && <DashboardScreen onViewAllDifficult={() => setActiveTab('vocabulary')} onRootClick={handleRootClick} />}
          {activeTab === 'learn' && <StudyScreen onRootClick={handleRootClick} />}
          {activeTab === 'vocabulary' && <VocabularyScreen onEdit={handleEditWord} rootFilter={rootFilter} onClearRootFilter={handleClearRootFilter} />}
          {activeTab === 'import' && <ImportScreen editingWord={editingWord} onDone={handleImportDone} />}
          {activeTab === 'wordparts' && <WordPartsScreen />}
          {activeTab === 'settings' && <SettingsScreen />}
        </main>
      </div>
    </div>
  );
}
