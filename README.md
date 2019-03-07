# npm-local-development

Replacement for `npm link` done right for local development of multiple packages that are based on each other.
It copies files using a watcher instead of using symlinks and excludes "peerDependencies"
to make it possible to really work locally on multiple packages that are not only a hello world application.

## Install


```
npm i -g npm-local-development
```


## How to use

You have basically two options:

### 1. Use lerna

If you have already a lerna.json you simply fire `npm-local-development` in the console
in the same folder where your lerna.json is.

Example output (Lerna only):

```
$ npm-local-development --no-watcher
Read lerna.json ...
@deepkit/cli
  -> @deepkit/core
  -> @deepkit/core-node
@deepkit/core-node
  -> @deepkit/core
@deepkit/app
  -> @deepkit/core
@deepkit/electron
  -> @deepkit/core
  -> @deepkit/core-node
@deepkit/server
  -> @deepkit/core
  -> @deepkit/core-node
Ready
```

### 2. Use lerna + `.links.json`

You can additional to lerna possible create a new file `.links.json` and
You enter all your links manually:

```
{
    "@shared/core": "../../my-library-repo/packages/core",
    "@shared/angular-button": "../../my-library-repo/packages/angular-button"
}
```

Example output (Lerna + .links.json):

```
$ npm-local-development --no-watcher
Read lerna.json ...
Read .links.json ...
@marcj/glut-client
  -> @marcj/glut-core
  -> @marcj/estdlib
  -> @marcj/marshal
@marcj/glut-integration
  -> @marcj/glut-client
  -> @marcj/glut-core
  -> @marcj/glut-server
  -> @marcj/estdlib
  -> @marcj/marshal
  -> @marcj/marshal-mongo
@marcj/glut-sample-angular
  -> @marcj/glut-client
  -> @marcj/glut-core
  -> @marcj/glut-server
  -> @marcj/marshal
  -> @marcj/marshal-mongo
@marcj/glut-server
  -> @marcj/glut-core
  -> @marcj/estdlib
  -> @marcj/estdlib-rxjs
  -> @marcj/marshal
  -> @marcj/marshal-mongo
@marcj/glut-core
  -> @marcj/estdlib-rxjs
  -> @marcj/marshal
```

### 3. Use arguments + `.links.json`

Given `.links.json`:

```
{
    "@shared/core": "../../my-library-repo/packages/core",
    "@shared/angular-button": "../../my-library-repo/packages/angular-button"
}
```

you need to define which actual root packages should link their dependencies
to your links.json. So you can define those root packages as argument:

`npm-local-development ./package-a ./package-b ...`

## NOTE: peerDependencies

Make sure that `devDependencies` that should not be synced (and thus the root package should use its own version)
are in `peerDependencies` as well, otherwise your dependency will still use
its own version of its dependencies.

Example:

If you have a @vendor/core package that has rxjs as devDependencies and that should be used by a root package,
you need to put it (rxjs) also in peerDependencies (in @vendor/core), or @vendor/core will continue to
use its own version of rxjs, which is not what you want.

You should **not** put rxjs in `dependencies` as this would always lead to
non nominal instances. All instances of rxjs created by your @vendor/core
package could not be detected as such using `instanceof` in the root package,
as you end up having basically two version of rxjs.

## NOTE: npm install

Note: When you want to use `npm` (`npm install`, `npm uninstall`, etc) please stop
npm-local-development first. It reverts the structure back, so
npm can continue to work.

## NOTE: Symlinks

Note: You need to set env `NODE_PRESERVE_SYMLINKS=1` to make this function.
If you use TypeScript, set compilerOptions `"preserveSymlinks": true`.

```
NODE_PRESERVE_SYMLINKS=1 node_modules/.bin/ts-node --ignore='node_modules\/(?!@deepkit)' -- src/main.ts
```

## Arguments

Use `--no-watcher` to run in one time only. Ideal for CI/build environments.


## Working on multiple packages locally

When you work on 2 (or more) packages locally where one requires the other,
you need to link them somehow, so you don't have to publish one and `npm install` in the other again and again.
`npm link` was built to allow this, however `npm link` is fundamentally broken with modern architectures.
See the section below "This tool solves multiples issues" to see why.

If those packages are directly related to each other, you usually should use Lerna to manage them
all in one Git repository. It will make life way easier.

If that is not an option, you can use this tool nonetheless. Just go in each package and
`npm install` as usual. If one package is completely new or not registered in npm registry, use

```
  "dependencies": {
    "@vendor/other-package": "file:../other-package"
  }
```

(Tip: `@vendor` is not necessary, but helps to keep things organised)

This creates automatically a link (`node_modules/@vendor/other-package -> ../other-package`)
after running `npm install`.

Use now `npm-local-development @vendor/other-package ../other-package` in your root package folder.
It removes the link and syncs now your dependencies correctly while your work on them.

Note: This tool does not `npm install` anything. Make sure you have all dependencies installed first.
If you update dependencies, the tool restarts automatically.

If you have multiple such links, you should use create a .links.json config instead.
See section "Working with more complex setup".

## Working with Lerna

Usually, when you use Lerna, you work on multiple packages at the same time. E.g.

```
root
 | packages
 \__ core
 \__ frontend
 \__ server
```


When `frontend` and `server` requires the `core` package, Lerna symlinks them automatically,
which leads to horrible errors that are not obvious at all. See the section below.

This tool can read your `lerna.json` and syncs the dependencies using a file watcher to solves
all the issues below, so your build tools recognize the `core` as normal package
like as it has been installed via npm directly.

Whenever you run `lerna bootstrap`, make sure to run `npm-local-development` as well.

It syncs now your dependencies correctly while your work on them.

## TypeScript-only packages as dependency using ts-node

Per default `ts-node` disables compilation of node_modules. So when you have a core utils package that
contains only TypeScript, you need to enable compiling for that.

package.json
```
  "scripts": {
    "run": "node_modules/.bin/ts-node --ignore 'node_modules/(?!@myName)' src/main.ts"
  }
```

I recommend to prefix your package names with your vendor name, so you have `@myName/core`, `@myName/app`, `@myName/server` etc.

If you use CLI tools like oclif which initialises ts-node on their own, use the environment variable:


bin/run
```
process.env['TS_NODE_IGNORE'] = 'node_modules/(?!@myName)';

require('@oclif/command').run()
.then(require('@oclif/command/flush'))
.catch(require('@oclif/errors/handle'));
....
```

bash:
```
TS_NODE_IGNORE='node_modules/(?!@myName)' my-binary
```

## Angular 2+ TypeScript-only dependency

When working with Angular you need to include your packages in the compilation config:

tsconfig.json
```
  "include": [
    "node_modules/@myName/*/src/**/*.ts"
  ]
```

NOTE: Do not reference your packages relatively via `import '../../@myName/core` in your code, as this would break again
the peerDependency resolution. Work with your local packages as if they have been installed via npm directly, then everything works fine.

Example:

```
import {coolFunction} from '@myName/core';
```

Create here an issue at Github https://github.com/marcj/npm-local-development/issues if you encounter problems.

## This tool solves multiples issues

with local development of NPM packages that are tightly coupled to each other.

#### 1. Symlinks break build tools and compiler like TypeScript & Angular

When you npm link a package outside of your build folder (where usually your
tsconfig.json lies), TypeScript does not compile those files. You
need to include those file in `"includes": ["../other-package/**/*.ts"]`
manually. That's not a problem per se, as you could and should add
those packages to `includes` either way.
The problem arises when your `other-package` has `peerDependencies`,
which you have installed in the root package: Node and the compiled won't find them, as it resolves
the symlink first, and then the parent folder of `other-package` resolves to a different one.
That resolved folder is usually not a children directory of your root package, so it can not find the actual packages
in `peerDependencies` anymore. Also, symlinks forces you to install the `peerDependencies` in your `other-package`
before you can use them correctly in the root package, but that leads to nominal types being broken, see point 2.

#### 2. Nominal types break

When you npm link `other-package` while you're working on `other-package`,
which means you have its `devDependencies` installed, those `devDependencies`
overwrite your dependencies of the root package.

Example: If `other-package` uses RXJS as devDependencies and installed it
(because you work on that package at the moment as well)
you end up having 2 RXJS instances:
One on your root `node_modules/rxjs`
and one in `node_modules/other-package/node_modules/rxjs`.

Whenever you execute code in `node_modules/other-package/utils.ts` it will use
its own RXJS code. You in the root package will use a different version of RXJS.

So, when your `other-packages` creates for example an `Observable`:

```
# other-package/index.ts

import {Observable} from 'rxjs';

export function promiseToObservable<T>(p: Promise<T>): Observable<T> {
    return new Observable((observer) => {
        p.then((v) => observer.next(v), (err) => observer.error(err));
    });
}
```

and you use it like

```
# main.js

import {Observable} from 'rxjs';
import {promiseToObservable} from 'other-package';

const myPromise = Promise.resolve();
const observable = promiseToObservable(myPromise);

observable instanceof Observable; // return false, which breaks stuff 

```

You see that observable is indeed a `Observable` instance, but not from your `rxjs`
package, but from the one in `node_modules/other-package/node_modules/rxjs`, which leads to horrible
errors that are not at all obvious. This tool fixes that - if (and only IF) you list `rxjs` in `other-package`'s
`peerDependencies` as you should (additionally to `devDependencies` so your IDE and
test scripts still work).

#### 3. Symlinks are not automatically synced in WebStorm

WebStorm does not resolve immediately changes made to the target behind symlinks and caches
the "old" state. Using real files instead, the WebStorm IDE sees immediate changes.
