# SUG E-Commerce Payment Fraud Detection System

Full implementation for **"The Design and Implementation of an E-Commerce
Payment Fraud Detection Model"** — a working e-commerce store with a real
trained Random Forest / XGBoost fraud model, a rules engine, Paystack
payments, and Supabase as the backing database.

## Architecture

```
frontend/     React + Vite storefront (products, cart, checkout, orders, admin review)
backend/      Node.js + Express API (products, checkout, Paystack, fraud gate)
ml-service/   Python FastAPI microservice serving the trained fraud model + rules engine
database/     Supabase (Postgres) schema, RLS policies, seed products
```

**Flow:** Customer checks out → backend computes live behavioral features
(velocity, spend deviation, device/location novelty) from Supabase history →
calls the ML service `/predict` → ML probability is blended with the rules
engine score → decision (`APPROVE` / `REVIEW` / `BLOCK`) → only non-blocked
transactions reach Paystack → payment is verified via Paystack webhook and
the order status is updated.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → paste and run `database/schema.sql`.
3. Then run `database/functions.sql`.
4. In **Authentication → Providers**, enable Email sign-up.
5. Copy your `Project URL`, `anon public key`, and `service_role key` from
   **Project Settings → API**.
6. (Optional) To use the admin dashboard at `/admin/fraud`, sign up a user
   normally, then in the SQL editor run:
   ```sql
   update public.profiles set is_admin = true where id = 'YOUR_USER_UUID';
   ```

## 2. Set up Paystack

1. Create a free account at [paystack.com](https://paystack.com) (Nigeria/Ghana/SA support).
2. Grab your **Test Secret Key** and **Test Public Key** from Settings → API Keys & Webhooks.
3. Under the same page, set your webhook URL to `https://YOUR_BACKEND_DOMAIN/api/payment/webhook`
   once you deploy the backend (use [ngrok](https://ngrok.com) for local testing).

## 3. Run the ML fraud-scoring service

```bash
cd ml-service
pip install -r requirements.txt
python generate_dataset.py     # builds the synthetic transaction dataset
python train_model.py          # trains RF + XGBoost, saves model.joblib + metrics
uvicorn app:app --reload --port 8000
```
Test it: `curl http://localhost:8000/health`

The model is already trained and included (`model.joblib`), so you can skip
straight to `uvicorn app:app --reload --port 8000` if you don't want to
retrain.

## 4. Run the backend

```bash
cd backend
cp .env.example .env      # fill in your Supabase + Paystack keys
npm install
npm run dev
```
Runs on `http://localhost:5000`.

## 5. Run the frontend

```bash
cd frontend
cp .env.example .env      # fill in Supabase URL/anon key + backend URL
npm install
npm run dev
```
Runs on `http://localhost:5173`.

## How the fraud detection actually works (for your report)

- **Model**: supervised Random Forest (selected over XGBoost by AUC-PR on a
  held-out test set — see `ml-service/model_metrics.json` for the exact
  numbers to cite in Chapter 4/5: Results and Discussion).
- **Features**: transaction amount, hour/day, transaction velocity (last
  hour), deviation from the user's historical average spend, new
  device/location flags, distance from usual location, account age,
  high-risk country flag, payment method, billing/shipping mismatch, and
  recent failed attempts — all computed live from real Supabase data in
  `backend/services/fraudService.js`.
- **Imbalance handling**: SMOTE oversampling on the training split only
  (stratified 80/20 split, 5-fold stratified CV), matching section 3.4 of
  your methodology.
- **Rules engine** (`ml-service/rules_engine.py`): explainable, hard-coded
  checks (velocity limits, amount thresholds, blacklists, geo mismatch)
  that run alongside the ML model — this is the hybrid approach justified in
  section 2.6.4/2.6.6 of your literature review.
- **Decision**: `final_score = 0.7 × ML_probability + 0.3 × rule_score`,
  thresholded into APPROVE / REVIEW / BLOCK, with hard blacklist matches
  short-circuiting straight to BLOCK.
- **Feedback loop**: every scored transaction is logged to `fraud_logs` in
  Supabase; `/admin/fraud` lets a reviewer approve or block REVIEW-status
  orders, and `user_transaction_stats` is updated after every successful
  payment so the next transaction's velocity/deviation features stay current.

## Re-training the model with your own data

Replace `ml-service/transactions_dataset.csv` with a real labeled dataset
(e.g. the Kaggle ULB Credit Card Fraud dataset mentioned in your Chapter 3)
using the same column names as in `generate_dataset.py`, then re-run
`python train_model.py`.

## Notes for your write-up (Chapter 4 & 5)

- `ml-service/model_metrics.json` after training contains precision, recall,
  F1, AUC-ROC, AUC-PR, and the confusion matrix — drop these directly into
  your Results tables.
- The admin dashboard (`/admin/fraud`) doubles as a live demo of the
  system's decision-making for your project defense.
