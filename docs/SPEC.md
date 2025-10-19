# English Speaking Assessment Platform Specification

## Overview

**Amaç:**

- Kullanıcıyla İngilizce, çift yönlü sohbet (metin ve/veya ses).
- Sohbet sonunda TOEFL Speaking benzeri ölçütlerle puanlama + CEFR seviyesi (A1–C2) tespiti.
- Kısa geri bildirim + gelişim önerileri içeren rapor (HTML/PDF).
- Raporu belirlenen e-posta adresine otomatik gönder.

**Kapsam Dışı:**

- Sınav bütüncül kopyası değil; yalnızca "konuşma/akıcı ifade" odağı.
- Kullanıcı verilerini uzun süreli depolama (yalnızca oturum bazlı, opsiyonel telemetri).

## Mimari

### Frontend (Web)

- Tarayıcı mikrofonu ile sesli (opsiyonel) ve/veya metin tabanlı sohbet.
- "Interview Mode" (hazır prompt) + süre sayacı + bitir düğmesi.
- Sohbet transkriptlerini toplayıp backend’e gönderir; skor raporu görünümünü gösterir.

### Backend (API)

- `/chat`: Gerçek zamanlı sohbet (WebSocket/WebRTC) veya polling.
- `/evaluate`: Transkript + meta veriler → skor, CEFR eşlemesi, geri bildirim.
- `/report`: Değerlendirmeyi rapora dönüştür (HTML/PDF).
- `/email`: Raporu belirtilen adrese gönder.
- Model katmanı: Büyük dil modeli ile (1) sohbet ürettirme, (2) değerlendirme isteği.

### E-posta Katmanı

- SMTP (ör. Office365/Gmail) veya bir sağlayıcı (SendGrid, Mailgun).
- Ortam değişkenleri ile yapılandırma.

### Opsiyonel Ses Katmanı

- Tarayıcıda TTS oynatma ve mikrofon → STT (model veya tarayıcı API).
- Metin modu her zaman açık; ses modu isteğe bağlı.

## Konfigürasyon

- `TARGET_EMAIL`: Raporun gönderileceği birincil e-posta.
- `SMTP_*` veya `SENDGRID_API_KEY`: E-posta sağlayıcı bilgileri.
- `MODEL_*`: Kullanılacak sohbet ve değerlendirme modellerine ilişkin anahtarlar/ID’ler.
- `APP_BASE_URL`: Link ve yönlendirmeler için temel adres.
- `STORE_TRANSCRIPTS`: true/false (KV store ya da geçici bellek).

**Güvenlik:** Tüm anahtarlar sunucu tarafında saklanmalı; istemciye sızdırmayın. CORS ve oran sınırlayıcı ekleyin.

## Sohbet Davranışı

- **Rol:** “English Interview Coach”
- **Üslup:** B2–C1 düzeyinde İngilizce; nazik, net, konuşmayı teşvik eden.
- **Akış:**
  - Kısa ısınma (self-intro)
  - 2–3 davranışsal/STAR soru (ör. “Tell me about a time…”) 
  - 1 teknik/iş bağlamlı soru (kullanıcı sektörüne göre genel)
  - Mini özet ve kapanış
- **Uzunluk:** 6–10 dakika ya da 8–12 tur konuşma.
- **Geri Besleme:** Geri besleme sırasında kullanıcıyı kesmemek; düzeltmeleri rapora saklamak.

## Değerlendirme Çerçevesi

TOEFL Speaking benzeri 4 boyut (0–4 arası):

1. **Delivery (Akıcılık & Telaffuz):** akış, duraklamalar, anlaşılabilirlik.
2. **Language Use (Dil Kullanımı):** dilbilgisi, kelime çeşitliliği, doğruluk.
3. **Topic Development (İçerik Geliştirme):** fikirlerin örgütlenmesi, örnekler, tutarlılık.
4. **Task Fulfillment (Görev Karşılama):** soruyu anlama, yanıtın uygunluğu ve bütünlüğü.

**Ağırlıklar (öneri):** Delivery %25, Language %35, Topic %25, Task %15.
**Genel Puan:** 0–4 ölçeği (ağırlıklı).

### CEFR Eşlemesi (öneri)

- 0.0–1.0 → A1–A2
- 1.1–2.0 → B1
- 2.1–3.0 → B2
- 3.1–3.5 → C1
- 3.6–4.0 → C2

### Hata/Örüntü Çıkarımı

- Sık yapılan 3–5 hata (ör. zaman uyumu, article kullanımı, preposition).
- Örnek cümle + kısa düzeltme (doğrudan rapora).

### Gelişim Önerileri

- 5 maddelik kişiselleştirilmiş aksiyon listesi (kaynak/egzersiz, hedefli pratik).

**Not:** Değerlendirmeyi modelin ikinci geçişi ile yapın: Sohbet üretimi ve ölçme için ayrı sistem talimatı (evaluation-only) kullanın.

## Rapor İçeriği

- **Başlık:** “English Speaking Assessment Report”
- **Özet Kutusu:** Genel skor (0–4), CEFR seviyesi, 1-cümlelik genel değerlendirme.
- **Ayrıntılı Puanlar:** 4 boyut için puan + 1-2 cümle açıklama.
- **Dil Hataları ve Düzeltmeler:** Madde madde.
- **Gelişim Planı:** 30 günlük öneri (haftalık temalar).
- **Ek:** Sohbetten kısa alıntılar (kritik anlar).
- **Metaveri:** Tarih/saat (Europe/Istanbul), oturum ID, süre.
- **Teslim Formatı:** HTML ve (opsiyonel) PDF.
- **E-posta Konusu:** `Your English Speaking Report (CEFR: B2, Score: 3.1/4)`
- **E-posta Gövdesi:** Kısa özet + rapor linki/ek.

## API Taslağı (Sözleşme)

```
POST /api/session/start
Girdi: kullanıcı tercihi (ses/metin), süre hedefi.
Çıktı: session_id, başlangıç talimatı.

POST /api/chat
Girdi: session_id, user_message (+opsiyonel audio blob metaverisi).
Çıktı: assistant_message (metin; sesli modda TTS URL’si).

POST /api/session/finish
Girdi: session_id
Çıktı: transkript özeti, kelime sayısı, konuşma süresi.

POST /api/evaluate
Girdi: session_id veya transkript objesi.
Çıktı: boyut puanları, genel skor, CEFR, hata listesi, öneriler.

POST /api/report
Girdi: evaluation objesi, kullanıcı meta.
Çıktı: report_url (HTML), pdf_url (opsiyonel).

POST /api/email
Girdi: to (varsayılan TARGET_EMAIL), subject, body, attachments/links.
Çıktı: status, message_id.
```

Tüm uçlar auth korumalı olmalı (ör. bearer token / session secret).

## Frontend Akışı

- Kullanıcı “Start Interview” → mod seçimi (Text/Voice), süre.
- Sohbet ekranı: mesaj listesi, mikrofona izin (ses modunda), bitir düğmesi.
- “Finish & Evaluate” → bekleme ekranı → skor kartı.
- “Send Report” → e-posta gönderildi bildirimi.

**UX Notları:** Konu/soru ilerleme göstergesi; kalan süre; basit transkript görüntüleme.

## Test Senaryoları (Kabul Kriterleri)

### Sohbet

- 10 tur mesajlaşma sorunsuz; gecikme < 2 sn (metin).
- Ses modunda mikrofon izni alınıyor; oynatma net.

### Değerlendirme

- Aynı transkript ile tekrar değerlendirmede küçük sapmalar tolerans içinde.
- Boyut açıklamaları hatayla uyumlu (ör. “past tense” hatası işaretlenmiş).

### Rapor

- CEFR etiketi ve genel skor doğru formatta.
- HTML rapor 2 ekran boyunu geçmiyor; PDF üretimi opsiyonel.

### E-posta

- Gönderim 5 sn içinde API’dan başarı yanıtı alıyor.
- Ekte veya linkte rapor erişilebilir.

### Güvenlik

- API anahtarları istemci kaynaklarında yok.
- Oran sınırlayıcı aşırı istekleri engelliyor.

## Repo Düzeni (Öneri)

```
/docs/SPEC.md — bu belge (ayrıntılı şartname)
/frontend/ — web arayüzü (Text/Voice)
/backend/ — API ve entegrasyonlar
/scripts/ — yerel geliştirme yardımcıları (ör. seed)
/infra/ — dağıtım tanımları (CI/CD, çevre değişkenleri şablonu)
/tests/ — entegrasyon ve uçtan uca testler
README.md — Hızlı başlangıç + .env örneği + çalışma talimatı
```

## Model Yönergeleri (Örnek İçerik)

**Sohbet Sistem Mesajı:**

> “You are an English interview coach. Keep answers brief (<3 sentences), ask one follow-up question each turn, avoid correcting mid-conversation; save corrections for the final report.”

**Değerlendirme Sistem Mesajı:**

> “Evaluate only. Use TOEFL-like rubric (Delivery, Language Use, Topic Development, Task Fulfillment; 0–4). Provide weighted overall score, CEFR mapping, top errors with concise corrections, and 5 action items.”

## Ölçümleme & Günlükleme

- Oturum ID, süre, tur sayısı, kelime sayısı, isteğe bağlı memnuniyet anketi.
- Kişisel verileri maskele; IP/log’larda gereksiz veri tutma.

## Gelecek Genişletmeler

- Otomatik speaking prompts havuzu ve zorluk kademeleme.
- Benchmark veri seti ile kalibrasyon.
- Kurumsal kullanım için çoklu alıcı listesi + SSO.
- Mobil web optimizasyonu.

## Özet (Codex aksiyonları)

- Frontend’de metin + opsiyonel sesli sohbet arayüzü kur.
- Backend’de sohbet, değerlendirme, rapor ve e-posta uçlarını uygula.
- TOEFL-benzeri rubrik ve CEFR haritasını modele sistem mesajı olarak sabitle.
- Raporu HTML (ve opsiyonel PDF) üret; `TARGET_EMAIL`’e gönder.
- Güvenli yapılandırma (.env), oran sınırlama, temel testler.

Bu brifin repo’da bulunması, Codex’in projeyi sıfırdan inşa etmesi için gereksinimleri netleştirecektir. İhtiyaç halinde hedef e-posta adresi ve rapor dili (İngilizce/Türkçe) gibi ek konfigürasyonlar .env ve ayarlar panelinde belirtilebilir.
