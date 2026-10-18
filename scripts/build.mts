#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { root, buildPath } from './build-paths.mts';

const output = buildPath('_output', 'jellyfin-web');
const artifacts = buildPath('_artifacts');
const packaged = buildPath('_artifacts', 'jellyfin-web');
const reports = buildPath('_tests');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    version: string;
    engines: { node: string; npm: string };
};
interface Check {
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    exitCode?: number | null;
    signal?: NodeJS.Signals | null;
    durationSeconds?: number;
    log?: string;
}
interface TestResult {
    success: boolean;
    numTotalTests: number;
    numPassedTests: number;
    numFailedTests: number;
    numPendingTests: number;
}
const checks: Check[] = [];
const argumentsList = new Set(process.argv.slice(2));

function showHelp() {
    console.log(`Usage: bash ./build.sh [--skip-install] [--skip-checks]

Default: npm ci, typecheck, lint, stylelint, tests, production build, ES5 check and package.
  --skip-install  Reuse the current node_modules directory.
  --skip-checks   Skip typecheck, lint, stylelint, tests and ES5 check; record this in build-info.
  --help          Show this help.

NODE_BIN selects Node.js in build.sh. NPM_CLI selects an npm-cli.js file.
JELLYFIN_VERSION overrides the version displayed by the web client.
Outputs: _output/jellyfin-web, _artifacts, _temp/logs and _tests.
No server, watcher, upload or deployment is started.`);
}

function requireVersion(name: string, actual: string, range: string): void {
    const minimum = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(range);
    if (!minimum) throw new Error(`Unsupported ${name} engine range: ${range}`);
    const parts = actual.replace(/^v/, '').split('.').map(Number);
    const required = minimum.slice(1).map(Number);
    for (let index = 0; index < required.length; index++) {
        if (parts[index] > required[index]) return;
        if (parts[index] < required[index] || !Number.isFinite(parts[index])) {
            throw new Error(`${name} ${range} is required; found ${actual}. See README.build.md.`);
        }
    }
}

function findNpm() {
    if (process.env.NPM_CLI) {
        const selected = path.resolve(process.env.NPM_CLI);
        if (!fs.existsSync(selected)) throw new Error(`NPM_CLI does not exist: ${selected}`);
        return selected;
    }
    if (process.env.npm_execpath?.endsWith('npm-cli.js')) return process.env.npm_execpath;
    const directories = [path.dirname(process.execPath), ...(process.env.PATH || '').split(path.delimiter)];
    for (const directory of directories) {
        const candidates = [
            path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
            path.join(directory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
            path.join(directory, 'npm')
        ];
        for (const candidate of candidates) {
            if (!fs.existsSync(candidate)) continue;
            const resolved = fs.realpathSync(candidate);
            if (resolved.endsWith('npm-cli.js')) return resolved;
        }
    }
    throw new Error('npm-cli.js was not found. Install npm alongside Node.js or set NPM_CLI.');
}

function git(...args: string[]): string {
    // Git and tar are fixed local build tools intentionally resolved from the caller's PATH.
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function digest(file: string): string {
    return crypto.createHash('sha256').update(new Uint8Array(fs.readFileSync(file))).digest('hex');
}

function writeReport() {
    fs.writeFileSync(buildPath('_tests', 'build-checks.json'), `${JSON.stringify(checks, null, 2)}\n`);
}

async function runStep(name: string, command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<void> {
    const logFile = buildPath('_temp', 'logs', `${name}.log`);
    const log = fs.createWriteStream(logFile);
    const started = Date.now();
    console.log(`\n== ${name} ==`);
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd || root,
            env: options.env || process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        for (const stream of [child.stdout, child.stderr]) {
            stream.on('data', (data) => {
                process.stdout.write(data);
                log.write(data);
            });
        }
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
    }).finally(() => new Promise<void>((resolve) => log.end(resolve)));
    checks.push({ name, status: result.code === 0 ? 'passed' : 'failed', exitCode: result.code,
        signal: result.signal, durationSeconds: Number(((Date.now() - started) / 1000).toFixed(2)),
        log: path.relative(root, logFile).split(path.sep).join('/') });
    writeReport();
    if (result.code !== 0) throw new Error(`${name} failed (exit ${result.code}, signal ${result.signal || 'none'}). Log: ${logFile}`);
}

function verifyOutput() {
    for (const relative of ['index.html', 'config.json', 'serviceworker.js']) {
        if (!fs.statSync(path.join(output, relative)).isFile()) throw new Error(`Missing output: ${relative}`);
    }
    const themes = fs.readdirSync(path.join(root, 'src', 'themes')).filter((name) =>
        fs.existsSync(path.join(root, 'src', 'themes', name, 'theme.scss')));
    for (const theme of themes) {
        if (!fs.statSync(path.join(output, 'themes', theme, 'theme.css')).size) throw new Error(`Empty theme: ${theme}`);
    }
    const index = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    const mainCss = fs.readdirSync(output).filter((name) => /^main\.jellyfin\..+\.css$/.test(name));
    if (mainCss.length !== 1 || !index.includes(mainCss[0])) throw new Error('Production CSS was not extracted and linked in index.html.');
    return { themes, extractedCss: mainCss[0] };
}

function testSummary() {
    const file = path.join(reports, 'vitest.json');
    if (argumentsList.has('--skip-checks')) return { status: 'skipped' };
    const result = JSON.parse(fs.readFileSync(file, 'utf8')) as TestResult;
    if (!result.success || result.numFailedTests !== 0) throw new Error('Vitest report does not confirm a successful test run.');
    return { status: 'passed', total: result.numTotalTests, passed: result.numPassedTests,
        failed: result.numFailedTests, pending: result.numPendingTests };
}

function removePackage() {
    if (path.dirname(packaged) !== artifacts || path.basename(packaged) !== 'jellyfin-web') {
        throw new Error('Refusing to clean an unexpected package path.');
    }
    fs.rmSync(buildPath('_artifacts', 'jellyfin-web'), { recursive: true, force: true });
}

async function installAndCheck(npm: string): Promise<void> {
    if (argumentsList.has('--skip-install')) {
        if (!fs.existsSync(path.join(root, 'node_modules', 'webpack', 'package.json'))) throw new Error('--skip-install requires prepared node_modules.');
        checks.push({ name: 'install', status: 'skipped' });
    } else { await runStep('install', process.execPath, [npm, 'ci', '--no-audit']); }
    if (argumentsList.has('--skip-checks')) {
        for (const name of ['typecheck', 'lint', 'stylelint', 'test']) checks.push({ name, status: 'skipped' });
    } else {
        for (const [name, script] of [['typecheck', 'build:check'], ['lint', 'lint'], ['stylelint', 'stylelint'], ['test', 'test']]) {
            await runStep(name, process.execPath, [npm, 'run', script]);
        }
    }
}

async function main() {
    if (argumentsList.has('--help')) return showHelp();
    for (const argument of argumentsList) {
        if (!['--skip-install', '--skip-checks'].includes(argument)) throw new Error(`Unknown argument: ${argument}`);
    }
    process.chdir(root);
    requireVersion('Node.js', process.versions.node, packageJson.engines.node);
    process.env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`;
    const npm = findNpm();
    process.env.npm_config_cache = buildPath('_temp', 'npm-cache');
    process.env.npm_config_logs_dir = buildPath('_temp', 'npm-logs');
    for (const name of ['vitest.json', 'vitest.xml', 'coverage', 'build-checks.json']) buildPath('_tests', name);
    const npmVersion = execFileSync(process.execPath, [npm, '--version'], { cwd: root, encoding: 'utf8' }).trim();
    requireVersion('npm', npmVersion, packageJson.engines.npm);
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    execFileSync('tar', ['--version'], { stdio: 'ignore', windowsHide: true });
    for (const directory of [artifacts, reports, buildPath('_temp', 'logs')]) fs.mkdirSync(directory, { recursive: true });

    const revision = git('rev-parse', 'HEAD');
    const branch = git('branch', '--show-current');
    const dirty = Boolean(git('status', '--porcelain', '--untracked-files=normal'));
    const archiveVersion = process.env.JELLYFIN_VERSION || packageJson.version;
    const version = process.env.JELLYFIN_VERSION || `${packageJson.version}-alien21.${revision.slice(0, 8)}${dirty ? '-dirty' : ''}`;
    process.env.JELLYFIN_VERSION = version;
    console.log(`Node.js ${process.versions.node}; npm ${npmVersion}; ${branch}@${revision.slice(0, 8)}; dirty=${dirty}`);
    await installAndCheck(npm);
    await runStep('production', process.execPath, [npm, 'run', 'build:production'], { env: { ...process.env, NODE_ENV: 'production' } });
    if (argumentsList.has('--skip-checks')) checks.push({ name: 'escheck', status: 'skipped' });
    else await runStep('escheck', process.execPath, [npm, 'run', 'escheck']);
    const verification = verifyOutput();
    const tests = testSummary();
    const buildInfo = { version, packageVersion: packageJson.version, builtAt: new Date().toISOString(),
        git: { branch, revision, dirty }, runtime: { node: process.versions.node, npm: npmVersion },
        lockfileSha256: digest(path.join(root, 'package-lock.json')), checks, tests, verification };
    fs.copyFileSync(path.join(root, 'LICENSE'), buildPath('_output', 'jellyfin-web', 'LICENSE'));
    fs.writeFileSync(buildPath('_output', 'jellyfin-web', 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);
    removePackage();
    fs.cpSync(output, packaged, { recursive: true });
    const safeVersion = archiveVersion.replace(/[^a-zA-Z0-9._-]/g, '_');
    const archiveName = `jellyfin-web-${safeVersion}-${revision.slice(0, 8)}${dirty ? '-dirty' : ''}.tar.gz`;
    const archive = buildPath('_artifacts', archiveName);
    buildPath('_artifacts', `${archiveName}.sha256`);
    await runStep('archive', 'tar', ['-czf', archiveName, 'jellyfin-web'], { cwd: artifacts });
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const entries = execFileSync('tar', ['-tzf', archiveName], { cwd: artifacts, encoding: 'utf8' }).trim().split(/\r?\n/);
    if (!entries.includes('jellyfin-web/index.html') || entries.some((entry) => !entry.startsWith('jellyfin-web/'))) {
        throw new Error('Archive must contain only the jellyfin-web/ root directory.');
    }
    fs.writeFileSync(`${archive}.sha256`, `${digest(archive)}  ${archiveName}\n`);
    writeReport();
    console.log(`\nBuild complete: ${packaged}\nArchive: ${archive}\nSHA256: ${archive}.sha256\nTests: ${JSON.stringify(tests)}\nExtracted CSS: ${verification.extractedCss}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
