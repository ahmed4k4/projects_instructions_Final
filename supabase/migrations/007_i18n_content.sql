-- ===========================================================================
-- 007 — Arabic content for the component catalogue
-- ===========================================================================
--
-- Adds translated display columns so the UI can render the catalogue in Arabic
-- without shipping a translation table in the bundle.
--
-- Design
--   · Nullable columns, not NOT NULL. A missing translation must never block an
--     insert: the app falls back to `name` / `description` when `_ar` is null
--     (see src/lib/i18nContent.ts).
--   · Matching is by (category, brand, model), which is the natural key used by
--     the seeder and stable across catalogue id changes.
--   · Re-runnable: the UPDATEs are idempotent and the seed only fills rows whose
--     Arabic value is still null, so a manual edit is never overwritten.
--
-- Idempotent: safe to apply twice.
-- ===========================================================================

ALTER TABLE components
  ADD COLUMN IF NOT EXISTS name_ar         text,
  ADD COLUMN IF NOT EXISTS description_ar  text;

COMMENT ON COLUMN components.name_ar        IS 'Arabic display name; falls back to name.';
COMMENT ON COLUMN components.description_ar IS 'Arabic short description; falls back to description.';

-- ---------------------------------------------------------------------------
-- CPUs
-- ---------------------------------------------------------------------------
UPDATE components SET
  name_ar        = COALESCE(name_ar, 'معالج AMD رايزن 7 7800X3D'),
  description_ar = COALESCE(description_ar, 'أفضل معالج للألعاب بفضل ذاكرة 3D V-Cache الكبيرة — منصّة AM5.')
WHERE category = 'cpu' AND brand = 'AMD' AND model = 'Ryzen 7 7800X3D';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'معالج AMD رايزن 9 7950X'),
  description_ar = COALESCE(description_ar, '16 نواة و32 مسارًا للمهام الثقيلة مثل التصدير والعمل على النماذج.')
WHERE category = 'cpu' AND brand = 'AMD' AND model = 'Ryzen 9 7950X';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'معالج AMD رايزن 5 7600X'),
  description_ar = COALESCE(description_ar, 'خيار متوازن من ستّة أنوية لواجهة AM5 بميزانية معقولة.')
WHERE category = 'cpu' AND brand = 'AMD' AND model = 'Ryzen 5 7600X';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'معالج إنتل كور i9-14900K'),
  description_ar = COALESCE(description_ar, 'أعلى معدّلات التردّد في منصّة LGA1700 — 24 نواة بخلية هجينة وأداء استثنائي في الألعاب والإنتاجية.')
WHERE category = 'cpu' AND brand = 'Intel' AND model = 'Core i9-14900K';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'معالج إنتل كور i7-14700K'),
  description_ar = COALESCE(description_ar, '20 نواة بتوازن ممتاز بين السعر والأداء متعدّد المسارات.')
WHERE category = 'cpu' AND brand = 'Intel' AND model = 'Core i7-14700K';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'معالج إنتل كور i5-14600K'),
  description_ar = COALESCE(description_ar, '14 نواة بسعر مناسب لأجهزة الألعاب متوسطة الميزانية.')
WHERE category = 'cpu' AND brand = 'Intel' AND model = 'Core i5-14600K';

-- ---------------------------------------------------------------------------
-- GPUs
-- ---------------------------------------------------------------------------
UPDATE components SET
  name_ar        = COALESCE(name_ar, 'كرت رسوميات NVIDIA جيفورس RTX 4090 24 جيجابايت'),
  description_ar = COALESCE(description_ar, 'أقوى كرت للألعاب بدقّة 4K والإنتاج بالذكاء الاصطناعي، بذاكرة 24 جيجابايت.')
WHERE category = 'gpu' AND brand = 'NVIDIA' AND model = 'GeForce RTX 4090';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'كرت رسوميات NVIDIA جيفورس RTX 4080 SUPER 16 جيجابايت'),
  description_ar = COALESCE(description_ar, 'بديل أقرب إلى المنطق لكرت 4090 مع أداء 4K ممتاز.')
WHERE category = 'gpu' AND brand = 'NVIDIA' AND model = 'GeForce RTX 4080 SUPER';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'كرت رسوميات NVIDIA جيفورس RTX 4070 Ti SUPER 16 جيجابايت'),
  description_ar = COALESCE(description_ar, 'ذاكرة 16 جيجابايت تكفي لمعظم الألعاب بدقّة 1440p العالية وبداية العمل على النماذج.')
WHERE category = 'gpu' AND brand = 'NVIDIA' AND model = 'GeForce RTX 4070 Ti SUPER';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'كرت رسوميات NVIDIA جيفورس RTX 4070 12 جيجابايت'),
  description_ar = COALESCE(description_ar, 'الأداء الأمثل لدقّة 1440p مع استهلاك طاقة معتدل.')
WHERE category = 'gpu' AND brand = 'NVIDIA' AND model = 'GeForce RTX 4070';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'كرت رسوميات AMD راديون RX 7900 XTX 24 جيجابايت'),
  description_ar = COALESCE(description_ar, 'أداء تنافسي بدقّة 4K وذاكرة كبيرة بسعر أقل من المنافس.')
WHERE category = 'gpu' AND brand = 'AMD' AND model = 'Radeon RX 7900 XTX';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'كرت رسوميات AMD راديون RX 7800 XT 16 جيجابايت'),
  description_ar = COALESCE(description_ar, 'قيمة عالية لدقّة 1440p مع ذاكرة 16 جيجابايت.')
WHERE category = 'gpu' AND brand = 'AMD' AND model = 'Radeon RX 7800 XT';

-- ---------------------------------------------------------------------------
-- Motherboards
-- ---------------------------------------------------------------------------
UPDATE components SET
  name_ar        = COALESCE(name_ar, 'لوحة أم ASUS ROG Strix X670E-E'),
  description_ar = COALESCE(description_ar, 'منصّة AM5 بشرائح X670E وتوصيلات PCIe 5.0 كاملة.')
WHERE category = 'motherboard' AND brand = 'ASUS' AND model = 'ROG Strix X670E-E';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'لوحة أم MSI MAG B650 Tomahawk'),
  description_ar = COALESCE(description_ar, 'لوحة B650 متينة بأجزاء طاقة قوية — الخيار المنطقي لمنصّة AM5.')
WHERE category = 'motherboard' AND brand = 'MSI' AND model = 'MAG B650 Tomahawk';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'لوحة أم ASUS ROG Strix Z790-E'),
  description_ar = COALESCE(description_ar, 'منصّة LGA1700 بشرائح Z790 تدعم كسر السرعة وPCIe 5.0.')
WHERE category = 'motherboard' AND brand = 'ASUS' AND model = 'ROG Strix Z790-E';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'لوحة أم Gigabyte B760M AORUS Elite'),
  description_ar = COALESCE(description_ar, 'لوحة B760 صغيرة الحجم بسعر مناسب لتجميعات إنتل.')
WHERE category = 'motherboard' AND brand = 'Gigabyte' AND model = 'B760M AORUS Elite';

-- ---------------------------------------------------------------------------
-- Memory
-- ---------------------------------------------------------------------------
UPDATE components SET
  name_ar        = COALESCE(name_ar, 'ذاكرة G.Skill Trident Z5 Neo ‏32 جيجابايت DDR5-6000 CL30'),
  description_ar = COALESCE(description_ar, 'التزامن المثالي لمنصّة AM5 — حزمة 32 جيجابايت ثنائية القناة.')
WHERE category = 'ram' AND brand = 'G.Skill' AND model = 'Trident Z5 Neo 32GB 6000 CL30';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'ذاكرة Corsair Vengeance ‏64 جيجابايت DDR5-5600 CL36'),
  description_ar = COALESCE(description_ar, 'سعة كبيرة لمحطات العمل وتحرير الفيديو والنماذج الكبيرة.')
WHERE category = 'ram' AND brand = 'Corsair' AND model = 'Vengeance 64GB 5600 CL36';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'ذاكرة Kingston Fury Beast ‏32 جيجابايت DDR4-3600 CL18'),
  description_ar = COALESCE(description_ar, 'ذاكرة DDR4 بسعر اقتصادي لمنصّات الجيل السابق.')
WHERE category = 'ram' AND brand = 'Kingston' AND model = 'Fury Beast 32GB 3600 CL18';

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
UPDATE components SET
  name_ar        = COALESCE(name_ar, 'قرص Samsung 990 Pro ‏2 تيرابايت NVMe'),
  description_ar = COALESCE(description_ar, 'من أسرع أقراص NVMe Gen4 — سرعات قراءة تصل إلى 7450 ميجابايت/ث.')
WHERE category = 'storage' AND brand = 'Samsung' AND model = '990 Pro 2TB';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'قرص WD Black SN850X ‏2 تيرابايت NVMe'),
  description_ar = COALESCE(description_ar, 'قرص ألعاب سريع وموثوق بذاكرة تخزين مؤقت كبيرة.')
WHERE category = 'storage' AND brand = 'WD' AND model = 'Black SN850X 2TB';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'قرص Crucial P3 ‏1 تيرابايت NVMe'),
  description_ar = COALESCE(description_ar, 'تخزين Gen3 بسعر مناسب للتجميعات الاقتصادية.')
WHERE category = 'storage' AND brand = 'Crucial' AND model = 'P3 1TB';

-- ---------------------------------------------------------------------------
-- Power supplies
-- ---------------------------------------------------------------------------
UPDATE components SET
  name_ar        = COALESCE(name_ar, 'مزوّد طاقة Corsair RM850x ‏850 واط'),
  description_ar = COALESCE(description_ar, 'مزوّد 80+ Gold معياري كاملًا بالوحدات وصامت تحت الحمل المتوسط.')
WHERE category = 'psu' AND brand = 'Corsair' AND model = 'RM850x';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'مزوّد طاقة Seasonic Prime TX-1000 ‏1000 واط'),
  description_ar = COALESCE(description_ar, 'كفاءة Titanium وجهد هامش مريح لكرت RTX 4090.')
WHERE category = 'psu' AND brand = 'Seasonic' AND model = 'Prime TX-1000';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'مزوّد طاقة be quiet! Pure Power 12 M ‏750 واط'),
  description_ar = COALESCE(description_ar, 'مزوّد 750 واط هادئ بكفاءة Gold للتجميعات المتوسطة.')
WHERE category = 'psu' AND brand = 'be quiet!' AND model = 'Pure Power 12 M 750W';

-- ---------------------------------------------------------------------------
-- Cases
-- ---------------------------------------------------------------------------
UPDATE components SET
  name_ar        = COALESCE(name_ar, 'صندوق NZXT H7 Flow'),
  description_ar = COALESCE(description_ar, 'شبكة أمامية واسعة لتدفّق هواء ممتاز وتبريد فعّال.')
WHERE category = 'case' AND brand = 'NZXT' AND model = 'H7 Flow';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'صندوق Lian Li O11 Dynamic EVO'),
  description_ar = COALESCE(description_ar, 'صندوق زجاجي واسع يدعم أطقم التبريد المائي المخصّصة.')
WHERE category = 'case' AND brand = 'Lian Li' AND model = 'O11 Dynamic EVO';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'صندوق Fractal Design North'),
  description_ar = COALESCE(description_ar, 'تصميم خشبي أنيق مع تدفّق هواء جيد وصوت منخفض.')
WHERE category = 'case' AND brand = 'Fractal Design' AND model = 'North';

-- ---------------------------------------------------------------------------
-- Cooling
-- ---------------------------------------------------------------------------
UPDATE components SET
  name_ar        = COALESCE(name_ar, 'مبرّد هوائي Noctua NH-D15'),
  description_ar = COALESCE(description_ar, 'مبرّد هوائي كبير بأداء يقارب التبريد المائي الصامت.')
WHERE category = 'cooling' AND brand = 'Noctua' AND model = 'NH-D15';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'مبرّد مائي Arctic Liquid Freezer III ‏360'),
  description_ar = COALESCE(description_ar, 'رادياتير 360 ملم بأداء تبريد عالي لمعالجات الحرارة العالية.')
WHERE category = 'cooling' AND brand = 'Arctic' AND model = 'Liquid Freezer III 360';

UPDATE components SET
  name_ar        = COALESCE(name_ar, 'مبرّد مائي DeepCool LT520 ‏240'),
  description_ar = COALESCE(description_ar, 'رادياتير 240 ملم متوازن يناسب الصناديق المتوسطة.')
WHERE category = 'cooling' AND brand = 'DeepCool' AND model = 'LT520 240';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  total      integer;
  translated integer;
BEGIN
  SELECT count(*), count(name_ar) INTO total, translated FROM components;

  IF total = 0 THEN
    RAISE NOTICE '007: components table is empty — run the catalogue seed, then re-apply 007.';
  ELSE
    RAISE NOTICE '007: % of % components have Arabic names (% %%).',
      translated, total, round(translated::numeric / total * 100);
  END IF;
END $$;
