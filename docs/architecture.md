 # Architecture Decisions
*Lead Developer: Ceren Gökdere — Sprint 1*
*Developer: Elif İstanbulluoğlu — Sprint 1*

## Tech Stack

| Layer | Technology | Reason |
|-------|------------|--------|
| Frontend | React 18 + Vite | Required toolchain; fast HMR, component-based UI suits 7-step pipeline |
| Backend | FastAPI (Python) | Required toolchain; auto-generates /docs endpoint, async support, easy scikit-learn integration |
| ML Engine | scikit-learn | Required toolchain; all 6 required models available out of the box |
| Storage | Browser Session Storage | No database needed; state clears on tab close, zero backend storage cost |


## API Endpoints (Planned)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/preprocess | Clean and split uploaded CSV |
| POST | /api/train | Train selected model with given parameters |
| POST | /api/predict | Run prediction on test set |
| GET | /api/explain | Return feature importance / SHAP values |
| GET | /api/bias-check | Subgroup fairness metrics |
| GET | /api/metrics | Return model evaluation metrics |
| GET | /api/certificate | Generate PDF summary certificate |
| GET | /docs | Auto-generated FastAPI API documentation |


## System Layers

### Frontend (React 18 + Vite)
- 7-step guided pipeline UI
- Domain pill bar with 20 clinical specialties
- Sliders, charts, confusion matrix, ROC curve
- All state stored in Browser Session Storage

### Backend (FastAPI)
- REST API serving frontend requests
- Handles preprocessing, training, prediction
- Auto-generated API docs at `/docs` endpoint
- Communicates with ML layer via in-process Python function calls

### ML Engine (scikit-learn)
- 6 model implementations:
  - K-Nearest Neighbors (KNN)
  - Support Vector Machine (SVM)
  - Decision Tree
  - Random Forest
  - Logistic Regression
  - Naive Bayes

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready, protected |
| `develop` | Integration branch, protected |
| `feature/sprint[N]-[desc]` | Feature development |
| `bugfix/[desc]` | Bug fixes |
| `hotfix/[desc]` | Urgent fixes |

*All merges to `main` and `develop` require 1 PR approval from Lead Developer.*
