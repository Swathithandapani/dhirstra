import React from 'react';
import { useLang, LANGUAGES } from './LanguageContext';

export default function LanguageSelector({ style = {} }) {
  const { lang, setLang } = useLang();
  return (
    <select
      value={lang}
      onChange={e => setLang(e.target.value)}
      style={{
        padding: '5px 10px',
        borderRadius: '6px',
        border: '1px solid #ccc',
        fontSize: '13px',
        background: '#fff',
        cursor: 'pointer',
        ...style,
      }}
    >
      {LANGUAGES.map(l => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
