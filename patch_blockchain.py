import re

# ── NodalDashboard.js ──────────────────────────────────────────────────────────
with open('src/NodalDashboard.js', 'rb') as f:
    raw = f.read()

text = raw.decode('utf-8-sig')   # strips BOM if present

# 1. Add BlockchainAudit import after LanguageContext import
text = text.replace(
    "import { useT } from './LanguageContext';",
    "import { useT } from './LanguageContext';\nimport BlockchainAudit from './BlockchainAudit';"
)

# 2. Fix header — add subtitle back
text = text.replace(
    "<h1>B \u2014 AE\u00b2 Review</h1>\r\n          </div>",
    "<h1>B \u2014 AE\u00b2 Review</h1>\r\n            <p>AE\u00b2 Review Dashboard</p>\r\n          </div>"
)

# 3. Add blockchain tab to nav
text = text.replace(
    "{ key: 'rejected',  label: t('rejected_dprs') },",
    "{ key: 'rejected',  label: t('rejected_dprs') },\r\n          { key: 'blockchain',  label: '\u26d3 Audit Trail' },"
)

# 4. Add blockchain panel before REJECTED section
text = text.replace(
    "        {/*  REJECTED  */}\r\n        {activeTab === 'rejected'",
    "        {/*  BLOCKCHAIN  */}\r\n        {activeTab === 'blockchain' && (\r\n          <div className=\"nd-section\">\r\n            <h2 className=\"nd-section-title\">\u26d3 Blockchain Audit Trail \u2014 B (AE\u00b2 Review)</h2>\r\n            <p style={{color:'#666',fontSize:13,marginBottom:8}}>All DPR verifications, forwards and rejections are permanently recorded.</p>\r\n            <BlockchainAudit title=\"B \u2014 AE\u00b2 Review Audit Trail\" />\r\n          </div>\r\n        )}\r\n\r\n        {/*  REJECTED  */}\r\n        {activeTab === 'rejected'"
)

# 5. Auto-log blockchain on forward
text = text.replace(
    "      const res = await fetch('http://localhost:5000/forward-dpr', {",
    "      // Log to blockchain\r\n      fetch('http://localhost:5000/blockchain/add', {\r\n        method: 'POST', headers: { 'Content-Type': 'application/json' },\r\n        body: JSON.stringify({ dpr_id: selected.file_path, stage: 'B-AE2 Review', action: 'Forwarded', reviewer: 'Nodal Division' }),\r\n      }).catch(() => {});\r\n      const res = await fetch('http://localhost:5000/forward-dpr', {"
)

# 6. Auto-log blockchain on reject
text = text.replace(
    "      const res = await fetch('http://localhost:5000/reject-dpr', {",
    "      // Log to blockchain\r\n      fetch('http://localhost:5000/blockchain/add', {\r\n        method: 'POST', headers: { 'Content-Type': 'application/json' },\r\n        body: JSON.stringify({ dpr_id: selected.file_path, stage: 'B-AE2 Review', action: 'Rejected', reviewer: 'Nodal Division' }),\r\n      }).catch(() => {});\r\n      const res = await fetch('http://localhost:5000/reject-dpr', {"
)

with open('src/NodalDashboard.js', 'wb') as f:
    f.write(text.encode('utf-8'))

print("NodalDashboard.js patched OK")

# ── MinistriesDashboard.js ─────────────────────────────────────────────────────
with open('src/MinistriesDashboard.js', 'rb') as f:
    raw = f.read()

text = raw.decode('utf-8-sig')

# 1. Add BlockchainAudit import
text = text.replace(
    "import { useT } from './LanguageContext';",
    "import { useT } from './LanguageContext';\nimport BlockchainAudit from './BlockchainAudit';"
)

# 2. Fix header subtitle
text = text.replace(
    "<h1>C \u2014 EA Review</h1>",
    "<h1>C \u2014 EA Review</h1>\r\n            <p>EA Review Dashboard</p>"
)

# 3. Add blockchain tab to nav
text = text.replace(
    "{ key: 'twin',        label: t('digital_twin') },",
    "{ key: 'twin',        label: t('digital_twin') },\r\n          { key: 'blockchain',  label: '\u26d3 Audit Trail' },"
)

# 4. Add blockchain panel before footer
text = text.replace(
    "      </main>\r\n\r\n      <footer className=\"md-footer\">",
    "      {/*  BLOCKCHAIN  */}\r\n        {activeTab === 'blockchain' && (\r\n          <div className=\"md-section\">\r\n            <h2 className=\"md-section-title\">\u26d3 Blockchain Audit Trail \u2014 C (EA Review)</h2>\r\n            <p style={{color:'#666',fontSize:13,marginBottom:8}}>All Ministry approvals and rejections are permanently recorded.</p>\r\n            <BlockchainAudit title=\"C \u2014 EA Review Audit Trail\" />\r\n          </div>\r\n        )}\r\n\r\n      </main>\r\n\r\n      <footer className=\"md-footer\">"
)

# 5. Auto-log on approve
text = text.replace(
    "      const res = await fetch('http://localhost:5000/ministry-approve', {",
    "      fetch('http://localhost:5000/blockchain/add', {\r\n        method: 'POST', headers: { 'Content-Type': 'application/json' },\r\n        body: JSON.stringify({ dpr_id: selected.file_path, stage: 'C-EA Review', action: 'Approved', reviewer: 'Central Line Ministries' }),\r\n      }).catch(() => {});\r\n      const res = await fetch('http://localhost:5000/ministry-approve', {"
)

# 6. Auto-log on reject
text = text.replace(
    "      const res = await fetch('http://localhost:5000/ministry-reject', {",
    "      fetch('http://localhost:5000/blockchain/add', {\r\n        method: 'POST', headers: { 'Content-Type': 'application/json' },\r\n        body: JSON.stringify({ dpr_id: selected.file_path, stage: 'C-EA Review', action: 'Rejected', reviewer: 'Central Line Ministries' }),\r\n      }).catch(() => {});\r\n      const res = await fetch('http://localhost:5000/ministry-reject', {"
)

with open('src/MinistriesDashboard.js', 'wb') as f:
    f.write(text.encode('utf-8'))

print("MinistriesDashboard.js patched OK")

# ── SLECDashboard.js ───────────────────────────────────────────────────────────
with open('src/SLECDashboard.js', 'rb') as f:
    raw = f.read()

text = raw.decode('utf-8-sig')

# 1. Add BlockchainAudit import
text = text.replace(
    "import { useT } from './LanguageContext';",
    "import { useT } from './LanguageContext';\nimport BlockchainAudit from './BlockchainAudit';"
)

# 2. Fix header subtitle
text = text.replace(
    "<h1>D \u2014 SC Review</h1>",
    "<h1>D \u2014 SC Review</h1>\r\n            <p>SC Review Dashboard</p>"
)

# 3. Add blockchain tab to nav
text = text.replace(
    "{ key: 'reports',     label: 'Reports' },",
    "{ key: 'reports',     label: 'Reports' },\r\n          { key: 'blockchain',  label: '\u26d3 Audit Trail' },"
)

# 4. Add blockchain panel before footer
text = text.replace(
    "      </main>\r\n\r\n      <footer className=\"slec-footer\">",
    "      {/* BLOCKCHAIN */}\r\n        {activeTab === 'blockchain' && (\r\n          <div className=\"slec-section\">\r\n            <h2 className=\"slec-section-title\">\u26d3 Blockchain Audit Trail \u2014 D (SC Review)</h2>\r\n            <p style={{color:'#666',fontSize:13,marginBottom:8}}>All SLEC monitoring updates are permanently recorded.</p>\r\n            <BlockchainAudit title=\"D \u2014 SC Review Audit Trail\" />\r\n          </div>\r\n        )}\r\n\r\n      </main>\r\n\r\n      <footer className=\"slec-footer\">"
)

# 5. Auto-log on save progress
text = text.replace(
    "      await fetch('http://localhost:5000/slec-update', {",
    "      fetch('http://localhost:5000/blockchain/add', {\r\n        method: 'POST', headers: { 'Content-Type': 'application/json' },\r\n        body: JSON.stringify({ dpr_id: proj.file_path, stage: 'D-SC Review', action: 'Verified', reviewer: 'SLEC' }),\r\n      }).catch(() => {});\r\n      await fetch('http://localhost:5000/slec-update', {"
)

with open('src/SLECDashboard.js', 'wb') as f:
    f.write(text.encode('utf-8'))

print("SLECDashboard.js patched OK")
print("All 3 dashboards patched successfully.")
