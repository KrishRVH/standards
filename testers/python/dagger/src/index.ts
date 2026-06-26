import { type Container, type Directory, dag, func, object } from '@dagger.io/dagger';

const MISE_VERSION = 'v2026.6.12';
const MISE_LINUX_ARM64_SHA256 = '2ef524b353c89c54fea48c140d94c13d26aef373363ce217f16b767dbc59c3cb';
const MISE_LINUX_X64_SHA256 = 'ff0cf4917acc96b7ffdd0382261d17f405572e9240f95fafb980e44aaf60c514';

const SOURCE_EXCLUDES = [
  '.cache',
  '.cargo-tools',
  '.coverage',
  '.elixir_ls',
  '.git',
  '.gradle',
  '.gstack',
  '.hpc',
  '.hypothesis',
  '.kotlin',
  '.lua-language-server',
  '.lua_modules',
  '.mypy_cache',
  '.next',
  '.nox',
  '.nuxt',
  '.parcel-cache',
  '.phpstan.cache',
  '.phpunit.cache',
  '.phpunit.result.cache',
  '.pytest_cache',
  '.rector-cache',
  '.ruff_cache',
  '.svelte-kit',
  '.tox',
  '.turbo',
  '.venv',
  '.vite',
  '.vs',
  '.zig-cache',
  '*.tsbuildinfo',
  '__pycache__',
  '_build',
  'CMakeFiles',
  'Testing',
  'TestResults',
  'artifacts',
  'bin',
  'build',
  'cover',
  'coverage',
  'deps',
  'dist',
  'dist-newstyle',
  'htmlcov',
  'lua_modules',
  'node_modules',
  'obj',
  'out',
  'sbom',
  'target',
  'var/cache',
  'var/log',
  'vendor',
  'zig-cache',
  'zig-out',
  'zig-pkg',
];

@object()
export class ProjectStandards {
  /**
   * CI entrypoint. Hosted CI should run this through `mise run dagger:standards:check`.
   */
  @func()
  async standardsCheck(source: Directory): Promise<string> {
    return await this.runMise(source, ['run', 'standards:check']).stdout();
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
  x86_64|amd64) asset="linux-x64"; checksum="${MISE_LINUX_X64_SHA256}" ;;
  aarch64|arm64) asset="linux-arm64"; checksum="${MISE_LINUX_ARM64_SHA256}" ;;
  *) echo "Unsupported container architecture for mise: $arch" >&2; exit 1 ;;
esac
curl -fsSL -o /usr/local/bin/mise "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/mise-${MISE_VERSION}-$asset"
printf '%s  /usr/local/bin/mise\n' "$checksum" | sha256sum -c -
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
