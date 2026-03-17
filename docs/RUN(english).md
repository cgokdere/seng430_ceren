# Project Overview & Setup Guide

This project is a web-based tool for medical data analysis and machine learning modeling. It follows a clinical workflow from data exploration to model evaluation.

---

## 📋 Prerequisites

Before running the project, ensure you have:

- **Python 3.8+** (3.10 or 3.11 recommended)
- **Web Browser** (Chrome, Firefox, or Edge)
- **OS:** macOS, Linux, or Windows

---

## 🛠️ 1. Install Dependencies

Open your terminal or command prompt in the project's root directory.

### macOS / Linux

It is recommended to use a virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### Windows

You can install the requirements directly to your global environment:

```bash
pip install -r backend/requirements.txt
```

> **Required Packages:** `fastapi`, `uvicorn`, `pandas`, `scikit-learn`, `imbalanced-learn`, `pydantic`

---

## 🖥️ 2. Start the Python Backend

The backend handles data processing and ML logic. Navigate to the backend folder and start the server:

```bash
cd backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API will be live at: `http://127.0.0.1:8000`

---

## 🌐 3. Launch the Frontend

To avoid CORS issues (which occur when opening HTML files directly via `file://`), you must serve the frontend through a local server.

### Option A: Python HTTP Server *(Recommended)*

Open a new terminal window in the project root directory and run:

```bash
python -m http.server 8080
```

Then, access the application in your browser:

▶ **Start Here:** `http://localhost:8080/frontend/step1-clinical-context.html`

### Option B: VS Code Live Server

Right-click `frontend/step1-clinical-context.html` and select **"Open with Live Server"**.

---

## 🚀 4. Workflow Overview

Follow the steps within the application to complete your analysis:

**Step 1: Clinical Context**
Define the medical background and study goals.

**Step 2: Data Exploration**
- Select a clinical domain (e.g., Cardiology).
- The dataset loads automatically (or you can upload a custom CSV).
- **Crucial:** Use the Column Mapper to define your "Target" and "Features," then click **Save**.

**Step 3: Data Preparation**
- **Train/Test Split:** Adjust the ratio via the slider (60%–90%).
- **Missing Values:** Choose Median, Mode, or Drop.
- **Normalization:** Select Z-score, Min-Max, or None.
- **Class Imbalance:** Apply SMOTE, Class Weights, or None.

Click **"Apply Preparation Settings"**. The backend processes the data and updates the "Before/After" charts in the right panel.

**Step 4+:** Model selection, training, and results.

---

## ⚠️ Important Notes

- **Backend Connection:** The Python backend must be running for Step 3 to function.
- **Data Sequence:** You must complete Step 2 (Mapping) before data preparation can be processed.
- **CORS Troubleshooting:** If the application does not respond, ensure you are accessing the frontend via `http://localhost:8080` and not by double-clicking the file.