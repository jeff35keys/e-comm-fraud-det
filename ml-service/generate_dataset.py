"""
generate_dataset.py
Generates a realistic synthetic e-commerce payment transaction dataset with
labeled fraud/legitimate cases, matching the features described in Chapter 3
(transaction amount, time, velocity, geolocation, device, payment method etc.)

This stands in for the Kaggle Credit Card Fraud + Online Payments datasets
referenced in the project methodology, but is generated locally so the model
can be trained end-to-end without external downloads, and so the feature set
matches exactly what the live Node backend can compute per-transaction.
"""
import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)
N_LEGIT = 48000
N_FRAUD = 900          # ~1.8% fraud rate -> realistic class imbalance
COUNTRIES = ["NG", "GH", "US", "UK", "CA", "ZA", "IN", "CN", "RU", "BR"]
HIGH_RISK_COUNTRIES = {"RU", "CN"}  # illustrative only, tune per real risk data
PAYMENT_METHODS = ["card", "bank_transfer", "ussd", "mobile_money"]


def gen_legit(n):
    amount = np.round(RNG.lognormal(mean=8.5, sigma=0.9, size=n), 2)  # NGN-ish amounts
    amount = np.clip(amount, 500, 500000)
    hour = RNG.integers(6, 23, size=n)  # legit shoppers mostly active daytime/evening
    day_of_week = RNG.integers(0, 7, size=n)
    txn_count_1h = RNG.poisson(0.4, size=n)  # low velocity
    avg_amount_deviation = np.abs(RNG.normal(0, 0.6, size=n))  # close to user's normal spend
    is_new_device = RNG.binomial(1, 0.06, size=n)
    is_new_location = RNG.binomial(1, 0.05, size=n)
    distance_km = np.abs(RNG.normal(5, 15, size=n))
    account_age_days = RNG.integers(1, 2000, size=n)
    country_idx = RNG.integers(0, len(COUNTRIES), size=n)
    country = np.array(COUNTRIES)[country_idx]
    is_high_risk_country = np.isin(country, list(HIGH_RISK_COUNTRIES)).astype(int)
    payment_method = RNG.choice(PAYMENT_METHODS, size=n, p=[0.55, 0.25, 0.12, 0.08])
    billing_shipping_mismatch = RNG.binomial(1, 0.03, size=n)
    failed_attempts_last_hour = RNG.poisson(0.1, size=n)
    label = np.zeros(n, dtype=int)
    return pd.DataFrame({
        "amount": amount, "hour": hour, "day_of_week": day_of_week,
        "txn_count_1h": txn_count_1h, "avg_amount_deviation": avg_amount_deviation,
        "is_new_device": is_new_device, "is_new_location": is_new_location,
        "distance_km": distance_km, "account_age_days": account_age_days,
        "is_high_risk_country": is_high_risk_country, "payment_method": payment_method,
        "billing_shipping_mismatch": billing_shipping_mismatch,
        "failed_attempts_last_hour": failed_attempts_last_hour, "label": label,
    })


def gen_fraud(n):
    # Fraud skews: odd hours, high velocity, large deviation from normal spend,
    # new devices/locations, high-risk country, mismatches, more failed attempts.
    amount = np.round(RNG.lognormal(mean=9.6, sigma=1.2, size=n), 2)
    amount = np.clip(amount, 1000, 2000000)
    hour = RNG.choice(range(0, 24), size=n, p=_night_weighted_hours())
    day_of_week = RNG.integers(0, 7, size=n)
    txn_count_1h = RNG.poisson(4.5, size=n)
    avg_amount_deviation = np.abs(RNG.normal(3.2, 1.5, size=n))
    is_new_device = RNG.binomial(1, 0.72, size=n)
    is_new_location = RNG.binomial(1, 0.68, size=n)
    distance_km = np.abs(RNG.normal(800, 600, size=n))
    account_age_days = RNG.integers(0, 60, size=n)  # newer accounts favored by fraudsters
    country_idx = RNG.choice(len(COUNTRIES), size=n, p=_fraud_weighted_countries())
    country = np.array(COUNTRIES)[country_idx]
    is_high_risk_country = np.isin(country, list(HIGH_RISK_COUNTRIES)).astype(int)
    payment_method = RNG.choice(PAYMENT_METHODS, size=n, p=[0.75, 0.1, 0.1, 0.05])
    billing_shipping_mismatch = RNG.binomial(1, 0.55, size=n)
    failed_attempts_last_hour = RNG.poisson(1.8, size=n)
    label = np.ones(n, dtype=int)
    return pd.DataFrame({
        "amount": amount, "hour": hour, "day_of_week": day_of_week,
        "txn_count_1h": txn_count_1h, "avg_amount_deviation": avg_amount_deviation,
        "is_new_device": is_new_device, "is_new_location": is_new_location,
        "distance_km": distance_km, "account_age_days": account_age_days,
        "is_high_risk_country": is_high_risk_country, "payment_method": payment_method,
        "billing_shipping_mismatch": billing_shipping_mismatch,
        "failed_attempts_last_hour": failed_attempts_last_hour, "label": label,
    })


def _night_weighted_hours():
    w = np.ones(24)
    for h in list(range(0, 6)) + [23]:
        w[h] = 4.0
    return w / w.sum()


def _fraud_weighted_countries():
    w = np.ones(len(COUNTRIES))
    for i, c in enumerate(COUNTRIES):
        if c in HIGH_RISK_COUNTRIES:
            w[i] = 5.0
    return w / w.sum()


def add_realistic_noise(df):
    """
    Real fraud data is never cleanly separable. Inject label noise and feature
    overlap so evaluation metrics reflect genuine classification difficulty
    instead of a trivially separable synthetic pattern.
    """
    n = len(df)
    numeric_cols = ["amount", "txn_count_1h", "avg_amount_deviation", "distance_km",
                     "account_age_days", "failed_attempts_last_hour"]
    for col in numeric_cols:
        noise = RNG.normal(0, df[col].std() * 0.35, size=n)
        df[col] = np.clip(df[col] + noise, 0, None)

    legit_idx = df.index[df["label"] == 0]
    fraud_idx = df.index[df["label"] == 1]

    hard_legit = RNG.choice(legit_idx, size=int(0.03 * len(legit_idx)), replace=False)
    df.loc[hard_legit, "is_new_device"] = 1
    df.loc[hard_legit, "is_new_location"] = 1
    df.loc[hard_legit, "distance_km"] = np.abs(RNG.normal(700, 300, size=len(hard_legit)))
    df.loc[hard_legit, "avg_amount_deviation"] = np.abs(RNG.normal(2.5, 1.0, size=len(hard_legit)))

    hard_fraud = RNG.choice(fraud_idx, size=int(0.10 * len(fraud_idx)), replace=False)
    df.loc[hard_fraud, "amount"] = np.round(RNG.lognormal(mean=7.5, sigma=0.5, size=len(hard_fraud)), 2)
    df.loc[hard_fraud, "is_new_device"] = 0
    df.loc[hard_fraud, "is_new_location"] = 0
    df.loc[hard_fraud, "txn_count_1h"] = RNG.poisson(0.5, size=len(hard_fraud))
    df.loc[hard_fraud, "avg_amount_deviation"] = np.abs(RNG.normal(0.4, 0.3, size=len(hard_fraud)))

    flip_legit = RNG.choice(legit_idx, size=int(0.004 * len(legit_idx)), replace=False)
    flip_fraud = RNG.choice(fraud_idx, size=int(0.02 * len(fraud_idx)), replace=False)
    df.loc[flip_legit, "label"] = 1
    df.loc[flip_fraud, "label"] = 0

    return df


def main():
    df = pd.concat([gen_legit(N_LEGIT), gen_fraud(N_FRAUD)], ignore_index=True)
    df = add_realistic_noise(df)
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    df.to_csv("transactions_dataset.csv", index=False)
    print(f"Generated dataset: {len(df)} rows, fraud rate = {df['label'].mean():.4%}")
    print(df.head())


if __name__ == "__main__":
    main()
