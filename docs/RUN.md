# Nasıl Çalıştırılır

## Gereksinimler

- **Python 3.8+** (tercihen 3.10 veya 3.11)
- Tarayıcı (Chrome, Firefox, Edge)
- **macOS / Linux / Windows** — hepsinde aynı proje çalışır; sadece sanal ortam aktifleştirme komutu farklıdır.

---

## 1. Sanal Ortam (venv) Oluştur ve Bağımlılıkları Yükle

Proje kök dizininde sanal ortam oluşturup bağımlılıkları oraya kurun.

**macOS / Linux:**

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

**Windows (PowerShell veya CMD):**

```bash
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt
```

*(PowerShell’de `venv\Scripts\Activate.ps1` çalıştırılamıyorsa, önce `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` deneyin.)*

Bağımlılıklar: `fastapi`, `uvicorn`, `pandas`, `scikit-learn`, `imbalanced-learn`, `pydantic`

*(Sanal ortamı kapatmak için: `deactivate`)*

---

## 2. Python Backend’i Başlat

Sanal ortamı aktif edin (macOS/Linux: `source venv/bin/activate` — Windows: `venv\Scripts\activate`), sonra:

```bash
cd backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend `http://127.0.0.1:8000` adresinde çalışacak.

---

## 3. Frontend’i Başlat

Frontend’i HTTP üzerinden sunmanız gerekir (doğrudan `file://` ile açarsanız CORS hatası alabilirsiniz).

**Seçenek A — Python HTTP sunucusu:**

Proje kök dizininde yeni bir terminal açın:

```bash
python -m http.server 8080
```

*(Windows’ta `python` yoksa `py -m http.server 8080` deneyin.)*

Tarayıcıda açın:
- **http://localhost:8080/frontend/step1-clinical-context.html** (başlangıç)
- veya **http://localhost:8080/frontend/step2-data-exploration.html** (veri yükleme)
- veya **http://localhost:8080/frontend/step3-data-preparation.html** (data preparation – Step 3–7)

**Seçenek B — VS Code Live Server:**

- `frontend/step3-data-preparation.html` dosyasına sağ tıklayıp “Open with Live Server” seçin.

**Seçenek C — Başka bir HTML dosyası:**

Adımlar step 1–7 tek sayfada ise, ana HTML dosyasını açın (ör. `frontend/step2-data-exploration.html`) ve adımlar arasında geçiş yapın.

---

## 4. Akış Özeti

1. **Step 1:** Clinical Context  
2. **Step 2:** Data Exploration  
   - Domain seç (örn. Cardiology)  
   - Dataset otomatik yüklenir veya CSV yükle  
   - Column Mapper ile target ve feature rollerini ayarla, kaydet  
3. **Step 3:** Data Preparation  
   - **Train/Test Split:** Slider ile %60–90 arası (varsayılan %80)  
   - **Missing values:** Median / mode / drop  
   - **Normalisation:** Z-score / Min-max / None  
   - **Class imbalance:** SMOTE / Class weights / None  
   - **Apply Preparation Settings** butonuna tıkla  
   - Python backend veriyi işler, sağ panelde Before/After grafikleri güncellenir  
4. **Step 4+:** Model seçimi, eğitim, sonuçlar

---

## Önemli Notlar

- Backend mutlaka çalışıyor olmalı, yoksa Step 3’te “Apply Preparation Settings” hata verir.
- Dataset Step 2’de yüklenmeli ve Column Mapper ile onaylanmalı.
- CORS hataları alırsanız, frontend mutlaka HTTP üzerinden (örn. `http://localhost:8080`) açılmalı.
