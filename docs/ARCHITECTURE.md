# Architecture Overview

## UI Katmanı
- "Assessment Standard" dropdown'u CEFR, IELTS, TOEFL ve Cambridge seçenekleriyle sunulur.
- Kullanıcı seçim yaptığında ilgili `configs/<standard>/v1.json` dosyası yüklenir.
- JSON içeriğinden gelen rubrik başlıkları, süre ve özet bilgiler UI'da gösterilir.

## Sohbet Akışı
- `prompts.interviewer_system` alanı seçilen standarda özgü sistem mesajını sağlar.
- `tasks` listesi örnek istemleri içerir ve interviewer bu referansla sorular üretir.

## Değerlendirme Akışı
- Oturum transkripti, `prompts.evaluator_system` ve `rubric` bilgileriyle birlikte LLM'e gönderilir.
- LLM her kriter için puan, açıklama, hata örüntüsü ve öneriler döndürür.

## Skor ve Haritalama
- `rubric.weights` kriterleri ağırlıklandırarak toplam puanı hesaplar.
- Hesaplanan değer `scoring.overall_scale` aralığına normalize edilir.
- `mapping.to_cefr` çıktıyı CEFR etiketiyle eşler.

## Raporlama
- `report.sections` ve `report.max_length_tokens` rapor yapısını ve LLM çıktı sınırını belirler.
- Oluşan rapor ileride HTML'e dönüştürülüp e-posta ile gönderilecektir.

## Genişletilebilirlik
- Yeni standart eklemek için `configs/<standard>/<version>.json` dosyası oluşturmak yeterlidir.
- Kod tarafında değişiklik yapılmadan yeni JSON konfigürasyonu yüklenebilmelidir.
