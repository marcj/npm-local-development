#!/usr/bin/env node
import * as fs from 'fs-extra';
import * as glob from 'glob';
import {resolve, relative, join, basename} from 'path';
import {watch} from 'chokidar';

function printUsage() {
    console.log('Usage: `cd` into your root package folder first, then execute');
    console.log('npm-local-development <package-name> <package-source>');
    console.log('or');
    console.log('npm-local-development lerna');
}

async function sync(cwd: string, packageName: string, packageSource: string) {
    const ignored: string[] = [];
    const packagePathInRootNodeModules = resolve(cwd, 'node_modules', packageName);

    if (!packagePathInRootNodeModules) {
        throw new Error(`Dependency ${packageName} not found. Install it first.`);
    }

    if (!packageSource) {
        throw new Error(`Dependency source ${packageName} not defined.`);
    }

    if (!fs.existsSync(packageSource)) {
        throw new Error(`Dependency source ${packageName} in '${packageSource}' not found. Install it first.`);
    }

    let peerDeps = {};
    let peerDepsArray: string[] = [];

    function readDeps() {
        const modulePackage = fs.readJSONSync(join(packageSource, 'package.json')) || {};
        peerDeps = modulePackage['peerDependencies'] || {};

        for (const i in peerDeps) {
            ignored.push(join(packageSource, 'node_modules', i) + '/**/*');
            peerDepsArray.push(i);
        }
    }

    readDeps();

    if (await fs.pathExists(packagePathInRootNodeModules)) {
        await fs.remove(packagePathInRootNodeModules);
    }

    async function updateNodeModulesSymLinks() {
        await fs.remove(join(packagePathInRootNodeModules, 'node_modules'));

        const packageNodeModules = join(packageSource, 'node_modules');
        const rootNodeModules = join(packagePathInRootNodeModules, 'node_modules');

        for (const file of await fs.readdir(packageNodeModules)) {
            const stat = await fs.lstat(join(packageNodeModules, file));
            if (!stat.isDirectory()) {
                continue;
            }

            const packageJsonPath = join(packageNodeModules, file, 'package.json');
            if (await fs.pathExists(packageJsonPath)) {
                // console.log('symlink', join(packageNodeModules, file), join(rootNodeModules, file));
                fs.ensureSymlinkSync(join(packageNodeModules, file), join(rootNodeModules, file));
            } else {
                await fs.ensureDir(join(rootNodeModules, file));
                for (const subFile of await fs.readdir(join(packageNodeModules, file))) {
                    const stat = await fs.lstat(join(packageNodeModules, file, subFile));
                    if (!stat.isDirectory()) {
                        continue;
                    }

                    // console.log('symlink', join(packageNodeModules, file, subFile), join(rootNodeModules, file, subFile));
                    fs.ensureSymlinkSync(join(packageNodeModules, file, subFile), join(rootNodeModules, file, subFile));
                }
            }
        }

        for (const dep of peerDepsArray) {
            await fs.remove(join(rootNodeModules, dep));
        }

        //remove peerDependencies symlinks
    }

    try {
        await fs.copy(packageSource, packagePathInRootNodeModules, {
            filter: (path, dest) => {
                if (-1 !== path.indexOf('/node_modules/')) {
                    return false;
                }
                return true;
            }
        });
    } catch (error) {
        console.error('Error in copying', packageSource, 'to', packagePathInRootNodeModules);
        console.error(error);
    }

    await updateNodeModulesSymLinks();

    watch(packageSource + '/package.json', {
        ignoreInitial: true,
        ignored: ['.git'],
        followSymlinks: false
    }).on('all', (event, path) => {
        console.log('package.json changed, reload.');
        readDeps();
        for (const excluded of peerDepsArray) {
            fs.remove(join(packagePathInRootNodeModules, 'node_modules', excluded));
        }
    });

    watch(join(packageSource, 'node_modules'), {
        ignoreInitial: true,
        depth: 1,
        followSymlinks: false
    }).on('all', async (event, path) => {

        console.log('dep changed', path);

        const baseName = basename(path);
        if ('node_modules' === baseName) return;

        const modulePath = join(packagePathInRootNodeModules, 'node_modules', baseName);

        if (0 === event.indexOf('unlink')) {
            // console.log(event, 'unlink', modulePath, path);
            fs.unlinkSync(modulePath);
        } else {
            // console.log(event, 'link', modulePath, path);
            fs.ensureSymlinkSync(path, modulePath);
        }
    });

    watch(packageSource, {
        ignored: packageSource + '/node_modules/**/*',
        ignoreInitial: true,
        followSymlinks: false
    }).on('all', async (event, path) => {
        const target = join(packagePathInRootNodeModules, relative(packageSource, path));
        // console.log(event, path, '->', target);
        if (event === 'unlink') {
            fs.unlink(target);
        } else {
            fs.copy(path, target);
        }
    });

    watch(packageSource + '/node_modules', {
        ignored: ignored,
        ignoreInitial: true,
        followSymlinks: false
    }).on('all', (event, path) => {
        const relativePath = relative(packageSource, path);
        for (const excluded of peerDepsArray) {
            if (relativePath.startsWith(join('node_modules', excluded))) {
                return;
            }
        }

        const target = join(packagePathInRootNodeModules, relativePath);
        // console.log(event, 'dep', path, '->', relativePath);
        if (event === 'unlink') {
            fs.unlink(target);
        } else {
            fs.copy(path, target);
        }
    });
}

async function run() {
    if (!process.argv[2] || process.argv[2] === '-h' || process.argv[2] === '--help') {
        printUsage();
        return;
    }

    const cwd = process.cwd();
    if ('lerna' === process.argv[2]) {
        const lernaConfig = fs.readJSONSync(join(cwd, 'lerna.json'));
        if (!lernaConfig) {
            throw new Error(`Could not find lerna.json`);
        }

        if (!lernaConfig['packages']) {
            throw new Error(`No 'packages' defined in lerna.json`);
        }

        //name to package dir
        const packages: { [name: string]: string } = {};

        for (const packageGlob of lernaConfig['packages']) {
            const thisPkgs = glob.sync(packageGlob, {
                ignore: ['node_modules']
            });

            for (const pkg of thisPkgs) {
                const pkgConfig = fs.readJSONSync(join(cwd, pkg, 'package.json'));
                packages[pkgConfig['name']] = pkg;
            }

        }

        const promises: Promise<void>[] = [];
        for (const pkg in packages) {
            const path = packages[pkg];

            try {
                const pkgConfig = fs.readJSONSync(join(cwd, path, 'package.json'));

                const deps = pkgConfig['dependencies'] || {};
                const devDeps = pkgConfig['devDependencies'] || {};

                const depsToSync: { [name: string]: string } = {};

                for (const pkgDep in packages) {
                    if (deps[pkgDep]) {
                        depsToSync[pkgDep] = packages[pkgDep];
                    } else if (devDeps[pkgDep]) {
                        depsToSync[pkgDep] = packages[pkgDep];
                    }
                }

                for (const depToSync in depsToSync) {
                    console.log(`${packages[pkg]} -> ${depToSync} (${depsToSync[depToSync]})`);
                    promises.push(sync(join(cwd, packages[pkg]), depToSync, join(cwd, depsToSync[depToSync])));
                }
            } catch (error) {
                throw new Error(`Could not read package.json of ${path}`);
            }
        }

        if (promises.length === 0) {
            console.error('No packages deps found.');
            process.exit(1);
            return;
        }

        console.log('Wait for initial sync ...');
        await Promise.all(promises);
        console.log('Lerna deps setup and watching now ...');

    } else {
        const packageName = process.argv[2];
        const packageSource = resolve(process.argv[3]);

        console.log('Sync', packageName, packageSource);
        await sync(cwd, packageName, packageSource);
        console.log('Watching ... ');

    }
}

run();
