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

---

## API Endpoints (Planned)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/preprocess` | Clean and split uploaded CSV |
| POST | `/api/train` | Train selected model with given parameters |
| POST | `/api/predict` | Run prediction on test set |
| GET | `/api/explain` | Return feature importance / SHAP values |
| GET | `/api/bias-check` | Subgroup fairness metrics |
| GET | `/api/metrics` | Return model evaluation metrics |
| GET | `/api/certificate` | Generate PDF summary certificate |
| POST | `/api/schema/validate` | Validate uploaded CSV schema |

---

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
- Data validation and PII filtering handled server-side

### ML Engine (scikit-learn)
- 6 model implementations:
  - K-Nearest Neighbors (KNN)
  - Support Vector Machine (SVM)
  - Decision Tree
  - Random Forest
  - Logistic Regression
  - Naive Bayes

---

## CI / QA

| Tool | Purpose |
|------|---------|
| GitHub Actions | CI pipeline — runs on every PR to `main` |
| ESLint / Prettier | Code style and linting |
| Lighthouse | Performance score target ≥ 80 |
| axe | Accessibility scan; contrast ratio ≥ 4.5:1, keyboard navigation |

---

## Project Management Toolchain

| Tool | Category | Purpose |
|------|----------|---------|
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

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready, protected |
| `feature/sprint[N]-[desc]` | Feature development |
| `bugfix/[desc]` | Bug fixes |
| `hotfix/[desc]` | Urgent fixes |

*All merges to `main` require 1 PR approval from Lead Developer.*
