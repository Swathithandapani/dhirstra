/**
 * BlockchainAudit.js
 * ──────────────────
 * Reusable component shown in all 4 dashboards.
 * Displays the tamper-evident audit trail for DPR activities.
 *
 * Props:
 *   dprId  (string)  — filter trail to one DPR; if omitted shows full chain
 *   title  (string)  — optional heading override
 */

import React, { useState, useEffect, useCallback } from 'react';
import API from './api';

const STAGE_COLOR = {
  'A-AE Review':  '#1565c0',
  'B-AE2 Review': '#6a1b9a',
  'C-EA Review':  '#e65100',
  'D-SC Review':  '#1b5e20',
  'System':       '#546e7a',
};

const ACTION_COLOR = {
  'Submitted':   '#1e88e5',
  'Verified':    '#43a047',
  'Forwarded':   '#7b1fa2',
  'Rejected':    '#e53935',
  'Approved':    '#2e7d32',
  'Correction':  '#f57f17',
  'Chain Initialized': '#546e7a',
};

function shortHash(h) {
  if (!h) return '';
  return h.slice(0, 8) + '...' + h.slice(-6);
}

export default function BlockchainAudit({ dprId, title }) {
  const [blocks, setBlocks]     = useState([]);
  const [verify, setVerify]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = dprId
        ? `${API}/blockchain/trail/${encodeURIComponent(dprId)}`
        : `${API}/blockchain/chain`;
      const [chainRes, verifyRes] = await Promise.all([
        fetch(url),
        fetch(`${API}/blockchain/verify`),
      ]);
      const chainData  = await chainRes.json();
      const verifyData = await verifyRes.json();
      setBlocks(Array.isArray(chainData) ? chainData : []);
      setVerify(verifyData);
    } catch {
      setError('Could not connect to blockchain service.');
    }
    setLoading(false);
  }, [dprId]);

  useEffect(() => { load(); }, [load]);

  const displayBlocks = blocks.filter(b => b.dpr_id !== 'GENESIS');

  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.chainIcon}>⛓</span>
          <div>
            <p style={styles.headerTitle}>{title || 'Blockchain Audit Trail'}</p>
            <p style={styles.headerSub}>Tamper-evident ledger — every DPR action is permanently recorded</p>
          </div>
        </div>
        <div style={styles.headerRight}>
          {verify && (
            <span style={{
              ...styles.verifyBadge,
              background: verify.valid ? '#e8f5e9' : '#ffebee',
              color:       verify.valid ? '#2e7d32' : '#c62828',
              border:      `1px solid ${verify.valid ? '#a5d6a7' : '#ffcdd2'}`,
            }}>
              {verify.valid ? '✓ Chain Intact' : '⚠ Tampered!'} &nbsp;·&nbsp; {verify.length} blocks
            </span>
          )}
          <button style={styles.refreshBtn} onClick={load} disabled={loading}>
            {loading ? '...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {/* Tamper warning */}
      {verify && !verify.valid && (
        <div style={styles.tamperWarn}>
          <strong>⚠ Chain integrity violation detected!</strong>
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            {verify.tampered.map((t, i) => (
              <li key={i} style={{ fontSize: 12 }}>Block {t.index}: {t.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty state */}
      {!loading && displayBlocks.length === 0 && (
        <div style={styles.empty}>
          <span style={{ fontSize: 32 }}>📋</span>
          <p>No audit records yet{dprId ? ` for ${dprId}` : ''}.</p>
          <p style={{ fontSize: 12, color: '#aaa' }}>
            Records appear automatically when DPRs are submitted, forwarded, or decided.
          </p>
        </div>
      )}

      {/* Block list */}
      <div style={styles.blockList}>
        {displayBlocks.map((block, i) => {
          const isOpen = expanded === block.index;
          const stageCol  = STAGE_COLOR[block.stage]  || '#607d8b';
          const actionCol = ACTION_COLOR[block.action] || '#607d8b';
          return (
            <div key={block.index} style={styles.blockCard}>
              {/* Connector line */}
              {i < displayBlocks.length - 1 && <div style={styles.connector} />}

              {/* Block header row */}
              <div style={styles.blockRow} onClick={() => setExpanded(isOpen ? null : block.index)}>
                {/* Index badge */}
                <div style={{ ...styles.indexBadge, background: stageCol }}>
                  #{block.index}
                </div>

                {/* Stage + Action */}
                <div style={styles.blockMeta}>
                  <span style={{ ...styles.stagePill, background: stageCol + '22', color: stageCol, border: `1px solid ${stageCol}` }}>
                    {block.stage}
                  </span>
                  <span style={{ ...styles.actionPill, background: actionCol + '22', color: actionCol, border: `1px solid ${actionCol}` }}>
                    {block.action}
                  </span>
                </div>

                {/* DPR ID */}
                <div style={styles.dprCell}>
                  <span style={styles.dprLabel}>DPR</span>
                  <span style={styles.dprValue}>{block.dpr_id}</span>
                </div>

                {/* Reviewer */}
                <div style={styles.reviewerCell}>
                  <span style={styles.reviewerIcon}>👤</span>
                  <span style={styles.reviewerName}>{block.reviewer}</span>
                </div>

                {/* Timestamp */}
                <div style={styles.timeCell}>
                  {new Date(block.timestamp).toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>

                {/* Expand toggle */}
                <span style={styles.expandBtn}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Expanded hash details */}
              {isOpen && (
                <div style={styles.hashPanel}>
                  <div style={styles.hashRow}>
                    <span style={styles.hashLabel}>Block Hash</span>
                    <code style={styles.hashCode}>{block.hash}</code>
                  </div>
                  <div style={styles.hashRow}>
                    <span style={styles.hashLabel}>Previous Hash</span>
                    <code style={{ ...styles.hashCode, color: '#888' }}>{block.previous_hash}</code>
                  </div>
                  <div style={styles.hashRow}>
                    <span style={styles.hashLabel}>Timestamp (UTC)</span>
                    <code style={styles.hashCode}>{block.timestamp}</code>
                  </div>
                  <div style={styles.hashRow}>
                    <span style={styles.hashLabel}>Chain Link</span>
                    <span style={{ fontSize: 12, color: '#43a047' }}>
                      ✓ {shortHash(block.previous_hash)} → {shortHash(block.hash)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <span style={styles.legendTitle}>Stages:</span>
        {Object.entries(STAGE_COLOR).filter(([k]) => k !== 'System').map(([stage, col]) => (
          <span key={stage} style={{ ...styles.legendPill, background: col + '22', color: col, border: `1px solid ${col}` }}>
            {stage}
          </span>
        ))}
      </div>
    </div>
  );
}

const styles = {
  wrap:         { background: '#fff', borderRadius: 12, border: '1px solid #e0e0e0', padding: '20px 24px', marginTop: 24 },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 },
  headerLeft:   { display: 'flex', alignItems: 'center', gap: 12 },
  chainIcon:    { fontSize: 28 },
  headerTitle:  { margin: 0, fontWeight: 700, fontSize: 16, color: '#1a1a1a' },
  headerSub:    { margin: 0, fontSize: 12, color: '#888', marginTop: 2 },
  headerRight:  { display: 'flex', alignItems: 'center', gap: 10 },
  verifyBadge:  { padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 },
  refreshBtn:   { padding: '5px 14px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  error:        { color: '#e53935', fontSize: 13, marginBottom: 12 },
  tamperWarn:   { background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#c62828', fontSize: 13 },
  empty:        { textAlign: 'center', padding: '32px 0', color: '#999', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  blockList:    { display: 'flex', flexDirection: 'column', gap: 0 },
  blockCard:    { position: 'relative', paddingLeft: 16 },
  connector:    { position: 'absolute', left: 22, top: 40, bottom: -8, width: 2, background: '#e0e0e0', zIndex: 0 },
  blockRow:     { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fafafa', borderRadius: 8, border: '1px solid #eeeeee', marginBottom: 8, cursor: 'pointer', flexWrap: 'wrap', position: 'relative', zIndex: 1 },
  indexBadge:   { minWidth: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 },
  blockMeta:    { display: 'flex', gap: 6, flexWrap: 'wrap', flex: '0 0 auto' },
  stagePill:    { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
  actionPill:   { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
  dprCell:      { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 100 },
  dprLabel:     { fontSize: 9, color: '#aaa', fontWeight: 700, textTransform: 'uppercase' },
  dprValue:     { fontSize: 12, color: '#333', fontWeight: 600, wordBreak: 'break-all' },
  reviewerCell: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 100 },
  reviewerIcon: { fontSize: 13 },
  reviewerName: { fontSize: 12, color: '#555' },
  timeCell:     { fontSize: 11, color: '#888', minWidth: 110, textAlign: 'right' },
  expandBtn:    { fontSize: 10, color: '#aaa', marginLeft: 4 },
  hashPanel:    { background: '#1a1a2e', borderRadius: 8, padding: '12px 16px', marginBottom: 10, marginLeft: 8, display: 'flex', flexDirection: 'column', gap: 8 },
  hashRow:      { display: 'flex', alignItems: 'flex-start', gap: 12 },
  hashLabel:    { fontSize: 10, color: '#888', fontWeight: 700, textTransform: 'uppercase', minWidth: 110, paddingTop: 2 },
  hashCode:     { fontSize: 11, color: '#a5d6a7', fontFamily: 'monospace', wordBreak: 'break-all' },
  legend:       { display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  legendTitle:  { fontSize: 11, color: '#888', fontWeight: 700 },
  legendPill:   { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
};
