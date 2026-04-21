/**
 * Renders a diagnostic banner if model results indicate overfitting or perfect scores.
 * 
 * @param {Object} results - Model results object containing diagnostic flags
 * @returns {HTMLElement|null} - The banner element or null if no banner is needed
 */
function renderOverfitBanner(results) {
  console.log('--- OverfitBanner Diagnostic ---');
  console.log('Results received:', results);
  console.log('Types:', {
    perfectScore: typeof results.perfectScore,
    overfitSuspected: typeof results.overfitSuspected
  });
  const perfectScore = results.perfectScore === true || String(results.perfectScore) === 'true' || results.perfectScore === 1 || String(results.perfectScore) === '1' ||
    results.perfect_score === true || String(results.perfect_score) === 'true' || results.perfect_score === 1 || String(results.perfect_score) === '1';

  const overfitSuspected = results.overfitSuspected === true || String(results.overfitSuspected) === 'true' || results.overfitSuspected === 1 || String(results.overfitSuspected) === '1' ||
    results.overfit_suspected === true || String(results.overfit_suspected) === 'true' || results.overfit_suspected === 1 || String(results.overfit_suspected) === '1';

  const cvMean = parseFloat(results.cvMean || results.cv_mean || 0).toFixed(3);
  const cvStd = parseFloat(results.cvStd || results.cv_std || 0).toFixed(3);
  const overfitReason = results.overfitReason || results.overfit_reason || 'High variance or drop in test performance detected.';

  if (!perfectScore && !overfitSuspected) {
    return null;
  }

  const banner = document.createElement('div');
  banner.className = 'overfit-banner';
  banner.style.padding = '16px 20px';
  banner.style.borderRadius = 'var(--radius-md, 12px)';
  banner.style.marginBottom = '20px';
  banner.style.display = 'flex';
  banner.style.gap = '16px';
  banner.style.alignItems = 'flex-start';
  banner.style.animation = 'fadeInScale 0.4s ease';
  banner.style.border = '1px solid';

  let title = '';
  let description = '';
  let bgColor = '';
  let textColor = '';
  let borderColor = '';
  let icon = '⚠️';

  if (perfectScore) {
    title = 'Perfect Score Detected';
    description = 'This model achieved near-perfect results. This may indicate data leakage, overfitting, or an overly simple dataset. Clinical use requires careful validation.';
    bgColor = 'var(--bad-bg, #FEF0F0)';
    textColor = 'var(--bad, #B91C1C)';
    borderColor = 'rgba(185, 28, 28, 0.2)';
  } else if (overfitSuspected) {
    title = 'Overfitting Suspected';
    description = overfitReason;
    bgColor = 'var(--warn-bg, #FEF3E2)';
    textColor = 'var(--warn, #A05C00)';
    borderColor = 'rgba(160, 92, 0, 0.2)';
  }

  banner.style.backgroundColor = bgColor;
  banner.style.color = textColor;
  banner.style.borderColor = borderColor;

  banner.innerHTML = `
    <div style="font-size: 24px; line-height: 1;">${icon}</div>
    <div style="flex: 1;">
      <div style="font-weight: 800; font-size: 16px; margin-bottom: 4px; letter-spacing: -0.01em;">${title}</div>
      <div style="font-size: 13px; line-height: 1.5; opacity: 0.9; margin-bottom: 10px;">${description}</div>
      <div style="display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px; background: rgba(0,0,0,0.05); border-radius: 6px; font-size: 11px; font-weight: 700; font-family: var(--mono, monospace);">
        Cross-validation: ${cvMean} ± ${cvStd}
      </div>
    </div>
  `;

  return banner;
}
