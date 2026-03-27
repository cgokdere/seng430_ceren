window.activeStep5Model = null;
window.currentStep5Rows = [];

function renderStep5Pills() {
  const wrapper = document.getElementById('step5ModelPillsWrapper');
  const container = document.getElementById('step5ModelPills');
  if (!wrapper || !container) return;

  if (window.currentStep5Rows.length === 0) {
    wrapper.style.display = 'none';
    container.innerHTML = '';
    window.activeStep5Model = null;
    return;
  }

  wrapper.style.display = 'block';

  const availableModels = window.currentStep5Rows.map(tr => tr.querySelectorAll('td')[0]?.innerText || 'Unknown Model');
  if (!window.activeStep5Model || !availableModels.includes(window.activeStep5Model)) {
    window.activeStep5Model = availableModels[0];
  }

  let html = '';
  availableModels.forEach((modelName) => {
    const isActive = modelName === window.activeStep5Model ? 'active' : '';
    html += `<div class="domain-pill ${isActive}" data-model="${modelName}" style="cursor:pointer;">${modelName}</div>`;
  });
  
  container.innerHTML = html;

  const pills = container.querySelectorAll('.domain-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      window.activeStep5Model = e.target.getAttribute('data-model');
      renderStep5Pills();
      if (typeof window.renderStep5Metrics === 'function') window.renderStep5Metrics(window.currentStep5Rows, true);
      if (typeof window.renderStep5Charts === 'function') window.renderStep5Charts(window.currentStep5Rows, true);
    });
  });
}

function renderStep5Metrics(bestRows, skipPillsRender = false) {
  window.currentStep5Rows = bestRows;
  if (!skipPillsRender) {
    renderStep5Pills();
  }

  const container = document.getElementById('step5MetricsContainer');
  if (!container) return;

  if (bestRows.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0;">No models trained yet. Please train a model in Step 4.</div>';
    return;
  }

  const rowToRender = bestRows.find(tr => {
    return (tr.querySelectorAll('td')[0]?.innerText || 'Unknown Model') === window.activeStep5Model;
  }) || bestRows[0];

  if (!rowToRender) return;

  const tds = rowToRender.querySelectorAll('td');
  const modelName = tds[0]?.innerText || 'Unknown Model';
  const acc = tds[1]?.innerText || '0%';
  const sens = tds[2]?.innerText || '0%';
  const sensNum = parseInt(sens.replace('%', ''), 10) || 0;
  const sensCls = sensNum >= 70 ? 'good' : sensNum >= 50 ? 'warn' : 'bad';
  const spec = tds[3]?.innerText || '0%';
  const auc = tds[4]?.innerText || '0.0';
  const prec = rowToRender.dataset.precision || '0%';
  const f1 = rowToRender.dataset.f1 || '0%';

  let html = `
    <div class="card-title">
      Performance Metrics — ${modelName} on Test Patients
    </div>
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-val">${acc}</div>
        <div class="kpi-name">Accuracy</div>
        <div class="kpi-note">Overall correct predictions out of all test patients</div>
      </div>
      <div class="kpi ${sensCls}">
        <div class="kpi-val">${sens}</div>
        <div class="kpi-name">Sensitivity ★</div>
        <div class="kpi-note">Of patients who WERE readmitted, how many did we catch?</div>
      </div>
      <div class="kpi good">
        <div class="kpi-val">${spec}</div>
        <div class="kpi-name">Specificity</div>
        <div class="kpi-note">Of patients who were NOT readmitted, how many did we correctly call safe?</div>
      </div>
    </div>
    <div class="kpis" style="margin-top:10px;">
      <div class="kpi">
        <div class="kpi-val">${prec}</div>
        <div class="kpi-name">Precision</div>
        <div class="kpi-note">Of patients we flagged as high risk, how many actually were?</div>
      </div>
      <div class="kpi">
        <div class="kpi-val">${f1}</div>
        <div class="kpi-name">F1 Score</div>
        <div class="kpi-note">Balance between catching cases and avoiding false alarms</div>
      </div>
      <div class="kpi good">
        <div class="kpi-val">${auc}</div>
        <div class="kpi-name">AUC-ROC</div>
        <div class="kpi-note">Overall ability to separate readmitted from not-readmitted</div>
      </div>
    </div>
  `;
  if (sensNum < 50) {
    html += `
    <div class="banner bad" style="margin-top:12px;">
      <div class="banner-icon">⚠️</div>
      <div><b>Low Sensitivity:</b> This model misses ${100 - sensNum}% of patients who will actually be readmitted. Consider adjusting parameters or trying another model.</div>
    </div>`;
  }

  let rocPoints = [];
  try {
    if (rowToRender.dataset.rocPoints) {
      rocPoints = JSON.parse(rowToRender.dataset.rocPoints);
    }
  } catch (e) { }

  let pathD = '';
  if (rocPoints.length > 0) {
    pathD = rocPoints.map((pt, i) => {
      const px = 30 + pt.x * 260; // 30 to 290
      const py = 150 - pt.y * 140; // 150 to 10
      return (i === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
    }).join(' ');
  } else {
    pathD = "M30,150 L290,10";
  }

  html += `
    <div class="card" style="margin-top:16px;">
      <div class="card-title">ROC Curve — ${modelName}</div>
      <svg class="roc-svg" viewBox="0 0 300 160" preserveAspectRatio="xMidYMid meet"
        style="border:1px solid var(--line);border-radius:12px;background:#f7f9fb;width:100%;height:auto;">
        <text x="10" y="14" fill="currentColor" style="color:var(--text-muted)" font-size="9" font-family="DM Mono">1.0</text>
        <text x="10" y="152" fill="currentColor" style="color:var(--text-muted)" font-size="9" font-family="DM Mono">0</text>
        <text x="270" y="152" fill="currentColor" style="color:var(--text-muted)" font-size="9" font-family="DM Mono">1.0</text>
        <line x1="30" y1="10" x2="30" y2="150" stroke="#dde4ea" stroke-width="1" />
        <line x1="30" y1="150" x2="290" y2="150" stroke="#dde4ea" stroke-width="1" />
        <line x1="30" y1="150" x2="290" y2="10" stroke="#dde4ea" stroke-width="1" stroke-dasharray="4,3" />
        <path d="${pathD}" fill="none" stroke="currentColor" style="color:var(--primary)" stroke-width="2.5" />
        <text x="100" y="90" fill="currentColor" style="color:var(--primary)" font-size="10" font-weight="bold" font-family="DM Sans">AUC = ${(parseFloat(auc) || 0).toFixed(2)}</text>
      </svg>
    </div>
  `;

  container.innerHTML = html;
}

window.renderStep5Metrics = renderStep5Metrics;

window.renderStep5Charts = function (bestRows, skipPillsRender = false) {
  window.currentStep5Rows = bestRows;
  const container = document.getElementById('step5ChartsContainer');
  if (!container) return;

  if (bestRows.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0;">No charts to display.</div>';
    return;
  }

  const rowToRender = bestRows.find(tr => {
    return (tr.querySelectorAll('td')[0]?.innerText || 'Unknown Model') === window.activeStep5Model;
  }) || bestRows[0];

  if (!rowToRender) return;

  const tds = rowToRender.querySelectorAll('td');
  const modelName = tds[0]?.innerText || 'Unknown Model';

  const tn = parseInt(rowToRender.dataset.tn || '0', 10);
  const fp = parseInt(rowToRender.dataset.fp || '0', 10);
  const fn = parseInt(rowToRender.dataset.fn || '0', 10);
  const tp = parseInt(rowToRender.dataset.tp || '0', 10);

  let fnWarning = fn > 0
    ? `<div class="banner bad" style="margin-top:12px;">
         <div class="banner-icon">❌</div>
         <div><b>${fn} patient${fn !== 1 ? 's' : ''} missed (False Negative${fn !== 1 ? 's' : ''}).</b> These patients were sent home without extra support but returned to hospital.</div>
       </div>`
    : `<div class="banner good" style="margin-top:12px;">
         <div class="banner-icon">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--good);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
         </div>
         <div><b>0 patients missed!</b> The model successfully caught all readmissions in the test set.</div>
       </div>`;

  let fpWarning = `<div class="banner info" style="margin-top:8px;">
          <div class="banner-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--info);"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg></div>
          <div><b>${fp} False Positive${fp !== 1 ? 's' : ''}</b> caused unnecessary follow-up calls. This is a cost, but usually preferable to missing real readmissions.</div>
        </div>`;

  let html = `
    <div class="card">
      <div class="card-title">Confusion Matrix — ${modelName}</div>
      <div style="font-size:12px;color:var(--mid);margin-bottom:10px;">Predictions vs. Actual for test patients.</div>
      <div class="cm-grid">
        <div class="cm-corner"></div>
        <div class="cm-col-hdr">Predicted: NOT Readmitted</div>
        <div class="cm-col-hdr">Predicted: READMITTED</div>
        <div class="cm-row-hdr" style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:10px;font-weight:600;color:var(--muted);">
          Actual: NOT Readmitted</div>
        <div class="cm-cell cm-tn">
          <div class="cm-num">${tn}</div>
          <div class="cm-lbl">✔️ Correctly called safe</div>
        </div>
        <div class="cm-cell cm-fp">
          <div class="cm-num">${fp}</div>
          <div class="cm-lbl">⚠️ False alarm</div>
        </div>
        <div class="cm-row-hdr" style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:10px;font-weight:600;color:var(--muted);">
          Actual: READMITTED</div>
        <div class="cm-cell cm-fn">
          <div class="cm-num">${fn}</div>
          <div class="cm-lbl">❌ Missed (Returned)</div>
        </div>
        <div class="cm-cell cm-tp">
          <div class="cm-num">${tp}</div>
          <div class="cm-lbl">✔️ Correctly flagged risk</div>
        </div>
      </div>
      ${fnWarning}
      ${fpWarning}
    </div>
  `;

  container.innerHTML = html;
};
