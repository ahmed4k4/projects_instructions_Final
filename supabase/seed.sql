-- =============================================================================
-- Nexus PC Builder — seed data
--
-- 32 components across all 8 categories, 12 compatibility rules and 3 public
-- demo builds (owned by the platform, user_id = null).
-- Idempotent: re-running upserts by (category, brand, model) / rule_key / slug.
--
-- Run with:  supabase db reset        (local, applies migrations + seed)
--        or: paste this file in the Supabase dashboard SQL editor.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- COMPONENTS
-- -----------------------------------------------------------------------------
insert into
  public.components (
    category,
    brand,
    model,
    name,
    specs,
    price,
    stock_status,
    store_links,
    performance_score,
    power_draw_watts,
    image_url
  )
values
  -- ---------------------------------------------------------------- CPUs (6)
  (
    'cpu',
    'AMD',
    'Ryzen 7 7800X3D',
    'Ryzen 7 7800X3D',
    '{"socket":"AM5","cores":8,"threads":16,"baseClock":4.2,"boostClock":5.0,"tdp":120,"integratedGraphics":true,"ramType":"DDR5","l3Cache":96,"coolerIncluded":false}',
    379.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":379.00},{"store":"Amazon","url":"https://www.amazon.com","price":384.99}]',
    96,
    120,
    null
  ),
  (
    'cpu',
    'AMD',
    'Ryzen 9 7950X',
    'Ryzen 9 7950X',
    '{"socket":"AM5","cores":16,"threads":32,"baseClock":4.5,"boostClock":5.7,"tdp":170,"integratedGraphics":true,"ramType":"DDR5","l3Cache":64,"coolerIncluded":false}',
    549.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":549.00}]',
    97,
    170,
    null
  ),
  (
    'cpu',
    'AMD',
    'Ryzen 5 7600X',
    'Ryzen 5 7600X',
    '{"socket":"AM5","cores":6,"threads":12,"baseClock":4.7,"boostClock":5.3,"tdp":105,"integratedGraphics":true,"ramType":"DDR5","l3Cache":32,"coolerIncluded":false}',
    229.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":224.00}]',
    84,
    105,
    null
  ),
  (
    'cpu',
    'Intel',
    'Core i9-14900K',
    'Core i9-14900K',
    '{"socket":"LGA1700","cores":24,"threads":32,"baseClock":3.2,"boostClock":6.0,"tdp":253,"integratedGraphics":true,"ramType":"DDR5","l3Cache":36,"coolerIncluded":false}',
    589.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":589.00}]',
    95,
    253,
    null
  ),
  (
    'cpu',
    'Intel',
    'Core i7-14700K',
    'Core i7-14700K',
    '{"socket":"LGA1700","cores":20,"threads":28,"baseClock":3.4,"boostClock":5.6,"tdp":253,"integratedGraphics":true,"ramType":"DDR5","l3Cache":33,"coolerIncluded":false}',
    409.00,
    'limited',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":409.00}]',
    90,
    253,
    null
  ),
  (
    'cpu',
    'Intel',
    'Core i5-14600K',
    'Core i5-14600K',
    '{"socket":"LGA1700","cores":14,"threads":20,"baseClock":3.5,"boostClock":5.3,"tdp":181,"integratedGraphics":true,"ramType":"DDR5","l3Cache":24,"coolerIncluded":false}',
    299.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":294.99}]',
    82,
    181,
    null
  ),
  -- ---------------------------------------------------------------- GPUs (6)
  (
    'gpu',
    'NVIDIA',
    'GeForce RTX 4090',
    'GeForce RTX 4090 Founders Edition',
    '{"vram":24,"memoryType":"GDDR6X","tdp":450,"length":304,"recommendedPsu":850,"slotWidth":3,"powerConnectors":"1x 12VHPWR","outputs":["HDMI 2.1","3x DisplayPort 1.4"]}',
    1799.00,
    'limited',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":1799.00}]',
    100,
    450,
    null
  ),
  (
    'gpu',
    'NVIDIA',
    'GeForce RTX 4080 Super',
    'GeForce RTX 4080 Super',
    '{"vram":16,"memoryType":"GDDR6X","tdp":320,"length":310,"recommendedPsu":750,"slotWidth":3,"powerConnectors":"1x 12VHPWR"}',
    999.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":999.00}]',
    92,
    320,
    null
  ),
  (
    'gpu',
    'NVIDIA',
    'GeForce RTX 4070 Ti Super',
    'GeForce RTX 4070 Ti Super',
    '{"vram":16,"memoryType":"GDDR6X","tdp":285,"length":305,"recommendedPsu":700,"slotWidth":2.5,"powerConnectors":"1x 16-pin"}',
    799.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":799.00}]',
    85,
    285,
    null
  ),
  (
    'gpu',
    'NVIDIA',
    'GeForce RTX 4070',
    'GeForce RTX 4070 OC',
    '{"vram":12,"memoryType":"GDDR6X","tdp":200,"length":244,"recommendedPsu":650,"slotWidth":2,"powerConnectors":"1x 8-pin"}',
    549.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":539.99}]',
    76,
    200,
    null
  ),
  (
    'gpu',
    'AMD',
    'Radeon RX 7900 XTX',
    'Radeon RX 7900 XTX',
    '{"vram":24,"memoryType":"GDDR6","tdp":355,"length":287,"recommendedPsu":800,"slotWidth":2.5,"powerConnectors":"2x 8-pin"}',
    949.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":949.00}]',
    90,
    355,
    null
  ),
  (
    'gpu',
    'AMD',
    'Radeon RX 7800 XT',
    'Radeon RX 7800 XT',
    '{"vram":16,"memoryType":"GDDR6","tdp":263,"length":267,"recommendedPsu":700,"slotWidth":2.5,"powerConnectors":"2x 8-pin"}',
    499.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":489.99}]',
    74,
    263,
    null
  ),
  -- -------------------------------------------------------- Motherboards (4)
  (
    'motherboard',
    'ASUS',
    'ROG Strix X670E-E Gaming',
    'ROG Strix X670E-E Gaming WiFi',
    '{"socket":"AM5","chipset":"X670E","formFactor":"ATX","ramType":"DDR5","maxRam":128,"ramSlots":4,"m2Slots":4,"wifi":"Wi-Fi 6E","pcie":"PCIe 5.0 x16"}',
    399.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":399.00}]',
    92,
    25,
    null
  ),
  (
    'motherboard',
    'MSI',
    'MAG B650 Tomahawk WiFi',
    'MAG B650 Tomahawk WiFi',
    '{"socket":"AM5","chipset":"B650","formFactor":"ATX","ramType":"DDR5","maxRam":128,"ramSlots":4,"m2Slots":3,"wifi":"Wi-Fi 6","pcie":"PCIe 4.0 x16"}',
    219.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":214.99}]',
    80,
    20,
    null
  ),
  (
    'motherboard',
    'ASUS',
    'ROG Strix Z790-E Gaming',
    'ROG Strix Z790-E Gaming WiFi II',
    '{"socket":"LGA1700","chipset":"Z790","formFactor":"ATX","ramType":"DDR5","maxRam":192,"ramSlots":4,"m2Slots":5,"wifi":"Wi-Fi 7","pcie":"PCIe 5.0 x16"}',
    429.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":429.00}]',
    91,
    28,
    null
  ),
  (
    'motherboard',
    'Gigabyte',
    'B760M AORUS Elite AX',
    'B760M AORUS Elite AX',
    '{"socket":"LGA1700","chipset":"B760","formFactor":"mATX","ramType":"DDR5","maxRam":128,"ramSlots":4,"m2Slots":2,"wifi":"Wi-Fi 6E","pcie":"PCIe 4.0 x16"}',
    179.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":174.99}]',
    74,
    18,
    null
  ),
  -- ----------------------------------------------------------------- RAM (4)
  (
    'ram',
    'G.Skill',
    'Trident Z5 Neo 32GB 6000 CL30',
    'Trident Z5 Neo RGB 32GB DDR5-6000 CL30',
    '{"type":"DDR5","capacity":32,"speed":6000,"casLatency":30,"sticks":2,"height":44,"voltage":1.35,"expo":true,"xmp":true}',
    119.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":119.00}]',
    90,
    12,
    null
  ),
  (
    'ram',
    'Corsair',
    'Vengeance 64GB 5600 CL36',
    'Vengeance 64GB (2x32GB) DDR5-5600 CL36',
    '{"type":"DDR5","capacity":64,"speed":5600,"casLatency":36,"sticks":2,"height":35,"voltage":1.25,"expo":true,"xmp":true}',
    189.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":184.99}]',
    84,
    16,
    null
  ),
  (
    'ram',
    'Corsair',
    'Vengeance 32GB 6000 CL30',
    'Vengeance 32GB (2x16GB) DDR5-6000 CL30',
    '{"type":"DDR5","capacity":32,"speed":6000,"casLatency":30,"sticks":2,"height":35,"voltage":1.35,"expo":true,"xmp":true}',
    99.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":97.99}]',
    88,
    12,
    null
  ),
  (
    'ram',
    'Kingston',
    'Fury Beast 32GB 3600 CL18',
    'Fury Beast 32GB (2x16GB) DDR4-3600 CL18',
    '{"type":"DDR4","capacity":32,"speed":3600,"casLatency":18,"sticks":2,"height":34,"voltage":1.35,"expo":false,"xmp":true}',
    74.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":72.99}]',
    70,
    10,
    null
  ),
  -- ------------------------------------------------------------- Storage (3)
  (
    'storage',
    'Samsung',
    '990 Pro 2TB',
    '990 Pro 2TB NVMe PCIe 4.0',
    '{"type":"NVMe","interface":"PCIe 4.0 x4","capacity":2000,"readSpeed":7450,"writeSpeed":6900,"formFactor":"M.2 2280","enduranceTbw":1200}',
    169.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":169.00}]',
    97,
    8,
    null
  ),
  (
    'storage',
    'WD',
    'Black SN850X 2TB',
    'WD Black SN850X 2TB NVMe PCIe 4.0',
    '{"type":"NVMe","interface":"PCIe 4.0 x4","capacity":2000,"readSpeed":7300,"writeSpeed":6600,"formFactor":"M.2 2280","enduranceTbw":1200}',
    139.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":134.99}]',
    94,
    8,
    null
  ),
  (
    'storage',
    'Crucial',
    'P3 1TB',
    'P3 1TB NVMe PCIe 3.0',
    '{"type":"NVMe","interface":"PCIe 3.0 x4","capacity":1000,"readSpeed":3500,"writeSpeed":3000,"formFactor":"M.2 2280","enduranceTbw":220}',
    69.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":64.99}]',
    72,
    6,
    null
  ),
  -- ----------------------------------------------------------------- PSU (3)
  (
    'psu',
    'Corsair',
    'RM850x',
    'RM850x 850W 80+ Gold Fully Modular',
    '{"wattage":850,"efficiency":"80+ Gold","modular":"Full","length":160,"atxStandard":"ATX 3.0","fanSize":135,"warranty":10}',
    139.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":139.00}]',
    92,
    null,
    null
  ),
  (
    'psu',
    'Seasonic',
    'Prime TX-1000',
    'Prime TX-1000 1000W 80+ Titanium',
    '{"wattage":1000,"efficiency":"80+ Titanium","modular":"Full","length":170,"atxStandard":"ATX 3.0","fanSize":135,"warranty":12}',
    289.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":289.00}]',
    98,
    null,
    null
  ),
  (
    'psu',
    'be quiet!',
    'Pure Power 12 M 750W',
    'Pure Power 12 M 750W 80+ Gold',
    '{"wattage":750,"efficiency":"80+ Gold","modular":"Full","length":150,"atxStandard":"ATX 3.0","fanSize":120,"warranty":10}',
    109.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":104.90}]',
    88,
    null,
    null
  ),
  -- ---------------------------------------------------------------- Case (3)
  (
    'case',
    'NZXT',
    'H7 Flow',
    'H7 Flow Mid-Tower',
    '{"formFactorSupport":["ATX","mATX","ITX"],"maxGpuLength":400,"maxCoolerHeight":185,"radiatorSupport":["360mm","280mm","240mm"],"includedFans":2,"sidePanel":"Tempered glass"}',
    129.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":129.00}]',
    87,
    null,
    null
  ),
  (
    'case',
    'Lian Li',
    'O11 Dynamic EVO',
    'O11 Dynamic EVO Mid-Tower',
    '{"formFactorSupport":["E-ATX","ATX","mATX","ITX"],"maxGpuLength":426,"maxCoolerHeight":167,"radiatorSupport":["360mm","280mm","240mm"],"includedFans":0,"sidePanel":"Tempered glass"}',
    179.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":179.00}]',
    92,
    null,
    null
  ),
  (
    'case',
    'Fractal Design',
    'North',
    'North Mid-Tower (Walnut)',
    '{"formFactorSupport":["ATX","mATX","ITX"],"maxGpuLength":355,"maxCoolerHeight":170,"radiatorSupport":["360mm","240mm"],"includedFans":2,"sidePanel":"Mesh"}',
    139.00,
    'limited',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":139.99}]',
    88,
    null,
    null
  ),
  -- ------------------------------------------------------------- Cooling (3)
  (
    'cooling',
    'Noctua',
    'NH-D15',
    'NH-D15 Chromax Black',
    '{"type":"Air","tdpRating":250,"socketSupport":["AM5","AM4","LGA1700","LGA1200"],"height":165,"radiatorSize":null,"noise":24,"fans":2}',
    109.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":109.95}]',
    92,
    3,
    null
  ),
  (
    'cooling',
    'Arctic',
    'Liquid Freezer III 360',
    'Liquid Freezer III 360 A-RGB',
    '{"type":"AIO","tdpRating":300,"socketSupport":["AM5","AM4","LGA1700","LGA1200"],"height":63,"radiatorSize":360,"noise":28,"fans":3}',
    129.00,
    'in_stock',
    '[{"store":"Newegg","url":"https://www.newegg.com","price":129.00}]',
    97,
    12,
    null
  ),
  (
    'cooling',
    'DeepCool',
    'LT520 240',
    'LT520 240mm AIO',
    '{"type":"AIO","tdpRating":220,"socketSupport":["AM5","AM4","LGA1700"],"height":55,"radiatorSize":240,"noise":30,"fans":2}',
    89.00,
    'in_stock',
    '[{"store":"Amazon","url":"https://www.amazon.com","price":89.99}]',
    84,
    10,
    null
  ) on conflict (category, brand, model) do
update
set
  name = excluded.name,
  specs = excluded.specs,
  price = excluded.price,
  stock_status = excluded.stock_status,
  store_links = excluded.store_links,
  performance_score = excluded.performance_score,
  power_draw_watts = excluded.power_draw_watts,
  image_url = excluded.image_url,
  is_active = true,
  updated_at = now ();

-- -----------------------------------------------------------------------------
-- COMPATIBILITY RULES
-- -----------------------------------------------------------------------------
insert into
  public.compatibility_rules (
    rule_key,
    category_a,
    category_b,
    rule_type,
    spec_path_a,
    spec_path_b,
    config,
    message,
    severity
  )
values
  (
    'cpu_motherboard_socket',
    'cpu',
    'motherboard',
    'match',
    'socket',
    'socket',
    '{}',
    'The CPU socket must match the motherboard socket (AM5 or LGA1700).',
    'error'
  ),
  (
    'cpu_ram_type',
    'cpu',
    'ram',
    'match',
    'ramType',
    'type',
    '{}',
    'The memory type (DDR4/DDR5) must match what the CPU memory controller supports.',
    'error'
  ),
  (
    'motherboard_ram_type',
    'motherboard',
    'ram',
    'match',
    'ramType',
    'type',
    '{}',
    'This motherboard only accepts the memory generation it is designed for.',
    'error'
  ),
  (
    'ram_capacity_max',
    'ram',
    'motherboard',
    'max',
    'capacity',
    'maxRam',
    '{"multiplier":"sticks"}',
    'Total memory exceeds the motherboard''s maximum supported capacity.',
    'error'
  ),
  (
    'gpu_case_length',
    'gpu',
    'case',
    'max',
    'length',
    'maxGpuLength',
    '{}',
    'The graphics card is longer than the case supports — it will not fit.',
    'error'
  ),
  (
    'cooling_case_height',
    'cooling',
    'case',
    'max',
    'height',
    'maxCoolerHeight',
    '{"appliesWhen":{"type":"Air"}}',
    'The air cooler is taller than the case clearance allows.',
    'error'
  ),
  (
    'cooling_socket_support',
    'cooling',
    'cpu',
    'match',
    'socketSupport',
    'socket',
    '{}',
    'This cooler does not include a mounting kit for this CPU socket.',
    'error'
  ),
  (
    'psu_wattage_min',
    'psu',
    'gpu',
    'min',
    'wattage',
    'recommendedPsu',
    '{"headroomPercent":15}',
    'The power supply is below the GPU''s recommended wattage plus headroom.',
    'error'
  ),
  (
    'psu_gpu_connectors',
    'psu',
    'gpu',
    'custom',
    'connectors',
    'powerConnectors',
    '{}',
    'The PSU does not provide the PCIe power connectors this GPU needs.',
    'warning'
  ),
  (
    'case_motherboard_formfactor',
    'case',
    'motherboard',
    'formfactor',
    'formFactorSupport',
    'formFactor',
    '{}',
    'The motherboard form factor is not supported by this case.',
    'error'
  ),
  (
    'motherboard_case_pcie',
    'motherboard',
    'case',
    'custom',
    'pcie',
    'maxGpuLength',
    '{}',
    'The GPU will cover PCIe slots this motherboard uses for expansion cards.',
    'warning'
  ),
  (
    'storage_motherboard_interface',
    'storage',
    'motherboard',
    'match',
    'interface',
    'm2Slots',
    '{"note":"NVMe M.2 drives require an available M.2 slot"}',
    'All M.2 slots on this motherboard are already occupied.',
    'warning'
  ) on conflict (rule_key) do
update
set
  category_a = excluded.category_a,
  category_b = excluded.category_b,
  rule_type = excluded.rule_type,
  spec_path_a = excluded.spec_path_a,
  spec_path_b = excluded.spec_path_b,
  config = excluded.config,
  message = excluded.message,
  severity = excluded.severity;

-- -----------------------------------------------------------------------------
-- DEMO BUILDS (public, platform-owned — user_id null)
-- Totals are recalculated by the build_items trigger.
-- -----------------------------------------------------------------------------
insert into
  public.builds (
    user_id,
    name,
    slug,
    description,
    use_case,
    is_public,
    build_score,
    score_breakdown
  )
values
  (
    null,
    'Signal — 4K Gaming Flagship',
    'signal-4k-gaming-flagship',
    'Built for 4K high refresh: 7800X3D, RTX 4090 and enough PSU headroom to keep transient spikes calm.',
    'gaming',
    true,
    94,
    '{"compatibility":100,"performance":98,"value":86,"efficiency":88,"upgradability":96}'
  ),
  (
    null,
    'Quantum — Local LLM Lab',
    'quantum-local-llm-lab',
    '24 GB of VRAM, 64 GB of system memory and a Titanium PSU that idles silently between training runs.',
    'ai',
    true,
    91,
    '{"compatibility":100,"performance":94,"value":82,"efficiency":90,"upgradability":88}'
  ),
  (
    null,
    'Vector — 1440p Sweet Spot',
    'vector-1440p-sweet-spot',
    'Every dollar earns frames at 1440p. The configuration we recommend to most first-time builders.',
    'gaming',
    true,
    92,
    '{"compatibility":100,"performance":86,"value":96,"efficiency":90,"upgradability":88}'
  ) on conflict (slug) do
update
set
  description = excluded.description,
  use_case = excluded.use_case,
  is_public = excluded.is_public,
  build_score = excluded.build_score,
  score_breakdown = excluded.score_breakdown,
  updated_at = now ();

-- Attach parts (price_at_add snapshots the current catalogue price)
with
  mapping (build_slug, component_brand, component_model) as (
    values
      (
        'signal-4k-gaming-flagship',
        'AMD',
        'Ryzen 7 7800X3D'
      ),
      (
        'signal-4k-gaming-flagship',
        'ASUS',
        'ROG Strix X670E-E Gaming'
      ),
      (
        'signal-4k-gaming-flagship',
        'NVIDIA',
        'GeForce RTX 4090'
      ),
      (
        'signal-4k-gaming-flagship',
        'G.Skill',
        'Trident Z5 Neo 32GB 6000 CL30'
      ),
      (
        'signal-4k-gaming-flagship',
        'Samsung',
        '990 Pro 2TB'
      ),
      (
        'signal-4k-gaming-flagship',
        'Seasonic',
        'Prime TX-1000'
      ),
      (
        'signal-4k-gaming-flagship',
        'Lian Li',
        'O11 Dynamic EVO'
      ),
      (
        'signal-4k-gaming-flagship',
        'Arctic',
        'Liquid Freezer III 360'
      ),
      (
        'quantum-local-llm-lab',
        'Intel',
        'Core i7-14700K'
      ),
      (
        'quantum-local-llm-lab',
        'ASUS',
        'ROG Strix Z790-E Gaming'
      ),
      (
        'quantum-local-llm-lab',
        'NVIDIA',
        'GeForce RTX 4090'
      ),
      (
        'quantum-local-llm-lab',
        'Corsair',
        'Vengeance 64GB 5600 CL36'
      ),
      ('quantum-local-llm-lab', 'WD', 'Black SN850X 2TB'),
      (
        'quantum-local-llm-lab',
        'Seasonic',
        'Prime TX-1000'
      ),
      (
        'quantum-local-llm-lab',
        'Fractal Design',
        'North'
      ),
      (
        'quantum-local-llm-lab',
        'Arctic',
        'Liquid Freezer III 360'
      ),
      ('vector-1440p-sweet-spot', 'AMD', 'Ryzen 5 7600X'),
      (
        'vector-1440p-sweet-spot',
        'MSI',
        'MAG B650 Tomahawk WiFi'
      ),
      (
        'vector-1440p-sweet-spot',
        'NVIDIA',
        'GeForce RTX 4070 Ti Super'
      ),
      (
        'vector-1440p-sweet-spot',
        'G.Skill',
        'Trident Z5 Neo 32GB 6000 CL30'
      ),
      (
        'vector-1440p-sweet-spot',
        'WD',
        'Black SN850X 2TB'
      ),
      (
        'vector-1440p-sweet-spot',
        'Corsair',
        'RM850x'
      ),
      (
        'vector-1440p-sweet-spot',
        'Fractal Design',
        'North'
      ),
      (
        'vector-1440p-sweet-spot',
        'DeepCool',
        'LT520 240'
      )
  )
insert into
  public.build_items (build_id, component_id, quantity, price_at_add)
select
  b.id,
  c.id,
  1,
  c.price
from
  mapping m
  join public.builds b on b.slug = m.build_slug
  join public.components c on c.brand = m.component_brand
  and c.model = m.component_model on conflict (build_id, component_id) do nothing;

commit;

-- Sanity check (visible in the SQL editor output):
--   select count(*) from public.components;             -- expect 32
--   select category, count(*) from public.components group by 1 order by 1;
--   select slug, total_price, total_power_watts from public.builds;