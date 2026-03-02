# SETUP.md — HealthAI Junior Engineers

> **Project:** An interactive web app helping healthcare professionals understand machine learning through a 7-step guided pipeline across 20 clinical specialties.
> **Course:** SENG 430 · University Project · 2025

---

## Prerequisites

Make sure the following are installed before you begin:

| Tool | Minimum Version | Check |
|------|----------------|-------|
| Python | 3.10+ | `python --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | 2.38+ | `git --version` |

---

## 1. Clone the Repository
```bash
git clone https://github.com/cgokdere/HealthAi_juniorEngineers.git
cd HealthAi_juniorEngineers
```

---

## 2. Backend Setup (FastAPI + scikit-learn)

### 2.1 Create a Virtual Environment
```bash
cd backend

python -m venv venv

# macOS / Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 2.2 Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 2.3 Environment Variables
```bash
cp .env.example .env
```

Open `.env` and set the following:
```env
APP_ENV=development
API_HOST=0.0.0.0
API_PORT=8000
MODEL_PATH=../ml/models/
DATA_PATH=../ml/data/
```

> ⚠️ Never commit your `.env` file — it is already in `.gitignore`.

### 2.4 Run the Backend
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:

- **API Base** → http://localhost:8000
- **Swagger Docs** → http://localhost:8000/api/docs

---

## 3. Frontend Setup (React 18 + Vite)
```bash
cd frontend
npm install
npm run dev
```

The app will be available at → http://localhost:5173

> Make sure the backend is running before using the app. The frontend communicates with the API at `http://localhost:8000`.

---

## 4. ML Scripts (scikit-learn)

The `/ml` folder contains standalone model training scripts.
```bash
cd ml
pip install -r requirements.txt   # if a separate requirements file exists

# Example: run a training script
python train.py
```

Trained model artifacts are saved to `ml/models/` and picked up by the backend at runtime.

---

## 5. API Endpoints Reference

Once the backend is running, all endpoints are documented interactively at `/api/docs`. Quick reference:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/preprocess` | Clean and split uploaded CSV |
| POST | `/api/train` | Train selected model with given parameters |
| POST | `/api/predict` | Run prediction on test set |
| GET | `/api/explain` | Feature importance / SHAP values |
| GET | `/api/bias-check` | Subgroup fairness metrics |
| GET | `/api/metrics` | Model evaluation metrics |
| GET | `/api/certificate` | Generate PDF summary certificate |
| GET | `/api/docs` | Auto-generated FastAPI documentation |
| POST | `/api/schema/validate` | Validate data schema |
| POST | `/api/model/train` | Train model with params |
| POST | `/api/model/metrics` | Compute confusion matrix |

---

## 6. Project Structure
```
HealthAi_juniorEngineers/
├── backend/          → FastAPI app, route handlers, API logic
├── frontend/         → React 18 + Vite web interface
├── ml/               → Model training scripts (scikit-learn)
├── docs/             → Architecture diagrams, wireframes, sprint reports
└── README.md
```

---

## 7. Branch & Workflow Rules

This repository uses branch protection on `main`. **Never push directly to `main`.**
```bash
# 1. Always start from main and pull latest
git checkout main
git pull origin main

# 2. Create your branch following the naming convention
git checkout -b feature/sprint2-data-preprocessing

# 3. Make changes, commit with a clear message
git add .
git commit -m "feat: add CSV preprocessing endpoint"

# 4. Push and open a Pull Request targeting main
git push origin feature/sprint2-data-preprocessing
```

### Branch Naming Convention

| Type | Format | Example |
|------|--------|---------|
| New feature | `feature/sprint[N]-[description]` | `feature/sprint2-data-preprocessing` |
| Bug fix | `bugfix/[description]` | `bugfix/csv-upload-crash` |
| Urgent fix | `hotfix/[description]` | `hotfix/model-timeout` |

**Rules:**
- At least 1 reviewer approval is required before merging
- CI checks must pass before merge
- Delete your branch after merging

---

## 8. Sprint Timeline

| Sprint | Weeks | Theme | Deadline |
|--------|-------|-------|----------|
| 1 | 1–2 | Foundation & Design | 4 Mar |
| 2 | 3–4 | MVP (Steps 1–3) | 18 Mar |
| 3 | 5–6 | Core ML (Steps 4–5) | 1 Apr |
| 4 | 7–8 | Full Pipeline (Steps 6–7) | 15 Apr |
| 5 | 9–10 | Polish & Test | 29 Apr |
| — | 11 | Jury Day | 6 May |

---

## Need Help?

- Browse open [Issues](https://github.com/cgokdere/HealthAi_juniorEngineers/issues) on GitHub
- Check the interactive API docs at http://localhost:8000/api/docs
- Review architecture diagrams and sprint notes in the `/docs` folder
