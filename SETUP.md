# SETUP.md — HealthAI Junior Engineers

> An interactive web app helping healthcare professionals understand machine learning through a **7-step guided pipeline** across **20 clinical specialties**.

**Course:** SENG 430 · University Project · 2025

---

## 📋 Prerequisites

| Tool | Minimum Version | Check |
|------|----------------|-------|
| Python | 3.10+ | `python --version` |
| Web Browser | Chrome, Firefox, or Edge | — |
| OS | macOS, Linux, or Windows | — |
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

python3 -m venv venv

# macOS / Linux
source venv/bin/activate
```

### 2.2 Install Python Dependencies

```bash
pip install -r requirements.txt
```

> **Required Packages:** `fastapi`, `uvicorn`, `pandas`, `scikit-learn`, `imbalanced-learn`, `pydantic`

### 2.3 Run the Backend

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

---

## 3. Frontend Setup (HTML, CSS, JS)

The frontend is built with vanilla HTML, CSS, and JS — no React or Vite dependencies. Serve it through a local server to avoid CORS issues.

### Option A: Python HTTP Server *(Recommended)*

Open a new terminal in the project root and run:

```bash
python -m http.server 8080
```

Then open your browser at:

▶ **http://localhost:8080/frontend/step1-clinical-context.html**

### Option B: VS Code Live Server

Right-click `frontend/step1-clinical-context.html` and select **"Open with Live Server"**.

> Make sure the backend is running before using the app. The frontend communicates with the API at `http://localhost:8000`.

---

## 4. API Endpoints Reference

Once the backend is running, all endpoints are documented interactively at [`/api/docs`](http://localhost:8000/api/docs).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/preprocess` | Clean and split uploaded CSV |
| `POST` | `/api/train` | Train selected model with given parameters |
| `POST` | `/api/predict` | Run prediction on test set |
| `GET` | `/api/explain` | Feature importance / SHAP values |
| `GET` | `/api/bias-check` | Subgroup fairness metrics |
| `GET` | `/api/metrics` | Model evaluation metrics |
| `GET` | `/api/certificate` | Generate PDF summary certificate |
| `GET` | `/api/docs` | Auto-generated FastAPI documentation |
| `POST` | `/api/schema/validate` | Validate data schema |
| `POST` | `/api/model/train` | Train model with params |
| `POST` | `/api/model/metrics` | Compute confusion matrix |

---

## 5. Branch & Workflow Rules

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

**Merge Rules:**
- At least **1 reviewer approval** is required before merging
- CI checks must pass before merge
- Delete your branch after merging

---

## 🆘 Need Help?

- Browse open [Issues](https://github.com/cgokdere/HealthAi_juniorEngineers/issues) on GitHub
- Check the interactive API docs at [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- Review architecture diagrams and sprint notes in the `/docs` folder
