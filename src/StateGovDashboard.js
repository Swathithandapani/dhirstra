import React, { useState } from 'react';
import { useProjectStatus, getOverallStatus } from './useProjectStatus';
import ProjectStatusBanner, { ProjectStatusRow } from './ProjectStatusBanner';
import { useNavigate } from 'react-router-dom';
import './StateGovDashboard.css';
import LanguageSelector from './LanguageSelector';
import { useT } from './LanguageContext';
import BlockchainAudit from './BlockchainAudit';

const mockProposals = [
  { id: 'DPR-2024-001', title: 'NH Extension - Tamil Nadu', type: 'Construction DPR', status: 'Under Review', date: '12-Jan-2024', amount: ' 245 Cr', priority: 'High', file: 'NH_Extension_DPR.pdf' },
  { id: 'DPR-2024-002', title: 'Community Hall Construction - Karnataka', type: 'Construction DPR', status: 'Approved', date: '18-Jan-2024', amount: ' 120 Cr', priority: 'Medium', file: 'Community_Hall_DPR.pdf' },
  { id: 'DPR-2024-003', title: 'Rural Road Construction - Kerala', type: 'Construction DPR', status: 'Pending', date: '25-Jan-2024', amount: ' 89 Cr', priority: 'High', file: 'Rural_Road_DPR.pdf' },
  { id: 'DPR-2024-004', title: 'School Building Construction - Andhra Pradesh', type: 'Construction DPR', status: 'Rejected', date: '02-Feb-2024', amount: ' 310 Cr', priority: 'Low', file: 'School_Building_DPR.pdf' },
  { id: 'DPR-2024-005', title: 'Bridge Construction - Telangana', type: 'Construction DPR', status: 'Under Review', date: '10-Feb-2024', amount: ' 175 Cr', priority: 'Medium', file: 'Bridge_Construction_DPR.pdf' },
];

const financialLimits = [
  { category: 'Road & Bridge Construction', limit: ' 500 Cr', utilized: ' 320 Cr', percent: 64 },
  { category: 'Building Construction', limit: ' 300 Cr', utilized: ' 120 Cr', percent: 40 },
  { category: 'Infrastructure Construction', limit: ' 400 Cr', utilized: ' 310 Cr', percent: 78 },
  { category: 'Rural Construction Works', limit: ' 250 Cr', utilized: ' 90 Cr', percent: 36 },
];

const statusColor = { Approved: '#43a047', 'Ministry Approved': '#1b5e20', 'Ministry Rejected': '#b71c1c', 'Forwarded to Ministry': '#7b1fa2', 'Nodal Rejected': '#e53935', 'Under Review': '#fb8c00', Pending: '#1e88e5', Rejected: '#e53935' };
const priorityColor = { High: '#e53935', Medium: '#fb8c00', Low: '#43a047' };

export default function StateGovDashboard() {
  const navigate = useNavigate();
  const t = useT();
  const [activeTab, setActiveTab] = useState('overview');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: '', amount: '', priority: 'Medium', description: '', file: null });
  const [fileError, setFileError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [validating, setValidating] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [filterStatus, setFilterStatus] = useState('All');
  const [submitted, setSubmitted] = useState(false);
  const [nodalRejected, setNodalRejected] = useState([]);
  const { statusMap, reload: reloadStatus } = useProjectStatus();
  const [ministryDecisions, setMinistryDecisions] = useState({});
  const user_id = 'state_gov_user';

  const validatePDF = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const reasons = [];
        const text = new TextDecoder('latin1').decode(new Uint8Array(e.target.result));

        if (!text.startsWith('%PDF-')) reasons.push('Invalid file  not a proper PDF document.');
        if (file.size < 10 * 1024) reasons.push('File is too small (under 10KB)  DPR appears empty or incomplete.');
        if (file.size > 20 * 1024 * 1024) reasons.push('File exceeds 20MB  please compress before uploading.');
        if (!/BT[\s\S]{1,500}ET/.test(text)) reasons.push('No readable text detected  scanned image PDFs are not accepted.');

        resolve(reasons);
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const processFile = async (file) => {
    if (file.type !== 'application/pdf') {
      setFileError('Only PDF files are allowed.');
      setRejectionReasons([]);
      return;
    }
    setValidating(true);
    setRejectionReasons([]);
    setFileError('');
    const reasons = await validatePDF(file);
    setValidating(false);
    if (reasons.length > 0) {
      setRejectionReasons(reasons);
      setFormData((prev) => ({ ...prev, file: null }));
    } else {
      setFormData((prev) => ({ ...prev, file }));
    }
  };

  const handleFormChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  // Load documents from DB on mount
  React.useEffect(() => {
    Promise.all([
      fetch(`http://localhost:5000/documents/${user_id}`).then(r => r.json()),
      fetch('http://localhost:5000/documents/nodal_rejected').then(r => r.json()),
      fetch('http://localhost:5000/documents/nodal_forwarded').then(r => r.json()),
      fetch('http://localhost:5000/ministry-decisions').then(r => r.json()),
    ]).then(([docs, rejected, forwarded, mdList]) => {
      const mdMap = {};
      (Array.isArray(mdList) ? mdList : []).forEach(d => { mdMap[d.file_path] = d; });
      setMinistryDecisions(mdMap);
      const rejectedPaths = new Set((Array.isArray(rejected) ? rejected : []).map(r => r.file_path));
      const forwardedPaths = new Set((Array.isArray(forwarded) ? forwarded : []).map(f => f.file_path));
      const rejectedReasonMap = {};
      (Array.isArray(rejected) ? rejected : []).forEach(r => { rejectedReasonMap[r.file_path] = r.reason; });

      const loaded = (Array.isArray(docs) ? docs : []).map((d, i) => {
        const md = mdMap[d.file_path];
        let status = 'Pending';
        if (md?.decision === 'approved') status = 'Ministry Approved';
        else if (md?.decision === 'rejected') status = 'Ministry Rejected';
        else if (rejectedPaths.has(d.file_path)) status = 'Nodal Rejected';
        else if (forwardedPaths.has(d.file_path)) status = 'Forwarded to Ministry';
        return {
          id: `DPR-${d.id || i + 1}`,
          title: d.file_path.replace(/^\d+-/, '').replace('.pdf', '').replace(/_/g, ' '),
          type: 'Construction DPR',
          status,
          rejectionReason: rejectedReasonMap[d.file_path] || null,
          date: new Date(d.uploaded_at || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          amount: '',
          priority: 'Medium',
          file: d.file_path,
        };
      });
      setProposals(loaded);
      setNodalRejected(Array.isArray(rejected) ? rejected : []);
    }).catch(() => setProposals(mockProposals));
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleSubmitProposal = async (e) => {
    e.preventDefault();
    if (!formData.file) { setFileError('Please upload the DPR as a PDF file.'); return; }

    const data = new FormData();
    data.append('file', formData.file);
    data.append('user_id', user_id);

    try {
      const res = await fetch('http://localhost:5000/upload', { method: 'POST', body: data });
      const result = await res.json();
      if (res.ok) {
        // Log to blockchain
        fetch('http://localhost:5000/blockchain/add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dpr_id: formData.file.name, stage: 'A-AE Review', action: 'Submitted', reviewer: 'State Government' }),
        }).catch(() => {});
        const newProposal = {
          id: `DPR-${proposals.length + 1}`,
          title: formData.file.name.replace('.pdf', '').replace(/_/g, ' '),
          type: 'Construction DPR',
          status: t('pending'),
          date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          amount: '',
          priority: 'Medium',
          file: formData.file.name,
        };
        setProposals([newProposal, ...proposals]);
        setFormData({ title: '', amount: '', priority: 'Medium', description: '', file: null });
        setFileError('');
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 3000);
      } else {
        setFileError(result.message || 'Upload failed. Please try again.');
      }
    } catch {
      setFileError('Server unreachable. Please ensure the backend is running.');
    }
  };

  const filtered = filterStatus === 'All' ? proposals : proposals.filter(p => p.status === filterStatus);

  const counts = {
    total: proposals.length,
    approved: proposals.filter(p => p.status === t('approved')).length,
    review: proposals.filter(p => p.status === t('under_review')).length,
    pending: proposals.filter(p => p.status === t('pending')).length,
  };

  return (
    <div className="sg-page">
      {/* Header */}
      <header className="sg-header">
        <div className="sg-header-left">
          <img src="https://www.cleanpng.com/png-tamil-nadu-state-emblem-png-with-lion-and-tower-4kvtim/" alt="Tamil Nadu Emblem" className="sg-emblem" />
          <div>
            <h1>A — AE Review</h1>
            <p>{t('state_gov_dash')}</p>
          </div>
        </div>
        <div className="sg-header-right">
          <div className="sg-user-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            {t('state_gov_user')}
          </div>
          <LanguageSelector style={{ marginRight: 8 }} />
          <button className="sg-logout" onClick={() => navigate('/')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {t('logout')}
          </button>
        </div>
      </header>

      {/* Nav Tabs */}
      <nav className="sg-nav">
        {[
          { key: 'overview',    label: t('overview') },
          { key: 'submit',      label: t('submit_proposals') },
          { key: 'track',       label: t('track_status') },
          { key: 'limits',      label: t('financial_limits') },
          { key: 'prioritize',  label: t('prioritize') },
          { key: 'blockchain',  label: '⛓ Audit Trail' },
        ].map(tab => (
          <button key={tab.key} className={`sg-nav-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="sg-main">

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="sg-section">
            <h2 className="sg-section-title">Dashboard Overview</h2>
            <ProjectStatusBanner statusMap={statusMap} />
            <div className="sg-stats-grid">
              <div className="sg-stat-card total"><p className="sg-stat-num">{counts.total}</p><p className="sg-stat-label">Total Proposals</p></div>
              <div className="sg-stat-card approved"><p className="sg-stat-num">{counts.approved}</p><p className="sg-stat-label">Approved</p></div>
              <div className="sg-stat-card review"><p className="sg-stat-num">{counts.review}</p><p className="sg-stat-label">Under Review</p></div>
              <div className="sg-stat-card pending"><p className="sg-stat-num">{counts.pending}</p><p className="sg-stat-label">Pending</p></div>
            </div>

            <h3 className="sg-sub-title">Recent Submissions</h3>
            <div className="sg-table-wrap">
              <table className="sg-table">
                <thead><tr><th>{t('col_id')}</th><th>{t('col_title')}</th><th>{t('col_type')}</th><th>{t('col_amount')}</th><th>{t('col_status')}</th><th>{t('col_priority')}</th></tr></thead>
                <tbody>
                  {proposals.slice(0, 3).map(p => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td>{p.title}</td>
                      <td><span className="sg-badge type">{p.type}</span></td>
                      <td>{p.amount}</td>
                      <td><span className="sg-badge" style={{ backgroundColor: statusColor[p.status] + '22', color: statusColor[p.status], border: `1px solid ${statusColor[p.status]}` }}>{p.status}</span></td>
                      <td><span className="sg-badge" style={{ backgroundColor: priorityColor[p.priority] + '22', color: priorityColor[p.priority], border: `1px solid ${priorityColor[p.priority]}` }}>{p.priority}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUBMIT */}
        {activeTab === 'submit' && (
          <div className="sg-section">
            <h2 className="sg-section-title">Submit Construction DPR</h2>

            {submitted && <div className="sg-success-msg"> DPR submitted successfully!</div>}

            {rejectionReasons.length > 0 && (
              <div className="sg-rejection-panel">
                <div className="sg-rejection-header">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  DPR Rejected  Format Issues Detected
                </div>
                <p className="sg-rejection-sub">Please fix the following issues and re-upload:</p>
                <ul className="sg-rejection-list">
                  {rejectionReasons.map((r, i) => (
                    <li key={i}>
                      <span className="sg-rejection-num">{i + 1}</span>
                      {r}
                    </li>
                  ))}
                </ul>
                <button className="sg-retry-btn" onClick={() => { setRejectionReasons([]); document.getElementById('dpr-upload').click(); }}> Re-upload Corrected DPR</button>
              </div>
            )}

            <form onSubmit={handleSubmitProposal}>
              <div
                className={`sg-upload-zone ${dragOver ? 'drag-over' : ''} ${formData.file ? 'has-file' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => { if (!validating) document.getElementById('dpr-upload').click(); }}
              >
                <input id="dpr-upload" type="file" accept="application/pdf" onChange={handleFileChange} style={{ display: 'none' }} />
                {validating ? (
                  <>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#234f1e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="sg-spin">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    <p className="sg-upload-title">Validating DPR format...</p>
                    <p className="sg-upload-hint">Checking structure, cost data, IS codes</p>
                  </>
                ) : formData.file ? (
                  <>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#234f1e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="9" y1="13" x2="15" y2="13"/>
                      <line x1="9" y1="17" x2="15" y2="17"/>
                    </svg>
                    <p className="sg-upload-filename">{formData.file.name}</p>
                    <p className="sg-upload-filesize">{(formData.file.size / 1024).toFixed(1)} KB  PDF</p>
                    <button type="button" className="sg-remove-file" onClick={(e) => { e.stopPropagation(); setFormData({ ...formData, file: null }); setRejectionReasons([]); }}> Remove</button>
                  </>
                ) : (
                  <>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 16 12 12 8 16"/>
                      <line x1="12" y1="12" x2="12" y2="21"/>
                      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                    </svg>
                    <p className="sg-upload-title">Drag & Drop your DPR here</p>
                    <p className="sg-upload-sub">or <span>click to browse</span></p>
                    <p className="sg-upload-hint">PDF files only  Max 20MB</p>
                  </>
                )}
              </div>
              {fileError && <p className="sg-file-error">{fileError}</p>}
              <button type="submit" className="sg-primary-btn sg-submit-btn">{t('submit_dpr')}</button>
            </form>

            <div className="sg-table-wrap">
              <table className="sg-table">
                <thead><tr><th>{t('col_id')}</th><th>{t('col_title')}</th><th>{t('col_date')}</th><th>{t('col_amount')}</th><th>{t('col_file')}</th><th>{t('col_status')}</th></tr></thead>
                <tbody>
                  {proposals.map(p => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td>{p.title}</td>
                      <td>{p.date}</td>
                      <td>{p.amount}</td>
                      <td><span className="sg-file-badge"> {p.file}</span></td>
                      <td><span className="sg-badge" style={{ backgroundColor: statusColor[p.status] + '22', color: statusColor[p.status], border: `1px solid ${statusColor[p.status]}` }}>{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TRACK */}
        {activeTab === 'track' && (
          <div className="sg-section">
            <h2 className="sg-section-title">Track Status of Submitted Proposals</h2>
            <ProjectStatusBanner statusMap={statusMap} />
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
              {Object.values(statusMap).map(ps => <ProjectStatusRow key={ps.file_path} ps={ps} showSLEC={true} />)}
            </div>
            <div className="sg-filter-row">
              {['All', t('approved'), t('under_review'), t('pending'), 'Rejected'].map(s => (
                <button key={s} className={`sg-filter-btn ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>{s}</button>
              ))}
            </div>
            <div className="sg-table-wrap">
              <table className="sg-table">
                <thead><tr><th>{t('col_id')}</th><th>{t('col_title')}</th><th>{t('col_date')}</th><th>{t('col_status')}</th><th>{t('col_ministry')}</th></tr></thead>
                <tbody>
                  {filtered.map(p => {
                    const md = ministryDecisions[p.file];
                    const finalStatus = md ? (md.decision === 'approved' ? 'Ministry Approved' : 'Ministry Rejected') : p.status;
                    return (
                      <tr key={p.id}>
                        <td>{p.id}</td>
                        <td>{p.title}</td>
                        <td>{p.date}</td>
                        <td><span className="sg-badge" style={{ backgroundColor: (statusColor[finalStatus]||'#888') + '22', color: statusColor[finalStatus]||'#888', border: `1px solid ${statusColor[finalStatus]||'#888'}` }}>{finalStatus}</span></td>
                        <td>
                          {md ? (
                            <div>
                              <span style={{fontWeight:700,fontSize:'12px',color: md.decision==='approved'?'#1b5e20':'#b71c1c'}}>
                                {md.decision === 'approved' ? t('approved') : 'Rejected'}
                              </span>
                              <p style={{fontSize:'11px',color:'#555',marginTop:'2px'}}>By: {md.decided_by || 'Ministry'}</p>
                              <p style={{fontSize:'10px',color:'#888'}}>{md.decided_by_role || ''}</p>
                              {md.reason && <p style={{fontSize:'11px',color:'#e53935',marginTop:'2px'}}>Reason: {md.reason}</p>}
                              <p style={{fontSize:'10px',color:'#aaa'}}>{md.decided_at ? new Date(md.decided_at).toLocaleString('en-GB') : ''}</p>
                            </div>
                          ) : <span style={{color:'#aaa',fontSize:'12px'}}>{t('awaiting_ministry')}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FINANCIAL LIMITS */}
        {activeTab === 'limits' && (
          <div className="sg-section">
            <h2 className="sg-section-title">Normative Financial Limits</h2>
            <div className="sg-limits-grid">
              {financialLimits.map(f => (
                <div className="sg-limit-card" key={f.category}>
                  <h4>{f.category}</h4>
                  <div className="sg-limit-row"><span>{t('sanctioned_limit')}</span><strong>{f.limit}</strong></div>
                  <div className="sg-limit-row"><span>{t('utilized')}</span><strong>{f.utilized}</strong></div>
                  <div className="sg-progress-bar">
                    <div className="sg-progress-fill" style={{ width: `${f.percent}%`, backgroundColor: f.percent > 70 ? '#e53935' : f.percent > 40 ? '#fb8c00' : '#43a047' }} />
                  </div>
                  <p className="sg-percent-label">{f.percent}% utilized</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BLOCKCHAIN AUDIT TRAIL */}
        {activeTab === 'blockchain' && (
          <div className="sg-section">
            <h2 className="sg-section-title">⛓ Blockchain Audit Trail — A (AE Review)</h2>
            <p style={{color:'#666',fontSize:13,marginBottom:8}}>Every DPR submission from this stage is permanently recorded in the tamper-evident ledger.</p>
            <BlockchainAudit title="A — AE Review Audit Trail" />
          </div>
        )}

        {/* PRIORITIZE */}
        {activeTab === 'prioritize' && (
          <div className="sg-section">
            <h2 className="sg-section-title">Prioritize Project Proposals</h2>
            <p className="sg-hint">Drag or use priority tags to manage project priority order.</p>
            <div className="sg-priority-list">
              {['High', 'Medium', 'Low'].map(level => (
                <div key={level} className="sg-priority-group">
                  <div className="sg-priority-group-header" style={{ borderLeft: `4px solid ${priorityColor[level]}`, color: priorityColor[level] }}>
                    {level} Priority
                  </div>
                  {proposals.filter(p => p.priority === level).map(p => (
                    <div className="sg-priority-item" key={p.id}>
                      <div className="sg-priority-item-left">
                        <span className="sg-priority-dot" style={{ backgroundColor: priorityColor[level] }} />
                        <div>
                          <p className="sg-priority-title">{p.title}</p>
                          <p className="sg-priority-meta">{p.id}  {p.type}  {p.amount}</p>
                        </div>
                      </div>
                      <span className="sg-badge" style={{ backgroundColor: statusColor[p.status] + '22', color: statusColor[p.status], border: `1px solid ${statusColor[p.status]}` }}>{p.status}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      <footer className="sg-footer">
        <p> 2024 Ministry of Development of Southern Region. All Rights Reserved.</p>
      </footer>
    </div>
  );
}

