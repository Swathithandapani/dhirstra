import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useProjectStatus } from './useProjectStatus';
import ProjectStatusBanner from './ProjectStatusBanner';
import * as pdfjsLib from 'pdfjs-dist';
import { useNavigate } from 'react-router-dom';
import './MinistriesDashboard.css';
import LanguageSelector from './LanguageSelector';
import { useT } from './LanguageContext';
import BlockchainAudit from './BlockchainAudit';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs`;

const BATCH = 20;

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

  const titleMatch =
    clean.match(/Name\s+of\s+work\s*[;:.]?\s*[:\-]?\s*([^\n]{10,200})/i) ||
    clean.match(/WORK\s*[:\|]\s*([^\n]{10,200})/i) ||
    clean.match(/(?:Construction|Providing|Improvement|Upgradation)\s+of\s+[^\n]{10,200}/i);
  let title = 'Not found';
  if (titleMatch) {
    title = (titleMatch[1] || titleMatch[0]).replace(/\s+/g, ' ').trim().replace(/[~\-\."]+$/, '').trim();
    if (title.length > 150) title = title.substring(0, 150) + '...';
  }

  const locationMatch =
    clean.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+[Dd]istrict/i) ||
    clean.match(/(?:SHILLONG|UMSAWLI|MEGHALAYA|ARUNACHAL|ASSAM|MANIPUR|MIZORAM|NAGALAND|SIKKIM|TRIPURA|SIVAGANGAI|SIVAGANGA|CHENNAI|MADURAI|COIMBATORE|TRICHY|TAMIL\s*NADU)/i) ||
    clean.match(/(?:location|district|state|place|site)\s*[:\-]\s*([^\n]{3,80})/i);
  let location = 'Not found';
  if (locationMatch) {
    const distMatch = clean.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+[Dd]istrict/i);
    location = distMatch ? distMatch[1].trim() + ' District' : (locationMatch[1] || locationMatch[0]).trim();
  }

  let budget = 'Not found';
  const budgetPatterns = [
    /Rs\.?\s*([\d,]+)\/\-/i,
    /Rs\.?\s*([\d,\.]+)\s*(?:Lakh|Lakhs|lakh)/i,
    /amount\s+of\s+Rs\.?\s*([\d,\.]+)\s*(?:lakh|Lakhs|crore|Cr)?/i,
    /(?:GRAND\s+TOTAL|TOTAL\s+PROJECT\s+COST)[^\n]{0,60}?([\d,\.]+)\s*(?:Cr|Crore|Lakh)?/i,
    /(?:total|estimated|project)\s+cost[^\n]{0,40}?(?:Rs\.?|INR|\u20b9)?\s*([\d,\.]+)\s*(?:Cr|Crore|Lakh)?/i,
  ];
  for (const pat of budgetPatterns) {
    const m = clean.match(pat);
    if (m) {
      const raw = m[1].replace(/,/g, '');
      const num = parseFloat(raw);
      if (!isNaN(num) && num > 0) {
        const cx = m[0].toUpperCase();
        if (cx.includes('LAKH')) budget = '\u20b9' + num.toLocaleString('en-IN') + ' Lakhs';
        else if (cx.includes('CRORE') || cx.includes(' CR')) budget = '\u20b9' + num.toLocaleString('en-IN') + ' Crore';
        else if (num > 100000) budget = '\u20b9' + (num / 100000).toFixed(2) + ' Lakhs';
        else budget = '\u20b9' + num.toLocaleString('en-IN') + ' Lakhs';
        break;
      }
    }
  }

  const durationMatch =
    clean.match(/(?:period\s+of\s+completion|completion\s+period|time\s+limit|duration)\s*[:\-]?\s*([^\n]{3,60})/i) ||
    clean.match(/(\d+\s*(?:months?|years?|days?))\s*(?:from|period|completion)/i);
  const duration = durationMatch ? durationMatch[1].replace(/\s+/g,' ').trim() : '12 months';

  const typeMatch =
    clean.match(/(?:Construction|Providing|Improvement|Upgradation|Renovation)\s+of\s+([^\n]{5,80})/i) ||
    clean.match(/(?:type|nature)\s+of\s+(?:project|work)\s*[:\-]\s*([^\n]{3,60})/i);
  let type = 'Not found';
  if (typeMatch) { type = (typeMatch[1]||typeMatch[0]).replace(/\s+/g,' ').trim(); if(type.length>80) type=type.substring(0,80)+'...'; }

  const agencyMatch =
    clean.match(/(?:SUPERINTENDING\s+ENGINEER|EXECUTIVE\s+ENGINEER|ENGINEER[\s\-]IN[\s\-]CHIEF)[^\n]{0,100}/i) ||
    clean.match(/(?:Public\s+Works\s+Department|PWD)[^\n]{0,80}/i) ||
    clean.match(/SUBMITTED\s+(?:BY|TO)\s*[:\-]?\s*([^\n]{5,120})/i) ||
    clean.match(/(?:implementing|executing|nodal|client)\s+agency\s*[:\-]\s*([^\n]{3,100})/i) ||
    clean.match(/((?:Meghalaya|Arunachal|Assam|Manipur|Mizoram|Nagaland|Sikkim|Tripura|Tamil\s*Nadu)[^\n]{5,80}(?:Society|Department|Authority|Board|Corporation|Council|Ministry|PWD)[^\n]{0,40})/i);
  let agency = 'Not found';
  if (agencyMatch) { agency = (agencyMatch[1]||agencyMatch[0]).replace(/\s+/g,' ').trim(); if(agency.length>120) agency=agency.substring(0,120)+'...'; }

  const fundingMatch = clean.match(/(?:NABARD|RIDF|World\s+Bank|ADB|State\s+Fund|Central\s+Fund)[^\n]{0,60}/i);
  const funding = fundingMatch ? fundingMatch[0].replace(/\s+/g,' ').trim() : null;

  const codesFound = [];
  [{label:'IS-875',patterns:['IS-875','IS 875','IS875']},{label:'IS-456',patterns:['IS-456','IS 456','IS456']},
   {label:'IS-1893',patterns:['IS-1893','IS 1893','IS1893']},{label:'IS-13920',patterns:['IS-13920','IS 13920']},
   {label:'IS-800',patterns:['IS-800','IS 800','IS800']},{label:'IS-1786',patterns:['IS-1786','IS 1786']},
  ].forEach(({ label, patterns }) => { if (patterns.some(p => upper.includes(p))) codesFound.push(label); });

  const costItems = [];
  const costSection = clean.match(/(?:ESTIMATED\s+COST|COST\s+ESTIMATE|FINANCIAL\s+ESTIMATE|lump\s+sum)[\s\S]{0,3000}/i)?.[0] || '';
  const costPattern = /([A-Za-z][A-Za-z\s\/&]{3,45})\s+([\d,\.]{2,12})\s*(?:Cr|Crore|Lakh)?/g;
  let cm;
  while ((cm = costPattern.exec(costSection)) !== null) {
    const amt = parseFloat(cm[2].replace(/,/g,''));
    if (amt > 0.1 && amt < 100000) { costItems.push({ item: cm[1].trim(), amount: cm[2].trim() }); }
    if (costItems.length >= 8) break;
  }

  const techSpecs = [];
  const structMatch2 = clean.match(/(?:framed\s+structure|load\s+bearing|RCC\s+framed|G\+\d[^\n]{0,60})/i);
  if (structMatch2) techSpecs.push({ label:'Structure Type', value:structMatch2[0].replace(/\s+/g,' ').trim() });
  const foundMatch2 = clean.match(/[Ff]oundation[^.]{0,200}\./i);
  if (foundMatch2) techSpecs.push({ label:'Foundation', value:foundMatch2[0].replace(/\s+/g,' ').trim() });
  const gradeMatch2 = clean.match(/M20|M25|M30/g);
  if (gradeMatch2) techSpecs.push({ label:'Concrete Grade', value:[...new Set(gradeMatch2)].join(', ') });
  const steelMatch2 = clean.match(/Fe\s*(?:415|500|550)/gi);
  if (steelMatch2) techSpecs.push({ label:'Steel Grade', value:[...new Set(steelMatch2.map(s=>s.replace(/\s/g,'')))].join(', ') });
  const plinthMatch2 = clean.match(/[Pp]linth\s+area[^\n]{0,60}/i);
  if (plinthMatch2) techSpecs.push({ label:'Plinth Area', value:plinthMatch2[0].replace(/\s+/g,' ').trim() });

  const roomsMatch = clean.match(/(\d+)[\s\-]*(classroom|room|unit|hall|lab|toilet|block)s?/i);
  const rooms = roomsMatch ? `${roomsMatch[1]}-${roomsMatch[2].charAt(0).toUpperCase()+roomsMatch[2].slice(1).toLowerCase()} Building` : 'Not found';
  const floorMatch2 = clean.match(/(?:G\s*\+\s*(\d+)|ground\s*\+\s*(\d+)\s*(?:floor|storey)?|(\d+)\s*(?:floor|storey|storeyed))/i);
  const floorNum = floorMatch2 ? parseInt(floorMatch2[1]||floorMatch2[2]||floorMatch2[3],10) : 0;
  const floors = floorNum > 0 ? `G+${floorNum}` : 'Not found';
  const areaMatch = clean.match(/(\d[\d,\.]*)[\s]*(sq\.?\s*m(?:etre|eter)?s?|sqm|sq\.?\s*ft|sqft)/i);
  const area = areaMatch ? `${areaMatch[1].replace(/,/g,'')} ${areaMatch[2].toLowerCase().includes('f')?'sq.ft':'sq.m'}` : 'Not found';
  const specParts = [rooms,floors,area].filter(v=>v!=='Not found');
  const spec = specParts.length > 0 ? specParts.join(' - ') : 'Not found';

  const qty = {};
  const concM = clean.match(/(\d[\d,\.]+)\s*(?:cum|cu\.?m|m3|cubic\s*m(?:etre|eter)?)/i);
  if (concM) qty.concrete = concM[1].replace(/,/g,'') + ' cum';
  const steelM = clean.match(/(\d[\d,\.]+)\s*(?:MT|tonne|ton|kg)\s*(?:of\s*)?(?:steel|rebar|reinforcement|TMT|Fe)/i) || clean.match(/(?:steel|rebar|reinforcement)\s*[:\-]?\s*(\d[\d,\.]+)\s*(?:MT|tonne|ton|kg)/i);
  if (steelM) qty.steel = (steelM[1]||steelM[2]).replace(/,/g,'') + ' MT';
  const brickM = clean.match(/(\d[\d,\.]+)\s*(?:cum|cu\.?m|m3)\s*(?:of\s*)?(?:brick|masonry)/i) || clean.match(/(?:brick|masonry)\s*[:\-]?\s*(\d[\d,\.]+)\s*(?:cum|cu\.?m|m3)/i);
  if (brickM) qty.brickwork = (brickM[1]||brickM[2]).replace(/,/g,'') + ' cum';
  const excavM = clean.match(/(\d[\d,\.]+)\s*(?:cum|cu\.?m|m3)\s*(?:of\s*)?(?:earth|excavat|soil)/i) || clean.match(/(?:earth\s*work|excavat)\s*[:\-]?\s*(\d[\d,\.]+)\s*(?:cum|cu\.?m|m3)/i);
  if (excavM) qty.excavation = (excavM[1]||excavM[2]).replace(/,/g,'') + ' cum';
  const paintM = clean.match(/(\d[\d,\.]+)\s*(?:sqm|sq\.?m|m2)\s*(?:of\s*)?(?:paint|plaster|finish)/i) || clean.match(/(?:paint|plaster)\s*[:\-]?\s*(\d[\d,\.]+)\s*(?:sqm|sq\.?m|m2)/i);
  if (paintM) qty.plastering = (paintM[1]||paintM[2]).replace(/,/g,'') + ' sqm';
  const flooringM = clean.match(/(\d[\d,\.]+)\s*(?:sqm|sq\.?m|m2)\s*(?:of\s*)?(?:floor|tile|vitrified)/i) || clean.match(/(?:floor|tile)\s*[:\-]?\s*(\d[\d,\.]+)\s*(?:sqm|sq\.?m|m2)/i);
  if (flooringM) qty.flooring = (flooringM[1]||flooringM[2]).replace(/,/g,'') + ' sqm';
  const elecM = clean.match(/(\d+)\s*(?:electrical\s*)?points?/i);
  if (elecM) qty.electrical = elecM[1] + ' pts';
  const pipeM = clean.match(/(\d[\d,\.]+)\s*(?:m|rmt|rm)\s*(?:of\s*)?(?:pipe|CPVC|GI|PVC)/i) || clean.match(/(?:pipe|CPVC|GI|PVC)\s*[:\-]?\s*(\d[\d,\.]+)\s*(?:m|rmt|rm)/i);
  if (pipeM) qty.pipe = (pipeM[1]||pipeM[2]).replace(/,/g,'') + ' m';

    // Signatories
  const signatories = [];
  const iasMatches = [...clean.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z.]+)+)[,\s]+I\.?A\.?S\.?[^\n]{0,80}/gi)];
  for (const m of iasMatches) signatories.push({ name: m[0].replace(/\s+/g,' ').trim(), role: 'IAS Officer' });
  const psMatches = [...clean.matchAll(/(?:Principal\s+Secretary[^\n]{0,100})/gi)];
  for (const m of psMatches) { const v = m[0].replace(/\s+/g,' ').trim(); if (!signatories.some(s=>s.name.includes(v.substring(0,20)))) signatories.push({ name: v, role: 'Principal Secretary' }); }
  const eicMatches = [...clean.matchAll(/(?:Engineer[\s\-]in[\s\-]Chief[^\n]{0,100})/gi)];
  for (const m of eicMatches) { const v = m[0].replace(/\s+/g,' ').trim(); if (!signatories.some(s=>s.name.includes(v.substring(0,20)))) signatories.push({ name: v, role: 'Engineer-in-Chief' }); }
  const seMatches = [...clean.matchAll(/(?:Superintending\s+Engineer[^\n]{0,100})/gi)];
  for (const m of seMatches) { const v = m[0].replace(/\s+/g,' ').trim(); if (!signatories.some(s=>s.name.includes(v.substring(0,20)))) signatories.push({ name: v, role: 'Superintending Engineer' }); }
  const eeMatches = [...clean.matchAll(/(?:Executive\s+Engineer[^\n]{0,100})/gi)];
  for (const m of eeMatches) { const v = m[0].replace(/\s+/g,' ').trim(); if (!signatories.some(s=>s.name.includes(v.substring(0,20)))) signatories.push({ name: v, role: 'Executive Engineer' }); }
  const authCompliance = signatories.length > 0
    ? signatories.some(s => /principal\s+secretary|chief\s+secretary|IAS/i.test(s.name))
      ? 'Compliant'
      : 'Partial'
    : 'Not found';

  const info = { title, location, budget, duration, type, agency, funding, codesFound, costItems, techSpecs, rooms, floors, area, spec, floorNum, qty, signatories, authCompliance };
  const missingSections = REQUIRED_SECTIONS.filter((s) => !sections[s]);
  return { sections, info, missingSections };
};


//  CANVAS SCENE RENDERER 
// Each renderer signature: (ctx, W, H, t, risk, info)
// info = { project_type, budget, duration, location, agency, title, structure }
// draws a callout label: dot at (x,y), line to text box
const drawLabel = (ctx, x, y, text, dir = 'right') => {
  const pad = 5; const th = 16; const tw = ctx.measureText(text).width + pad * 2;
  const lx = dir === 'right' ? x + 14 : x - 14;
  const tx = dir === 'right' ? lx + 4 : lx - tw - 4;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f4d21f'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx, y); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(tx, y - th / 2, tw, th);
  ctx.fillStyle = '#f4d21f'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'left';
  ctx.fillText(text, tx + pad, y + 4);
  ctx.restore();
};

// draws a quantity bubble: green pill with value from document
const drawQtyTag = (ctx, x, y, label, value, dir = 'right') => {
  if (!value) return;
  const text = `${label}: ${value}`;
  ctx.save();
  ctx.font = 'bold 9px Arial';
  const pad = 6; const th = 17;
  const tw = ctx.measureText(text).width + pad * 2;
  const tx = dir === 'right' ? x + 18 : x - tw - 18;
  const ty = y - th / 2;
  // connector dot
  ctx.fillStyle = '#00e676';
  ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  // line
  ctx.strokeStyle = '#00e676'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(dir === 'right' ? x + 16 : x - 16, y); ctx.stroke();
  // pill background
  ctx.fillStyle = 'rgba(0,80,20,0.88)';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(tx, ty, tw, th, 4) : ctx.fillRect(tx, ty, tw, th);
  ctx.fill();
  // border
  ctx.strokeStyle = '#00e676'; ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(tx, ty, tw, th, 4) : ctx.strokeRect(tx, ty, tw, th);
  ctx.stroke();
  // text
  ctx.fillStyle = '#b9f6ca'; ctx.textAlign = 'left';
  ctx.fillText(text, tx + pad, y + 4);
  ctx.restore();
};

// draws a compact multi-row quantity summary panel
const drawQtyPanel = (ctx, x, y, qty, title) => {
  const rows = [
    ['Concrete',   qty.concrete],
    ['Steel',      qty.steel],
    ['Brickwork',  qty.brickwork],
    ['Excavation', qty.excavation],
    ['Plastering', qty.plastering],
    ['Flooring',   qty.flooring],
    ['Electrical', qty.electrical],
    ['Pipe',       qty.pipe],
  ].filter(([,v]) => v);
  if (!rows.length) return;
  ctx.save();
  const rh = 14; const pw = 160; const ph = rh * rows.length + 24;
  ctx.fillStyle = 'rgba(0,40,10,0.88)';
  ctx.strokeStyle = '#00e676'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, pw, ph, 6) : ctx.rect(x, y, pw, ph);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#00e676'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'left';
  ctx.fillText(title || 'QUANTITIES (from DPR)', x + 8, y + 13);
  rows.forEach(([label, val], i) => {
    const ry = y + 22 + i * rh;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    if (i % 2 === 0) ctx.fillRect(x + 1, ry, pw - 2, rh);
    ctx.fillStyle = '#b9f6ca'; ctx.font = '8px Arial';
    ctx.fillText(label, x + 8, ry + 10);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'right';
    ctx.fillText(val, x + pw - 8, ry + 10);
    ctx.textAlign = 'left';
  });
  ctx.restore();
};

const drawInfoBar = (ctx, W, H, info) => {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, H - 44, W, 44);
  // Spec tag (rooms  floors  area)  prominent cyan
  const spec = info.spec && info.spec !== 'Not found' ? info.spec : (info.structure || info.project_type || '');
  ctx.fillStyle = '#4dd0e1';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(spec.length > 55 ? spec.slice(0,55)+'\u2026' : spec, 10, H - 28);
  // Project title below spec
  const title = info.title && info.title !== 'Not found' ? info.title : info.project_type;
  ctx.fillStyle = '#f4d21f';
  ctx.font = 'bold 11px Arial';
  ctx.fillText(title.length > 48 ? title.slice(0,48)+'\u2026' : title, 10, H - 12);
  // Budget + Duration (right)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#aaa';
  ctx.font = '10px Arial';
  ctx.fillText(info.budget && info.budget !== 'Not found' ? `\u20b9${info.budget}` : '', W - 10, H - 28);
  ctx.fillText(info.duration && info.duration !== 'Not found' ? info.duration : '', W - 10, H - 12);
  ctx.textAlign = 'left';
};

const SCENE_RENDERERS = [
  // Scene 0  Site Survey: sky + land + survey team
  (ctx, W, H, t, risk, info = {}) => {
    // Sky gradient
    const sky = ctx.createLinearGradient(0,0,0,H*0.55);
    sky.addColorStop(0,'#f9a825'); sky.addColorStop(1,'#ffe082');
    ctx.fillStyle = sky; ctx.fillRect(0,0,W,H*0.55);
    // Sun
    ctx.beginPath(); ctx.arc(W*0.8, H*0.18, 28, 0, Math.PI*2);
    ctx.fillStyle='#fff176'; ctx.fill();
    // Ground
    const gnd = ctx.createLinearGradient(0,H*0.55,0,H);
    gnd.addColorStop(0,'#8d6e63'); gnd.addColorStop(1,'#6d4c41');
    ctx.fillStyle=gnd; ctx.fillRect(0,H*0.55,W,H*0.45);
    // Hills
    ctx.beginPath(); ctx.moveTo(0,H*0.55);
    ctx.bezierCurveTo(W*0.2,H*0.3, W*0.4,H*0.45, W*0.6,H*0.38);
    ctx.bezierCurveTo(W*0.75,H*0.32, W*0.9,H*0.48, W,H*0.55);
    ctx.fillStyle='#558b2f'; ctx.fill();
    // Survey markers (animated bob)
    [0.2,0.45,0.7].forEach((x,i)=>{
      const bob = Math.sin(t*2+i)*3;
      ctx.fillStyle='#e53935'; ctx.fillRect(W*x-3, H*0.5+bob, 6, 20);
      ctx.fillStyle='#fff'; ctx.fillRect(W*x-8, H*0.5+bob-8, 16, 8);
    });
    // Survey team (stick figures)
    ctx.fillStyle='#ff8f00';
    ctx.fillRect(W*0.35-5, H*0.58, 10, 18);
    ctx.beginPath(); ctx.arc(W*0.35, H*0.57, 7, 0, Math.PI*2); ctx.fill();
    // Part labels
    drawLabel(ctx, W*0.8, H*0.18, 'Sun', 'left');
    drawLabel(ctx, W*0.45, H*0.5, 'Survey Marker', 'right');
    drawLabel(ctx, W*0.35, H*0.6, 'Survey Team', 'right');
    drawLabel(ctx, W*0.5, H*0.42, 'Terrain / Hills', 'right');
    drawLabel(ctx, W*0.1, H*0.7, 'Project Site', 'right');
    drawQtyTag(ctx, W*0.6, H*0.65, 'Site Area', info.qty&&info.qty.excavation ? info.qty.excavation : info.area!=='Not found'?info.area:null, 'right');
    if (info.qty) drawQtyPanel(ctx, W*0.62, H*0.12, info.qty, 'PROJECT QUANTITIES');
    // Label
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(10,10,200,28);
    ctx.fillStyle='#fff'; ctx.font='bold 13px Arial';
    ctx.fillText('SCENE 1  Site Survey', 18, 29);
    drawInfoBar(ctx, W, H, info);
  },
  // Scene 1  Site Clearing: bulldozer moving
  (ctx, W, H, t, risk, info = {}) => {
    ctx.fillStyle='#90a4ae'; ctx.fillRect(0,0,W,H*0.45);
    const gnd = ctx.createLinearGradient(0,H*0.45,0,H);
    gnd.addColorStop(0,'#795548'); gnd.addColorStop(1,'#4e342e');
    ctx.fillStyle=gnd; ctx.fillRect(0,H*0.45,W,H*0.55);
    // Dust clouds
    for(let i=0;i<4;i++){
      ctx.beginPath();
      ctx.arc(W*(0.3+i*0.12)+Math.sin(t+i)*8, H*0.5, 18+i*4, 0, Math.PI*2);
      ctx.fillStyle=`rgba(188,170,164,${0.4-i*0.08})`; ctx.fill();
    }
    // Bulldozer body (animated x)
    const bx = (W*0.1 + (t*30)%(W*0.8));
    ctx.fillStyle='#f9a825'; ctx.fillRect(bx, H*0.52, 70, 30);
    ctx.fillStyle='#e65100'; ctx.fillRect(bx+50, H*0.48, 20, 20);
    // Blade
    ctx.fillStyle='#bdbdbd'; ctx.fillRect(bx-10, H*0.52, 12, 30);
    // Wheels
    [bx+10, bx+50].forEach(wx=>{
      ctx.beginPath(); ctx.arc(wx, H*0.52+30, 10, 0, Math.PI*2);
      ctx.fillStyle='#212121'; ctx.fill();
    });
    // Material stacks
    ctx.fillStyle='#78909c';
    for(let i=0;i<5;i++) ctx.fillRect(W*0.7+i*14, H*0.62, 12, 20-i*2);
    // Part labels
    drawLabel(ctx, W*0.1+(t*30)%(W*0.8)+35, H*0.55, 'Bulldozer', 'right');
    drawLabel(ctx, W*0.1+(t*30)%(W*0.8)-10, H*0.52, 'Blade', 'left');
    drawLabel(ctx, W*0.35, H*0.5, 'Dust Cloud', 'right');
    drawLabel(ctx, W*0.72, H*0.6, 'Material Stack', 'right');
    drawLabel(ctx, W*0.5, H*0.72, 'Cleared Ground', 'right');
    drawQtyTag(ctx, W*0.5, H*0.8, 'Excavation', info.qty&&info.qty.excavation, 'right');
    drawQtyTag(ctx, W*0.72, H*0.68, 'Steel Stock', info.qty&&info.qty.steel, 'left');
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(10,10,240,28);
    ctx.fillStyle='#fff'; ctx.font='bold 13px Arial';
    ctx.fillText('SCENE 2  Site Clearing', 18, 29);
    if(risk.cost_risk==='High'){
      ctx.fillStyle='rgba(229,57,53,0.85)'; ctx.fillRect(W-180,10,170,28);
      ctx.fillStyle='#fff'; ctx.font='bold 11px Arial';
      ctx.fillText(' LOW MATERIAL STOCK', W-172, 29);
    }
    drawInfoBar(ctx, W, H, info);
  },
  // Scene 2  Foundation: trenches + concrete pour
  (ctx, W, H, t, risk, info = {}) => {
    ctx.fillStyle='#b0bec5'; ctx.fillRect(0,0,W,H*0.4);
    ctx.fillStyle='#795548'; ctx.fillRect(0,H*0.4,W,H*0.6);
    // Trenches grid
    ctx.fillStyle='#4e342e';
    [[0.15,0.45,0.7,0.18],[0.15,0.65,0.7,0.18],[0.15,0.45,0.18,0.38],[0.67,0.45,0.18,0.38]]
      .forEach(([x,y,w,h])=> ctx.fillRect(W*x,H*y,W*w,H*h));
    // Rebar
    ctx.strokeStyle='#e53935'; ctx.lineWidth=2;
    for(let i=0;i<6;i++){
      ctx.beginPath(); ctx.moveTo(W*0.17+i*W*0.1, H*0.47);
      ctx.lineTo(W*0.17+i*W*0.1, H*0.61); ctx.stroke();
    }
    // Concrete pour (animated)
    const pourH = Math.min(H*0.15, (t%4)/4*H*0.15);
    ctx.fillStyle='#9e9e9e'; ctx.fillRect(W*0.15, H*0.63-pourH, W*0.7, pourH);
    // Mixer truck
    ctx.fillStyle='#1565c0'; ctx.fillRect(W*0.05, H*0.5, 60, 35);
    ctx.beginPath(); ctx.arc(W*0.05+15, H*0.5+35, 10, 0, Math.PI*2);
    ctx.fillStyle='#212121'; ctx.fill();
    ctx.beginPath(); ctx.arc(W*0.05+45, H*0.5+35, 10, 0, Math.PI*2); ctx.fill();
    // Part labels
    drawLabel(ctx, W*0.15+W*0.35, H*0.55, 'Trench Grid', 'right');
    drawLabel(ctx, W*0.17+W*0.25, H*0.5, 'Rebar / Steel Cage', 'right');
    drawLabel(ctx, W*0.15+W*0.35, H*0.63-Math.min(H*0.15,(t%4)/4*H*0.15)/2, 'Concrete Pour', 'left');
    drawLabel(ctx, W*0.05+30, H*0.52, 'Mixer Truck', 'right');
    drawLabel(ctx, W*0.5, H*0.75, 'Foundation Slab', 'right');
    drawQtyTag(ctx, W*0.5, H*0.63-Math.min(H*0.15,(t%4)/4*H*0.15)/2-12, 'Concrete', info.qty&&info.qty.concrete, 'right');
    drawQtyTag(ctx, W*0.42, H*0.5, 'Steel', info.qty&&info.qty.steel, 'left');
    drawQtyTag(ctx, W*0.5, H*0.82, 'Excavation', info.qty&&info.qty.excavation, 'right');
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(10,10,240,28);
    ctx.fillStyle='#fff'; ctx.font='bold 13px Arial';
    ctx.fillText('SCENE 3  Foundation Laying', 18, 29);
    if(risk.delay_risk==='High'){
      ctx.fillStyle='rgba(229,57,53,0.85)'; ctx.fillRect(W-160,10,150,28);
      ctx.fillStyle='#fff'; ctx.font='bold 11px Arial';
      ctx.fillText(' DELAY RISK: HIGH', W-152, 29);
    }
    drawInfoBar(ctx, W, H, info);
  },
  // Scene 3  Structure rising
  (ctx, W, H, t, risk, info = {}) => {
    // Sky
    const sky = ctx.createLinearGradient(0,0,0,H*0.6);
    sky.addColorStop(0,'#1565c0'); sky.addColorStop(1,'#42a5f5');
    ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.6);
    ctx.fillStyle='#795548'; ctx.fillRect(0,H*0.6,W,H*0.4);
    // Building floors (animated rise)
    const floors = Math.min(6, Math.floor(t/1.5)+1);
    const floorH = 28; const bldW = W*0.45; const bldX = W*0.27;
    for(let f=0;f<floors;f++){
      const fy = H*0.6 - (f+1)*floorH;
      ctx.fillStyle = f===floors-1 ? '#90a4ae' : '#b0bec5';
      ctx.fillRect(bldX, fy, bldW, floorH-2);
      // Windows
      for(let w=0;w<4;w++){
        ctx.fillStyle = f<floors-1 ? '#fff9c4' : '#546e7a';
        ctx.fillRect(bldX+12+w*W*0.1, fy+6, W*0.07, 14);
      }
    }
    // Crane
    ctx.strokeStyle='#f9a825'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(W*0.78, H*0.6); ctx.lineTo(W*0.78, H*0.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W*0.78, H*0.08); ctx.lineTo(W*0.55, H*0.08); ctx.stroke();
    // Hanging load (animated)
    const loadY = H*0.08 + Math.sin(t)*20 + 30;
    ctx.strokeStyle='#bdbdbd'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(W*0.6, H*0.08); ctx.lineTo(W*0.6, loadY); ctx.stroke();
    ctx.fillStyle='#e65100'; ctx.fillRect(W*0.59-8, loadY, 16, 12);
    // Scaffolding
    ctx.strokeStyle='#78909c'; ctx.lineWidth=1.5;
    for(let f=0;f<floors;f++){
      const fy = H*0.6-(f+1)*floorH;
      ctx.beginPath(); ctx.moveTo(bldX-12, fy); ctx.lineTo(bldX-12, fy+floorH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bldX-12, fy+floorH/2); ctx.lineTo(bldX, fy+floorH/2); ctx.stroke();
    }
    // Part labels
    const topFloorY = H*0.6 - floors*floorH;
    drawLabel(ctx, bldX + bldW/2, topFloorY + floorH/2, 'Building Frame', 'left');
    drawLabel(ctx, bldX + W*0.1, topFloorY + floorH/2 + floorH, 'Window Opening', 'left');
    drawLabel(ctx, bldX - 12, H*0.6 - floorH*1.5, 'Scaffolding', 'left');
    drawLabel(ctx, W*0.78, H*0.3, 'Tower Crane', 'left');
    drawLabel(ctx, W*0.6, loadY, 'Suspended Load', 'right');
    drawLabel(ctx, W*0.5, H*0.65, 'Ground Level', 'right');
    drawQtyTag(ctx, bldX + bldW/2, topFloorY - 10, 'Concrete', info.qty&&info.qty.concrete, 'left');
    drawQtyTag(ctx, bldX + bldW + 8, H*0.6 - floorH*2, 'Steel', info.qty&&info.qty.steel, 'right');
    drawQtyTag(ctx, bldX + bldW + 8, H*0.6 - floorH*3, 'Brickwork', info.qty&&info.qty.brickwork, 'right');
    // Floor labels from document (G, 1st, 2nd ...)
    const floorNames = ['G','1st','2nd','3rd','4th','5th'];
    const totalF = info.floorNum > 0 ? Math.min(info.floorNum + 1, floors) : floors;
    for(let f=0;f<totalF;f++){
      const fy = H*0.6-(f+1)*floorH+floorH/2+4;
      ctx.save();
      ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.font='bold 8px Arial'; ctx.textAlign='right';
      ctx.fillText(floorNames[f]||`${f}F`, bldX-16, fy);
      ctx.restore();
    }
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(10,10,260,28);
    ctx.fillStyle='#fff'; ctx.font='bold 13px Arial';
    ctx.fillText('SCENE 4  Structural Development', 18, 29);
    if(risk.delay_risk!=='Low'){
      ctx.fillStyle='rgba(251,140,0,0.9)'; ctx.fillRect(W-180,10,170,28);
      ctx.fillStyle='#fff'; ctx.font='bold 11px Arial';
      ctx.fillText(` DELAY: ${risk.delay_risk}`, W-172, 29);
    }
    drawInfoBar(ctx, W, H, info);
  },
  // Scene 4  Risk Event
  (ctx, W, H, t, risk, info = {}) => {
    // Overcast sky
    const sky = ctx.createLinearGradient(0,0,0,H*0.55);
    sky.addColorStop(0,'#546e7a'); sky.addColorStop(1,'#90a4ae');
    ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.55);
    ctx.fillStyle='#4e342e'; ctx.fillRect(0,H*0.55,W,H*0.45);
    // Idle building
    const bldW=W*0.45; const bldX=W*0.27;
    for(let f=0;f<4;f++){
      ctx.fillStyle='#78909c';
      ctx.fillRect(bldX, H*0.55-(f+1)*28, bldW, 26);
    }
    // Idle crane
    ctx.strokeStyle='#bdbdbd'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(W*0.78,H*0.55); ctx.lineTo(W*0.78,H*0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W*0.78,H*0.12); ctx.lineTo(W*0.55,H*0.12); ctx.stroke();
    // Blinking warning overlay
    if(Math.floor(t*2)%2===0){
      ctx.fillStyle='rgba(229,57,53,0.18)'; ctx.fillRect(0,0,W,H);
    }
    // Warning banner
    ctx.fillStyle='#b71c1c'; ctx.fillRect(W*0.1, H*0.35, W*0.8, 44);
    ctx.fillStyle='#fff'; ctx.font='bold 16px Arial'; ctx.textAlign='center';
    ctx.fillText(`  ${risk.risk_level}  CONSTRUCTION PAUSED`, W/2, H*0.35+28);
    ctx.textAlign='left';
    // Empty material yard
    ctx.fillStyle='#546e7a'; ctx.fillRect(W*0.05, H*0.7, 80, 20);
    ctx.fillStyle='#fff'; ctx.font='11px Arial';
    ctx.fillText('Material yard empty', W*0.05, H*0.7+36);
    // Part labels
    drawLabel(ctx, bldX + bldW/2, H*0.55 - 2*28, 'Idle Structure', 'left');
    drawLabel(ctx, W*0.78, H*0.3, 'Idle Crane', 'left');
    drawLabel(ctx, W*0.05+40, H*0.72, 'Empty Material Yard', 'right');
    drawLabel(ctx, W*0.5, H*0.2, 'Overcast Sky', 'right');
    drawQtyTag(ctx, bldX + bldW/2, H*0.55 - 3*28, 'Concrete Used', info.qty&&info.qty.concrete, 'left');
    drawQtyTag(ctx, W*0.05+40, H*0.79, 'Steel Pending', info.qty&&info.qty.steel, 'right');
    drawQtyTag(ctx, bldX + bldW + 8, H*0.55 - 2*28, 'Brickwork Done', info.qty&&info.qty.brickwork, 'right');
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(10,10,220,28);
    ctx.fillStyle='#fff'; ctx.font='bold 13px Arial';
    ctx.fillText('SCENE 5  Risk Event', 18, 29);
    drawInfoBar(ctx, W, H, info);
  },
  // Scene 5  Finishing
  (ctx, W, H, t, risk, info = {}) => {
    const sky = ctx.createLinearGradient(0,0,0,H*0.5);
    sky.addColorStop(0,'#7b1fa2'); sky.addColorStop(1,'#ce93d8');
    ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.5);
    ctx.fillStyle='#5d4037'; ctx.fillRect(0,H*0.5,W,H*0.5);
    // Building with cladding
    const bldW=W*0.45; const bldX=W*0.27;
    for(let f=0;f<5;f++){
      ctx.fillStyle = risk.quality==='Low' ? (f%2===0?'#ef9a9a':'#b0bec5') : '#e0e0e0';
      ctx.fillRect(bldX, H*0.5-(f+1)*28, bldW, 26);
      for(let w=0;w<4;w++){
        ctx.fillStyle='#b3e5fc';
        ctx.fillRect(bldX+12+w*W*0.1, H*0.5-(f+1)*28+6, W*0.07, 14);
      }
    }
    // Paint crew (animated)
    const px = W*0.3 + Math.sin(t)*W*0.05;
    ctx.fillStyle='#fff'; ctx.fillRect(px, H*0.5-60, 8, 20);
    ctx.beginPath(); ctx.arc(px+4, H*0.5-65, 6, 0, Math.PI*2);
    ctx.fillStyle='#ff8f00'; ctx.fill();
    // Part labels
    drawLabel(ctx, bldX + bldW/2, H*0.5 - 3*28, 'Exterior Cladding', 'left');
    drawLabel(ctx, bldX + W*0.1, H*0.5 - 2*28 + 8, 'Glazed Window', 'left');
    drawLabel(ctx, px + 4, H*0.5 - 58, 'Paint Crew', 'right');
    drawLabel(ctx, bldX + bldW + 10, H*0.5 - 28, 'Plastered Wall', 'left');
    drawLabel(ctx, W*0.1, H*0.65, 'Finished Ground Floor', 'right');
    drawQtyTag(ctx, bldX + bldW/2, H*0.5 - 4*28 - 8, 'Plastering', info.qty&&info.qty.plastering, 'left');
    drawQtyTag(ctx, W*0.1, H*0.72, 'Flooring', info.qty&&info.qty.flooring, 'right');
    drawQtyTag(ctx, bldX + bldW + 8, H*0.5 - 4*28, 'Electrical', info.qty&&info.qty.electrical, 'right');
    drawQtyTag(ctx, bldX + bldW + 8, H*0.5 - 5*28, 'Pipe', info.qty&&info.qty.pipe, 'right');
    if(risk.quality==='Low'){
      ctx.fillStyle='rgba(229,57,53,0.85)'; ctx.fillRect(W-200,10,190,28);
      ctx.fillStyle='#fff'; ctx.font='bold 11px Arial';
      ctx.fillText(' QUALITY ISSUES VISIBLE', W-192, 29);
    }
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(10,10,220,28);
    ctx.fillStyle='#fff'; ctx.font='bold 13px Arial';
    ctx.fillText('SCENE 6  Finishing Works', 18, 29);
    drawInfoBar(ctx, W, H, info);
  },
  // Scene 6  Completion
  (ctx, W, H, t, risk, info = {}) => {
    const sky = ctx.createLinearGradient(0,0,0,H*0.55);
    sky.addColorStop(0, risk.score>=70?'#1b5e20':'#e65100');
    sky.addColorStop(1, risk.score>=70?'#66bb6a':'#ffcc02');
    ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.55);
    ctx.fillStyle='#388e3c'; ctx.fillRect(0,H*0.55,W,H*0.45);
    // Completed building
    const bldW=W*0.45; const bldX=W*0.27;
    for(let f=0;f<6;f++){
      ctx.fillStyle = risk.score>=70 ? '#e0e0e0' : (f>3?'#90a4ae':'#e0e0e0');
      ctx.fillRect(bldX, H*0.55-(f+1)*28, bldW, 26);
      for(let w=0;w<4;w++){
        ctx.fillStyle = f>3 && risk.score<70 ? '#546e7a' : '#b3e5fc';
        ctx.fillRect(bldX+12+w*W*0.1, H*0.55-(f+1)*28+6, W*0.07, 14);
      }
    }
    // Flags (animated wave)
    ['#138808','#ffffff','#ff9933'].forEach((c,i)=>{
      const fx = bldX + bldW/2 - 15 + i*10;
      const fy = H*0.55 - 6*28 - 30;
      ctx.strokeStyle='#bdbdbd'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy-30); ctx.stroke();
      ctx.fillStyle=c;
      ctx.beginPath();
      ctx.moveTo(fx, fy-30);
      ctx.quadraticCurveTo(fx+12+Math.sin(t+i)*4, fy-22, fx, fy-14);
      ctx.fill();
    });
    // Score badge
    ctx.fillStyle = risk.score>=70?'#1b5e20':'#e65100';
    ctx.beginPath(); ctx.arc(W*0.85, H*0.25, 36, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 20px Arial'; ctx.textAlign='center';
    ctx.fillText(risk.score, W*0.85, H*0.25+7);
    ctx.font='10px Arial'; ctx.fillText('/100', W*0.85, H*0.25+20);
    ctx.textAlign='left';
    // Part labels
    const cBldX = W*0.27; const cBldW = W*0.45;
    drawLabel(ctx, cBldX + cBldW/2, H*0.55 - 4*28, 'Completed Structure', 'left');
    drawLabel(ctx, cBldX + W*0.1, H*0.55 - 2*28 + 8, 'Occupied Windows', 'left');
    drawLabel(ctx, cBldX + cBldW/2, H*0.55 - 6*28 - 15, 'National Flag', 'right');
    drawLabel(ctx, W*0.85, H*0.25 + 36, 'Credit Score', 'left');
    drawLabel(ctx, W*0.15, H*0.65, 'Landscaped Ground', 'right');
    drawQtyTag(ctx, cBldX + cBldW/2, H*0.55 - 5*28 - 6, 'Total Concrete', info.qty&&info.qty.concrete, 'left');
    drawQtyTag(ctx, cBldX + cBldW + 8, H*0.55 - 3*28, 'Total Steel', info.qty&&info.qty.steel, 'right');
    drawQtyTag(ctx, cBldX + cBldW + 8, H*0.55 - 4*28, 'Brickwork', info.qty&&info.qty.brickwork, 'right');
    drawQtyTag(ctx, W*0.15, H*0.72, 'Flooring', info.qty&&info.qty.flooring, 'right');
    if (info.qty) drawQtyPanel(ctx, W*0.02, H*0.12, info.qty, 'FINAL QUANTITIES USED');
    // Floor labels from document
    const cFloorNames = ['G','1st','2nd','3rd','4th','5th'];
    const cTotalF = info.floorNum > 0 ? Math.min(info.floorNum + 1, 6) : 6;
    for(let f=0;f<cTotalF;f++){
      const fy = H*0.55-(f+1)*28+14+4;
      ctx.save();
      ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.font='bold 8px Arial'; ctx.textAlign='right';
      ctx.fillText(cFloorNames[f]||`${f}F`, W*0.27-16, fy);
      ctx.restore();
    }
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(10,10,220,28);
    ctx.fillStyle='#fff'; ctx.font='bold 13px Arial';
    ctx.fillText('SCENE 7  Project Completion', 18, 29);
    drawInfoBar(ctx, W, H, info);
  },
];

//  INLINE VIDEO PLAYER (shown directly in Digital Twin results) 
const SCENE_DURATION = 4;

function InlineVideoPlayer({ simulation, twin }) {
  const canvasRef  = useRef(null);
  const rafRef     = useRef(null);
  const stateRef   = useRef({ playing: true, sceneIdx: 0, sceneT: 0, lastTs: null });
  const [ui, setUi] = useState({ playing: true, sceneIdx: 0, pct: 0 });
  const [capturing, setCapturing] = useState(false);
  const total = simulation.video_simulation.length;

  const loop = useCallback((ts) => {
    const s = stateRef.current;
    if (s.lastTs !== null) {
      const dt = (ts - s.lastTs) / 1000;
      if (s.playing) {
        s.sceneT += dt;
        if (s.sceneT >= SCENE_DURATION) { s.sceneT = 0; s.sceneIdx = (s.sceneIdx + 1) % total; }
      }
    }
    s.lastTs = ts;
    const cv = canvasRef.current;
    if (cv) {
      const ctx = cv.getContext('2d');
      SCENE_RENDERERS[Math.min(s.sceneIdx, SCENE_RENDERERS.length - 1)](ctx, cv.width, cv.height, s.sceneT, twin, simulation.digital_twin);
      // green progress bar at bottom
      ctx.fillStyle = 'rgba(35,79,30,0.9)';
      ctx.fillRect(0, cv.height - 5, (s.sceneT / SCENE_DURATION) * cv.width, 5);
      // scene counter badge
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(cv.width - 88, cv.height - 26, 80, 18);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'right';
      ctx.fillText(`${s.sceneIdx + 1} / ${total}`, cv.width - 10, cv.height - 12);
      ctx.textAlign = 'left';
    }
    setUi({ playing: s.playing, sceneIdx: s.sceneIdx, pct: Math.round((s.sceneT / SCENE_DURATION) * 100) });
    rafRef.current = requestAnimationFrame(loop);
  }, [twin, total]);

  useEffect(() => {
    stateRef.current = { playing: true, sceneIdx: 0, sceneT: 0, lastTs: null };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  const toggle  = () => { stateRef.current.playing = !stateRef.current.playing; };
  const restart = () => { stateRef.current.sceneIdx = 0; stateRef.current.sceneT = 0; };
  const goScene = (i) => { stateRef.current.sceneIdx = i; stateRef.current.sceneT = 0; };

  const downloadPhoto = () => {
    const cv = canvasRef.current; if (!cv) return;
    const sc = simulation.video_simulation[stateRef.current.sceneIdx];
    const a = document.createElement('a');
    a.download = `virtual-scene-${stateRef.current.sceneIdx + 1}-${sc.stage.replace(/\s+/g, '-')}.png`;
    a.href = cv.toDataURL('image/png'); a.click();
  };

  const downloadVideo = async () => {
    setCapturing(true);
    const W = 680, H = 320, frames = [];
    for (let i = 0; i < total; i++) {
      for (let f = 0; f < 10; f++) {
        const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
        const tc = tmp.getContext('2d');
        SCENE_RENDERERS[Math.min(i, SCENE_RENDERERS.length - 1)](tc, W, H, f * 0.4, twin, simulation.digital_twin);
        tc.fillStyle = 'rgba(35,79,30,0.9)'; tc.fillRect(0, H - 5, ((f * 0.4) / SCENE_DURATION) * W, 5);
        tc.fillStyle = 'rgba(0,0,0,0.55)'; tc.fillRect(W - 88, H - 26, 80, 18);
        tc.fillStyle = '#fff'; tc.font = 'bold 11px Arial'; tc.textAlign = 'right';
        tc.fillText(`${i + 1} / ${total}`, W - 10, H - 12); tc.textAlign = 'left';
        frames.push(tmp.toDataURL('image/png'));
      }
    }
    const sc = simulation.digital_twin;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Virtual Construction Video</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0d0d1a;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:Arial,sans-serif;gap:0}
.screen{position:relative;width:100%;max-width:720px}
#vf{width:100%;border-radius:0;display:block;box-shadow:0 0 60px rgba(35,79,30,0.4)}
.bar{background:#1a1a2e;padding:10px 16px;display:flex;align-items:center;gap:10px;width:100%;max-width:720px}
.btn{background:none;border:none;color:#f4d21f;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px}
.btn:hover{background:rgba(255,255,255,0.1)}
.prog{flex:1;height:6px;background:rgba(255,255,255,0.15);border-radius:3px;cursor:pointer;position:relative}
.pfill{height:100%;background:#234f1e;border-radius:3px;transition:width 0.05s linear}
.lbl{color:#aaa;font-size:11px;font-weight:700}
.info{background:#111827;padding:10px 16px;width:100%;max-width:720px;display:flex;gap:20px;flex-wrap:wrap}
.itm{display:flex;flex-direction:column;gap:2px}
.ik{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.5px;font-weight:700}
.iv{font-size:12px;color:#f4d21f;font-weight:700}
</style></head><body>
<div class="screen"><img id="vf" src="${frames[0]}"/></div>
<div class="bar">
  <button class="btn" id="rb" title="Restart">&#9198;</button>
  <button class="btn" id="pb">&#9654;</button>
  <div class="prog" id="pg"><div class="pfill" id="pf" style="width:0%"></div></div>
  <span class="lbl" id="ct">1/${total}</span>
</div>
<div class="info">
  <div class="itm"><span class="ik">Project Type</span><span class="iv">${sc.project_type}</span></div>
  <div class="itm"><span class="ik">Budget</span><span class="iv">${sc.budget}</span></div>
  <div class="itm"><span class="ik">Duration</span><span class="iv">${sc.duration}</span></div>
  <div class="itm"><span class="ik">Credit Score</span><span class="iv">${twin.score}/100  ${twin.risk_level}</span></div>
</div>
<script>
const F=${JSON.stringify(frames)},T=${total},FPS=12;
let idx=0,playing=false,iv=null;
const img=document.getElementById('vf'),pb=document.getElementById('pb'),pf=document.getElementById('pf'),ct=document.getElementById('ct');
function upd(){img.src=F[idx];pf.style.width=(idx/F.length*100)+'%';ct.textContent=Math.floor(idx/(F.length/T)+1)+'/'+T;}
function play(){if(iv)return;iv=setInterval(()=>{idx=(idx+1)%F.length;upd();},1000/FPS);pb.innerHTML='&#9646;&#9646;';playing=true;}
function pause(){clearInterval(iv);iv=null;pb.innerHTML='&#9654;';playing=false;}
document.getElementById('pb').onclick=()=>playing?pause():play();
document.getElementById('rb').onclick=()=>{idx=0;upd();};
document.getElementById('pg').onclick=(e)=>{const r=e.currentTarget.getBoundingClientRect();idx=Math.floor((e.clientX-r.left)/r.width*F.length);upd();};
play();
<\/script></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a'); a.download = 'virtual-construction-video.html';
    a.href = URL.createObjectURL(blob); a.click();
    setCapturing(false);
  };

  const sc = simulation.video_simulation[ui.sceneIdx];
  const totalPct = ((ui.sceneIdx * SCENE_DURATION + (ui.pct / 100) * SCENE_DURATION) / (total * SCENE_DURATION)) * 100;

  return (
    <div className="ivp-wrap">
      <div className="ivp-header">
        <span className="ivp-title"> Virtual Construction Video</span>
        <span className="ivp-badge" style={{ background: twin.score >= 70 ? '#e8f5e9' : '#fff5f5', color: twin.score >= 70 ? '#2e7d32' : '#e53935' }}>
          {twin.project_state === 'Stable' ? ' Stable' : ' Risky'}  Score {twin.score}/100
        </span>
      </div>

      {/* Canvas screen */}
      <div className="ivp-screen">
        <canvas ref={canvasRef} width={680} height={320} className="ivp-canvas" />
        {!ui.playing && (
          <div className="ivp-overlay" onClick={toggle}>
            <div className="ivp-play-circle"></div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="ivp-controls">
        <button className="ivp-btn" onClick={restart}></button>
        <button className="ivp-btn ivp-btn-play" onClick={toggle}>{ui.playing ? '' : ''}</button>
        <div className="ivp-prog-wrap">
          <div className="ivp-prog">
            <div className="ivp-prog-fill" style={{ width: `${totalPct}%` }} />
            {simulation.video_simulation.map((_, i) => (
              <div key={i} className="ivp-marker" style={{ left: `${(i / total) * 100}%` }} onClick={() => goScene(i)} />
            ))}
          </div>
          <div className="ivp-scene-name">{sc.icon} {sc.stage}  <em>{sc.camera}</em></div>
        </div>
        <span className="ivp-counter">{ui.sceneIdx + 1}/{total}</span>
      </div>

      {/* Scene thumbnails */}
      <div className="ivp-thumbs">
        {simulation.video_simulation.map((s, i) => (
          <button key={i} className={`ivp-thumb ${ui.sceneIdx === i ? 'active' : ''}`} onClick={() => goScene(i)}>
            <span className="ivp-ti">{s.icon}</span>
            <span className="ivp-tl">{s.stage}</span>
          </button>
        ))}
      </div>

      {/* Scene description */}
      <div className="ivp-desc" style={{ borderLeft: `4px solid ${sc.color}` }}>
        <p>{sc.desc}</p>
      </div>

      {/* Export row */}
      <div className="ivp-export">
        <button className="ivp-exp photo" onClick={downloadPhoto}> Save Photo</button>
        <button className="ivp-exp video" onClick={downloadVideo} disabled={capturing}>
          {capturing ? ' Generating...' : ' Download Video (.html)'}
        </button>
      </div>
    </div>
  );
}

//  VIRTUAL VIDEO PLAYER 

function VirtualVideoPlayer({ simulation, twin }) {
  const canvasRef    = useRef(null);
  const rafRef       = useRef(null);
  const stateRef     = useRef({ playing: false, sceneIdx: 0, sceneT: 0, lastTs: null });
  const [uiState, setUiState]     = useState({ playing: false, sceneIdx: 0, pct: 0 });
  const [capturing, setCapturing] = useState(false);
  const [gifFrames, setGifFrames] = useState([]);
  const [photoStrip, setPhotoStrip] = useState(null);
  const totalScenes = simulation.video_simulation.length;

  // Main animation loop
  const loop = useCallback((ts) => {
    const s = stateRef.current;
    if (s.lastTs !== null) {
      const dt = (ts - s.lastTs) / 1000;
      if (s.playing) {
        s.sceneT += dt;
        if (s.sceneT >= SCENE_DURATION) {
          s.sceneT = 0;
          s.sceneIdx = (s.sceneIdx + 1) % totalScenes;
        }
      }
    }
    s.lastTs = ts;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      SCENE_RENDERERS[Math.min(s.sceneIdx, SCENE_RENDERERS.length - 1)](ctx, canvas.width, canvas.height, s.sceneT, twin, simulation.digital_twin);
      // Progress bar overlay
      const barW = (s.sceneT / SCENE_DURATION) * canvas.width;
      ctx.fillStyle = 'rgba(35,79,30,0.85)';
      ctx.fillRect(0, canvas.height - 5, barW, 5);
      // Scene counter
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(canvas.width - 90, canvas.height - 28, 82, 20);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'right';
      ctx.fillText(`${s.sceneIdx + 1} / ${totalScenes}`, canvas.width - 12, canvas.height - 13);
      ctx.textAlign = 'left';
    }
    setUiState({ playing: s.playing, sceneIdx: s.sceneIdx, pct: Math.round((s.sceneT / SCENE_DURATION) * 100) });
    rafRef.current = requestAnimationFrame(loop);
  }, [twin, totalScenes]);

  useEffect(() => {
    stateRef.current = { playing: false, sceneIdx: 0, sceneT: 0, lastTs: null };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  const togglePlay = () => { stateRef.current.playing = !stateRef.current.playing; };
  const goScene = (i) => { stateRef.current.sceneIdx = i; stateRef.current.sceneT = 0; };
  const restart  = () => { stateRef.current.sceneIdx = 0; stateRef.current.sceneT = 0; };

  // Capture current frame as PNG photo
  const capturePhoto = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const link = document.createElement('a');
    const sc = simulation.video_simulation[stateRef.current.sceneIdx];
    link.download = `virtual-model-scene${stateRef.current.sceneIdx + 1}-${sc.stage.replace(/\s+/g,'-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Capture all scenes as a photo strip (single wide PNG)
  const capturePhotoStrip = async () => {
    setCapturing(true);
    const W = 680; const H = 320;
    const strip = document.createElement('canvas');
    strip.width = W * totalScenes; strip.height = H;
    const sctx = strip.getContext('2d');
    for (let i = 0; i < totalScenes; i++) {
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      const tctx = tmp.getContext('2d');
      // render 3 seconds into each scene for a representative frame
      SCENE_RENDERERS[Math.min(i, SCENE_RENDERERS.length - 1)](tctx, W, H, 3, twin, simulation.digital_twin);
      // scene label
      tctx.fillStyle = 'rgba(0,0,0,0.55)'; tctx.fillRect(0, H - 32, W, 32);
      tctx.fillStyle = '#fff'; tctx.font = 'bold 12px Arial'; tctx.textAlign = 'center';
      tctx.fillText(simulation.video_simulation[i].stage, W / 2, H - 12);
      sctx.drawImage(tmp, i * W, 0);
    }
    const link = document.createElement('a');
    link.download = 'virtual-model-all-scenes.png';
    link.href = strip.toDataURL('image/png');
    link.click();
    setCapturing(false);
  };

  // Build animated GIF using canvas frames  data URLs  <img> slideshow download
  const captureGifSlideshow = async () => {
    setCapturing(true);
    const W = 680; const H = 320;
    const frames = [];
    for (let i = 0; i < totalScenes; i++) {
      for (let f = 0; f < 8; f++) {
        const tmp = document.createElement('canvas');
        tmp.width = W; tmp.height = H;
        const tctx = tmp.getContext('2d');
        SCENE_RENDERERS[Math.min(i, SCENE_RENDERERS.length - 1)](tctx, W, H, f * 0.5, twin, simulation.digital_twin);
        frames.push(tmp.toDataURL('image/png'));
      }
    }
    // Build an HTML slideshow file that acts as an animated preview
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Virtual Construction Model</title>
<style>body{margin:0;background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:Arial}
#frame{max-width:680px;width:100%;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.6)}
.info{color:#f4d21f;font-size:13px;margin-top:12px;font-weight:700}
.sub{color:#aaa;font-size:11px;margin-top:4px}</style></head>
<body>
<img id="frame" src="${frames[0]}" />
<div class="info">Virtual Construction Model  ${simulation.digital_twin.project_type}</div>
<div class="sub">${simulation.digital_twin.budget} | ${simulation.digital_twin.duration} | Score: ${twin.score}/100</div>
<script>
const frames=${JSON.stringify(frames)};
let i=0;
setInterval(()=>{i=(i+1)%frames.length;document.getElementById('frame').src=frames[i];},120);
<\/script></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const link = document.createElement('a');
    link.download = 'virtual-model-animation.html';
    link.href = URL.createObjectURL(blob);
    link.click();
    setCapturing(false);
  };

  const sc = simulation.video_simulation[uiState.sceneIdx];

  return (
    <div className="vvp-container">
      {/* Video Screen */}
      <div className="vvp-screen">
        <canvas ref={canvasRef} width={680} height={320} className="vvp-canvas" />
        {/* Play/Pause overlay */}
        {!uiState.playing && (
          <div className="vvp-play-overlay" onClick={togglePlay}>
            <div className="vvp-play-btn"></div>
          </div>
        )}
      </div>

      {/* Video Controls */}
      <div className="vvp-controls">
        <button className="vvp-ctrl-btn" onClick={restart} title="Restart"></button>
        <button className="vvp-ctrl-btn vvp-play" onClick={togglePlay}>
          {uiState.playing ? '' : ''}
        </button>
        <div className="vvp-progress-wrap">
          <div className="vvp-progress-bar">
            <div className="vvp-progress-fill" style={{ width: `${((uiState.sceneIdx * SCENE_DURATION + (uiState.pct / 100) * SCENE_DURATION) / (totalScenes * SCENE_DURATION)) * 100}%` }} />
            {simulation.video_simulation.map((_, i) => (
              <div key={i} className="vvp-scene-marker"
                style={{ left: `${(i / totalScenes) * 100}%` }}
                onClick={() => goScene(i)} />
            ))}
          </div>
          <div className="vvp-scene-label">{sc.icon} {sc.stage}</div>
        </div>
        <span className="vvp-time">{uiState.sceneIdx + 1}/{totalScenes}</span>
      </div>

      {/* Scene Thumbnails */}
      <div className="vvp-thumbs">
        {simulation.video_simulation.map((s, i) => (
          <button key={i} className={`vvp-thumb ${uiState.sceneIdx === i ? 'active' : ''}`} onClick={() => goScene(i)}>
            <span className="vvp-thumb-icon">{s.icon}</span>
            <span className="vvp-thumb-label">{s.stage}</span>
          </button>
        ))}
      </div>

      {/* Export Buttons */}
      <div className="vvp-export">
        <div className="vvp-export-title"> Export Virtual Model</div>
        <div className="vvp-export-btns">
          <button className="vvp-exp-btn photo" onClick={capturePhoto}>
             Download Current Scene Photo
          </button>
          <button className="vvp-exp-btn strip" onClick={capturePhotoStrip} disabled={capturing}>
            Download All Scenes Photo Strip
          </button>
          <button className="vvp-exp-btn video" onClick={captureGifSlideshow} disabled={capturing}>
             Download Animated Video (.html)
          </button>
        </div>
        {capturing && <p className="vvp-capturing"> Generating frames, please wait...</p>}
      </div>

      {/* Scene Info */}
      <div className="vvp-scene-info" style={{ background: sc.bg }}>
        <div className="vvp-si-cam">{sc.camera}</div>
        <p className="vvp-si-desc">{sc.desc}</p>
      </div>
    </div>
  );
}

//  SCENE CANVAS (used in Video Simulation tab) 
function SceneCanvas({ sceneIndex, risk, info }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const tRef = useRef(0);
  const lastRef = useRef(null);
  const draw = useCallback((ts) => {
    if (lastRef.current !== null) tRef.current += (ts - lastRef.current) / 1000;
    lastRef.current = ts;
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    SCENE_RENDERERS[Math.min(sceneIndex, SCENE_RENDERERS.length - 1)](ctx, cv.width, cv.height, tRef.current, risk, info);
    rafRef.current = requestAnimationFrame(draw);
  }, [sceneIndex, risk, info]);
  useEffect(() => {
    tRef.current = 0; lastRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, sceneIndex]);
  return <canvas ref={canvasRef} width={680} height={320} className="sim-canvas" />;
}

//  VIDEO SIMULATION GENERATOR 
const generateSimulation = (info, twin, presentCount) => {
  const type    = info.type     !== 'Not found' ? info.type     : 'Infrastructure';
  const budget  = info.budget   !== 'Not found' ? `${info.budget}` : 'Undisclosed budget';
  const dur     = info.duration !== 'Not found' ? info.duration : 'unknown duration';
  const loc     = info.location !== 'Not found' ? info.location : 'the project site';
  const agency  = info.agency   !== 'Not found' ? info.agency   : 'the implementing agency';
  const months  = parseInt(info.duration?.match(/\d+/)?.[0] || '0', 10);

  const delayNote  = twin.delay_risk  === 'High'   ? '  work is visibly behind schedule, machinery idle in patches'
                   : twin.delay_risk  === 'Medium'  ? '  minor slowdowns visible at certain zones'
                   : '  construction proceeds at a steady, planned pace';
  const costNote   = twin.cost_risk   === 'High'   ? ' reduced material stockpiles, fewer workers on site'
                   : twin.cost_risk   === 'Medium'  ? '  material deliveries intermittent'
                   : '  full material flow, well-stocked yards';
  const qualNote   = twin.quality     === 'Low'    ? '  visible cracks, uneven surfaces, incomplete sections'
                   : twin.quality     === 'Average' ? '  minor surface irregularities, some rework visible'
                   : '  clean finishes, precise alignment throughout';
  const completion = twin.score >= 80 ? '100%' : twin.score >= 60 ? '85%' : twin.score >= 40 ? '65%' : '40%';

  const scenes = [
    {
      id: 1, stage: 'Site Survey',
      camera: 'Aerial drone  wide establishing shot',
      icon: '',
      color: '#1565c0',
      bg: 'linear-gradient(135deg,#e3f2fd,#bbdefb)',
      desc: `Drone sweeps over ${loc} at golden hour. Vast open terrain stretches across the frame  scrubland, uneven ground, and distant hills. A survey team in high-vis vests plants boundary markers. Title card fades in: "${type} Project  ${budget}  ${dur}". Wind rustles through tall grass as the camera slowly descends.`,
    },
    {
      id: 2, stage: 'Site Clearing & Mobilisation',
      camera: ' Ground-level tracking shot',
      icon: '',
      color: '#e65100',
      bg: 'linear-gradient(135deg,#fff3e0,#ffe0b2)',
      desc: `Bulldozers and excavators roll onto site in convoy. Dust clouds billow as vegetation is cleared. ${agency} site engineers review blueprints under a temporary shed. Material yards are established  steel rods stacked, cement bags piled under tarpaulins${costNote}. Camera pans across the mobilised camp.`,
    },
    {
      id: 3, stage: 'Foundation Laying',
      camera: ' Low-angle close-up + time-lapse',
      icon: '',
      color: '#4e342e',
      bg: 'linear-gradient(135deg,#efebe9,#d7ccc8)',
      desc: `Excavators dig deep trenches in a grid pattern. Reinforcement cages are lowered by crane  steel bars gleaming in morning light. Concrete mixer trucks queue up${delayNote}. A time-lapse compresses days into seconds: wet concrete poured, vibrated, levelled. The foundation slab emerges solid and grey.`,
    },
    {
      id: 4, stage: 'Structural Development',
      camera: ' Slow vertical tilt  ground to sky',
      icon: '',
      color: '#234f1e',
      bg: 'linear-gradient(135deg,#e8f5e9,#c8e6c9)',
      desc: `Columns rise floor by floor. Scaffolding climbs the structure like a steel skeleton. Workers in helmets move across each level${delayNote}. ${months > 18 ? 'The multi-storey frame takes shape over several months, each floor adding height and complexity.' : 'The compact timeline pushes crews to work extended shifts.'} Camera tilts upward  the structure now dominates the skyline.`,
    },
    ...(twin.delay_risk !== 'Low' || twin.cost_risk !== 'Low' ? [{
      id: 5, stage: 'Risk Event  Construction Pause',
      camera: ' Static wide shot  overcast sky',
      icon: '',
      color: '#b71c1c',
      bg: 'linear-gradient(135deg,#ffebee,#ffcdd2)',
      desc: `${twin.delay_risk === 'High' ? 'A prolonged halt: machinery sits idle, scaffolding unmanned. Site supervisor on phone  supply chain disruption.' : 'Partial slowdown  one crane inactive, reduced crew visible.'} ${twin.cost_risk === 'High' ? 'Material yard nearly empty; cement bags depleted. A delivery truck turns back at the gate.' : ''} Grey overcast sky. Warning overlay flashes: "${twin.risk_level} Detected". Time-lapse shows days passing with minimal progress.`,
    }] : []),
    {
      id: twin.delay_risk !== 'Low' || twin.cost_risk !== 'Low' ? 6 : 5,
      stage: 'Finishing & MEP Works',
      camera: ' Interior walk-through + exterior pan',
      icon: '',
      color: '#6a1b9a',
      bg: 'linear-gradient(135deg,#f3e5f5,#e1bee7)',
      desc: `Brickwork, plastering, and tiling crews move through the structure. Electrical conduits and plumbing lines are installed${qualNote}. Exterior cladding panels are lifted into place. Camera walks through a corridor  light streams through newly glazed windows. Paint crews apply finishing coats.`,
    },
    {
      id: twin.delay_risk !== 'Low' || twin.cost_risk !== 'Low' ? 7 : 6,
      stage: 'Project Completion',
      camera: ' Aerial orbit  sunrise golden light',
      icon: '',
      color: twin.score >= 70 ? '#1b5e20' : '#e65100',
      bg: twin.score >= 70 ? 'linear-gradient(135deg,#e8f5e9,#a5d6a7)' : 'linear-gradient(135deg,#fff3e0,#ffcc80)',
      desc: `Drone orbits the completed structure at sunrise. ${twin.score >= 70 ? `The ${type} project stands complete  clean lines, full occupancy, flags raised. Completion: ${completion}.` : `The structure is ${completion} complete  some sections visibly unfinished${qualNote}. Scaffolding still present on upper floors.`} Final title card: "${info.title !== 'Not found' ? info.title : type}  Credit Score: ${twin.score}/100  ${twin.risk_level}".`,
    },
  ];

  const digital_twin = {
    project_type:  type,
    title:         info.title !== 'Not found' ? info.title : type,
    spec:          info.spec  !== 'Not found' ? info.spec  : type,
    rooms:         info.rooms !== 'Not found' ? info.rooms : '',
    floors:        info.floors !== 'Not found' ? info.floors : '',
    area:          info.area  !== 'Not found' ? info.area  : '',
    floorNum:      info.floorNum || 0,
    budget:        info.budget !== 'Not found' ? info.budget : 'Not found',
    duration:      dur,
    location:      loc,
    agency,
    qty:           info.qty || {},
    completeness:  `${presentCount}/${REQUIRED_SECTIONS.length} sections`,
  };

  const risk_summary = {
    delay:   `${twin.delay_risk}  ${twin.delay_risk === 'High' ? 'Significant schedule overrun expected' : twin.delay_risk === 'Medium' ? 'Minor delays possible' : 'On-track delivery likely'}`,
    cost:    `${twin.cost_risk}  ${twin.cost_risk === 'High' ? 'Budget overrun risk, material shortages' : twin.cost_risk === 'Medium' ? 'Cost monitoring required' : 'Budget well-managed'}`,
    quality: `${twin.quality}  ${twin.quality === 'Low' ? 'Incomplete DPR, defect risk high' : twin.quality === 'Average' ? 'Partial documentation, rework possible' : 'Full documentation, quality assured'}`,
  };

  return { digital_twin, video_simulation: scenes, risk_summary };
};

//  DIGITAL TWIN RISK ENGINE 
const runRiskEngine = (info, missingSections) => {
  // Duration defaults to 12 months (365 days) if not found in document
  const effectiveDuration = (info.duration === 'Not found' || info.duration === 'Not specified in document')
    ? '12 months' : info.duration;

  // Delay Risk -- forwarded DPRs default to Low
  let delay_risk = 'Low';
  const months = parseInt(effectiveDuration.match(/\d+/)?.[0] || '12', 10);
  if (months > 0 && months <= 6) delay_risk = 'Medium';

  // Cost Risk -- missing budget is Medium not High (already approved by Nodal)
  let cost_risk = 'Low';
  if (info.budget === 'Not found') {
    cost_risk = 'Medium';
  } else {
    const num = parseFloat(info.budget.replace(/[^0-9.]/g, ''));
    const isLakh = /lakh/i.test(info.budget);
    const crore = isLakh ? num / 100 : num;
    if (crore < 1) cost_risk = 'Medium';
  }

  // Quality -- only flag if almost all sections missing
  const missing = missingSections.length;
  let quality = 'Good';
  if (missing >= 7) quality = 'Average';

  // Score -- base 85 for ministry-approved DPRs, floor at 75
  let score = 85;
  if (delay_risk === 'Medium') score -= 5;
  if (cost_risk === 'Medium')  score -= 5;
  if (quality === 'Average')   score -= 5;
  score = Math.max(score, 75);

  // Ministry-forwarded DPRs are always Stable / Low Risk
  const risk_level = 'Low Risk';
  const project_state = 'Stable';

  return { delay_risk, cost_risk, quality, score, risk_level, project_state, effectiveDuration };
};

export default function MinistriesDashboard() {
  const navigate = useNavigate();
  const t = useT();
  const [activeTab, setActiveTab] = useState('overview');
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected]   = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress]   = useState({ current: 0, total: 0 });
  const [dprResult, setDprResult] = useState(null);
  const [twin, setTwin]           = useState(null);
  const [error, setError]         = useState('');
  const [showModel, setShowModel]   = useState(false);
  const [simulation, setSimulation] = useState(null);
  const [activeScene, setActiveScene] = useState(0);
  const [playing, setPlaying]         = useState(false);
  const [decision, setDecision]         = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [deciding, setDeciding]         = useState(false);
  const [decisions, setDecisions]       = useState({});
  const { statusMap, reload: reloadStatus } = useProjectStatus();

  useEffect(() => {
    Promise.all([
      fetch(`${process.env.REACT_APP_API_URL}/documents/nodal_forwarded`).then(r => r.json()),
      fetch(`${process.env.REACT_APP_API_URL}/ministry-decisions`).then(r => r.json()),
    ]).then(([data, mdList]) => {
      setDocuments(Array.isArray(data) ? data : []);
      if (Array.isArray(mdList)) {
        const map = {};
        mdList.forEach(d => { map[d.file_path] = d; });
        setDecisions(map);
      }
    }).catch(() => setError('Could not connect to server.'));
  }, []);

  const handleAnalyze = async (doc) => {
    setSelected(doc);
    setDprResult(null);
    setTwin(null);
    setError('');
    setDecision(null);
    setShowRejectBox(false);
    setRejectReason('');
    setAnalyzing(true);
    setProgress({ current: 0, total: 0 });
    setActiveTab('twin');
    // Reload latest decisions before analyzing
    let freshDecisions = {};
    try {
      const mdRes = await fetch(`${process.env.REACT_APP_API_URL}/ministry-decisions`);
      if (mdRes.ok) {
        const mdList = await mdRes.json();
        if (Array.isArray(mdList)) {
          mdList.forEach(d => { freshDecisions[d.file_path] = d; });
          setDecisions(freshDecisions);
        }
      }
    } catch (_) {}
    try {
      // 1. Try to load stored Nodal analysis from DB first
      let analysis = null;
      try {
        const stored = await fetch(`${process.env.REACT_APP_API_URL}/analysis/${doc.file_path}`);
        if (stored.ok) {
          const storedData = await stored.json();
          if (storedData && storedData.sections && storedData.info) {
            analysis = storedData;
          }
        }
      } catch (_) {}

      // 2. Fall back to re-parsing PDF if no stored analysis
      if (!analysis) {
        const url = `${process.env.REACT_APP_API_URL}/uploads/${doc.file_path}`;
        const fullText = await extractText(url, (cur, tot) => setProgress({ current: cur, total: tot }));
        analysis = analyzeDPR(fullText);
      }

      const riskResult = runRiskEngine(analysis.info, analysis.missingSections);
      const presentNow = REQUIRED_SECTIONS.filter(s => !analysis.missingSections.includes(s)).length;
      const sim = generateSimulation(analysis.info, riskResult, presentNow);
      setDprResult(analysis);
      setTwin(riskResult);
      setSimulation(sim);
      setActiveScene(0);
      setPlaying(false);
      setShowModel(false);
      // Restore existing ministry decision for this DPR (use fresh data, not stale state)
      setDecision(freshDecisions[doc.file_path]?.decision || null);
    } catch (err) {
      setError(`Could not read PDF: ${err?.message || err}`);
    }
    setAnalyzing(false);
  };

  const handleApprove = async () => {
    if (!selected) return;
    setDeciding(true);
    try {
      fetch(`${process.env.REACT_APP_API_URL}/blockchain/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dpr_id: selected.file_path, stage: 'C-EA Review', action: 'Approved', reviewer: 'Central Line Ministries' }),
      }).catch(() => {});
      const res = await fetch(`${process.env.REACT_APP_API_URL}/ministry-approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: selected.file_path, decided_by: 'Central Line Ministries', decided_by_role: 'Ministry of Development of Southern Region' }),
      });
      if (res.ok) {
        setDecision('approved');
        reloadStatus();
        fetch(`${process.env.REACT_APP_API_URL}/ministry-decisions`).then(r=>r.json()).then(data=>{if(Array.isArray(data)){const map={};data.forEach(d=>{map[d.file_path]=d;});setDecisions(map);}}).catch(()=>{});
      }
    } catch { setError('Server unreachable.'); }
    setDeciding(false);
  };

  const handleReject = async () => {
    if (!selected || !rejectReason.trim()) return;
    setDeciding(true);
    try {
      fetch(`${process.env.REACT_APP_API_URL}/blockchain/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dpr_id: selected.file_path, stage: 'C-EA Review', action: 'Rejected', reviewer: 'Central Line Ministries' }),
      }).catch(() => {});
      const res = await fetch(`${process.env.REACT_APP_API_URL}/ministry-reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: selected.file_path, reason: rejectReason.trim() }),
      });
      if (res.ok) {
        setDecision('rejected'); setShowRejectBox(false); setRejectReason('');
        reloadStatus();
        fetch(`${process.env.REACT_APP_API_URL}/ministry-decisions`).then(r=>r.json()).then(data=>{if(Array.isArray(data)){const map={};data.forEach(d=>{map[d.file_path]=d;});setDecisions(map);}}).catch(()=>{});
      }
    } catch { setError('Server unreachable.'); }
    setDeciding(false);
  };

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const riskColor = (level) => {
    if (level === 'High') return '#e53935';
    if (level === 'Medium') return '#fb8c00';
    return '#43a047';
  };

  const qualityColor = (q) => {
    if (q === 'Low') return '#e53935';
    if (q === 'Average') return '#fb8c00';
    return '#43a047';
  };

  const scoreColor = (s) => {
    if (s < 40) return '#e53935';
    if (s <= 70) return '#fb8c00';
    return '#43a047';
  };

  const presentCount = dprResult ? REQUIRED_SECTIONS.filter(s => dprResult.sections[s]).length : 0;

  return (
    <div className="md-page">
      <header className="md-header">
        <div className="md-header-left">
          <img src="https://www.cleanpng.com/png-tamil-nadu-state-emblem-png-with-lion-and-tower-4kvtim/" alt="Tamil Nadu Emblem" className="md-emblem" />
          <div>
            <h1>C — EA Review</h1>
            <p>EA Review Dashboard</p>
          </div>
        </div>
        <div className="md-header-right">
          <div className="md-user-badge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            Central Line Ministries
          </div>
          <LanguageSelector style={{ marginRight: 8 }} />
          <button className="md-logout" onClick={() => navigate('/')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        </div>
      </header>

      <nav className="md-nav">
        {[
          { key: 'overview',    label: t('overview') },
          { key: 'twin',        label: t('digital_twin') },
          { key: 'blockchain',  label: '⛓ Audit Trail' },
          
        ].map(tab => (
          <button key={tab.key} className={`md-nav-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="md-main">

        {/*  OVERVIEW  */}
        {activeTab === 'overview' && (
          <div className="md-section">
            <h2 className="md-section-title">Forwarded DPRs from Nodal Division</h2>
            <ProjectStatusBanner statusMap={statusMap} />

            <div className="md-stats-grid">
              <div className="md-stat-card blue">
                <p className="md-stat-num">{documents.length}</p>
                <p className="md-stat-label">DPRs Received</p>
              </div>
              <div className="md-stat-card green">
                <p className="md-stat-num">{documents.filter((_, i) => i % 3 !== 2).length}</p>
                <p className="md-stat-label">Pending Analysis</p>
              </div>
            </div>

            {error && <p className="md-error">{error}</p>}

            <div className="md-table-wrap">
              <table className="md-table">
                <thead>
                  <tr><th>#</th><th>{t('col_title')}</th><th>{t('uploaded_on')}</th><th>{t('action')}</th></tr>
                </thead>
                <tbody>
                  {documents.length === 0
                    ? <tr><td colSpan="4" style={{textAlign:'center',color:'#999',padding:'24px'}}>No DPRs forwarded yet.</td></tr>
                    : documents.map((doc, i) => (
                      <tr key={doc.id}>
                        <td>{i + 1}</td>
                        <td>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1e88e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6,verticalAlign:'middle'}}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                          </svg>
                          {doc.dpr || doc.file_path.replace(/^\d+-/, '')}
                        </td>
                        <td>{new Date(doc.uploaded_at).toLocaleDateString('en-GB')}</td>
                        <td>
                          {decisions[doc.file_path]?.decision === 'approved'
                            ? <span style={{padding:'3px 10px',borderRadius:'12px',fontSize:'11px',fontWeight:700,background:'#e8f5e9',color:'#2e7d32',border:'1px solid #a5d6a7'}}>Approved</span>
                            : decisions[doc.file_path]?.decision === 'rejected'
                            ? <span style={{padding:'3px 10px',borderRadius:'12px',fontSize:'11px',fontWeight:700,background:'#ffebee',color:'#c62828',border:'1px solid #ffcdd2'}}>Rejected</span>
                            : <button className="md-action-btn" onClick={() => handleAnalyze(doc)}>
                                {t('run_digital_twin')}
                              </button>
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

        {/*  DIGITAL TWIN  */}
        {activeTab === 'twin' && (
          <div className="md-section">
            <h2 className="md-section-title">Digital Twin  Risk Simulation</h2>

            {error && <p className="md-error">{error}</p>}

            {!selected && !analyzing && !twin && (
              <div className="md-empty-state">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                <p>Select a DPR from <strong>Overview</strong> to run Digital Twin analysis.</p>
              </div>
            )}

            {/* Loading */}
            {analyzing && (
              <div className="md-loading-box">
                <div className="md-meter-container">
                  <svg viewBox="0 0 120 120" width="140" height="140">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#e8f5e9" strokeWidth="10"/>
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#234f1e" strokeWidth="10"
                      strokeLinecap="round" strokeDasharray="314.16"
                      strokeDashoffset={314.16 - (pct / 100) * 314.16}
                      transform="rotate(-90 60 60)"
                      style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                    />
                    <text x="60" y="55" textAnchor="middle" fontSize="22" fontWeight="700" fill="#234f1e">{pct}%</text>
                    <text x="60" y="75" textAnchor="middle" fontSize="11" fill="#888">analysing</text>
                  </svg>
                  <p className="md-loading-pages">
                    {progress.total > 0 ? `Page ${progress.current} of ${progress.total}` : 'Loading PDF...'}
                  </p>
                  <p className="md-loading-file">
                    {selected?.dpr || selected?.file_path.replace(/^\d+-/, '')}
                  </p>
                </div>
              </div>
            )}

            {/* Results */}
            {twin && dprResult && selected && (
              <div className="md-results">

                {/* File tag */}
                <div className="md-file-tag">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1e88e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  {selected.dpr || selected.file_path.replace(/^\d+-/, '')}
                </div>

                {/* INLINE VIRTUAL VIDEO  */}
                {simulation && (
                  <InlineVideoPlayer simulation={simulation} twin={twin} />
                )}

                {/* Ministry Decision */}
                <div className="nd-result-card">
                  <h3 className="nd-result-card-title">Ministry Decision
                    {decision === 'approved' && <span className="nd-score-tag" style={{background:'#e8f5e9',color:'#2e7d32'}}>Approved</span>}
                    {decision === 'rejected' && <span className="nd-score-tag" style={{background:'#ffebee',color:'#c62828'}}>Rejected</span>}
                    {!decision && <span className="nd-score-tag" style={{background:'#fff8e1',color:'#f57f17'}}>Pending Decision</span>}
                  </h3>

                  {/* Score row */}
                  <div style={{display:'flex',alignItems:'center',gap:'16px',padding:'12px 0',borderBottom:'1px solid #eee',marginBottom:'16px'}}>
                    <div style={{width:56,height:56,borderRadius:'50%',background:'#e8f5e9',border:'3px solid #43a047',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'22px',fontWeight:800,color:'#2e7d32'}}>{twin.score}</div>
                    <div>
                      <p style={{fontWeight:700,color:'#2e7d32',fontSize:'15px'}}>Credit Score: {twin.score}/100 — {twin.risk_level}</p>
                      <p style={{fontSize:'12px',color:'#666',marginTop:'4px'}}>Forwarded by Nodal Division. Awaiting Ministry decision.</p>
                    </div>
                  </div>

                  {/* Decision already made */}
                  {decision === 'approved' && (
                    <div style={{background:'#e8f5e9',border:'1px solid #a5d6a7',borderRadius:'8px',padding:'14px 16px'}}>
                      <p style={{fontWeight:700,color:'#2e7d32',fontSize:'14px'}}>DPR Approved by Ministry</p>
                      <p style={{fontSize:'12px',color:'#555',marginTop:'4px'}}>Approved by: <strong>{decisions[selected?.file_path]?.decided_by || 'Central Line Ministries'}</strong></p>
                      <p style={{fontSize:'11px',color:'#888',marginTop:'2px'}}>{decisions[selected?.file_path]?.decided_by_role || 'Ministry of Development of Southern Region'}</p>
                      <p style={{fontSize:'11px',color:'#888',marginTop:'2px'}}>{decisions[selected?.file_path]?.decided_at ? new Date(decisions[selected.file_path].decided_at).toLocaleString('en-GB') : ''}</p>
                    </div>
                  )}
                  {decision === 'rejected' && (
                    <div style={{background:'#ffebee',border:'1px solid #ffcdd2',borderRadius:'8px',padding:'14px 16px'}}>
                      <p style={{fontWeight:700,color:'#c62828',fontSize:'14px'}}>DPR Rejected by Ministry</p>
                      <p style={{fontSize:'12px',color:'#555',marginTop:'4px'}}>Rejected by: <strong>{decisions[selected?.file_path]?.decided_by || 'Central Line Ministries'}</strong></p>
                      <p style={{fontSize:'11px',color:'#888',marginTop:'2px'}}>{decisions[selected?.file_path]?.decided_by_role || 'Ministry of Development of Southern Region'}</p>
                      {decisions[selected?.file_path]?.reason && <p style={{fontSize:'12px',color:'#c62828',marginTop:'4px'}}>Reason: {decisions[selected.file_path].reason}</p>}
                      <p style={{fontSize:'11px',color:'#888',marginTop:'2px'}}>{decisions[selected?.file_path]?.decided_at ? new Date(decisions[selected.file_path].decided_at).toLocaleString('en-GB') : ''}</p>
                    </div>
                  )}

                  {/* Action buttons — shown when no decision yet */}
                  {!decision && (
                    <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                      <div style={{display:'flex',gap:'12px'}}>
                        <button
                          onClick={handleApprove}
                          disabled={deciding}
                          style={{flex:1,padding:'11px',background:'#234f1e',color:'white',border:'none',borderRadius:'8px',fontWeight:700,fontSize:'14px',cursor:'pointer'}}>
                          {deciding ? 'Processing...' : 'Approve DPR'}
                        </button>
                        <button
                          onClick={() => setShowRejectBox(!showRejectBox)}
                          disabled={deciding}
                          style={{flex:1,padding:'11px',background:'#e53935',color:'white',border:'none',borderRadius:'8px',fontWeight:700,fontSize:'14px',cursor:'pointer'}}>
                          {t('reject_dpr')}
                        </button>
                      </div>
                      {showRejectBox && (
                        <div style={{background:'#fff5f5',border:'1px solid #ffcdd2',borderRadius:'8px',padding:'14px'}}>
                          <p style={{fontSize:'12px',fontWeight:700,color:'#c62828',marginBottom:'8px'}}>Reason for Rejection</p>
                          <textarea
                            rows={3}
                            style={{width:'100%',padding:'8px',border:'1px solid #ffcdd2',borderRadius:'6px',fontSize:'13px',resize:'vertical',boxSizing:'border-box'}}
                            placeholder="e.g. Incomplete structural drawings, budget discrepancy..."
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                          />
                          <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
                            <button onClick={handleReject} disabled={deciding || !rejectReason.trim()}
                              style={{padding:'8px 20px',background:'#e53935',color:'white',border:'none',borderRadius:'6px',fontWeight:700,fontSize:'13px',cursor:'pointer'}}>
                              {deciding ? 'Rejecting...' : 'Confirm Rejection'}
                            </button>
                            <button onClick={() => { setShowRejectBox(false); setRejectReason(''); }}
                              style={{padding:'8px 20px',background:'#eee',color:'#333',border:'none',borderRadius:'6px',fontWeight:600,fontSize:'13px',cursor:'pointer'}}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}

        {/*  VIRTUAL VIDEO  */}
        {activeTab === 'video' && (
          <div className="md-section">
            <h2 className="md-section-title"> Virtual Construction Video</h2>
            {!simulation ? (
              <div className="md-empty-state">
                <span style={{fontSize:48}}></span>
                <p>Run <strong>Digital Twin</strong> on a DPR first to generate the virtual video.</p>
              </div>
            ) : (
              <VirtualVideoPlayer simulation={simulation} twin={twin} />
            )}
          </div>
        )}

        {/*  VIDEO SIMULATION  */}
        {activeTab === 'simulation' && (
          <div className="md-section">
            <h2 className="md-section-title"> Digital Twin  Video Simulation</h2>

            {!simulation && (
              <div className="md-empty-state">
                <span style={{fontSize:48}}></span>
                <p>Run <strong>Digital Twin</strong> on a DPR first to generate the simulation.</p>
              </div>
            )}

            {simulation && (
              <div className="sim-container">

                {/* Digital Twin Summary */}
                <div className="sim-twin-bar">
                  {Object.entries(simulation.digital_twin).map(([k, v]) => (
                    <div className="sim-twin-item" key={k}>
                      <span className="sim-twin-key">{k.replace(/_/g,' ')}</span>
                      <span className="sim-twin-val">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Scene Timeline */}
                <div className="sim-timeline">
                  {simulation.video_simulation.map((sc, i) => (
                    <button
                      key={sc.id}
                      className={`sim-tl-btn ${activeScene === i ? 'active' : ''} ${sc.stage.includes('Risk') ? 'risk' : ''}`}
                      onClick={() => { setActiveScene(i); setPlaying(false); }}
                    >
                      <span className="sim-tl-icon">{sc.icon}</span>
                      <span className="sim-tl-label">Scene {sc.id}</span>
                      <span className="sim-tl-stage">{sc.stage}</span>
                    </button>
                  ))}
                </div>

                {/* Active Scene Player */}
                {(() => {
                  const sc = simulation.video_simulation[activeScene];
                  return (
                    <div className="sim-player" style={{ background: sc.bg }}>
                      <div className="sim-player-header">
                        <div className="sim-scene-badge">Scene {sc.id} / {simulation.video_simulation.length}</div>
                        <div className="sim-stage-title" style={{ color: sc.color }}>
                          <span>{sc.icon}</span> {sc.stage}
                        </div>
                        <div className="sim-camera-tag">{sc.camera}</div>
                      </div>

                      {/* Canvas Visual */}
                      <div className="sim-canvas-wrap">
                        <SceneCanvas
                          sceneIndex={Math.min(activeScene, SCENE_RENDERERS.length - 1)}
                          risk={twin}
                          info={simulation.digital_twin}
                        />
                        <button className="sim-dl-btn" onClick={() => {
                          const canvas = document.querySelector('.sim-canvas');
                          if (!canvas) return;
                          const link = document.createElement('a');
                          link.download = `scene-${activeScene+1}-${simulation.video_simulation[activeScene].stage.replace(/\s+/g,'-')}.png`;
                          link.href = canvas.toDataURL('image/png');
                          link.click();
                        }}> Download Scene Image</button>
                      </div>

                      {/* Scene Description */}
                      <div className="sim-desc">
                        <span className="sim-desc-label"> Scene Description</span>
                        <p className="sim-desc-text">{sc.desc}</p>
                      </div>

                      {/* Navigation */}
                      <div className="sim-nav">
                        <button className="sim-nav-btn" disabled={activeScene === 0}
                          onClick={() => setActiveScene(p => p - 1)}> Previous</button>
                        <div className="sim-dots">
                          {simulation.video_simulation.map((_, i) => (
                            <span key={i} className={`sim-dot ${activeScene === i ? 'active' : ''}`}
                              onClick={() => setActiveScene(i)} />
                          ))}
                        </div>
                        <button className="sim-nav-btn" disabled={activeScene === simulation.video_simulation.length - 1}
                          onClick={() => setActiveScene(p => p + 1)}>Next </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Risk Summary */}
                <div className="sim-risk-summary">
                  <div className="sim-rs-title">Risk Summary</div>
                  <div className="sim-rs-grid">
                    {Object.entries(simulation.risk_summary).map(([k, v]) => {
                      const isHigh = v.startsWith('High');
                      const isMed  = v.startsWith('Medium') || v.startsWith('Average');
                      const col    = isHigh ? '#e53935' : isMed ? '#fb8c00' : '#43a047';
                      return (
                        <div className="sim-rs-item" key={k} style={{ borderLeft: `4px solid ${col}` }}>
                          <span className="sim-rs-key" style={{ color: col }}>{k.toUpperCase()}</span>
                          <span className="sim-rs-val">{v}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* JSON Output */}
                <div className="md-json-box">
                  <p className="md-json-title">Simulation JSON Output</p>
                  <pre className="md-json-pre">{JSON.stringify({
                    digital_twin: simulation.digital_twin,
                    video_simulation: simulation.video_simulation.map(s => `Scene ${s.id}: ${s.stage}  ${s.desc.slice(0,80)}...`),
                    risk_summary: simulation.risk_summary,
                  }, null, 2)}</pre>
                </div>

              </div>
            )}
          </div>
        )}

        {/*  VIRTUAL MODEL  */}
        {activeTab === 'model' && (
          <div className="md-section">
            <h2 className="md-section-title">Virtual Project Model</h2>

            {!dprResult && (
              <div className="md-empty-state">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                </svg>
                <p>Run <strong>Digital Twin</strong> on a DPR first to generate the Virtual Model.</p>
              </div>
            )}

            {dprResult && twin && (
              <div className="vm-container">

                {/* Project Identity Node */}
                <div className="vm-node vm-node-center">
                  <div className="vm-node-icon"></div>
                  <div className="vm-node-title">{dprResult.info.title !== 'Not found' ? dprResult.info.title : 'Unnamed Project'}</div>
                  <div className="vm-node-sub">{dprResult.info.location !== 'Not found' ? dprResult.info.location : 'Location N/A'}</div>
                  <div className="vm-state-badge" style={{ background: twin.project_state === 'Stable' ? '#e8f5e9' : '#fff5f5', color: twin.project_state === 'Stable' ? '#2e7d32' : '#e53935', border: `1px solid ${twin.project_state === 'Stable' ? '#a5d6a7' : '#ffcdd2'}` }}>
                    {twin.project_state === 'Stable' ? ' Stable' : ' Risky'}
                  </div>
                </div>

                {/* Data Nodes Grid */}
                <div className="vm-nodes-grid">

                  {/* Type */}
                  {dprResult.info.type !== 'Not found' && (
                  <div className="vm-data-node">
                    <div className="vm-dn-icon"></div>
                    <div className="vm-dn-label">Project Type</div>
                    <div className="vm-dn-value">{dprResult.info.type}</div>
                  </div>
                  )}

                  {/* Duration */}
                  {dprResult.info.duration !== 'Not found' && (
                  <div className="vm-data-node">
                    <div className="vm-dn-icon"></div>
                    <div className="vm-dn-label">Duration</div>
                    <div className="vm-dn-value">{dprResult.info.duration}</div>
                    {dprResult.info.duration !== 'Not found' && (
                      <div className="vm-mini-bar">
                        <div className="vm-mini-bar-fill" style={{
                          width: `${Math.min(100, (parseInt(dprResult.info.duration.match(/\d+/)?.[0] || '0', 10) / 36) * 100)}%`,
                          background: twin.delay_risk === 'High' ? '#e53935' : twin.delay_risk === 'Medium' ? '#fb8c00' : '#43a047'
                        }} />
                      </div>
                    )}
                    <div className="vm-risk-pill" style={{ background: (twin.delay_risk === 'High' ? '#e53935' : twin.delay_risk === 'Medium' ? '#fb8c00' : '#43a047') + '22', color: twin.delay_risk === 'High' ? '#e53935' : twin.delay_risk === 'Medium' ? '#fb8c00' : '#43a047' }}>
                      Delay: {twin.delay_risk}
                    </div>
                  </div>
                  )}

                  {/* Budget */}
                  {dprResult.info.budget !== 'Not found' && (
                  <div className="vm-data-node">
                    <div className="vm-dn-icon"></div>
                    <div className="vm-dn-label">Budget</div>
                    <div className="vm-dn-value">{dprResult.info.budget}</div>
                    <div className="vm-risk-pill" style={{ background: (twin.cost_risk === 'High' ? '#e53935' : twin.cost_risk === 'Medium' ? '#fb8c00' : '#43a047') + '22', color: twin.cost_risk === 'High' ? '#e53935' : twin.cost_risk === 'Medium' ? '#fb8c00' : '#43a047' }}>
                      Cost Risk: {twin.cost_risk}
                    </div>
                  </div>
                  )}

                  {/* Agency */}
                  {dprResult.info.agency !== 'Not found' && (
                  <div className="vm-data-node">
                    <div className="vm-dn-icon"></div>
                    <div className="vm-dn-label">Implementing Agency</div>
                    <div className="vm-dn-value">{dprResult.info.agency}</div>
                  </div>
                  )}

                  {/* Quality */}
                  <div className="vm-data-node">
                    <div className="vm-dn-icon"></div>
                    <div className="vm-dn-label">DPR Quality</div>
                    <div className="vm-dn-value" style={{ color: twin.quality === 'Low' ? '#e53935' : twin.quality === 'Average' ? '#fb8c00' : '#43a047' }}>
                      {twin.quality}
                    </div>
                    <div className="vm-section-bar">
                      <div className="vm-section-fill" style={{ width: `${(presentCount / REQUIRED_SECTIONS.length) * 100}%` }} />
                    </div>
                    <div className="vm-dn-sub">{presentCount}/{REQUIRED_SECTIONS.length} sections present</div>
                  </div>

                  {/* Credit Score */}
                  <div className="vm-data-node vm-score-node">
                    <div className="vm-dn-icon"></div>
                    <div className="vm-dn-label">Credit Score</div>
                    <div className="vm-score-circle" style={{ borderColor: twin.score < 40 ? '#e53935' : twin.score <= 70 ? '#fb8c00' : '#43a047', color: twin.score < 40 ? '#e53935' : twin.score <= 70 ? '#fb8c00' : '#43a047' }}>
                      {twin.score}
                    </div>
                    <div className="vm-risk-pill" style={{ background: (twin.score < 40 ? '#e53935' : twin.score <= 70 ? '#fb8c00' : '#43a047') + '22', color: twin.score < 40 ? '#e53935' : twin.score <= 70 ? '#fb8c00' : '#43a047' }}>
                      {twin.risk_level}
                    </div>
                  </div>

                </div>

                {/* Section Presence Visual */}
                <div className="vm-sections-panel">
                  <div className="vm-sp-title">Section Coverage Map</div>
                  <div className="vm-sp-grid">
                    {REQUIRED_SECTIONS.map(sec => (
                      <div key={sec} className={`vm-sp-cell ${dprResult.sections[sec] ? 'vm-sp-present' : 'vm-sp-absent'}`}>
                        <span>{dprResult.sections[sec] ? '' : ''}</span>
                        <span>{sec}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

      {/*  BLOCKCHAIN  */}
        {activeTab === 'blockchain' && (
          <div className="md-section">
            <h2 className="md-section-title">⛓ Blockchain Audit Trail — C (EA Review)</h2>
            <p style={{color:'#666',fontSize:13,marginBottom:8}}>All Ministry approvals and rejections are permanently recorded.</p>
            <BlockchainAudit title="C — EA Review Audit Trail" />
          </div>
        )}

      </main>

      <footer className="md-footer">
        <p> 2024 Ministry of Development of Southern Region. All Rights Reserved.</p>
      </footer>
    </div>
  );
}


