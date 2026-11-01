-- =============================================================================
-- 003_fps_benchmarks_seed.sql
--
-- ~120 benchmark rows: 10 games × 4 GPUs × 3 resolutions at the 'high' preset.
--
-- Source shape: `fps_avg` is the *average* frame rate at the given resolution
-- and preset on a high-end CPU (Ryzen 7 7800X3D / i7-14700K), so the GPU is the
-- bottleneck. The estimator applies its own CPU-bottleneck penalty on top.
--
-- Numbers are indicative, generated from a resolution-scaling model
-- (1440p ≈ 0.70 × 1080p, 4K ≈ 0.42 × 1080p for raster titles) and rounded to a
-- plausible integer. Replace with measured data before shipping to consumers.
-- Idempotent: `on conflict ... do update`.
-- =============================================================================
insert into
  public.fps_benchmarks (
    gpu_model,
    game_title,
    resolution,
    quality_preset,
    fps_avg,
    cpu_test_used
  )
values
  -- ------------------------------------------------------------ RTX 4090 ----
  (
    'GeForce RTX 4090',
    'Cyberpunk 2077',
    '1080p',
    'high',
    192,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Cyberpunk 2077',
    '1440p',
    'high',
    134,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Cyberpunk 2077',
    '4k',
    'high',
    81,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'CS2',
    '1080p',
    'high',
    480,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'CS2',
    '1440p',
    'high',
    402,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'CS2',
    '4k',
    'high',
    236,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Valorant',
    '1080p',
    'high',
    640,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Valorant',
    '1440p',
    'high',
    512,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Valorant',
    '4k',
    'high',
    290,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Fortnite',
    '1080p',
    'high',
    330,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Fortnite',
    '1440p',
    'high',
    244,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Fortnite',
    '4k',
    'high',
    144,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Call of Duty Warzone',
    '1080p',
    'high',
    268,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Call of Duty Warzone',
    '1440p',
    'high',
    198,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Call of Duty Warzone',
    '4k',
    'high',
    116,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Elden Ring',
    '1080p',
    'high',
    230,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Elden Ring',
    '1440p',
    'high',
    172,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Elden Ring',
    '4k',
    'high',
    104,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Red Dead Redemption 2',
    '1080p',
    'high',
    210,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Red Dead Redemption 2',
    '1440p',
    'high',
    156,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Red Dead Redemption 2',
    '4k',
    'high',
    96,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Baldurs Gate 3',
    '1080p',
    'high',
    216,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Baldurs Gate 3',
    '1440p',
    'high',
    164,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Baldurs Gate 3',
    '4k',
    'high',
    101,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Hogwarts Legacy',
    '1080p',
    'high',
    198,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Hogwarts Legacy',
    '1440p',
    'high',
    142,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Hogwarts Legacy',
    '4k',
    'high',
    86,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Starfield',
    '1080p',
    'high',
    164,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Starfield',
    '1440p',
    'high',
    118,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4090',
    'Starfield',
    '4k',
    'high',
    72,
    'Ryzen 7 7800X3D'
  ),
  -- ------------------------------------------------------- RTX 4080 Super ----
  (
    'GeForce RTX 4080 Super',
    'Cyberpunk 2077',
    '1080p',
    'high',
    168,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Cyberpunk 2077',
    '1440p',
    'high',
    116,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Cyberpunk 2077',
    '4k',
    'high',
    68,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'CS2',
    '1080p',
    'high',
    452,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'CS2',
    '1440p',
    'high',
    372,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'CS2',
    '4k',
    'high',
    212,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Valorant',
    '1080p',
    'high',
    612,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Valorant',
    '1440p',
    'high',
    486,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Valorant',
    '4k',
    'high',
    264,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Fortnite',
    '1080p',
    'high',
    302,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Fortnite',
    '1440p',
    'high',
    218,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Fortnite',
    '4k',
    'high',
    126,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Call of Duty Warzone',
    '1080p',
    'high',
    244,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Call of Duty Warzone',
    '1440p',
    'high',
    178,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Call of Duty Warzone',
    '4k',
    'high',
    102,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Elden Ring',
    '1080p',
    'high',
    214,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Elden Ring',
    '1440p',
    'high',
    158,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Elden Ring',
    '4k',
    'high',
    92,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Red Dead Redemption 2',
    '1080p',
    'high',
    192,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Red Dead Redemption 2',
    '1440p',
    'high',
    140,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Red Dead Redemption 2',
    '4k',
    'high',
    84,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Baldurs Gate 3',
    '1080p',
    'high',
    198,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Baldurs Gate 3',
    '1440p',
    'high',
    148,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Baldurs Gate 3',
    '4k',
    'high',
    90,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Hogwarts Legacy',
    '1080p',
    'high',
    182,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Hogwarts Legacy',
    '1440p',
    'high',
    128,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Hogwarts Legacy',
    '4k',
    'high',
    76,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Starfield',
    '1080p',
    'high',
    150,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Starfield',
    '1440p',
    'high',
    106,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4080 Super',
    'Starfield',
    '4k',
    'high',
    64,
    'Ryzen 7 7800X3D'
  ),
  -- ----------------------------------------------- RTX 4070 Ti Super ----
  (
    'GeForce RTX 4070 Ti Super',
    'Cyberpunk 2077',
    '1080p',
    'high',
    148,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Cyberpunk 2077',
    '1440p',
    'high',
    100,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Cyberpunk 2077',
    '4k',
    'high',
    58,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'CS2',
    '1080p',
    'high',
    430,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'CS2',
    '1440p',
    'high',
    350,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'CS2',
    '4k',
    'high',
    190,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Valorant',
    '1080p',
    'high',
    590,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Valorant',
    '1440p',
    'high',
    462,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Valorant',
    '4k',
    'high',
    246,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Fortnite',
    '1080p',
    'high',
    272,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Fortnite',
    '1440p',
    'high',
    192,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Fortnite',
    '4k',
    'high',
    108,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Call of Duty Warzone',
    '1080p',
    'high',
    222,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Call of Duty Warzone',
    '1440p',
    'high',
    158,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Call of Duty Warzone',
    '4k',
    'high',
    88,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Elden Ring',
    '1080p',
    'high',
    206,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Elden Ring',
    '1440p',
    'high',
    146,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Elden Ring',
    '4k',
    'high',
    82,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Red Dead Redemption 2',
    '1080p',
    'high',
    176,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Red Dead Redemption 2',
    '1440p',
    'high',
    124,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Red Dead Redemption 2',
    '4k',
    'high',
    72,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Baldurs Gate 3',
    '1080p',
    'high',
    184,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Baldurs Gate 3',
    '1440p',
    'high',
    132,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Baldurs Gate 3',
    '4k',
    'high',
    80,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Hogwarts Legacy',
    '1080p',
    'high',
    168,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Hogwarts Legacy',
    '1440p',
    'high',
    116,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Hogwarts Legacy',
    '4k',
    'high',
    66,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Starfield',
    '1080p',
    'high',
    138,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Starfield',
    '1440p',
    'high',
    96,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070 Ti Super',
    'Starfield',
    '4k',
    'high',
    56,
    'Ryzen 7 7800X3D'
  ),
  -- ------------------------------------------------------------ RTX 4070 ----
  (
    'GeForce RTX 4070',
    'Cyberpunk 2077',
    '1080p',
    'high',
    118,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Cyberpunk 2077',
    '1440p',
    'high',
    78,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Cyberpunk 2077',
    '4k',
    'high',
    44,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'CS2',
    '1080p',
    'high',
    396,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'CS2',
    '1440p',
    'high',
    310,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'CS2',
    '4k',
    'high',
    158,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Valorant',
    '1080p',
    'high',
    548,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Valorant',
    '1440p',
    'high',
    424,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Valorant',
    '4k',
    'high',
    212,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Fortnite',
    '1080p',
    'high',
    236,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Fortnite',
    '1440p',
    'high',
    162,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Fortnite',
    '4k',
    'high',
    88,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Call of Duty Warzone',
    '1080p',
    'high',
    196,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Call of Duty Warzone',
    '1440p',
    'high',
    136,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Call of Duty Warzone',
    '4k',
    'high',
    74,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Elden Ring',
    '1080p',
    'high',
    188,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Elden Ring',
    '1440p',
    'high',
    130,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Elden Ring',
    '4k',
    'high',
    70,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Red Dead Redemption 2',
    '1080p',
    'high',
    152,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Red Dead Redemption 2',
    '1440p',
    'high',
    104,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Red Dead Redemption 2',
    '4k',
    'high',
    60,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Baldurs Gate 3',
    '1080p',
    'high',
    162,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Baldurs Gate 3',
    '1440p',
    'high',
    114,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Baldurs Gate 3',
    '4k',
    'high',
    66,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Hogwarts Legacy',
    '1080p',
    'high',
    148,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Hogwarts Legacy',
    '1440p',
    'high',
    100,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Hogwarts Legacy',
    '4k',
    'high',
    56,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Starfield',
    '1080p',
    'high',
    118,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Starfield',
    '1440p',
    'high',
    82,
    'Ryzen 7 7800X3D'
  ),
  (
    'GeForce RTX 4070',
    'Starfield',
    '4k',
    'high',
    46,
    'Ryzen 7 7800X3D'
  ) on conflict (gpu_model, game_title, resolution, quality_preset) do
update
set
  fps_avg = excluded.fps_avg,
  cpu_test_used = excluded.cpu_test_used;