from fastapi import APIRouter, HTTPException
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from schemas import PrepareRequest
from utils import (
    get_class_balance, get_stats, get_aggregate_numeric_stats, 
    _resolve_target_column, _norm_col_name, _is_demographic_fairness_col,
    safe_json_serialize, clean_nans
)

# Import from ml package
try:
    from ml.preprocessing.cleaner import filter_outliers
    from ml.preprocessing.transformer import impute_missing_values, normalize_data, apply_smote
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from ml.preprocessing.cleaner import filter_outliers
    from ml.preprocessing.transformer import impute_missing_values, normalize_data, apply_smote

router = APIRouter(prefix="/api", tags=["preprocessing"])

@router.post("/prepare")
async def prepare_data(req: PrepareRequest):
    try:
        warnings = []
        df = pd.DataFrame(req.rawRows)
        df = df.rename(columns={c: _norm_col_name(c) for c in df.columns})
        if df.empty:
            raise HTTPException(status_code=400, detail="Empty dataset provided")

        target_col = _resolve_target_column(req.targetColumn, list(df.columns))
        if not target_col:
            raise HTTPException(status_code=400, detail=f"Target column '{req.targetColumn}' not found in data")

        feature_cols = [_norm_col_name(c.get("name")) for c in req.columns if c.get("role") in ["numeric", "category"]]
        num_cols = [_norm_col_name(c.get("name")) for c in req.columns if c.get("role") == "numeric"]
        cat_cols = [_norm_col_name(c.get("name")) for c in req.columns if c.get("role") == "category"]

        # --- OUTLIER REMOVAL (ML calling) ---
        dropped_outliers = 0
        if req.settings.removeOutliers and num_cols:
            before_len = len(df)
            df = filter_outliers(df, num_cols)
            dropped_outliers = before_len - len(df)
            if dropped_outliers > 0:
                warnings.append(f"Removed {dropped_outliers} outlier rows based on IQR.")

        before_stats = {
            "class_balance": get_class_balance(df, target_col),
            "features": {col: get_stats(df, col, 'numeric') for col in num_cols},
            "numeric_aggregate": get_aggregate_numeric_stats(df, num_cols)
        }

        keep_cols = list(dict.fromkeys(feature_cols + [target_col]))
        fairness_extra = [c for c in df.columns if c not in keep_cols and _is_demographic_fairness_col(c)]
        keep_cols = list(dict.fromkeys(keep_cols + fairness_extra))
        df = df[keep_cols].dropna(subset=[target_col])

        X, y = df[feature_cols].copy(), df[target_col]
        for col in num_cols: X[col] = pd.to_numeric(X[col], errors='coerce').astype(np.float64)

        from sklearn.model_selection import train_test_split
        try:
            min_class_count = int(y.value_counts().min())
            use_stratify = len(y.unique()) > 1 and min_class_count >= 2
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=req.settings.testSize, random_state=42, stratify=y if use_stratify else None)
        except ValueError:
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=req.settings.testSize, random_state=42)

        dem_cols = [c for c in fairness_extra if c in df.columns]
        df_test_dem = df.loc[X_test.index, dem_cols].copy() if dem_cols else None

        # Impute Missing Values (ML calling)
        if req.settings.missingValueStrategy == 'drop':
            tr_b, te_b = len(X_train), len(X_test)
            tm, tem = X_train.notna().all(axis=1), X_test.notna().all(axis=1)
            X_train, y_train, X_test, y_test = X_train[tm], y_train[tm], X_test[tem], y_test[tem]
            if df_test_dem is not None: df_test_dem = df_test_dem.loc[X_test.index]
        else:
            X_train, X_test = impute_missing_values(X_train, X_test, req.settings.missingValueStrategy, num_cols, cat_cols)

        fairness_raw_snapshots = {col: (X_train[col].values.copy(), X_test[col].values.copy()) for col in num_cols if _is_demographic_fairness_col(col) and col in X_test.columns}

        # Normalization (ML calling)
        X_train, X_test = normalize_data(X_train, X_test, req.settings.normalisation, num_cols)

        # SMOTE (ML calling)
        applied_smote = False
        class_balance_before_smote = get_class_balance(pd.DataFrame({target_col: y_train}), target_col)
        
        if req.settings.smote:
            X_train, y_train, applied_smote = apply_smote(X_train, y_train, cat_cols)
            if req.settings.smote and not applied_smote:
                warnings.append("SMOTE could not be applied (insufficient samples or error).")

        after_stats = {
            "class_balance_before_smote": class_balance_before_smote,
            "features": {col: get_stats(X_train, col, 'numeric') for col in num_cols},
            "numeric_aggregate": get_aggregate_numeric_stats(X_train, num_cols),
            "class_balance": get_class_balance(pd.DataFrame({target_col: y_train}), target_col),
            "applied_smote": applied_smote
        }

        try:
            numeric_cols = X_train.select_dtypes(include=['number']).columns.tolist()
            correlation_matrix = {"columns": numeric_cols, "data": X_train[numeric_cols].corr().round(3).values.tolist()} if len(numeric_cols) >= 2 else None
        except: correlation_matrix = None

        train_df, test_df = X_train.copy(), X_test.copy()
        train_df[target_col], test_df[target_col] = np.array(y_train), np.array(y_test)
        
        # Add demographic/fairness columns back
        if df_test_dem is not None:
            for c in df_test_dem.columns: test_df[c] = df_test_dem[c].values
        
        # Add raw snapshots for fairness analysis
        for col, (tr_raw, te_raw) in fairness_raw_snapshots.items(): test_df[col + "_raw"] = te_raw
        
        # Reverse scaling for raw snapshots if SMOTE was applied (to have reasonable values in fairness analysis)
        if applied_smote and fairness_raw_snapshots:
            for col, (tr_raw, te_raw) in fairness_raw_snapshots.items():
                if col in train_df.columns:
                    if req.settings.normalisation == 'zscore':
                        s, m = before_stats["features"][col].get("std", 1.0), before_stats["features"][col].get("mean", 0.0)
                        train_df[col + "_raw"] = train_df[col] * s + m
                    elif req.settings.normalisation == 'minmax':
                        mn, mx = before_stats["features"][col].get("min", 0.0), before_stats["features"][col].get("max", 1.0)
                        train_df[col + "_raw"] = train_df[col] * (mx - mn) + mn
                    else: train_df[col + "_raw"] = train_df[col]

        return clean_nans({
            "ok": True, 
            "trainRows": safe_json_serialize(train_df).to_dict(orient="records"), 
            "testRows": safe_json_serialize(test_df).to_dict(orient="records"), 
            "beforeStats": before_stats, 
            "afterStats": after_stats, 
            "warnings": warnings, 
            "correlation_matrix": correlation_matrix, 
            "meta": {"applied_smote": applied_smote}
        })
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
