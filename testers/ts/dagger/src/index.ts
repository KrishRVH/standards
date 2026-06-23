import { type Container, type Directory, dag, func, object } from '@dagger.io/dagger';

const MISE_VERSION = 'v2026.6.12';

const SOURCE_EXCLUDES = [
  '.cache',
  '.cargo-tools',
  '.coverage',
  '.deptrac.cache',
  '.elixir_ls',
  '.git',
  '.gradle',
  '.gstack',
  '.hpc',
  '.hypothesis',
  '.infection',
  '.kotlin',
  '.lua-language-server',
  '.lua_modules',
  '.mypy_cache',
  '.next',
  '.nox',
  '.nuxt',
  '.parcel-cache',
  '.pdepend',
  '.php-cs-fixer.cache',
  '.php-cs-fixer.php.cache',
  '.phpbench',
  '.phpunit.cache',
  '.phpunit.result.cache',
  '.phpstan.cache',
  '.psalm-cache',
  '.psalm/cache',
  '.pytest_cache',
  '.rector-cache',
  '.ruff_cache',
  '.svelte-kit',
  '.tox',
  '.turbo',
  '.venv',
  '.vite',
  '.vs',
  '*.tsbuildinfo',
  '__pycache__',
  '_build',
  'bin',
  'CMakeFiles',
  'cover',
  'Testing',
  'artifacts',
  'build',
  'coverage',
  'deps',
  'dist',
  'dist-newstyle',
  'doc',
  'htmlcov',
  'lua_modules',
  'node_modules',
  'obj',
  'out',
  'TestResults',
  'var/cache',
  'var/log',
  'target',
  'vendor',
  'zig-cache',
  '.zig-cache',
  'zig-out',
  'zig-pkg',
];

@object()
export class ProjectCi {
  /**
   * CI entrypoint. Hosted CI should run this through `mise run dagger:ci`.
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

  private runMise(source: Directory, args: string[]): Container {
    return dag
      .container()
      .from('ubuntu:24.04')
      .withEnvVariable('DEBIAN_FRONTEND', 'noninteractive')
      .withExec(['apt-get', 'update'])
      .withExec(['apt-get', 'install', '-y', '--no-install-recommends', 'ca-certificates', 'curl', 'git', 'xz-utils'])
      .withExec(['rm', '-rf', '/var/lib/apt/lists'])
      .withExec([
        'sh',
        '-euxc',
        `
arch="$(uname -m)"
case "$arch" in
  x86_64|amd64) asset="linux-x64" ;;
  aarch64|arm64) asset="linux-arm64" ;;
  *) echo "Unsupported container architecture for mise: $arch" >&2; exit 1 ;;
esac
curl -fsSL -o /usr/local/bin/mise "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/mise-${MISE_VERSION}-$asset"
chmod +x /usr/local/bin/mise
        `,
      ])
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
