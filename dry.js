const dry = (function() {
    "use strict";
    const unique = function(a, key) {
        if (key) {
            return a.filter(function(e) {
                e = key(e);
                return !!e && (!this.has(e) && !!this.add(e));
            }, new Set());
        }
        return a.filter(function(e) {
            return !!e && (!this.has(e) && !!this.add(e));
        }, new Set());
    };

    const EventKeys = Symbol();
    class EventEmitter {
        constructor() {
            this[EventKeys] = new Map();
        }
        on(event, cb) {
            let handlers = this[EventKeys].get(event);
            if (!handlers) {
                this[EventKeys].set(event, handlers = new Set());
            }
            handlers.add(cb);
        }
        off(event, cb) {
            const keys = this[EventKeys];
            const handlers = keys.get(event);
            if (!handlers) {
                return;
            }
            handlers.delete(cb);
            if (!handlers.size) {
               keys.delete(event);
            }
        }
        once(event, cb, ...args) {
            let wrapped = (...args) => {
                try {
                    return cb(...args);
                }
                finally {
                    this.off(event, wrapped);
                }
            };
            return this.on(event, wrapped, ...args);
        }
        emit(event, ...args) {
            const handlers = this[EventKeys].get(event);
            if (!handlers) {
                return;
            }
            for (let e of Array.from(handlers)) {
                try {
                    e(...args);
                }
                catch (ex) {
                    console.error(`Event handler ${e} for ${event} failed`, ex);
                }
            }
        }
        emitSoon(event, ...args) {
            setTimeout(() => this.emit(event, ...args));
        }
    }

    const bus = new EventEmitter();

    if (document.readyState === "interactive" || document.readyState === "complete" ) {
        bus.emitSoon("dom", null, false);
    }
    else {
        addEventListener("DOMContentLoaded", function dom(evt) {
            removeEventListener("DOMContentLoaded", dom, true);
            bus.emit("dom", evt, true);
        }, true);
    }

    if (document.readyState === "complete") {
        bus.emitSoon("load", null, false);
    }
    else {
        addEventListener("load", function load(evt) {
            removeEventListener("load", load, true);
            bus.emit("load", evt, true);
        }, true);
    }

    let exts = null;
    try {
        exts = (window.Room || unsafeWindow.Room).prototype._extensions.connection.prototype.room.extensions;
    }
    catch (ex) {
        bus.on("load", () => {
            exts = (window.Room || unsafeWindow.Room).prototype._extensions.connection.prototype.room.extensions;
        });
    }

    let exportObject = function(o) {
        return unsafeWindow.JSON.parse(JSON.stringify(o));
    };
    let exportFunction = this.exportFunction;

    if (!exportFunction) {
        exportFunction = (fn, o) => fn;
        exportObject = o => o;
    }

    const replace = function(proto, where, what, newfn) {
        let ext = this[where];
        if (!ext) {
            throw new Error("Binding not available");
        }
        if (proto) {
            if (ext.prototype && document.readyState !== "complete") {
                ext = ext.prototype;
            }
            else {
                console.warn("binding late, skipping prototype, this might not work", where, what);
                return replace.call(exts, false, where, what, newfn);
            }
            if (!ext) {
                throw new Error("Binding prototype not available");
            }
        }
        let origfn = ext[what];
        if (!origfn) {
            throw new Error("Target not available");
        }
        ext[what] = exportFunction(function(...args) {
            return newfn.call(this, origfn.bind(this), ...args);
        }, unsafeWindow);
        return ext[what].bind(ext);
    };

    const replaceEarly = (...args) => {
        return replace.call((window.Room || unsafeWindow.Room).prototype._extensions, true, ...args);
    };

    class Commands {
        constructor() {
            replaceEarly("chat", "onCommand", (orig, command, e, ...args) => {
                let fn = this[command];
                if (fn && fn.call(this, e, args) !== false) {
                    return;
                }
                args.unshift(e);
                args.unshift(command);
                return orig(...exportObject(args));
            });
        }
    }

    const appendMessage = (user, message, options) => {
        let o = {
            dontsave: true,
            staff: true,
            highlight: true
        };
        if (options) {
            Object.assign(o, options);
        }
        if (message.trim) {
            message = [{type: "text", value: message}];
        }
        return exts.chat.showMessage(user, exportObject(message), exportObject(o));
    };

    const config = window.config || unsafeWindow.config;

    return {
        on: bus.on.bind(bus),
        off: bus.off.bind(bus),
        once: bus.once.bind(bus),
        emit: bus.emit.bind(bus),
        config,
        get exts() {
            return exts;
        },
        replaceEarly,
        replaceLate(...args) {
            return replace.call(this.exts, false, ...args);
        },
        appendMessage,
        exportFunction,
        exportObject,
        unique,
        EventEmitter,
        Commands,
        version: "0.2",
    };
}).call(this);
