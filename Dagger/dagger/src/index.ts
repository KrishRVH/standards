import { type Container, type Directory, dag, func, object } from '@dagger.io/dagger';

const MISE_VERSION = 'v2026.6.11';
const MISE_LINUX_X64_URL = `https://github.com/jdx/mise/releases/download/${MISE_VERSION}/mise-${MISE_VERSION}-linux-x64`;

const SOURCE_EXCLUDES = [
  '.cache',
  '.coverage',
  '.git',
  '.gstack',
  '.hypothesis',
  '.lua-language-server',
  '.lua_modules',
  '.mypy_cache',
  '.next',
  '.nox',
  '.nuxt',
  '.parcel-cache',
  '.pytest_cache',
  '.ruff_cache',
  '.svelte-kit',
  '.tox',
  '.turbo',
  '.venv',
  '.vite',
  '.vs',
  '__pycache__',
  'CMakeFiles',
  'Testing',
  'artifacts',
  'build',
  'coverage',
  'dist',
  'htmlcov',
  'lua_modules',
  'node_modules',
  'out',
  'target',
  'vendor',
];

@object()
export class ProjectCi {
  /**
   * CI entrypoint. Hosted CI should run this through `mise run ci`.
   */
  @func()
  async ci(source: Directory): Promise<string> {
    return await this.runMise(source, ['run', 'ci:local']).stdout();
  }

  /**
   * Run the local mise check task in an isolated Dagger container.
   */
  @func()
  async check(source: Directory): Promise<string> {
    return await this.runMise(source, ['run', 'check:local']).stdout();
  }

  /**
   * Run an arbitrary mise task in the same container shape used by CI.
   */
  @func()
  async task(source: Directory, name: string): Promise<string> {
    return await this.runMise(source, ['run', name]).stdout();
  }

  private runMise(source: Directory, args: string[]): Container {
    return dag
      .container()
      .from('ubuntu:24.04')
      .withEnvVariable('DEBIAN_FRONTEND', 'noninteractive')
      .withExec(['apt-get', 'update'])
      .withExec([
        'apt-get',
        'install',
        '-y',
        '--no-install-recommends',
        'ca-certificates',
        'curl',
        'git',
        'xz-utils',
      ])
      .withExec(['rm', '-rf', '/var/lib/apt/lists'])
      .withExec(['curl', '-fsSL', '-o', '/usr/local/bin/mise', MISE_LINUX_X64_URL])
      .withExec(['chmod', '+x', '/usr/local/bin/mise'])
      .withMountedCache('/root/.local/share/mise', dag.cacheVolume('mise-tools'))
      .withMountedCache('/root/.cache/mise', dag.cacheVolume('mise-cache'))
      .withMountedCache('/root/.cache/uv', dag.cacheVolume('uv-cache'))
      .withEnvVariable('MISE_TRUSTED_CONFIG_PATHS', '/src')
      .withDirectory('/src', source, { exclude: SOURCE_EXCLUDES })
      .withWorkdir('/src')
      .withExec(['mise', 'run', 'install'])
      .withExec(['mise', ...args]);
  }
}
