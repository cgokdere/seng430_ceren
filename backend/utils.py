import os
import re
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from sklearn.metrics import accuracy_score, recall_score, confusion_matrix, precision_score, f1_score, roc_curve, roc_auc_score
from sklearn.inspection import permutation_importance
import math

try:
    import shap
except ImportError:
    shap = None  # type: ignore

def _encoded_column_to_original(encoded_col: str, orig_features: List[str], cat_cols: List[str]) -> str:
    if encoded_col in orig_features:
        return encoded_col
    for f in orig_features:
        prefix = f + "_"
        if encoded_col.startswith(prefix):
            return f
    return encoded_col

def _build_orig_column_map(encoded_cols: List[str], orig_features: List[str], cat_cols: List[str]) -> List[str]:
    return [_encoded_column_to_original(c, orig_features, cat_cols) for c in encoded_cols]

def _aggregate_rows_by_orig(values_per_encoded: np.ndarray, orig_per_col: List[str], orig_features: List[str]) -> np.ndarray:
    idx = {f: i for i, f in enumerate(orig_features)}
    out = np.zeros((values_per_encoded.shape[0], len(orig_features)))
    for j, ocol in enumerate(orig_per_col):
        if ocol not in idx:
            continue
        out[:, idx[ocol]] += values_per_encoded[:, j]
    return out

def _marginal_risk_contributions(model, X_test_np: np.ndarray, X_train_np: np.ndarray, pos_idx: int) -> np.ndarray:
    n_test, n_feat = X_test_np.shape
    med = np.median(X_train_np, axis=0)
    base = model.predict_proba(X_test_np)[:, pos_idx].astype(np.float64)
    out = np.zeros((n_test, n_feat), dtype=np.float64)
    for j in range(n_feat):
        Xm = X_test_np.copy()
        Xm[:, j] = med[j]
        out[:, j] = base - model.predict_proba(Xm)[:, pos_idx].astype(np.float64)
    return out

def _shap_matrix_or_marginal(model, m_type: str, X_train: pd.DataFrame, X_test: pd.DataFrame, pos_idx: int, X_train_np: np.ndarray, X_test_np: np.ndarray) -> np.ndarray:
    if shap is not None:
        try:
            if m_type in ("rf", "dt"):
                explainer = shap.TreeExplainer(model)
                sv = explainer.shap_values(X_test)
            elif m_type == "lr":
                explainer = shap.LinearExplainer(model, X_train)
                sv = explainer.shap_values(X_test)
            else:
                sv = None
            if sv is not None:
                if isinstance(sv, list):
                    sv = np.asarray(sv[pos_idx])
                else:
                    sv = np.asarray(sv)
                    if sv.ndim == 3:
                        sv = sv[:, :, pos_idx]
                return sv.astype(np.float64)
        except Exception:
            pass
    return _marginal_risk_contributions(model, X_test_np, X_train_np, pos_idx)

def _global_importance_permutation(model, X_test: pd.DataFrame, y_test: pd.Series, orig_per_col: List[str], orig_features: List[str]) -> Dict[str, float]:
    try:
        pi = permutation_importance(model, X_test, y_test, n_repeats=8, random_state=42, scoring="roc_auc")
        imp_enc = np.asarray(pi.importances_mean)
    except Exception:
        return {}
    agg: Dict[str, float] = {f: 0.0 for f in orig_features}
    for j, ocol in enumerate(orig_per_col):
        if ocol in agg and j < len(imp_enc):
            agg[ocol] += max(0.0, float(imp_enc[j]))
    return agg

def _build_explainability(model, m_type: str, X_train: pd.DataFrame, X_test: pd.DataFrame, y_test: pd.Series, y_pred: np.ndarray, df_test_raw: pd.DataFrame, orig_features: List[str], cat_cols: List[str], pos_idx: int, pos_label: Any, max_test_rows: int = 36) -> Dict[str, Any]:
    encoded_cols = list(X_train.columns)
    orig_per_col = _build_orig_column_map(encoded_cols, orig_features, cat_cols)
    X_train_np = X_train.to_numpy(dtype=np.float64)
    X_test_np = X_test.to_numpy(dtype=np.float64)
    local_enc = _shap_matrix_or_marginal(model, m_type, X_train, X_test, pos_idx, X_train_np, X_test_np)
    local_enc = np.nan_to_num(local_enc, nan=0.0, posinf=0.0, neginf=0.0)
    local_orig = _aggregate_rows_by_orig(local_enc, orig_per_col, orig_features)
    glob_from_local = np.mean(np.abs(local_orig), axis=0)
    global_dict = {orig_features[i]: float(glob_from_local[i]) for i in range(len(orig_features))}
    perm_agg = _global_importance_permutation(model, X_test, y_test, orig_per_col, orig_features)
    if perm_agg:
        mx = max(global_dict.values()) if global_dict.values() else 1.0
        mx = mx if mx > 1e-12 else 1.0
        for f in orig_features:
            global_dict[f] = 0.6 * global_dict[f] + 0.4 * ((perm_agg.get(f, 0.0) / (max(perm_agg.values()) or 1.0)) * mx)
    fi_sorted = sorted([{"feature": f, "importance": float(global_dict.get(f, 0.0))} for f in orig_features], key=lambda x: x["importance"], reverse=True)
    n_test = len(X_test)
    n_take = min(max_test_rows, n_test)
    probs = model.predict_proba(X_test)[:n_take, pos_idx] if hasattr(model, "predict_proba") else np.zeros(n_take)
    test_explanations: List[Dict[str, Any]] = []
    for i in range(n_take):
        row_vals = local_orig[i]
        order = np.argsort(-np.abs(row_vals))
        top_k = order[: min(10, len(order))]
        contributions: List[Dict[str, Any]] = []
        for j in top_k:
            fname = orig_features[int(j)]
            impact = float(row_vals[int(j)])
            raw_v = df_test_raw.iloc[i][fname] if fname in df_test_raw.columns else None
            disp = raw_v if raw_v is not None and not (isinstance(raw_v, float) and np.isnan(raw_v)) else ""
            contributions.append({"feature": fname, "value": disp, "impact": impact, "direction": "increase_risk" if impact >= 0 else "decrease_risk"})
        pl = float(probs[i])
        test_explanations.append({"patient_index": i + 1, "prob_positive": round(pl * 100, 1), "prob_positive_raw": pl, "actual_label": str(y_test.iloc[i]), "predicted_label": str(y_pred[i]), "contributions": contributions})
    return {"feature_importance": fi_sorted, "test_explanations": test_explanations, "positive_class": str(pos_label)}

def _norm_col_name(name: Any) -> str:
    return str(name).lstrip("\ufeff").strip() if name is not None else ""

def _detect_gender_column_fairness(df: pd.DataFrame) -> Optional[str]:
    for c in df.columns:
        cl = str(c).lower().strip()
        if "gender" in cl or cl == "sex" or cl.startswith("sex"): return c
    return None

def _detect_age_column_fairness(df: pd.DataFrame) -> Optional[str]:
    cols = list(df.columns)
    for c in cols:
        if _norm_col_name(str(c)).lower() == "age_raw": return c
    for c in cols:
        cl = str(c).lower()
        if cl.endswith("_raw"):
            base = re.sub(r"_raw$", "", str(c), flags=re.IGNORECASE)
            if _is_demographic_fairness_col(base): return c
    for c in cols:
        if _norm_col_name(str(c)).lower() == "age": return c
    return None

def _is_demographic_fairness_col(name: str) -> bool:
    n = _norm_col_name(name).lower()
    return n in ("age", "sex", "gender") or "gender" in n or n == "sex" or n.endswith("_sex") or n.startswith("sex_") or n in ("patient_age", "age_years", "age_year") or re.match(r"^age$", n) or re.match(r"^age_\w+$", n) or re.match(r"^\w+_age$", n)

def _parse_age_val(val: Any) -> Optional[float]:
    try:
        return float(val) if val is not None and not (isinstance(val, float) and np.isnan(val)) else None
    except (TypeError, ValueError): return None

def _gender_display_label(val: Any) -> str:
    s = str(val).strip().lower()
    if s in ("f", "female", "woman", "1", "true"): return "Female"
    if s in ("m", "male", "man", "0", "false"): return "Male"
    return str(val).strip()[:48]

def _subgroup_metrics_cm(y_true: np.ndarray, y_pred: np.ndarray, pos_label: Any, labels: np.ndarray) -> Optional[Dict[str, float]]:
    n = len(y_true)
    if n == 0: return None
    acc = float(accuracy_score(y_true, y_pred))
    if n < 2 or len(np.unique(np.concatenate([y_true, y_pred]))) < 2:
        return {"n": n, "accuracy": acc, "sensitivity": 0.0, "specificity": 0.0}
    try:
        cm = confusion_matrix(y_true, y_pred, labels=labels)
        if cm.shape == (2, 2):
            lbl_arr = np.asarray(labels).ravel()
            pos_i = next((i for i, lb in enumerate(lbl_arr) if lb == pos_label or str(lb) == str(pos_label)), 0)
            neg_i = 1 - pos_i
            tp, fn, fp, tn = float(cm[pos_i, pos_i]), float(cm[pos_i, neg_i]), float(cm[neg_i, pos_i]), float(cm[neg_i, neg_i])
            sens = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            spec = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        else:
            sens = float(recall_score(y_true, y_pred, pos_label=pos_label, zero_division=0))
            spec = 0.0
    except Exception:
        sens = float(recall_score(y_true, y_pred, pos_label=pos_label, zero_division=0))
        spec = 0.0
    return {"n": n, "accuracy": acc, "sensitivity": sens, "specificity": spec}

def _compute_fairness_subgroups(df_test: pd.DataFrame, y_test: pd.Series, y_pred: np.ndarray, pos_label: Any, labels: np.ndarray) -> Dict[str, Any]:
    y_true_a = np.asarray(y_test.values)
    y_pred_a = np.asarray(y_pred).ravel()
    if len(y_true_a) != len(y_pred_a): return {"subgroups": [], "sensitivity_max_gap_pp": 0.0, "bias_warning": False, "min_subgroup_n": 5}
    subgroups: List[Dict[str, Any]] = []
    gcol = _detect_gender_column_fairness(df_test)
    if gcol and gcol in df_test.columns:
        uniq = pd.Series(df_test[gcol]).dropna().unique().tolist()
        for v in uniq[:8]:
            mask = pd.Series(df_test[gcol]).eq(v).to_numpy()
            if mask.sum() == 0: continue
            m = _subgroup_metrics_cm(y_true_a[mask], y_pred_a[mask], pos_label, labels)
            if m: subgroups.append({"label": f"Sex: {_gender_display_label(v)}", "n": int(m["n"]), "accuracy": m["accuracy"], "sensitivity": m["sensitivity"], "specificity": m["specificity"]})
    acol = _detect_age_column_fairness(df_test)
    if acol and acol in df_test.columns:
        ages = df_test[acol].map(_parse_age_val)
        bucket_defs = [("Age 18–60", lambda a: a.notna() & (a >= 18) & (a <= 60)), ("Age 61–75", lambda a: a.notna() & (a >= 61) & (a <= 75)), ("Age 76+", lambda a: a.notna() & (a >= 76))]
        for bname, pred in bucket_defs:
            mask = np.asarray(pred(ages))
            if mask.sum() == 0: continue
            m = _subgroup_metrics_cm(y_true_a[mask], y_pred_a[mask], pos_label, labels)
            if m: subgroups.append({"label": bname, "n": int(m["n"]), "accuracy": m["accuracy"], "sensitivity": m["sensitivity"], "specificity": m["specificity"]})
    valid = [s for s in subgroups if s["n"] >= 5]
    gap_pp, bias_warning = 0.0, False
    if len(valid) >= 2:
        sens_vals = [float(s["sensitivity"]) for s in valid]
        gap_pp = (max(sens_vals) - min(sens_vals)) * 100.0
        bias_warning = gap_pp > 10.0 + 1e-9
    return {"subgroups": subgroups, "sensitivity_max_gap_pp": round(float(gap_pp), 1), "bias_warning": bias_warning, "min_subgroup_n": 5}

def get_stats(df, col_name, col_type):
    if col_type == 'numeric' and col_name in df.columns:
        series = pd.to_numeric(df[col_name], errors='coerce')
        valid_data = series.dropna()
        if len(valid_data) == 0: return None
        return {"min": float(valid_data.min()), "max": float(valid_data.max()), "mean": float(valid_data.mean()), "std": float(valid_data.std())}
    return None

def get_aggregate_numeric_stats(df: pd.DataFrame, numeric_cols: List[str]):
    if df is None or df.empty or not numeric_cols: return None
    cols = [c for c in numeric_cols if c in df.columns]
    if not cols: return None
    m = df[cols].apply(pd.to_numeric, errors='coerce')
    vals = m.to_numpy().astype(np.float64).ravel()
    vals = vals[~np.isnan(vals)]
    if vals.size == 0: return None
    return {"min": float(np.min(vals)), "max": float(np.max(vals)), "mean": float(np.mean(vals))}

def get_class_balance(df, target_col):
    if target_col not in df.columns: return {}
    counts = df[target_col].value_counts(dropna=True)
    total = len(df[target_col].dropna())
    if total == 0: return {}
    return {str(k): {"count": int(v), "pct": round((int(v) / total) * 100, 1)} for k, v in counts.items()}

def clean_nans(obj: Any) -> Any:
    """Recursively replace NaN and Inf with None and convert MUST everything to native Python types."""
    # Handle Dictionaries
    if isinstance(obj, dict):
        return {str(k): clean_nans(v) for k, v in obj.items()}
    
    # Handle Sequences (lists, tuples, numpy arrays)
    if isinstance(obj, (list, tuple, np.ndarray)):
        # obj.tolist() handles nested conversion for numpy arrays, but we still recurse for safety
        if isinstance(obj, np.ndarray):
            return [clean_nans(x) for x in obj.tolist()]
        return [clean_nans(x) for x in obj]
    
    # Handle Numpy and standard Floats
    if isinstance(obj, (float, np.floating)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    
    # Handle Numpy and standard Integers
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    
    # Handle Numpy and standard Booleans
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    
    # Handle None
    if obj is None:
        return None
        
    # Handle strings (including numpy strings)
    if isinstance(obj, (str, np.str_, np.unicode_)):
        return str(obj)
    
    # Fallback for any other type (unlikely, but safe for JSON)
    return str(obj)

def safe_json_serialize(df: pd.DataFrame) -> pd.DataFrame:
    """Replace NaNs and Infs in a DataFrame with None."""
    return df.replace([np.inf, -np.inf, np.nan], None)

def _resolve_target_column(requested: str, df_columns: List[str]) -> Optional[str]:
    req_n = _norm_col_name(requested)
    if req_n in df_columns: return req_n
    low = {c.lower(): c for c in df_columns}
    if req_n.lower() in low: return low[req_n.lower()]
    return None
