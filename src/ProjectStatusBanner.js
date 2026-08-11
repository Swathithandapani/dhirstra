import React from 'react';
import { getOverallStatus } from './useProjectStatus';

export default function ProjectStatusBanner({ statusMap }) {
  const projects = Object.values(statusMap);
  if (projects.length === 0) return null;

  const approved  = projects.filter(p => p.ministry_decision === 'approved').length;
  const rejected  = projects.filter(p => p.ministry_decision === 'rejected' || p.nodal_status === 'Nodal Rejected').length;
  const forwarded = projects.filter(p => p.nodal_status === 'Forwarded to Ministry' && !p.ministry_decision).length;
  const pending   = projects.filter(p => !p.nodal_status || p.nodal_status === 'Pending').length;
  const inProgress = projects.filter(p => p.slec_progress > 0 && p.slec_progress < 100).length;
  const completed  = projects.filter(p => p.slec_progress === 100 || p.slec_impl_status === 'Completed').length;

  return (
    <div style={{
      background: 'linear-gradient(135deg,#234f1e,#1a3d16)',
      borderRadius: 10, padding: '14px 20px', marginBottom: 20,
      display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
    }}>
      <span style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.6)',textTransform:'uppercase',letterSpacing:'0.6px',marginRight:4}}>
        Live Project Status
      </span>
      {[
        { label: 'Total',       value: projects.length, color: '#f4d21f' },
        { label: 'Pending',     value: pending,         color: '#90caf9' },
        { label: 'Forwarded',   value: forwarded,       color: '#ce93d8' },
        { label: 'Approved',    value: approved,        color: '#a5d6a7' },
        { label: 'Rejected',    value: rejected,        color: '#ef9a9a' },
        { label: 'In Progress', value: inProgress,      color: '#ffcc80' },
        { label: 'Completed',   value: completed,       color: '#80cbc4' },
      ].map(s => (
        <div key={s.label} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:60}}>
          <span style={{fontSize:20,fontWeight:800,color:s.color}}>{s.value}</span>
          <span style={{fontSize:9,color:'rgba(255,255,255,0.55)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px'}}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ProjectStatusRow({ ps, showSLEC }) {
  if (!ps) return null;
  const overall = getOverallStatus(ps);
  return (
    <div style={{
      background:'#fafafa', border:'1px solid #e8f5e9', borderRadius:8,
      padding:'10px 14px', fontSize:12, display:'flex', flexWrap:'wrap', gap:12, alignItems:'center',
    }}>
      <span style={{fontWeight:700,color:'#234f1e',flex:1,minWidth:120}}>{ps.dpr_name || ps.file_path}</span>
      <span style={{padding:'2px 10px',borderRadius:10,fontWeight:700,fontSize:11,
        background:overall.color+'22',color:overall.color,border:`1px solid ${overall.color}`}}>
        {overall.label}
      </span>
      {ps.ministry_decided_by && (
        <span style={{color:'#555',fontSize:11}}>By: <strong>{ps.ministry_decided_by}</strong></span>
      )}
      {ps.ministry_decided_at && (
        <span style={{color:'#aaa',fontSize:10}}>{new Date(ps.ministry_decided_at).toLocaleDateString('en-GB')}</span>
      )}
      {showSLEC && ps.slec_progress > 0 && (
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:80,height:6,background:'#e8f5e9',borderRadius:3,overflow:'hidden'}}>
            <div style={{width:`${ps.slec_progress}%`,height:'100%',background:ps.slec_progress>=80?'#43a047':ps.slec_progress>=40?'#fb8c00':'#1565c0',borderRadius:3}} />
          </div>
          <span style={{fontSize:11,color:'#555',fontWeight:700}}>{ps.slec_progress}%</span>
        </div>
      )}
      {ps.ministry_reject_reason && (
        <span style={{color:'#e53935',fontSize:11}}>Reason: {ps.ministry_reject_reason}</span>
      )}
      {ps.nodal_reject_reason && !ps.ministry_decision && (
        <span style={{color:'#e53935',fontSize:11}}>Reason: {ps.nodal_reject_reason}</span>
      )}
    </div>
  );
}
