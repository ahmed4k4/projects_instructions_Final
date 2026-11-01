# Compatibility Rules

The engine (`src/lib/compatibility/engine.ts`) is **data-driven**: each row in
`public.compatibility_rules` describes a comparison between two categories.

Adding a rule that uses an existing rule type is a **SQL insert** — no code
change, no deploy.

## Anatomy of a rule

```sql
insert into public.compatibility_rules
  (rule_key, category_a, category_b, rule_type, spec_path_a, spec_path_b, config, message, severity)
values
  ('gpu_psu_connector_count', 'psu', 'gpu', 'custom', 'pcieConnectors', 'powerConnectors',
   '{}', 'The PSU has too few PCIe connectors.', 'warning');
```

| Column                        | Meaning                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `rule_key`                    | Unique name. Required for `custom` (selects the handler).                                                     |
| `category_a` / `category_b`   | The two components compared. The build is skipped if either is absent.                                        |
| `rule_type`                   | One of the five below.                                                                                        |
| `spec_path_a` / `spec_path_b` | Dotted path into each component's `specs` (or a top-level field like `price`).                                |
| `config`                      | Rule parameters, e.g. `{"headroomPercent": 15}` or `{"appliesWhen": {"type": "Air"}}`.                        |
| `message`                     | Human sentence shown in the banner. The engine appends a detail in parentheses when the handler supplies one. |
| `severity`                    | `error` blocks the build; `warning` is advisory (still scores, but −8).                                       |

## Rule types

| Type         | Passes when                                                                                             | Example rule                                       |
| ------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `match`      | `specPathA === specPathB` (case/space-insensitive), **or** one side is an array that contains the other | `cpu_motherboard_socket`, `cooling_socket_support` |
| `min`        | `valueA >= valueB × (1 + headroomPercent/100)`, rounded up                                              | `psu_wattage_min` (GPU recommendation + 15%)       |
| `max`        | `valueA ≤ valueB`, honouring `config.multiplier` (`"sticks"` multiplies by the RAM stick count)         | `gpu_case_length`, `ram_capacity_max`              |
| `formfactor` | `specPathB` (normalised) appears in the `specPathA` array                                               | `case_motherboard_formfactor`                      |
| `custom`     | The named handler returns `{ pass: true }`                                                              | `psu_gpu_connectors`, `motherboard_case_pcie`      |

### `match` details

`match` covers three shapes, which is why the seed uses it for sockets _and_
for arrays:

```
scalar === scalar        "AM5" vs "AM5"
member of array          cpu.socket  vs cooling.socketSupport: ["AM5", "AM4"]
…and the reverse order   cooling.socketSupport vs cpu.socket
```

Comparison is normalised (`LGA 1700` ≡ `lga-1700`).

### `appliesWhen`

`config.appliesWhen.type = "Air"` restricts a rule to air coolers, so
`cooling_case_height` does not fire for an AIO whose radiator sits in the roof.

## Custom handlers

Implemented in `src/lib/compatibility/handlers.ts`. A handler receives
`(componentA, componentB, config, ctx)` and returns `{ pass, detail? }`.
`ctx` carries `items` (the whole build) and `totalWatts`.

| `rule_key`                      | Logic                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `psu_gpu_connectors`            | Fails when the PSU declares fewer PCIe connectors than the GPU requires. Passes when the PSU does not publish a count. |
| `motherboard_case_pcie`         | Warns when a 3+-slot GPU leaves <20 mm spare in the case's GPU bay.                                                    |
| `storage_motherboard_interface` | Fails when M.2 drives exceed the board's `m2Slots`.                                                                    |
| `psu_headroom`                  | Full-build headroom (adds `psuHeadroom` as an alternative to the GPU-only rule).                                       |
| `ram_speed_sweet_spot`          | Advisory check for DDR5 5600–6800 MT/s at CL ≤ 38.                                                                     |

### Adding a new rule _kind_

1. Add the handler to `CUSTOM_HANDLERS` in `handlers.ts`.
2. Insert a rule row with `rule_type = 'custom'` and `rule_key` = your handler
   name.
3. Add a unit test in `src/lib/compatibility/__tests__/engine.test.ts`.

If no handler exists for a `custom` rule, the engine **skips** it (counted in
`skippedRules`) rather than silently passing.

## Missing components

A half-built list is a valid intermediate state. Rules whose two sides are not
both present are skipped. However, the engine adds a `warning` for every
**essential** category that is empty (`missing_cpu`, `missing_gpu`, …), so a
partial build never reads as "100% compatible".

## Report shape

```ts
{
  isCompatible: boolean,      // false only when errors.length > 0
  errors: CompatibilityIssue[],
  warnings: CompatibilityIssue[],
  checkedRules: number,       // rules that actually ran
  skippedRules: number        // missing side / no handler / appliesWhen false
}
```

This is what the builder banner, the score calculator and the Build Doctor all
consume.

## Verification

`src/lib/compatibility/__tests__/realData.test.ts` replays the engine against a
snapshot of the live catalogue and the three seeded demo builds. It caught a
genuine defect in Phase 1's seed: _Vector_ paired a 750 W PSU with a GPU needing
805 W under the headroom rule. The seed now uses the 850 W RM850x.

```bash
pnpm test        # 79 tests, engine + scoring + performance
pnpm test:coverage
```
