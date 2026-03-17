# HealthAi_juniorEngineers

A university project — an interactive web app that helps healthcare professionals understand machine learning through a 7-step guided pipeline across 20 clinical specialties.

## What Is This Project?

This tool allows doctors, nurses, clinical researchers, and healthcare students to explore how AI and machine learning work in real clinical settings — entirely in the browser, with no installation needed.

Users choose one of 20 medical specialties (e.g. Cardiology, Oncology, Neurology), upload or use a built-in patient dataset, and walk through a guided 7-step pipeline from data exploration all the way to ethics and bias checks.

## The 7-Step Pipeline

| Step | Name | Description |
|------|------|-------------|
| 1 | Clinical Context | Read about the medical problem the AI is solving |
| 2 | Data Exploration | Upload a CSV dataset or use a built-in example |
| 3 | Data Preparation | Handle missing values, normalise data, split train/test |
| 4 | Model & Parameters | Choose one of 6 AI models and adjust settings via sliders |
| 5 | Results | View accuracy, sensitivity, confusion matrix, ROC curve |
| 6 | Explainability | See which features drove the AI's predictions |
| 7 | Ethics & Bias | Check subgroup fairness and EU AI Act compliance |

## Team – Junior Engineers

| Name | Role |
|------|------|
| Göksu Bulut | Product Owner |
| Kerim Efe Kocacık | UX Designer |
| Ceren Gökdere | Lead Developer |
| Elif İstanbulluoğlu | Scrum Master / Developer |
| Emre Tek | QA / Documentation Lead |


## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | FastAPI (Python) |
| ML Engine | scikit-learn |
| Storage | Browser Session Storage |

## Project Status

| Sprint | Weeks | Theme | Deadline |
|--------|-------|-------|----------|
| 1 | 1–2 | Foundation & Design | 4 Mar |
| 2 | 3–4 | MVP (Steps 1–3) | 18 Mar |
| 3 | 5–6 | Core ML (Steps 4–5) | 1 Apr |
| 4 | 7–8 | Full Pipeline (Steps 6–7) | 15 Apr |
| 5 | 9–10 | Polish & Test | 29 Apr |
| — | 11 | Jury Day | 6 May |

## Repository Structure
```
/frontend   → Web UI
/backend    → API & ML engine
/ml         → Model training scripts
/docs       → Architecture diagram, wireframes, reports
```

## Branch Naming Convention

| Type | Format | Example |
|------|--------|---------|
| New feature | `feature/sprint[N]-[short-description]` | `feature/sprint1-architecture-diagram` |
| Bug fix | `bugfix/[short-description]` | `bugfix/login-error` |
| Urgent fix | `hotfix/[short-description]` | `hotfix/csv-crash` |

*Prepared for SENG 430 · February 2025*
