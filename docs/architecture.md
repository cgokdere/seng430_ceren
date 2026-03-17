## Architecture

This repository contains a lightweight, educational web application that guides users through a **7-step ML learning pipeline** across multiple clinical specialties. The system is intentionally simple: a **static frontend** orchestrates the workflow and calls a **Python FastAPI backend** for data preparation operations.

---

## High-level goals

- Provide a **step-by-step** learning experience (clinical context → data exploration → preparation → modeling → results → explainability → ethics).
- Keep setup friction low: **no build tools**, no database, no authentication.
- Perform only the compute-heavy / library-heavy steps (imputation, scaling, SMOTE, splitting) in a backend API.

---

## Tech Stack
| Layer | Technology | Reason |
|-------|------------|--------|
| Frontend | HTML/CSS/JS | Required toolchain; fast HMR, component-based UI suits 7-step pipeline |
| Backend | FastAPI (Python) | Required toolchain; auto-generates /docs endpoint, async support, easy scikit-learn integration |
| ML Engine | scikit-learn | Required toolchain; all 6 required models available out of the box |
| Storage | Browser Session Storage | No database needed; state clears on tab close, zero backend storage cost |

## System overview

### Components

- **Frontend (static HTML/CSS/JS)**: `frontend/`
  - Multi-page flow using `step*.html` pages.
  - Loads bundled datasets (CSV) from `frontend/datasets2/`.
  - Collects user choices (target column, feature roles, preprocessing settings).
  - Calls backend API and renders “before/after” summaries.

- **Backend (FastAPI)**: `backend/`
  - Exposes a JSON API for data preparation.
  - Uses Pandas + NumPy + scikit-learn + imbalanced-learn.
  - Returns processed **train/test rows** and summary statistics to drive UI charts/panels.

- **Docs**: `docs/`
  - Run instructions 
  - Architecture stack 
  - Definition of Done
  - Backlog Prioritization
---

##  API Endpoints Reference
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

## Project management toolchain

| Tool | Category | Purpose |
|---|---|---|
| Jira | Project Management | Product backlog, sprint backlog, user stories, story points, velocity tracking, burndown charts |
| GitHub | Version Control | All source code, feature branches, pull requests, code review |
| GitHub Wiki | Documentation | Architecture decisions, meeting notes, retrospective boards, API docs, sprint notes |
| Figma | UI/UX Design | Wireframes and high-fidelity mockups for all 7 steps; clickable prototype |
| Miro | Retrospectives | Sprint retrospective boards — Keep / Improve / Try format |
| Google Forms / Maze | User Testing | Usability testing with non-CS participants (Weeks 9–10) |

---

## Privacy & Security

- All communication over HTTPS
- No personal data stored in the browser beyond the current session
- Uploaded CSV data is held temporarily in Browser Session Storage and cleared when the tab is closed
- PII filtering and anonymization handled server-side before any ML processing
- No user data is persisted on the backend

---

## Branch strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready, protected |
| `feature/sprint[N]-[desc]` | Feature development |
| `bugfix/[desc]` | Bug fixes |
| `hotfix/[desc]` | Urgent fixes |

- All merges to `main` require **1 PR approval** from the Lead Developer.
