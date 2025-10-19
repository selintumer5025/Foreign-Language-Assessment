# Konfigürasyon JSON Şeması

## Meta Bilgileri
- `meta.id` (string): `toefl` | `ielts` | `cambridge_b2` | `cefr_global`
- `meta.label` (string): UI'da gösterilecek ad.
- `meta.version` (string): Ör. `v1`, `v2`.
- `meta.lang` (string): Konfigürasyonun dili, şu an `en`.
- `meta.module` (string): Ör. `speaking`; ileride `writing` vb. eklenebilir.
- `meta.timebox_sec` (number): Önerilen toplam süre (saniye).

## Prompt Tanımları
- `prompts.interviewer_system` (string): Sohbet üretimi için sistem rol mesajı.
- `prompts.evaluator_system` (string): Değerlendirme için sistem rol mesajı.
- `prompts.style` (object): Ton, register ve takip politikaları gibi isteğe bağlı ayarlar.

## Görevler
- `tasks[]` (array): Her eleman `{id, type, examples[]}` yapısında soru örneklerini içerir.

## Rubrik
- `rubric.criteria[]` (array): Her kriter `{id, label, scale{min,max}, description}` yapısındadır.
- `rubric.weights` (object): `{criterionId: weight}` eşlemesiyle kriter ağırlıkları.

## Skorlama
- `scoring.overall_scale` (object): `{min, max}` aralığında toplam skor.
- `scoring.normalization` (string): `weighted_average` veya `custom` gibi normalizasyon yöntemi.

## CEFR Haritalaması
- `mapping.to_cefr[]` (array): `{min, max, cefr}` aralıklarına göre CEFR etiketi.

## Raporlama
- `report.sections[]` (array): Rapor bölüm başlıkları.
- `report.max_length_tokens` (number): LLM çıktısı için önerilen token sınırı.
