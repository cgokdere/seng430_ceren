// ── STEP NAVIGATION ──────────────────────────────────────────────
let schemaOK = (function () { try { return localStorage.getItem('heathAI_schemaOK') === '1'; } catch (e) { return false; } })();
window.step3Complete = false;
let currentStep = 1;
window.currentStep = 1;
const steps = [...document.querySelectorAll('.step-btn')];
const screens = [...document.querySelectorAll('.screen')];

var stepNames = { 1: 'Clinical Context', 2: 'Data Exploration', 3: 'Data Preparation', 4: 'Model & Parameters', 5: 'Results', 6: 'Explainability', 7: 'Ethics & Bias' };

// ── GLOBAL POPUP (used for navigation / blocking errors) ──────────
function ensureGlobalPopup() {
  if (document.getElementById('globalPopupOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'globalPopupOverlay';
  overlay.className = 'global-popup-overlay';
  overlay.innerHTML = `
    <div class="global-popup-box" role="dialog" aria-modal="true" aria-labelledby="globalPopupTitle" aria-describedby="globalPopupMessage">
      <button class="global-popup-close" type="button" aria-label="Close">✕</button>
      <div class="global-popup-top">
        <div class="global-popup-icon warn" id="globalPopupIcon" aria-hidden="true">!</div>
        <div style="min-width:0;">
          <div class="global-popup-title" id="globalPopupTitle">Action required</div>
          <div class="global-popup-message" id="globalPopupMessage"></div>
        </div>
      </div>
      <div class="global-popup-actions">
        <button class="btn primary" type="button" id="globalPopupOk">OK</button>
      </div>
    </div>
  `.trim();

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeGlobalPopup();
  });
  overlay.querySelector('.global-popup-close')?.addEventListener('click', closeGlobalPopup);
  overlay.querySelector('#globalPopupOk')?.addEventListener('click', closeGlobalPopup);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGlobalPopup();
  });

  document.body.appendChild(overlay);
}

function closeGlobalPopup() {
  const overlay = document.getElementById('globalPopupOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
}

function showGlobalPopup(opts) {
  ensureGlobalPopup();
  const overlay = document.getElementById('globalPopupOverlay');
  if (!overlay) return;
  const boxEl = overlay.querySelector('.global-popup-box');
  const titleEl = overlay.querySelector('#globalPopupTitle');
  const msgEl = overlay.querySelector('#globalPopupMessage');
  const iconEl = overlay.querySelector('#globalPopupIcon');

  const title = (opts && opts.title) ? String(opts.title) : 'Action required';
  const message = (opts && opts.message) ? String(opts.message) : '';
  const variant = (opts && opts.variant) ? String(opts.variant) : 'warn'; // warn | bad | info

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (iconEl) {
    iconEl.className = `global-popup-icon ${variant}`;
    iconEl.textContent = variant === 'info' ? 'i' : '!';
  }
  if (boxEl) {
    boxEl.classList.toggle('global-popup-centered', variant === 'bad');
  }

  overlay.classList.add('open');

  // focus OK for keyboard users
  setTimeout(() => overlay.querySelector('#globalPopupOk')?.focus(), 0);
}
function showStep(n) {
  currentStep = n;
  window.currentStep = n;
  steps.forEach(s => {
    const sn = Number(s.dataset.step);
    s.classList.toggle('active', sn === n);
    if (sn < n) s.classList.add('done'); else s.classList.remove('done');
  });
  screens.forEach(s => s.classList.toggle('active', s.id === `step-${n}`));
  var ind = document.getElementById('stepIndicator');
  if (ind) { ind.innerHTML = '<span style="font-weight:700;color:var(--primary);">Step ' + n + ' / 7</span> · ' + (stepNames[n] || ''); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (n === 3 && typeof initStep3UI === 'function') {
    initStep3UI();
  }
  if (n === 4 && typeof _redrawActive === 'function') {
    setTimeout(function () { requestAnimationFrame(_redrawActive); }, 80);
    // Show all models when returning back to Step 4
    const tbody = document.getElementById('compareBody');
    if (tbody) {
      Array.from(tbody.querySelectorAll('tr')).forEach(tr => tr.style.display = '');
    }
  }
  if (n >= 5) {
    // When moving to Step 5, only keep the highest accuracy version visible for each model type
    const tbody = document.getElementById('compareBody');
    if (tbody) {
      const rows = Array.from(tbody.querySelectorAll('tr[data-model-id]'));
      const best = {};
      rows.forEach(r => {
        const mid = r.dataset.modelId;
        const acc = parseFloat(r.dataset.accuracy) || 0;
        if (!best[mid] || best[mid].acc <= acc) {
          best[mid] = { acc, row: r };
        }
      });
      rows.forEach(r => {
        const mid = r.dataset.modelId;
        if (best[mid] && best[mid].row !== r) {
          r.style.display = 'none'; // hide suboptimal variants
        } else {
          r.style.display = '';
        }
      });

      // Pass the visible rows to step5-backend.js if defined
      if (typeof window.renderStep5Metrics === 'function') {
        const visibleRows = Object.values(best).map(b => b.row);
        window.renderStep5Metrics(visibleRows);
        if (typeof window.renderStep5Charts === 'function') {
          window.renderStep5Charts(visibleRows);
        }
      }
    }

    if (n === 6) {
      if (!window.correlationData) {
        const saved = sessionStorage.getItem('healthai_correlation');
        if (saved && saved !== 'undefined') {
          try {
            window.correlationData = JSON.parse(saved);
          } catch (e) { }
        }
      }
      if (typeof renderStep6 === 'function') setTimeout(renderStep6, 100);
      setTimeout(renderCorrelationHeatmap, 150);
    }
    if (n === 7 && typeof renderStep7Ethics === 'function') {
      setTimeout(renderStep7Ethics, 100);
      if (typeof updateChecklistProgress === 'function') setTimeout(updateChecklistProgress, 50);
    }
  }
}

function gate(n) {
  if (typeof isSchemaOK === 'function') {
    schemaOK = isSchemaOK();
  } else {
    try { schemaOK = sessionStorage.getItem('healthai_schemaOK') === '1' || localStorage.getItem('heathAI_schemaOK') === '1'; } catch (e) { }
  }

  if (n >= 3 && !schemaOK) {
    showStep(2);
    // Hide inline banners and show a consistent popup instead
    const sb = document.getElementById('schemaBanner');
    if (sb) sb.style.display = 'none';
    showGlobalPopup({
      title: 'Action required',
      message: 'You must open the Column Mapper, validate the schema, and save before continuing to Step 3.',
      variant: 'bad',
    });
    return true;
  }

  // Step 3 to 4 lock
  if (n >= 4 && typeof window.step3Complete !== 'undefined' && !window.step3Complete) {
    showStep(3);
    const reqReadyBanner = document.getElementById('step3ReadyBanner');
    if (reqReadyBanner) reqReadyBanner.style.display = 'none';
    showGlobalPopup({
      title: 'Action required',
      message: 'You must click "Apply Preparation Settings" to process your data before continuing to Step 4.',
      variant: 'bad',
    });
    return true;
  }

  // Step 4 to 5 lock
  if (n >= 5) {
    const emptyRow = document.getElementById('emptyCompareRow');
    if (emptyRow && emptyRow.parentNode) {
      showStep(4);
      const step4Banner = document.getElementById('step4ReadyBanner');
      if (step4Banner) step4Banner.style.display = 'none';
      showGlobalPopup({
        title: 'Action required',
        message: 'You must train at least one model in Step 4 before viewing the results in Step 5.',
        variant: 'bad',
      });
      return true;
    }
  }

  return false;
}

steps.forEach(b => b.addEventListener('click', () => {
  const n = Number(b.dataset.step);
  if (gate(n)) return;
  showStep(n);
}));

document.body.addEventListener('click', e => {
  const nx = e.target.closest('[data-next]');
  const pv = e.target.closest('[data-prev]');
  if (nx) {
    const n = Number(nx.dataset.next);

    // Custom logic for jumping between HTML pages for step 1 -> 2
    const isStep2Page = window.location.href.includes('step2');
    if (n === 2 && !isStep2Page) {
      const currentDomain = document.getElementById('domainLabel').textContent;
      window.location.href = `step2.html?domain=${encodeURIComponent(currentDomain)}`;
      return;
    }

    if (!gate(n)) showStep(n);
  }
  if (pv) {
    const n = Number(pv.dataset.prev);
    if (n === 1 && window.location.pathname.includes('step2')) {
      const currentDomain = document.getElementById('domainLabel').textContent;
      window.location.href = `step1.html?domain=${encodeURIComponent(currentDomain)}`;
      return;
    }
    showStep(n);
  }
});

// ── DOMAIN SWITCHER (dropdown) ────────────────────────────────────
const domainData = {
  'Cardiology': 'Will this patient be readmitted to hospital within 30 days of discharge following a heart failure episode?',
  'Radiology': 'Can we predict the diagnosis from these radiology features?',
  'Nephrology': 'Does this patient have chronic kidney disease based on their routine blood and urine test results?',
  'Oncology': 'Is this breast tissue biopsy malignant (cancerous) or benign (non-cancerous)?',
  'Neurology': 'Does this patient show voice-based biomarkers consistent with Parkinson\'s disease?',
  'Endocrinology': 'Will this patient develop Type 2 diabetes within the next 5 years based on current metabolic measurements?',
  'Hepatology': 'Does this patient have liver disease based on blood and clinical markers?',
  'Mental Health': 'What is the severity class of this patient\'s depression?',
  'Pulmonology': 'Is this COPD patient at high risk of a severe exacerbation requiring hospitalisation in the next 3 months?',
  'Haematology — Anaemia': 'What type of anaemia does this patient have?',
  'Dermatology': 'Is this skin lesion likely benign (harmless) or malignant (potentially cancerous)?',
  'Ophthalmology': 'What is the diabetic retinopathy severity grade?',
  'Orthopaedics': 'What is the vertebral column classification?',
  'ICU / Sepsis': 'Will this ICU patient develop sepsis in the next 6 hours based on current vital signs and lab results?',
  'Obstetrics — Fetal Health': 'Is this fetal cardiotocography reading normal, suspicious, or pathological?',
  'Cardiology — Arrhythmia': 'Does this patient have arrhythmia based on ECG and clinical data?',
  'Oncology — Cervical': 'Does this patient require a biopsy based on cervical cancer risk factors?',
  'Thyroid / Endocrinology': 'What is the thyroid disease classification?',
  'Pharmacy': 'Will this diabetes patient be readmitted to hospital?',
  'Cardiology — Stroke': 'Is this patient at high risk of having a stroke within the next 10 years?',
};

const domainWhyThisMatters = {
  'Cardiology': 'Around 30% of heart failure patients are readmitted within 30 days. Each readmission costs approximately €15,000. Early identification allows nurses to arrange discharge follow-up calls and medication checks.',
  'Radiology': 'Accurate prediction from imaging features can prioritise reporting and reduce delays. Misclassification may delay diagnosis or cause unnecessary follow-up.',
  'Nephrology': 'Chronic kidney disease often goes undetected until late stages. Early identification from routine tests allows lifestyle and treatment changes to slow progression.',
  'Oncology': 'Distinguishing malignant from benign tissue guides biopsy and treatment. Delays in identifying malignancy can affect survival; false alarms cause anxiety and extra procedures.',
  'Neurology': 'Voice-based markers can support early screening for Parkinson\'s. Non-invasive tools help prioritise who needs specialist assessment.',
  'Endocrinology': 'Type 2 diabetes is preventable when identified early. Predicting risk from metabolic measurements supports targeted lifestyle and monitoring interventions.',
  'Hepatology': 'Liver disease is frequently silent until advanced. Early flagging from blood and clinical markers allows intervention before irreversible damage.',
  'Mental Health': 'Depression severity drives treatment choice and referral. Consistent classification supports stepped care and resource allocation.',
  'Pulmonology': 'COPD exacerbations are costly and dangerous. Predicting high risk supports preventive care and timely treatment to avoid hospitalisation.',
  'Haematology — Anaemia': 'Correct anaemia type guides treatment (e.g. iron, B12, folate). Misclassification can delay recovery or cause harm.',
  'Dermatology': 'Skin lesion triage helps prioritise suspicious cases for biopsy. Missing malignancy is critical; over-referral increases workload.',
  'Ophthalmology': 'Diabetic retinopathy grading drives screening intervals and referral. Early detection prevents vision loss.',
  'Orthopaedics': 'Vertebral classification guides rehabilitation and surgical decisions. Correct labelling supports appropriate care pathways.',
  'ICU / Sepsis': 'Sepsis is time-critical. Predicting onset from vital signs and labs allows earlier treatment and better outcomes.',
  'Obstetrics — Fetal Health': 'CTG interpretation guides delivery timing. Normal vs pathological classification supports safe obstetric decisions.',
  'Cardiology — Arrhythmia': 'Arrhythmia detection from ECG and clinical data guides monitoring and treatment. Missed cases can lead to stroke or sudden events.',
  'Oncology — Cervical': 'Cervical cancer risk stratification guides who needs biopsy. Balancing sensitivity and specificity avoids missed cancer or unnecessary procedures.',
  'Thyroid / Endocrinology': 'Thyroid classification directs further tests and treatment. Accurate labelling avoids inappropriate therapy or delay.',
  'Pharmacy': 'Diabetes readmission prediction helps target discharge planning and follow-up. Reducing avoidable readmissions improves outcomes and saves costs.',
  'Cardiology — Stroke': 'Stroke is a leading cause of disability and death. Risk stratification supports prevention (lifestyle, medication) and targeted follow-up.',
};

const domainDesc = {
  'Cardiology': 'predict which patients are most likely to be readmitted within 30 days after a heart failure discharge — so doctors can arrange follow-up care in advance.',
  'Radiology': 'predict diagnosis from radiology features — to prioritise reporting and support clinical decisions.',
  'Nephrology': 'identify chronic kidney disease from routine blood and urine tests — so that early intervention can slow progression.',
  'Oncology': 'distinguish malignant from benign breast tissue — to guide biopsy and treatment decisions.',
  'Neurology': 'detect voice-based biomarkers consistent with Parkinson\'s disease — to support early screening and referral.',
  'Endocrinology': 'predict Type 2 diabetes risk from metabolic measurements — to target prevention and monitoring.',
  'Hepatology': 'identify liver disease from blood and clinical markers — before irreversible damage occurs.',
  'Mental Health': 'classify depression severity — to support stepped care and treatment choice.',
  'Pulmonology': 'predict high risk of COPD exacerbation — so preventive care can reduce hospitalisations.',
  'Haematology — Anaemia': 'classify anaemia type — to guide correct treatment (iron, B12, folate).',
  'Dermatology': 'triage skin lesions as likely benign or malignant — to prioritise suspicious cases for biopsy.',
  'Ophthalmology': 'grade diabetic retinopathy severity — to guide screening intervals and referral.',
  'Orthopaedics': 'classify vertebral column condition — to guide rehabilitation and surgical decisions.',
  'ICU / Sepsis': 'predict sepsis onset from vital signs and lab results — so treatment can start earlier.',
  'Obstetrics — Fetal Health': 'classify fetal CTG as normal, suspicious, or pathological — to support safe delivery decisions.',
  'Cardiology — Arrhythmia': 'detect arrhythmia from ECG and clinical data — to guide monitoring and treatment.',
  'Oncology — Cervical': 'stratify cervical cancer risk — to guide who needs biopsy and follow-up.',
  'Thyroid / Endocrinology': 'classify thyroid disease — to direct further tests and treatment.',
  'Pharmacy': 'predict diabetes readmission risk — to target discharge planning and reduce avoidable readmissions.',
  'Cardiology — Stroke': 'stratify stroke risk — to support prevention and targeted follow-up.',
};

function syncDomainSelectDisplay() {
  const sel = document.getElementById('domainSelect');
  if (!sel) return;
  const wrapper = sel.nextElementSibling;
  if (!wrapper || !wrapper.classList.contains('custom-select-wrapper')) return;
  const textSpan = wrapper.querySelector('.custom-select-text');
  if (textSpan) textSpan.textContent = sel.options[sel.selectedIndex]?.text || sel.value;
  wrapper.querySelectorAll('.custom-option').forEach((opt, idx) => {
    opt.classList.toggle('selected', idx === sel.selectedIndex);
  });
}

function setActiveDomainPill(d) {
  document.querySelectorAll('.domain-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.domain === d);
  });
}

function applyDomainToUI(d) {
  document.getElementById('domainLabel').textContent = d;
  const step1Domain = document.getElementById('step1-domain');
  if (step1Domain) step1Domain.textContent = d;
  const step1Question = document.getElementById('step1-question');
  if (step1Question && domainData[d]) step1Question.textContent = domainData[d];
  const step1Why = document.getElementById('step1-why');
  if (step1Why && domainWhyThisMatters[d]) step1Why.textContent = domainWhyThisMatters[d];
  const step1Desc = document.getElementById('step1-desc');
  if (step1Desc && domainDesc[d]) step1Desc.innerHTML = `Before we look at any data, we define the clinical problem. In <b>${d}</b>, we want to ${domainDesc[d]}`;
  syncDomainSelectDisplay();
  setActiveDomainPill(d);
}

const domainSelect = document.getElementById('domainSelect');
if (domainSelect) {
  domainSelect.addEventListener('change', function () {
    const d = this.value;
    const prevDomain = document.getElementById('domainLabel').textContent;
    if (d === prevDomain) return;
    const doSwitch = () => {
      schemaOK = false;
      try {
        localStorage.removeItem('heathAI_schemaOK');
        sessionStorage.removeItem('healthai_preprocessed');
        sessionStorage.removeItem('healthai_prep_visible');
        sessionStorage.removeItem('healthai_correlation');
      } catch (err) { }
      window.location.href = `step1.html?domain=${encodeURIComponent(d)}`;
    };
    elegantConfirm(
      'Switch Clinical Domain?',
      `Are you sure you want to switch the domain to ${d}? This will reset your current progress and return you to Step 1.`,
      doSwitch,
      () => {
        this.value = prevDomain;
        syncDomainSelectDisplay();
        setActiveDomainPill(prevDomain);
      }
    );
  });
}

document.querySelectorAll('.domain-pill').forEach(pill => {
  pill.addEventListener('click', function () {
    const d = this.dataset.domain;
    const prevDomain = document.getElementById('domainLabel').textContent;
    if (d === prevDomain) return;
    const doSwitch = () => {
      schemaOK = false;
      try {
        localStorage.removeItem('heathAI_schemaOK');
        sessionStorage.removeItem('healthai_preprocessed');
        sessionStorage.removeItem('healthai_prep_visible');
        sessionStorage.removeItem('healthai_correlation');
      } catch (err) { }
      window.location.href = `step1.html?domain=${encodeURIComponent(d)}`;
    };
    elegantConfirm(
      'Switch Clinical Domain?',
      `Are you sure you want to switch the domain to ${d}? This will reset your current progress and return you to Step 1.`,
      doSwitch,
      () => {
        if (domainSelect) { domainSelect.value = prevDomain; syncDomainSelectDisplay(); }
        setActiveDomainPill(prevDomain);
      }
    );
  });
});

// Check URL for domain parameter and auto-select
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const urlDomain = urlParams.get('domain');
  const sel = document.getElementById('domainSelect');
  const domainLabel = document.getElementById('domainLabel');
  if (urlDomain && sel && Array.from(sel.options).some(o => o.value === urlDomain)) {
    sel.value = urlDomain;
    if (domainLabel) domainLabel.textContent = urlDomain;
    applyDomainToUI(urlDomain);
  } else if (sel && domainLabel) {
    domainLabel.textContent = sel.value;
    applyDomainToUI(sel.value);
  }
});

// ── UPLOAD TOGGLE ─────────────────────────────────────────────────
document.getElementById('useDefault').addEventListener('click', function () {
  document.getElementById('uploadArea').style.display = 'none';
  this.style.borderColor = 'var(--navy)'; this.style.color = 'var(--navy)';
  document.getElementById('useUpload').style.borderColor = '';
  document.getElementById('useUpload').style.color = '';
});
document.getElementById('useUpload').addEventListener('click', function () {
  document.getElementById('uploadArea').style.display = 'block';
  this.style.borderColor = 'var(--navy)'; this.style.color = 'var(--navy)';
  document.getElementById('useDefault').style.borderColor = '';
  document.getElementById('useDefault').style.color = '';
});

// Drop zone
const dz = document.getElementById('dropZone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); handleFile(e.dataTransfer.files[0]); });
document.getElementById('csvInput').addEventListener('change', e => handleFile(e.target.files[0]));

function handleFile(file) {
  const status = document.getElementById('uploadStatus');
  const error = document.getElementById('uploadError');
  status.style.display = 'none'; error.style.display = 'none';
  if (!file) return;
  if (!file.name.endsWith('.csv')) {
    error.style.display = 'block';
    document.getElementById('uploadErrMsg').textContent = 'This file is not a CSV. Please export your data as a .csv file.';
    dz.classList.add('error'); return;
  }
  if (file.size > 52428800) {
    error.style.display = 'block';
    document.getElementById('uploadErrMsg').textContent = 'File exceeds 50 MB. Please reduce the file to 50,000 rows or fewer.';
    dz.classList.add('error'); return;
  }
  dz.classList.remove('error'); dz.classList.add('has-file');
  status.style.display = 'block';
  document.getElementById('uploadMsg').textContent = `✓ "${file.name}" loaded (${(file.size / 1024).toFixed(0)} KB). Detecting columns…`;
}

// ── COLUMN MAPPER MODAL ───────────────────────────────────────────
const mapBack = document.getElementById('mapperBack');
// Track whether user clicked "Validate Schema" after opening the mapper.
// Save/Save&Close will require this click (step2_backend enforces).
window.__healthai_mapperValidateClicked = window.__healthai_mapperValidateClicked || false;
document.getElementById('openMapper').addEventListener('click', () => {
  window.__healthai_mapperValidateClicked = false;
  if (typeof populateMapper === 'function') {
    var ds = typeof loadDataset === 'function' ? loadDataset() : null;
    if (ds) populateMapper(ds);
  }
  mapBack.classList.add('open');
});
document.getElementById('closeMapper').addEventListener('click', () => mapBack.classList.remove('open'));
document.getElementById('cancelMapper').addEventListener('click', () => mapBack.classList.remove('open'));
mapBack.addEventListener('click', e => { if (e.target === mapBack) mapBack.classList.remove('open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') mapBack.classList.remove('open'); });

document.getElementById('validateSchema').addEventListener('click', () => {
  window.__healthai_mapperValidateClicked = true;
  if (typeof validateMapper === 'function') {
    // Handled by step2-data.js
    var result = validateMapper();
    var dot = document.getElementById('schDot');
    var status = document.getElementById('schStatus');
    var mb = document.getElementById('mapBanner');
    if (result.ok) {
      if (dot) dot.className = 's-pill-dot ok';
      if (status) status.textContent = 'Valid';
      if (mb) { mb.className = 'banner good'; mb.innerHTML = '<div class="banner-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--good);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><div><b>Valid:</b> Target is "' + result.targetName + '", ' + result.featureCount + ' feature columns ready.</div>'; }
    } else {
      if (dot) dot.className = 's-pill-dot bad';
      if (status) status.textContent = 'Invalid';
      if (mb) { mb.className = 'banner bad'; mb.innerHTML = '<div class="banner-icon">🚫</div><div><b>Error:</b> ' + result.msg + '</div>'; }
    }
  } else {
    document.getElementById('schDot').className = 's-pill-dot ok';
    document.getElementById('schStatus').textContent = 'Valid';
    var mb = document.getElementById('mapBanner');
    mb.className = 'banner good';
    mb.innerHTML = '<div class="banner-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--good);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><div><b>Valid:</b> Target is binary, has no missing values, and identifier column is excluded.</div>';
  }
});

function markSchemaSaved() {
  // Must validate before saving
  if (typeof validateMapper === 'function') {
    var result = validateMapper();
    if (!result.ok) {
      // Trigger validate UI to show the error
      document.getElementById('validateSchema').click();
      return false;
    }
  }
  schemaOK = true;
  try { localStorage.setItem('heathAI_schemaOK', '1'); } catch (e) { }
  try { sessionStorage.setItem('healthai_schemaOK', '1'); } catch (e) { }
  const sb = document.getElementById('schemaBanner');
  if (sb) {
    sb.className = 'banner good';
    sb.innerHTML = '<div class="banner-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--good);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><div><b>Mapping saved.</b> Schema validated. You can now proceed to Step 3.</div>';
  }
  return true;
}
document.getElementById('saveMapping').addEventListener('click', markSchemaSaved);
document.getElementById('saveAndClose').addEventListener('click', () => {
  if (markSchemaSaved()) mapBack.classList.remove('open');
});

// Sync schemaOK when step2_backend validates independently
window.addEventListener('schemaValidated', function (e) {
  if (e.detail && e.detail.ok) {
    schemaOK = true;
    try { localStorage.setItem('heathAI_schemaOK', '1'); } catch (ex) { }
  }
});





// == MODEL TABS + VISUALIZATIONS (Phase 8 Final) ==
const _modelDescs = {
  knn: '<b>K-Nearest Neighbors (KNN)</b> — Finds the <b>K most similar past patients</b> and predicts based on their outcomes. Adjust K to see how the neighbourhood radius changes.',
  svm: '<b>Support Vector Machine (SVM)</b> — Draws the <b>widest margin boundary</b> between readmitted and non-readmitted patients. C controls strictness; kernel controls boundary shape.',
  dt: '<b>Decision Tree</b> — Asks a sequence of Yes/No questions about patient measurements. More depth = more questions = potentially overfitting the training data.',
  rf: '<b>Random Forest</b> — A committee of many independent decision trees. Each votes; the majority wins. More trees = more stable predictions.',
  lr: '<b>Logistic Regression</b> — Converts a linear combination of measurements into a readmission probability via the S-Curve. C controls the curve\'s steepness.',
  nb: "<b>Naïve Bayes</b> — Combines each measurement's independent risk contribution using Bayes' theorem. Each bar shows how much that feature shifts the final probability.",
};
const _paramP = { knn: 'params-knn', svm: 'params-svm', dt: 'params-dt', rf: 'params-rf', lr: 'params-lr', nb: 'params-nb' };
const _vizP = { knn: 'viz-knn', svm: 'viz-svm', dt: 'viz-dt', rf: 'viz-rf', lr: 'viz-lr', nb: 'viz-nb' };
let _activeAlgo = 'knn';

function _showAlgo(m) {
  _activeAlgo = m;
  document.querySelectorAll('.model-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector('.model-tab[data-model="' + m + '"]'); if (tab) tab.classList.add('active');
  const desc = document.getElementById('modelDesc'); if (desc) desc.innerHTML = _modelDescs[m] || '';
  Object.values(_paramP).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  Object.values(_vizP).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  const pp = document.getElementById(_paramP[m]); if (pp) pp.style.display = 'block';
  const vp = document.getElementById(_vizP[m]); if (vp) vp.style.display = 'block';
  // Use rAF so elements are visible and have non-zero layout before drawing
  requestAnimationFrame(function () { requestAnimationFrame(_redrawActive); });
}
document.querySelectorAll('.model-tab').forEach(tab => {
  tab.addEventListener('click', function () { _showAlgo(tab.dataset.model); });
});

function _css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

// Canvas helper: use actual rendered dimensions to avoid init stretch bug
function _sizeCanvas(canvas, defaultH) {
  var dpr = window.devicePixelRatio || 1;
  var W = canvas.offsetWidth;
  var H = canvas.offsetHeight || defaultH || 240;
  if (W < 10) { var par = canvas.parentElement; W = par ? par.clientWidth || 400 : 400; }
  if (H < 10) H = defaultH || 240;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  var ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  return { ctx: ctx, W: W, H: H };
}

function _wireSlider(sid, vid, fmt, cb) {
  var s = document.getElementById(sid), v = document.getElementById(vid);
  if (!s) return;
  s.addEventListener('input', function () {
    if (v) v.textContent = fmt ? fmt(+s.value) : s.value;
    if (cb) cb(+s.value);
    triggerRetrain();
    _redrawActive();
  });
}
_wireSlider('splitSlider', 'splitVal', function (v) {
  var tr = Math.round(304 * v / 100), te = 304 - tr;
  var el = document.getElementById('splitHint'); if (el) el.textContent = 'Training: ' + tr + ' patients · Testing: ' + te + ' patients';
  return v + '%';
});
_wireSlider('knnK', 'knnKVal', null, function (v) { var l = document.getElementById('knnKVizLabel'); if (l) l.textContent = v; });
_wireSlider('svmC', 'svmCVal', function (v) { return (Math.pow(10, (v - 5) / 2)).toFixed(2); });
var _svmKEl = document.getElementById('svmKernel');
if (_svmKEl) _svmKEl.addEventListener('change', function () { if (_activeAlgo === 'svm') _drawSVM(); triggerRetrain(); });
_wireSlider('dtDepth', 'dtDepthVal');
_wireSlider('rfTrees', 'rfTreesVal', null, function (v) { var e = document.getElementById('rfTreeCountVal'); if (e) e.textContent = v; var e2 = document.getElementById('rfTreeCountVal2'); if (e2) e2.textContent = v; });
_wireSlider('rfDepth', 'rfDepthVal');
_wireSlider('lrC', 'lrCVal', function (v) { return (Math.pow(10, (v - 5) / 2)).toFixed(2); });
_wireSlider('lrIter', 'lrIterVal');

function _redrawActive() {
  if (_activeAlgo === 'knn') _drawKNN();
  else if (_activeAlgo === 'svm') _drawSVM();
  else if (_activeAlgo === 'dt') _drawDT();
  else if (_activeAlgo === 'rf') _drawRF();
  else if (_activeAlgo === 'lr') _drawLR();
  else if (_activeAlgo === 'nb') _drawNB();
}

// ── KNN: Dots + star always visible; K=0 shows base, K>0 highlights neighbors ──
var _knnRAF, _knnCurR = 0, _knnInited = false;
function _drawKNN() {
  var canvas = document.getElementById('knnCanvas'); if (!canvas) return;
  var c = _sizeCanvas(canvas, 240); var ctx = c.ctx, W = c.W, H = c.H;
  var k = Math.max(0, +(document.getElementById('knnK').value || 5));
  var cBad = _css('--bad') || '#dc2626', cGood = _css('--good') || '#16a34a';
  var cPri = _css('--primary') || '#2a7c3f', cInk = _css('--ink') || '#0d2340';
  var pts = [
    [.15, .25, 0], [.20, .55, 0], [.12, .65, 1], [.30, .75, 1], [.37, .38, 0],
    [.50, .20, 0], [.44, .60, 1], [.58, .70, 1], [.63, .40, 0], [.70, .60, 1],
    [.76, .28, 0], [.83, .64, 1], [.35, .17, 0], [.61, .80, 1], [.88, .37, 0],
    [.10, .45, 1], [.90, .73, 1], [.60, .12, 0], [.28, .44, 0], [.53, .46, 1]
  ];
  var np = [.48, .51];
  var dists = pts.map(function (p, i) { return { i: i, d: Math.hypot(p[0] - np[0], p[1] - np[1]), c: p[2] }; });
  dists.sort(function (a, b) { return a.d - b.d; });
  var nbrs = k > 0 ? new Set(dists.slice(0, k).map(function (d) { return d.i; })) : new Set();
  var targetR = k > 0 ? dists[k - 1].d * Math.min(W, H) : 0;
  if (!_knnInited) { _knnCurR = targetR; _knnInited = true; }
  if (_knnRAF) cancelAnimationFrame(_knnRAF);
  function frame() {
    _knnCurR += (targetR - _knnCurR) * 0.14;
    ctx.clearRect(0, 0, W, H);
    if (k > 0) {
      ctx.lineWidth = 1; ctx.strokeStyle = cPri; ctx.globalAlpha = .15;
      pts.forEach(function (p, i) { if (!nbrs.has(i)) return; ctx.beginPath(); ctx.moveTo(p[0] * W, p[1] * H); ctx.lineTo(np[0] * W, np[1] * H); ctx.stroke(); });
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(np[0] * W, np[1] * H, Math.max(0, _knnCurR), 0, 2 * Math.PI);
      ctx.strokeStyle = cPri; ctx.lineWidth = 2; ctx.globalAlpha = .55; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = .06; ctx.fillStyle = cPri; ctx.fill(); ctx.globalAlpha = 1;
    }
    pts.forEach(function (p, i) {
      var isN = nbrs.has(i);
      ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, isN ? 6.5 : 4.5, 0, 2 * Math.PI);
      ctx.fillStyle = p[2] === 1 ? cBad : cGood; ctx.globalAlpha = isN ? 1 : .35; ctx.fill();
      if (isN) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 1; ctx.stroke(); }
      ctx.globalAlpha = 1;
    });
    var sx = np[0] * W, sy = np[1] * H, sr = 10;
    ctx.fillStyle = cInk; ctx.beginPath();
    for (var q = 0; q < 5; q++) {
      var a = (q * 4 * Math.PI / 5) - Math.PI / 2, b = (q * 4 * Math.PI / 5 + 2 * Math.PI / 5) - Math.PI / 2;
      if (q === 0) ctx.moveTo(sx + sr * Math.cos(a), sy + sr * Math.sin(a)); else ctx.lineTo(sx + sr * Math.cos(a), sy + sr * Math.sin(a));
      ctx.lineTo(sx + sr * .4 * Math.cos(b), sy + sr * .4 * Math.sin(b));
    }
    ctx.closePath(); ctx.fill();
    var redN = 0; dists.slice(0, k).forEach(function (d) { if (d.c === 1) redN++; });
    ctx.font = 'bold 12px system-ui'; ctx.fillStyle = cInk; ctx.textAlign = 'left'; ctx.globalAlpha = .85;
    ctx.fillText(k === 0 ? 'Drag K right to highlight nearest neighbours' : ('Neighbours: ' + k + '  |  Readmit: ' + redN + '  |  Safe: ' + (k - redN)), 8, H - 10);
    ctx.globalAlpha = 1;
    if (Math.abs(targetR - _knnCurR) > 0.5) _knnRAF = requestAnimationFrame(frame);
  }
  frame();
}

// ── SVM: Scatter + decision boundary (linear/poly/RBF) with smooth transitions ──
var _svmRAF, _svmT = 0, _svmAnimPrevC = -1, _svmAnimPrevK = '';
function _drawSVM() {
  var canvas = document.getElementById('svmCanvas'); if (!canvas) return;
  var C = +(document.getElementById('svmC').value || 5);
  var kernel = (_svmKEl ? _svmKEl.value : 'rbf').toLowerCase().replace(/\s.*/, '') || 'rbf';
  if (kernel.includes('linear')) kernel = 'linear'; else if (kernel.includes('poly')) kernel = 'poly'; else kernel = 'rbf';
  if (C !== _svmAnimPrevC || kernel !== _svmAnimPrevK) { _svmT = 0; _svmAnimPrevC = C; _svmAnimPrevK = kernel; }
  var c = _sizeCanvas(canvas, 260); var ctx = c.ctx, W = c.W, H = c.H;
  var cBad = _css('--bad') || '#dc2626', cGood = _css('--good') || '#16a34a';
  var cPri = _css('--primary') || '#2a7c3f', cInk = _css('--ink') || '#0d2340', cMuted = _css('--text-muted') || '#6b7280';
  var rPts = [[.15, .72], [.22, .80], [.28, .85], [.12, .63], [.33, .90], [.24, .76], [.38, .94], [.08, .78]];
  var gPts = [[.73, .25], [.80, .18], [.85, .32], [.67, .14], [.90, .35], [.75, .22], [.62, .08], [.92, .27]];
  var cVal = Math.pow(10, (Math.max(1, Math.min(10, C)) - 5) / 2);
  var margin = Math.max(0.03, Math.min(0.25, 0.22 - (C / 10) * 0.14));
  if (_svmRAF) cancelAnimationFrame(_svmRAF);
  function frame() {
    _svmT += (1 - _svmT) * 0.08;
    ctx.clearRect(0, 0, W, H);
    var gR = ctx.createLinearGradient(0, 0, W, 0);
    gR.addColorStop(0, 'rgba(220,38,38,.06)'); gR.addColorStop(.48, 'rgba(220,38,38,.02)'); gR.addColorStop(.52, 'rgba(22,163,74,.02)'); gR.addColorStop(1, 'rgba(22,163,74,.06)');
    ctx.fillStyle = gR; ctx.fillRect(0, 0, W, H);
    function drawBoundary(t) {
      ctx.beginPath();
      if (kernel === 'linear') {
        ctx.moveTo(0, H * (1 - t)); ctx.lineTo(W, H * t);
      } else if (kernel === 'poly') {
        var t0 = 0.4 - (t - 0.4) * 0.3;
        for (var i = 0; i <= 80; i++) {
          var u = i / 80; var x = u * W;
          var y = H * (t0 + 0.15 * Math.sin(u * Math.PI * 3) * _svmT + 0.08 * (u - 0.5) * (u - 0.5) * 4);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      } else {
        var cx = W * .5, cy = H * .5, rx = W * (0.28 + margin * 0.8) * _svmT, ry = H * (0.18 + margin * 0.8) * _svmT;
        ctx.ellipse(cx, cy, rx, ry, Math.PI / 4, 0, 2 * Math.PI);
      }
    }
    ctx.setLineDash([5, 4]); ctx.strokeStyle = cMuted; ctx.lineWidth = 1.5; ctx.globalAlpha = .4;
    drawBoundary(0.4 - margin); ctx.stroke();
    drawBoundary(0.4 + margin); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.strokeStyle = cInk; ctx.lineWidth = 2.5;
    drawBoundary(0.4); ctx.stroke();
    function drawGrp(pts, isRed) {
      pts.forEach(function (p) {
        var diagScore = isRed ? (p[0] + p[1] - 0.7) : ((1 - p[0]) + (1 - p[1]) - 0.7);
        var isSV = Math.abs(diagScore) < margin * 2.5;
        ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, isSV ? 7 : 5, 0, 2 * Math.PI);
        ctx.fillStyle = isRed ? cBad : cGood; ctx.fill();
        if (isSV) { ctx.strokeStyle = cInk; ctx.lineWidth = 2; ctx.stroke(); }
      });
    }
    drawGrp(rPts, true); drawGrp(gPts, false);
    var kLabel = kernel === 'linear' ? 'Linear' : kernel === 'poly' ? 'Polynomial' : 'RBF';
    ctx.font = '11px system-ui'; ctx.fillStyle = cMuted; ctx.textAlign = 'left';
    ctx.fillText('C=' + cVal.toFixed(2) + ' · Margin: ' + (margin * 100).toFixed(0) + '% · Kernel: ' + kLabel, 6, H - 8);
    if (1 - _svmT > 0.008) _svmRAF = requestAnimationFrame(frame);
  }
  frame();
}

// ── DECISION TREE: DOM-based expanding tree with smooth depth transitions ──
var _dtPrevDepth = -1;
function _drawDT() {
  var wrap = document.getElementById('dtWrap'); if (!wrap) return;
  var depth = +(document.getElementById('dtDepth').value || 3);
  var warn = document.getElementById('dtWarn'); if (warn) warn.style.display = depth > 4 ? 'flex' : 'none';
  var wv = document.getElementById('dtWarnVal'); if (wv) wv.textContent = depth;
  var qs = ['EF < 38%?', 'Age ≥ 65?', 'Creatinine > 1.5?', 'Smoker?', 'BP > 140?', 'Prior admission?'];
  var limit = Math.min(Math.max(1, depth), 6);
  function node(lvl, left) {
    if (lvl > limit) return '';
    var q = qs[(lvl - 1) % qs.length];
    if (lvl === limit) {
      var lbl = left ? 'Readmit' : 'Safe';
      var cls = left ? 'leaf-r' : 'leaf-g';
      return '<div class="t-child"><div class="t-lbl ' + cls + '">' + lbl + '</div></div>';
    }
    return '<div class="t-child">'
      + '<div class="t-lbl q">' + q + '</div>'
      + '<div class="t-children">' + node(lvl + 1, true) + node(lvl + 1, false) + '</div>'
      + '</div>';
  }
  wrap.style.opacity = '0.6';
  wrap.style.transform = 'scale(0.98)';
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      wrap.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:12px;min-width:min-content;">'
        + '<div class="t-lbl q" style="font-size:13px;margin-bottom:4px;">' + qs[0] + '</div>'
        + '<div class="t-children" style="margin-top:26px;">' + node(2, true) + node(2, false) + '</div>'
        + '</div>';
      wrap.style.opacity = '1';
      wrap.style.transform = 'scale(1)';
    });
  });
}

// ── RANDOM FOREST: Animated vote bar chart that updates with tree count ──
// Visual logic: more trees = vote percentages converge to stable estimate
function _drawRF() {
  var wrap = document.getElementById('voteTrees'); if (!wrap) return;
  var count = +(document.getElementById('rfTrees').value || 100);
  var tv = document.getElementById('rfTreeCountVal'); if (tv) tv.textContent = count;
  var tv2 = document.getElementById('rfTreeCountVal2'); if (tv2) tv2.textContent = count;
  // Convergence: with few trees, votes are noisier
  // With many trees they converge to ~65% Readmit (simulated)
  var maxNoise = Math.max(0, 20 - count / 15); // noise decreases as trees increase
  var seed = (count * 7 + 13) % 31 - 15; // -15 to +15 deterministic
  var noiseFrac = seed / (count + 1);
  var pct = Math.max(51, Math.min(82, 65 + noiseFrac * maxNoise));
  var rC = Math.round(count * pct / 100), sC = count - rC;
  var rPct = (rC / count * 100).toFixed(1), sPct = (sC / count * 100).toFixed(1);
  // Mini tree icons
  var showN = Math.min(count, 24), cutoff = Math.round(showN * pct / 100);
  var html = '';
  for (var i = 0; i < showN; i++) {
    var isR = i < cutoff;
    html += '<div class="mini-tree" title="Tree #' + (i + 1) + ': votes ' + (isR ? 'Readmit' : 'Safe') + '">'
      + '<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="' + (isR ? 'var(--bad)' : 'var(--good)') + '"/></svg>'
      + '<div style="font-size:8px;color:var(--text-muted);">#' + (i + 1) + '</div>'
      + '</div>';
  }
  wrap.innerHTML = html;
  // Animate vote bars
  setTimeout(function () {
    var bR = document.getElementById('voteReadmit');
    var bS = document.getElementById('voteSafe');
    var pR = document.getElementById('voteReadmitPct');
    var pS = document.getElementById('voteSafePct');
    if (bR) { bR.style.width = rPct + '%'; bR.textContent = rC; }
    if (bS) { bS.style.width = sPct + '%'; bS.textContent = sC; }
    if (pR) pR.textContent = rPct + '%';
    if (pS) pS.textContent = sPct + '%';
  }, 50);
}

// ── LR: S-curve + live patient dot; C=steepness, iterations shown ──
var _lrRAF, _lrSteep = 0.4;
function _drawLR() {
  var canvas = document.getElementById('lrCanvas'); if (!canvas) return;
  var C = +(document.getElementById('lrC').value || 5);
  var iterEl = document.getElementById('lrIter');
  var iter = iterEl ? Math.max(100, Math.min(2000, +iterEl.value || 1000)) : 1000;
  var targetSteep = 0.15 + (C / 10) * 2.0;
  var c = _sizeCanvas(canvas, 240); var ctx = c.ctx, W = c.W, H = c.H;
  var cInk = _css('--ink') || '#0d2340', cMuted = _css('--text-muted') || '#6b7280';
  var cCurve = _css('--primary') || '#1A6B9A';
  var cText = _css('--text-primary') || cInk;
  var cBad = _css('--bad') || '#dc2626', cGood = _css('--good') || '#16a34a';
  if (_lrRAF) cancelAnimationFrame(_lrRAF);
  function frame() {
    _lrSteep += (targetSteep - _lrSteep) * 0.12;
    ctx.clearRect(0, 0, W, H);
    var m = 52, pw = W - m * 2, ph = H - m * 2;
    // Axes
    ctx.strokeStyle = cMuted; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(m, m - 8); ctx.lineTo(m, H - m); ctx.lineTo(W - m + 8, H - m); ctx.stroke();
    // Axis labels
    ctx.fillStyle = cMuted; ctx.font = '10px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText('100%', m - 4, m + 4); ctx.fillText('50%', m - 4, m + ph / 2 + 4); ctx.fillText('0%', m - 4, H - m + 4);
    ctx.textAlign = 'center';
    ctx.fillText('Ejection Fraction (%)', m + pw / 2, H - m + 20);
    ctx.save(); ctx.translate(m - 40, m + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Readmission Risk', 0, 0); ctx.restore();
    // Low/High EF labels
    ctx.textAlign = 'left'; ctx.fillText('Low EF', m, H - m + 20);
    ctx.textAlign = 'right'; ctx.fillText('High EF', W - m, H - m + 20);
    // Danger zone label
    ctx.globalAlpha = .3;
    ctx.fillStyle = cBad; ctx.fillRect(m, m, pw / 2, ph);
    ctx.fillStyle = cGood; ctx.fillRect(m + pw / 2, m, pw / 2, ph);
    ctx.globalAlpha = 1;
    // 50% line
    ctx.setLineDash([4, 4]); ctx.strokeStyle = cMuted; ctx.lineWidth = 1; ctx.globalAlpha = .4;
    ctx.beginPath(); ctx.moveTo(m, m + ph / 2); ctx.lineTo(W - m, m + ph / 2); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // Gradient under S-curve
    var grad = ctx.createLinearGradient(0, m, 0, H - m);
    grad.addColorStop(0, 'rgba(220,38,38,.18)'); grad.addColorStop(.5, 'rgba(150,150,150,.04)'); grad.addColorStop(1, 'rgba(22,163,74,.12)');
    function sig(t) { return 1 / (1 + Math.exp(-_lrSteep * t)); }
    ctx.beginPath();
    for (var i = 0; i <= 100; i++) { var t = i / 100 * 10 - 5, p = sig(t); if (i === 0) ctx.moveTo(m + i / 100 * pw, m + ph * (1 - p)); else ctx.lineTo(m + i / 100 * pw, m + ph * (1 - p)); }
    ctx.lineTo(W - m, H - m); ctx.lineTo(m, H - m); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    // S-curve line (use --primary for visibility in dark themes like Neon)
    ctx.strokeStyle = cCurve; ctx.lineWidth = 3;
    ctx.beginPath();
    for (var i = 0; i <= 100; i++) { var t = i / 100 * 10 - 5, p = sig(t); if (i === 0) ctx.moveTo(m + i / 100 * pw, m + ph * (1 - p)); else ctx.lineTo(m + i / 100 * pw, m + ph * (1 - p)); }
    ctx.stroke();
    // Patient at x=0.30 (EF=30%)
    var ef = .30, tef = ef * 10 - 5, pef = sig(tef);
    var ppx = m + ef * pw, ppy = m + ph * (1 - pef);
    ctx.beginPath(); ctx.arc(ppx, ppy, 9, 0, 2 * Math.PI);
    ctx.fillStyle = cBad; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = 'bold 11px system-ui'; ctx.fillStyle = cText; ctx.textAlign = 'left';
    ctx.fillText('EF=30% → risk ' + (pef * 100).toFixed(0) + '%', ppx + 13, ppy - 7);
    // Second patient at EF=60%
    var ef2 = .60, tef2 = ef2 * 10 - 5, pef2 = sig(tef2);
    var ppx2 = m + ef2 * pw, ppy2 = m + ph * (1 - pef2);
    ctx.beginPath(); ctx.arc(ppx2, ppy2, 9, 0, 2 * Math.PI);
    ctx.fillStyle = cGood; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = cText;
    ctx.fillText('EF=60% → risk ' + (pef2 * 100).toFixed(0) + '%', ppx2 + 13, ppy2 - 7);
    ctx.font = '10px system-ui'; ctx.fillStyle = cMuted; ctx.textAlign = 'right';
    ctx.fillText('Max iterations: ' + iter, W - 8, H - 8);
    if (Math.abs(targetSteep - _lrSteep) > .005) _lrRAF = requestAnimationFrame(frame);
  }
  frame();
}

// ── NAIVE BAYES: Waterfall probability chart showing each feature's contribution ──
// Visual logic: each bar shows that ONE feature's independent P(Readmit|feature=value)
// Final bar shows the combined result (multiplicative Bayes combination)
var _NB = [
  { n: 'Base Rate', val: 33, dir: 0, imp: '33% of all patients are readmitted' },
  { n: 'EF = 20%', val: 78, dir: +1, imp: 'Very low EF strongly predicts readmission' },
  { n: 'Creatinine = 2.1', val: 64, dir: +1, imp: 'Elevated kidney marker increases risk' },
  { n: 'Age = 71', val: 54, dir: +1, imp: 'Older age moderately increases risk' },
  { n: 'Sodium = 136', val: 45, dir: -1, imp: 'Normal sodium slightly reduces risk' },
  { n: 'Non-smoker', val: 29, dir: -1, imp: 'Not smoking significantly reduces risk' },
];
function _drawNB() {
  var wrap = document.getElementById('nbBars'); if (!wrap) return;
  // Combined probability: naive formula P(R|all) ∝ ∏P(x|R)/∏P(x|S)
  // For demo, we just show the bars and a summary
  var combined = 0.74; // simulated combined probability
  var html = _NB.map(function (f, i) {
    var cls = f.dir > 0 ? 'inc' : f.dir < 0 ? 'dec' : '';
    var bgcls = f.dir === 0 ? 'style="background:var(--text-muted)"' : '';
    var arrow = f.dir > 0 ? '↑ ' : f.dir < 0 ? '↓ ' : '';
    return '<div class="pr-item">'
      + '<div class="pr-hdr">'
      + '<span class="pr-feat">' + f.n + '</span>'
      + '<span class="pr-val">P = ' + f.val + '%</span>'
      + '</div>'
      + '<div class="pr-trk"><div class="pr-fil ' + cls + '" id="_nbf' + i + '" ' + bgcls + '></div></div>'
      + '<div class="pr-imp">' + arrow + f.imp + '</div>'
      + '</div>';
  }).join('');
  // Final combined bar
  html += '<div class="pr-item" style="border-color:var(--primary);margin-top:4px;">'
    + '<div class="pr-hdr"><span class="pr-feat" style="color:var(--primary)">Combined Naïve Bayes Result</span>'
    + '<span class="pr-val" style="color:var(--primary);font-weight:700;">P = ' + (combined * 100).toFixed(0) + '%</span></div>'
    + '<div class="pr-trk"><div class="pr-fil inc" id="_nbfinal"></div></div>'
    + '<div class="pr-imp">Final readmission risk estimate</div>'
    + '</div>';
  wrap.innerHTML = html;
  _NB.forEach(function (f, i) {
    setTimeout(function () { var el = document.getElementById('_nbf' + i); if (el) el.style.width = f.val + '%'; }, 80 + i * 120);
  });
  setTimeout(function () { var el = document.getElementById('_nbfinal'); if (el) el.style.width = (combined * 100) + '%'; }, 80 + _NB.length * 120);
}

// ── INIT ──
_showAlgo('knn');
window.addEventListener('resize', function () { clearTimeout(window._p8T); window._p8T = setTimeout(_redrawActive, 150); });

// ── AUTO-RETRAIN SIMULATION ───────────────────────────────────────
// ── AUTO-RETRAIN SIMULATION ───────────────────────────────────────
let retrainTimer;
function triggerRetrain() {
  if (!document.getElementById('autoRetrain')?.checked) return;
  const activeModel = document.querySelector('.model-tab.active')?.dataset.model || 'knn';

  // Disable auto-retrain for models with multiple dual-dependent sliders
  if (activeModel === 'rf' || activeModel === 'lr') return;

  clearTimeout(retrainTimer);
  const ts = document.getElementById('trainingStatus');
  const tm = document.getElementById('trainingMsg');

  if (ts && tm) {
    ts.style.display = 'block';
    tm.textContent = `Auto-retraining ${activeModel.toUpperCase()}...`;
  }

  retrainTimer = setTimeout(() => {
    doRealTraining(activeModel);
  }, 900);
}

async function doRealTraining(activeModel) {
  const ts = document.getElementById('trainingStatus');
  const tm = document.getElementById('trainingMsg');

  const step4Banner = document.getElementById('step4ReadyBanner');
  if (step4Banner) step4Banner.style.display = 'none';

  let params = {};
  if (activeModel === 'knn') {
    params.k = document.getElementById('knnK')?.value || 5;
    params.dist = document.getElementById('knnDist')?.value || 'euclidean';
  } else if (activeModel === 'svm') {
    params.kernel = document.getElementById('svmKernel')?.value || 'rbf';
    const v = +(document.getElementById('svmC')?.value || 5);
    params.c = parseFloat((Math.pow(10, (v - 5) / 2)).toFixed(3));
  } else if (activeModel === 'dt') {
    params.depth = document.getElementById('dtDepth')?.value || 5;
    params.criterion = document.querySelector('#params-dt select')?.value || "gini";
  } else if (activeModel === 'rf') {
    params.trees = document.getElementById('rfTrees')?.value || 100;
    params.depth = document.getElementById('rfDepth')?.value || 10;
  } else if (activeModel === 'lr') {
    const v = +(document.getElementById('lrC')?.value || 5);
    params.c = parseFloat((Math.pow(10, (v - 5) / 2)).toFixed(3));
    params.iter = document.getElementById('lrIter')?.value || 1000;
  }

  let prepData;
  try {
    const d = sessionStorage.getItem('healthai_preprocessed');
    prepData = d ? JSON.parse(d) : null;
  } catch (e) { }

  if (!prepData || !prepData.trainRows || prepData.trainRows.length === 0) {
    showGlobalPopup({
      title: 'Action required',
      message: 'No preprocessed data found. Please complete Step 2 (Data Loading) and Step 3 (Preparation) first.',
      variant: 'bad',
    });
    return;
  }

  const payload = {
    trainRows: prepData.trainRows,
    testRows: prepData.testRows,
    features: prepData.features,
    targetColumn: prepData.target,
    modelType: activeModel,
    params: params
  };

  ts.style.display = 'block';
  tm.textContent = `Training ${activeModel.toUpperCase()} on ${prepData.trainRows.length} patients…`;
  const trainBtn = document.getElementById('trainBtn');
  const compareBtn = document.getElementById('addCompare');
  if (trainBtn) trainBtn.disabled = true;
  if (compareBtn) compareBtn.disabled = true;

  try {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const apiBase = isLocal ? 'http://127.0.0.1:8000' : 'https://healthai-juniorengineers-1.onrender.com';

    const res = await fetch(apiBase + '/api/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'API Error');
    }

    const data = await res.json();
    console.log('RAW train response:', data);
    console.log('perfect_score value:', data.perfect_score);
    console.log('typeof perfect_score:', typeof data.perfect_score);

    ts.style.display = 'none';

    const tab = document.querySelector(`.model-tab[data-model="${activeModel}"]`);
    if (tab) tab.classList.add('trained');

    const tbody = document.getElementById('currentModelBody');
    if (tbody) tbody.innerHTML = ''; // Ensure only 1 record

    const tr = document.createElement('tr');
    tr.dataset.modelId = activeModel;
    // Store accuracy as numeric data attribute so Step 5 can easily find the max
    tr.dataset.accuracy = parseFloat(data.accuracy) || 0;
    tr.dataset.precision = data.precision || '0%';
    tr.dataset.f1 = data.f1_score || '0%';
    tr.dataset.tn = data.tn || 0;
    tr.dataset.fp = data.fp || 0;
    tr.dataset.fn = data.fn || 0;
    tr.dataset.tp = data.tp || 0;
    tr.dataset.rocPoints = JSON.stringify(data.roc_points || []);

    // Add Overfitting metadata
    tr.dataset.overfitSuspected = data.overfit_suspected || false;
    tr.dataset.perfectScore = data.perfect_score || false;
    tr.dataset.cvMean = data.cv_mean || 0;
    tr.dataset.cvStd = data.cv_std || 0;
    tr.dataset.overfitReason = data.overfit_reason || '';

    try {
      const reg = JSON.parse(sessionStorage.getItem('healthai_explain_registry') || '{}');
      reg[data.model_name_display] = {
        feature_importance: data.feature_importance || [],
        test_explanations: data.test_explanations || [],
        positive_class: data.positive_class || '',
        fairness: data.fairness || null
      };
      sessionStorage.setItem('healthai_explain_registry', JSON.stringify(reg));
      tr.setAttribute('data-explain-key', data.model_name_display);
    } catch (e) { }

    const sensMatches = data.sensitivity.match(/\d+/);
    const sensVal = sensMatches ? parseInt(sensMatches[0], 10) : 0;
    const sensCls = sensVal >= 70 ? 'good' : sensVal >= 50 ? 'warn' : 'bad';
    tr.innerHTML = `<td>${data.model_name_display}</td><td>${data.accuracy}</td><td class="delta ${sensCls}">${data.sensitivity}</td><td>${data.specificity}</td><td>${data.auc}</td><td></td>`;
    if (tbody) tbody.appendChild(tr);

  } catch (e) {
    console.error(e);
    showGlobalPopup({
      title: 'Training failed',
      message: "Failed to train model. Is the Python backend running?\n\n" + (e && e.message ? e.message : String(e)),
      variant: 'bad',
    });
    ts.style.display = 'none';
  } finally {
    if (trainBtn) trainBtn.disabled = false;
    if (compareBtn) compareBtn.disabled = false;
  }
}

document.getElementById('trainBtn').addEventListener('click', () => {
  const activeModel = document.querySelector('.model-tab.active')?.dataset.model || 'knn';
  doRealTraining(activeModel);
});

document.getElementById('addCompare').addEventListener('click', () => {
  function showWarningBanner(msg) {
    let warnDiv = document.getElementById('compareWarningBanner');
    if (!warnDiv) {
      warnDiv = document.createElement('div');
      warnDiv.id = 'compareWarningBanner';
      warnDiv.className = 'banner bad';
      warnDiv.style.marginTop = '10px';
      warnDiv.style.marginBottom = '10px';
      const cBody = document.getElementById('compareCard');
      if (cBody && cBody.parentNode) {
        cBody.parentNode.insertBefore(warnDiv, cBody);
      }
    }
    warnDiv.innerHTML = `<div class="banner-icon">🚫</div><div><b>Action Required:</b> ${msg}</div>`;
    warnDiv.style.display = 'flex';
    setTimeout(() => { warnDiv.style.display = 'none'; }, 4000);
  }

  const currentBody = document.getElementById('currentModelBody');
  const currentRow = currentBody ? currentBody.querySelector('tr') : null;

  if (!currentRow || currentRow.id === 'emptyCurrentModelRow') {
    showWarningBanner("You haven't trained a model yet. Please train a model first before comparing.");
    return;
  }

  const compareBody = document.getElementById('compareBody');
  const emptyCompareRow = document.getElementById('emptyCompareRow');
  if (emptyCompareRow) emptyCompareRow.remove();

  const existingRows = compareBody.querySelectorAll('tr');
  let duplicate = false;
  existingRows.forEach(row => {
    if (row.dataset.originalHtml === currentRow.innerHTML) {
      duplicate = true;
    }
  });

  if (duplicate) {
    showWarningBanner("This exact model (with the same parameters and results) is already in the comparison table.");
    return;
  }

  const clone = currentRow.cloneNode(true);
  clone.dataset.originalHtml = currentRow.innerHTML;

  const actionTd = clone.querySelector('td:last-child');
  if (actionTd) {
    actionTd.innerHTML = `<button class="btn" style="padding: 4px 8px; font-size: 11px; border: 1px solid var(--bad); color: var(--bad); background: transparent;" title="Remove this model">✕</button>`;
    actionTd.querySelector('button').addEventListener('click', function () {
      clone.remove();
      if (compareBody.querySelectorAll('tr').length === 0) {
        compareBody.innerHTML = `<tr id="emptyCompareRow"><td colspan="6" style="text-align:center; color:var(--text-muted, #888); padding: 16px;">Train a model to view comparison results.</td></tr>`;
      }
    });
  }

  compareBody.appendChild(clone);

  const warnDiv = document.getElementById('compareWarningBanner');
  if (warnDiv) warnDiv.style.display = 'none';
});

// ── ETHICS CHECKLIST ──────────────────────────────────────────────
function updateChecklistProgress() {
  const checklist = document.getElementById('euChecklist');
  if (!checklist) return;
  const total = checklist.querySelectorAll('.check-item').length;
  const checked = checklist.querySelectorAll('.check-item.checked').length;
  const pct = Math.round((checked / total) * 100);

  let progContainer = document.getElementById('euChecklistProgress');
  if (!progContainer) {
    progContainer = document.createElement('div');
    progContainer.id = 'euChecklistProgress';
    progContainer.style.margin = '0 0 16px 0';
    // Insert after card title
    const title = checklist.parentNode.querySelector('.card-title');
    title.after(progContainer);
  }

  progContainer.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px; color:var(--muted); font-weight:600; letter-spacing:0.5px;">
         <span>COMPLIANCE PROGRESS</span>
         <span style="color: ${pct === 100 ? 'var(--good)' : 'inherit'}; font-weight:700;">${checked} / ${total} Met (${pct}%)</span>
      </div>
      <div style="width:100%; height:8px; background:var(--line); border-radius:4px; overflow:hidden;">
         <div style="height:100%; width:${pct}%; background: ${pct === 100 ? 'var(--good)' : 'var(--primary)'}; transition: width 0.4s ease, background 0.4s ease;"></div>
      </div>
   `;
}

function toggleCheck(el) {
  el.classList.toggle('checked');
  const box = el.querySelector('.check-box');
  box.textContent = el.classList.contains('checked') ? '✓' : '';
  updateChecklistProgress();
}
window.toggleCheck = toggleCheck;

// ── STEP 6: Clinical display names & labels (charts + waterfall) ────────

function escapeHtmlStep6(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function riskTierFromPercent(pct) {
  if (pct >= 65) return 'High Risk';
  if (pct >= 35) return 'Moderate Risk';
  return 'Low Risk';
}

function patientLetterFromIndex(idx) {
  const i = 0 | idx;
  if (i < 0 || i > 25) return '?';
  return String.fromCharCode(65 + i);
}

function parseClinicalNum(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return null;
  if (typeof rawValue === 'boolean') return rawValue ? 1 : 0;
  const s = String(rawValue).replace(/,/g, '').trim();
  if (s === '' || s === 'N/A') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtClinicalDisplay(val) {
  if (val === undefined || val === null || val === '') return 'N/A';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? String(val) : (Math.abs(val) >= 0.01 ? val.toFixed(2) : val.toFixed(4));
  }
  return String(val).substring(0, 32);
}

const clinicalNames = {
  sys_bp_avg: 'Average Systolic BP',
  serum_creat_max: 'Peak Serum Creatinine',
  age_at_admission: 'Patient Age at Admission',
  bmi_calc: 'Body Mass Index (BMI)',
  hr_avg_24h: '24h Average Heart Rate',
  wbc_count_peak: 'Peak White Blood Cell Count',
  hba1c_level: 'HbA1c Level',
  prev_admits_1yr: 'Previous Admissions (1 Year)',
  chol_ldl: 'LDL Cholesterol',
  resp_rate_avg: 'Average Respiratory Rate',
  o2_sat_min: 'Minimum O2 Saturation',
  temp_max: 'Maximum Body Temperature',
  gcs_score: 'Glasgow Coma Scale',
  age: 'Patient Age (years)',
  Age: 'Patient Age (years)',
  anaemia: 'Anaemia (Present)',
  creatinine_phosphokinase: 'Creatine Phosphokinase (CPK)',
  diabetes: 'Diabetes Mellitus (Present)',
  ejection_fraction: 'Left Ventricular Ejection Fraction',
  high_blood_pressure: 'Hypertension (Present)',
  platelets: 'Platelet Count',
  serum_creatinine: 'Serum Creatinine',
  serum_sodium: 'Serum Sodium',
  sex: 'Sex',
  smoking: 'Smoking Status',
  time: 'Follow-up Time (days)',
  DEATH_EVENT: 'Death During Follow-up',
  Pregnancies: 'Number of Pregnancies',
  Glucose: 'Fasting Glucose Level',
  BloodPressure: 'Diastolic Blood Pressure',
  SkinThickness: 'Triceps Skin Fold Thickness',
  Insulin: 'Serum Insulin Level',
  BMI: 'Body Mass Index (BMI)',
  DiabetesPedigreeFunction: 'Diabetes Pedigree Score',
  Outcome: 'Diabetes Outcome',
  id: 'Record ID',
  gender: 'Sex',
  hypertension: 'Hypertension (Present)',
  heart_disease: 'Heart Disease (Present)',
  ever_married: 'Ever Married',
  work_type: 'Work Type',
  Residence_type: 'Residence Type',
  avg_glucose_level: 'Average Blood Glucose Level',
  bmi: 'Body Mass Index (BMI)',
  smoking_status: 'Smoking Status',
  stroke: 'Stroke (Outcome)',
  Image_Index: 'Image Index',
  Finding_Label: 'Radiology Finding Label',
  Bbox_x: 'Bounding Box X',
  Bbox_y: 'Bounding Box Y',
  Bbox_w: 'Bounding Box Width',
  Bbox_h: 'Bounding Box Height',
  bp: 'Blood Pressure (mmHg)',
  sg: 'Urine Specific Gravity',
  al: 'Urine Albumin',
  su: 'Urine Sugar',
  rbc: 'Red Blood Cells (Urine)',
  pc: 'Pus Cells (Urine)',
  pcc: 'Pus Cell Clumps',
  ba: 'Bacteria (Urine)',
  bgr: 'Blood Glucose (Random)',
  bu: 'Blood Urea',
  sc: 'Serum Creatinine',
  sod: 'Serum Sodium',
  pot: 'Serum Potassium',
  hemo: 'Hemoglobin',
  pcv: 'Packed Cell Volume',
  wbcc: 'White Blood Cell Count',
  rbcc: 'Red Blood Cell Count',
  htn: 'Hypertension (Present)',
  dm: 'Diabetes Mellitus (Present)',
  cad: 'Coronary Artery Disease (Present)',
  appet: 'Appetite',
  pe: 'Pedal Edema',
  ane: 'Anaemia (Present)',
  class: 'CKD Classification',
  classification: 'CKD Classification',
  encounter_id: 'Encounter ID',
  patient_nbr: 'Patient Number',
  race: 'Race / Ethnicity',
  weight: 'Weight (lb)',
  admission_type_id: 'Admission Type',
  discharge_disposition_id: 'Discharge Disposition',
  admission_source_id: 'Admission Source',
  time_in_hospital: 'Length of Stay (days)',
  payer_code: 'Payer Code',
  medical_specialty: 'Medical Specialty',
  num_lab_procedures: 'Number of Lab Procedures',
  num_procedures: 'Number of Procedures',
  num_medications: 'Number of Medications',
  number_outpatient: 'Outpatient Visits (Prior Year)',
  number_emergency: 'Emergency Visits (Prior Year)',
  number_inpatient: 'Inpatient Admissions (Prior Year)',
  diag_1: 'Primary Diagnosis (ICD)',
  diag_2: 'Secondary Diagnosis (ICD)',
  diag_3: 'Tertiary Diagnosis (ICD)',
  number_diagnoses: 'Number of Diagnoses',
  max_glu_serum: 'Maximum Serum Glucose (Categorical)',
  A1Cresult: 'HbA1c Result (Categorical)',
  metformin: 'Metformin Use',
  repaglinide: 'Repaglinide Use',
  nateglinide: 'Nateglinide Use',
  chlorpropamide: 'Chlorpropamide Use',
  glimepiride: 'Glimepiride Use',
  acetohexamide: 'Acetohexamide Use',
  glipizide: 'Glipizide Use',
  glyburide: 'Glyburide Use',
  tolbutamide: 'Tolbutamide Use',
  pioglitazone: 'Pioglitazone Use',
  rosiglitazone: 'Rosiglitazone Use',
  acarbose: 'Acarbose Use',
  miglitol: 'Miglitol Use',
  troglitazone: 'Troglitazone Use',
  tolazamide: 'Tolazamide Use',
  examide: 'Examide Use',
  citoglipton: 'Citoglipton Use',
  insulin: 'Insulin Use',
  'glyburide-metformin': 'Glyburide–Metformin Use',
  'glipizide-metformin': 'Glipizide–Metformin Use',
  'glimepiride-pioglitazone': 'Glimepiride–Pioglitazone Use',
  'metformin-rosiglitazone': 'Metformin–Rosiglitazone Use',
  'metformin-pioglitazone': 'Metformin–Pioglitazone Use',
  change: 'Medication Change',
  diabetesMed: 'Diabetes Medication (Any)',
  readmitted: '30-Day Readmission',
  HR: 'Heart Rate',
  O2Sat: 'Oxygen Saturation',
  Temp: 'Body Temperature',
  SBP: 'Systolic Blood Pressure',
  MAP: 'Mean Arterial Pressure',
  DBP: 'Diastolic Blood Pressure',
  Resp: 'Respiratory Rate',
  EtCO2: 'End-Tidal CO2',
  BaseExcess: 'Base Excess',
  HCO3: 'Serum Bicarbonate',
  FiO2: 'Fraction of Inspired Oxygen',
  pH: 'Arterial pH',
  PaCO2: 'Arterial PaCO2',
  SaO2: 'Arterial Oxygen Saturation',
  AST: 'Aspartate Aminotransferase',
  BUN: 'Blood Urea Nitrogen',
  Alkalinephos: 'Alkaline Phosphatase',
  Calcium: 'Serum Calcium',
  Chloride: 'Serum Chloride',
  Creatinine: 'Serum Creatinine',
  Bilirubin_direct: 'Direct Bilirubin',
  Lactate: 'Serum Lactate',
  Magnesium: 'Serum Magnesium',
  Phosphate: 'Serum Phosphate',
  Potassium: 'Serum Potassium',
  Bilirubin_total: 'Total Bilirubin',
  TroponinI: 'Troponin I',
  Hct: 'Hematocrit',
  Hgb: 'Hemoglobin',
  PTT: 'Partial Thromboplastin Time',
  WBC: 'White Blood Cell Count',
  Fibrinogen: 'Fibrinogen',
  Platelets: 'Platelet Count',
  Gender: 'Sex',
  Unit1: 'ICU Unit Type 1',
  Unit2: 'ICU Unit Type 2',
  HospAdmTime: 'Hospital Admission Time',
  ICULOS: 'ICU Length of Stay',
  SepsisLabel: 'Sepsis (Outcome)',
  lesion_id: 'Lesion ID',
  image_id: 'Image ID',
  dx: 'Diagnosis Code',
  dx_type: 'Diagnosis Type',
  localization: 'Lesion Location',
  pelvic_incidence: 'Pelvic Incidence Angle',
  pelvic_tilt: 'Pelvic Tilt Angle',
  lumbar_lordosis_angle: 'Lumbar Lordosis Angle',
  sacral_slope: 'Sacral Slope Angle',
  pelvic_radius: 'Pelvic Radius',
  degree_spondylolisthesis: 'Degree of Spondylolisthesis',
  Hemoglobin: 'Hemoglobin',
  MCH: 'Mean Corpuscular Hemoglobin (MCH)',
  MCHC: 'Mean Corpuscular Hemoglobin Concentration',
  MCV: 'Mean Corpuscular Volume (MCV)',
  Result: 'Anaemia Classification',
  TB: 'Total Bilirubin',
  DB: 'Direct Bilirubin',
  Alkphos: 'Alkaline Phosphatase',
  Sgpt: 'Alanine Aminotransferase (ALT)',
  Sgot: 'Aspartate Aminotransferase (AST)',
  TP: 'Total Protein',
  ALB: 'Serum Albumin',
  'A/G_Ratio': 'Albumin/Globulin Ratio',
  Selector: 'Liver Dataset Group',
  ID: 'Record ID',
  Diagnosis: 'Tumor Diagnosis',
  AGE: 'Patient Age (years)',
  PackHistory: 'Smoking Pack-Years History',
  COPDSEVERITY: 'COPD Severity',
  MWT1: 'Six-Minute Walk Test (Trial 1)',
  MWT2: 'Six-Minute Walk Test (Trial 2)',
  MWT1Best: 'Best Six-Minute Walk Distance',
  FEV1: 'Forced Expiratory Volume (1s)',
  FEV1PRED: 'Predicted FEV1',
  FVC: 'Forced Vital Capacity',
  FVCPRED: 'Predicted FVC',
  CAT: 'COPD Assessment Test Score',
  HAD: 'Hospital Anxiety and Depression Score',
  SGRQ: 'St George Respiratory Questionnaire',
  AGEquartiles: 'Age Quartile',
  copd: 'COPD (Present)',
  muscular: 'Muscular Disorder',
  AtrialFib: 'Atrial Fibrillation',
  IHD: 'Ischemic Heart Disease',
  'baseline value': 'CTG Baseline FHR',
  accelerations: 'Fetal Heart Rate Accelerations',
  fetal_movement: 'Fetal Movements',
  uterine_contractions: 'Uterine Contractions',
  light_decelerations: 'Light Decelerations',
  severe_decelerations: 'Severe Decelerations',
  prolongued_decelerations: 'Prolonged Decelerations',
  abnormal_short_term_variability: 'Abnormal Short-Term Variability',
  mean_value_of_short_term_variability: 'Mean Short-Term Variability',
  percentage_of_time_with_abnormal_long_term_variability: 'Time with Abnormal Long-Term Variability',
  mean_value_of_long_term_variability: 'Mean Long-Term Variability',
  histogram_width: 'FHR Histogram Width',
  histogram_min: 'FHR Histogram Minimum',
  histogram_max: 'FHR Histogram Maximum',
  histogram_number_of_peaks: 'FHR Histogram Peaks',
  histogram_number_of_zeroes: 'FHR Histogram Zeroes',
  histogram_mode: 'FHR Histogram Mode',
  histogram_mean: 'FHR Histogram Mean',
  histogram_median: 'FHR Histogram Median',
  histogram_variance: 'FHR Histogram Variance',
  histogram_tendency: 'FHR Histogram Tendency',
  fetal_health: 'Fetal Health Category',
  severity_grade: 'Retinopathy Severity Grade',
  name: 'Subject Identifier',
  'MDVP:Fo(Hz)': 'Fundamental Vocal Frequency Fo (Hz)',
  'MDVP:Fhi(Hz)': 'High Vocal Frequency Fhi (Hz)',
  'MDVP:Flo(Hz)': 'Low Vocal Frequency Flo (Hz)',
  'MDVP:Jitter(%)': 'Jitter (%)',
  'MDVP:Jitter(Abs)': 'Absolute Jitter',
  'MDVP:RAP': 'Relative Average Perturbation (RAP)',
  'MDVP:PPQ': 'Five-Period Perturbation Quotient (PPQ)',
  'Jitter:DDP': 'Jitter DDP',
  'MDVP:Shimmer': 'Shimmer',
  'MDVP:Shimmer(dB)': 'Shimmer (dB)',
  'Shimmer:APQ3': 'Shimmer APQ3',
  'Shimmer:APQ5': 'Shimmer APQ5',
  'MDVP:APQ': 'Amplitude Perturbation Quotient',
  'Shimmer:DDA': 'Shimmer DDA',
  NHR: 'Noise-to-Harmonics Ratio',
  HNR: 'Harmonics-to-Noise Ratio',
  status: 'Parkinson Status',
  RPDE: 'Recurrence Period Density Entropy',
  DFA: 'Detrended Fluctuation Analysis',
  spread1: 'Nonlinear Spread Measure 1',
  spread2: 'Nonlinear Spread Measure 2',
  D2: 'Correlation Dimension D2',
  PPE: 'Pitch Period Entropy',
  Timestamp: 'Survey Timestamp',
  Country: 'Country',
  state: 'State / Region',
  self_employed: 'Self Employed',
  family_history: 'Family History of Mental Illness',
  treatment: 'Sought Treatment',
  work_interfere: 'Work Interference (Mental Health)',
  no_employees: 'Company Size',
  remote_work: 'Remote Work',
  tech_company: 'Tech Company',
  benefits: 'Mental Health Benefits',
  care_options: 'Care Options',
  wellness_program: 'Wellness Program',
  seek_help: 'Seek Help for Mental Health',
  anonymity: 'Anonymity at Work',
  leave: 'Medical Leave Ease',
  mental_health_consequence: 'Mental Health Disclosure Consequence',
  phys_health_consequence: 'Physical Health Disclosure Consequence',
  coworkers: 'Coworker Discussion Comfort',
  supervisor: 'Supervisor Discussion Comfort',
  mental_health_interview: 'Mental Health Interview Comfort',
  phys_health_interview: 'Physical Health Interview Comfort',
  mental_vs_physical: 'Mental vs Physical Health Emphasis',
  obs_consequence: 'Observed Consequences',
  comments: 'Free-text Comments',
  Sex: 'Sex',
  Height: 'Height (cm)',
  Weight: 'Weight (kg)',
  QRS_duration: 'QRS Duration',
  PR_interval: 'PR Interval',
  QT_interval: 'QT Interval',
  T_interval: 'T Interval',
  P_interval: 'P Interval',
  QRS_angle: 'QRS Axis Angle',
  T_angle: 'T Axis Angle',
  P_angle: 'P Axis Angle',
  QRST_angle: 'QRST Axis Angle',
  J_angle: 'J Angle',
  Heart_rate: 'Heart Rate',
  Class: 'Clinical Class (Outcome)',
  Biopsy: 'Cervical Biopsy Result',
  'Number of sexual partners': 'Number of Sexual Partners',
  'First sexual intercourse': 'Age at First Sexual Intercourse',
  'Num of pregnancies': 'Number of Pregnancies',
  Smokes: 'Smoking Status',
  'Smokes (years)': 'Smoking Duration (years)',
  'Smokes (packs/year)': 'Smoking (packs/year)',
  'Hormonal Contraceptives': 'Hormonal Contraceptive Use',
  'Hormonal Contraceptives (years)': 'Hormonal Contraceptive Duration',
  IUD: 'Intrauterine Device Use',
  'IUD (years)': 'IUD Duration (years)',
  STDs: 'History of STDs',
  'STDs (number)': 'Number of STDs',
  'STDs:condylomatosis': 'STD: Condylomatosis',
  'STDs:cervical condylomatosis': 'STD: Cervical Condylomatosis',
  'STDs:vaginal condylomatosis': 'STD: Vaginal Condylomatosis',
  'STDs:vulvo-perineal condylomatosis': 'STD: Vulvo-perineal Condylomatosis',
  'STDs:syphilis': 'STD: Syphilis',
  'STDs:pelvic inflammatory disease': 'STD: Pelvic Inflammatory Disease',
  'STDs:genital herpes': 'STD: Genital Herpes',
  'STDs:molluscum contagiosum': 'STD: Molluscum Contagiosum',
  'STDs:AIDS': 'STD: AIDS',
  'STDs:HIV': 'STD: HIV',
  'STDs:Hepatitis B': 'STD: Hepatitis B',
  'STDs:HPV': 'STD: HPV',
  'STDs: Number of diagnosis': 'STD: Number of Diagnoses',
  'STDs: Time since first diagnosis': 'STD: Time Since First Diagnosis',
  'STDs: Time since last diagnosis': 'STD: Time Since Last Diagnosis',
  'Dx:Cancer': 'Diagnosis: Cancer',
  'Dx:CIN': 'Diagnosis: CIN',
  'Dx:HPV': 'Diagnosis: HPV',
  Dx: 'General Diagnosis Flag',
  Hinselmann: 'Hinselmann Test',
  Schiller: 'Schiller Test',
  Citology: 'Cytology Result',
  Attribute1: 'Thyroid Clinical Parameter 1',
  Attribute2: 'Thyroid Clinical Parameter 2',
  Attribute3: 'Thyroid Clinical Parameter 3',
  Attribute4: 'Thyroid Clinical Parameter 4',
  Attribute5: 'Thyroid Clinical Parameter 5'
};

function getClinicalName(rawName) {
  if (rawName == null || rawName === '') return '';
  const key = String(rawName);
  if (clinicalNames[key]) return clinicalNames[key];
  const w = /^(radius|texture|perimeter|area|smoothness|compactness|concavity|concave_points|symmetry|fractal_dimension)(\d)$/.exec(key);
  if (w) {
    const metric = {
      radius: 'Radius',
      texture: 'Texture',
      perimeter: 'Perimeter',
      area: 'Area',
      smoothness: 'Smoothness',
      compactness: 'Compactness',
      concavity: 'Concavity',
      concave_points: 'Concave Points',
      symmetry: 'Symmetry',
      fractal_dimension: 'Fractal Dimension'
    }[w[1]];
    const region = w[2] === '1' ? 'Mean' : (w[2] === '2' ? 'Standard Error' : 'Worst');
    return region + ' ' + metric + ' (Cell Nuclei)';
  }
  const att = /^att(\d+)$/.exec(key);
  if (att) return 'Retinal Clinical Feature ' + (parseInt(att[1], 10) + 1);
  const at = /^Attribute(\d+)$/.exec(key);
  if (at) return 'Thyroid Clinical Parameter ' + at[1];
  return key;
}

function clinicalLabel(feature, rawValue) {
  const fk = String(feature);
  const display = getClinicalName(feature);
  const num = parseClinicalNum(rawValue);
  const dv = fmtClinicalDisplay(rawValue);

  if (num === null && rawValue !== 0 && rawValue !== '0') {
    return display + ': ' + dv;
  }
  const n = num === null ? NaN : num;
  const L = fk.toLowerCase();

  if (fk === 'Glucose' || fk === 'avg_glucose_level' || fk === 'bgr' || L === 'glucose') {
    let desc = 'normal';
    if (n < 70) desc = 'low';
    else if (n <= 99) desc = 'normal';
    else if (n <= 125) desc = 'borderline high';
    else desc = 'very high';
    return display + ' — ' + desc + ' (' + dv + ' mg/dL)';
  }

  if (fk === 'BMI' || L === 'bmi' || fk === 'bmi_calc') {
    let desc = 'normal';
    if (n < 18.5) desc = 'underweight';
    else if (n <= 24.9) desc = 'normal';
    else if (n <= 29.9) desc = 'overweight';
    else desc = 'elevated–obese';
    return display + ' — ' + desc + ' (' + dv + ' kg/m²)';
  }

  if (fk === 'BloodPressure') {
    let desc = 'normal';
    if (n < 60) desc = 'low';
    else if (n <= 80) desc = 'normal';
    else if (n <= 90) desc = 'elevated';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' mmHg)';
  }

  if (fk === 'Insulin') {
    let desc = 'normal';
    if (n === 0) desc = 'not recorded';
    else if (n <= 25) desc = 'low';
    else if (n <= 166) desc = 'normal';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' μU/mL)';
  }

  if (fk === 'Pregnancies' || L === 'num of pregnancies' || fk === 'Num of pregnancies') {
    let desc = 'low';
    if (n === 0) desc = 'none';
    else if (n <= 4) desc = 'low';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ')';
  }

  if (fk === 'DiabetesPedigreeFunction') {
    let desc = 'moderate';
    if (n < 0.3) desc = 'low';
    else if (n <= 0.6) desc = 'moderate';
    else desc = 'high family risk';
    return display + ' — ' + desc + ' (' + dv + ')';
  }

  if (fk === 'SkinThickness') {
    let desc = 'normal';
    if (n === 0) desc = 'not recorded';
    else if (n <= 20) desc = 'low';
    else if (n <= 40) desc = 'normal';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' mm)';
  }

  if (fk === 'Age' || L === 'age') {
    return display + ' — Age ' + dv + ' years';
  }

  if (L === 'ejection_fraction') {
    let desc = 'preserved or better';
    if (n < 40) desc = 'markedly reduced';
    else if (n <= 50) desc = 'mildly reduced';
    return display + ' — ' + desc + ' (' + dv + '%)';
  }

  if (L === 'serum_creatinine' || fk === 'Creatinine' || fk === 'sc') {
    let desc = 'normal';
    if (n < 1.2) desc = 'normal';
    else if (n <= 2.0) desc = 'elevated';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' mg/dL)';
  }

  if (fk === 'Chloride' || L === 'chloride') {
    let desc = 'normal';
    if (n < 98) desc = 'low';
    else if (n <= 106) desc = 'normal';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' mEq/L)';
  }

  if (L === 'serum_sodium' || fk === 'sod' || fk === 'Sodium') {
    let desc = 'normal';
    if (n < 135) desc = 'low';
    else if (n <= 145) desc = 'normal';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' mEq/L)';
  }

  if (fk === 'Potassium' || fk === 'pot') {
    let desc = 'normal';
    if (n < 3.5) desc = 'low';
    else if (n <= 5.0) desc = 'normal';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' mEq/L)';
  }

  if (fk === 'bp' && L === 'bp') {
    let desc = 'normal';
    if (n < 90) desc = 'low';
    else if (n <= 120) desc = 'normal';
    else if (n <= 139) desc = 'elevated';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' mmHg systolic estimate)';
  }

  if (fk === 'Hemoglobin' || fk === 'hemo' || fk === 'Hgb') {
    let desc = 'normal';
    if (n < 12) desc = 'low';
    else if (n <= 16) desc = 'normal';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' g/dL)';
  }

  if (fk === 'MCH' || fk === 'MCHC' || fk === 'MCV') {
    return display + ': ' + dv;
  }

  if (fk === 'HR' || L === 'heart_rate') {
    let desc = 'normal';
    if (n < 60) desc = 'bradycardia';
    else if (n <= 100) desc = 'normal';
    else desc = 'tachycardia';
    return display + ' — ' + desc + ' (' + dv + ' bpm)';
  }

  if (fk === 'MAP') {
    let desc = 'typical';
    if (n < 65) desc = 'low (hypoperfusion risk)';
    else if (n <= 105) desc = 'typical';
    else desc = 'elevated';
    return display + ' — ' + desc + ' (' + dv + ' mmHg)';
  }

  if (fk === 'SBP' || fk === 'DBP') {
    let desc = 'normal';
    if (fk === 'SBP') {
      if (n < 90) desc = 'low';
      else if (n < 120) desc = 'normal';
      else if (n <= 139) desc = 'elevated';
      else desc = 'high';
    } else {
      if (n < 60) desc = 'low';
      else if (n <= 80) desc = 'normal';
      else if (n <= 90) desc = 'elevated';
      else desc = 'high';
    }
    return display + ' — ' + desc + ' (' + dv + ' mmHg)';
  }

  if (fk === 'O2Sat' || fk === 'SaO2') {
    let desc = 'normal';
    if (n < 90) desc = 'low';
    else if (n <= 95) desc = 'borderline';
    else desc = 'normal';
    return display + ' — ' + desc + ' (' + dv + '%)';
  }

  if (fk === 'Lactate') {
    let desc = 'normal';
    if (n < 2) desc = 'normal';
    else if (n <= 4) desc = 'elevated';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' mmol/L)';
  }

  if (fk === 'WBC' || fk === 'wbcc') {
    let desc = 'normal';
    if (n < 4) desc = 'low';
    else if (n <= 11) desc = 'normal';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' ×10⁹/L)';
  }

  if (fk === 'Platelets' || fk === 'platelets') {
    let desc = 'normal';
    if (n < 150) desc = 'low';
    else if (n <= 400) desc = 'normal';
    else desc = 'high';
    return display + ' — ' + desc + ' (' + dv + ' ×10⁹/L)';
  }

  if (fk === 'FEV1') {
    let desc = 'notable reduction';
    if (n >= 2.5) desc = 'near expected';
    else if (n >= 1.5) desc = 'mild-to-moderate';
    return display + ' — ' + desc + ' (' + dv + ' L)';
  }

  if (fk === 'FVC') {
    return display + ' — measured (' + dv + ' L)';
  }

  if (fk === 'TB' || fk === 'DB') {
    let desc = fk === 'TB' ? 'total bilirubin' : 'direct bilirubin';
    return display + ' — ' + desc + ' (' + dv + ' mg/dL)';
  }

  if (fk === 'hypertension' || fk === 'heart_disease' || fk === 'diabetes' || fk === 'anaemia' || fk === 'smoking' || fk === 'htn' || fk === 'dm' || fk === 'copd') {
    const on = n === 1 || n > 0;
    return display + ' — ' + (on ? 'present (1)' : 'absent (0)');
  }

  if (fk === 'pelvic_incidence' || fk === 'degree_spondylolisthesis') {
    return display + ' — measured (' + dv + '°)';
  }

  return display + ': ' + dv;
}

// ── STEP 6: Patient explanation (update on select) ───────────────────
var _patientData = {};

function updatePatientExplanation() {
  var sel = document.getElementById('caseSelect');
  var titleEl = document.getElementById('patientExplainTitle');
  var barsEl = document.getElementById('patientExplainBars');
  if (!sel || !titleEl || !barsEl) return;

  var id = sel.value;
  if (!id || !_patientData[id]) return;

  var d = _patientData[id];
  var letter = d.letter || '?';
  var tier = d.tierLabel || 'Risk';
  titleEl.textContent = 'Why Was Patient ' + letter + ' Flagged as ' + tier + '? (' + d.risk + '% probability)';

  barsEl.innerHTML = d.bars.map(function (b) {
    return '<div class="bar-row"><div class="bar-lbl" style="color:var(--' + (b.cls === 'bad' ? 'bad' : 'good') + ');">' + escapeHtmlStep6(b.lbl) + '</div>' +
      '<div class="bar-track"><div class="bar-fill ' + b.cls + '" style="width:' + b.w + '%"></div></div>' +
      '<div class="bar-val" style="color:var(--' + (b.cls === 'bad' ? 'bad' : 'good') + ');">' + escapeHtmlStep6(b.val) + '</div></div>';
  }).join('');

  var whatIfEl = document.getElementById('patientWhatIfBanner');
  if (whatIfEl && d.topFeatureDisplay) {
    var topName = d.topFeatureDisplay;
    whatIfEl.innerHTML = '<div class="banner-icon">💡</div><div><b>What-if:</b> If this patient\'s ' + escapeHtmlStep6(topName) + ' were in the normal range, the model\'s risk estimate could shift substantially. Use this view to explore — not to prescribe.</div>';
  }
}

function resolveExplainModelKey() {
  try {
    const reg = JSON.parse(sessionStorage.getItem('healthai_explain_registry') || '{}');
    if (window.activeStep5Model && reg[window.activeStep5Model]) return window.activeStep5Model;
    if (window.currentStep5Rows && window.currentStep5Rows.length) {
      for (let i = 0; i < window.currentStep5Rows.length; i++) {
        const tr = window.currentStep5Rows[i];
        const name = tr.querySelectorAll('td')[0]?.innerText;
        if (name && reg[name]) return name;
      }
    }
    const ks = Object.keys(reg);
    return ks.length ? ks[ks.length - 1] : null;
  } catch (e) {
    return null;
  }
}

function updatePatientExplanationFromModel() {
  try {
    const modelKey = resolveExplainModelKey();
    if (!modelKey) return;
    const reg = JSON.parse(sessionStorage.getItem('healthai_explain_registry') || '{}');
    const explain = reg[modelKey];
    if (!explain || !explain.test_explanations || !explain.test_explanations.length) return;

    _patientData = {};
    let selHtml = '';

    const formatVal = function (v) {
      if (v === undefined || v === null || v === '') return 'N/A';
      if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
      return String(v).substring(0, 24);
    };

    explain.test_explanations.forEach(function (pex, idx) {
      const pid = String(pex.patient_index);
      const risk = Math.round(pex.prob_positive);
      const tierLabel = riskTierFromPercent(risk);
      const letter = patientLetterFromIndex(idx);
      let contribs = (pex.contributions || []).slice();
      contribs.sort(function (a, b) {
        return Math.abs(b.impact || 0) - Math.abs(a.impact || 0);
      });
      const topFeat = contribs[0];
      const topFeatureDisplay = topFeat ? getClinicalName(topFeat.feature) : '';
      selHtml += '<option value="' + pid + '">Patient ' + letter + ' — ' + tierLabel + ' (' + risk + '%)</option>';

      let maxAbs = 0;
      contribs.forEach(function (c) {
        maxAbs = Math.max(maxAbs, Math.abs(c.impact || 0));
      });
      if (maxAbs < 1e-12) maxAbs = 1;

      const pBars = contribs.map(function (c) {
        const imp = c.impact || 0;
        const w = Math.max(8, Math.min(100, (Math.abs(imp) / maxAbs) * 100));
        const cls = c.direction === 'increase_risk' ? 'bad' : 'teal';
        const arrow = imp >= 0 ? '↑' : '↓';
        return {
          lbl: arrow + ' ' + clinicalLabel(c.feature, c.value),
          w: w,
          val: (imp >= 0 ? '+' : '') + imp.toFixed(3),
          cls: cls
        };
      });

      _patientData[pid] = {
        risk: risk,
        tierLabel: tierLabel,
        letter: letter,
        bars: pBars,
        topFeatureDisplay: topFeatureDisplay
      };
    });

    const caseSel = document.getElementById('caseSelect');
    if (caseSel) {
      if (caseSel.nextElementSibling && caseSel.nextElementSibling.classList.contains('custom-select-wrapper')) {
        caseSel.nextElementSibling.remove();
      }
      caseSel.style.display = 'block';
      caseSel.innerHTML = selHtml;
      if (typeof initPremiumDropdowns === 'function') {
        initPremiumDropdowns();
      }
      caseSel.value = String(explain.test_explanations[0].patient_index);
      setTimeout(updatePatientExplanation, 10);
    }
  } catch (e) {
    console.warn('Error loading model-based patient explanations', e);
  }
}
document.getElementById('explainPatientBtn')?.addEventListener('click', updatePatientExplanation);

// ── DOWNLOAD SUMMARY CERTIFICATE ───────────────────────────────────
async function openDownloadSummary() {
  const domain = document.getElementById('domainLabel')?.textContent || 'Cardiology';
  const checklist = document.querySelectorAll('#euChecklist .check-item');
  const checked = [...checklist].filter(el => el.classList.contains('checked')).length;
  const total = Math.max(checklist.length, 1);
  const checklistItems = [...checklist].map(el => ({
    text: el.querySelector('.check-text b')?.textContent || '',
    checked: el.classList.contains('checked')
  }));

  const compareRows = document.querySelectorAll('#compareBody tr:not([style*="display: none"])');
  const models = [];
  compareRows.forEach(tr => {
    if (tr.id === 'emptyCompareRow') return;
    const cells = tr.querySelectorAll('td');
    if (cells.length >= 5) {
      models.push({
        name: cells[0]?.innerText || 'Unknown Model',
        accuracy: cells[1]?.innerText || '0%',
        sensitivity: cells[2]?.innerText || '0%',
        specificity: cells[3]?.innerText || '0%',
        precision: tr.dataset.precision || '0%',
        f1: tr.dataset.f1 || '0%',
        auc: cells[4]?.innerText || '0'
      });
    }
  });

  const biasBannerText = document.querySelector('#step-7 .card .banner.bad div:nth-child(2)')?.textContent || '';

  const payload = {
    domain: domain,
    checklist_total: total,
    checklist_checked: checked,
    checklist_items: checklistItems,
    models: models,
    bias_findings: biasBannerText
  };

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
  const apiBase = isLocal ? 'http://127.0.0.1:8000' : 'https://healthai-juniorengineers-1.onrender.com';

  const downloadBtn1 = document.getElementById('downloadSummaryBtn');
  const downloadBtn2 = document.getElementById('downloadSummaryBtnFooter');
  if (downloadBtn1) { downloadBtn1.disabled = true; downloadBtn1.textContent = 'Generating PDF...'; }
  if (downloadBtn2) { downloadBtn2.disabled = true; downloadBtn2.textContent = 'Generating PDF...'; }

  try {
    const res = await fetch(apiBase + '/api/generate-certificate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`API Error: ${res.statusText}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'HealthAI-Summary-Certificate.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    showGlobalPopup({
      title: 'Download failed',
      message: 'Failed to generate PDF certificate: ' + (err && err.message ? err.message : String(err)),
      variant: 'bad',
    });
  } finally {
    if (downloadBtn1) { downloadBtn1.disabled = false; downloadBtn1.textContent = '📄 Download Summary Certificate'; }
    if (downloadBtn2) { downloadBtn2.disabled = false; downloadBtn2.textContent = '📄 Download Summary Certificate'; }
  }
}
document.getElementById('downloadSummaryBtn')?.addEventListener('click', openDownloadSummary);
document.getElementById('downloadSummaryBtnFooter')?.addEventListener('click', openDownloadSummary);

// ── RESET ALL ─────────────────────────────────────────────────────
document.getElementById('resetAll').addEventListener('click', () => {
  elegantConfirm(
    'Reset Entire Pipeline?',
    'Are you sure you want to discard your current model trained data and begin again from Step 1?',
    () => {
      try {
        localStorage.removeItem('heathAI_schemaOK');
        sessionStorage.clear(); // Safely clear all session storage memory for this app
      } catch (e) { }

      const currentDomain = document.getElementById('domainLabel')?.textContent || 'Cardiology';
      window.location.href = `step1.html?domain=${encodeURIComponent(currentDomain)}`;
    });
});

// ── THEME SWITCHER ────────────────────────────────────────────────
const themeSelector = document.getElementById('themeSelector');
const savedTheme = localStorage.getItem('heathAI_theme') || 'nature';
document.documentElement.setAttribute('data-theme', savedTheme);
themeSelector.value = savedTheme;

themeSelector.addEventListener('change', (e) => {
  const newTheme = e.target.value;
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('heathAI_theme', newTheme);
});


// ── CUSTOM CONFIRM MODAL LOGIC ───────────────────────────────────
let confirmCallback = null;
let cancelCallback = null;
const customConfirmOverlay = document.getElementById('customConfirmOverlay');
const customConfirmTitle = document.getElementById('customConfirmTitle');
const customConfirmMessage = document.getElementById('customConfirmMessage');

function elegantConfirm(title, message, onOk, onCancel) {
  customConfirmTitle.textContent = title;
  customConfirmMessage.textContent = message;
  confirmCallback = onOk;
  cancelCallback = onCancel || null;
  customConfirmOverlay.classList.add('open');
}

document.getElementById('customConfirmCancel').addEventListener('click', () => {
  customConfirmOverlay.classList.remove('open');
  if (cancelCallback) cancelCallback();
  cancelCallback = null;
});
document.getElementById('customConfirmOk').addEventListener('click', () => {
  customConfirmOverlay.classList.remove('open');
  if (confirmCallback) confirmCallback();
});

// 1. Reset All
// Old listener handled elsewhere

// Ensure theme selector works with custom select by updating the JS logic slightly
const ts = document.getElementById('themeSelector');
if (ts) {
  ts.addEventListener('change', (e) => {
    const newTheme = e.target.value;
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('heathAI_theme', newTheme);
  });
}





// Mapper logic placeholder



// ── PREMIUM CUSTOM SELECT DROPDOWNS ──────────────────────────────────────
function initPremiumDropdowns() {
  const selects = document.querySelectorAll('select.sel, select.theme-selector');
  selects.forEach(select => {
    if (select.nextElementSibling && select.nextElementSibling.classList.contains('custom-select-wrapper')) return;

    select.style.setProperty('display', 'none', 'important');

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper' + (select.id === 'themeSelector' || select.id === 'domainSelect' ? ' theme-selector-compact' : '') + (select.id === 'domainSelect' ? ' nav-domain-select-wrapper' : '');

    const visual = document.createElement('div');
    visual.className = 'custom-select';

    const textSpan = document.createElement('span');
    textSpan.className = 'custom-select-text';
    textSpan.textContent = select.options[select.selectedIndex]?.text || '';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'custom-select-icon';
    iconSpan.innerHTML = '<svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1.5L6 6.5L11 1.5"/></svg>';

    visual.appendChild(textSpan);
    visual.appendChild(iconSpan);

    const optionsList = document.createElement('div');
    optionsList.className = 'custom-options';

    Array.from(select.options).forEach((opt, idx) => {
      const optionDiv = document.createElement('div');
      optionDiv.className = 'custom-option';
      if (idx === select.selectedIndex) optionDiv.classList.add('selected');

      const oText = document.createElement('span');
      oText.textContent = opt.text;

      optionDiv.appendChild(oText);

      optionDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        select.selectedIndex = idx;
        textSpan.textContent = opt.text;

        optionsList.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
        optionDiv.classList.add('selected');

        const event = new Event('change');
        select.dispatchEvent(event);
        visual.classList.remove('open');
      });
      optionsList.appendChild(optionDiv);
    });

    wrapper.appendChild(visual);
    wrapper.appendChild(optionsList);
    select.parentNode.insertBefore(wrapper, select.nextSibling);

    visual.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.custom-select.open').forEach(el => {
        if (el !== visual) el.classList.remove('open');
      });
      visual.classList.toggle('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select.open').forEach(el => el.classList.remove('open'));
  });
}

// Call the function explicitly via timeouts so it binds even after the DOM shifts
document.addEventListener('DOMContentLoaded', () => { setTimeout(initPremiumDropdowns, 100); });
setTimeout(initPremiumDropdowns, 500);
document.getElementById('openMapper')?.addEventListener('click', () => { setTimeout(initPremiumDropdowns, 50); });



// ── PHASE 8: ALGORITHM VISUALIZATIONS ─────────────────────────────
(function () {
  // Helper: read CSS variable value
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }

  // ── TAB SWITCHING ──────────────────────────────────────────────
  const VIZ_PANELS = ['viz-knn', 'viz-svm', 'viz-dt', 'viz-rf', 'viz-lr', 'viz-nb'];
  const PARAM_PANELS = ['params-knn', 'params-svm', 'params-dt', 'params-rf', 'params-lr', 'params-nb'];
  let activeModel = 'knn';

  document.querySelectorAll('.model-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.model-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeModel = tab.dataset.model;

      const activeModelName = document.getElementById('activeModelName');
      if (activeModelName) {
        activeModelName.textContent = tab.textContent;
      }

      PARAM_PANELS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      VIZ_PANELS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

      const pp = document.getElementById('params-' + activeModel);
      if (pp) pp.style.display = 'block';
      const vp = document.getElementById('viz-' + activeModel);
      if (vp) vp.style.display = 'block';

      redraw();
    });
  });

  function redraw() {
    if (activeModel === 'knn') drawKNN();
    else if (activeModel === 'svm') drawSVM();
    else if (activeModel === 'dt') drawDT();
    else if (activeModel === 'rf') drawRF();
    else if (activeModel === 'lr') drawLR();
    else if (activeModel === 'nb') drawNB();
  }

  // ── SLIDER WIRING ────────────────────────────────────────────────
  function wire(id, valId, fmt, cb) {
    const s = document.getElementById(id), v = document.getElementById(valId);
    if (!s) return;
    s.addEventListener('input', () => {
      if (v) v.textContent = fmt ? fmt(s.value) : s.value;
      if (cb) cb(+s.value);
      redraw();
    });
  }

  wire('knnK', 'knnKVal', null, k => {
    const lbl = document.getElementById('knnKVizLabel');
    if (lbl) lbl.textContent = k;
  });
  wire('svmC', 'svmCVal', v => Math.pow(10, (v - 5) / 2).toFixed(2));
  document.getElementById('svmKernel')?.addEventListener('change', () => { if (activeModel === 'svm') drawSVM(); });
  wire('dtDepth', 'dtDepthVal');
  wire('rfTrees', 'rfTreesVal', null, t => {
    const tv = document.getElementById('rfTreeCountVal');
    if (tv) tv.textContent = t;
  });
  wire('rfDepth', 'rfDepthVal');
  wire('lrC', 'lrCVal', v => Math.pow(10, (v - 5) / 2).toFixed(2));
  wire('lrIter', 'lrIterVal');

  // Also update KNN label when knnK changes
  const knnSlider = document.getElementById('knnK');
  if (knnSlider) {
    knnSlider.addEventListener('input', () => {
      const lbl = document.getElementById('knnKVizLabel');
      if (lbl) lbl.textContent = knnSlider.value;
    });
  }

  // ── KNN ─────────────────────────────────────────────────────────
  let knnRAF;
  let knnCurR = 0;
  function drawKNN() {
    const canvas = document.getElementById('knnCanvas');
    if (!canvas) return;
    const k = +(document.getElementById('knnK')?.value || 5);

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement.clientWidth - 2 || 500;
    const H = 240;
    canvas.style.height = H + 'px';
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cBad = cssVar('--bad') || '#dc2626';
    const cGood = cssVar('--good') || '#16a34a';
    const cPri = cssVar('--primary') || '#2563eb';
    const cInk = cssVar('--ink') || '#111';

    const pts = [
      [0.18, 0.28, 0], [0.22, 0.52, 0], [0.13, 0.62, 1], [0.31, 0.73, 1], [0.38, 0.38, 0],
      [0.50, 0.22, 0], [0.44, 0.58, 1], [0.58, 0.68, 1], [0.64, 0.42, 0], [0.72, 0.58, 1],
      [0.77, 0.27, 0], [0.82, 0.63, 1], [0.36, 0.18, 0], [0.62, 0.78, 1], [0.87, 0.38, 0],
      [0.11, 0.44, 1], [0.91, 0.72, 1], [0.61, 0.13, 0], [0.29, 0.43, 0], [0.54, 0.47, 1],
    ];
    const np = [0.48, 0.50]; // New patient
    const dists = pts.map(([x, y, c], i) => ({ i, d: Math.hypot(x - np[0], y - np[1]), c }));
    dists.sort((a, b) => a.d - b.d);
    const nbrs = new Set(dists.slice(0, k).map(d => d.i));
    const targetR = dists[k - 1].d;

    if (knnRAF) cancelAnimationFrame(knnRAF);

    function frame() {
      knnCurR += (targetR - knnCurR) * 0.12;
      ctx.clearRect(0, 0, W, H);

      // Lines to neighbors
      ctx.lineWidth = 1; ctx.strokeStyle = cPri; ctx.globalAlpha = 0.18;
      pts.forEach(([x, y, c], i) => {
        if (!nbrs.has(i)) return;
        ctx.beginPath(); ctx.moveTo(x * W, y * H); ctx.lineTo(np[0] * W, np[1] * H); ctx.stroke();
      });
      ctx.globalAlpha = 1;

      // Radius circle (ensure radius is non-negative; arc() fails with negative)
      const radius = Math.max(0, knnCurR) * Math.max(1, Math.min(W, H));
      ctx.beginPath();
      ctx.arc(np[0] * W, np[1] * H, Math.max(0.5, radius), 0, Math.PI * 2);
      ctx.strokeStyle = cPri; ctx.lineWidth = 2; ctx.globalAlpha = 0.55;
      ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.07; ctx.fillStyle = cPri; ctx.fill();
      ctx.globalAlpha = 1;

      // Patient dots
      pts.forEach(([x, y, c], i) => {
        const isN = nbrs.has(i);
        ctx.beginPath(); ctx.arc(x * W, y * H, isN ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = c === 1 ? cBad : cGood;
        ctx.globalAlpha = isN ? 1 : 0.38; ctx.fill();
        if (isN) { ctx.strokeStyle = c === 1 ? cBad : cGood; ctx.lineWidth = 2; ctx.globalAlpha = 1; ctx.stroke(); }
        ctx.globalAlpha = 1;
      });

      // Star (new patient)
      const sx = np[0] * W, sy = np[1] * H, sr = 9;
      ctx.fillStyle = cInk; ctx.beginPath();
      for (let q = 0; q < 5; q++) {
        const a = (q * 4 * Math.PI / 5) - Math.PI / 2, b = (q * 4 * Math.PI / 5 + 2 * Math.PI / 5) - Math.PI / 2;
        if (q === 0) ctx.moveTo(sx + sr * Math.cos(a), sy + sr * Math.sin(a));
        else ctx.lineTo(sx + sr * Math.cos(a), sy + sr * Math.sin(a));
        ctx.lineTo(sx + sr * .4 * Math.cos(b), sy + sr * .4 * Math.sin(b));
      }
      ctx.closePath(); ctx.fill();

      if (Math.abs(targetR - knnCurR) > 0.001) knnRAF = requestAnimationFrame(frame);
    }
    knnCurR = knnCurR > 0 ? knnCurR : 0;
    frame();
  }

  // ── SVM ─────────────────────────────────────────────────────────
  let svmRAF; let svmAnim = 0; let svmPrevK = '';
  function drawSVM() {
    const canvas = document.getElementById('svmCanvas');
    if (!canvas) return;
    const C = +(document.getElementById('svmC')?.value || 5);
    const kernel = document.getElementById('svmKernel')?.value || 'rbf';

    if (kernel !== svmPrevK) { svmAnim = 0; svmPrevK = kernel; }

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement.clientWidth - 2 || 500, H = 240;
    canvas.style.height = H + 'px';
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

    const cBad = cssVar('--bad') || '#dc2626', cGood = cssVar('--good') || '#16a34a';
    const cInk = cssVar('--ink') || '#111', cMuted = cssVar('--text-muted') || '#888';

    const redPts = [[.18, .72], [.23, .78], [.28, .83], [.14, .66], [.33, .88], [.26, .74], [.38, .92]];
    const grnPts = [[.72, .28], [.77, .22], [.82, .33], [.66, .18], [.87, .38], [.74, .24], [.62, .10]];

    if (svmRAF) cancelAnimationFrame(svmRAF);
    function frame() {
      svmAnim += (1 - svmAnim) * 0.1;
      ctx.clearRect(0, 0, W, H);

      const strictness = C / 10;
      const margin = Math.max(0.06, 0.22 - strictness * 0.12);

      // Find support vectors: points closest to boundary
      const isSVRed = redPts.map(p => p[0] < 0.5 + margin);
      const isSVGrn = grnPts.map(p => p[0] > 0.5 - margin);

      // Background zones
      ctx.fillStyle = cssVar('--bad-bg') || 'rgba(220,38,38,.05)';
      ctx.fillRect(0, 0, W * 0.48 * svmAnim, H);
      ctx.fillStyle = cssVar('--good-bg') || 'rgba(22,163,74,.05)';
      ctx.fillRect(W * 0.52 * svmAnim, 0, W, H);

      // Margin lines
      ctx.setLineDash([5, 4]); ctx.strokeStyle = cMuted; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
      if (kernel === 'linear') {
        ctx.beginPath(); ctx.moveTo(W * (0.5 - margin) * svmAnim, 0); ctx.lineTo(W * (0.5 - margin) * svmAnim, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W * (0.5 + margin) * svmAnim, 0); ctx.lineTo(W * (0.5 + margin) * svmAnim, H); ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(W * .5, H * .5, W * (margin + 0.1) * svmAnim, H * (margin + 0.1) * svmAnim, Math.PI / 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;

      // Decision boundary
      ctx.strokeStyle = cInk; ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (kernel === 'linear') {
        ctx.moveTo(W * .5 * svmAnim + (W * .5 * (1 - svmAnim)), 0); ctx.lineTo(W * .5 * svmAnim + (W * .5 * (1 - svmAnim)), H);
      } else {
        ctx.ellipse(W * .5, H * .5, W * .18 * svmAnim, H * .18 * svmAnim, Math.PI / 4, 0, Math.PI * 2);
      }
      ctx.stroke();

      // Dots
      [redPts, grnPts].forEach((group, gi) => {
        group.forEach((p, i) => {
          const isSV = gi === 0 ? isSVRed[i] : isSVGrn[i];
          ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, isSV ? 7 : 5, 0, Math.PI * 2);
          ctx.fillStyle = gi === 0 ? cBad : cGood; ctx.fill();
          if (isSV) { ctx.strokeStyle = cInk; ctx.lineWidth = 2; ctx.stroke(); }
        });
      });

      if (1 - svmAnim > 0.01) svmRAF = requestAnimationFrame(frame);
    }
    frame();
  }

  // ── DECISION TREE ───────────────────────────────────────────────
  function drawDT() {
    const wrap = document.getElementById('dtWrap');
    if (!wrap) return;
    const depth = +(document.getElementById('dtDepth')?.value || 3);

    const questions = ['EF < 38%?', 'Age > 65?', 'Creat > 1.5?', 'Smoker?', 'BP > 140?'];
    const limit = Math.min(depth, 5);

    function makeNode(level, isLeftChild) {
      if (level > limit) return '';
      const isLeaf = level === limit;
      const q = questions[(level - 1) % questions.length];
      if (isLeaf) {
        const kind = isLeftChild ? 'leaf-r">Readmit' : 'leaf-g">Safe';
        return `<div class="t-child"><div class="t-lbl ${kind}</div></div>`;
      }
      return `<div class="t-child">
        <div class="t-lbl q">${q}</div>
        <div class="t-children">
          ${makeNode(level + 1, true)}
          ${makeNode(level + 1, false)}
        </div>
      </div>`;
    }

    wrap.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;width:100%;overflow:auto;padding:16px;">
      <div class="t-lbl q" style="font-size:13px;">${questions[0]}</div>
      <div class="t-children" style="margin-top:28px;">
        ${makeNode(2, true)}
        ${makeNode(2, false)}
      </div>
    </div>`;

    const warn = document.getElementById('dtWarn');
    if (warn) {
      warn.style.display = depth > 4 ? 'flex' : 'none';
      const wv = document.getElementById('dtWarnVal');
      if (wv) wv.textContent = depth;
    }
  }

  // ── RANDOM FOREST ──────────────────────────────────────────────
  function drawRF() {
    const wrap = document.getElementById('voteTrees');
    if (!wrap) return;
    const count = +(document.getElementById('rfTrees')?.value || 100);

    const tv1 = document.getElementById('rfTreeCountVal');
    const tv2 = document.getElementById('rfTreeCountVal2');
    if (tv1) tv1.textContent = count;
    if (tv2) tv2.textContent = count;

    // Simulated votes: converge toward 68% with variance inversely proportional to count
    const variance = Math.max(0, (100 - count) / 100) * 15;
    const seed = ((count * 7) % 17) - 8; // deterministic "random" offset
    const adjustedPct = 68 + (seed / Math.sqrt(count)) * variance;
    const pct = Math.max(52, Math.min(84, adjustedPct));

    const rCount = Math.round(count * pct / 100);
    const sCount = count - rCount;
    const rPct = (rCount / count * 100).toFixed(1);
    const sPct = (sCount / count * 100).toFixed(1);

    const showCount = Math.min(count, 16);
    const cutoff = Math.round(showCount * pct / 100);
    let html = '';
    for (let i = 0; i < showCount; i++) {
      const isRed = i < cutoff;
      html += `<div class="mini-tree"><svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${isRed ? 'var(--bad)' : 'var(--good)'}" /></svg><div style="font-size:9px;color:var(--text-muted);font-weight:600;">#${i + 1}</div></div>`;
    }
    wrap.innerHTML = html;

    requestAnimationFrame(() => {
      const barR = document.getElementById('voteReadmit');
      const barS = document.getElementById('voteSafe');
      const pctR = document.getElementById('voteReadmitPct');
      const pctS = document.getElementById('voteSafePct');
      if (barR) { barR.style.width = rPct + '%'; barR.textContent = rCount; }
      if (barS) { barS.style.width = sPct + '%'; barS.textContent = sCount; }
      if (pctR) pctR.textContent = rPct + '%';
      if (pctS) pctS.textContent = sPct + '%';
    });
  }

  // ── LOGISTIC REGRESSION ─────────────────────────────────────────
  let lrRAF; let lrCur = 0.75;
  function drawLR() {
    const canvas = document.getElementById('lrCanvas');
    if (!canvas) return;
    const C = +(document.getElementById('lrC')?.value || 5);
    const steepness = 0.2 + (C / 10) * 1.8; // ranges from 0.2 to 2.0

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement.clientWidth - 2 || 500, H = 240;
    canvas.style.height = H + 'px';
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

    const cInk = cssVar('--ink') || '#111', cMuted = cssVar('--text-muted') || '#888', cBad = cssVar('--bad') || '#dc2626', cPri = cssVar('--primary') || '#2563eb';

    if (lrRAF) cancelAnimationFrame(lrRAF);
    const target = steepness;
    function frame() {
      lrCur += (target - lrCur) * 0.12;
      ctx.clearRect(0, 0, W, H);

      const m = 44, pw = W - m * 2, ph = H - m * 2;

      ctx.strokeStyle = cMuted; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(m, m); ctx.lineTo(m, H - m); ctx.lineTo(W - m, H - m); ctx.stroke();

      ctx.fillStyle = cMuted; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('100%', m - 5, m + 5);
      ctx.fillText('50%', m - 5, m + ph / 2 + 5);
      ctx.fillText('0%', m - 5, H - m + 5);
      ctx.textAlign = 'center';
      ctx.fillText('← Low EF% (sick)', m + 50, H - m + 18);
      ctx.fillText('High EF% (healthy) →', W - m - 50, H - m + 18);
      ctx.fillText('P(Readmission)', m - 30, H / 2);

      // 50% dashed line
      ctx.setLineDash([4, 4]); ctx.strokeStyle = cMuted; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.moveTo(m, m + ph / 2); ctx.lineTo(W - m, m + ph / 2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;

      // S-curve
      ctx.strokeStyle = cInk; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * 10 - 5;
        const prob = 1 / (1 + Math.exp(-lrCur * t));
        const px2 = m + (i / 120) * pw;
        const py2 = m + ph * (1 - prob);
        if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
      }
      ctx.stroke();

      // Patient at EF ~35% = t around -1
      const ef35 = 0.35;
      const t35 = (ef35 * 10) - 5;
      const prob35 = 1 / (1 + Math.exp(-lrCur * t35));
      const pp2x = m + ef35 * pw;
      const pp2y = m + ph * (1 - prob35);

      ctx.beginPath(); ctx.arc(pp2x, pp2y, 8, 0, Math.PI * 2);
      ctx.fillStyle = cBad; ctx.fill(); ctx.strokeStyle = cInk; ctx.lineWidth = 2; ctx.stroke();

      ctx.textAlign = 'left'; ctx.fillStyle = cInk; ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`Patient Risk: ${(prob35 * 100).toFixed(0)}%`, pp2x + 12, pp2y - 6);

      if (Math.abs(target - lrCur) > 0.005) lrRAF = requestAnimationFrame(frame);
    }
    frame();
  }

  // ── NAIVE BAYES ─────────────────────────────────────────────────
  const NB_FEATURES = [
    { name: 'Base Rate (population avg)', val: 33, pct: 33, cls: '', impact: 'Starting point' },
    { name: 'Ejection Fraction = 20% (very low)', val: 78, pct: 78, cls: 'inc', impact: '+45% risk increase' },
    { name: 'Age = 71 (elderly)', val: 54, pct: 54, cls: 'inc', impact: '+21% risk increase' },
    { name: 'Serum Creatinine = 1.3 (normal)', val: 35, pct: 35, cls: 'inc', impact: '+2% slight increase' },
    { name: 'Non-smoker', val: 28, pct: 28, cls: 'dec', impact: '-5% risk decrease' },
  ];

  function drawNB() {
    const wrap = document.getElementById('nbBars');
    if (!wrap) return;
    let html = NB_FEATURES.map((f, i) => `
      <div class="pr-item">
        <div class="pr-hdr"><span class="pr-feat">${f.name}</span><span class="pr-val">P = ${f.val}%</span></div>
        <div class="pr-trk"><div class="pr-fil ${f.cls}" id="nbf${i}"></div></div>
        <div class="pr-imp">${f.impact}</div>
      </div>`).join('');
    wrap.innerHTML = html;
    NB_FEATURES.forEach((f, i) => {
      setTimeout(() => {
        const el = document.getElementById('nbf' + i);
        if (el) el.style.width = f.pct + '%';
      }, 120 + i * 180);
    });
  }

  // ── INITIAL SETUP ────────────────────────────────────────────────
  // Show correct viz panel and param panel on load
  PARAM_PANELS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  VIZ_PANELS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const knnP = document.getElementById('params-knn');
  if (knnP) knnP.style.display = 'block';
  const knnV = document.getElementById('viz-knn');
  if (knnV) knnV.style.display = 'block';

  // Set active tab
  document.querySelectorAll('.model-tab').forEach(t => t.classList.remove('active'));
  const knnTab = document.querySelector('.model-tab[data-model="knn"]');
  if (knnTab) knnTab.classList.add('active');

  // Initial draw after page settles
  setTimeout(() => { knnCurR = 0; drawKNN(); }, 300);
  setTimeout(() => { drawRF(); }, 400);
  setTimeout(() => { drawNB(); }, 500);

  // Redraw on resize
  window.addEventListener('resize', () => { clearTimeout(window._vizResizeTimer); window._vizResizeTimer = setTimeout(redraw, 200); });

})();
// ── END PHASE 8 ────────────────────────────────────────────────────

// ── ACCESSIBILITY LOGIC ───────────────────────────────────────
const a11yOverlay = document.getElementById('a11yOverlay');
document.getElementById('openA11yBtn')?.addEventListener('click', () => { a11yOverlay.classList.add('open'); });
document.getElementById('a11yCloseBtn')?.addEventListener('click', () => { a11yOverlay.classList.remove('open'); });

// Text Size — persist to localStorage and apply on load
const A11Y_TEXT_LARGE = 'heathAI_textSizeLarge';
const btnStandard = document.getElementById('btnTextStandard');
const btnLarge = document.getElementById('btnTextLarge');
if (localStorage.getItem(A11Y_TEXT_LARGE) === '1') {
  document.documentElement.setAttribute('data-text-size', 'large');
  btnStandard?.classList.remove('active'); btnLarge?.classList.add('active');
} else {
  document.documentElement.removeAttribute('data-text-size');
  btnStandard?.classList.add('active'); btnLarge?.classList.remove('active');
}
btnStandard?.addEventListener('click', () => {
  document.documentElement.removeAttribute('data-text-size');
  localStorage.removeItem(A11Y_TEXT_LARGE);
  btnStandard.classList.add('active'); btnLarge.classList.remove('active');
});
btnLarge?.addEventListener('click', () => {
  document.documentElement.setAttribute('data-text-size', 'large');
  localStorage.setItem(A11Y_TEXT_LARGE, '1');
  btnLarge.classList.add('active'); btnStandard.classList.remove('active');
});

// Contrast
const btnCStandard = document.getElementById('btnContrastStandard');
const btnCHigh = document.getElementById('btnContrastHigh');
btnCHigh?.addEventListener('click', () => {
  // Override active theme with colorblind theme
  document.documentElement.setAttribute('data-theme', 'colorblind');
  btnCHigh.classList.add('active'); btnCStandard.classList.remove('active');
});
btnCStandard?.addEventListener('click', () => {
  // Restore from local storage
  const restoredTheme = localStorage.getItem('heathAI_theme') || 'nature';
  document.documentElement.setAttribute('data-theme', restoredTheme);
  btnCStandard.classList.add('active'); btnCHigh.classList.remove('active');
});

// ── AUTO-RETRAIN STATUS TEXT ──────────────────────────────────────
function updateAutoRetrainText() {
  const checkbox = document.getElementById('autoRetrain');
  const statusText = document.getElementById('autoRetrainStatusText');
  if (!checkbox || !statusText) return;

  const activeModel = document.querySelector('.model-tab.active')?.dataset.model || 'knn';
  if (activeModel === 'rf' || activeModel === 'lr') {
    statusText.style.display = 'none';
    return;
  }

  statusText.style.display = 'block';
  if (checkbox.checked) {
    statusText.textContent = 'Auto-retrain is active';
    statusText.style.color = 'var(--primary)';
  } else {
    statusText.textContent = 'Auto-retrain is disabled';
    statusText.style.color = 'var(--text-muted, #6b7280)';
  }
}

document.getElementById('autoRetrain')?.addEventListener('change', updateAutoRetrainText);
document.querySelectorAll('.model-tab').forEach(tab => tab.addEventListener('click', () => setTimeout(updateAutoRetrainText, 50)));
// Initialise on load
document.addEventListener('DOMContentLoaded', updateAutoRetrainText);
setTimeout(updateAutoRetrainText, 100);

// ── STEP 6: FEATURE IMPORTANCE PIPELINE INTEGRATION ───────────────────
function renderFeatureImportanceChart(containerId, rawData) {
  const maxVal = Math.max(...rawData.map(d => d.importance));
  const minVal = Math.min(...rawData.map(d => d.importance));

  let processedData = rawData.map(item => {
    const normalized = (maxVal > minVal)
      ? (item.importance - minVal) / (maxVal - minVal)
      : item.importance;
    return {
      clinicalFeature: getClinicalName(item.feature),
      normalizedImportance: normalized
    };
  });

  processedData.sort((a, b) => b.normalizedImportance - a.normalizedImportance);
  processedData = processedData.slice(0, 10);

  const container = document.getElementById(containerId);
  if (!container) return;

  const barsHtml = processedData.map(item => {
    let colorClass = 'teal'; // green
    if (item.normalizedImportance >= 0.6) colorClass = 'bad'; // red
    else if (item.normalizedImportance >= 0.3) colorClass = 'warn'; // yellow

    const pct = Math.max(2, item.normalizedImportance * 100).toFixed(1);

    const lbl = escapeHtmlStep6(item.clinicalFeature);
    return `
      <div class="bar-row">
        <div class="bar-lbl">${lbl}</div>
        <div class="bar-track">
          <div class="bar-fill ${colorClass}" style="width:${pct}%"></div>
        </div>
        <div class="bar-val">${item.normalizedImportance.toFixed(2)}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="bars" style="margin-top:20px; display:flex; flex-direction:column; gap:12px;">${barsHtml}</div>`;
}

function renderCorrelationHeatmap() {
  const container = document.getElementById('correlationHeatmapContainer');
  if (!container) return;
  if (!window.correlationData) {
    try {
      const saved = sessionStorage.getItem('healthai_correlation');
      if (saved) window.correlationData = JSON.parse(saved);
    } catch (e) { }
  }
  if (!window.correlationData) {
    container.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0;">Apply preparation settings in Step 3 to see feature correlations.</p>';
    return;
  }
  const { columns, data } = window.correlationData;
  const n = columns.length;
  const cellSize = n <= 10 ? 44 : n <= 15 ? 32 : 24;
  const fontSize = n <= 10 ? 11 : n <= 15 ? 9 : 7;

  function fmtLabel(col) {
    return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function getColor(val) {
    if (val >= 0) {
      const t = val;
      return `rgb(${Math.round(178 + (t * (178 - 178)))},${Math.round(240 - t * 206)},${Math.round(240 - t * 206)})`;
    } else {
      const t = -val;
      return `rgb(${Math.round(240 - t * 170)},${Math.round(240 - t * 110)},${Math.round(240 - t * (240 - 180))})`;
    }
  }

  let html = `<div style="overflow-x:auto;">
  <table style="border-collapse:collapse; font-size:${fontSize}px; font-family:inherit;">
  <thead><tr>
    <th style="width:160px;min-width:120px;"></th>`;

  columns.forEach(col => {
    html += `<th style="
      vertical-align: bottom;
      padding: 0 2px 4px 2px;
      font-weight: normal;
      font-size: 12px;
      color: var(--muted);
      height: auto;
    ">
      <div style="
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        white-space: nowrap;
        display: inline-block;
        overflow: visible;
        line-height: 1.2;
      ">${fmtLabel(col)}</div>
    </th>`;
  });
  html += '</tr></thead><tbody>';

  data.forEach((row, i) => {
    html += `<tr><td style="padding:4px 10px 4px 4px; font-size:12px;font-weight:600; color:var(--mid);width:160px; min-width:120px;line-height:1.4;">
      ${fmtLabel(columns[i])}</td>`;
    row.forEach(val => {
      const bg = getColor(val);
      const tc = Math.abs(val) > 0.55 ? 'white' : '#444';
      html += `<td style="
        width:${cellSize}px;
        height:${cellSize}px;
        min-width:${cellSize}px;
        background:${bg};
        color:${tc};
        text-align:center;
        border:1px solid rgba(0,0,0,0.06);
        font-weight:${Math.abs(val) >= 0.99 ? '700' : '400'};">
        ${val}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = data[i][j];
      if (v !== null && !isNaN(v) && Math.abs(v) < 0.9999) {
        pairs.push({ a: columns[i], b: columns[j], val: v, abs: Math.abs(v) });
      }
    }
  }
  pairs.sort((x, y) => y.abs - x.abs);
  const top = pairs.slice(0, 3);

  let interp = '';
  if (top.length > 0) {
    const str = v => v >= 0.7 ? 'strong' : v >= 0.4 ? 'moderate' : 'weak';
    const dir = v => v >= 0 ? 'positive' : 'negative';
    interp = top.map(p => `<b>${fmtLabel(p.a)}</b> and <b>${fmtLabel(p.b)}</b> show a ${str(p.abs)} ${dir(p.val)} correlation (${p.val.toFixed(3)}).`).join(' ');
    interp += ' Features with correlations close to 0 contribute independent information to the model.';
  }

  html += `<div class="banner info" style="margin-top:14px;">
    <div class="banner-icon">💡</div>
    <div><b>Clinical interpretation:</b> ${interp}</div></div>`;

  container.innerHTML = html;
}

function renderStep6() {
  let step6DataPayload = [];
  let explain = null;

  try {
    const mk = resolveExplainModelKey();
    if (mk) {
      const reg = JSON.parse(sessionStorage.getItem('healthai_explain_registry') || '{}');
      explain = reg[mk] || null;
      if (explain && explain.feature_importance && explain.feature_importance.length) {
        step6DataPayload = explain.feature_importance.map(function (x) {
          return { feature: x.feature, importance: x.importance };
        });
      }
    }
  } catch (e) {
    console.warn('Could not load explainability for Step 6', e);
  }

  const container = document.getElementById('step6-container');
  if (!step6DataPayload.length) {
    if (container) {
      container.innerHTML = '<div class="banner warn" style="margin-top:12px;"><div class="banner-icon">!</div><div>Train a model in Step 4 and add it to the comparison table. In Step 5, select the model with the pills — Step 6 uses that <b>trained model</b> for feature importance and per-patient explanations. If the backend is offline, explanations are unavailable.</div></div>';
    }
    const banner = container && container.nextElementSibling;
    if (banner && banner.classList && banner.classList.contains('banner')) {
      const textDiv = banner.querySelector('div:nth-child(2)');
      if (textDiv) {
        textDiv.innerHTML = '<b>Clinical sense check:</b> Train a model and return here to see which measurements mattered most for that model.';
      }
    }
    return;
  }

  renderFeatureImportanceChart('step6-container', step6DataPayload);

  const sortedByImp = step6DataPayload.slice().sort(function (a, b) {
    return (b.importance || 0) - (a.importance || 0);
  });

  if (sortedByImp.length >= 2) {
    const top1 = getClinicalName(sortedByImp[0].feature);
    const top2 = getClinicalName(sortedByImp[1].feature);
    const wrap = document.getElementById('step6-container');
    if (wrap && wrap.nextElementSibling && wrap.nextElementSibling.classList.contains('banner')) {
      const textDiv = wrap.nextElementSibling.querySelector('div:nth-child(2)');
      if (textDiv) {
        textDiv.innerHTML = '<b>Clinical sense check:</b> ' + escapeHtmlStep6(top1) + ' and ' + escapeHtmlStep6(top2) + ' rank highest for the <b>selected model</b> (global importance from SHAP / permutation blend). Compare with clinical expectations for this task.';
      }
    }
  }

  updatePatientExplanationFromModel();

  var amberWarn = document.querySelector('#patientExplainCard .banner.warn div:nth-child(2)');
  if (amberWarn) {
    amberWarn.innerHTML = '<b>Important:</b> These explanations show associations between measurements and outcomes in the training data — they do not prove causation. A clinician must always decide whether and how to act on any AI prediction.';
  }
}
window.renderStep6 = renderStep6;

window.HEALTHAI_REFERENCE_POPULATION = {
  sex: { malePct: 48, femalePct: 52 },
  ageBuckets: { '18-60': 54, '61-75': 30, '76+': 16 }
};

function _findColMeta(columns, re) {
  return columns.find(function (c) { return c && c.name && re.test(String(c.name)); });
}

function _parseAge(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function _computeTrainingRep(trainRows, columns) {
  const ref = window.HEALTHAI_REFERENCE_POPULATION;
  const out = { gender: null, age: null };
  if (!trainRows || !trainRows.length || !columns) return out;

  const gColBase = _findColMeta(columns, /sex|gender/i);
  const aColBase = _findColMeta(columns, /age/i);

  // Prefer _raw versions if they exist (added by backend for Step 7 representation)
  const gCol = (gColBase && trainRows[0] && (gColBase.name + '_raw') in trainRows[0]) ? { name: gColBase.name + '_raw' } : gColBase;
  const aCol = (aColBase && trainRows[0] && (aColBase.name + '_raw') in trainRows[0]) ? { name: aColBase.name + '_raw' } : aColBase;

  const n = trainRows.length;

  if (gCol) {
    let m = 0; let f = 0;
    trainRows.forEach(function (r) {
      const v = String(r[gCol.name] ?? '').trim().toLowerCase();
      if (v === '0' || v === 'm' || v === 'male' || v === 'man') m++;
      else if (v === '1' || v === 'f' || v === 'female' || v === 'woman') f++;
      else if (v) m++;
    });
    out.gender = {
      malePct: Math.round((m / n) * 100),
      femalePct: Math.round((f / n) * 100),
      refMale: ref.sex.malePct,
      refFemale: ref.sex.femalePct
    };
  }

  if (aCol) {
    let b1 = 0; let b2 = 0; let b3 = 0;
    trainRows.forEach(function (r) {
      const a = _parseAge(r[aCol.name]);
      if (a === null) return;
      if (a >= 18 && a <= 60) b1++;
      else if (a >= 61 && a <= 75) b2++;
      else if (a >= 76) b3++;
    });
    const denom = Math.max(1, trainRows.filter(function (r) { return _parseAge(r[aCol.name]) !== null; }).length);
    out.age = {
      b18_60: Math.round((b1 / denom) * 100),
      b61_75: Math.round((b2 / denom) * 100),
      b76: Math.round((b3 / denom) * 100),
      ref18_60: ref.ageBuckets['18-60'],
      ref61_75: ref.ageBuckets['61-75'],
      ref76: ref.ageBuckets['76+']
    };
  }

  return out;
}

function _fairnessTagHtml(sens01) {
  const pct = Math.round((sens01 || 0) * 100);
  let sensCls = pct >= 60 ? 'good' : (pct >= 50 ? 'warn' : 'bad');
  let fairnessTag;
  if (pct >= 60) {
    fairnessTag = '<span class="tag good">OK</span>';
  } else if (pct >= 50) {
    const tip = 'Sensitivity is moderate for this subgroup (50–59%). Review calibration, thresholds, and data representation for this group before relying on predictions clinically.';
    fairnessTag = '<span class="tag warn">Review</span><span class="hover-help" role="note" tabindex="0" aria-label="Why review?" data-tooltip="' + tip + '">i</span>';
  } else {
    fairnessTag = '<span class="tag bad">⚠ Review Needed</span>';
  }
  return { pct: pct, sensCls: sensCls, fairnessTag: fairnessTag, isBad: pct < 50 };
}

function renderStep7Ethics() {
  try {
    const modelKey = resolveExplainModelKey();
    const reg = JSON.parse(sessionStorage.getItem('healthai_explain_registry') || '{}');
    const pack = modelKey && reg[modelKey] ? reg[modelKey] : null;
    const fairness = pack && pack.fairness ? pack.fairness : null;

    const dsStr = sessionStorage.getItem('healthai_dataset');
    const prepStr = sessionStorage.getItem('healthai_preprocessed');
    let ds = null;
    let prep = null;
    try { if (dsStr) ds = JSON.parse(dsStr); } catch (e) { }
    try { if (prepStr) prep = JSON.parse(prepStr); } catch (e) { }

    const cardTitles = document.querySelectorAll('#step-7 .card-title');
    const subgroupCard = Array.from(cardTitles).find(function (el) { return el.textContent.includes('Subgroup Performance'); })?.parentElement;

    if (subgroupCard) {
      const tbody = subgroupCard.querySelector('tbody');
      const oldBanner = subgroupCard.querySelector('.banner.bad');
      if (oldBanner) oldBanner.style.display = 'none';

      let bannerContainer = subgroupCard.querySelector('.dynamic-banners');
      if (!bannerContainer) {
        bannerContainer = document.createElement('div');
        bannerContainer.className = 'dynamic-banners';
        bannerContainer.style.marginTop = '16px';
        bannerContainer.style.display = 'flex';
        bannerContainer.style.flexDirection = 'column';
        bannerContainer.style.gap = '8px';
        if (oldBanner) oldBanner.after(bannerContainer);
        else subgroupCard.appendChild(bannerContainer);
      }

      if (tbody) {
        if (!fairness || !fairness.subgroups || !fairness.subgroups.length) {
          tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted);padding:12px;">Train a model in Step 4 (binary classification). Subgroup rows use your <b>test set</b> and need an <b>Age</b> and/or <b>sex/gender</b> column in the CSV. If you already have Age but see this message, click <b>Apply Preparation</b> again in Step 3 so demographics are attached to train/test rows.</td></tr>';
          bannerContainer.innerHTML = '';
        } else {
          let html = '';
          const minN = fairness.min_subgroup_n || 5;
          const maxSens = Math.max.apply(null, fairness.subgroups.filter(function (g) { return g.n >= minN; }).map(function (g) { return g.sensitivity; }));

          fairness.subgroups.forEach(function (g) {
            const ft = _fairnessTagHtml(g.sensitivity);
            const accPct = Math.round((g.accuracy || 0) * 100);
            const specPct = Math.round((g.specificity || 0) * 100);
            html += '<tr><td>' + g.label + ' <span style="color:var(--muted);font-size:11px;">(n=' + g.n + ')</span></td>' +
              '<td>' + accPct + '%</td>' +
              '<td class="delta ' + ft.sensCls + '">' + ft.pct + '%</td>' +
              '<td>' + specPct + '%</td>' +
              '<td>' + ft.fairnessTag + '</td></tr>';
          });
          tbody.innerHTML = html;

          if (fairness.bias_warning) {
            const gap = fairness.sensitivity_max_gap_pp || 0;
            const flagged = fairness.subgroups.filter(function (g) {
              return g.n >= minN && (maxSens - g.sensitivity) > 0.1000001;
            });
            if (flagged.length) {
              bannerContainer.innerHTML = flagged.map(function (g) {
                const ft = _fairnessTagHtml(g.sensitivity);
                const diff = Math.round((maxSens - g.sensitivity) * 100);
                const isBad = ft.isBad;
                const bannerClass = isBad ? 'bad' : 'warn';
                const icon = isBad ? '🚨' : '⚠️';
                const title = isBad ? 'Bias Detected' : 'Performance Gap';
                const actionText = isBad ? 'This model should NOT be deployed until this gap is addressed.' : 'This gap should be investigated to ensure fair clinical outcomes.';
                return '<div class="banner ' + bannerClass + '"><div class="banner-icon">' + icon + '</div><div><b>' + title + ':</b> Sensitivity for <b>' + g.label + '</b> is <b>' + diff + '</b> percentage points below the best subgroup. Max sensitivity gap across subgroups (n≥' + minN + '): <b>' + gap + '</b> pp (threshold &gt;10 pp). ' + actionText + '</div></div>';
              }).join('');
            } else {
              bannerContainer.innerHTML = '<div class="banner warn"><div class="banner-icon">⚠️</div><div><b>Sensitivity spread:</b> Up to <b>' + gap + '</b> percentage points between subgroups (n≥' + minN + '). Investigate calibration and data balance.</div></div>';
            }
          } else {
            bannerContainer.innerHTML = '';
          }
        }
      }
    }

    const repCard = Array.from(cardTitles).find(function (el) { return el.textContent.includes('Training Data Representation'); })?.parentElement;
    if (repCard && ds && ds.columns && prep && prep.trainRows) {
      const theBars = repCard.querySelector('.bars');
      const rep = _computeTrainingRep(prep.trainRows, ds.columns);
      let foot = repCard.querySelector('.healthai-ref-footnote');
      if (!foot) {
        foot = document.createElement('div');
        foot.className = 'healthai-ref-footnote';
        foot.style.fontSize = '11px';
        foot.style.color = 'var(--muted)';
        foot.style.marginTop = '12px';
        foot.style.lineHeight = '1.5';
        const barsEl = repCard.querySelector('.bars');
        if (barsEl) barsEl.after(foot);
        else repCard.appendChild(foot);
      }
      foot.textContent = 'Reference bars use illustrative defaults (general hospital mix). Replace with your institution\'s registry or census statistics when available.';

      if (theBars) {
        let inner = '';
        if (rep.gender) {
          inner += '<div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px;">GENDER — TRAINING SET</div>';
          inner += '<div class="bar-row"><div class="bar-lbl">Male</div><div class="bar-track"><div class="bar-fill" style="width:' + rep.gender.malePct + '%"></div></div><div class="bar-val">' + rep.gender.malePct + '%</div></div>';
          inner += '<div class="bar-row"><div class="bar-lbl">Female</div><div class="bar-track"><div class="bar-fill" style="width:' + rep.gender.femalePct + '%"></div></div><div class="bar-val">' + rep.gender.femalePct + '%</div></div>';
          inner += '<div style="font-size:11px;font-weight:600;color:var(--muted);margin:12px 0 8px;">GENDER — REFERENCE (DEFAULT)</div>';
          inner += '<div class="bar-row"><div class="bar-lbl">Male</div><div class="bar-track"><div class="bar-fill teal" style="width:' + rep.gender.refMale + '%"></div></div><div class="bar-val">' + rep.gender.refMale + '%</div></div>';
          inner += '<div class="bar-row"><div class="bar-lbl">Female</div><div class="bar-track"><div class="bar-fill teal" style="width:' + rep.gender.refFemale + '%"></div></div><div class="bar-val">' + rep.gender.refFemale + '%</div></div>';
        }
        if (rep.age) {
          inner += '<div style="font-size:11px;font-weight:600;color:var(--muted);margin:16px 0 8px;">AGE — TRAINING SET</div>';
          inner += '<div class="bar-row"><div class="bar-lbl">18–60</div><div class="bar-track"><div class="bar-fill" style="width:' + rep.age.b18_60 + '%"></div></div><div class="bar-val">' + rep.age.b18_60 + '%</div></div>';
          inner += '<div class="bar-row"><div class="bar-lbl">61–75</div><div class="bar-track"><div class="bar-fill" style="width:' + rep.age.b61_75 + '%"></div></div><div class="bar-val">' + rep.age.b61_75 + '%</div></div>';
          inner += '<div class="bar-row"><div class="bar-lbl">76+</div><div class="bar-track"><div class="bar-fill" style="width:' + rep.age.b76 + '%"></div></div><div class="bar-val">' + rep.age.b76 + '%</div></div>';
          inner += '<div style="font-size:11px;font-weight:600;color:var(--muted);margin:12px 0 8px;">AGE — REFERENCE (DEFAULT)</div>';
          inner += '<div class="bar-row"><div class="bar-lbl">18–60</div><div class="bar-track"><div class="bar-fill teal" style="width:' + rep.age.ref18_60 + '%"></div></div><div class="bar-val">' + rep.age.ref18_60 + '%</div></div>';
          inner += '<div class="bar-row"><div class="bar-lbl">61–75</div><div class="bar-track"><div class="bar-fill teal" style="width:' + rep.age.ref61_75 + '%"></div></div><div class="bar-val">' + rep.age.ref61_75 + '%</div></div>';
          inner += '<div class="bar-row"><div class="bar-lbl">76+</div><div class="bar-track"><div class="bar-fill teal" style="width:' + rep.age.ref76 + '%"></div></div><div class="bar-val">' + rep.age.ref76 + '%</div></div>';
        }
        if (!inner) {
          inner = '<div style="color:var(--muted);padding:8px 0;">Add <b>gender/sex</b> and/or <b>age</b> columns to your dataset to see training vs reference distribution.</div>';
        }
        theBars.innerHTML = inner;

        const warnBanner = repCard.querySelector('.banner.warn');
        if (warnBanner) {
          let showWarn = false;
          let warnHtml = '';
          if (rep.gender) {
            const dMale = Math.abs(rep.gender.malePct - rep.gender.refMale);
            const dFemale = Math.abs(rep.gender.femalePct - rep.gender.refFemale);
            const worst = dMale > dFemale
              ? { name: 'Male', train: rep.gender.malePct, ref: rep.gender.refMale, gap: dMale }
              : { name: 'Female', train: rep.gender.femalePct, ref: rep.gender.refFemale, gap: dFemale };
            if (worst.gap >= 15 && worst.train < worst.ref) {
              showWarn = true;
              warnHtml = '<div class="banner-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--warn);"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg></div>' +
                '<div><b>Possible under-representation (gender):</b> Training data has <b>' + worst.train + '%</b> <b>' + worst.name + '</b> patients vs <b>' + worst.ref + '%</b> in the default reference mix (gap ' + worst.gap + ' pp). This compares datasets only — not model performance. Align training data with your deployment population.</div>';
            }
          }
          if (!showWarn && rep.age) {
            const gaps = [
              Math.abs(rep.age.b18_60 - rep.age.ref18_60),
              Math.abs(rep.age.b61_75 - rep.age.ref61_75),
              Math.abs(rep.age.b76 - rep.age.ref76)
            ];
            const mx = Math.max.apply(null, gaps);
            if (mx >= 15) {
              showWarn = true;
              warnHtml = '<div class="banner-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--warn);"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg></div>' +
                '<div><b>Age mix mismatch:</b> At least one age band differs from the default reference by <b>≥15</b> percentage points. Compare training cohort age structure to your target hospital population.</div>';
            }
          }
          if (showWarn) {
            warnBanner.style.display = 'flex';
            warnBanner.innerHTML = warnHtml;
          } else {
            warnBanner.style.display = 'none';
          }
        }
      }
    }
  } catch (e) { console.warn('Ethics Step render err:', e); }
}
window.renderStep7Ethics = renderStep7Ethics;

document.addEventListener('DOMContentLoaded', () => {
  // If we are on step 6, init the chart
  if (document.getElementById('step6-container')) {
    setTimeout(renderStep6, 100);
    setTimeout(renderCorrelationHeatmap, 150);
  }
  if (document.getElementById('step-7')) {
    setTimeout(renderStep7Ethics, 100);
    setTimeout(updateChecklistProgress, 50);
  }
});