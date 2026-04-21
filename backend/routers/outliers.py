from fastapi import APIRouter, HTTPException
import pandas as pd
from typing import List, Dict, Any
from schemas import OutlierRequest
from utils import _norm_col_name

# Import from ml package
try:
    from ml.preprocessing.cleaner import detect_outliers_iqr
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from ml.preprocessing.cleaner import detect_outliers_iqr

router = APIRouter(prefix="/api", tags=["outliers"])

@router.post("/detect-outliers")
async def detect_outliers(req: OutlierRequest):
    """
    Detect outliers using the IQR method (1.5 * IQR rule).
    """
    try:
        df = pd.DataFrame(req.rawRows)
        if df.empty:
            return {"total_count": 0, "outliers_found": 0, "percentage": 0, "details": []}
        
        num_cols = [_norm_col_name(c.get("name")) for c in req.columns if c.get("role") in ["numeric", "feature"]]
        # Ensure we only check columns that are actually numeric in the dataframe
        num_cols = [c for c in num_cols if c in df.columns]
        
        result = detect_outliers_iqr(df, num_cols)
        return result
        
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
