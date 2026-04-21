from fastapi import APIRouter, HTTPException
try:
    from store import results_db
except ImportError:
    from ..store import results_db

router = APIRouter(prefix="/api", tags=["results"])

@router.get("/results/{result_id}")
async def get_result(result_id: str):
    if result_id not in results_db:
        raise HTTPException(status_code=404, detail="Result not found")
    
    result = results_db[result_id]
    
    # Ensure all required fields are present in the response
    # overfit_suspected (bool)
    # perfect_score (bool)
    # cv_mean (float)
    # cv_std (float)
    # overfit_reason (string)
    
    return {
        "overfit_suspected": result.get("overfit_suspected", False),
        "perfect_score": result.get("perfect_score", False),
        "cv_mean": result.get("cv_mean", 0.0),
        "cv_std": result.get("cv_std", 0.0),
        "overfit_reason": result.get("overfit_reason", ""),
        "accuracy": result.get("accuracy", "0%"),
        "train_accuracy": result.get("train_accuracy", "0%"),
        "sensitivity": result.get("sensitivity", "0%"),
        "specificity": result.get("specificity", "0%"),
        "precision": result.get("precision", "0%"),
        "f1_score": result.get("f1_score", "0%"),
        "auc": result.get("auc", 0.0),
        "tn": result.get("tn", 0),
        "fp": result.get("fp", 0),
        "fn": result.get("fn", 0),
        "tp": result.get("tp", 0),
        "model_id": result.get("model_id", ""),
        "model_name_display": result.get("model_name_display", "")
    }
