import React, { useState, useEffect } from 'react';
import { useProjectStatus } from './useProjectStatus';
import ProjectStatusBanner from './ProjectStatusBanner';
import { useNavigate } from 'react-router-dom';
import './SLECDashboard.css';
import LanguageSelector from './LanguageSelector';
import { useT } from './LanguageContext';

const STATUS_COLOR = {
  'On Track':    '#43a047',
  'Delayed':     '#e53935',
  'At Risk':     '#fb8c00',
  'Completed':   '#1565c0',
  'Not Started': '#9e9e9e',
};

const COMPLIANCE_COLOR = {
  'Compliant':         '#43a047',
  'Minor Issues':      '#fb8c00',
  'Non-Compliant':     '#e53935',
  'Under Review':      '#1565c0',
};

export default function SLECDashboard() {
  const navigate = useNavigate();
  const t = useT();
  const [activeTab, setActiveTab] = useState('overview');
  const [projects, setProjects]   = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [selected, setSelected]   = useState(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [progressUpdates, setProgressUpdates] = useState({});
  const [remarks, setRemarks]     = useState({});
  const [saving, setSaving]       = useState(false);
  const { statusMap, reload: reloadStatus } = useProjectStatus();
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    // Load forwarded DPRs + ministry decisions + stored analysis
    Promise.all([
      fetch('http://localhost:5000/documents/nodal_forwarded').then(r => r.json()),
      fetch('http://localhost:5000/ministry-decisions').then(r => r.json()),
    ]).then(([forwarded, mdList]) => {
      const mdMap = {};
      (Array.isArray(mdList) ? mdList : []).forEach(d => { mdMap[d.file_path] = d; });
      setDecisions(mdMap);

      const approved = (Array.isArray(forwarded) ? forwarded : []).filter(
        doc => mdMap[doc.file_path]?.decision === 'approved'
      );

      // Load analysis for each approved DPR
      Promise.all(
        approved.map(doc =>
          fetch(`http://localhost:5000/analysis/${doc.file_path}`)
            .then(r => r.ok ? r.json() : null)
            .then(analysis => ({ doc, analysis }))
            .catch(() => ({ doc, analysis: null }))
        )
      ).then(results => {
        const built = results.map(({ doc, analysis }, i) => {
          const info = analysis?.info || {};
          const ps = statusMap[doc.file_path] || {};
          return {
            id: i + 1,
            file_path: doc.file_path,
            name: doc.dpr || doc.file_path.replace(/^\d+-/, ''),
            title: info.title !== 'Not found' ? info.title : doc.dpr || doc.file_path.replace(/^\d+-/, ''),
            location: info.location !== 'Not found' ? info.location : 'Not specified',
            budget: info.budget !== 'Not found' ? info.budget : 'Not specified',
            duration: info.duration !== 'Not found' && info.duration !== 'Not specified in document' ? info.duration : '12 months',
            agency: info.agency !== 'Not found' ? info.agency : 'Not specified',
            type: info.type !== 'Not found' ? info.type : 'Infrastructure',
            spec: info.spec !== 'Not found' ? info.spec : '',
            approvedBy: mdMap[doc.file_path]?.decided_by || 'Central Line Ministries',
            approvedAt: mdMap[doc.file_path]?.decided_at || null,
            implementationStatus: ps.slec_impl_status || 'Not Started',
            timelineCompliance: ps.slec_timeline_compliance || 'Under Review',
            qualityCompliance: ps.slec_quality_compliance || 'Under Review',
            omCompliance: ps.slec_om_compliance || 'Under Review',
            progress: ps.slec_progress || 0,
          };
        });
        setProjects(built);
      });
    }).catch(() => {});
  }, []);

  const handleProgressChange = (file_path, val) => {
    setProgressUpdates(p => ({ ...p, [file_path]: val }));
  };

  const handleRemarkChange = (file_path, val) => {
    setRemarks(r => ({ ...r, [file_path]: val }));
  };

  const handleSaveProgress = async (proj) => {
    setSaving(true);
    const newProgress = parseInt(progressUpdates[proj.file_path] ?? proj.progress, 10);
    const newImplStatus = proj.implementationStatus;
    const newTimeline   = proj.timelineCompliance;
    const newQuality    = proj.qualityCompliance;
    const newOM         = proj.omCompliance;
    const newRemarks    = remarks[proj.file_path] || '';
    try {
      await fetch('http://localhost:5000/slec-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: proj.file_path,
          slec_progress: newProgress,
          slec_impl_status: newImplStatus,
          slec_timeline_compliance: newTimeline,
          slec_quality_compliance: newQuality,
          slec_om_compliance: newOM,
          slec_remarks: newRemarks,
        }),
      });
      setProjects(prev => prev.map(p =>
        p.file_path === proj.file_path
          ? { ...p, progress: newProgress }
          : p
      ));
      reloadStatus();
    } catch { }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const filtered = filterStatus === 'All' ? projects : projects.filter(p => p.implementationStatus === filterStatus);

  const counts = {
    total:     projects.length,
    onTrack:   projects.filter(p => p.implementationStatus === 'On Track').length,
    delayed:   projects.filter(p => p.implementationStatus === 'Delayed').length,
    completed: projects.filter(p => p.implementationStatus === 'Completed').length,
  };

  return (
    <div className="slec-page">
      <header className="slec-header">
        <div className="slec-header-left">
          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Emblem_of_India.svg/200px-Emblem_of_India.svg.png" alt="" className="slec-emblem" />
          <div>
            <h1>Poorvottar Vikas Setu</h1>
            <p>{t('slec_dash')}</p>
          </div>
        </div>
        <div className="slec-header-right">
          <div className="slec-user-badge">SLEC</div>
          <LanguageSelector style={{ marginRight: 8 }} />
          <button className="slec-logout" onClick={() => navigate('/')}>{t('logout')}</button>
        </div>
      </header>

      <nav className="slec-nav">
        {[
          { key: 'overview',    label: t('overview') },
          { key: 'progress',    label: 'Implementation Progress' },
          { key: 'compliance',  label: 'Compliance Monitor' },
          { key: 'om',          label: 'O&M Mechanisms' },
          { key: 'reports',     label: 'Reports' },
        ].map(tab => (
          <button key={tab.key} className={`slec-nav-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="slec-main">

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="slec-section">
            <h2 className="slec-section-title">Ministry-Approved Projects Under SLEC Monitoring</h2>
            <ProjectStatusBanner statusMap={statusMap} />

            <div className="slec-stats-grid">
              <div className="slec-stat-card blue">
                <p className="slec-stat-num">{counts.total}</p>
                <p className="slec-stat-label">Total Approved Projects</p>
              </div>
              <div className="slec-stat-card green">
                <p className="slec-stat-num">{counts.onTrack}</p>
                <p className="slec-stat-label">On Track</p>
              </div>
              <div className="slec-stat-card red">
                <p className="slec-stat-num">{counts.delayed}</p>
                <p className="slec-stat-label">Delayed</p>
              </div>
              <div className="slec-stat-card teal">
                <p className="slec-stat-num">{counts.completed}</p>
                <p className="slec-stat-label">Completed</p>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="slec-empty">
                <p>No Ministry-approved projects yet. Projects appear here once approved by the Ministry.</p>
              </div>
            ) : (
              <div className="slec-table-wrap">
                <table className="slec-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Project Title</th>
                      <th>Location</th>
                      <th>Budget</th>
                      <th>Duration</th>
                      <th>Approved By</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p, i) => (
                      <tr key={p.file_path}>
                        <td>{i + 1}</td>
                        <td>
                          <p style={{fontWeight:600,color:'#1a1a1a',marginBottom:2}}>{p.title}</p>
                          {p.spec && <p style={{fontSize:'11px',color:'#888'}}>{p.spec}</p>}
                        </td>
                        <td>{p.location}</td>
                        <td>{p.budget}</td>
                        <td>{p.duration}</td>
                        <td>
                          <p style={{fontSize:'12px',fontWeight:600,color:'#234f1e'}}>{p.approvedBy}</p>
                          {p.approvedAt && <p style={{fontSize:'10px',color:'#888'}}>{new Date(p.approvedAt).toLocaleDateString('en-GB')}</p>}
                        </td>
                        <td>
                          <span className="slec-badge" style={{background:(STATUS_COLOR[p.implementationStatus]||'#888')+'22',color:STATUS_COLOR[p.implementationStatus]||'#888',border:`1px solid ${STATUS_COLOR[p.implementationStatus]||'#888'}`}}>
                            {p.implementationStatus}
                          </span>
                        </td>
                        <td>
                          <div className="slec-prog-bar">
                            <div className="slec-prog-fill" style={{width:`${p.progress}%`,background:p.progress>=80?'#43a047':p.progress>=40?'#fb8c00':'#1565c0'}} />
                          </div>
                          <p style={{fontSize:'11px',color:'#666',marginTop:3}}>{p.progress}%</p>
                        </td>
                        <td>
                          <button className="slec-action-btn" onClick={() => { setSelected(p); setActiveTab('progress'); }}>
                            {t('monitor')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* IMPLEMENTATION PROGRESS */}
        {activeTab === 'progress' && (
          <div className="slec-section">
            <h2 className="slec-section-title">Implementation Progress Monitoring</h2>

            {saved && <div className="slec-success">Progress updated successfully.</div>}

            {!selected && projects.length > 0 && (
              <p style={{color:'#888',marginBottom:16}}>Select a project from Overview to monitor, or click any project below.</p>
            )}

            <div className="slec-project-list">
              {projects.map(proj => (
                <div key={proj.file_path} className={`slec-proj-card ${selected?.file_path === proj.file_path ? 'active' : ''}`}
                  onClick={() => setSelected(proj)}>
                  <div className="slec-proj-card-top">
                    <div>
                      <p className="slec-proj-title">{proj.title}</p>
                      <p className="slec-proj-meta">{proj.location} | {proj.budget} | {proj.duration}</p>
                      {proj.spec && <p className="slec-proj-spec">{proj.spec}</p>}
                    </div>
                    <span className="slec-badge" style={{background:(STATUS_COLOR[proj.implementationStatus])+'22',color:STATUS_COLOR[proj.implementationStatus],border:`1px solid ${STATUS_COLOR[proj.implementationStatus]}`}}>
                      {proj.implementationStatus}
                    </span>
                  </div>

                  {selected?.file_path === proj.file_path && (
                    <div className="slec-proj-detail" onClick={e => e.stopPropagation()}>

                      {/* Progress update */}
                      <div className="slec-detail-row">
                        <label className="slec-detail-label">Implementation Progress (%)</label>
                        <div style={{display:'flex',alignItems:'center',gap:12}}>
                          <input type="range" min="0" max="100" step="5"
                            value={progressUpdates[proj.file_path] ?? proj.progress}
                            onChange={e => handleProgressChange(proj.file_path, e.target.value)}
                            className="slec-range"
                          />
                          <span className="slec-range-val">{progressUpdates[proj.file_path] ?? proj.progress}%</span>
                        </div>
                        <div className="slec-prog-bar" style={{marginTop:8}}>
                          <div className="slec-prog-fill" style={{width:`${progressUpdates[proj.file_path] ?? proj.progress}%`,background:'#234f1e'}} />
                        </div>
                      </div>

                      {/* Timeline compliance */}
                      <div className="slec-detail-row">
                        <label className="slec-detail-label">Timeline Compliance</label>
                        <select className="slec-select"
                          value={proj.timelineCompliance}
                          onChange={e => setProjects(prev => prev.map(p => p.file_path === proj.file_path ? {...p, timelineCompliance: e.target.value} : p))}>
                          {Object.keys(COMPLIANCE_COLOR).map(k => <option key={k}>{k}</option>)}
                        </select>
                        <span className="slec-compliance-badge" style={{background:COMPLIANCE_COLOR[proj.timelineCompliance]+'22',color:COMPLIANCE_COLOR[proj.timelineCompliance]}}>
                          {proj.timelineCompliance}
                        </span>
                      </div>

                      {/* Quality compliance */}
                      <div className="slec-detail-row">
                        <label className="slec-detail-label">Quality Compliance</label>
                        <select className="slec-select"
                          value={proj.qualityCompliance}
                          onChange={e => setProjects(prev => prev.map(p => p.file_path === proj.file_path ? {...p, qualityCompliance: e.target.value} : p))}>
                          {Object.keys(COMPLIANCE_COLOR).map(k => <option key={k}>{k}</option>)}
                        </select>
                        <span className="slec-compliance-badge" style={{background:COMPLIANCE_COLOR[proj.qualityCompliance]+'22',color:COMPLIANCE_COLOR[proj.qualityCompliance]}}>
                          {proj.qualityCompliance}
                        </span>
                      </div>

                      {/* Implementation status */}
                      <div className="slec-detail-row">
                        <label className="slec-detail-label">Implementation Status</label>
                        <select className="slec-select"
                          value={proj.implementationStatus}
                          onChange={e => setProjects(prev => prev.map(p => p.file_path === proj.file_path ? {...p, implementationStatus: e.target.value} : p))}>
                          {Object.keys(STATUS_COLOR).map(k => <option key={k}>{k}</option>)}
                        </select>
                      </div>

                      {/* Remarks */}
                      <div className="slec-detail-row">
                        <label className="slec-detail-label">SLEC Remarks / Observations</label>
                        <textarea className="slec-textarea" rows={3}
                          placeholder="Enter field observations, issues, or recommendations..."
                          value={remarks[proj.file_path] || ''}
                          onChange={e => handleRemarkChange(proj.file_path, e.target.value)}
                        />
                      </div>

                      <button className="slec-save-btn" onClick={() => handleSaveProgress(proj)} disabled={saving}>
                        {saving ? 'Saving...' : t('save_progress')}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {projects.length === 0 && (
                <div className="slec-empty">No approved projects to monitor yet.</div>
              )}
            </div>
          </div>
        )}

        {/* COMPLIANCE MONITOR */}
        {activeTab === 'compliance' && (
          <div className="slec-section">
            <h2 className="slec-section-title">Compliance with Timelines & Quality Standards</h2>

            <div className="slec-compliance-grid">
              {projects.length === 0 && <div className="slec-empty">No approved projects yet.</div>}
              {projects.map(proj => (
                <div key={proj.file_path} className="slec-compliance-card">
                  <div className="slec-compliance-header">
                    <p className="slec-compliance-title">{proj.title}</p>
                    <p className="slec-compliance-meta">{proj.location} | {proj.agency}</p>
                  </div>
                  <div className="slec-compliance-rows">
                    {[
                      { label: 'Timeline Compliance',  value: proj.timelineCompliance,  icon: 'T' },
                      { label: 'Quality Compliance',   value: proj.qualityCompliance,   icon: 'Q' },
                      { label: 'O&M Compliance',       value: proj.omCompliance,        icon: 'M' },
                    ].map(row => (
                      <div key={row.label} className="slec-compliance-row">
                        <span className="slec-compliance-icon" style={{background:COMPLIANCE_COLOR[row.value]+'22',color:COMPLIANCE_COLOR[row.value]}}>{row.icon}</span>
                        <span className="slec-compliance-row-label">{row.label}</span>
                        <span className="slec-compliance-badge" style={{background:COMPLIANCE_COLOR[row.value]+'22',color:COMPLIANCE_COLOR[row.value],border:`1px solid ${COMPLIANCE_COLOR[row.value]}`}}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="slec-prog-bar" style={{marginTop:12}}>
                    <div className="slec-prog-fill" style={{width:`${proj.progress}%`,background:proj.progress>=80?'#43a047':proj.progress>=40?'#fb8c00':'#1565c0'}} />
                  </div>
                  <p style={{fontSize:'11px',color:'#666',marginTop:4}}>Overall Progress: {proj.progress}%</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* O&M MECHANISMS */}
        {activeTab === 'om' && (
          <div className="slec-section">
            <h2 className="slec-section-title">Operation & Maintenance Mechanisms</h2>

            <div className="slec-om-grid">
              {projects.length === 0 && <div className="slec-empty">No approved projects yet.</div>}
              {projects.map(proj => (
                <div key={proj.file_path} className="slec-om-card">
                  <div className="slec-om-header">
                    <p className="slec-om-title">{proj.title}</p>
                    <span className="slec-compliance-badge" style={{background:COMPLIANCE_COLOR[proj.omCompliance]+'22',color:COMPLIANCE_COLOR[proj.omCompliance],border:`1px solid ${COMPLIANCE_COLOR[proj.omCompliance]}`}}>
                      {proj.omCompliance}
                    </span>
                  </div>
                  <div className="slec-om-rows">
                    {[
                      { label: 'Implementing Agency', value: proj.agency },
                      { label: 'Project Duration',    value: proj.duration },
                      { label: 'Budget',              value: proj.budget },
                      { label: 'Approved By',         value: proj.approvedBy },
                    ].map(row => (
                      <div key={row.label} className="slec-om-row">
                        <span className="slec-om-label">{row.label}</span>
                        <span className="slec-om-value">{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="slec-om-status-row">
                    <label className="slec-detail-label">O&M Status</label>
                    <select className="slec-select"
                      value={proj.omCompliance}
                      onChange={e => setProjects(prev => prev.map(p => p.file_path === proj.file_path ? {...p, omCompliance: e.target.value} : p))}>
                      {Object.keys(COMPLIANCE_COLOR).map(k => <option key={k}>{k}</option>)}
                    </select>
                  </div>
                  {remarks[proj.file_path] && (
                    <div className="slec-om-remark">
                      <p className="slec-detail-label">SLEC Remarks</p>
                      <p style={{fontSize:'12px',color:'#333',marginTop:4}}>{remarks[proj.file_path]}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REPORTS */}
        {activeTab === 'reports' && (
          <div className="slec-section">
            <h2 className="slec-section-title">SLEC Monitoring Reports</h2>

            {projects.length === 0 ? (
              <div className="slec-empty">No approved projects to report on yet.</div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="slec-report-summary">
                  {[
                    { label: 'Total Projects',    value: counts.total,     color: '#1565c0' },
                    { label: t('approved'),          value: counts.onTrack,   color: '#43a047' },
                    { label: t('rejected'),           value: counts.delayed,   color: '#e53935' },
                    { label: t('forwarded'),         value: counts.completed, color: '#234f1e' },
                    { label: 'Avg Progress',      value: projects.length ? Math.round(projects.reduce((s,p)=>s+p.progress,0)/projects.length)+'%' : '0%', color: '#7b1fa2' },
                  ].map(s => (
                    <div key={s.label} className="slec-report-card" style={{borderTop:`4px solid ${s.color}`}}>
                      <p className="slec-report-num" style={{color:s.color}}>{s.value}</p>
                      <p className="slec-report-label">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Per-project report table */}
                <div className="slec-table-wrap" style={{marginTop:24}}>
                  <table className="slec-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Project</th>
                        <th>Location</th>
                        <th>Progress</th>
                        <th>Timeline</th>
                        <th>Quality</th>
                        <th>O&M</th>
                        <th>Status</th>
                        <th>SLEC Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p, i) => (
                        <tr key={p.file_path}>
                          <td>{i+1}</td>
                          <td>
                            <p style={{fontWeight:600,fontSize:'13px'}}>{p.title}</p>
                            {p.spec && <p style={{fontSize:'10px',color:'#888'}}>{p.spec}</p>}
                          </td>
                          <td>{p.location}</td>
                          <td>
                            <div className="slec-prog-bar">
                              <div className="slec-prog-fill" style={{width:`${p.progress}%`,background:p.progress>=80?'#43a047':p.progress>=40?'#fb8c00':'#1565c0'}} />
                            </div>
                            <p style={{fontSize:'11px',color:'#666',marginTop:2}}>{p.progress}%</p>
                          </td>
                          <td><span className="slec-compliance-badge" style={{background:COMPLIANCE_COLOR[p.timelineCompliance]+'22',color:COMPLIANCE_COLOR[p.timelineCompliance]}}>{p.timelineCompliance}</span></td>
                          <td><span className="slec-compliance-badge" style={{background:COMPLIANCE_COLOR[p.qualityCompliance]+'22',color:COMPLIANCE_COLOR[p.qualityCompliance]}}>{p.qualityCompliance}</span></td>
                          <td><span className="slec-compliance-badge" style={{background:COMPLIANCE_COLOR[p.omCompliance]+'22',color:COMPLIANCE_COLOR[p.omCompliance]}}>{p.omCompliance}</span></td>
                          <td><span className="slec-badge" style={{background:(STATUS_COLOR[p.implementationStatus]||'#888')+'22',color:STATUS_COLOR[p.implementationStatus]||'#888',border:`1px solid ${STATUS_COLOR[p.implementationStatus]||'#888'}`}}>{p.implementationStatus}</span></td>
                          <td style={{fontSize:'12px',color:'#555',maxWidth:160}}>{remarks[p.file_path] || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

      </main>

      <footer className="slec-footer">
        <p>2024 Ministry of Development of North Eastern Region — SLEC Monitoring Portal</p>
      </footer>
    </div>
  );
}
