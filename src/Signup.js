import React, { useState } from 'react';
import './Signup.css';
import { useNavigate } from "react-router-dom";
import { useT } from './LanguageContext';
import LanguageSelector from './LanguageSelector';

function Signup({ onSignup = () => {} }) {
  const t = useT();
  const navigate = useNavigate();
  const [form, setForm] = useState({ role: '', userId: '', password: '', confirmPassword: '' });
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', checks: {} });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  const roles = [
    'State Governments',
    'MDoNER Nodal Division',
    'Central Line Ministries',
    'EIMC',
    'SLEC',
    'Implementing Agencies (IAs)',
    'MDoNER Finance / CNA',
    'Competent Authority',
  ];

  const checkStrength = (pwd) => {
    const checks = {
      length: pwd.length >= 8,
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd),
    };
    const score = Object.values(checks).filter(Boolean).length;
    const labels = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    return { score, label: labels[score], checks };
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'password') setPasswordStrength(checkStrength(value));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!form.role) errs.role = 'Please select a role';
    if (!form.userId.trim()) errs.userId = 'User ID is required';
    if (passwordStrength.score < 4) errs.password = 'Password must be Strong or Very Strong';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    return errs;
  };

  // 🔥 UPDATED SUBMIT FUNCTION
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    try {
      const res = await fetch('http://localhost:5000/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: form.userId, password: form.password, role: form.role }),
      });
      const data = await res.json();
      if (data.message === 'user created') {
        alert('Signup successful!');
        navigate('/');
      } else {
        setErrors({ userId: data.message || 'User already exists' });
      }
    } catch {
      setErrors({ userId: 'Server error. Try again.' });
    }
  };

  const strengthColors = ['', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1b5e20'];

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
        <div className="signup-card">
          <div className="emblem-wrapper">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Emblem_of_India.svg/200px-Emblem_of_India.svg.png"
              alt=""
            />
          </div>

          <p className="signup-title">{t('create_account')}</p>

          <form onSubmit={handleSubmit} className="login-form">

            <div className="form-field">
              <span className="field-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2"/>
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                  <line x1="12" y1="12" x2="12" y2="16"/>
                  <line x1="10" y1="14" x2="14" y2="14"/>
                </svg>
              </span>
              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                className="text-input select-input"
                required
              >
                <option value="">{t('select_role')}</option>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {errors.role && <p className="field-error">{errors.role}</p>}

            <div className="form-field">
              <span className="field-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input
                type="text"
                name="userId"
                placeholder={t('create_userid')}
                value={form.userId}
                onChange={handleChange}
                className="text-input"
                required
              />
            </div>
            {errors.userId && <p className="field-error">{errors.userId}</p>}

            <div className="form-field">
              <span className="field-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder={t('create_password')}
                value={form.password}
                onChange={handleChange}
                className="text-input password-input"
                required
              />
              <span className="toggle-eye" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </span>
            </div>

            {form.password && (
              <div className="strength-wrapper">
                <div className="strength-bar">
                  {[1,2,3,4,5].map((i) => (
                    <div key={i} className="strength-segment"
                      style={{ backgroundColor: i <= passwordStrength.score ? strengthColors[passwordStrength.score] : '#ddd' }}
                    />
                  ))}
                </div>
                <p className="strength-label" style={{ color: strengthColors[passwordStrength.score] }}>
                  {passwordStrength.label}
                </p>
                <ul className="strength-checks">
                  <li className={passwordStrength.checks.length ? 'pass' : ''}>At least 8 characters</li>
                  <li className={passwordStrength.checks.upper ? 'pass' : ''}>Uppercase letter (A-Z)</li>
                  <li className={passwordStrength.checks.lower ? 'pass' : ''}>Lowercase letter (a-z)</li>
                  <li className={passwordStrength.checks.number ? 'pass' : ''}>Number (0-9)</li>
                  <li className={passwordStrength.checks.special ? 'pass' : ''}>Special character (!@#...)</li>
                </ul>
              </div>
            )}
            {errors.password && <p className="field-error">{errors.password}</p>}

            <div className="form-field">
              <span className="field-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                type="password"
                name="confirmPassword"
                placeholder={t('confirm_password')}
                value={form.confirmPassword}
                onChange={handleChange}
                className="text-input"
                required
              />
            </div>
            {form.confirmPassword && (
              <p className="match-status" style={{ color: form.password === form.confirmPassword ? '#43a047' : '#e53935' }}>
                {form.password === form.confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
              </p>
            )}
            {errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}

            <button type="submit" className="submit-button">{t('sign_up')}</button>

            <a href="#login" onClick={(e) => { e.preventDefault(); onSignup(); }} className="forgot-password">
              {t('already_account')}
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

export default Signup;