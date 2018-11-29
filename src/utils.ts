/**
 * Makes sure that given `call` is not more frequently called than cps/seconds. cps=5 means 5 times per seconds max.
 *
 * @example const throttled = ThrottleTime(async () => { console.log('do it') }); throttled(); throttled(); ...
 */
export function ThrottleTime(call: Function, cps = 5): (...args: any[]) => void {
    let last = Date.now();
    let dirty = false;
    let lastArgs: any[][] = [];
    let execution = false;

    function tick() {
        const now = Date.now();

        if (!execution && now - last > 1000 / cps) {
            execution = true;
            call(...lastArgs);
            dirty = false;
            last = Date.now();
            execution = false;
        }

        if (dirty) {
            setTimeout(tick);
        }
    }

    return (...args) => {
        dirty = true;
        lastArgs = args;
        tick();
    };
}

export class OnProcessExitEvent {
    public isRecovered = false;

    public recovered() {
        this.isRecovered = true;
    }
}

type onProcessExitCallback = (event: OnProcessExitEvent) => Promise<void>;
type onProcessExitCallbackEmpty = () => Promise<void>;
type onProcessExitCallbackUnsubscribe = () => void;

let onProcessExitListeners: onProcessExitCallback[] = [];
let onProcessExitHooked = false;

export function onProcessExit(callback: onProcessExitCallback | onProcessExitCallbackEmpty): onProcessExitCallbackUnsubscribe {
    onProcessExitListeners.unshift(callback);

    if (!onProcessExitHooked) {
        onProcessExitHooked = true;

        const oldListener = process.listeners('SIGINT');
        process.removeAllListeners('SIGINT');
        process.once('SIGINT', async () => {
            const event = new OnProcessExitEvent;

            //important to clone the array, since it can get modified by a callback
            const listeners = onProcessExitListeners.slice();
            for (const callback of listeners) {
                await callback(event);
            }

            onProcessExitListeners = [];

            if (!event.isRecovered) {
                process.exit(1);
                return;
            }

            //we're still alive, so register old event listeners
            //and remove ours
            process.removeAllListeners('SIGINT');
            for (const old of oldListener) {
                process.addListener('SIGINT', old);
            }
        });
    }

    return () => {
        //register this callback
        onProcessExitListeners.splice(onProcessExitListeners.indexOf(callback), 1);
    };
}