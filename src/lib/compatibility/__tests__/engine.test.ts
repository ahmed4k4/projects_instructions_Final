import { describe, expect, it } from 'vitest';
import type { PCComponent } from '@/types/components';
import {
  countBySeverity,
  evaluateCompatibility,
  normaliseKey,
  readSpecPath,
  summariseCompatibility,
  totalPowerWatts,
} from '../engine';
import type { BuildItems } from '../types';
import {
  RULES,
  caseRoomy,
  caseSmall,
  caseTiny,
  coolerAio,
  coolerTallAir,
  cpuAm5,
  cpuLga,
  gpu4070,
  gpu4090,
  mbAm5,
  mbLga,
  psu750,
  psu1000,
  ramDdr4,
  ramDdr5,
  storageNvme,
} from './fixtures';

const build = (parts: Partial<Record<keyof BuildItems, PCComponent>>) => parts as BuildItems;

/**
 * A complete, compatible AM5 reference build.
 * "Complete" matters: the engine reports every missing essential category as a
 * warning, so partial builds are never reported as fully clean.
 */
const completeBuild = () =>
  build({
    cpu: cpuAm5(),
    motherboard: mbAm5(),
    gpu: gpu4090(),
    ram: ramDdr5(),
    storage: storageNvme(),
    psu: psu1000(),
    case: caseRoomy(),
    cooling: coolerAio(),
  });

const keys = (issues: { ruleKey: string }[]) => issues.map((i) => i.ruleKey);

describe('evaluateCompatibility — happy path', () => {
  it('reports a fully compatible build with zero issues', () => {
    const report = evaluateCompatibility(completeBuild(), RULES);

    expect(report.isCompatible).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    expect(report.checkedRules).toBeGreaterThan(0);
  });

  it('counts every rule that had both sides present', () => {
    const report = evaluateCompatibility(completeBuild(), RULES);
    // 12 seeded rules; the PCIe-slot advisory resolves, so all 12 are checked.
    expect(report.checkedRules + report.skippedRules).toBe(RULES.length);
  });
});

describe('rule type: match — cpu_motherboard_socket', () => {
  it('fails with an error when an Intel CPU sits on an AM5 board', () => {
    const report = evaluateCompatibility(
      build({ cpu: cpuLga(), motherboard: mbAm5(), ram: ramDdr5() }),
      RULES,
    );

    expect(report.isCompatible).toBe(false);
    expect(keys(report.errors)).toContain('cpu_motherboard_socket');
  });

  it('passes when the sockets agree case-insensitively', () => {
    const cpu = cpuAm5();
    const mb = mbAm5();
    cpu.specs = { ...cpu.specs, socket: 'am5 ' };

    const report = evaluateCompatibility(build({ cpu, motherboard: mb }), RULES);
    expect(keys(report.errors)).not.toContain('cpu_motherboard_socket');
  });
});

describe('rule type: match — ram_type', () => {
  it('flags DDR4 memory on a DDR5 platform (two separate rules)', () => {
    const report = evaluateCompatibility(
      build({ cpu: cpuAm5(), motherboard: mbAm5(), ram: ramDdr4() }),
      RULES,
    );

    expect(keys(report.errors)).toEqual(expect.arrayContaining(['cpu_ram_type', 'motherboard_ram_type']));
  });
});

describe('rule type: match — array membership (cooler socket support)', () => {
  it('fails when the cooler has no bracket for the CPU socket', () => {
    const cooler = coolerAio();
    cooler.specs = { ...cooler.specs, socketSupport: ['AM4', 'LGA1200'] };

    const report = evaluateCompatibility(build({ cpu: cpuAm5(), cooling: cooler }), RULES);
    expect(keys(report.errors)).toContain('cooling_socket_support');
  });
});

describe('rule type: min — psu_wattage_min', () => {
  it('fails when a 750 W PSU cannot cover the 4090 recommendation plus headroom', () => {
    // 850 × 1.15 = 977.5 → needs 978 W, so 750 W must fail.
    const report = evaluateCompatibility(build({ cpu: cpuAm5(), gpu: gpu4090(), psu: psu750() }), RULES);

    expect(keys(report.errors)).toContain('psu_wattage_min');
  });

  it('passes when the PSU clears the recommendation with headroom', () => {
    const report = evaluateCompatibility(build({ cpu: cpuAm5(), gpu: gpu4090(), psu: psu1000() }), RULES);
    expect(keys(report.errors)).not.toContain('psu_wattage_min');
  });

  it('passes for a modest GPU on the same 750 W unit', () => {
    // 650 × 1.15 = 747.5 → 748 W ≤ 750 W.
    const report = evaluateCompatibility(build({ cpu: cpuAm5(), gpu: gpu4070(), psu: psu750() }), RULES);
    expect(keys(report.errors)).not.toContain('psu_wattage_min');
  });
});

describe('rule type: max — physical clearance', () => {
  it('fails gpu_case_length when the card is longer than the bay', () => {
    const gpu = gpu4090();
    gpu.specs = { ...gpu.specs, length: 420 };

    const report = evaluateCompatibility(build({ gpu, case: caseSmall() }), RULES);
    expect(keys(report.errors)).toContain('gpu_case_length');
  });

  it('fails cooling_case_height for a 172 mm air tower in a 170 mm case', () => {
    const report = evaluateCompatibility(
      build({ case: caseSmall(), cooling: coolerTallAir(), cpu: cpuAm5() }),
      RULES,
    );
    expect(keys(report.errors)).toContain('cooling_case_height');
  });

  it('ignores cooling_case_height for an AIO (appliesWhen: Air)', () => {
    const report = evaluateCompatibility(
      build({ case: caseSmall(), cooling: coolerAio(), cpu: cpuAm5() }),
      RULES,
    );
    expect(keys(report.errors)).not.toContain('cooling_case_height');
    expect(report.skippedRules).toBeGreaterThan(0);
  });

  it('accounts for the sticks multiplier in ram_capacity_max', () => {
    const mb = mbAm5();
    mb.specs = { ...mb.specs, maxRam: 48 };
    const ram = ramDdr5(); // 32 GB × 2 sticks = 64 GB > 48 GB

    const report = evaluateCompatibility(build({ motherboard: mb, ram, cpu: cpuAm5() }), RULES);
    expect(keys(report.errors)).toContain('ram_capacity_max');
  });
});

describe('rule type: formfactor — case_motherboard_formfactor', () => {
  it('fails when the case does not list the board form factor', () => {
    const mb = mbLga();
    mb.specs = { ...mb.specs, formFactor: 'E-ATX' };

    const report = evaluateCompatibility(build({ cpu: cpuLga(), motherboard: mb, case: caseSmall() }), RULES);
    expect(keys(report.errors)).toContain('case_motherboard_formfactor');
  });

  it('passes for a supported mATX board in an ATX case', () => {
    const mb = mbLga();
    mb.specs = { ...mb.specs, formFactor: 'mATX' };
    const kb = caseSmall();
    kb.specs = { ...kb.specs, formFactorSupport: ['ATX', 'mATX', 'ITX'] };

    const report = evaluateCompatibility(build({ cpu: cpuLga(), motherboard: mb, case: kb }), RULES);
    expect(keys(report.errors)).not.toContain('case_motherboard_formfactor');
  });
});

describe('rule type: custom', () => {
  it('raises a warning when the PSU declares too few PCIe connectors', () => {
    const psu = psu1000();
    psu.specs = { ...psu.specs, pcieConnectors: 0 };

    const report = evaluateCompatibility(build({ gpu: gpu4090(), psu }), RULES);
    expect(keys(report.warnings)).toContain('psu_gpu_connectors');
    // A warning never blocks the build.
    expect(report.isCompatible).toBe(true);
  });

  it('warns about a 3-slot GPU in a tight case bay', () => {
    // 304 mm 4090 in a 315 mm bay → 11 mm spare (< 20 mm), a 3-slot card
    // blocks the slot directly below. The length rule still passes.
    const tight = caseTiny();
    tight.specs = { ...tight.specs, maxGpuLength: 315 };

    const report = evaluateCompatibility({ ...completeBuild(), gpu: gpu4090(), case: tight }, RULES);
    expect(keys(report.errors)).not.toContain('gpu_case_length');
    expect(keys(report.warnings)).toContain('motherboard_case_pcie');
  });

  it('skips custom rules that have no registered handler', () => {
    const rules = [{ ...RULES[8]!, ruleKey: 'not_a_real_handler' }];
    const report = evaluateCompatibility(build({ gpu: gpu4090(), psu: psu1000() }), rules);
    expect(report.checkedRules).toBe(0);
    expect(report.skippedRules).toBe(1);
  });
});

describe('missing components', () => {
  it('returns a compatible partial report for an empty build', () => {
    const report = evaluateCompatibility({}, RULES);
    expect(report.isCompatible).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.checkedRules).toBe(0);
    expect(report.skippedRules).toBe(RULES.length);
  });

  it('only checks rules whose both sides are present', () => {
    const report = evaluateCompatibility(build({ cpu: cpuAm5(), motherboard: mbAm5() }), RULES);
    // Only cpu_motherboard_socket has both sides here.
    expect(report.checkedRules).toBe(1);
    expect(report.isCompatible).toBe(true);
  });

  it('does not flag a part whose counterpart is absent', () => {
    const report = evaluateCompatibility(build({ cpu: cpuLga() }), RULES);
    expect(report.errors).toHaveLength(0);
  });
});

describe('multi-error builds', () => {
  it('collects independent failures in one pass', () => {
    // Intel CPU on AM5 board + DDR4 memory + undersized PSU.
    const report = evaluateCompatibility(
      build({
        cpu: cpuLga(),
        motherboard: mbAm5(),
        ram: ramDdr4(),
        gpu: gpu4090(),
        psu: psu750(),
      }),
      RULES,
    );

    expect(report.isCompatible).toBe(false);
    expect(report.errors.length).toBeGreaterThanOrEqual(3);
    expect(keys(report.errors)).toEqual(
      expect.arrayContaining(['cpu_motherboard_socket', 'psu_wattage_min']),
    );
    // Every error carries the components it implicates.
    for (const issue of report.errors) {
      expect(issue.componentAId).toBeTruthy();
      expect(issue.componentBId).toBeTruthy();
    }
  });
});

describe('helpers', () => {
  it('totalPowerWatts sums component draw', () => {
    expect(totalPowerWatts(completeBuild())).toBe(120 + 25 + 450 + 12 + 8 + 12);
  });

  it('readSpecPath resolves nested and top-level fields', () => {
    const cpu = cpuAm5();
    expect(readSpecPath(cpu, 'socket')).toBe('AM5');
    expect(readSpecPath(cpu, 'price')).toBe(379);
    expect(readSpecPath(cpu, 'missing.key')).toBeUndefined();
  });

  it('normaliseKey ignores case, spaces and separators', () => {
    expect(normaliseKey('LGA 1700')).toBe(normaliseKey('lga_1700'));
  });

  it('summarises counts for the UI banner', () => {
    expect(summariseCompatibility(evaluateCompatibility(completeBuild(), RULES))).toBe('All compatible');

    const broken = evaluateCompatibility({ ...completeBuild(), cpu: cpuLga() }, RULES);
    expect(summariseCompatibility(broken)).toMatch(/error/);
    expect(countBySeverity(broken, 'error')).toBeGreaterThanOrEqual(1);
  });
});
