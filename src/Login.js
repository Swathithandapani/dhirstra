import React, { useState, useEffect } from 'react';
import './Login.css';
import { useNavigate } from "react-router-dom";
import { useT } from './LanguageContext';
import LanguageSelector from './LanguageSelector';
function Login() {
  const navigate = useNavigate();
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captcha, setCaptcha] = useState('');

  const generateCaptcha = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  useEffect(() => {
    setCaptcha(generateCaptcha());
  }, []);

  const handleRefresh = () => {
    setCaptcha(generateCaptcha());
    setCaptchaInput('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (captchaInput !== captcha) {
      alert('Invalid captcha');
      return;
    }
    try {
      const res = await fetch('http://localhost:5000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: username, password }),
      });
      const data = await res.json();
      if (data.message !== 'success') { alert('Invalid credentials'); return; }
      if (data.role === 'State Governments') navigate('/dashboard/state');
      else if (data.role === 'Central Line Ministries') navigate('/dashboard/ministries');
      else if (data.role === 'SLEC') navigate('/dashboard/slec');
      else navigate('/dashboard/nodal');
    } catch {
      alert('Server error. Please try again.');
    }
  };

  return (
    <div className="login-page">
      <div className="corner-logo"></div>
      <div className="lang-selector">
        <LanguageSelector />
      </div>
      
      <div className="header-section">
        <h1 className="main-heading">{t('portal_title')}</h1>
        <p className="sub-heading">{t('portal_subtitle')}</p>
      </div>

      <div className="card-container">
        <div className="login-card">
          <div className="emblem-wrapper">
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/7/7c/Seal_of_Tamil_Nadu.svg?utm_source=en.wikipedia.org&utm_campaign=index&utm_content=original" 
              alt="Tamil Nadu Emblem" 
            />
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-field">
              <span className="field-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input 
                type="text" 
                placeholder={t('username')} 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="text-input"
                required
              />
            </div>

            <div className="form-field">
              <span className="field-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input 
                type="password" 
                placeholder={t('password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="text-input"
                required
              />
            </div>

            <div className="captcha-display">
              <span className="captcha-text">{captcha}</span>
              <button type="button" onClick={handleRefresh} className="refresh-captcha">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
            </div>

            <div className="form-field">
              <input 
                type="text" 
                placeholder={t('enter_captcha')}
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                className="text-input"
                required
              />
            </div>

            <button type="submit" className="submit-button">
              {t('login')}
            </button>

            <a href="#forgot" className="forgot-password">
              {t('forgot_password')}
            </a>

            <a href="#signup" className="forgot-password"onClick={() => navigate("/signup")}>
              {t('new_user_signup')}
            </a>
          </form>
        </div>
      </div>

      <footer className="page-footer">
        <p>{t('footer_copy')}</p>
        <p>{t('best_viewed')}</p>
      </footer>
    </div>
  );
}

export default Login;

