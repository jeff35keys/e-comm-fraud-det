"""
app.py - FastAPI fraud-scoring microservice.

Exposes:
  GET  /health
  POST /predict   -> ML probability + rule engine + combined decision
  GET  /metrics    -> the offline evaluation metrics from training (for the
                      "Chapter 4/5: Results" section of the report)

Run: uvicorn app:app --host 0.0.0.0 --port 8000
"""
import json
import os
from typing import Optional

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from rules_engine import evaluate_rules, combine_decision

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")
METRICS_PATH = os.path.join(os.path.dirname(__file__), "model_metrics.json")

app = FastAPI(title="SUG E-Commerce Fraud Detection Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production to the backend's origin
    allow_methods=["*"],
    allow_headers=["*"],
)

_model = None
_metrics = None


def get_model():
    global _model
    if _model is None:
        if not os.path.exists(MODEL_PATH):
            raise HTTPException(status_code=503, detail="Model not trained yet. Run train_model.py first.")
        _model = joblib.load(MODEL_PATH)
    return _model


class TransactionIn(BaseModel):
    amount: float = Field(..., gt=0, description="Transaction amount in NGN")
    hour: int = Field(..., ge=0, le=23)
    day_of_week: int = Field(..., ge=0, le=6)
    txn_count_1h: int = Field(0, ge=0, description="Number of transactions by this user in the last hour")
    avg_amount_deviation: float = Field(0.0, description="Std-devs from user's average spend")
    is_new_device: int = Field(0, ge=0, le=1)
    is_new_location: int = Field(0, ge=0, le=1)
    distance_km: float = Field(0.0, ge=0)
    account_age_days: int = Field(0, ge=0)
    is_high_risk_country: int = Field(0, ge=0, le=1)
    payment_method: str = Field("card", description="card | bank_transfer | ussd | mobile_money")
    billing_shipping_mismatch: int = Field(0, ge=0, le=1)
    failed_attempts_last_hour: int = Field(0, ge=0)
    # optional identity fields, used only by the rules engine
    email: Optional[str] = None
    ip: Optional[str] = None
    card_bin: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": os.path.exists(MODEL_PATH)}


@app.get("/metrics")
def metrics():
    global _metrics
    if _metrics is None:
        if not os.path.exists(METRICS_PATH):
            raise HTTPException(status_code=404, detail="No metrics found. Train the model first.")
        with open(METRICS_PATH) as f:
            _metrics = json.load(f)
    return _metrics


@app.post("/predict")
def predict(txn: TransactionIn):
    model = get_model()
    features = [
        "amount", "hour", "day_of_week", "txn_count_1h", "avg_amount_deviation",
        "is_new_device", "is_new_location", "distance_km", "account_age_days",
        "is_high_risk_country", "billing_shipping_mismatch", "failed_attempts_last_hour",
        "payment_method",
    ]
    row = {k: getattr(txn, k) for k in features}
    X = pd.DataFrame([row])

    ml_probability = float(model.predict_proba(X)[0][1])

    rule_input = row.copy()
    rule_input.update({"email": txn.email, "ip": txn.ip, "card_bin": txn.card_bin})
    rule_score, reasons, hard_block = evaluate_rules(rule_input)

    result = combine_decision(ml_probability, rule_score, hard_block)
    result["reasons"] = reasons
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
