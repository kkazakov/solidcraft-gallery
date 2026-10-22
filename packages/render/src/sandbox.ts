export interface SandboxInput {
  /** Absolute path to the CLI binary inside the sandbox root. */
  cli: string;
  /** Host path of the design; mounted read-only at /work/design.solidcraft. */
  designPath: string;
  /** Host directory for output; mounted read-write at /work/out. */
  outDir: string;
  /** Wall-clock limit in seconds. */
  timeoutSeconds: number;
  /** CLI arguments after the binary. The design is already mounted. */
  args: string[];
}

export interface Command {
  command: string;
  args: string[];
}

/** The jail root is built into the worker image; see infra/worker/Dockerfile. */
export const SANDBOX_ROOT = '/';

/**
 * Build an nsjail invocation. Deliberately no shell: arguments are passed as
 * an array, and every path is a host path chosen by the worker, never a string
 * from a repository or a design.
 */
export function sandboxCommand(input: SandboxInput): Command {
  if (!Number.isInteger(input.timeoutSeconds) || input.timeoutSeconds < 1 || input.timeoutSeconds > 300) {
    throw new Error('timeoutSeconds must be an integer between 1 and 300');
  }
  if (!input.cli.startsWith('/')) throw new Error('cli must be an absolute path');
  if (!input.designPath.startsWith('/')) throw new Error('designPath must be absolute');
  if (!input.outDir.startsWith('/')) throw new Error('outDir must be absolute');

  return {
    command: 'nsjail',
    args: [
      '--mode',
      'o',
      // Keep the default network namespace: no interfaces, no DNS, no egress.
      '--disable_proc',
      '--disable_clone_newcgroup',
      '--user',
      '65534',
      '--group',
      '65534',
      '--chroot',
      SANDBOX_ROOT,
      '--cwd',
      '/work',
      '--tmpfsmount',
      '/tmp',
      '--env',
      'HOME=/tmp',
      '--env',
      'TMPDIR=/tmp',
      '--env',
      'PATH=/usr/local/bin:/usr/bin:/bin',
      '--env',
      'LANG=C.UTF-8',
      '--time_limit',
      String(input.timeoutSeconds),
      '--rlimit_as',
      '1024',
      '--rlimit_cpu',
      String(input.timeoutSeconds),
      '--rlimit_nofile',
      '256',
      '--rlimit_nproc',
      '64',
      '--rlimit_fsize',
      '32',
      '--max_cpus',
      '1',
      '--bindmount_ro',
      `${input.designPath}:/work/design.solidcraft`,
      '--bindmount',
      `${input.outDir}:/work/out`,
      '--',
      input.cli,
      ...input.args,
    ],
  };
}

export function designInSandbox(): string {
  return '/work/design.solidcraft';
}

export function outInSandbox(name: string): string {
  if (name.includes('/') || name.includes('..')) throw new Error('output name must be a plain file name');
  return `/work/out/${name}`;
}
