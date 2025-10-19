# Foreign Language Assessment Platform

Tamamlanmış bu proje, TOEFL-benzeri kriterlere göre konuşma değerlendirmesi yapan İngilizce mülakat koçu deneyimini uçtan uca sağlar. Uygulama iki ana bileşenden oluşur:

- **Backend (FastAPI)** – Oturum yönetimi, değerlendirme motoru, rapor üretimi ve e-posta kuyruklama uçlarını sunar.
- **Frontend (React + Vite)** – Metin tabanlı sohbet arayüzü, oturum kontrolü ve değerlendirme sonuçlarının görselleştirilmesini sağlar.

Ayrıntılı gereksinimler için [docs/SPEC.md](docs/SPEC.md) belgesine bakabilirsiniz.

## Hızlı Başlangıç

### 1. Ortamı Hazırlayın

```
cp .env.example .env
cp frontend/.env.example frontend/.env
```

`.env` dosyasında gizli anahtarları ve e-posta yapılandırmasını güncelleyin. Varsayılan `APP_SECRET_TOKEN` hem backend hem frontend için aynı olmalıdır.

### 2. Backend'i Çalıştırın

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API varsayılan olarak `http://localhost:8000` adresinde ayağa kalkar. Sağlık kontrolü için `/health` uç noktasını kullanabilirsiniz.

### 3. Frontend'i Çalıştırın

```bash
cd frontend
npm install
npm run dev
```

Geliştirme sunucusu `http://localhost:5173` adresinde çalışır ve API isteklerini Vite proxy üzerinden backend'e yönlendirir.

## Testler

Backend testlerini çalıştırmak için depo kök dizinindeyken:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt pytest
pytest
```

Test paketi, değerlendirme servisinin deterministik sonuçlar döndürdüğünü ve temel API akışının beklendiği gibi çalıştığını doğrular.

## Proje Yapısı

```
backend/        # FastAPI uygulaması ve servis katmanı
docs/           # Proje şartnamesi
frontend/       # React + Vite istemcisi
tests/          # Pytest tabanlı backend testleri
```

## Özellikler

- TOEFL rubriğine göre 4 boyutlu (Delivery, Language Use, Topic Development, Task Fulfillment) değerlendirme
- CEFR seviye eşlemesi ve kişiselleştirilmiş 30 günlük aksiyon planı
- HTML raporu dosyaya kaydetme ve paylaşılabilir bağlantı üretme
- Mock e-posta gönderimi (SMTP/SendGrid entegrasyonuna hazır arayüz)
- React tabanlı sohbet arayüzü, oturum yönetimi ve değerlendirme sunumu
