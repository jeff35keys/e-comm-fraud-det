"""
rules_engine.py
Deterministic rule-based checks that run alongside the ML model, per the
"Hybrid Fraud Detection" approach justified in Chapter 2 (2.6.4): rules for
speed/compliance/hard blocks, ML for nuanced probabilistic scoring.

Each rule returns (triggered: bool, weight: float, reason: str).
Weights are summed into a rule_score in [0,1] and combined with the ML
probability to produce the final decision.
"""
from typing import List, Tuple

HIGH_RISK_COUNTRIES = {"RU", "CN"}
MAX_SINGLE_AMOUNT = 1_000_000       # NGN, hard review threshold
VELOCITY_LIMIT_1H = 5               # >5 txns/hour from same user -> flag
MAX_FAILED_ATTEMPTS = 3

# Simple in-memory blacklist placeholder; in production this is a Supabase
# table (see database/schema.sql: blacklist) queried by the Node backend
# before calling this service.
BLACKLISTED_EMAILS = set()
BLACKLISTED_IPS = set()
BLACKLISTED_CARD_BINS = set()


def evaluate_rules(txn: dict) -> Tuple[float, List[str], bool]:
    """
    txn keys expected: amount, txn_count_1h, is_high_risk_country,
    billing_shipping_mismatch, failed_attempts_last_hour, email, ip,
    card_bin, is_new_device, is_new_location, distance_km
    Returns (rule_score 0-1, reasons list, hard_block bool)
    """
    reasons: List[str] = []
    score = 0.0
    hard_block = False

    if txn.get("email") in BLACKLISTED_EMAILS or txn.get("ip") in BLACKLISTED_IPS \
            or txn.get("card_bin") in BLACKLISTED_CARD_BINS:
        reasons.append("Blacklisted identity/device/card BIN")
        return 1.0, reasons, True

    if txn.get("amount", 0) > MAX_SINGLE_AMOUNT:
        score += 0.35
        reasons.append(f"Amount exceeds single-transaction threshold ({MAX_SINGLE_AMOUNT:,})")

    if txn.get("txn_count_1h", 0) > VELOCITY_LIMIT_1H:
        score += 0.30
        reasons.append(f"Velocity check: >{VELOCITY_LIMIT_1H} transactions in the last hour")

    if txn.get("is_high_risk_country"):
        score += 0.15
        reasons.append("Transaction originates from a high-risk country")

    if txn.get("billing_shipping_mismatch"):
        score += 0.15
        reasons.append("Billing and shipping address/country mismatch")

    if txn.get("failed_attempts_last_hour", 0) >= MAX_FAILED_ATTEMPTS:
        score += 0.25
        reasons.append("Repeated failed payment attempts (possible card testing)")

    if txn.get("is_new_device") and txn.get("is_new_location") and txn.get("amount", 0) > 200_000:
        score += 0.20
        reasons.append("New device + new location combined with a large amount")

    if txn.get("distance_km", 0) > 1500 and txn.get("is_new_location"):
        score += 0.10
        reasons.append("Geolocation implausibly far from user's usual location")

    return min(score, 1.0), reasons, hard_block


def combine_decision(ml_probability: float, rule_score: float, hard_block: bool) -> dict:
    """
    Combines ML probability with rule score into a final decision, matching
    the "Decision & Alert System" described in 2.5 of the project document.
    Weighted blend: 70% ML, 30% rules (ML carries more signal but rules catch
    hard, explainable, compliance-grade cases immediately).
    """
    if hard_block:
        return {
            "decision": "BLOCK",
            "final_score": 1.0,
            "ml_probability": round(ml_probability, 4),
            "rule_score": round(rule_score, 4),
        }

    final_score = round(0.7 * ml_probability + 0.3 * rule_score, 4)

    if final_score >= 0.75:
        decision = "BLOCK"
    elif final_score >= 0.40:
        decision = "REVIEW"      # e.g., trigger 3D Secure / manual review
    else:
        decision = "APPROVE"

    return {
        "decision": decision,
        "final_score": final_score,
        "ml_probability": round(ml_probability, 4),
        "rule_score": round(rule_score, 4),
    }
