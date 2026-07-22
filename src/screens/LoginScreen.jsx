import React from 'react';
import { supabase } from '../supabaseClient.js';

export default function LoginScreen() {
  function handleGoogleLogin() {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ padding: 32, maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="sidebar-logo" style={{ margin: '0 auto' }}>V</div>
        <h1 style={{ fontSize: 20, margin: 0 }}>My Vocab</h1>
        <p style={{ color: 'var(--ink-2)', margin: 0 }}>Đăng nhập để đồng bộ kho từ vựng của bạn.</p>
        <button className="btn btn-primary" onClick={handleGoogleLogin}>
          Đăng nhập với Google
        </button>
      </div>
    </div>
  );
}
