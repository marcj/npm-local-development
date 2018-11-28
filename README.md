# npm-local-development

Replacement for `npm link` done right for local development of multiple packages that are based on each other.
It copies files using a watcher instead of using symlinks and excludes "peerDependencies"
to make it possible to really work locally on multiple packages that are not only a hello world application.

No need for `NODE_PRESERVE_SYMLINKS` or `preserve-symlinks` workarounds that are only working partially anymore.

## Install


```
npm i -g npm-local-development

cd ./project-with-lerna/
npm-local-development lerna

cd ./regular-project-with-package.json/
npm-local-development @vendor/core ../core 
```



## Working on multiple packages locally

When you work on 2 (or more) packages locally where one requires the other,
you need to link them somehow, so you don't have to publish one and `npm install` in the other again and again.
`npm link` was built to allow this, however `npm link` is fundamentally broken with modern architectures.
See the section below "This tool solves multiples issues" to see why.

If those packages a directly related to each other, you usually should use Lerna to manage them
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

Whenever you run `lerna bootstrap`, make sure to run `npm-local-development lerna` as well.

It syncs now your dependencies correctly while your work on them.

## This tool solves multiples issues

with local development of NPM packages that are related to each other.

#### 1. Symlinks break build tools and compiler like TypeScript & Angular

When you npm link a package outside of your build folder (where usually your
tsconfig.json lies), TypeScript does not compile those files. You
need to include those file in `"includes": ["../other-package/**/*.ts"]`
manually. That's not a problem per se, as you could and should add
those packages to `includes` either way.
The problem arises when your `other-package` has `peerDependencies`,
which you have installed in the root package: Node and the compiled won't find them, as it resolves
the symlink first, and then parent folder of `other-package` resolves to a different once.
That resolves folder is usually not a children directory of your root package, so it can not find the actual packages
in `peerDependencies`. Symlinks forces you to install the `peerDependencies` in your `other-package`
before you can use them correctly in the root package. This leads to transitive instances being broken, see point 2.

#### 2. Transitive dependencies break in Node

When you npm link `other-package` while you're working on `other-package`,
which means you have its `devDependencies` installed, those `devDependencies`
overwrite your dependencies of the root package.

Example: If other-package uses RXJS as devDependencies and installed it
(because you work on that other-package at the moment)
you end up having 2 RXJS instances: One on your root `node_modules/rxjs`
and one in `node_modules/other-package/node_modules/rxjs`. Whenever
you execute code in `node_modules/other-package/utils.ts` it will use
its own RXJS code. You in the root package will use a different version of RXJS.


So, when your `other-packages` create for example an `Observable`:

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
package, but from the on in `node_modules/other-package/node_modules/rxjs`, which leads to horrible
errors that are not at all obvious. This tool fixes that if you list `rxjs` in `other-package`'s
`peerDependencies` as you should (additionally to `devDependencies` so your IDE and
test scripts still work).

#### 3. Symlinks are not automatically synced in WebStorm

WebStorm does not resolve immediately changes made to the target behind symlinks and caches
the "old" state. Using real files instead, the WebStorm IDE sees immediate changes.
