import { describe, expect, it } from 'vitest';
import { renderPlan } from '../src/render.js';
import { designInSandbox, outInSandbox, sandboxCommand } from '../src/sandbox.js';

const input = {
  cli: '/opt/solidcraft/solidcraft-cli',
  designPath: '/var/lib/gallery/work/v1/design.solidcraft',
  outDir: '/var/lib/gallery/work/v1/out',
  timeoutSeconds: 60,
};

describe('sandboxCommand', () => {
  it('disables networking and sets limits', () => {
    const { command, args } = sandboxCommand({ ...input, args: ['snapshot'] });
    expect(command).toBe('nsjail');
    expect(args).toContain('--disable_clone_newnet');
    expect(args).toContain('--time_limit');
    expect(args).toContain('60');
    expect(args).toContain('--rlimit_as');
    expect(args).toContain('--');
  });

  it('mounts the design read-only and the output writable', () => {
    const { args } = sandboxCommand({ ...input, args: [] });
    expect(args).toContain(`${input.designPath}:/work/design.solidcraft`);
    expect(args).toContain(`${input.outDir}:/work/out`);
  });

  it('rejects relative paths and absurd timeouts', () => {
    expect(() => sandboxCommand({ ...input, cli: 'solidcraft-cli', args: [] })).toThrow();
    expect(() => sandboxCommand({ ...input, timeoutSeconds: 0, args: [] })).toThrow();
    expect(() => sandboxCommand({ ...input, timeoutSeconds: 1000, args: [] })).toThrow();
  });
});

describe('renderPlan', () => {
  it('renders three views, metrics, STEP and STL', () => {
    const plan = renderPlan(input);
    expect(plan.map((step) => step.name)).toEqual(['iso', 'top', 'front', 'metrics', 'step', 'stl']);
    for (const step of plan) expect(step.command.command).toBe('nsjail');
  });

  it('asks for the documented sizes and views', () => {
    const plan = renderPlan(input);
    const iso = plan[0]!.command.args.join(' ');
    expect(iso).toContain('--view iso');
    expect(iso).toContain('--width 1200');
    expect(iso).toContain('--no-grid');
    expect(iso).toContain('--no-axes');
  });

  it('uses fixed in-sandbox paths', () => {
    expect(designInSandbox()).toBe('/work/design.solidcraft');
    expect(outInSandbox('iso.png')).toBe('/work/out/iso.png');
    expect(() => outInSandbox('../escape')).toThrow();
  });
});
