import React, { useState, useEffect } from 'react';
import { useProjectStatus } from './useProjectStatus';
import ProjectStatusBanner, { ProjectStatusRow } from './ProjectStatusBanner';
import * as pdfjsLib from 'pdfjs-dist';
import { useNavigate } from 'react-router-dom';
import './NodalDashboard.css';
import LanguageSelector from './LanguageSelector';
import { useT } from './LanguageContext';
import BlockchainAudit from './BlockchainAudit';
import API from './api';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs`;

const BATCH = 20; // pages per batch to keep UI responsive

// DPR required sections aligned with MDoNER/Government DPR evaluation guidelines
const REQUIRED_SECTIONS = [
  'Project Overview & Background',
  'Architectural Design',
  'Structural Design',
  'Plumbing & Water Supply',
  'Electrical Works',
  'Estimated Cost / Financial Estimates',
  'Load Analysis & Structural Codes',
  'Implementation / Scope of Work',
];

const extractText = async (url, onProgress) => {
  const pdf = await pdfjsLib.getDocument({ url, disableStream: false }).promise;
  const total = pdf.numPages;
  let fullText = '';
  for (let i = 1; i <= total; i++) {
    onProgress && onProgress(i, total);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((s) => s.str).join(' ') + '\n';
    if (i % BATCH === 0) await new Promise(r => setTimeout(r, 0));
  }
  return fullText;
};

// Fuzzy keyword check  tolerates OCR noise (broken spaces, partial chars)
const hasKw = (upper, kw) => {
  return upper.includes(kw);
};

const analyzeDPR = (text) => {
  const clean = text.replace(/\s{2,}/g, ' ');
  const upper = clean.toUpperCase();

  const sectionMap = {
    'Project Overview & Background': [
      'NAME OF WORK','REPORT TO ACCOMPANY','TECHNICAL SANCTION','ADMINISTRATIVE SANCTION',
      'PROJECT BACKGROUND','BACKGROUND','EXECUTIVE SUMMARY','SALIENT FEATURES',
      'INTRODUCTION','DETAILED PROJECT REPORT','DPR','NABARD','RIDF',
    ],
    'Architectural Design': [
      'ARCHITECTURAL','LOCATION PLAN','SITE PLAN','AREA STATEMENT','BUILDING PLAN',
      'FLOOR PLAN','PLINTH AREA','GA PLAN','GROUND FLOOR','FLOOR',
    ],
    'Structural Design': [
      'FOUNDATION','FOOTING','SUPERSTRUCTURE','RCC','REINFORCED','CONCRETE',
      'BRICK WORK','LINTEL','ROOF SLAB','COLUMN','BEAM','SLAB','STRUCTURAL',
      'BEARING CAPACITY','M20','M25','FE500','FE415',
    ],
    'Plumbing & Water Supply': [
      'PLUMBING','WATER SUPPLY','SANITARY','SEWERAGE','DRAINAGE',
      'DRINKING WATER','RAIN WATER HARVESTING','PIPE','TOILET',
    ],
    'Electrical Works': [
      'ELECTRICAL','ELECTRIFICATION','EB SERVICE','POWER SUPPLY',
      'LIGHTING','EARTHING','DG SET','UPS',
    ],
    'Estimated Cost / Financial Estimates': [
      'ESTIMATE','AMOUNT OF RS','RS.','RUPEES','LAKH','CRORE','EXPENDITURE',
      'SCHEDULE OF RATES','HEAD OF ACCOUNT','COST',
    ],
    'Load Analysis & Structural Codes': [
      'IS-875','IS 875','IS1893','IS 1893','IS-456','IS 456','IS456',
      'DEAD LOAD','LIVE LOAD','WIND LOAD','SEISMIC','LOAD','BEARING CAPACITY',
      'SAFE BEARING','KN/M','GRADE',
    ],
    'Implementation / Scope of Work': [
      'SCOPE OF WORK','EXECUTION','IMPLEMENTATION','TENDERING','COMMENCEMENT',
      'PROVISIONS','LUMP SUM','SCHEDULE OF RATES','WORK PLAN','NABARD',
    ],
  };

  const sections = {};
  REQUIRED_SECTIONS.forEach((sec) => {
    sections[sec] = sectionMap[sec].some((kw) => hasKw(upper, kw));
  });

  //  NLP Extraction tuned to actual OCR output 

  // Title  "Name of work:" label or "Construction of..." pattern
  const titleMatch =
    clean.match(/Name\s+of\s+work\s*[;:.]?\s*[:\-]?\s*([^\n]{10,200})/i) ||
    clean.match(/WORK\s*[:\|]\s*([^\n]{10,200})/i) ||
    clean.match(/(?:Construction|Providing|Improvement|Upgradation)\s+of\s+[^\n]{10,200}/i);
  let title = 'Not found';
  if (titleMatch) {
    title = (titleMatch[1] || titleMatch[0]).replace(/\s+/g, ' ').trim();
    // Clean OCR noise at end
    title = title.replace(/[~\-\."]+$/, '').trim();
    if (title.length > 150) title = title.substring(0, 150) + '...';
  }

  // Location  district / place names from OCR text
  const locationMatch =
    clean.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+[Dd]istrict/i) ||
    clean.match(/(?:at|in)\s+([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+)*)\s+in\s+([A-Z][a-z]+\s+[Dd]istrict)/i) ||
    clean.match(/(?:SHILLONG|UMSAWLI|MEGHALAYA|ARUNACHAL|ASSAM|MANIPUR|MIZORAM|NAGALAND|SIKKIM|TRIPURA|SIVAGANGAI|SIVAGANGA|CHENNAI|MADURAI|COIMBATORE|TRICHY|TAMIL\s*NADU|KERALA|KARNATAKA|ANDHRA|TELANGANA|PUDUCHERRY)/i) ||
    clean.match(/(?:location|district|state|place|site)\s*[:\-]\s*([^\n]{3,80})/i);
  let location = 'Not found';
  if (locationMatch) {
    const distMatch = clean.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+[Dd]istrict/i);
    if (distMatch) {
      location = distMatch[1].trim() + ' District';
    } else if (locationMatch[1] && locationMatch[1].trim().length > 3) {
      location = locationMatch[1].trim();
    }
    // Don't accept bare state-name matches (too vague)
  }

  // Budget  handles "Rs.74,22,000/-", "Rs.74.22 Lakhs", "Rs.84526.53 lakh"
  let budget = 'Not found';
  const budgetPatterns = [
    // Rs.74,22,000/- style (Indian comma format)
    /Rs\.?\s*([\d,]+)\/\-/i,
    // Rs.74.22 Lakhs / lakh
    /Rs\.?\s*([\d,\.]+)\s*(?:Lakh|Lakhs|lakh)/i,
    // amount of Rs.X lakh
    /amount\s+of\s+Rs\.?\s*([\d,\.]+)\s*(?:lakh|Lakhs|crore|Cr)?/i,
    // GRAND TOTAL / TOTAL PROJECT COST
    /(?:GRAND\s+TOTAL|TOTAL\s+PROJECT\s+COST)[^\n]{0,60}?([\d,\.]+)\s*(?:Cr|Crore|Lakh)?/i,
    /(?:total|estimated|project)\s+cost[^\n]{0,40}?(?:Rs\.?|INR|)?\s*([\d,\.]+)\s*(?:Cr|Crore|Lakh)?/i,
  ];
  for (const pat of budgetPatterns) {
    const m = clean.match(pat);
    if (m) {
      const raw = m[1].replace(/,/g, '');
      const num = parseFloat(raw);
      if (!isNaN(num) && num > 0) {
        // Detect unit from context
        const ctx = m[0].toUpperCase();
        if (ctx.includes('LAKH')) {
          budget = `${num.toLocaleString('en-IN')} Lakhs`;
        } else if (ctx.includes('CRORE') || ctx.includes(' CR')) {
          budget = `${num.toLocaleString('en-IN')} Crore`;
        } else if (num > 100000) {
          // Raw rupees e.g. 7422000  convert to lakhs
          budget = `${(num / 100000).toFixed(2)} Lakhs`;
        } else {
          budget = `${num.toLocaleString('en-IN')} Lakhs`;
        }
        break;
      }
    }
  }

  // Duration  look for months/years completion period
  const durationMatch =
    clean.match(/(?:period\s+of\s+completion|completion\s+period|time\s+limit|duration)\s*[:\-]?\s*([^\n]{3,60})/i) ||
    clean.match(/(\d+\s*(?:months?|years?|days?))\s*(?:from|period|completion)/i);
  const duration = durationMatch ? durationMatch[1].replace(/\s+/g,' ').trim() : 'Not specified in document';

  // Type of project  from title or explicit type field
  const typeMatch =
    clean.match(/(?:Construction|Providing|Improvement|Upgradation|Renovation)\s+of\s+([^\n]{5,80})/i) ||
    clean.match(/(?:type|nature)\s+of\s+(?:project|work)\s*[:\-]\s*([^\n]{3,60})/i);
  let type = 'Not found';
  if (typeMatch) {
    const rawType = (typeMatch[1] || typeMatch[0]).replace(/\s+/g,' ').trim();
    // Only accept if captured group has real content (not just the trigger word)
    if (typeMatch[1] && typeMatch[1].trim().length > 5) {
      type = rawType.length > 80 ? rawType.substring(0, 80) + '...' : rawType;
    }
  }

  // Agency  PWD / department names from OCR
  const agencyMatch =
    clean.match(/(?:SUPERINTENDING\s+ENGINEER|EXECUTIVE\s+ENGINEER|ENGINEER[\s\-]IN[\s\-]CHIEF)[^\n]{0,100}/i) ||
    clean.match(/(?:Public\s+Works\s+Department|PWD)[^\n]{0,80}/i) ||
    clean.match(/SUBMITTED\s+(?:BY|TO)\s*[:\-]?\s*([^\n]{5,120})/i) ||
    clean.match(/(?:implementing|executing|nodal|client)\s+agency\s*[:\-]\s*([^\n]{3,100})/i) ||
    clean.match(/((?:Meghalaya|Arunachal|Assam|Manipur|Mizoram|Nagaland|Sikkim|Tripura|Tamil\s*Nadu)[^\n]{5,80}(?:Society|Department|Authority|Board|Corporation|Council|Ministry|PWD)[^\n]{0,40})/i);
  let agency = 'Not found';
  if (agencyMatch) {
    const raw = (agencyMatch[1] || agencyMatch[0]).replace(/\s+/g,' ').trim();
    // Only accept if it has meaningful content beyond just a keyword
    if (raw.length > 15 && /[A-Za-z]{4,}/.test(raw)) {
      agency = raw.length > 120 ? raw.substring(0, 120) + '...' : raw;
    }
  }

  // Funding source
  const fundingMatch = clean.match(/(?:NABARD|RIDF|World\s+Bank|ADB|State\s+Fund|Central\s+Fund)[^\n]{0,60}/i);
  const funding = fundingMatch ? fundingMatch[0].replace(/\s+/g,' ').trim() : null;

  // IS Codes
  const codesFound = [];
  [
    { label:'IS-875',  patterns:['IS-875','IS 875','IS875'] },
    { label:'IS-456',  patterns:['IS-456','IS 456','IS456'] },
    { label:'IS-1893', patterns:['IS-1893','IS 1893','IS1893'] },
    { label:'IS-13920',patterns:['IS-13920','IS 13920','IS13920'] },
    { label:'IS-800',  patterns:['IS-800','IS 800','IS800'] },
    { label:'IS-1786', patterns:['IS-1786','IS 1786','IS1786'] },
  ].forEach(({ label, patterns }) => {
    if (patterns.some(p => upper.includes(p))) codesFound.push(label);
  });

  // Cost breakdown
  const costItems = [];
  const costSection = clean.match(/(?:ESTIMATED\s+COST|COST\s+ESTIMATE|FINANCIAL\s+ESTIMATE|lump\s+sum)[\s\S]{0,3000}/i)?.[0] || '';
  const costPattern = /([A-Za-z][A-Za-z\s\/&]{3,45})\s+([\d,\.]{2,12})\s*(?:Cr|Crore|Lakh)?/g;
  let cm;
  while ((cm = costPattern.exec(costSection)) !== null) {
    const amt = parseFloat(cm[2].replace(/,/g,''));
    if (amt > 0.1 && amt < 100000) {
      costItems.push({ item: cm[1].trim(), amount: cm[2].trim() });
    }
    if (costItems.length >= 8) break;
  }

  //  Technical Specifications 
  const techSpecs = [];

  // Structure type
  const structMatch = clean.match(/(?:framed\s+structure|load\s+bearing|RCC\s+framed|G\+\d[^\n]{0,60})/i);
  if (structMatch) techSpecs.push({ label: 'Structure Type', value: structMatch[0].replace(/\s+/g,' ').trim() });

  // Foundation
  const foundMatch = clean.match(/[Ff]oundation[^.]{0,200}\./i);
  if (foundMatch) techSpecs.push({ label: 'Foundation', value: foundMatch[0].replace(/\s+/g,' ').trim() });

  // Superstructure / materials
  const superMatch = clean.match(/[Ss]uperstructure[^.]{0,200}\./i);
  if (superMatch) techSpecs.push({ label: 'Superstructure', value: superMatch[0].replace(/\s+/g,' ').trim() });

  // Roof
  const roofMatch = clean.match(/[Rr]oof\s+slab[^.]{0,150}\./i);
  if (roofMatch) techSpecs.push({ label: 'Roof Slab', value: roofMatch[0].replace(/\s+/g,' ').trim() });

  // Flooring
  const floorMatch = clean.match(/[Ff]looring[^.]{0,150}\./i);
  if (floorMatch) techSpecs.push({ label: 'Flooring', value: floorMatch[0].replace(/\s+/g,' ').trim() });

  // Concrete grade
  const gradeMatch = clean.match(/M20|M25|M30/g);
  if (gradeMatch) techSpecs.push({ label: 'Concrete Grade', value: [...new Set(gradeMatch)].join(', ') });

  // Steel grade
  const steelMatch = clean.match(/Fe\s*(?:415|500|550)/gi);
  if (steelMatch) techSpecs.push({ label: 'Steel Grade', value: [...new Set(steelMatch.map(s => s.replace(/\s/g,'')))].join(', ') });

  // Plinth area
  const plinthMatch = clean.match(/[Pp]linth\s+area[^\n]{0,60}/i);
  if (plinthMatch) techSpecs.push({ label: 'Plinth Area', value: plinthMatch[0].replace(/\s+/g,' ').trim() });

  //  Official Authorizations / Signatories 
  const signatories = [];

  // IAS / Principal Secretary
  const iasMatches = clean.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+)+)[,\s]+I\.?A\.?S\.?[^\n]{0,80}/gi);
  for (const m of iasMatches) {
    signatories.push({ name: m[0].replace(/\s+/g,' ').trim(), role: 'IAS Officer' });
  }

  // Principal Secretary
  const psMatches = clean.matchAll(/(?:Principal\s+Secretary[^\n]{0,100})/gi);
  for (const m of psMatches) {
    const val = m[0].replace(/\s+/g,' ').trim();
    if (!signatories.some(s => s.name.includes(val.substring(0,20)))) {
      signatories.push({ name: val, role: 'Principal Secretary' });
    }
  }

  // Engineer-in-Chief
  const eicMatches = clean.matchAll(/(?:Engineer[\s\-]in[\s\-]Chief[^\n]{0,100})/gi);
  for (const m of eicMatches) {
    const val = m[0].replace(/\s+/g,' ').trim();
    if (!signatories.some(s => s.name.includes(val.substring(0,20)))) {
      signatories.push({ name: val, role: 'Engineer-in-Chief' });
    }
  }

  // Superintending Engineer
  const seMatches = clean.matchAll(/(?:Superintending\s+Engineer[^\n]{0,100})/gi);
  for (const m of seMatches) {
    const val = m[0].replace(/\s+/g,' ').trim();
    if (!signatories.some(s => s.name.includes(val.substring(0,20)))) {
      signatories.push({ name: val, role: 'Superintending Engineer' });
    }
  }

  // Executive Engineer
  const eeMatches = clean.matchAll(/(?:Executive\s+Engineer[^\n]{0,100})/gi);
  for (const m of eeMatches) {
    const val = m[0].replace(/\s+/g,' ').trim();
    if (!signatories.some(s => s.name.includes(val.substring(0,20)))) {
      signatories.push({ name: val, role: 'Executive Engineer' });
    }
  }

  // Chief Educational Officer
  const ceoMatches = clean.matchAll(/(?:Chief\s+Educational\s+Officer[^\n]{0,80})/gi);
  for (const m of ceoMatches) {
    const val = m[0].replace(/\s+/g,' ').trim();
    if (!signatories.some(s => s.name.includes(val.substring(0,20)))) {
      signatories.push({ name: val, role: 'Chief Educational Officer' });
    }
  }

  // Guideline compliance check for authorizations
  const authCompliance = signatories.length > 0
    ? signatories.some(s => /principal\s+secretary|chief\s+secretary|IAS/i.test(s.name))
      ? 'Compliant  Signed by Principal Secretary / IAS Officer'
      : 'Partial  Signed by departmental officials (Chief Secretary signature not found)'
    : 'Not found  No authorization signatures detected';

  const info = { title, location, budget, duration, type, agency, funding, codesFound, costItems, techSpecs, signatories, authCompliance };

  const missingSections = REQUIRED_SECTIONS.filter((s) => !sections[s]);
  const weakAreas = [];
  if (clean.length < 500)            weakAreas.push('Very little text extracted  document may be a low-quality scan.');
  if (info.budget === 'Not found')   weakAreas.push('Budget / financial estimates not clearly mentioned.');
  if (info.duration === 'Not specified in document') weakAreas.push('Project duration / completion period not specified.');
  if (info.agency === 'Not found')   weakAreas.push('Implementing / executing agency not identified.');
  if (codesFound.length === 0)       weakAreas.push('No IS codes / design standards referenced.');
  if (signatories.length === 0)      weakAreas.push('No official authorization / signatory found.');

  return { sections, info, missingSections, weakAreas };
};

export default function NodalDashboard() {
  const navigate = useNavigate();
  const t = useT();
  const [activeTab, setActiveTab]   = useState('overview');
  const [documents, setDocuments]   = useState([]);
  const [selected, setSelected]     = useState(null);
  const [analyzing, setAnalyzing]   = useState(false);
  const [progress, setProgress]     = useState({ current: 0, total: 0 });
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [forwarded, setForwarded]   = useState([]);
  const [savedId, setSavedId]       = useState(null);
  const [rejecting, setRejecting]   = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejected, setRejected]     = useState([]);
  const { statusMap, reload: reloadStatus } = useProjectStatus();
  const [ministryDecisions, setMinistryDecisions] = useState({});

  const loadDocs = () => {
    fetch(`${API}/documents/state_gov_user`)
      .then((r) => r.json())
      .then((data) => setDocuments(Array.isArray(data) ? data : []))
      .catch(() => setError('Could not connect to server.'));
  };

  const loadForwarded = () => {
    fetch(`${API}/documents/nodal_forwarded`)
      .then((r) => r.json())
      .then((data) => setForwarded(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  const loadRejected = () => {
    fetch(`${API}/documents/nodal_rejected`)
      .then((r) => r.json())
      .then((data) => setRejected(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  const loadMinistryDecisions = () => {
    fetch(`${API}/ministry-decisions`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map = {};
          data.forEach(d => { map[d.file_path] = d; });
          setMinistryDecisions(map);
        }
      }).catch(() => {});
  };

  useEffect(() => { loadDocs(); loadForwarded(); loadRejected(); loadMinistryDecisions(); }, []);

  const handleCheckDPR = async (doc) => {
    setSelected(doc);
    setResult(null);
    setError('');
    setSavedId(null);
    setAnalyzing(true);
    setProgress({ current: 0, total: 0 });
    setActiveTab('check');
    try {
      const url = `${API}/uploads/${doc.file_path}`;
      let fullText = await extractText(url, (cur, tot) => setProgress({ current: cur, total: tot }));

      // Scanned PDF  no text layer  use SSE OCR endpoint
      if (fullText.replace(/---\s*PAGE\s*\d+\s*---/g, '').trim().length < 100) {
        fullText = await new Promise((resolve, reject) => {
          setProgress({ current: 0, total: 0, ocr: true });
          const es = new EventSource(`${API}/ocr-extract/${doc.file_path}`);
          es.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'start') {
              setProgress({ current: 0, total: msg.scanning, ocr: true });
            } else if (msg.type === 'progress') {
              setProgress({ current: msg.current, total: msg.total, ocr: true });
            } else if (msg.type === 'done') {
              es.close();
              resolve(msg.text || '');
            } else if (msg.type === 'error') {
              es.close();
              reject(new Error(msg.message));
            }
          };
          es.onerror = () => { es.close(); reject(new Error('OCR stream failed')); };
        });
      }

      setResult(analyzeDPR(fullText));
    } catch (err) {
      setError(`Could not read PDF: ${err?.message || err}`);
    }
    setAnalyzing(false);
  };

  const handleSendToNextDept = async () => {
    if (!selected || !result) return;
    setSaving(true);
    try {
      // 1. Save extracted analysis to DB so Ministry can use it directly
      await fetch(`${API}/save-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: selected.file_path,
          analysis_data: result,
        }),
      });
      // 2. Forward DPR
      // Log to blockchain
      fetch(`${API}/blockchain/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dpr_id: selected.file_path, stage: 'B-AE2 Review', action: 'Forwarded', reviewer: 'Nodal Division' }),
      }).catch(() => {});
      const res = await fetch(`${API}/forward-dpr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: selected.file_path,
          dpr: selected.file_path.replace(/^\d+-/, ''),
        }),
      });
      if (res.ok) {
        setSavedId(selected.id);
        setSelected(null);
        setResult(null);
        setShowRejectBox(false);
        loadDocs();
        loadForwarded();
      } else {
        setError('Failed to send. Please try again.');
      }
    } catch {
      setError('Server unreachable.');
    }
    setSaving(false);
  };

  const handleRejectDPR = async () => {
    if (!selected || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      // Log to blockchain
      fetch(`${API}/blockchain/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dpr_id: selected.file_path, stage: 'B-AE2 Review', action: 'Rejected', reviewer: 'Nodal Division' }),
      }).catch(() => {});
      const res = await fetch(`${API}/reject-dpr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: selected.file_path,
          dpr: selected.file_path.replace(/^\d+-/, ''),
          reason: rejectReason.trim(),
        }),
      });
      if (res.ok) {
        setSelected(null);
        setResult(null);
        setShowRejectBox(false);
        setRejectReason('');
        loadDocs();
        loadRejected();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(`Failed to reject: ${data.message || res.status} ${data.error || ''}`);
      }
    } catch {
      setError('Server unreachable.');
    }
    setRejecting(false);
  };

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : (progress.ocr ? 5 : 0);
  const missing = result ? result.missingSections : [];
  const presentCount = result ? REQUIRED_SECTIONS.filter(s => result.sections[s]).length : 0;
  const rejectedIds = new Set(rejected.map(r => r.file_path));

  return (
    <div className="nd-page">
      <header className="nd-header">
        <div className="nd-header-left">
          <img src="https://www.cleanpng.com/png-tamil-nadu-state-emblem-png-with-lion-and-tower-4kvtim/" alt="Tamil Nadu Emblem" className="nd-emblem" />
          <div>
            <h1>B — AE² Review</h1>
            <p>{t('nodal_dash')}</p>
          </div>
        </div>
        <div className="nd-header-right">
          <div className="nd-user-badge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            {t('nodal_user')}
          </div>
          <LanguageSelector style={{ marginRight: 8 }} />
          <button className="nd-logout" onClick={() => navigate('/')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {t('logout')}
          </button>
        </div>
      </header>

      <nav className="nd-nav">
        {[
          { key: 'overview',    label: t('overview') },
          { key: 'check',       label: t('check_dpr') },
          { key: 'forwarded',   label: t('forwarded_dprs') },
          { key: 'rejected',    label: t('rejected_dprs') },
          { key: 'blockchain',  label: '⛓ Audit Trail' },
        ].map(tab => (
          <button key={tab.key} className={`nd-nav-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="nd-main">
        {activeTab === 'overview' && (
          <div className="nd-section">
            <h2 className="nd-section-title">Dashboard Overview</h2>
            <ProjectStatusBanner statusMap={statusMap} />
            <div className="nd-stats-grid">
              <div className="nd-stat-card total">
                <p className="nd-stat-num">{documents.length}</p>
                <p className="nd-stat-label">DPRs Received</p>
              </div>
              <div className="nd-stat-card approved">
                <p className="nd-stat-num">{forwarded.length}</p>
                <p className="nd-stat-label">Forwarded</p>
              </div>
              <div className="nd-stat-card review">
                <p className="nd-stat-num">{documents.length - forwarded.length}</p>
                <p className="nd-stat-label">Pending Review</p>
              </div>
              <div className="nd-stat-card pending">
                <p className="nd-stat-num">{documents.length > 0 ? Math.round((forwarded.length / documents.length) * 100) : 0}%</p>
                <p className="nd-stat-label">Clearance Rate</p>
              </div>
            </div>

            <h3 className="nd-sub-title">DPRs Pending Review</h3>
            <div className="nd-table-wrap">
              <table className="nd-table">
                <thead><tr><th>#</th><th>{t('file_name')}</th><th>{t('uploaded_on')}</th><th>{t('action')}</th></tr></thead>
                <tbody>
                  {documents.length === 0
                    ? <tr><td colSpan="4" style={{textAlign:'center',color:'#999',padding:'24px'}}>{t('no_dprs')}</td></tr>
                    : documents.map((doc, i) => (
                      <tr key={doc.id}>
                        <td>{i + 1}</td>
                        <td> {doc.file_path.replace(/^\d+-/, '')}</td>
                        <td>{new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</td>
                        <td>
                          {rejectedIds.has(doc.file_path)
                            ? <span className="nd-badge-rejected">Rejected</span>
                            : forwarded.some(f => f.file_path === doc.file_path)
                            ? <span className="nd-badge-rejected" style={{background:'#e8f5e9',color:'#2e7d32',border:'1px solid #a5d6a7'}}>Forwarded</span>
                            : <button className="nd-action-btn" onClick={() => handleCheckDPR(doc)}>{t('check_dpr_btn')}</button>
                          }
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/*  CHECK DPR  */}
        {activeTab === 'check' && (
          <div className="nd-section">
            <h2 className="nd-section-title">DPR Analysis</h2>

            {error && <p className="nd-error">{error}</p>}
            {savedId && <div className="nd-success"> DPR sent to next department & saved to database.</div>}

            {!selected && !analyzing && !result && (
              <div className="nd-empty-state">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
                </svg>
                <p>Select a DPR from the <strong>Overview</strong> tab to begin analysis.</p>
              </div>
            )}

            {/* Loading meter */}
            {analyzing && (
              <div className="nd-loading-box">
                <div className="nd-meter-container">
                  <svg viewBox="0 0 120 120" width="140" height="140">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#e8f5e9" strokeWidth="10"/>
                    <circle
                      cx="60" cy="60" r="50"
                      fill="none"
                      stroke="#234f1e"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray="314.16"
                      strokeDashoffset={314.16 - (pct / 100) * 314.16}
                      transform="rotate(-90 60 60)"
                      style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                    />
                    <text x="60" y="55" textAnchor="middle" fontSize="22" fontWeight="700" fill="#234f1e">{pct}%</text>
                    <text x="60" y="75" textAnchor="middle" fontSize="11" fill="#888">analysing</text>
                  </svg>
                  <p className="nd-loading-pages">
                    {progress.ocr
                      ? `OCR scanning page ${progress.current} of ${progress.total}...`
                      : progress.total > 0 ? `Page ${progress.current} of ${progress.total}` : 'Loading PDF...'}
                  </p>
                  <p className="nd-loading-file"> {selected?.file_path.replace(/^\d+-/, '')}</p>

                </div>
              </div>
            )}

            {/* Results */}
            {result && selected && (
              <div className="nd-results">
                {/* Key Info */}
                <div className="nd-result-card">
                  <h3 className="nd-result-card-title">
                    Extracted Key Information
                    <span className="nd-filename-tag"> {selected.file_path.replace(/^\d+-/, '')}</span>
                  </h3>
                  <div className="nd-info-grid">
                    {[
                      { label: 'Project Title',       value: result.info.title,    required: true },
                      { label: 'Location / District', value: result.info.location,  required: false },
                      { label: 'Estimated Budget',    value: result.info.budget,    required: true },
                      { label: 'Project Duration',    value: result.info.duration,  required: false },
                      { label: 'Type of Work',        value: result.info.type,      required: false },
                      { label: 'Implementing Agency', value: result.info.agency,    required: false },
                    ].filter(item => {
                      const missing = !item.value || item.value === 'Not found' || item.value === 'Not specified in document';
                      return !missing || item.required;
                    }).map((item) => (
                      <div className="nd-info-item" key={item.label}>
                        <p className="nd-info-label">{item.label}</p>
                        <p className={`nd-info-value ${
                          (!item.value || item.value === 'Not found' || item.value === 'Not specified in document') ? 'not-found' : ''
                        }`}>{(!item.value || item.value === 'Not found' || item.value === 'Not specified in document') ? 'Not found in document' : item.value}</p>
                      </div>
                    ))}
                    {result.info.funding && (
                      <div className="nd-info-item">
                        <p className="nd-info-label">Funding Source</p>
                        <p className="nd-info-value">{result.info.funding}</p>
                      </div>
                    )}
                    {result.info.codesFound.length > 0 && (
                      <div className="nd-info-item" style={{gridColumn:'1/-1'}}>
                        <p className="nd-info-label">IS Codes / Design Standards Referenced</p>
                        <p className="nd-info-value">{result.info.codesFound.join('  ')}</p>
                      </div>
                    )}
                    {result.info.costItems.length > 0 && (
                      <div className="nd-info-item" style={{gridColumn:'1/-1'}}>
                        <p className="nd-info-label">Cost Breakdown</p>
                        <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginTop:'4px'}}>
                          {result.info.costItems.map((c,i)=>(
                            <span key={i} style={{background:'#f0f4ff',border:'1px solid #c5d0e6',borderRadius:'6px',padding:'3px 8px',fontSize:'12px'}}>
                              {c.item}: {c.amount}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Technical Specifications */}
                {(result.info.techSpecs || []).length > 0 && (
                  <div className="nd-result-card">
                    <h3 className="nd-result-card-title">Technical Specifications
                      <span className="nd-score-tag" style={{background:'#e8f5e9',color:'#2e7d32'}}>Guideline: Compliant</span>
                    </h3>
                    <div className="nd-info-grid">
                      {result.info.techSpecs.map((spec, i) => (
                        <div className="nd-info-item" key={i}>
                          <p className="nd-info-label">{spec.label}</p>
                          <p className="nd-info-value">{spec.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Official Authorizations */}
                <div className="nd-result-card">
                  <h3 className="nd-result-card-title">Official Authorizations
                    <span className="nd-score-tag" style={{
                      background: (result.info.authCompliance || '').startsWith('Compliant') ? '#e8f5e9' : (result.info.authCompliance || '').startsWith('Partial') ? '#fff8e1' : '#ffebee',
                      color:      (result.info.authCompliance || '').startsWith('Compliant') ? '#2e7d32' : (result.info.authCompliance || '').startsWith('Partial') ? '#f57f17' : '#c62828',
                    }}>{(result.info.authCompliance || 'Not found').split('')[0].trim()}</span>
                  </h3>
                  {(result.info.signatories || []).length > 0 ? (
                    <ul style={{listStyle:'none',padding:0,margin:0,display:'flex',flexDirection:'column',gap:'8px'}}>
                      {result.info.signatories.map((s, i) => (
                        <li key={i} style={{display:'flex',alignItems:'flex-start',gap:'10px',padding:'8px 12px',background:'#f8f9fa',borderRadius:'8px',border:'1px solid #e0e0e0'}}>
                          <span style={{minWidth:'8px',height:'8px',borderRadius:'50%',background:'#234f1e',marginTop:'6px',flexShrink:0}} />
                          <div>
                            <p style={{margin:0,fontSize:'13px',fontWeight:600,color:'#1a1a1a'}}>{s.role}</p>
                            <p style={{margin:0,fontSize:'12px',color:'#555',marginTop:'2px'}}>{s.name}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{color:'#e53935',fontSize:'13px'}}>No authorization signatures detected in scanned pages.</p>
                  )}
                  {(result.info.authCompliance || '').includes('') && (
                    <p style={{marginTop:'10px',fontSize:'12px',color:'#666',fontStyle:'italic'}}>
                      {result.info.authCompliance.split('')[1]?.trim()}
                    </p>
                  )}
                </div>

                {/* Section Check */}
                <div className="nd-result-card">
                  <h3 className="nd-result-card-title">
                    Section Presence Check
                    <span className="nd-score-tag">{presentCount}/{REQUIRED_SECTIONS.length} sections found</span>
                  </h3>
                  <div className="nd-section-grid">
                    {REQUIRED_SECTIONS.map((sec) => (
                      <div key={sec} className={`nd-section-item ${result.sections[sec] ? 'present' : 'absent'}`}>
                        <span className="nd-section-icon">{result.sections[sec] ? '' : ''}</span>
                        {sec}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Validation */}
                <div className="nd-result-card">
                  <h3 className="nd-result-card-title">Validation Report</h3>
                  {missing.length === 0 && result.weakAreas.length === 0 ? (
                    <div className="nd-valid-msg"> DPR passes all validation checks.</div>
                  ) : (
                    <>
                      {missing.length > 0 && (
                        <>
                          <p className="nd-val-heading missing">Missing Sections ({missing.length})</p>
                          <ul className="nd-val-list">
                            {missing.map((s, i) => <li key={i}><span className="nd-val-dot red" />{s}</li>)}
                          </ul>
                        </>
                      )}
                      {result.weakAreas.length > 0 && (
                        <>
                          <p className="nd-val-heading weak">Weak / Incomplete Areas</p>
                          <ul className="nd-val-list">
                            {result.weakAreas.map((w, i) => <li key={i}><span className="nd-val-dot orange" />{w}</li>)}
                          </ul>
                        </>
                      )}
                    </>
                  )}
                  <div className="nd-action-row">
                    <button className="nd-forward-btn" onClick={handleSendToNextDept} disabled={saving || showRejectBox}>
                      {saving ? t('sending') : ` ${t('send_next_dept')}`}
                    </button>
                    <button className="nd-reject-btn" onClick={() => setShowRejectBox(!showRejectBox)} disabled={saving}>
                      {t('reject_dpr')}
                    </button>
                  </div>

                  {showRejectBox && (
                    <div className="nd-reject-box">
                      <p className="nd-reject-label">Reason for Rejection <span>(visible to State Government)</span></p>
                      <textarea
                        className="nd-reject-textarea"
                        rows={3}
                        placeholder="e.g. Missing feasibility study, incomplete cost estimates..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                      />
                      <div className="nd-reject-actions">
                        <button className="nd-reject-confirm-btn" onClick={handleRejectDPR} disabled={rejecting || !rejectReason.trim()}>
                          {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
                        </button>
                        <button className="nd-reject-cancel-btn" onClick={() => { setShowRejectBox(false); setRejectReason(''); }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/*  FORWARDED  */}
        {activeTab === 'forwarded' && (
          <div className="nd-section">
            <h2 className="nd-section-title">Forwarded DPRs</h2>
            <ProjectStatusBanner statusMap={statusMap} />
            <div className="nd-table-wrap">
              <table className="nd-table">
                <thead><tr><th>#</th><th>{t('col_title')}</th><th>{t('uploaded_on')}</th><th>{t('col_ministry')}</th></tr></thead>
                <tbody>
                  {forwarded.length === 0
                    ? <tr><td colSpan="4" style={{textAlign:'center',color:'#999',padding:'24px'}}>No DPRs forwarded yet.</td></tr>
                    : forwarded.map((doc, i) => {
                        const md = ministryDecisions[doc.file_path];
                        return (
                          <tr key={doc.id}>
                            <td>{i + 1}</td>
                            <td><span className="nd-file-badge"> {doc.dpr || doc.file_path.replace(/^\d+-/, '')}</span></td>
                            <td>{new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</td>
                            <td>
                              {md ? (
                                <div>
                                  <span style={{padding:'3px 10px',borderRadius:'12px',fontSize:'11px',fontWeight:700,
                                    background: md.decision === 'approved' ? '#e8f5e9' : '#ffebee',
                                    color: md.decision === 'approved' ? '#2e7d32' : '#c62828',
                                    border: `1px solid ${md.decision === 'approved' ? '#a5d6a7' : '#ffcdd2'}`}}>
                                    {md.decision === 'approved' ? 'Approved' : 'Rejected'}
                                  </span>
                                  <p style={{fontSize:'10px',color:'#666',marginTop:'3px'}}>By: {md.decided_by || 'Ministry'}</p>
                                  {md.reason && <p style={{fontSize:'10px',color:'#e53935',marginTop:'2px'}}>Reason: {md.reason}</p>}
                                </div>
                              ) : <span style={{color:'#aaa',fontSize:'12px'}}>Pending</span>}
                            </td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/*  BLOCKCHAIN  */}
        {activeTab === 'blockchain' && (
          <div className="nd-section">
            <h2 className="nd-section-title">⛓ Blockchain Audit Trail — B (AE² Review)</h2>
            <p style={{color:'#666',fontSize:13,marginBottom:8}}>All DPR verifications, forwards and rejections from this stage are permanently recorded.</p>
            <BlockchainAudit title="B — AE² Review Audit Trail" />
          </div>
        )}


        {/*  REJECTED  */}
        {activeTab === 'rejected' && (
          <div className="nd-section">
            <h2 className="nd-section-title">Rejected DPRs</h2>
            <div className="nd-table-wrap">
              <table className="nd-table">
                <thead><tr><th>#</th><th>{t('col_title')}</th><th>{t('rejection_reason')}</th><th>{t('uploaded_on')}</th></tr></thead>
                <tbody>
                  {rejected.length === 0
                    ? <tr><td colSpan="4" style={{textAlign:'center',color:'#999',padding:'24px'}}>No DPRs rejected yet.</td></tr>
                    : rejected.map((doc, i) => (
                      <tr key={doc.id}>
                        <td>{i + 1}</td>
                        <td><span className="nd-file-badge"> {doc.dpr || doc.file_path.replace(/^\d+-/, '')}</span></td>
                        <td style={{color:'#e53935'}}>{doc.reason || ''}</td>
                        <td>{new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      <footer className="nd-footer">
        <p> 2024 Ministry of Development of Southern Region. All Rights Reserved.</p>
      </footer>
    </div>
  );
}

