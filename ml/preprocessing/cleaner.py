from typing import List, Dict, Any, Set
import pandas as pd
import numpy as np

def detect_outliers_iqr(df: pd.DataFrame, num_cols: List[str]) -> Dict[str, Any]:
    """
    Detect outliers using the IQR method (1.5 * IQR rule).
    """
    if df.empty:
        return {"total_count": 0, "outliers_found": 0, "percentage": 0, "details": []}
    
    # Ensure columns are numeric
    valid_cols = [c for c in num_cols if c in df.columns]
    for col in valid_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    outlier_indices = set()
    details = []
    total_rows = len(df)
    
    for col in valid_cols:
        series = df[col].dropna()
        if series.empty: continue
        
        Q1 = series.quantile(0.25)
        Q3 = series.quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        
        col_outliers = df[(df[col] < lower_bound) | (df[col] > upper_bound)]
        count = len(col_outliers)
        
        if count > 0:
            outlier_indices.update(col_outliers.index.tolist())
            details.append({
                "column": col,
                "count": count,
                "min": float(series.min()),
                "max": float(series.max()),
                "lower_bound": float(lower_bound),
                "upper_bound": float(upper_bound)
            })

    return {
        "total_count": total_rows,
        "outliers_found": len(outlier_indices),
        "percentage": round((len(outlier_indices) / total_rows) * 100, 1) if total_rows > 0 else 0,
        "details": details,
        "outlier_indices": list(outlier_indices)
    }

def filter_outliers(df: pd.DataFrame, num_cols: List[str]) -> pd.DataFrame:
    """
    Remove rows containing outliers based on IQR.
    """
    result = detect_outliers_iqr(df, num_cols)
    indices_to_drop = result.get("outlier_indices", [])
    if indices_to_drop:
        return df.drop(index=indices_to_drop)
    return df
