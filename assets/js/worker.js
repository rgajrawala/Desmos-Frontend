
/**
 * almond 0.2.5 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("vendor/almond", function(){});

// From http://stackoverflow.com/questions/7742781/why-javascript-only-works-after-opening-developer-tools-in-ie-once
// Avoid `console` errors in browsers that lack a console.
define('console',['require'],function(require){
  var noop = function () {};
  var methods = [
    'assert', 'clear', 'count', 'debug', 'dir', 'dirxml', 'error',
    'exception', 'group', 'groupCollapsed', 'groupEnd', 'info', 'log',
    'markTimeline', 'profile', 'profileEnd', 'table', 'time', 'timeEnd',
    'timeStamp', 'trace', 'warn'
  ];
  var console = {};

  var addMethod = function(method) {
    if((typeof window !== 'undefined') && window.console && window.console[method]) {
      console[method] = function(){window.console[method].apply(window.console, arguments)};
    } else {
      console[method] = noop;
    }
  };

  methods.forEach(addMethod);
  return console;
});

define('pjs',[], function() {
var P = (function(prototype, ownProperty, undefined) {
  // helper functions that also help minification
  function isObject(o) { return typeof o === 'object'; }
  function isFunction(f) { return typeof f === 'function'; }

  // used to extend the prototypes of superclasses (which might not
  // have `.Bare`s)
  function SuperclassBare() {}

  function P(_superclass /* = Object */, definition) {
    // handle the case where no superclass is given
    if (definition === undefined) {
      definition = _superclass;
      _superclass = Object;
    }

    // C is the class to be returned.
    //
    // It delegates to instantiating an instance of `Bare`, so that it
    // will always return a new instance regardless of the calling
    // context.
    //
    //  TODO: the Chrome inspector shows all created objects as `C`
    //        rather than `Object`.  Setting the .name property seems to
    //        have no effect.  Is there a way to override this behavior?
    function C() {
      var self = new Bare;
      if (isFunction(self.init)) self.init.apply(self, arguments);
      return self;
    }

    // C.Bare is a class with a noop constructor.  Its prototype is the
    // same as C, so that instances of C.Bare are also instances of C.
    // New objects can be allocated without initialization by calling
    // `new MyClass.Bare`.
    function Bare() {}
    C.Bare = Bare;

    // Set up the prototype of the new class.
    var _super = SuperclassBare[prototype] = _superclass[prototype];
    var proto = Bare[prototype] = C[prototype] = new SuperclassBare;

    // other variables, as a minifier optimization
    var extensions;


    // set the constructor property on the prototype, for convenience
    proto.constructor = C;

    C.mixin = function(def) {
      Bare[prototype] = C[prototype] = P(C, def)[prototype];
      return C;
    }

    return (C.open = function(def) {
      extensions = {};

      if (isFunction(def)) {
        // call the defining function with all the arguments you need
        // extensions captures the return value.
        extensions = def.call(C, proto, _super, C, _superclass);
      }
      else if (isObject(def)) {
        // if you passed an object instead, we'll take it
        extensions = def;
      }

      // ...and extend it
      if (isObject(extensions)) {
        for (var ext in extensions) {
          if (ownProperty.call(extensions, ext)) {
            proto[ext] = extensions[ext];
          }
        }
      }

      // if there's no init, we assume we're inheriting a non-pjs class, so
      // we default to applying the superclass's constructor.
      if (!isFunction(proto.init)) {
        proto.init = _superclass;
      }

      return C;
    })(definition);
  }

  // ship it
  return P;

  // as a minifier optimization, we've closured in a few helper functions
  // and the string 'prototype' (C[p] is much shorter than C.prototype)
})('prototype', ({}).hasOwnProperty);
return P;
});

//     Underscore.js 1.3.3
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore may be freely distributed under the MIT license.
//     Portions of Underscore are inspired or borrowed from Prototype,
//     Oliver Steele's Functional, and John Resig's Micro-Templating.
//     For all details and documentation:
//     http://documentcloud.github.com/underscore

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var slice            = ArrayProto.slice,
      unshift          = ArrayProto.unshift,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) { return new wrapper(obj); };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root['_'] = _;
  }

  // Current version.
  _.VERSION = '1.3.3';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (i in obj && iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    if (obj.length === +obj.length) results.length = obj.length;
    return results;
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError('Reduce of empty array with no initial value');
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var reversed = _.toArray(obj).reverse();
    if (context && !initial) iterator = _.bind(iterator, context);
    return initial ? _.reduce(reversed, iterator, memo, context) : _.reduce(reversed, iterator);
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    each(obj, function(value, index, list) {
      if (!iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if a given value is included in the array or object using `===`.
  // Aliased as `contains`.
  _.include = _.contains = function(obj, target) {
    var found = false;
    if (obj == null) return found;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    found = any(obj, function(value) {
      return value === target;
    });
    return found;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    return _.map(obj, function(value) {
      return (_.isFunction(method) ? method || value : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Return the maximum element or (element-based computation).
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.max.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.min.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var shuffled = [], rand;
    each(obj, function(value, index, list) {
      rand = Math.floor(Math.random() * (index + 1));
      shuffled[index] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, val, context) {
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria, b = right.criteria;
      if (a === void 0) return 1;
      if (b === void 0) return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    }), 'value');
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, val) {
    var result = {};
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    each(obj, function(value, index) {
      var key = iterator(value, index);
      (result[key] || (result[key] = [])).push(value);
    });
    return result;
  };

  // Use a comparator function to figure out at what index an object should
  // be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator) {
    iterator || (iterator = _.identity);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >> 1;
      iterator(array[mid]) < iterator(obj) ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(obj) {
    if (!obj)                                     return [];
    if (_.isArray(obj))                           return slice.call(obj);
    if (_.isArguments(obj))                       return slice.call(obj);
    if (obj.toArray && _.isFunction(obj.toArray)) return obj.toArray();
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    return _.isArray(obj) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especcialy useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail`.
  // Especially useful on the arguments object. Passing an **index** will return
  // the rest of the values in the array from that index onward. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = function(array, index, guard) {
    return slice.call(array, (index == null) || guard ? 1 : index);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, function(value){ return !!value; });
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return _.reduce(array, function(memo, value) {
      if (_.isArray(value)) return memo.concat(shallow ? value : _.flatten(value));
      memo[memo.length] = value;
      return memo;
    }, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator) {
    var initial = iterator ? _.map(array, iterator) : array;
    var results = [];
    // The `isSorted` flag is irrelevant if the array only contains two elements.
    if (array.length < 3) isSorted = true;
    _.reduce(initial, function (memo, value, index) {
      if (isSorted ? _.last(memo) !== value || !memo.length : !_.include(memo, value)) {
        memo.push(value);
        results.push(array[index]);
      }
      return memo;
    }, []);
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays. (Aliased as "intersect" for back-compat.)
  _.intersection = _.intersect = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = _.flatten(slice.call(arguments, 1), true);
    return _.filter(array, function(value){ return !_.include(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) results[i] = _.pluck(args, "" + i);
    return results;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i, l;
    if (isSorted) {
      i = _.sortedIndex(array, item);
      return array[i] === item ? i : -1;
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item);
    for (i = 0, l = array.length; i < l; i++) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item) {
    if (array == null) return -1;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) return array.lastIndexOf(item);
    var i = array.length;
    while (i--) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Binding with arguments is also known as `curry`.
  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
  // We check for `func.bind` first, to fail fast when `func` is undefined.
  _.bind = function bind(func, context) {
    var bound, args;
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length == 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, throttling, more, result;
    var whenDone = _.debounce(function(){ more = throttling = false; }, wait);
    return function() {
      context = this; args = arguments;
      var later = function() {
        timeout = null;
        if (more) func.apply(context, args);
        whenDone();
      };
      if (!timeout) timeout = setTimeout(later, wait);
      if (throttling) {
        more = true;
      } else {
        result = func.apply(context, args);
      }
      whenDone();
      throttling = true;
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      if (immediate && !timeout) func.apply(context, args);
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      return memo = func.apply(this, arguments);
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func].concat(slice.call(arguments, 0));
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) { return func.apply(this, arguments); }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    return _.map(obj, _.identity);
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var result = {};
    each(_.flatten(slice.call(arguments, 1)), function(key) {
      if (key in obj) result[key] = obj[key];
    });
    return result;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        if (obj[prop] == null) obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function.
  function eq(a, b, stack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a._chain) a = a._wrapped;
    if (b._chain) b = b._wrapped;
    // Invoke a custom `isEqual` method if one is provided.
    if (a.isEqual && _.isFunction(a.isEqual)) return a.isEqual(b);
    if (b.isEqual && _.isFunction(b.isEqual)) return b.isEqual(a);
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = stack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (stack[length] == a) return true;
    }
    // Add the first object to the stack of traversed objects.
    stack.push(a);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          // Ensure commutative equality for sparse arrays.
          if (!(result = size in a == size in b && eq(a[size], b[size], stack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent.
      if ('constructor' in a != 'constructor' in b || a.constructor != b.constructor) return false;
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], stack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    stack.pop();
    return result;
  }

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType == 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Is a given variable an arguments object?
  _.isArguments = function(obj) {
    return toString.call(obj) == '[object Arguments]';
  };
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Is a given value a function?
  _.isFunction = function(obj) {
    return toString.call(obj) == '[object Function]';
  };

  // Is a given value a string?
  _.isString = function(obj) {
    return toString.call(obj) == '[object String]';
  };

  // Is a given value a number?
  _.isNumber = function(obj) {
    return toString.call(obj) == '[object Number]';
  };

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return _.isNumber(obj) && isFinite(obj);
  };

  // Is the given value `NaN`?
  _.isNaN = function(obj) {
    // `NaN` is the only value for which `===` is not reflexive.
    return obj !== obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value a date?
  _.isDate = function(obj) {
    return toString.call(obj) == '[object Date]';
  };

  // Is the given value a regular expression?
  _.isRegExp = function(obj) {
    return toString.call(obj) == '[object RegExp]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Has own property?
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function (n, iterator, context) {
    for (var i = 0; i < n; i++) iterator.call(context, i);
  };

  // Escape a string for HTML interpolation.
  _.escape = function(string) {
    return (''+string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g,'&#x2F;');
  };

  // If the value of the named property is a function then invoke it;
  // otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return null;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object, ensuring that
  // they're correctly added to the OOP wrapper as well.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      addToWrapper(name, _[name] = obj[name]);
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = idCounter++;
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /.^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    '\\': '\\',
    "'": "'",
    'r': '\r',
    'n': '\n',
    't': '\t',
    'u2028': '\u2028',
    'u2029': '\u2029'
  };

  for (var p in escapes) escapes[escapes[p]] = p;
  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;
  var unescaper = /\\(\\|'|r|n|t|u2028|u2029)/g;

  // Within an interpolation, evaluation, or escaping, remove HTML escaping
  // that had been previously added.
  var unescape = function(code) {
    return code.replace(unescaper, function(match, escape) {
      return escapes[escape];
    });
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    settings = _.defaults(settings || {}, _.templateSettings);

    // Compile the template source, taking care to escape characters that
    // cannot be included in a string literal and then unescape them in code
    // blocks.
    var source = "__p+='" + text
      .replace(escaper, function(match) {
        return '\\' + escapes[match];
      })
      .replace(settings.escape || noMatch, function(match, code) {
        return "'+\n_.escape(" + unescape(code) + ")+\n'";
      })
      .replace(settings.interpolate || noMatch, function(match, code) {
        return "'+\n(" + unescape(code) + ")+\n'";
      })
      .replace(settings.evaluate || noMatch, function(match, code) {
        return "';\n" + unescape(code) + "\n;__p+='";
      }) + "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __p='';" +
      "var print=function(){__p+=Array.prototype.join.call(arguments, '')};\n" +
      source + "return __p;\n";

    var render = new Function(settings.variable || 'obj', '_', source);
    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for build time
    // precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' +
      source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // The OOP Wrapper
  // ---------------

  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.
  var wrapper = function(obj) { this._wrapped = obj; };

  // Expose `wrapper.prototype` as `_.prototype`
  _.prototype = wrapper.prototype;

  // Helper function to continue chaining intermediate results.
  var result = function(obj, chain) {
    return chain ? _(obj).chain() : obj;
  };

  // A method to easily add functions to the OOP wrapper.
  var addToWrapper = function(name, func) {
    wrapper.prototype[name] = function() {
      var args = slice.call(arguments);
      unshift.call(args, this._wrapped);
      return result(func.apply(_, args), this._chain);
    };
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      var wrapped = this._wrapped;
      method.apply(wrapped, arguments);
      var length = wrapped.length;
      if ((name == 'shift' || name == 'splice') && length === 0) delete wrapped[0];
      return result(wrapped, this._chain);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      return result(method.apply(this._wrapped, arguments), this._chain);
    };
  });

  // Start chaining a wrapped Underscore object.
  wrapper.prototype.chain = function() {
    this._chain = true;
    return this;
  };

  // Extracts the result from a wrapped and chained object.
  wrapper.prototype.value = function() {
    return this._wrapped;
  };

}).call(this);
define("underscore", (function (global) {
    return function () {
        var ret, fn;
        return ret || global._;
    };
}(this)));

//Definition of built-in functions and variables

define('math/builtin',['require'],function(require){

var BuiltIn = {};

BuiltIn.mod = function(a, b){
  return a - b * Math.floor(a/b);
};

BuiltIn.sign = function(x){
  if(x === 0) return 0;
  if(x > 0) return 1;
  if(x < 0) return -1;
  return NaN;
};

BuiltIn.lcm = function(a, b){
  a = Math.round(a);
  b = Math.round(b);
  var gcd = BuiltIn.getGCD(a, b);
  return Math.abs(a * b / gcd);
};

BuiltIn.gcd = function(a, b){
  return BuiltIn.getGCD(a, b);
};

BuiltIn.nCr = function(n, r){
  n = Math.round(n);
  r = Math.round(r);

  //Error conditions
  if(r > n || n < 0 || r < 0){
    return 0;
  }

  var total = 1;
  for(var i = 0; i < r; i++)
  {
    total *= (n - i) / (i + 1);
  }
  return total;
};

BuiltIn.nPr = function(n, r){
  n = Math.round(n);
  r = Math.round(r);

  //Error conditions
  if(r > n || n < 0 || r < 0){
    return 0;
  }

  var total = 1;
  for(var i = 0; i < r; i++){
    total *= (n-i);
  }
  return total;
};

BuiltIn.factorial = function (x) {
  return BuiltIn.gamma(x + 1);
};

BuiltIn._integerFactorial = function (n) {
  if (n !== Math.floor(n)) return NaN;
  if (n < 0) return NaN;
  if (n > 170) return NaN; // Overflows double point floats
  if (n === 0 || n === 1) return 1;

  var output = 1;
  for (var i = 2; i <= n; i++) output *= i;

  return output;
};

BuiltIn.gamma = function (x) {
  if (x === Math.floor(x)) return BuiltIn._integerFactorial(x - 1);
  // Euler's reflection formula
  if (x < 0) return Math.PI/(Math.sin(Math.PI*x)*BuiltIn.gamma(1-x));
  return Math.exp(BuiltIn.lnGamma(x));
};

BuiltIn.lnGamma = function (x) {
  if (x < 0) return NaN; // Alternates between real and complex on integers.

  // 15 term rational approximation of lnGamma, valid for positive numbers.
  // Original source not known, but verified by JM using Mathematica to give
  // at least 14 correct digits of gamma = Math.exp(Math.lnGamma(x)) for
  // integers and half integers between 0 and 60, and at least 12 correct
  // digits up to 170.
  var cof = [
    57.1562356658629235,
    -59.5979603554754912,
    14.1360979747417471,
    -0.491913816097620199,
    0.339946499848118887e-4,
    0.465236289270485756e-4,
    -0.983744753048795646e-4,
    0.158088703224912494e-3,
    -0.210264441724104883e-3,
    0.217439618115212643e-3,
    -0.164318106536763890e-3,
    0.844182239838527433e-4,
    -0.261908384015814087e-4,
    0.368991826595316234e-5
  ];

  var s = 0.999999999999997092;
  for (var i=0; i < 14; i++) s += cof[i]/(x + i + 1);

  var t = x + 5.24218750000000000;

  return (x + 0.5)*Math.log(t) - t + Math.log(2.5066282746310005*s/x);
};

// BernoulliB_{2k} for k=1..14
BuiltIn.bernoulliTable = [
  1/6, -1/30, 1/42, -1/30, 5/66, -691/2730, 7/6, -3617/510,
  43867/798, -174611/330, 854513/138, -236364091/2730, 8553103/6,
  -23749461029/870
];

// mth derivative of cot(x)
//
// Used in evaluating reflection formula for polygamma
//
// Uses fact that (d/dx)^m cot(x) = p_m(cos(x))/sin(x)^{m+1} where p_m(x) is a
// polynomial with coefficents that obey the following recursion relation:
//
// a_{m+1, n} = -((m - n + 2) a_{m, n-1} + (n+1) a_{m, n+1})
//            = -(            t1         +        t2       )
// a_{0, 0} = 0, a_{0, 1} = 1
//
// Could improve performance by taking advantage of fact that p is even/odd
// when m is odd/even. Didn't feel worth the added trickiness.
BuiltIn.cotDerivative = function(m, x) {
  /* jshint maxcomplexity:11 */
  if (m !== Math.floor(m)) return NaN;
  if (m < 0) return NaN;

  if (m === 0) return 1/BuiltIn.tan(x);

  var sinx = BuiltIn.sin(x);
  if (m === 1) return -1/(sinx*sinx);

  var cosx = BuiltIn.cos(x);
  if (m === 2) return 2*cosx/(sinx*sinx*sinx);

  var aprev = [0, 2];
  var a;
  var mp, n;
  var t1, t2;
  for (mp = 3; mp <= m; mp++) {
    a = [];
    for (n = 0; n < mp; n++) {
      t1 = 0;
      t2 = 0;
      if (n > 0) t1 = (mp - n + 1)*aprev[n - 1];
      if (n + 2 < mp) t2 = (n + 1)*aprev[n + 1];
      a.push(-(t1 + t2));
    }
    aprev = a;
  }

  var s = 0;
  // Horner's method for polynomial evaluation
  for (n = m - 1; n >= 0; n--) s = a[n] + cosx*s;

  return s/Math.pow(sinx, m + 1);
};

// polyGamma(m, n) is the (m+1)th derivative of lnGamma(n)
//
// Implemented by differentiating Stirling's approximation:
//
// d/dn ln(Gamma(n)) = -\left(
//         ln(n) + 1/2n + \sum_{k=1}^{\infty} B_{2k}/(2k n^{2k})
//       /right)
//
// d^{m+1}/dn^{m+1} ln(Gamma(n)) =
//      m! (-1)^{m + 1} \left(
//        1/(m n^m) - 1/(2 n^{1+m}) +
//        \sum_{k=1}^{\infty} B_{2k} (2k + m - 1)!/(m!(2k)!n^{2k+m})
//      \right)
//
// B_{2k} are the Bernoulli numbers.
//
// Uses recurrence relation to bring arguments above 10, and reflection
// formula for negative n. In this case, 14 term sum gives results accurate to
// machine precision for values of m between 0 and at least 8.
//
// Only get 8 digits for polyGamma(100, 30)
//
// Recurrence relation:
//
// polyGamma(m, n) = polyGamma(m, n + 1) + (-1)^m m!/n^{m+1}
//
// Reflection formula:
//
// polyGamma(m, n) = (-1)^{m}polyGamma(m, 1 - n) - pi d^m/dn^m cot(pi*n)
//
// Can lose some accuracy in reflection formula for large m because of large
// powers of trig functions.
BuiltIn.polyGamma = function (m, n) {
  if (m < 0) return NaN;
  if (m !== Math.floor(m)) return NaN;
  var sign = (m % 2 === 0) ? -1 : 1;
  // Use reflection formula for negative n
  if (n < 0) {
    return -sign*BuiltIn.polyGamma(m, 1 - n) -
      Math.pow(Math.PI, m + 1)*BuiltIn.cotDerivative(m, Math.PI*n);
  }

  var mfac = BuiltIn.factorial(m);

  // Use recurrence relation to bring n above 10
  var s = 0;
  var npmm = Math.pow(n, -(m + 1));
  while (n < 10) {
    s += npmm;
    n++;
    npmm = Math.pow(n, -(m + 1));
  }

  s += (m === 0) ? -Math.log(n) : npmm*n/m;
  s += 0.5*npmm;

  var bt = BuiltIn.bernoulliTable;
  var num = m + 1;
  var denom = 2;
  var pre = npmm*n*num/denom;
  var nsqinv = 1/(n*n);
  for (var k = 1; k <= 14; k++) {
    pre *= nsqinv;
    s += pre*bt[k-1];
    num++; denom++;
    pre *= num/denom;
    num++; denom++;
    pre *= num/denom;
  }
  return mfac*sign*s;
};

BuiltIn.getGCD = function(x,y)
{
    //Only defined over integers
    var a = Math.round(x);
    var b = Math.round(y);

    // Positive values only
    if (a < 0)
        a = -a;
    if (b < 0)
        b = -b;

    // Reverse order if necessary.
    // b should be smaller than a
    if (b > a)
    {
        var temp = b;
        b = a;
        a = temp;
    }

    //GCD(0, x) = x
    if(b === 0){
      return a;
    }

    var m = a % b;

    while (m > 0)
    {
        a = b;
        b = m;
        m = a % b;
    }

    return b;
};

// Returns a reduced fraction approximation of x with denominator less than
// maxDenominator. maxDenominator defaults to 1e6.
BuiltIn.toFraction = function (x, maxDenominator) {

  if (x === Infinity) return { n: Infinity, d: 1 };
  if (x === -Infinity) return { n: -Infinity, d: 1};
  if (!isFinite(x)) return { n: NaN, d: 1};

  var whole, n0 = 0, n1 = 1, d0 = 1, d1 = 0, n, d;
  if (!maxDenominator) maxDenominator = 1e6;
  while (true) {
    whole = Math.floor(x);
    n = whole*n1 + n0;
    d = whole*d1 + d0;
    if (d > maxDenominator) break;
    n0 = n1;
    d0 = d1;
    n1 = n;
    d1 = d;
    if (x === whole) break;
    x = 1/(x - whole);
  }
  return { n: n1, d: d1 };
};

// Check if two values are equal to within the given number of bits of
// precision. For numbers smaller than one, compares the difference in the
// numbers to 1 instead of the larger of the numbers. This makes calculations like
// BuiltIn.approx(Math.sin(Math.Pi), 0) work out.
BuiltIn.approx = function (x1, x2, bits) {
  var m = Math.max(Math.max(Math.abs(x1), Math.abs(x2)), 1);
  var d = (bits === undefined) ? 0.5 : Math.pow(0.5, bits);
  return m === m + d*Math.abs(x2 - x1);
};

BuiltIn.log_base = function(n, base){return Math.log(n) / Math.log(base)};

BuiltIn.pow = function (x, n) {
  if (x >= 0 || n === Math.floor(n)) return Math.pow(x, n);
  var frac = BuiltIn.toFraction(n, 100);
  if (BuiltIn.approx(frac.n/frac.d, n, 2) && frac.d % 2 === 1) return (frac.n % 2 === 0 ? 1 : -1) * Math.pow(-x, n);
  return NaN;
};
BuiltIn.nthroot = function(x, n) { return BuiltIn.pow(x, 1/n) };

var PI_INV = 1/Math.PI;

//Trig functions
// We do some work to make integer and half integer multiples of pi equal to 0 when they should be.
BuiltIn.sin = function (x) {
  var absx = Math.abs(x);
  if (0.5*(absx*PI_INV*2 % 2) + absx === absx) return 0;
  return Math.sin(x);
};

BuiltIn.cos = function (x) {
  var absx = Math.abs(x);
  if (0.5*((absx*PI_INV*2 + 1) % 2) + absx === absx) return 0;
  return Math.cos(x);
};

BuiltIn.tan = function (x) {
  var absx = Math.abs(x);
  if (0.5*(absx*PI_INV*2 % 2) + absx === absx) return 0;
  if (0.5*((absx*PI_INV*2 + 1) % 2) + absx === absx) return Infinity;
  return Math.tan(x);
};

BuiltIn.sec = function (x) {
  var absx = Math.abs(x);
  if (0.5*((absx*PI_INV*2 + 1) % 2) + absx === absx) return Infinity;
  return 1/Math.cos(x);
};

BuiltIn.csc = function(x) {
  var absx = Math.abs(x);
  if (0.5*(absx*PI_INV*2 % 2) + absx === absx) return Infinity;
  return 1/Math.sin(x);
};

BuiltIn.cot = function(x) {
  var absx = Math.abs(x);
  if (0.5*(absx*PI_INV*2 % 2) + absx === absx) return Infinity;
  if (0.5*((absx*PI_INV*2 + 1) % 2) + absx === absx) return 0;
  return 1/Math.tan(x);
};

//Inverse trig functions
BuiltIn.acot = function(x){return Math.PI / 2 - Math.atan(x)};
BuiltIn.acsc = function(x){return Math.asin(1/x)};
BuiltIn.asec = function(x){return Math.acos(1/x)};

//Hyperbolic trig functions
BuiltIn.sinh = function(x){return (Math.exp(x) - Math.exp(-x)) / 2};
BuiltIn.cosh = function(x){return (Math.exp(x) + Math.exp(-x)) / 2};
BuiltIn.tanh = function(x) {
  // This definition avoids overflow of sinh and cosh for large x
  if (x > 0) {
    return (1 - Math.exp(-2*x))/(1 + Math.exp(-2*x));
  } else {
    return (Math.exp(2*x) - 1)/(Math.exp(2*x) + 1);
  }
};

BuiltIn.sech = function(x){return 1 / BuiltIn.cosh(x)};
BuiltIn.csch = function(x){return 1 / BuiltIn.sinh(x)};
BuiltIn.coth = function(x){return 1 / BuiltIn.tanh(x)};

//Inverse hyperbolic trig functions
BuiltIn.asinh = function(x){return Math.log(x+Math.sqrt(x*x+1))};
BuiltIn.acosh = function(x){return Math.log(x+Math.sqrt(x+1)*Math.sqrt(x-1))};
BuiltIn.atanh = function(x){return 0.5 * Math.log((1+x)/(1-x))};

BuiltIn.asech = function(x){return Math.log(1/x + Math.sqrt((1/x + 1)) * Math.sqrt((1/x - 1)))};
BuiltIn.acsch = function(x){return Math.log(1/x + Math.sqrt((1/(x*x)+1)))};
BuiltIn.acoth = function(x){return 0.5 * Math.log((x+1)/(x-1))};

BuiltIn.mean = function(list){
  var total = 0;
  for(var i = 0; i < list.length; i++){
    total += list[i];
  }
  return total / list.length;
};

BuiltIn.total = function(list){
  var total = 0;
  for(var i = 0; i < list.length; i++){
    total += list[i];
  }
  return total;
};

BuiltIn.length = function(list){
  return list.length;
};

BuiltIn.listMin = function (list) {
  if (list.length < 1) return NaN;
  var min = list[0];
  if (isNaN(min)) return NaN;
  for (var i = 1; i < list.length; i++) {
    if (isNaN(list[i])) return NaN;
    if (list[i] < min) min = list[i];
  }
  return min;
};

BuiltIn.listMax = function (list) {
  if (list.length < 1) return NaN;
  var max = list[0];
  if (isNaN(max)) return NaN;
  for (var i = 1; i < list.length; i++) {
    if (isNaN(list[i])) return NaN;
    if (list[i] >= max) max = list[i];
  }
  return max;
};

BuiltIn.argMin = function (list) {
  // Our lists start indexing from 1, so returning 0 represents
  // no element of the list.
  if (list.length < 1) return 0;
  var min = list[0];
  if (isNaN(min)) return 0;
  var argMin = 0;
  for (var i = 1; i < list.length; i++) {
    if (isNaN(list[i])) return 0;
    if (list[i] < min) {
      argMin = i;
      min = list[i];
    }
  }
  return argMin + 1; // Convert between js and Desmos indexing conventions
};

BuiltIn.argMax = function (list) {
  if (list.length < 1) return 0;
  var max = list[0];
  if (isNaN(max)) return 0;
  var argMax = 0;
  for (var i = 1; i < list.length; i++) {
    if (list[i] >= max) {
      if (isNaN(list[i])) return 0;
      argMax = i;
      max = list[i];
    }
  }
  return argMax + 1; // Convert between js and Desmos indexing conventions
};

BuiltIn.var = function (list) {
  var m = BuiltIn.mean(list);
  var total = 0;
  for (var i = 0; i < list.length; i++) {
    var delta = list[i] - m;
    total += delta*delta;
  }
  return total/list.length;
};

// Pearson correlation coefficient
BuiltIn.corr = function (l1, l2) {
  if (l1.length !== l2.length) return NaN;
  var len = l1.length;
  var m1 = BuiltIn.mean(l1);
  var m2 = BuiltIn.mean(l2);
  var d1, d2;
  var t1 = 0, t2 = 0, tc = 0;
  for (var i = 0; i < len; i++) {
    d1 = l1[i] - m1;
    d2 = l2[i] - m2;
    t1 += d1*d1;
    t2 += d2*d2;
    tc += d1*d2;
  }
  return tc/Math.sqrt(t1*t2);
};

BuiltIn.stdev = function (list) {
  var l = list.length;
  return Math.sqrt(BuiltIn.var(list)*l/(l-1));
};

BuiltIn.stdevp = function (list) {
  return Math.sqrt(BuiltIn.var(list));
};

return BuiltIn;
});

define('numeric',[],function () {


var numeric = (typeof exports === "undefined")?(function numeric() {}):(exports);
if(typeof global !== "undefined") { global.numeric = numeric; }

numeric.version = "1.2.6";

// 1. Utility functions
numeric.bench = function bench (f,interval) {
    var t1,t2,n,i;
    if(typeof interval === "undefined") { interval = 15; }
    n = 0.5;
    t1 = new Date();
    while(1) {
        n*=2;
        for(i=n;i>3;i-=4) { f(); f(); f(); f(); }
        while(i>0) { f(); i--; }
        t2 = new Date();
        if(t2-t1 > interval) break;
    }
    for(i=n;i>3;i-=4) { f(); f(); f(); f(); }
    while(i>0) { f(); i--; }
    t2 = new Date();
    return 1000*(3*n-1)/(t2-t1);
}

numeric._myIndexOf = (function _myIndexOf(w) {
    var n = this.length,k;
    for(k=0;k<n;++k) if(this[k]===w) return k;
    return -1;
});
numeric.myIndexOf = (Array.prototype.indexOf)?Array.prototype.indexOf:numeric._myIndexOf;

numeric.precision = 4;
numeric.largeArray = 50;

// Wrapper around `new Function` that closures in the `numeric` object.
numeric.compile = function () {
  var args = Array.prototype.slice.call(arguments);
  var body = args.pop();
  body = 'return function (' + args.join(',') + ') {' + body + ';}';
  return (new Function(['numeric'], body))(numeric);
}

numeric.prettyPrint = function prettyPrint(x) {
    function fmtnum(x) {
        if(x === 0) { return '0'; }
        if(isNaN(x)) { return 'NaN'; }
        if(x<0) { return '-'+fmtnum(-x); }
        if(isFinite(x)) {
            var scale = Math.floor(Math.log(x) / Math.log(10));
            var normalized = x / Math.pow(10,scale);
            var basic = normalized.toPrecision(numeric.precision);
            if(parseFloat(basic) === 10) { scale++; normalized = 1; basic = normalized.toPrecision(numeric.precision); }
            return parseFloat(basic).toString()+'e'+scale.toString();
        }
        return 'Infinity';
    }
    var ret = [];
    function foo(x) {
        var k;
        if(typeof x === "undefined") { ret.push(Array(numeric.precision+8).join(' ')); return false; }
        if(typeof x === "string") { ret.push('"'+x+'"'); return false; }
        if(typeof x === "boolean") { ret.push(x.toString()); return false; }
        if(typeof x === "number") {
            var a = fmtnum(x);
            var b = x.toPrecision(numeric.precision);
            var c = parseFloat(x.toString()).toString();
            var d = [a,b,c,parseFloat(b).toString(),parseFloat(c).toString()];
            for(k=1;k<d.length;k++) { if(d[k].length < a.length) a = d[k]; }
            ret.push(Array(numeric.precision+8-a.length).join(' ')+a);
            return false;
        }
        if(x === null) { ret.push("null"); return false; }
        if(typeof x === "function") {
            ret.push(x.toString());
            var flag = false;
            for(k in x) { if(x.hasOwnProperty(k)) {
                if(flag) ret.push(',\n');
                else ret.push('\n{');
                flag = true;
                ret.push(k);
                ret.push(': \n');
                foo(x[k]);
            } }
            if(flag) ret.push('}\n');
            return true;
        }
        if(x instanceof Array) {
            if(x.length > numeric.largeArray) { ret.push('...Large Array...'); return true; }
            var flag = false;
            ret.push('[');
            for(k=0;k<x.length;k++) { if(k>0) { ret.push(','); if(flag) ret.push('\n '); } flag = foo(x[k]); }
            ret.push(']');
            return true;
        }
        ret.push('{');
        var flag = false;
        for(k in x) { if(x.hasOwnProperty(k)) { if(flag) ret.push(',\n'); flag = true; ret.push(k); ret.push(': \n'); foo(x[k]); } }
        ret.push('}');
        return true;
    }
    foo(x);
    return ret.join('');
}

numeric.parseDate = function parseDate(d) {
    function foo(d) {
        if(typeof d === 'string') { return Date.parse(d.replace(/-/g,'/')); }
        if(!(d instanceof Array)) { throw new Error("parseDate: parameter must be arrays of strings"); }
        var ret = [],k;
        for(k=0;k<d.length;k++) { ret[k] = foo(d[k]); }
        return ret;
    }
    return foo(d);
}

numeric.parseFloat = function parseFloat_(d) {
    function foo(d) {
        if(typeof d === 'string') { return parseFloat(d); }
        if(!(d instanceof Array)) { throw new Error("parseFloat: parameter must be arrays of strings"); }
        var ret = [],k;
        for(k=0;k<d.length;k++) { ret[k] = foo(d[k]); }
        return ret;
    }
    return foo(d);
}

numeric.parseCSV = function parseCSV(t) {
    var foo = t.split('\n');
    var j,k;
    var ret = [];
    var pat = /(([^'",]*)|('[^']*')|("[^"]*")),/g;
    var patnum = /^\s*(([+-]?[0-9]+(\.[0-9]*)?(e[+-]?[0-9]+)?)|([+-]?[0-9]*(\.[0-9]+)?(e[+-]?[0-9]+)?))\s*$/;
    var stripper = function(n) { return n.substr(0,n.length-1); }
    var count = 0;
    for(k=0;k<foo.length;k++) {
      var bar = (foo[k]+",").match(pat),baz;
      if(bar.length>0) {
          ret[count] = [];
          for(j=0;j<bar.length;j++) {
              baz = stripper(bar[j]);
              if(patnum.test(baz)) { ret[count][j] = parseFloat(baz); }
              else ret[count][j] = baz;
          }
          count++;
      }
    }
    return ret;
}

numeric.toCSV = function toCSV(A) {
    var s = numeric.dim(A);
    var i,j,m,n,row,ret;
    m = s[0];
    n = s[1];
    ret = [];
    for(i=0;i<m;i++) {
        row = [];
        for(j=0;j<m;j++) { row[j] = A[i][j].toString(); }
        ret[i] = row.join(', ');
    }
    return ret.join('\n')+'\n';
}

numeric.getURL = function getURL(url) {
    var client = new XMLHttpRequest();
    client.open("GET",url,false);
    client.send();
    return client;
}

numeric.imageURL = function imageURL(img) {
    function base64(A) {
        var n = A.length, i,x,y,z,p,q,r,s;
        var key = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var ret = "";
        for(i=0;i<n;i+=3) {
            x = A[i];
            y = A[i+1];
            z = A[i+2];
            p = x >> 2;
            q = ((x & 3) << 4) + (y >> 4);
            r = ((y & 15) << 2) + (z >> 6);
            s = z & 63;
            if(i+1>=n) { r = s = 64; }
            else if(i+2>=n) { s = 64; }
            ret += key.charAt(p) + key.charAt(q) + key.charAt(r) + key.charAt(s);
            }
        return ret;
    }
    function crc32Array (a,from,to) {
        if(typeof from === "undefined") { from = 0; }
        if(typeof to === "undefined") { to = a.length; }
        var table = [0x00000000, 0x77073096, 0xEE0E612C, 0x990951BA, 0x076DC419, 0x706AF48F, 0xE963A535, 0x9E6495A3,
                     0x0EDB8832, 0x79DCB8A4, 0xE0D5E91E, 0x97D2D988, 0x09B64C2B, 0x7EB17CBD, 0xE7B82D07, 0x90BF1D91,
                     0x1DB71064, 0x6AB020F2, 0xF3B97148, 0x84BE41DE, 0x1ADAD47D, 0x6DDDE4EB, 0xF4D4B551, 0x83D385C7,
                     0x136C9856, 0x646BA8C0, 0xFD62F97A, 0x8A65C9EC, 0x14015C4F, 0x63066CD9, 0xFA0F3D63, 0x8D080DF5,
                     0x3B6E20C8, 0x4C69105E, 0xD56041E4, 0xA2677172, 0x3C03E4D1, 0x4B04D447, 0xD20D85FD, 0xA50AB56B,
                     0x35B5A8FA, 0x42B2986C, 0xDBBBC9D6, 0xACBCF940, 0x32D86CE3, 0x45DF5C75, 0xDCD60DCF, 0xABD13D59,
                     0x26D930AC, 0x51DE003A, 0xC8D75180, 0xBFD06116, 0x21B4F4B5, 0x56B3C423, 0xCFBA9599, 0xB8BDA50F,
                     0x2802B89E, 0x5F058808, 0xC60CD9B2, 0xB10BE924, 0x2F6F7C87, 0x58684C11, 0xC1611DAB, 0xB6662D3D,
                     0x76DC4190, 0x01DB7106, 0x98D220BC, 0xEFD5102A, 0x71B18589, 0x06B6B51F, 0x9FBFE4A5, 0xE8B8D433,
                     0x7807C9A2, 0x0F00F934, 0x9609A88E, 0xE10E9818, 0x7F6A0DBB, 0x086D3D2D, 0x91646C97, 0xE6635C01,
                     0x6B6B51F4, 0x1C6C6162, 0x856530D8, 0xF262004E, 0x6C0695ED, 0x1B01A57B, 0x8208F4C1, 0xF50FC457,
                     0x65B0D9C6, 0x12B7E950, 0x8BBEB8EA, 0xFCB9887C, 0x62DD1DDF, 0x15DA2D49, 0x8CD37CF3, 0xFBD44C65,
                     0x4DB26158, 0x3AB551CE, 0xA3BC0074, 0xD4BB30E2, 0x4ADFA541, 0x3DD895D7, 0xA4D1C46D, 0xD3D6F4FB,
                     0x4369E96A, 0x346ED9FC, 0xAD678846, 0xDA60B8D0, 0x44042D73, 0x33031DE5, 0xAA0A4C5F, 0xDD0D7CC9,
                     0x5005713C, 0x270241AA, 0xBE0B1010, 0xC90C2086, 0x5768B525, 0x206F85B3, 0xB966D409, 0xCE61E49F,
                     0x5EDEF90E, 0x29D9C998, 0xB0D09822, 0xC7D7A8B4, 0x59B33D17, 0x2EB40D81, 0xB7BD5C3B, 0xC0BA6CAD,
                     0xEDB88320, 0x9ABFB3B6, 0x03B6E20C, 0x74B1D29A, 0xEAD54739, 0x9DD277AF, 0x04DB2615, 0x73DC1683,
                     0xE3630B12, 0x94643B84, 0x0D6D6A3E, 0x7A6A5AA8, 0xE40ECF0B, 0x9309FF9D, 0x0A00AE27, 0x7D079EB1,
                     0xF00F9344, 0x8708A3D2, 0x1E01F268, 0x6906C2FE, 0xF762575D, 0x806567CB, 0x196C3671, 0x6E6B06E7,
                     0xFED41B76, 0x89D32BE0, 0x10DA7A5A, 0x67DD4ACC, 0xF9B9DF6F, 0x8EBEEFF9, 0x17B7BE43, 0x60B08ED5,
                     0xD6D6A3E8, 0xA1D1937E, 0x38D8C2C4, 0x4FDFF252, 0xD1BB67F1, 0xA6BC5767, 0x3FB506DD, 0x48B2364B,
                     0xD80D2BDA, 0xAF0A1B4C, 0x36034AF6, 0x41047A60, 0xDF60EFC3, 0xA867DF55, 0x316E8EEF, 0x4669BE79,
                     0xCB61B38C, 0xBC66831A, 0x256FD2A0, 0x5268E236, 0xCC0C7795, 0xBB0B4703, 0x220216B9, 0x5505262F,
                     0xC5BA3BBE, 0xB2BD0B28, 0x2BB45A92, 0x5CB36A04, 0xC2D7FFA7, 0xB5D0CF31, 0x2CD99E8B, 0x5BDEAE1D,
                     0x9B64C2B0, 0xEC63F226, 0x756AA39C, 0x026D930A, 0x9C0906A9, 0xEB0E363F, 0x72076785, 0x05005713,
                     0x95BF4A82, 0xE2B87A14, 0x7BB12BAE, 0x0CB61B38, 0x92D28E9B, 0xE5D5BE0D, 0x7CDCEFB7, 0x0BDBDF21,
                     0x86D3D2D4, 0xF1D4E242, 0x68DDB3F8, 0x1FDA836E, 0x81BE16CD, 0xF6B9265B, 0x6FB077E1, 0x18B74777,
                     0x88085AE6, 0xFF0F6A70, 0x66063BCA, 0x11010B5C, 0x8F659EFF, 0xF862AE69, 0x616BFFD3, 0x166CCF45,
                     0xA00AE278, 0xD70DD2EE, 0x4E048354, 0x3903B3C2, 0xA7672661, 0xD06016F7, 0x4969474D, 0x3E6E77DB,
                     0xAED16A4A, 0xD9D65ADC, 0x40DF0B66, 0x37D83BF0, 0xA9BCAE53, 0xDEBB9EC5, 0x47B2CF7F, 0x30B5FFE9,
                     0xBDBDF21C, 0xCABAC28A, 0x53B39330, 0x24B4A3A6, 0xBAD03605, 0xCDD70693, 0x54DE5729, 0x23D967BF,
                     0xB3667A2E, 0xC4614AB8, 0x5D681B02, 0x2A6F2B94, 0xB40BBE37, 0xC30C8EA1, 0x5A05DF1B, 0x2D02EF8D];

        var crc = -1, y = 0, n = a.length,i;

        for (i = from; i < to; i++) {
            y = (crc ^ a[i]) & 0xFF;
            crc = (crc >>> 8) ^ table[y];
        }

        return crc ^ (-1);
    }

    var h = img[0].length, w = img[0][0].length, s1, s2, next,k,length,a,b,i,j,adler32,crc32;
    var stream = [
                  137, 80, 78, 71, 13, 10, 26, 10,                           //  0: PNG signature
                  0,0,0,13,                                                  //  8: IHDR Chunk length
                  73, 72, 68, 82,                                            // 12: "IHDR"
                  (w >> 24) & 255, (w >> 16) & 255, (w >> 8) & 255, w&255,   // 16: Width
                  (h >> 24) & 255, (h >> 16) & 255, (h >> 8) & 255, h&255,   // 20: Height
                  8,                                                         // 24: bit depth
                  2,                                                         // 25: RGB
                  0,                                                         // 26: deflate
                  0,                                                         // 27: no filter
                  0,                                                         // 28: no interlace
                  -1,-2,-3,-4,                                               // 29: CRC
                  -5,-6,-7,-8,                                               // 33: IDAT Chunk length
                  73, 68, 65, 84,                                            // 37: "IDAT"
                  // RFC 1950 header starts here
                  8,                                                         // 41: RFC1950 CMF
                  29                                                         // 42: RFC1950 FLG
                  ];
    crc32 = crc32Array(stream,12,29);
    stream[29] = (crc32>>24)&255;
    stream[30] = (crc32>>16)&255;
    stream[31] = (crc32>>8)&255;
    stream[32] = (crc32)&255;
    s1 = 1;
    s2 = 0;
    for(i=0;i<h;i++) {
        if(i<h-1) { stream.push(0); }
        else { stream.push(1); }
        a = (3*w+1+(i===0))&255; b = ((3*w+1+(i===0))>>8)&255;
        stream.push(a); stream.push(b);
        stream.push((~a)&255); stream.push((~b)&255);
        if(i===0) stream.push(0);
        for(j=0;j<w;j++) {
            for(k=0;k<3;k++) {
                a = img[k][i][j];
                if(a>255) a = 255;
                else if(a<0) a=0;
                else a = Math.round(a);
                s1 = (s1 + a )%65521;
                s2 = (s2 + s1)%65521;
                stream.push(a);
            }
        }
        stream.push(0);
    }
    adler32 = (s2<<16)+s1;
    stream.push((adler32>>24)&255);
    stream.push((adler32>>16)&255);
    stream.push((adler32>>8)&255);
    stream.push((adler32)&255);
    length = stream.length - 41;
    stream[33] = (length>>24)&255;
    stream[34] = (length>>16)&255;
    stream[35] = (length>>8)&255;
    stream[36] = (length)&255;
    crc32 = crc32Array(stream,37);
    stream.push((crc32>>24)&255);
    stream.push((crc32>>16)&255);
    stream.push((crc32>>8)&255);
    stream.push((crc32)&255);
    stream.push(0);
    stream.push(0);
    stream.push(0);
    stream.push(0);
//    a = stream.length;
    stream.push(73);  // I
    stream.push(69);  // E
    stream.push(78);  // N
    stream.push(68);  // D
    stream.push(174); // CRC1
    stream.push(66);  // CRC2
    stream.push(96);  // CRC3
    stream.push(130); // CRC4
    return 'data:image/png;base64,'+base64(stream);
}

// 2. Linear algebra with Arrays.
numeric._dim = function _dim(x) {
    var ret = [];
    while(typeof x === "object") { ret.push(x.length); x = x[0]; }
    return ret;
}

numeric.dim = function dim(x) {
    var y,z;
    if(typeof x === "object") {
        y = x[0];
        if(typeof y === "object") {
            z = y[0];
            if(typeof z === "object") {
                return numeric._dim(x);
            }
            return [x.length,y.length];
        }
        return [x.length];
    }
    return [];
}

numeric.mapreduce = function mapreduce(body,init) {
    return numeric.compile('x','accum','_s','_k',
            'if(typeof accum === "undefined") accum = '+init+';\n'+
            'if(typeof x === "number") { var xi = x; '+body+'; return accum; }\n'+
            'if(typeof _s === "undefined") _s = numeric.dim(x);\n'+
            'if(typeof _k === "undefined") _k = 0;\n'+
            'var _n = _s[_k];\n'+
            'var i,xi;\n'+
            'if(_k < _s.length-1) {\n'+
            '    for(i=_n-1;i>=0;i--) {\n'+
            '        accum = arguments.callee(x[i],accum,_s,_k+1);\n'+
            '    }'+
            '    return accum;\n'+
            '}\n'+
            'for(i=_n-1;i>=1;i-=2) { \n'+
            '    xi = x[i];\n'+
            '    '+body+';\n'+
            '    xi = x[i-1];\n'+
            '    '+body+';\n'+
            '}\n'+
            'if(i === 0) {\n'+
            '    xi = x[i];\n'+
            '    '+body+'\n'+
            '}\n'+
            'return accum;'
            );
}
numeric.mapreduce2 = function mapreduce2(body,setup) {
    return numeric.compile('x',
            'var n = x.length;\n'+
            'var i,xi;\n'+setup+';\n'+
            'for(i=n-1;i!==-1;--i) { \n'+
            '    xi = x[i];\n'+
            '    '+body+';\n'+
            '}\n'+
            'return accum;'
            );
}


numeric.same = function same(x,y) {
    var i,n;
    if(!(x instanceof Array) || !(y instanceof Array)) { return false; }
    n = x.length;
    if(n !== y.length) { return false; }
    for(i=0;i<n;i++) {
        if(x[i] === y[i]) { continue; }
        if(typeof x[i] === "object") { if(!same(x[i],y[i])) return false; }
        else { return false; }
    }
    return true;
}

numeric.rep = function rep(s,v,k) {
    if(typeof k === "undefined") { k=0; }
    var n = s[k], ret = Array(n), i;
    if(k === s.length-1) {
        for(i=n-2;i>=0;i-=2) { ret[i+1] = v; ret[i] = v; }
        if(i===-1) { ret[0] = v; }
        return ret;
    }
    for(i=n-1;i>=0;i--) { ret[i] = numeric.rep(s,v,k+1); }
    return ret;
}


numeric.dotMMsmall = function dotMMsmall(x,y) {
    var i,j,k,p,q,r,ret,foo,bar,woo,i0,k0,p0,r0;
    p = x.length; q = y.length; r = y[0].length;
    ret = Array(p);
    for(i=p-1;i>=0;i--) {
        foo = Array(r);
        bar = x[i];
        for(k=r-1;k>=0;k--) {
            woo = bar[q-1]*y[q-1][k];
            for(j=q-2;j>=1;j-=2) {
                i0 = j-1;
                woo += bar[j]*y[j][k] + bar[i0]*y[i0][k];
            }
            if(j===0) { woo += bar[0]*y[0][k]; }
            foo[k] = woo;
        }
        ret[i] = foo;
    }
    return ret;
}
numeric._getCol = function _getCol(A,j,x) {
    var n = A.length, i;
    for(i=n-1;i>0;--i) {
        x[i] = A[i][j];
        --i;
        x[i] = A[i][j];
    }
    if(i===0) x[0] = A[0][j];
}
numeric.dotMMbig = function dotMMbig(x,y){
    var gc = numeric._getCol, p = y.length, v = Array(p);
    var m = x.length, n = y[0].length, A = new Array(m), xj;
    var VV = numeric.dotVV;
    var i,j,k,z;
    --p;
    --m;
    for(i=m;i!==-1;--i) A[i] = Array(n);
    --n;
    for(i=n;i!==-1;--i) {
        gc(y,i,v);
        for(j=m;j!==-1;--j) {
            z=0;
            xj = x[j];
            A[j][i] = VV(xj,v);
        }
    }
    return A;
}

numeric.dotMV = function dotMV(x,y) {
    var p = x.length, q = y.length,i;
    var ret = Array(p), dotVV = numeric.dotVV;
    for(i=p-1;i>=0;i--) { ret[i] = dotVV(x[i],y); }
    return ret;
}

numeric.dotVM = function dotVM(x,y) {
    var i,j,k,p,q,r,ret,foo,bar,woo,i0,k0,p0,r0,s1,s2,s3,baz,accum;
    p = x.length; q = y[0].length;
    ret = Array(q);
    for(k=q-1;k>=0;k--) {
        woo = x[p-1]*y[p-1][k];
        for(j=p-2;j>=1;j-=2) {
            i0 = j-1;
            woo += x[j]*y[j][k] + x[i0]*y[i0][k];
        }
        if(j===0) { woo += x[0]*y[0][k]; }
        ret[k] = woo;
    }
    return ret;
}

numeric.dotVV = function dotVV(x,y) {
    var i,n=x.length,i1,ret = x[n-1]*y[n-1];
    for(i=n-2;i>=1;i-=2) {
        i1 = i-1;
        ret += x[i]*y[i] + x[i1]*y[i1];
    }
    if(i===0) { ret += x[0]*y[0]; }
    return ret;
}

numeric.dot = function dot(x,y) {
    var d = numeric.dim;
    switch(d(x).length*1000+d(y).length) {
    case 2002:
        if(y.length < 10) return numeric.dotMMsmall(x,y);
        else return numeric.dotMMbig(x,y);
    case 2001: return numeric.dotMV(x,y);
    case 1002: return numeric.dotVM(x,y);
    case 1001: return numeric.dotVV(x,y);
    case 1000: return numeric.mulVS(x,y);
    case 1: return numeric.mulSV(x,y);
    case 0: return x*y;
    default: throw new Error('numeric.dot only works on vectors and matrices');
    }
}

numeric.diag = function diag(d) {
    var i,i1,j,n = d.length, A = Array(n), Ai;
    for(i=n-1;i>=0;i--) {
        Ai = Array(n);
        i1 = i+2;
        for(j=n-1;j>=i1;j-=2) {
            Ai[j] = 0;
            Ai[j-1] = 0;
        }
        if(j>i) { Ai[j] = 0; }
        Ai[i] = d[i];
        for(j=i-1;j>=1;j-=2) {
            Ai[j] = 0;
            Ai[j-1] = 0;
        }
        if(j===0) { Ai[0] = 0; }
        A[i] = Ai;
    }
    return A;
}
numeric.getDiag = function(A) {
    var n = Math.min(A.length,A[0].length),i,ret = Array(n);
    for(i=n-1;i>=1;--i) {
        ret[i] = A[i][i];
        --i;
        ret[i] = A[i][i];
    }
    if(i===0) {
        ret[0] = A[0][0];
    }
    return ret;
}

numeric.identity = function identity(n) { return numeric.diag(numeric.rep([n],1)); }
numeric.pointwise = function pointwise(params,body,setup) {
    if(typeof setup === "undefined") { setup = ""; }
    var fun = [];
    var k;
    var avec = /\[i\]$/,p,thevec = '';
    var haveret = false;
    for(k=0;k<params.length;k++) {
        if(avec.test(params[k])) {
            p = params[k].substring(0,params[k].length-3);
            thevec = p;
        } else { p = params[k]; }
        if(p==='ret') haveret = true;
        fun.push(p);
    }
    fun[params.length] = '_s';
    fun[params.length+1] = '_k';
    fun[params.length+2] = (
            'if(typeof _s === "undefined") _s = numeric.dim('+thevec+');\n'+
            'if(typeof _k === "undefined") _k = 0;\n'+
            'var _n = _s[_k];\n'+
            'var i'+(haveret?'':', ret = Array(_n)')+';\n'+
            'if(_k < _s.length-1) {\n'+
            '    for(i=_n-1;i>=0;i--) ret[i] = arguments.callee('+params.join(',')+',_s,_k+1);\n'+
            '    return ret;\n'+
            '}\n'+
            setup+'\n'+
            'for(i=_n-1;i!==-1;--i) {\n'+
            '    '+body+'\n'+
            '}\n'+
            'return ret;'
            );
    return numeric.compile.apply(null,fun);
}
numeric.pointwise2 = function pointwise2(params,body,setup) {
    if(typeof setup === "undefined") { setup = ""; }
    var fun = [];
    var k;
    var avec = /\[i\]$/,p,thevec = '';
    var haveret = false;
    for(k=0;k<params.length;k++) {
        if(avec.test(params[k])) {
            p = params[k].substring(0,params[k].length-3);
            thevec = p;
        } else { p = params[k]; }
        if(p==='ret') haveret = true;
        fun.push(p);
    }
    fun[params.length] = (
            'var _n = '+thevec+'.length;\n'+
            'var i'+(haveret?'':', ret = Array(_n)')+';\n'+
            setup+'\n'+
            'for(i=_n-1;i!==-1;--i) {\n'+
            body+'\n'+
            '}\n'+
            'return ret;'
            );
    return numeric.compile.apply(null,fun);
}
numeric._biforeach = (function _biforeach(x,y,s,k,f) {
    if(k === s.length-1) { f(x,y); return; }
    var i,n=s[k];
    for(i=n-1;i>=0;i--) { _biforeach(typeof x==="object"?x[i]:x,typeof y==="object"?y[i]:y,s,k+1,f); }
});
numeric._biforeach2 = (function _biforeach2(x,y,s,k,f) {
    if(k === s.length-1) { return f(x,y); }
    var i,n=s[k],ret = Array(n);
    for(i=n-1;i>=0;--i) { ret[i] = _biforeach2(typeof x==="object"?x[i]:x,typeof y==="object"?y[i]:y,s,k+1,f); }
    return ret;
});
numeric._foreach = (function _foreach(x,s,k,f) {
    if(k === s.length-1) { f(x); return; }
    var i,n=s[k];
    for(i=n-1;i>=0;i--) { _foreach(x[i],s,k+1,f); }
});
numeric._foreach2 = (function _foreach2(x,s,k,f) {
    if(k === s.length-1) { return f(x); }
    var i,n=s[k], ret = Array(n);
    for(i=n-1;i>=0;i--) { ret[i] = _foreach2(x[i],s,k+1,f); }
    return ret;
});

/*numeric.anyV = numeric.mapreduce('if(xi) return true;','false');
numeric.allV = numeric.mapreduce('if(!xi) return false;','true');
numeric.any = function(x) { if(typeof x.length === "undefined") return x; return numeric.anyV(x); }
numeric.all = function(x) { if(typeof x.length === "undefined") return x; return numeric.allV(x); }*/

numeric.ops2 = {
        add: '+',
        sub: '-',
        mul: '*',
        div: '/',
        mod: '%',
        and: '&&',
        or:  '||',
        eq:  '===',
        neq: '!==',
        lt:  '<',
        gt:  '>',
        leq: '<=',
        geq: '>=',
        band: '&',
        bor: '|',
        bxor: '^',
        lshift: '<<',
        rshift: '>>',
        rrshift: '>>>'
};
numeric.opseq = {
        addeq: '+=',
        subeq: '-=',
        muleq: '*=',
        diveq: '/=',
        modeq: '%=',
        lshifteq: '<<=',
        rshifteq: '>>=',
        rrshifteq: '>>>=',
        bandeq: '&=',
        boreq: '|=',
        bxoreq: '^='
};
numeric.mathfuns = ['abs','acos','asin','atan','ceil','cos',
                    'exp','floor','log','round','sin','sqrt','tan',
                    'isNaN','isFinite'];
numeric.mathfuns2 = ['atan2','pow','max','min'];
numeric.ops1 = {
        neg: '-',
        not: '!',
        bnot: '~',
        clone: ''
};
numeric.mapreducers = {
        any: ['if(xi) return true;','var accum = false;'],
        all: ['if(!xi) return false;','var accum = true;'],
        sum: ['accum += xi;','var accum = 0;'],
        prod: ['accum *= xi;','var accum = 1;'],
        norm2Squared: ['accum += xi*xi;','var accum = 0;'],
        norminf: ['accum = max(accum,abs(xi));','var accum = 0, max = Math.max, abs = Math.abs;'],
        norm1: ['accum += abs(xi)','var accum = 0, abs = Math.abs;'],
        sup: ['accum = max(accum,xi);','var accum = -Infinity, max = Math.max;'],
        inf: ['accum = min(accum,xi);','var accum = Infinity, min = Math.min;']
};

(function () {
    var i,o;
    for(i=0;i<numeric.mathfuns2.length;++i) {
        o = numeric.mathfuns2[i];
        numeric.ops2[o] = o;
    }
    for(i in numeric.ops2) {
        if(numeric.ops2.hasOwnProperty(i)) {
            o = numeric.ops2[i];
            var code, codeeq, setup = '';
            if(numeric.myIndexOf.call(numeric.mathfuns2,i)!==-1) {
                setup = 'var '+o+' = Math.'+o+';\n';
                code = function(r,x,y) { return r+' = '+o+'('+x+','+y+')'; };
                codeeq = function(x,y) { return x+' = '+o+'('+x+','+y+')'; };
            } else {
                code = function(r,x,y) { return r+' = '+x+' '+o+' '+y; };
                if(numeric.opseq.hasOwnProperty(i+'eq')) {
                    codeeq = function(x,y) { return x+' '+o+'= '+y; };
                } else {
                    codeeq = function(x,y) { return x+' = '+x+' '+o+' '+y; };
                }
            }
            numeric[i+'VV'] = numeric.pointwise2(['x[i]','y[i]'],code('ret[i]','x[i]','y[i]'),setup);
            numeric[i+'SV'] = numeric.pointwise2(['x','y[i]'],code('ret[i]','x','y[i]'),setup);
            numeric[i+'VS'] = numeric.pointwise2(['x[i]','y'],code('ret[i]','x[i]','y'),setup);
            numeric[i] = numeric.compile(
                    'var n = arguments.length, i, x = arguments[0], y;\n'+
                    'var VV = numeric.'+i+'VV, VS = numeric.'+i+'VS, SV = numeric.'+i+'SV;\n'+
                    'var dim = numeric.dim;\n'+
                    'for(i=1;i!==n;++i) { \n'+
                    '  y = arguments[i];\n'+
                    '  if(typeof x === "object") {\n'+
                    '      if(typeof y === "object") x = numeric._biforeach2(x,y,dim(x),0,VV);\n'+
                    '      else x = numeric._biforeach2(x,y,dim(x),0,VS);\n'+
                    '  } else if(typeof y === "object") x = numeric._biforeach2(x,y,dim(y),0,SV);\n'+
                    '  else '+codeeq('x','y')+'\n'+
                    '}\nreturn x;\n');
            numeric[o] = numeric[i];
            numeric[i+'eqV'] = numeric.pointwise2(['ret[i]','x[i]'], codeeq('ret[i]','x[i]'),setup);
            numeric[i+'eqS'] = numeric.pointwise2(['ret[i]','x'], codeeq('ret[i]','x'),setup);
            numeric[i+'eq'] = numeric.compile(
                    'var n = arguments.length, i, x = arguments[0], y;\n'+
                    'var V = numeric.'+i+'eqV, S = numeric.'+i+'eqS\n'+
                    'var s = numeric.dim(x);\n'+
                    'for(i=1;i!==n;++i) { \n'+
                    '  y = arguments[i];\n'+
                    '  if(typeof y === "object") numeric._biforeach(x,y,s,0,V);\n'+
                    '  else numeric._biforeach(x,y,s,0,S);\n'+
                    '}\nreturn x;\n');
        }
    }
    for(i=0;i<numeric.mathfuns2.length;++i) {
        o = numeric.mathfuns2[i];
        delete numeric.ops2[o];
    }
    for(i=0;i<numeric.mathfuns.length;++i) {
        o = numeric.mathfuns[i];
        numeric.ops1[o] = o;
    }
    for(i in numeric.ops1) {
        if(numeric.ops1.hasOwnProperty(i)) {
            setup = '';
            o = numeric.ops1[i];
            if(numeric.myIndexOf.call(numeric.mathfuns,i)!==-1) {
                if(Math.hasOwnProperty(o)) setup = 'var '+o+' = Math.'+o+';\n';
            }
            numeric[i+'eqV'] = numeric.pointwise2(['ret[i]'],'ret[i] = '+o+'(ret[i]);',setup);
            numeric[i+'eq'] = numeric.compile('x',
                    'if(typeof x !== "object") return '+o+'x\n'+
                    'var i;\n'+
                    'var V = numeric.'+i+'eqV;\n'+
                    'var s = numeric.dim(x);\n'+
                    'numeric._foreach(x,s,0,V);\n'+
                    'return x;\n');
            numeric[i+'V'] = numeric.pointwise2(['x[i]'],'ret[i] = '+o+'(x[i]);',setup);
            numeric[i] = numeric.compile('x',
                    'if(typeof x !== "object") return '+o+'(x)\n'+
                    'var i;\n'+
                    'var V = numeric.'+i+'V;\n'+
                    'var s = numeric.dim(x);\n'+
                    'return numeric._foreach2(x,s,0,V);\n');
        }
    }
    for(i=0;i<numeric.mathfuns.length;++i) {
        o = numeric.mathfuns[i];
        delete numeric.ops1[o];
    }
    for(i in numeric.mapreducers) {
        if(numeric.mapreducers.hasOwnProperty(i)) {
            o = numeric.mapreducers[i];
            numeric[i+'V'] = numeric.mapreduce2(o[0],o[1]);
            numeric[i] = numeric.compile('x','s','k',
                    o[1]+
                    'if(typeof x !== "object") {'+
                    '    xi = x;\n'+
                    o[0]+';\n'+
                    '    return accum;\n'+
                    '}'+
                    'if(typeof s === "undefined") s = numeric.dim(x);\n'+
                    'if(typeof k === "undefined") k = 0;\n'+
                    'if(k === s.length-1) return numeric.'+i+'V(x);\n'+
                    'var xi;\n'+
                    'var n = x.length, i;\n'+
                    'for(i=n-1;i!==-1;--i) {\n'+
                    '   xi = arguments.callee(x[i]);\n'+
                    o[0]+';\n'+
                    '}\n'+
                    'return accum;\n');
        }
    }
}());

numeric.truncVV = numeric.pointwise(['x[i]','y[i]'],'ret[i] = round(x[i]/y[i])*y[i];','var round = Math.round;');
numeric.truncVS = numeric.pointwise(['x[i]','y'],'ret[i] = round(x[i]/y)*y;','var round = Math.round;');
numeric.truncSV = numeric.pointwise(['x','y[i]'],'ret[i] = round(x/y[i])*y[i];','var round = Math.round;');
numeric.trunc = function trunc(x,y) {
    if(typeof x === "object") {
        if(typeof y === "object") return numeric.truncVV(x,y);
        return numeric.truncVS(x,y);
    }
    if (typeof y === "object") return numeric.truncSV(x,y);
    return Math.round(x/y)*y;
}

numeric.inv = function inv(x) {
    var s = numeric.dim(x), abs = Math.abs, m = s[0], n = s[1];
    var A = numeric.clone(x), Ai, Aj;
    var I = numeric.identity(m), Ii, Ij;
    var i,j,k,x;
    for(j=0;j<n;++j) {
        var i0 = -1;
        var v0 = -1;
        for(i=j;i!==m;++i) { k = abs(A[i][j]); if(k>v0) { i0 = i; v0 = k; } }
        Aj = A[i0]; A[i0] = A[j]; A[j] = Aj;
        Ij = I[i0]; I[i0] = I[j]; I[j] = Ij;
        x = Aj[j];
        for(k=j;k!==n;++k)    Aj[k] /= x;
        for(k=n-1;k!==-1;--k) Ij[k] /= x;
        for(i=m-1;i!==-1;--i) {
            if(i!==j) {
                Ai = A[i];
                Ii = I[i];
                x = Ai[j];
                for(k=j+1;k!==n;++k)  Ai[k] -= Aj[k]*x;
                for(k=n-1;k>0;--k) { Ii[k] -= Ij[k]*x; --k; Ii[k] -= Ij[k]*x; }
                if(k===0) Ii[0] -= Ij[0]*x;
            }
        }
    }
    return I;
}

numeric.det = function det(x) {
    var s = numeric.dim(x);
    if(s.length !== 2 || s[0] !== s[1]) { throw new Error('numeric: det() only works on square matrices'); }
    var n = s[0], ret = 1,i,j,k,A = numeric.clone(x),Aj,Ai,alpha,temp,k1,k2,k3;
    for(j=0;j<n-1;j++) {
        k=j;
        for(i=j+1;i<n;i++) { if(Math.abs(A[i][j]) > Math.abs(A[k][j])) { k = i; } }
        if(k !== j) {
            temp = A[k]; A[k] = A[j]; A[j] = temp;
            ret *= -1;
        }
        Aj = A[j];
        for(i=j+1;i<n;i++) {
            Ai = A[i];
            alpha = Ai[j]/Aj[j];
            for(k=j+1;k<n-1;k+=2) {
                k1 = k+1;
                Ai[k] -= Aj[k]*alpha;
                Ai[k1] -= Aj[k1]*alpha;
            }
            if(k!==n) { Ai[k] -= Aj[k]*alpha; }
        }
        if(Aj[j] === 0) { return 0; }
        ret *= Aj[j];
    }
    return ret*A[j][j];
}

numeric.transpose = function transpose(x) {
    var i,j,m = x.length,n = x[0].length, ret=Array(n),A0,A1,Bj;
    for(j=0;j<n;j++) ret[j] = Array(m);
    for(i=m-1;i>=1;i-=2) {
        A1 = x[i];
        A0 = x[i-1];
        for(j=n-1;j>=1;--j) {
            Bj = ret[j]; Bj[i] = A1[j]; Bj[i-1] = A0[j];
            --j;
            Bj = ret[j]; Bj[i] = A1[j]; Bj[i-1] = A0[j];
        }
        if(j===0) {
            Bj = ret[0]; Bj[i] = A1[0]; Bj[i-1] = A0[0];
        }
    }
    if(i===0) {
        A0 = x[0];
        for(j=n-1;j>=1;--j) {
            ret[j][0] = A0[j];
            --j;
            ret[j][0] = A0[j];
        }
        if(j===0) { ret[0][0] = A0[0]; }
    }
    return ret;
}
numeric.negtranspose = function negtranspose(x) {
    var i,j,m = x.length,n = x[0].length, ret=Array(n),A0,A1,Bj;
    for(j=0;j<n;j++) ret[j] = Array(m);
    for(i=m-1;i>=1;i-=2) {
        A1 = x[i];
        A0 = x[i-1];
        for(j=n-1;j>=1;--j) {
            Bj = ret[j]; Bj[i] = -A1[j]; Bj[i-1] = -A0[j];
            --j;
            Bj = ret[j]; Bj[i] = -A1[j]; Bj[i-1] = -A0[j];
        }
        if(j===0) {
            Bj = ret[0]; Bj[i] = -A1[0]; Bj[i-1] = -A0[0];
        }
    }
    if(i===0) {
        A0 = x[0];
        for(j=n-1;j>=1;--j) {
            ret[j][0] = -A0[j];
            --j;
            ret[j][0] = -A0[j];
        }
        if(j===0) { ret[0][0] = -A0[0]; }
    }
    return ret;
}

numeric._random = function _random(s,k) {
    var i,n=s[k],ret=Array(n), rnd;
    if(k === s.length-1) {
        rnd = Math.random;
        for(i=n-1;i>=1;i-=2) {
            ret[i] = rnd();
            ret[i-1] = rnd();
        }
        if(i===0) { ret[0] = rnd(); }
        return ret;
    }
    for(i=n-1;i>=0;i--) ret[i] = _random(s,k+1);
    return ret;
}
numeric.random = function random(s) { return numeric._random(s,0); }

numeric.norm2 = function norm2(x) { return Math.sqrt(numeric.norm2Squared(x)); }

numeric.linspace = function linspace(a,b,n) {
    if(typeof n === "undefined") n = Math.max(Math.round(b-a)+1,1);
    if(n<2) { return n===1?[a]:[]; }
    var i,ret = Array(n);
    n--;
    for(i=n;i>=0;i--) { ret[i] = (i*b+(n-i)*a)/n; }
    return ret;
}

numeric.getBlock = function getBlock(x,from,to) {
    var s = numeric.dim(x);
    function foo(x,k) {
        var i,a = from[k], n = to[k]-a, ret = Array(n);
        if(k === s.length-1) {
            for(i=n;i>=0;i--) { ret[i] = x[i+a]; }
            return ret;
        }
        for(i=n;i>=0;i--) { ret[i] = foo(x[i+a],k+1); }
        return ret;
    }
    return foo(x,0);
}

numeric.setBlock = function setBlock(x,from,to,B) {
    var s = numeric.dim(x);
    function foo(x,y,k) {
        var i,a = from[k], n = to[k]-a;
        if(k === s.length-1) { for(i=n;i>=0;i--) { x[i+a] = y[i]; } }
        for(i=n;i>=0;i--) { foo(x[i+a],y[i],k+1); }
    }
    foo(x,B,0);
    return x;
}

numeric.getRange = function getRange(A,I,J) {
    var m = I.length, n = J.length;
    var i,j;
    var B = Array(m), Bi, AI;
    for(i=m-1;i!==-1;--i) {
        B[i] = Array(n);
        Bi = B[i];
        AI = A[I[i]];
        for(j=n-1;j!==-1;--j) Bi[j] = AI[J[j]];
    }
    return B;
}

numeric.blockMatrix = function blockMatrix(X) {
    var s = numeric.dim(X);
    if(s.length<4) return numeric.blockMatrix([X]);
    var m=s[0],n=s[1],M,N,i,j,Xij;
    M = 0; N = 0;
    for(i=0;i<m;++i) M+=X[i][0].length;
    for(j=0;j<n;++j) N+=X[0][j][0].length;
    var Z = Array(M);
    for(i=0;i<M;++i) Z[i] = Array(N);
    var I=0,J,ZI,k,l,Xijk;
    for(i=0;i<m;++i) {
        J=N;
        for(j=n-1;j!==-1;--j) {
            Xij = X[i][j];
            J -= Xij[0].length;
            for(k=Xij.length-1;k!==-1;--k) {
                Xijk = Xij[k];
                ZI = Z[I+k];
                for(l = Xijk.length-1;l!==-1;--l) ZI[J+l] = Xijk[l];
            }
        }
        I += X[i][0].length;
    }
    return Z;
}

numeric.tensor = function tensor(x,y) {
    if(typeof x === "number" || typeof y === "number") return numeric.mul(x,y);
    var s1 = numeric.dim(x), s2 = numeric.dim(y);
    if(s1.length !== 1 || s2.length !== 1) {
        throw new Error('numeric: tensor product is only defined for vectors');
    }
    var m = s1[0], n = s2[0], A = Array(m), Ai, i,j,xi;
    for(i=m-1;i>=0;i--) {
        Ai = Array(n);
        xi = x[i];
        for(j=n-1;j>=3;--j) {
            Ai[j] = xi * y[j];
            --j;
            Ai[j] = xi * y[j];
            --j;
            Ai[j] = xi * y[j];
            --j;
            Ai[j] = xi * y[j];
        }
        while(j>=0) { Ai[j] = xi * y[j]; --j; }
        A[i] = Ai;
    }
    return A;
}

// 3. The Tensor type T
numeric.T = function T(x,y) { this.x = x; this.y = y; }
numeric.t = function t(x,y) { return new numeric.T(x,y); }

numeric.Tbinop = function Tbinop(rr,rc,cr,cc,setup) {
    var io = numeric.indexOf;
    if(typeof setup !== "string") {
        var k;
        setup = '';
        for(k in numeric) {
            if(numeric.hasOwnProperty(k) && (rr.indexOf(k)>=0 || rc.indexOf(k)>=0 || cr.indexOf(k)>=0 || cc.indexOf(k)>=0) && k.length>1) {
                setup += 'var '+k+' = numeric.'+k+';\n';
            }
        }
    }
    return numeric.compile(['y'],
            'var x = this;\n'+
            'if(!(y instanceof numeric.T)) { y = new numeric.T(y); }\n'+
            setup+'\n'+
            'if(x.y) {'+
            '  if(y.y) {'+
            '    return new numeric.T('+cc+');\n'+
            '  }\n'+
            '  return new numeric.T('+cr+');\n'+
            '}\n'+
            'if(y.y) {\n'+
            '  return new numeric.T('+rc+');\n'+
            '}\n'+
            'return new numeric.T('+rr+');\n'
    );
}

numeric.T.prototype.add = numeric.Tbinop(
        'add(x.x,y.x)',
        'add(x.x,y.x),y.y',
        'add(x.x,y.x),x.y',
        'add(x.x,y.x),add(x.y,y.y)');
numeric.T.prototype.sub = numeric.Tbinop(
        'sub(x.x,y.x)',
        'sub(x.x,y.x),neg(y.y)',
        'sub(x.x,y.x),x.y',
        'sub(x.x,y.x),sub(x.y,y.y)');
numeric.T.prototype.mul = numeric.Tbinop(
        'mul(x.x,y.x)',
        'mul(x.x,y.x),mul(x.x,y.y)',
        'mul(x.x,y.x),mul(x.y,y.x)',
        'sub(mul(x.x,y.x),mul(x.y,y.y)),add(mul(x.x,y.y),mul(x.y,y.x))');

numeric.T.prototype.reciprocal = function reciprocal() {
    var mul = numeric.mul, div = numeric.div;
    if(this.y) {
        var d = numeric.add(mul(this.x,this.x),mul(this.y,this.y));
        return new numeric.T(div(this.x,d),div(numeric.neg(this.y),d));
    }
    return new T(div(1,this.x));
}
numeric.T.prototype.div = function div(y) {
    if(!(y instanceof numeric.T)) y = new numeric.T(y);
    if(y.y) { return this.mul(y.reciprocal()); }
    var div = numeric.div;
    if(this.y) { return new numeric.T(div(this.x,y.x),div(this.y,y.x)); }
    return new numeric.T(div(this.x,y.x));
}
numeric.T.prototype.dot = numeric.Tbinop(
        'dot(x.x,y.x)',
        'dot(x.x,y.x),dot(x.x,y.y)',
        'dot(x.x,y.x),dot(x.y,y.x)',
        'sub(dot(x.x,y.x),dot(x.y,y.y)),add(dot(x.x,y.y),dot(x.y,y.x))'
        );
numeric.T.prototype.transpose = function transpose() {
    var t = numeric.transpose, x = this.x, y = this.y;
    if(y) { return new numeric.T(t(x),t(y)); }
    return new numeric.T(t(x));
}
numeric.T.prototype.transjugate = function transjugate() {
    var t = numeric.transpose, x = this.x, y = this.y;
    if(y) { return new numeric.T(t(x),numeric.negtranspose(y)); }
    return new numeric.T(t(x));
}
numeric.Tunop = function Tunop(r,c,s) {
    if(typeof s !== "string") { s = ''; }
    return numeric.compile(
            'var x = this;\n'+
            s+'\n'+
            'if(x.y) {'+
            '  '+c+';\n'+
            '}\n'+
            r+';\n'
    );
}

numeric.T.prototype.exp = numeric.Tunop(
        'return new numeric.T(ex)',
        'return new numeric.T(mul(cos(x.y),ex),mul(sin(x.y),ex))',
        'var ex = numeric.exp(x.x), cos = numeric.cos, sin = numeric.sin, mul = numeric.mul;');
numeric.T.prototype.conj = numeric.Tunop(
        'return new numeric.T(x.x);',
        'return new numeric.T(x.x,numeric.neg(x.y));');
numeric.T.prototype.neg = numeric.Tunop(
        'return new numeric.T(neg(x.x));',
        'return new numeric.T(neg(x.x),neg(x.y));',
        'var neg = numeric.neg;');
numeric.T.prototype.sin = numeric.Tunop(
        'return new numeric.T(numeric.sin(x.x))',
        'return x.exp().sub(x.neg().exp()).div(new numeric.T(0,2));');
numeric.T.prototype.cos = numeric.Tunop(
        'return new numeric.T(numeric.cos(x.x))',
        'return x.exp().add(x.neg().exp()).div(2);');
numeric.T.prototype.abs = numeric.Tunop(
        'return new numeric.T(numeric.abs(x.x));',
        'return new numeric.T(numeric.sqrt(numeric.add(mul(x.x,x.x),mul(x.y,x.y))));',
        'var mul = numeric.mul;');
numeric.T.prototype.log = numeric.Tunop(
        'return new numeric.T(numeric.log(x.x));',
        'var theta = new numeric.T(numeric.atan2(x.y,x.x)), r = x.abs();\n'+
        'return new numeric.T(numeric.log(r.x),theta.x);');
numeric.T.prototype.norm2 = numeric.Tunop(
        'return numeric.norm2(x.x);',
        'var f = numeric.norm2Squared;\n'+
        'return Math.sqrt(f(x.x)+f(x.y));');
numeric.T.prototype.inv = function inv() {
    var A = this;
    if(typeof A.y === "undefined") { return new numeric.T(numeric.inv(A.x)); }
    var n = A.x.length, i, j, k;
    var Rx = numeric.identity(n),Ry = numeric.rep([n,n],0);
    var Ax = numeric.clone(A.x), Ay = numeric.clone(A.y);
    var Aix, Aiy, Ajx, Ajy, Rix, Riy, Rjx, Rjy;
    var i,j,k,d,d1,ax,ay,bx,by,temp;
    for(i=0;i<n;i++) {
        ax = Ax[i][i]; ay = Ay[i][i];
        d = ax*ax+ay*ay;
        k = i;
        for(j=i+1;j<n;j++) {
            ax = Ax[j][i]; ay = Ay[j][i];
            d1 = ax*ax+ay*ay;
            if(d1 > d) { k=j; d = d1; }
        }
        if(k!==i) {
            temp = Ax[i]; Ax[i] = Ax[k]; Ax[k] = temp;
            temp = Ay[i]; Ay[i] = Ay[k]; Ay[k] = temp;
            temp = Rx[i]; Rx[i] = Rx[k]; Rx[k] = temp;
            temp = Ry[i]; Ry[i] = Ry[k]; Ry[k] = temp;
        }
        Aix = Ax[i]; Aiy = Ay[i];
        Rix = Rx[i]; Riy = Ry[i];
        ax = Aix[i]; ay = Aiy[i];
        for(j=i+1;j<n;j++) {
            bx = Aix[j]; by = Aiy[j];
            Aix[j] = (bx*ax+by*ay)/d;
            Aiy[j] = (by*ax-bx*ay)/d;
        }
        for(j=0;j<n;j++) {
            bx = Rix[j]; by = Riy[j];
            Rix[j] = (bx*ax+by*ay)/d;
            Riy[j] = (by*ax-bx*ay)/d;
        }
        for(j=i+1;j<n;j++) {
            Ajx = Ax[j]; Ajy = Ay[j];
            Rjx = Rx[j]; Rjy = Ry[j];
            ax = Ajx[i]; ay = Ajy[i];
            for(k=i+1;k<n;k++) {
                bx = Aix[k]; by = Aiy[k];
                Ajx[k] -= bx*ax-by*ay;
                Ajy[k] -= by*ax+bx*ay;
            }
            for(k=0;k<n;k++) {
                bx = Rix[k]; by = Riy[k];
                Rjx[k] -= bx*ax-by*ay;
                Rjy[k] -= by*ax+bx*ay;
            }
        }
    }
    for(i=n-1;i>0;i--) {
        Rix = Rx[i]; Riy = Ry[i];
        for(j=i-1;j>=0;j--) {
            Rjx = Rx[j]; Rjy = Ry[j];
            ax = Ax[j][i]; ay = Ay[j][i];
            for(k=n-1;k>=0;k--) {
                bx = Rix[k]; by = Riy[k];
                Rjx[k] -= ax*bx - ay*by;
                Rjy[k] -= ax*by + ay*bx;
            }
        }
    }
    return new numeric.T(Rx,Ry);
}
numeric.T.prototype.get = function get(i) {
    var x = this.x, y = this.y, k = 0, ik, n = i.length;
    if(y) {
        while(k<n) {
            ik = i[k];
            x = x[ik];
            y = y[ik];
            k++;
        }
        return new numeric.T(x,y);
    }
    while(k<n) {
        ik = i[k];
        x = x[ik];
        k++;
    }
    return new numeric.T(x);
}
numeric.T.prototype.set = function set(i,v) {
    var x = this.x, y = this.y, k = 0, ik, n = i.length, vx = v.x, vy = v.y;
    if(n===0) {
        if(vy) { this.y = vy; }
        else if(y) { this.y = undefined; }
        this.x = x;
        return this;
    }
    if(vy) {
        if(y) { /* ok */ }
        else {
            y = numeric.rep(numeric.dim(x),0);
            this.y = y;
        }
        while(k<n-1) {
            ik = i[k];
            x = x[ik];
            y = y[ik];
            k++;
        }
        ik = i[k];
        x[ik] = vx;
        y[ik] = vy;
        return this;
    }
    if(y) {
        while(k<n-1) {
            ik = i[k];
            x = x[ik];
            y = y[ik];
            k++;
        }
        ik = i[k];
        x[ik] = vx;
        if(vx instanceof Array) y[ik] = numeric.rep(numeric.dim(vx),0);
        else y[ik] = 0;
        return this;
    }
    while(k<n-1) {
        ik = i[k];
        x = x[ik];
        k++;
    }
    ik = i[k];
    x[ik] = vx;
    return this;
}
numeric.T.prototype.getRows = function getRows(i0,i1) {
    var n = i1-i0+1, j;
    var rx = Array(n), ry, x = this.x, y = this.y;
    for(j=i0;j<=i1;j++) { rx[j-i0] = x[j]; }
    if(y) {
        ry = Array(n);
        for(j=i0;j<=i1;j++) { ry[j-i0] = y[j]; }
        return new numeric.T(rx,ry);
    }
    return new numeric.T(rx);
}
numeric.T.prototype.setRows = function setRows(i0,i1,A) {
    var j;
    var rx = this.x, ry = this.y, x = A.x, y = A.y;
    for(j=i0;j<=i1;j++) { rx[j] = x[j-i0]; }
    if(y) {
        if(!ry) { ry = numeric.rep(numeric.dim(rx),0); this.y = ry; }
        for(j=i0;j<=i1;j++) { ry[j] = y[j-i0]; }
    } else if(ry) {
        for(j=i0;j<=i1;j++) { ry[j] = numeric.rep([x[j-i0].length],0); }
    }
    return this;
}
numeric.T.prototype.getRow = function getRow(k) {
    var x = this.x, y = this.y;
    if(y) { return new numeric.T(x[k],y[k]); }
    return new numeric.T(x[k]);
}
numeric.T.prototype.setRow = function setRow(i,v) {
    var rx = this.x, ry = this.y, x = v.x, y = v.y;
    rx[i] = x;
    if(y) {
        if(!ry) { ry = numeric.rep(numeric.dim(rx),0); this.y = ry; }
        ry[i] = y;
    } else if(ry) {
        ry = numeric.rep([x.length],0);
    }
    return this;
}

numeric.T.prototype.getBlock = function getBlock(from,to) {
    var x = this.x, y = this.y, b = numeric.getBlock;
    if(y) { return new numeric.T(b(x,from,to),b(y,from,to)); }
    return new numeric.T(b(x,from,to));
}
numeric.T.prototype.setBlock = function setBlock(from,to,A) {
    if(!(A instanceof numeric.T)) A = new numeric.T(A);
    var x = this.x, y = this.y, b = numeric.setBlock, Ax = A.x, Ay = A.y;
    if(Ay) {
        if(!y) { this.y = numeric.rep(numeric.dim(this),0); y = this.y; }
        b(x,from,to,Ax);
        b(y,from,to,Ay);
        return this;
    }
    b(x,from,to,Ax);
    if(y) b(y,from,to,numeric.rep(numeric.dim(Ax),0));
}
numeric.T.rep = function rep(s,v) {
    var T = numeric.T;
    if(!(v instanceof T)) v = new T(v);
    var x = v.x, y = v.y, r = numeric.rep;
    if(y) return new T(r(s,x),r(s,y));
    return new T(r(s,x));
}
numeric.T.diag = function diag(d) {
    if(!(d instanceof numeric.T)) d = new numeric.T(d);
    var x = d.x, y = d.y, diag = numeric.diag;
    if(y) return new numeric.T(diag(x),diag(y));
    return new numeric.T(diag(x));
}
numeric.T.eig = function eig() {
    if(this.y) { throw new Error('eig: not implemented for complex matrices.'); }
    return numeric.eig(this.x);
}
numeric.T.identity = function identity(n) { return new numeric.T(numeric.identity(n)); }
numeric.T.prototype.getDiag = function getDiag() {
    var n = numeric;
    var x = this.x, y = this.y;
    if(y) { return new n.T(n.getDiag(x),n.getDiag(y)); }
    return new n.T(n.getDiag(x));
}

// 4. Eigenvalues of real matrices

numeric.house = function house(x) {
    var v = numeric.clone(x);
    var s = x[0] >= 0 ? 1 : -1;
    var alpha = s*numeric.norm2(x);
    v[0] += alpha;
    var foo = numeric.norm2(v);
    if(foo === 0) { /* this should not happen */ throw new Error('eig: internal error'); }
    return numeric.div(v,foo);
}

numeric.toUpperHessenberg = function toUpperHessenberg(me) {
    var s = numeric.dim(me);
    if(s.length !== 2 || s[0] !== s[1]) { throw new Error('numeric: toUpperHessenberg() only works on square matrices'); }
    var m = s[0], i,j,k,x,v,A = numeric.clone(me),B,C,Ai,Ci,Q = numeric.identity(m),Qi;
    for(j=0;j<m-2;j++) {
        x = Array(m-j-1);
        for(i=j+1;i<m;i++) { x[i-j-1] = A[i][j]; }
        if(numeric.norm2(x)>0) {
            v = numeric.house(x);
            B = numeric.getBlock(A,[j+1,j],[m-1,m-1]);
            C = numeric.tensor(v,numeric.dot(v,B));
            for(i=j+1;i<m;i++) { Ai = A[i]; Ci = C[i-j-1]; for(k=j;k<m;k++) Ai[k] -= 2*Ci[k-j]; }
            B = numeric.getBlock(A,[0,j+1],[m-1,m-1]);
            C = numeric.tensor(numeric.dot(B,v),v);
            for(i=0;i<m;i++) { Ai = A[i]; Ci = C[i]; for(k=j+1;k<m;k++) Ai[k] -= 2*Ci[k-j-1]; }
            B = Array(m-j-1);
            for(i=j+1;i<m;i++) B[i-j-1] = Q[i];
            C = numeric.tensor(v,numeric.dot(v,B));
            for(i=j+1;i<m;i++) { Qi = Q[i]; Ci = C[i-j-1]; for(k=0;k<m;k++) Qi[k] -= 2*Ci[k]; }
        }
    }
    return {H:A, Q:Q};
}

numeric.epsilon = 2.220446049250313e-16;

numeric.QRFrancis = function(H,maxiter) {
    if(typeof maxiter === "undefined") { maxiter = 10000; }
    H = numeric.clone(H);
    var H0 = numeric.clone(H);
    var s = numeric.dim(H),m=s[0],x,v,a,b,c,d,det,tr, Hloc, Q = numeric.identity(m), Qi, Hi, B, C, Ci,i,j,k,iter;
    if(m<3) { return {Q:Q, B:[ [0,m-1] ]}; }
    var epsilon = numeric.epsilon;
    for(iter=0;iter<maxiter;iter++) {
        for(j=0;j<m-1;j++) {
            if(Math.abs(H[j+1][j]) < epsilon*(Math.abs(H[j][j])+Math.abs(H[j+1][j+1]))) {
                var QH1 = numeric.QRFrancis(numeric.getBlock(H,[0,0],[j,j]),maxiter);
                var QH2 = numeric.QRFrancis(numeric.getBlock(H,[j+1,j+1],[m-1,m-1]),maxiter);
                B = Array(j+1);
                for(i=0;i<=j;i++) { B[i] = Q[i]; }
                C = numeric.dot(QH1.Q,B);
                for(i=0;i<=j;i++) { Q[i] = C[i]; }
                B = Array(m-j-1);
                for(i=j+1;i<m;i++) { B[i-j-1] = Q[i]; }
                C = numeric.dot(QH2.Q,B);
                for(i=j+1;i<m;i++) { Q[i] = C[i-j-1]; }
                return {Q:Q,B:QH1.B.concat(numeric.add(QH2.B,j+1))};
            }
        }
        a = H[m-2][m-2]; b = H[m-2][m-1];
        c = H[m-1][m-2]; d = H[m-1][m-1];
        tr = a+d;
        det = (a*d-b*c);
        Hloc = numeric.getBlock(H, [0,0], [2,2]);
        if(tr*tr>=4*det) {
            var s1,s2;
            s1 = 0.5*(tr+Math.sqrt(tr*tr-4*det));
            s2 = 0.5*(tr-Math.sqrt(tr*tr-4*det));
            Hloc = numeric.add(numeric.sub(numeric.dot(Hloc,Hloc),
                                           numeric.mul(Hloc,s1+s2)),
                               numeric.diag(numeric.rep([3],s1*s2)));
        } else {
            Hloc = numeric.add(numeric.sub(numeric.dot(Hloc,Hloc),
                                           numeric.mul(Hloc,tr)),
                               numeric.diag(numeric.rep([3],det)));
        }
        x = [Hloc[0][0],Hloc[1][0],Hloc[2][0]];
        v = numeric.house(x);
        B = [H[0],H[1],H[2]];
        C = numeric.tensor(v,numeric.dot(v,B));
        for(i=0;i<3;i++) { Hi = H[i]; Ci = C[i]; for(k=0;k<m;k++) Hi[k] -= 2*Ci[k]; }
        B = numeric.getBlock(H, [0,0],[m-1,2]);
        C = numeric.tensor(numeric.dot(B,v),v);
        for(i=0;i<m;i++) { Hi = H[i]; Ci = C[i]; for(k=0;k<3;k++) Hi[k] -= 2*Ci[k]; }
        B = [Q[0],Q[1],Q[2]];
        C = numeric.tensor(v,numeric.dot(v,B));
        for(i=0;i<3;i++) { Qi = Q[i]; Ci = C[i]; for(k=0;k<m;k++) Qi[k] -= 2*Ci[k]; }
        var J;
        for(j=0;j<m-2;j++) {
            for(k=j;k<=j+1;k++) {
                if(Math.abs(H[k+1][k]) < epsilon*(Math.abs(H[k][k])+Math.abs(H[k+1][k+1]))) {
                    var QH1 = numeric.QRFrancis(numeric.getBlock(H,[0,0],[k,k]),maxiter);
                    var QH2 = numeric.QRFrancis(numeric.getBlock(H,[k+1,k+1],[m-1,m-1]),maxiter);
                    B = Array(k+1);
                    for(i=0;i<=k;i++) { B[i] = Q[i]; }
                    C = numeric.dot(QH1.Q,B);
                    for(i=0;i<=k;i++) { Q[i] = C[i]; }
                    B = Array(m-k-1);
                    for(i=k+1;i<m;i++) { B[i-k-1] = Q[i]; }
                    C = numeric.dot(QH2.Q,B);
                    for(i=k+1;i<m;i++) { Q[i] = C[i-k-1]; }
                    return {Q:Q,B:QH1.B.concat(numeric.add(QH2.B,k+1))};
                }
            }
            J = Math.min(m-1,j+3);
            x = Array(J-j);
            for(i=j+1;i<=J;i++) { x[i-j-1] = H[i][j]; }
            v = numeric.house(x);
            B = numeric.getBlock(H, [j+1,j],[J,m-1]);
            C = numeric.tensor(v,numeric.dot(v,B));
            for(i=j+1;i<=J;i++) { Hi = H[i]; Ci = C[i-j-1]; for(k=j;k<m;k++) Hi[k] -= 2*Ci[k-j]; }
            B = numeric.getBlock(H, [0,j+1],[m-1,J]);
            C = numeric.tensor(numeric.dot(B,v),v);
            for(i=0;i<m;i++) { Hi = H[i]; Ci = C[i]; for(k=j+1;k<=J;k++) Hi[k] -= 2*Ci[k-j-1]; }
            B = Array(J-j);
            for(i=j+1;i<=J;i++) B[i-j-1] = Q[i];
            C = numeric.tensor(v,numeric.dot(v,B));
            for(i=j+1;i<=J;i++) { Qi = Q[i]; Ci = C[i-j-1]; for(k=0;k<m;k++) Qi[k] -= 2*Ci[k]; }
        }
    }
    throw new Error('numeric: eigenvalue iteration does not converge -- increase maxiter?');
}

numeric.eig = function eig(A,maxiter) {
    var QH = numeric.toUpperHessenberg(A);
    var QB = numeric.QRFrancis(QH.H,maxiter);
    var T = numeric.T;
    var n = A.length,i,k,flag = false,B = QB.B,H = numeric.dot(QB.Q,numeric.dot(QH.H,numeric.transpose(QB.Q)));
    var Q = new T(numeric.dot(QB.Q,QH.Q)),Q0;
    var m = B.length,j;
    var a,b,c,d,p1,p2,disc,x,y,p,q,n1,n2;
    var sqrt = Math.sqrt;
    for(k=0;k<m;k++) {
        i = B[k][0];
        if(i === B[k][1]) {
            // nothing
        } else {
            j = i+1;
            a = H[i][i];
            b = H[i][j];
            c = H[j][i];
            d = H[j][j];
            if(b === 0 && c === 0) continue;
            p1 = -a-d;
            p2 = a*d-b*c;
            disc = p1*p1-4*p2;
            if(disc>=0) {
                if(p1<0) x = -0.5*(p1-sqrt(disc));
                else     x = -0.5*(p1+sqrt(disc));
                n1 = (a-x)*(a-x)+b*b;
                n2 = c*c+(d-x)*(d-x);
                if(n1>n2) {
                    n1 = sqrt(n1);
                    p = (a-x)/n1;
                    q = b/n1;
                } else {
                    n2 = sqrt(n2);
                    p = c/n2;
                    q = (d-x)/n2;
                }
                Q0 = new T([[q,-p],[p,q]]);
                Q.setRows(i,j,Q0.dot(Q.getRows(i,j)));
            } else {
                x = -0.5*p1;
                y = 0.5*sqrt(-disc);
                n1 = (a-x)*(a-x)+b*b;
                n2 = c*c+(d-x)*(d-x);
                if(n1>n2) {
                    n1 = sqrt(n1+y*y);
                    p = (a-x)/n1;
                    q = b/n1;
                    x = 0;
                    y /= n1;
                } else {
                    n2 = sqrt(n2+y*y);
                    p = c/n2;
                    q = (d-x)/n2;
                    x = y/n2;
                    y = 0;
                }
                Q0 = new T([[q,-p],[p,q]],[[x,y],[y,-x]]);
                Q.setRows(i,j,Q0.dot(Q.getRows(i,j)));
            }
        }
    }
    var R = Q.dot(A).dot(Q.transjugate()), n = A.length, E = numeric.T.identity(n);
    for(j=0;j<n;j++) {
        if(j>0) {
            for(k=j-1;k>=0;k--) {
                var Rk = R.get([k,k]), Rj = R.get([j,j]);
                if(numeric.neq(Rk.x,Rj.x) || numeric.neq(Rk.y,Rj.y)) {
                    x = R.getRow(k).getBlock([k],[j-1]);
                    y = E.getRow(j).getBlock([k],[j-1]);
                    E.set([j,k],(R.get([k,j]).neg().sub(x.dot(y))).div(Rk.sub(Rj)));
                } else {
                    E.setRow(j,E.getRow(k));
                    continue;
                }
            }
        }
    }
    for(j=0;j<n;j++) {
        x = E.getRow(j);
        E.setRow(j,x.div(x.norm2()));
    }
    E = E.transpose();
    E = Q.transjugate().dot(E);
    return { lambda:R.getDiag(), E:E };
};

// 5. Compressed Column Storage matrices
numeric.ccsSparse = function ccsSparse(A) {
    var m = A.length,n,foo, i,j, counts = [];
    for(i=m-1;i!==-1;--i) {
        foo = A[i];
        for(j in foo) {
            j = parseInt(j);
            while(j>=counts.length) counts[counts.length] = 0;
            if(foo[j]!==0) counts[j]++;
        }
    }
    var n = counts.length;
    var Ai = Array(n+1);
    Ai[0] = 0;
    for(i=0;i<n;++i) Ai[i+1] = Ai[i] + counts[i];
    var Aj = Array(Ai[n]), Av = Array(Ai[n]);
    for(i=m-1;i!==-1;--i) {
        foo = A[i];
        for(j in foo) {
            if(foo[j]!==0) {
                counts[j]--;
                Aj[Ai[j]+counts[j]] = i;
                Av[Ai[j]+counts[j]] = foo[j];
            }
        }
    }
    return [Ai,Aj,Av];
}
numeric.ccsFull = function ccsFull(A) {
    var Ai = A[0], Aj = A[1], Av = A[2], s = numeric.ccsDim(A), m = s[0], n = s[1], i,j,j0,j1,k;
    var B = numeric.rep([m,n],0);
    for(i=0;i<n;i++) {
        j0 = Ai[i];
        j1 = Ai[i+1];
        for(j=j0;j<j1;++j) { B[Aj[j]][i] = Av[j]; }
    }
    return B;
}
numeric.ccsTSolve = function ccsTSolve(A,b,x,bj,xj) {
    var Ai = A[0], Aj = A[1], Av = A[2],m = Ai.length-1, max = Math.max,n=0;
    if(typeof bj === "undefined") x = numeric.rep([m],0);
    if(typeof bj === "undefined") bj = numeric.linspace(0,x.length-1);
    if(typeof xj === "undefined") xj = [];
    function dfs(j) {
        var k;
        if(x[j] !== 0) return;
        x[j] = 1;
        for(k=Ai[j];k<Ai[j+1];++k) dfs(Aj[k]);
        xj[n] = j;
        ++n;
    }
    var i,j,j0,j1,k,l,l0,l1,a;
    for(i=bj.length-1;i!==-1;--i) { dfs(bj[i]); }
    xj.length = n;
    for(i=xj.length-1;i!==-1;--i) { x[xj[i]] = 0; }
    for(i=bj.length-1;i!==-1;--i) { j = bj[i]; x[j] = b[j]; }
    for(i=xj.length-1;i!==-1;--i) {
        j = xj[i];
        j0 = Ai[j];
        j1 = max(Ai[j+1],j0);
        for(k=j0;k!==j1;++k) { if(Aj[k] === j) { x[j] /= Av[k]; break; } }
        a = x[j];
        for(k=j0;k!==j1;++k) {
            l = Aj[k];
            if(l !== j) x[l] -= a*Av[k];
        }
    }
    return x;
}
numeric.ccsDFS = function ccsDFS(n) {
    this.k = Array(n);
    this.k1 = Array(n);
    this.j = Array(n);
}
numeric.ccsDFS.prototype.dfs = function dfs(J,Ai,Aj,x,xj,Pinv) {
    var m = 0,foo,n=xj.length;
    var k = this.k, k1 = this.k1, j = this.j,km,k11;
    if(x[J]!==0) return;
    x[J] = 1;
    j[0] = J;
    k[0] = km = Ai[J];
    k1[0] = k11 = Ai[J+1];
    while(1) {
        if(km >= k11) {
            xj[n] = j[m];
            if(m===0) return;
            ++n;
            --m;
            km = k[m];
            k11 = k1[m];
        } else {
            foo = Pinv[Aj[km]];
            if(x[foo] === 0) {
                x[foo] = 1;
                k[m] = km;
                ++m;
                j[m] = foo;
                km = Ai[foo];
                k1[m] = k11 = Ai[foo+1];
            } else ++km;
        }
    }
}
numeric.ccsLPSolve = function ccsLPSolve(A,B,x,xj,I,Pinv,dfs) {
    var Ai = A[0], Aj = A[1], Av = A[2],m = Ai.length-1, n=0;
    var Bi = B[0], Bj = B[1], Bv = B[2];

    var i,i0,i1,j,J,j0,j1,k,l,l0,l1,a;
    i0 = Bi[I];
    i1 = Bi[I+1];
    xj.length = 0;
    for(i=i0;i<i1;++i) { dfs.dfs(Pinv[Bj[i]],Ai,Aj,x,xj,Pinv); }
    for(i=xj.length-1;i!==-1;--i) { x[xj[i]] = 0; }
    for(i=i0;i!==i1;++i) { j = Pinv[Bj[i]]; x[j] = Bv[i]; }
    for(i=xj.length-1;i!==-1;--i) {
        j = xj[i];
        j0 = Ai[j];
        j1 = Ai[j+1];
        for(k=j0;k<j1;++k) { if(Pinv[Aj[k]] === j) { x[j] /= Av[k]; break; } }
        a = x[j];
        for(k=j0;k<j1;++k) {
            l = Pinv[Aj[k]];
            if(l !== j) x[l] -= a*Av[k];
        }
    }
    return x;
}
numeric.ccsLUP1 = function ccsLUP1(A,threshold) {
    var m = A[0].length-1;
    var L = [numeric.rep([m+1],0),[],[]], U = [numeric.rep([m+1], 0),[],[]];
    var Li = L[0], Lj = L[1], Lv = L[2], Ui = U[0], Uj = U[1], Uv = U[2];
    var x = numeric.rep([m],0), xj = numeric.rep([m],0);
    var i,j,k,j0,j1,a,e,c,d,K;
    var sol = numeric.ccsLPSolve, max = Math.max, abs = Math.abs;
    var P = numeric.linspace(0,m-1),Pinv = numeric.linspace(0,m-1);
    var dfs = new numeric.ccsDFS(m);
    if(typeof threshold === "undefined") { threshold = 1; }
    for(i=0;i<m;++i) {
        sol(L,A,x,xj,i,Pinv,dfs);
        a = -1;
        e = -1;
        for(j=xj.length-1;j!==-1;--j) {
            k = xj[j];
            if(k <= i) continue;
            c = abs(x[k]);
            if(c > a) { e = k; a = c; }
        }
        if(abs(x[i])<threshold*a) {
            j = P[i];
            a = P[e];
            P[i] = a; Pinv[a] = i;
            P[e] = j; Pinv[j] = e;
            a = x[i]; x[i] = x[e]; x[e] = a;
        }
        a = Li[i];
        e = Ui[i];
        d = x[i];
        Lj[a] = P[i];
        Lv[a] = 1;
        ++a;
        for(j=xj.length-1;j!==-1;--j) {
            k = xj[j];
            c = x[k];
            xj[j] = 0;
            x[k] = 0;
            if(k<=i) { Uj[e] = k; Uv[e] = c;   ++e; }
            else     { Lj[a] = P[k]; Lv[a] = c/d; ++a; }
        }
        Li[i+1] = a;
        Ui[i+1] = e;
    }
    for(j=Lj.length-1;j!==-1;--j) { Lj[j] = Pinv[Lj[j]]; }
    return {L:L, U:U, P:P, Pinv:Pinv};
}
numeric.ccsDFS0 = function ccsDFS0(n) {
    this.k = Array(n);
    this.k1 = Array(n);
    this.j = Array(n);
}
numeric.ccsDFS0.prototype.dfs = function dfs(J,Ai,Aj,x,xj,Pinv,P) {
    var m = 0,foo,n=xj.length;
    var k = this.k, k1 = this.k1, j = this.j,km,k11;
    if(x[J]!==0) return;
    x[J] = 1;
    j[0] = J;
    k[0] = km = Ai[Pinv[J]];
    k1[0] = k11 = Ai[Pinv[J]+1];
    while(1) {
        if(isNaN(km)) throw new Error("Ow!");
        if(km >= k11) {
            xj[n] = Pinv[j[m]];
            if(m===0) return;
            ++n;
            --m;
            km = k[m];
            k11 = k1[m];
        } else {
            foo = Aj[km];
            if(x[foo] === 0) {
                x[foo] = 1;
                k[m] = km;
                ++m;
                j[m] = foo;
                foo = Pinv[foo];
                km = Ai[foo];
                k1[m] = k11 = Ai[foo+1];
            } else ++km;
        }
    }
}
numeric.ccsLPSolve0 = function ccsLPSolve0(A,B,y,xj,I,Pinv,P,dfs) {
    var Ai = A[0], Aj = A[1], Av = A[2],m = Ai.length-1, n=0;
    var Bi = B[0], Bj = B[1], Bv = B[2];

    var i,i0,i1,j,J,j0,j1,k,l,l0,l1,a;
    i0 = Bi[I];
    i1 = Bi[I+1];
    xj.length = 0;
    for(i=i0;i<i1;++i) { dfs.dfs(Bj[i],Ai,Aj,y,xj,Pinv,P); }
    for(i=xj.length-1;i!==-1;--i) { j = xj[i]; y[P[j]] = 0; }
    for(i=i0;i!==i1;++i) { j = Bj[i]; y[j] = Bv[i]; }
    for(i=xj.length-1;i!==-1;--i) {
        j = xj[i];
        l = P[j];
        j0 = Ai[j];
        j1 = Ai[j+1];
        for(k=j0;k<j1;++k) { if(Aj[k] === l) { y[l] /= Av[k]; break; } }
        a = y[l];
        for(k=j0;k<j1;++k) y[Aj[k]] -= a*Av[k];
        y[l] = a;
    }
}
numeric.ccsLUP0 = function ccsLUP0(A,threshold) {
    var m = A[0].length-1;
    var L = [numeric.rep([m+1],0),[],[]], U = [numeric.rep([m+1], 0),[],[]];
    var Li = L[0], Lj = L[1], Lv = L[2], Ui = U[0], Uj = U[1], Uv = U[2];
    var y = numeric.rep([m],0), xj = numeric.rep([m],0);
    var i,j,k,j0,j1,a,e,c,d,K;
    var sol = numeric.ccsLPSolve0, max = Math.max, abs = Math.abs;
    var P = numeric.linspace(0,m-1),Pinv = numeric.linspace(0,m-1);
    var dfs = new numeric.ccsDFS0(m);
    if(typeof threshold === "undefined") { threshold = 1; }
    for(i=0;i<m;++i) {
        sol(L,A,y,xj,i,Pinv,P,dfs);
        a = -1;
        e = -1;
        for(j=xj.length-1;j!==-1;--j) {
            k = xj[j];
            if(k <= i) continue;
            c = abs(y[P[k]]);
            if(c > a) { e = k; a = c; }
        }
        if(abs(y[P[i]])<threshold*a) {
            j = P[i];
            a = P[e];
            P[i] = a; Pinv[a] = i;
            P[e] = j; Pinv[j] = e;
        }
        a = Li[i];
        e = Ui[i];
        d = y[P[i]];
        Lj[a] = P[i];
        Lv[a] = 1;
        ++a;
        for(j=xj.length-1;j!==-1;--j) {
            k = xj[j];
            c = y[P[k]];
            xj[j] = 0;
            y[P[k]] = 0;
            if(k<=i) { Uj[e] = k; Uv[e] = c;   ++e; }
            else     { Lj[a] = P[k]; Lv[a] = c/d; ++a; }
        }
        Li[i+1] = a;
        Ui[i+1] = e;
    }
    for(j=Lj.length-1;j!==-1;--j) { Lj[j] = Pinv[Lj[j]]; }
    return {L:L, U:U, P:P, Pinv:Pinv};
}
numeric.ccsLUP = numeric.ccsLUP0;

numeric.ccsDim = function ccsDim(A) { return [numeric.sup(A[1])+1,A[0].length-1]; }
numeric.ccsGetBlock = function ccsGetBlock(A,i,j) {
    var s = numeric.ccsDim(A),m=s[0],n=s[1];
    if(typeof i === "undefined") { i = numeric.linspace(0,m-1); }
    else if(typeof i === "number") { i = [i]; }
    if(typeof j === "undefined") { j = numeric.linspace(0,n-1); }
    else if(typeof j === "number") { j = [j]; }
    var p,p0,p1,P = i.length,q,Q = j.length,r,jq,ip;
    var Bi = numeric.rep([n],0), Bj=[], Bv=[], B = [Bi,Bj,Bv];
    var Ai = A[0], Aj = A[1], Av = A[2];
    var x = numeric.rep([m],0),count=0,flags = numeric.rep([m],0);
    for(q=0;q<Q;++q) {
        jq = j[q];
        var q0 = Ai[jq];
        var q1 = Ai[jq+1];
        for(p=q0;p<q1;++p) {
            r = Aj[p];
            flags[r] = 1;
            x[r] = Av[p];
        }
        for(p=0;p<P;++p) {
            ip = i[p];
            if(flags[ip]) {
                Bj[count] = p;
                Bv[count] = x[i[p]];
                ++count;
            }
        }
        for(p=q0;p<q1;++p) {
            r = Aj[p];
            flags[r] = 0;
        }
        Bi[q+1] = count;
    }
    return B;
}

numeric.ccsDot = function ccsDot(A,B) {
    var Ai = A[0], Aj = A[1], Av = A[2];
    var Bi = B[0], Bj = B[1], Bv = B[2];
    var sA = numeric.ccsDim(A), sB = numeric.ccsDim(B);
    var m = sA[0], n = sA[1], o = sB[1];
    var x = numeric.rep([m],0), flags = numeric.rep([m],0), xj = Array(m);
    var Ci = numeric.rep([o],0), Cj = [], Cv = [], C = [Ci,Cj,Cv];
    var i,j,k,j0,j1,i0,i1,l,p,a,b;
    for(k=0;k!==o;++k) {
        j0 = Bi[k];
        j1 = Bi[k+1];
        p = 0;
        for(j=j0;j<j1;++j) {
            a = Bj[j];
            b = Bv[j];
            i0 = Ai[a];
            i1 = Ai[a+1];
            for(i=i0;i<i1;++i) {
                l = Aj[i];
                if(flags[l]===0) {
                    xj[p] = l;
                    flags[l] = 1;
                    p = p+1;
                }
                x[l] = x[l] + Av[i]*b;
            }
        }
        j0 = Ci[k];
        j1 = j0+p;
        Ci[k+1] = j1;
        for(j=p-1;j!==-1;--j) {
            b = j0+j;
            i = xj[j];
            Cj[b] = i;
            Cv[b] = x[i];
            flags[i] = 0;
            x[i] = 0;
        }
        Ci[k+1] = Ci[k]+p;
    }
    return C;
}

numeric.ccsLUPSolve = function ccsLUPSolve(LUP,B) {
    var L = LUP.L, U = LUP.U, P = LUP.P;
    var Bi = B[0];
    var flag = false;
    if(typeof Bi !== "object") { B = [[0,B.length],numeric.linspace(0,B.length-1),B]; Bi = B[0]; flag = true; }
    var Bj = B[1], Bv = B[2];
    var n = L[0].length-1, m = Bi.length-1;
    var x = numeric.rep([n],0), xj = Array(n);
    var b = numeric.rep([n],0), bj = Array(n);
    var Xi = numeric.rep([m+1],0), Xj = [], Xv = [];
    var sol = numeric.ccsTSolve;
    var i,j,j0,j1,k,J,N=0;
    for(i=0;i<m;++i) {
        k = 0;
        j0 = Bi[i];
        j1 = Bi[i+1];
        for(j=j0;j<j1;++j) {
            J = LUP.Pinv[Bj[j]];
            bj[k] = J;
            b[J] = Bv[j];
            ++k;
        }
        bj.length = k;
        sol(L,b,x,bj,xj);
        for(j=bj.length-1;j!==-1;--j) b[bj[j]] = 0;
        sol(U,x,b,xj,bj);
        if(flag) return b;
        for(j=xj.length-1;j!==-1;--j) x[xj[j]] = 0;
        for(j=bj.length-1;j!==-1;--j) {
            J = bj[j];
            Xj[N] = J;
            Xv[N] = b[J];
            b[J] = 0;
            ++N;
        }
        Xi[i+1] = N;
    }
    return [Xi,Xj,Xv];
}

numeric.ccsbinop = function ccsbinop(body,setup) {
    if(typeof setup === "undefined") setup='';
    return numeric.compile('X','Y',
            'var Xi = X[0], Xj = X[1], Xv = X[2];\n'+
            'var Yi = Y[0], Yj = Y[1], Yv = Y[2];\n'+
            'var n = Xi.length-1,m = Math.max(numeric.sup(Xj),numeric.sup(Yj))+1;\n'+
            'var Zi = numeric.rep([n+1],0), Zj = [], Zv = [];\n'+
            'var x = numeric.rep([m],0),y = numeric.rep([m],0);\n'+
            'var xk,yk,zk;\n'+
            'var i,j,j0,j1,k,p=0;\n'+
            setup+
            'for(i=0;i<n;++i) {\n'+
            '  j0 = Xi[i]; j1 = Xi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) {\n'+
            '    k = Xj[j];\n'+
            '    x[k] = 1;\n'+
            '    Zj[p] = k;\n'+
            '    ++p;\n'+
            '  }\n'+
            '  j0 = Yi[i]; j1 = Yi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) {\n'+
            '    k = Yj[j];\n'+
            '    y[k] = Yv[j];\n'+
            '    if(x[k] === 0) {\n'+
            '      Zj[p] = k;\n'+
            '      ++p;\n'+
            '    }\n'+
            '  }\n'+
            '  Zi[i+1] = p;\n'+
            '  j0 = Xi[i]; j1 = Xi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) x[Xj[j]] = Xv[j];\n'+
            '  j0 = Zi[i]; j1 = Zi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) {\n'+
            '    k = Zj[j];\n'+
            '    xk = x[k];\n'+
            '    yk = y[k];\n'+
            body+'\n'+
            '    Zv[j] = zk;\n'+
            '  }\n'+
            '  j0 = Xi[i]; j1 = Xi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) x[Xj[j]] = 0;\n'+
            '  j0 = Yi[i]; j1 = Yi[i+1];\n'+
            '  for(j=j0;j!==j1;++j) y[Yj[j]] = 0;\n'+
            '}\n'+
            'return [Zi,Zj,Zv];'
            );
};

(function() {
    var k,A,B,C;
    for(k in numeric.ops2) {
        if(isFinite(eval('1'+numeric.ops2[k]+'0'))) A = '[Y[0],Y[1],numeric.'+k+'(X,Y[2])]';
        else A = 'NaN';
        if(isFinite(eval('0'+numeric.ops2[k]+'1'))) B = '[X[0],X[1],numeric.'+k+'(X[2],Y)]';
        else B = 'NaN';
        if(isFinite(eval('1'+numeric.ops2[k]+'0')) && isFinite(eval('0'+numeric.ops2[k]+'1'))) C = 'numeric.ccs'+k+'MM(X,Y)';
        else C = 'NaN';
        numeric['ccs'+k+'MM'] = numeric.ccsbinop('zk = xk '+numeric.ops2[k]+'yk;');
        numeric['ccs'+k] = numeric.compile('X','Y',
                'if(typeof X === "number") return '+A+';\n'+
                'if(typeof Y === "number") return '+B+';\n'+
                'return '+C+';\n'
                );
    }
}());

numeric.ccsScatter = function ccsScatter(A) {
    var Ai = A[0], Aj = A[1], Av = A[2];
    var n = numeric.sup(Aj)+1,m=Ai.length;
    var Ri = numeric.rep([n],0),Rj=Array(m), Rv = Array(m);
    var counts = numeric.rep([n],0),i;
    for(i=0;i<m;++i) counts[Aj[i]]++;
    for(i=0;i<n;++i) Ri[i+1] = Ri[i] + counts[i];
    var ptr = Ri.slice(0),k,Aii;
    for(i=0;i<m;++i) {
        Aii = Aj[i];
        k = ptr[Aii];
        Rj[k] = Ai[i];
        Rv[k] = Av[i];
        ptr[Aii]=ptr[Aii]+1;
    }
    return [Ri,Rj,Rv];
}

numeric.ccsGather = function ccsGather(A) {
    var Ai = A[0], Aj = A[1], Av = A[2];
    var n = Ai.length-1,m = Aj.length;
    var Ri = Array(m), Rj = Array(m), Rv = Array(m);
    var i,j,j0,j1,p;
    p=0;
    for(i=0;i<n;++i) {
        j0 = Ai[i];
        j1 = Ai[i+1];
        for(j=j0;j!==j1;++j) {
            Rj[p] = i;
            Ri[p] = Aj[j];
            Rv[p] = Av[j];
            ++p;
        }
    }
    return [Ri,Rj,Rv];
}

// The following sparse linear algebra routines are deprecated.

numeric.sdim = function dim(A,ret,k) {
    if(typeof ret === "undefined") { ret = []; }
    if(typeof A !== "object") return ret;
    if(typeof k === "undefined") { k=0; }
    if(!(k in ret)) { ret[k] = 0; }
    if(A.length > ret[k]) ret[k] = A.length;
    var i;
    for(i in A) {
        if(A.hasOwnProperty(i)) dim(A[i],ret,k+1);
    }
    return ret;
};

numeric.sclone = function clone(A,k,n) {
    if(typeof k === "undefined") { k=0; }
    if(typeof n === "undefined") { n = numeric.sdim(A).length; }
    var i,ret = Array(A.length);
    if(k === n-1) {
        for(i in A) { if(A.hasOwnProperty(i)) ret[i] = A[i]; }
        return ret;
    }
    for(i in A) {
        if(A.hasOwnProperty(i)) ret[i] = clone(A[i],k+1,n);
    }
    return ret;
}

numeric.sdiag = function diag(d) {
    var n = d.length,i,ret = Array(n),i1,i2,i3;
    for(i=n-1;i>=1;i-=2) {
        i1 = i-1;
        ret[i] = []; ret[i][i] = d[i];
        ret[i1] = []; ret[i1][i1] = d[i1];
    }
    if(i===0) { ret[0] = []; ret[0][0] = d[i]; }
    return ret;
}

numeric.sidentity = function identity(n) { return numeric.sdiag(numeric.rep([n],1)); }

numeric.stranspose = function transpose(A) {
    var ret = [], n = A.length, i,j,Ai;
    for(i in A) {
        if(!(A.hasOwnProperty(i))) continue;
        Ai = A[i];
        for(j in Ai) {
            if(!(Ai.hasOwnProperty(j))) continue;
            if(typeof ret[j] !== "object") { ret[j] = []; }
            ret[j][i] = Ai[j];
        }
    }
    return ret;
}

numeric.sLUP = function LUP(A,tol) {
    throw new Error("The function numeric.sLUP had a bug in it and has been removed. Please use the new numeric.ccsLUP function instead.");
};

numeric.sdotMM = function dotMM(A,B) {
    var p = A.length, q = B.length, BT = numeric.stranspose(B), r = BT.length, Ai, BTk;
    var i,j,k,accum;
    var ret = Array(p),reti;
    for(i=p-1;i>=0;i--) {
        reti = [];
        Ai = A[i];
        for(k=r-1;k>=0;k--) {
            accum = 0;
            BTk = BT[k];
            for(j in Ai) {
                if(!(Ai.hasOwnProperty(j))) continue;
                if(j in BTk) { accum += Ai[j]*BTk[j]; }
            }
            if(accum) reti[k] = accum;
        }
        ret[i] = reti;
    }
    return ret;
}

numeric.sdotMV = function dotMV(A,x) {
    var p = A.length, Ai, i,j;
    var ret = Array(p), accum;
    for(i=p-1;i>=0;i--) {
        Ai = A[i];
        accum = 0;
        for(j in Ai) {
            if(!(Ai.hasOwnProperty(j))) continue;
            if(x[j]) accum += Ai[j]*x[j];
        }
        if(accum) ret[i] = accum;
    }
    return ret;
}

numeric.sdotVM = function dotMV(x,A) {
    var i,j,Ai,alpha;
    var ret = [], accum;
    for(i in x) {
        if(!x.hasOwnProperty(i)) continue;
        Ai = A[i];
        alpha = x[i];
        for(j in Ai) {
            if(!Ai.hasOwnProperty(j)) continue;
            if(!ret[j]) { ret[j] = 0; }
            ret[j] += alpha*Ai[j];
        }
    }
    return ret;
}

numeric.sdotVV = function dotVV(x,y) {
    var i,ret=0;
    for(i in x) { if(x[i] && y[i]) ret+= x[i]*y[i]; }
    return ret;
}

numeric.sdot = function dot(A,B) {
    var m = numeric.sdim(A).length, n = numeric.sdim(B).length;
    var k = m*1000+n;
    switch(k) {
    case 0: return A*B;
    case 1001: return numeric.sdotVV(A,B);
    case 2001: return numeric.sdotMV(A,B);
    case 1002: return numeric.sdotVM(A,B);
    case 2002: return numeric.sdotMM(A,B);
    default: throw new Error('numeric.sdot not implemented for tensors of order '+m+' and '+n);
    }
}

numeric.sscatter = function scatter(V) {
    var n = V[0].length, Vij, i, j, m = V.length, A = [], Aj;
    for(i=n-1;i>=0;--i) {
        if(!V[m-1][i]) continue;
        Aj = A;
        for(j=0;j<m-2;j++) {
            Vij = V[j][i];
            if(!Aj[Vij]) Aj[Vij] = [];
            Aj = Aj[Vij];
        }
        Aj[V[j][i]] = V[j+1][i];
    }
    return A;
}

numeric.sgather = function gather(A,ret,k) {
    if(typeof ret === "undefined") ret = [];
    if(typeof k === "undefined") k = [];
    var n,i,Ai;
    n = k.length;
    for(i in A) {
        if(A.hasOwnProperty(i)) {
            k[n] = parseInt(i);
            Ai = A[i];
            if(typeof Ai === "number") {
                if(Ai) {
                    if(ret.length === 0) {
                        for(i=n+1;i>=0;--i) ret[i] = [];
                    }
                    for(i=n;i>=0;--i) ret[i].push(k[i]);
                    ret[n+1].push(Ai);
                }
            } else gather(Ai,ret,k);
        }
    }
    if(k.length>n) k.pop();
    return ret;
}

// 6. Coordinate matrices
numeric.cLU = function LU(A) {
    var I = A[0], J = A[1], V = A[2];
    var p = I.length, m=0, i,j,k,a,b,c;
    for(i=0;i<p;i++) if(I[i]>m) m=I[i];
    m++;
    var L = Array(m), U = Array(m), left = numeric.rep([m],Infinity), right = numeric.rep([m],-Infinity);
    var Ui, Uj,alpha;
    for(k=0;k<p;k++) {
        i = I[k];
        j = J[k];
        if(j<left[i]) left[i] = j;
        if(j>right[i]) right[i] = j;
    }
    for(i=0;i<m-1;i++) { if(right[i] > right[i+1]) right[i+1] = right[i]; }
    for(i=m-1;i>=1;i--) { if(left[i]<left[i-1]) left[i-1] = left[i]; }
    var countL = 0, countU = 0;
    for(i=0;i<m;i++) {
        U[i] = numeric.rep([right[i]-left[i]+1],0);
        L[i] = numeric.rep([i-left[i]],0);
        countL += i-left[i]+1;
        countU += right[i]-i+1;
    }
    for(k=0;k<p;k++) { i = I[k]; U[i][J[k]-left[i]] = V[k]; }
    for(i=0;i<m-1;i++) {
        a = i-left[i];
        Ui = U[i];
        for(j=i+1;left[j]<=i && j<m;j++) {
            b = i-left[j];
            c = right[i]-i;
            Uj = U[j];
            alpha = Uj[b]/Ui[a];
            if(alpha) {
                for(k=1;k<=c;k++) { Uj[k+b] -= alpha*Ui[k+a]; }
                L[j][i-left[j]] = alpha;
            }
        }
    }
    var Ui = [], Uj = [], Uv = [], Li = [], Lj = [], Lv = [];
    var p,q,foo;
    p=0; q=0;
    for(i=0;i<m;i++) {
        a = left[i];
        b = right[i];
        foo = U[i];
        for(j=i;j<=b;j++) {
            if(foo[j-a]) {
                Ui[p] = i;
                Uj[p] = j;
                Uv[p] = foo[j-a];
                p++;
            }
        }
        foo = L[i];
        for(j=a;j<i;j++) {
            if(foo[j-a]) {
                Li[q] = i;
                Lj[q] = j;
                Lv[q] = foo[j-a];
                q++;
            }
        }
        Li[q] = i;
        Lj[q] = i;
        Lv[q] = 1;
        q++;
    }
    return {U:[Ui,Uj,Uv], L:[Li,Lj,Lv]};
};

numeric.cLUsolve = function LUsolve(lu,b) {
    var L = lu.L, U = lu.U, ret = numeric.clone(b);
    var Li = L[0], Lj = L[1], Lv = L[2];
    var Ui = U[0], Uj = U[1], Uv = U[2];
    var p = Ui.length, q = Li.length;
    var m = ret.length,i,j,k;
    k = 0;
    for(i=0;i<m;i++) {
        while(Lj[k] < i) {
            ret[i] -= Lv[k]*ret[Lj[k]];
            k++;
        }
        k++;
    }
    k = p-1;
    for(i=m-1;i>=0;i--) {
        while(Uj[k] > i) {
            ret[i] -= Uv[k]*ret[Uj[k]];
            k--;
        }
        ret[i] /= Uv[k];
        k--;
    }
    return ret;
};

numeric.cgrid = function grid(n,shape) {
    if(typeof n === "number") n = [n,n];
    var ret = numeric.rep(n,-1);
    var i,j,count;
    if(typeof shape !== "function") {
        switch(shape) {
        case 'L':
            shape = function(i,j) { return (i>=n[0]/2 || j<n[1]/2); }
            break;
        default:
            shape = function(i,j) { return true; };
            break;
        }
    }
    count=0;
    for(i=1;i<n[0]-1;i++) for(j=1;j<n[1]-1;j++)
        if(shape(i,j)) {
            ret[i][j] = count;
            count++;
        }
    return ret;
}

numeric.cdelsq = function delsq(g) {
    var dir = [[-1,0],[0,-1],[0,1],[1,0]];
    var s = numeric.dim(g), m = s[0], n = s[1], i,j,k,p,q;
    var Li = [], Lj = [], Lv = [];
    for(i=1;i<m-1;i++) for(j=1;j<n-1;j++) {
        if(g[i][j]<0) continue;
        for(k=0;k<4;k++) {
            p = i+dir[k][0];
            q = j+dir[k][1];
            if(g[p][q]<0) continue;
            Li.push(g[i][j]);
            Lj.push(g[p][q]);
            Lv.push(-1);
        }
        Li.push(g[i][j]);
        Lj.push(g[i][j]);
        Lv.push(4);
    }
    return [Li,Lj,Lv];
}

numeric.cdotMV = function dotMV(A,x) {
    var ret, Ai = A[0], Aj = A[1], Av = A[2],k,p=Ai.length,N;
    N=0;
    for(k=0;k<p;k++) { if(Ai[k]>N) N = Ai[k]; }
    N++;
    ret = numeric.rep([N],0);
    for(k=0;k<p;k++) { ret[Ai[k]]+=Av[k]*x[Aj[k]]; }
    return ret;
}

// 7. Splines

numeric.Spline = function Spline(x,yl,yr,kl,kr) { this.x = x; this.yl = yl; this.yr = yr; this.kl = kl; this.kr = kr; }
numeric.Spline.prototype._at = function _at(x1,p) {
    var x = this.x;
    var yl = this.yl;
    var yr = this.yr;
    var kl = this.kl;
    var kr = this.kr;
    var x1,a,b,t;
    var add = numeric.add, sub = numeric.sub, mul = numeric.mul;
    a = sub(mul(kl[p],x[p+1]-x[p]),sub(yr[p+1],yl[p]));
    b = add(mul(kr[p+1],x[p]-x[p+1]),sub(yr[p+1],yl[p]));
    t = (x1-x[p])/(x[p+1]-x[p]);
    var s = t*(1-t);
    return add(add(add(mul(1-t,yl[p]),mul(t,yr[p+1])),mul(a,s*(1-t))),mul(b,s*t));
}
numeric.Spline.prototype.at = function at(x0) {
    if(typeof x0 === "number") {
        var x = this.x;
        var n = x.length;
        var p,q,mid,floor = Math.floor,a,b,t;
        p = 0;
        q = n-1;
        while(q-p>1) {
            mid = floor((p+q)/2);
            if(x[mid] <= x0) p = mid;
            else q = mid;
        }
        return this._at(x0,p);
    }
    var n = x0.length, i, ret = Array(n);
    for(i=n-1;i!==-1;--i) ret[i] = this.at(x0[i]);
    return ret;
}
numeric.Spline.prototype.diff = function diff() {
    var x = this.x;
    var yl = this.yl;
    var yr = this.yr;
    var kl = this.kl;
    var kr = this.kr;
    var n = yl.length;
    var i,dx,dy;
    var zl = kl, zr = kr, pl = Array(n), pr = Array(n);
    var add = numeric.add, mul = numeric.mul, div = numeric.div, sub = numeric.sub;
    for(i=n-1;i!==-1;--i) {
        dx = x[i+1]-x[i];
        dy = sub(yr[i+1],yl[i]);
        pl[i] = div(add(mul(dy, 6),mul(kl[i],-4*dx),mul(kr[i+1],-2*dx)),dx*dx);
        pr[i+1] = div(add(mul(dy,-6),mul(kl[i], 2*dx),mul(kr[i+1], 4*dx)),dx*dx);
    }
    return new numeric.Spline(x,zl,zr,pl,pr);
}
numeric.Spline.prototype.roots = function roots() {
    function sqr(x) { return x*x; }
    function heval(y0,y1,k0,k1,x) {
        var A = k0*2-(y1-y0);
        var B = -k1*2+(y1-y0);
        var t = (x+1)*0.5;
        var s = t*(1-t);
        return (1-t)*y0+t*y1+A*s*(1-t)+B*s*t;
    }
    var ret = [];
    var x = this.x, yl = this.yl, yr = this.yr, kl = this.kl, kr = this.kr;
    if(typeof yl[0] === "number") {
        yl = [yl];
        yr = [yr];
        kl = [kl];
        kr = [kr];
    }
    var m = yl.length,n=x.length-1,i,j,k,y,s,t;
    var ai,bi,ci,di, ret = Array(m),ri,k0,k1,y0,y1,A,B,D,dx,cx,stops,z0,z1,zm,t0,t1,tm;
    var sqrt = Math.sqrt;
    for(i=0;i!==m;++i) {
        ai = yl[i];
        bi = yr[i];
        ci = kl[i];
        di = kr[i];
        ri = [];
        for(j=0;j!==n;j++) {
            if(j>0 && bi[j]*ai[j]<0) ri.push(x[j]);
            dx = (x[j+1]-x[j]);
            cx = x[j];
            y0 = ai[j];
            y1 = bi[j+1];
            k0 = ci[j]/dx;
            k1 = di[j+1]/dx;
            D = sqr(k0-k1+3*(y0-y1)) + 12*k1*y0;
            A = k1+3*y0+2*k0-3*y1;
            B = 3*(k1+k0+2*(y0-y1));
            if(D<=0) {
                z0 = A/B;
                if(z0>x[j] && z0<x[j+1]) stops = [x[j],z0,x[j+1]];
                else stops = [x[j],x[j+1]];
            } else {
                z0 = (A-sqrt(D))/B;
                z1 = (A+sqrt(D))/B;
                stops = [x[j]];
                if(z0>x[j] && z0<x[j+1]) stops.push(z0);
                if(z1>x[j] && z1<x[j+1]) stops.push(z1);
                stops.push(x[j+1]);
            }
            t0 = stops[0];
            z0 = this._at(t0,j);
            for(k=0;k<stops.length-1;k++) {
                t1 = stops[k+1];
                z1 = this._at(t1,j);
                if(z0 === 0) {
                    ri.push(t0);
                    t0 = t1;
                    z0 = z1;
                    continue;
                }
                if(z1 === 0 || z0*z1>0) {
                    t0 = t1;
                    z0 = z1;
                    continue;
                }
                var side = 0;
                while(1) {
                    tm = (z0*t1-z1*t0)/(z0-z1);
                    if(tm <= t0 || tm >= t1) { break; }
                    zm = this._at(tm,j);
                    if(zm*z1>0) {
                        t1 = tm;
                        z1 = zm;
                        if(side === -1) z0*=0.5;
                        side = -1;
                    } else if(zm*z0>0) {
                        t0 = tm;
                        z0 = zm;
                        if(side === 1) z1*=0.5;
                        side = 1;
                    } else break;
                }
                ri.push(tm);
                t0 = stops[k+1];
                z0 = this._at(t0, j);
            }
            if(z1 === 0) ri.push(t1);
        }
        ret[i] = ri;
    }
    if(typeof this.yl[0] === "number") return ret[0];
    return ret;
}
numeric.spline = function spline(x,y,k1,kn) {
    var n = x.length, b = [], dx = [], dy = [];
    var i;
    var sub = numeric.sub,mul = numeric.mul,add = numeric.add;
    for(i=n-2;i>=0;i--) { dx[i] = x[i+1]-x[i]; dy[i] = sub(y[i+1],y[i]); }
    if(typeof k1 === "string" || typeof kn === "string") {
        k1 = kn = "periodic";
    }
    // Build sparse tridiagonal system
    var T = [[],[],[]];
    switch(typeof k1) {
    case "undefined":
        b[0] = mul(3/(dx[0]*dx[0]),dy[0]);
        T[0].push(0,0);
        T[1].push(0,1);
        T[2].push(2/dx[0],1/dx[0]);
        break;
    case "string":
        b[0] = add(mul(3/(dx[n-2]*dx[n-2]),dy[n-2]),mul(3/(dx[0]*dx[0]),dy[0]));
        T[0].push(0,0,0);
        T[1].push(n-2,0,1);
        T[2].push(1/dx[n-2],2/dx[n-2]+2/dx[0],1/dx[0]);
        break;
    default:
        b[0] = k1;
        T[0].push(0);
        T[1].push(0);
        T[2].push(1);
        break;
    }
    for(i=1;i<n-1;i++) {
        b[i] = add(mul(3/(dx[i-1]*dx[i-1]),dy[i-1]),mul(3/(dx[i]*dx[i]),dy[i]));
        T[0].push(i,i,i);
        T[1].push(i-1,i,i+1);
        T[2].push(1/dx[i-1],2/dx[i-1]+2/dx[i],1/dx[i]);
    }
    switch(typeof kn) {
    case "undefined":
        b[n-1] = mul(3/(dx[n-2]*dx[n-2]),dy[n-2]);
        T[0].push(n-1,n-1);
        T[1].push(n-2,n-1);
        T[2].push(1/dx[n-2],2/dx[n-2]);
        break;
    case "string":
        T[1][T[1].length-1] = 0;
        break;
    default:
        b[n-1] = kn;
        T[0].push(n-1);
        T[1].push(n-1);
        T[2].push(1);
        break;
    }
    if(typeof b[0] !== "number") b = numeric.transpose(b);
    else b = [b];
    var k = Array(b.length);
    if(typeof k1 === "string") {
        for(i=k.length-1;i!==-1;--i) {
            k[i] = numeric.ccsLUPSolve(numeric.ccsLUP(numeric.ccsScatter(T)),b[i]);
            k[i][n-1] = k[i][0];
        }
    } else {
        for(i=k.length-1;i!==-1;--i) {
            k[i] = numeric.cLUsolve(numeric.cLU(T),b[i]);
        }
    }
    if(typeof y[0] === "number") k = k[0];
    else k = numeric.transpose(k);
    return new numeric.Spline(x,y,y,k,k);
}

// 8. FFT
numeric.fftpow2 = function fftpow2(x,y) {
    var n = x.length;
    if(n === 1) return;
    var cos = Math.cos, sin = Math.sin, i,j;
    var xe = Array(n/2), ye = Array(n/2), xo = Array(n/2), yo = Array(n/2);
    j = n/2;
    for(i=n-1;i!==-1;--i) {
        --j;
        xo[j] = x[i];
        yo[j] = y[i];
        --i;
        xe[j] = x[i];
        ye[j] = y[i];
    }
    fftpow2(xe,ye);
    fftpow2(xo,yo);
    j = n/2;
    var t,k = (-6.2831853071795864769252867665590057683943387987502116419/n),ci,si;
    for(i=n-1;i!==-1;--i) {
        --j;
        if(j === -1) j = n/2-1;
        t = k*i;
        ci = cos(t);
        si = sin(t);
        x[i] = xe[j] + ci*xo[j] - si*yo[j];
        y[i] = ye[j] + ci*yo[j] + si*xo[j];
    }
}
numeric._ifftpow2 = function _ifftpow2(x,y) {
    var n = x.length;
    if(n === 1) return;
    var cos = Math.cos, sin = Math.sin, i,j;
    var xe = Array(n/2), ye = Array(n/2), xo = Array(n/2), yo = Array(n/2);
    j = n/2;
    for(i=n-1;i!==-1;--i) {
        --j;
        xo[j] = x[i];
        yo[j] = y[i];
        --i;
        xe[j] = x[i];
        ye[j] = y[i];
    }
    _ifftpow2(xe,ye);
    _ifftpow2(xo,yo);
    j = n/2;
    var t,k = (6.2831853071795864769252867665590057683943387987502116419/n),ci,si;
    for(i=n-1;i!==-1;--i) {
        --j;
        if(j === -1) j = n/2-1;
        t = k*i;
        ci = cos(t);
        si = sin(t);
        x[i] = xe[j] + ci*xo[j] - si*yo[j];
        y[i] = ye[j] + ci*yo[j] + si*xo[j];
    }
}
numeric.ifftpow2 = function ifftpow2(x,y) {
    numeric._ifftpow2(x,y);
    numeric.diveq(x,x.length);
    numeric.diveq(y,y.length);
}
numeric.convpow2 = function convpow2(ax,ay,bx,by) {
    numeric.fftpow2(ax,ay);
    numeric.fftpow2(bx,by);
    var i,n = ax.length,axi,bxi,ayi,byi;
    for(i=n-1;i!==-1;--i) {
        axi = ax[i]; ayi = ay[i]; bxi = bx[i]; byi = by[i];
        ax[i] = axi*bxi-ayi*byi;
        ay[i] = axi*byi+ayi*bxi;
    }
    numeric.ifftpow2(ax,ay);
}
numeric.T.prototype.fft = function fft() {
    var x = this.x, y = this.y;
    var n = x.length, log = Math.log, log2 = log(2),
        p = Math.ceil(log(2*n-1)/log2), m = Math.pow(2,p);
    var cx = numeric.rep([m],0), cy = numeric.rep([m],0), cos = Math.cos, sin = Math.sin;
    var k, c = (-3.141592653589793238462643383279502884197169399375105820/n),t;
    var a = numeric.rep([m],0), b = numeric.rep([m],0),nhalf = Math.floor(n/2);
    for(k=0;k<n;k++) a[k] = x[k];
    if(typeof y !== "undefined") for(k=0;k<n;k++) b[k] = y[k];
    cx[0] = 1;
    for(k=1;k<=m/2;k++) {
        t = c*k*k;
        cx[k] = cos(t);
        cy[k] = sin(t);
        cx[m-k] = cos(t);
        cy[m-k] = sin(t)
    }
    var X = new numeric.T(a,b), Y = new numeric.T(cx,cy);
    X = X.mul(Y);
    numeric.convpow2(X.x,X.y,numeric.clone(Y.x),numeric.neg(Y.y));
    X = X.mul(Y);
    X.x.length = n;
    X.y.length = n;
    return X;
}
numeric.T.prototype.ifft = function ifft() {
    var x = this.x, y = this.y;
    var n = x.length, log = Math.log, log2 = log(2),
        p = Math.ceil(log(2*n-1)/log2), m = Math.pow(2,p);
    var cx = numeric.rep([m],0), cy = numeric.rep([m],0), cos = Math.cos, sin = Math.sin;
    var k, c = (3.141592653589793238462643383279502884197169399375105820/n),t;
    var a = numeric.rep([m],0), b = numeric.rep([m],0),nhalf = Math.floor(n/2);
    for(k=0;k<n;k++) a[k] = x[k];
    if(typeof y !== "undefined") for(k=0;k<n;k++) b[k] = y[k];
    cx[0] = 1;
    for(k=1;k<=m/2;k++) {
        t = c*k*k;
        cx[k] = cos(t);
        cy[k] = sin(t);
        cx[m-k] = cos(t);
        cy[m-k] = sin(t)
    }
    var X = new numeric.T(a,b), Y = new numeric.T(cx,cy);
    X = X.mul(Y);
    numeric.convpow2(X.x,X.y,numeric.clone(Y.x),numeric.neg(Y.y));
    X = X.mul(Y);
    X.x.length = n;
    X.y.length = n;
    return X.div(n);
}

//9. Unconstrained optimization
numeric.gradient = function gradient(f,x) {
    var n = x.length;
    var f0 = f(x);
    if(isNaN(f0)) throw new Error('gradient: f(x) is a NaN!');
    var max = Math.max;
    var i,x0 = numeric.clone(x),f1,f2, J = Array(n);
    var div = numeric.div, sub = numeric.sub,errest,roundoff,max = Math.max,eps = 1e-3,abs = Math.abs, min = Math.min;
    var t0,t1,t2,it=0,d1,d2,N;
    for(i=0;i<n;i++) {
        var h = max(1e-6*f0,1e-8);
        while(1) {
            ++it;
            if(it>20) { throw new Error("Numerical gradient fails"); }
            x0[i] = x[i]+h;
            f1 = f(x0);
            x0[i] = x[i]-h;
            f2 = f(x0);
            x0[i] = x[i];
            if(isNaN(f1) || isNaN(f2)) { h/=16; continue; }
            J[i] = (f1-f2)/(2*h);
            t0 = x[i]-h;
            t1 = x[i];
            t2 = x[i]+h;
            d1 = (f1-f0)/h;
            d2 = (f0-f2)/h;
            N = max(abs(J[i]),abs(f0),abs(f1),abs(f2),abs(t0),abs(t1),abs(t2),1e-8);
            errest = min(max(abs(d1-J[i]),abs(d2-J[i]),abs(d1-d2))/N,h/N);
            if(errest>eps) { h/=16; }
            else break;
            }
    }
    return J;
}

numeric.uncmin = function uncmin(f,x0,tol,gradient,maxit,callback,options) {
    var grad = numeric.gradient;
    if(typeof options === "undefined") { options = {}; }
    if(typeof tol === "undefined") { tol = 1e-8; }
    if(typeof gradient === "undefined") { gradient = function(x) { return grad(f,x); }; }
    if(typeof maxit === "undefined") maxit = 1000;
    x0 = numeric.clone(x0);
    var n = x0.length;
    var f0 = f(x0),f1,df0;
    if(isNaN(f0)) throw new Error('uncmin: f(x0) is a NaN!');
    var max = Math.max, norm2 = numeric.norm2;
    tol = max(tol,numeric.epsilon);
    var step,g0,g1,H1 = options.Hinv || numeric.identity(n);
    var dot = numeric.dot, inv = numeric.inv, sub = numeric.sub, add = numeric.add, ten = numeric.tensor, div = numeric.div, mul = numeric.mul;
    var all = numeric.all, isfinite = numeric.isFinite, neg = numeric.neg;
    var it=0,i,s,x1,y,Hy,Hs,ys,i0,t,nstep,t1,t2;
    var msg = "";
    g0 = gradient(x0);
    while(it<maxit) {
        if(typeof callback === "function") { if(callback(it,x0,f0,g0,H1)) { msg = "Callback returned true"; break; } }
        if(!all(isfinite(g0))) { msg = "Gradient has Infinity or NaN"; break; }
        step = neg(dot(H1,g0));
        if(!all(isfinite(step))) { msg = "Search direction has Infinity or NaN"; break; }
        nstep = norm2(step);
        if(nstep < tol) { msg="Newton step smaller than tol"; break; }
        t = 1;
        df0 = dot(g0,step);
        // line search
        x1 = x0;
        while(it < maxit) {
            if(t*nstep < tol) { break; }
            s = mul(step,t);
            x1 = add(x0,s);
            f1 = f(x1);
            if(f1-f0 >= 0.1*t*df0 || isNaN(f1)) {
                t *= 0.5;
                ++it;
                continue;
            }
            break;
        }
        if(t*nstep < tol) { msg = "Line search step size smaller than tol"; break; }
        if(it === maxit) { msg = "maxit reached during line search"; break; }
        g1 = gradient(x1);
        y = sub(g1,g0);
        ys = dot(y,s);
        Hy = dot(H1,y);
        H1 = sub(add(H1,
                mul(
                        (ys+dot(y,Hy))/(ys*ys),
                        ten(s,s)    )),
                div(add(ten(Hy,s),ten(s,Hy)),ys));
        x0 = x1;
        f0 = f1;
        g0 = g1;
        ++it;
    }
    return {solution: x0, f: f0, gradient: g0, invHessian: H1, iterations:it, message: msg};
}

// 10. Ode solver (Dormand-Prince)
numeric.Dopri = function Dopri(x,y,f,ymid,iterations,msg,events) {
    this.x = x;
    this.y = y;
    this.f = f;
    this.ymid = ymid;
    this.iterations = iterations;
    this.events = events;
    this.message = msg;
}
numeric.Dopri.prototype._at = function _at(xi,j) {
    function sqr(x) { return x*x; }
    var sol = this;
    var xs = sol.x;
    var ys = sol.y;
    var k1 = sol.f;
    var ymid = sol.ymid;
    var n = xs.length;
    var x0,x1,xh,y0,y1,yh,xi;
    var floor = Math.floor,h;
    var c = 0.5;
    var add = numeric.add, mul = numeric.mul,sub = numeric.sub, p,q,w;
    x0 = xs[j];
    x1 = xs[j+1];
    y0 = ys[j];
    y1 = ys[j+1];
    h  = x1-x0;
    xh = x0+c*h;
    yh = ymid[j];
    p = sub(k1[j  ],mul(y0,1/(x0-xh)+2/(x0-x1)));
    q = sub(k1[j+1],mul(y1,1/(x1-xh)+2/(x1-x0)));
    w = [sqr(xi - x1) * (xi - xh) / sqr(x0 - x1) / (x0 - xh),
         sqr(xi - x0) * sqr(xi - x1) / sqr(x0 - xh) / sqr(x1 - xh),
         sqr(xi - x0) * (xi - xh) / sqr(x1 - x0) / (x1 - xh),
         (xi - x0) * sqr(xi - x1) * (xi - xh) / sqr(x0-x1) / (x0 - xh),
         (xi - x1) * sqr(xi - x0) * (xi - xh) / sqr(x0-x1) / (x1 - xh)];
    return add(add(add(add(mul(y0,w[0]),
                           mul(yh,w[1])),
                           mul(y1,w[2])),
                           mul( p,w[3])),
                           mul( q,w[4]));
}
numeric.Dopri.prototype.at = function at(x) {
    var i,j,k,floor = Math.floor;
    if(typeof x !== "number") {
        var n = x.length, ret = Array(n);
        for(i=n-1;i!==-1;--i) {
            ret[i] = this.at(x[i]);
        }
        return ret;
    }
    var x0 = this.x;
    i = 0; j = x0.length-1;
    while(j-i>1) {
        k = floor(0.5*(i+j));
        if(x0[k] <= x) i = k;
        else j = k;
    }
    return this._at(x,i);
}

numeric.dopri = function dopri(x0,x1,y0,f,tol,maxit,event) {
    if(typeof tol === "undefined") { tol = 1e-6; }
    if(typeof maxit === "undefined") { maxit = 1000; }
    var xs = [x0], ys = [y0], k1 = [f(x0,y0)], k2,k3,k4,k5,k6,k7, ymid = [];
    var A2 = 1/5;
    var A3 = [3/40,9/40];
    var A4 = [44/45,-56/15,32/9];
    var A5 = [19372/6561,-25360/2187,64448/6561,-212/729];
    var A6 = [9017/3168,-355/33,46732/5247,49/176,-5103/18656];
    var b = [35/384,0,500/1113,125/192,-2187/6784,11/84];
    var bm = [0.5*6025192743/30085553152,
              0,
              0.5*51252292925/65400821598,
              0.5*-2691868925/45128329728,
              0.5*187940372067/1594534317056,
              0.5*-1776094331/19743644256,
              0.5*11237099/235043384];
    var c = [1/5,3/10,4/5,8/9,1,1];
    var e = [-71/57600,0,71/16695,-71/1920,17253/339200,-22/525,1/40];
    var i = 0,er,j;
    var h = (x1-x0)/10;
    var it = 0;
    var add = numeric.add, mul = numeric.mul, y1,erinf;
    var max = Math.max, min = Math.min, abs = Math.abs, norminf = numeric.norminf,pow = Math.pow;
    var any = numeric.any, lt = numeric.lt, and = numeric.and, sub = numeric.sub;
    var e0, e1, ev;
    var ret = new numeric.Dopri(xs,ys,k1,ymid,-1,"");
    if(typeof event === "function") e0 = event(x0,y0);
    while(x0<x1 && it<maxit) {
        ++it;
        if(x0+h>x1) h = x1-x0;
        k2 = f(x0+c[0]*h,                add(y0,mul(   A2*h,k1[i])));
        k3 = f(x0+c[1]*h,            add(add(y0,mul(A3[0]*h,k1[i])),mul(A3[1]*h,k2)));
        k4 = f(x0+c[2]*h,        add(add(add(y0,mul(A4[0]*h,k1[i])),mul(A4[1]*h,k2)),mul(A4[2]*h,k3)));
        k5 = f(x0+c[3]*h,    add(add(add(add(y0,mul(A5[0]*h,k1[i])),mul(A5[1]*h,k2)),mul(A5[2]*h,k3)),mul(A5[3]*h,k4)));
        k6 = f(x0+c[4]*h,add(add(add(add(add(y0,mul(A6[0]*h,k1[i])),mul(A6[1]*h,k2)),mul(A6[2]*h,k3)),mul(A6[3]*h,k4)),mul(A6[4]*h,k5)));
        y1 = add(add(add(add(add(y0,mul(k1[i],h*b[0])),mul(k3,h*b[2])),mul(k4,h*b[3])),mul(k5,h*b[4])),mul(k6,h*b[5]));
        k7 = f(x0+h,y1);
        er = add(add(add(add(add(mul(k1[i],h*e[0]),mul(k3,h*e[2])),mul(k4,h*e[3])),mul(k5,h*e[4])),mul(k6,h*e[5])),mul(k7,h*e[6]));
        if(typeof er === "number") erinf = abs(er);
        else erinf = norminf(er);
        if(erinf > tol) { // reject
            h = 0.2*h*pow(tol/erinf,0.25);
            if(x0+h === x0) {
                ret.msg = "Step size became too small";
                break;
            }
            continue;
        }
        ymid[i] = add(add(add(add(add(add(y0,
                mul(k1[i],h*bm[0])),
                mul(k3   ,h*bm[2])),
                mul(k4   ,h*bm[3])),
                mul(k5   ,h*bm[4])),
                mul(k6   ,h*bm[5])),
                mul(k7   ,h*bm[6]));
        ++i;
        xs[i] = x0+h;
        ys[i] = y1;
        k1[i] = k7;
        if(typeof event === "function") {
            var yi,xl = x0,xr = x0+0.5*h,xi;
            e1 = event(xr,ymid[i-1]);
            ev = and(lt(e0,0),lt(0,e1));
            if(!any(ev)) { xl = xr; xr = x0+h; e0 = e1; e1 = event(xr,y1); ev = and(lt(e0,0),lt(0,e1)); }
            if(any(ev)) {
                var xc, yc, en,ei;
                var side=0, sl = 1.0, sr = 1.0;
                while(1) {
                    if(typeof e0 === "number") xi = (sr*e1*xl-sl*e0*xr)/(sr*e1-sl*e0);
                    else {
                        xi = xr;
                        for(j=e0.length-1;j!==-1;--j) {
                            if(e0[j]<0 && e1[j]>0) xi = min(xi,(sr*e1[j]*xl-sl*e0[j]*xr)/(sr*e1[j]-sl*e0[j]));
                        }
                    }
                    if(xi <= xl || xi >= xr) break;
                    yi = ret._at(xi, i-1);
                    ei = event(xi,yi);
                    en = and(lt(e0,0),lt(0,ei));
                    if(any(en)) {
                        xr = xi;
                        e1 = ei;
                        ev = en;
                        sr = 1.0;
                        if(side === -1) sl *= 0.5;
                        else sl = 1.0;
                        side = -1;
                    } else {
                        xl = xi;
                        e0 = ei;
                        sl = 1.0;
                        if(side === 1) sr *= 0.5;
                        else sr = 1.0;
                        side = 1;
                    }
                }
                y1 = ret._at(0.5*(x0+xi),i-1);
                ret.f[i] = f(xi,yi);
                ret.x[i] = xi;
                ret.y[i] = yi;
                ret.ymid[i-1] = y1;
                ret.events = ev;
                ret.iterations = it;
                return ret;
            }
        }
        x0 += h;
        y0 = y1;
        e0 = e1;
        h = min(0.8*h*pow(tol/erinf,0.25),4*h);
    }
    ret.iterations = it;
    return ret;
}

// 11. Ax = b
numeric.LU = function(A, fast) {
  fast = fast || false;

  var abs = Math.abs;
  var i, j, k, absAjk, Akk, Ak, Pk, Ai;
  var max;
  var n = A.length, n1 = n-1;
  var P = new Array(n);
  if(!fast) A = numeric.clone(A);

  for (k = 0; k < n; ++k) {
    Pk = k;
    Ak = A[k];
    max = abs(Ak[k]);
    for (j = k + 1; j < n; ++j) {
      absAjk = abs(A[j][k]);
      if (max < absAjk) {
        max = absAjk;
        Pk = j;
      }
    }
    P[k] = Pk;

    if (Pk != k) {
      A[k] = A[Pk];
      A[Pk] = Ak;
      Ak = A[k];
    }

    Akk = Ak[k];

    for (i = k + 1; i < n; ++i) {
      A[i][k] /= Akk;
    }

    for (i = k + 1; i < n; ++i) {
      Ai = A[i];
      for (j = k + 1; j < n1; ++j) {
        Ai[j] -= Ai[k] * Ak[j];
        ++j;
        Ai[j] -= Ai[k] * Ak[j];
      }
      if(j===n1) Ai[j] -= Ai[k] * Ak[j];
    }
  }

  return {
    LU: A,
    P:  P
  };
}

numeric.LUsolve = function LUsolve(LUP, b) {
  var i, j;
  var LU = LUP.LU;
  var n   = LU.length;
  var x = numeric.clone(b);
  var P   = LUP.P;
  var Pi, LUi, LUii, tmp;

  for (i=n-1;i!==-1;--i) x[i] = b[i];
  for (i = 0; i < n; ++i) {
    Pi = P[i];
    if (P[i] !== i) {
      tmp = x[i];
      x[i] = x[Pi];
      x[Pi] = tmp;
    }

    LUi = LU[i];
    for (j = 0; j < i; ++j) {
      x[i] -= x[j] * LUi[j];
    }
  }

  for (i = n - 1; i >= 0; --i) {
    LUi = LU[i];
    for (j = i + 1; j < n; ++j) {
      x[i] -= x[j] * LUi[j];
    }

    x[i] /= LUi[i];
  }

  return x;
}

numeric.solve = function solve(A,b,fast) { return numeric.LUsolve(numeric.LU(A,fast), b); }

// 12. Linear programming
numeric.echelonize = function echelonize(A) {
    var s = numeric.dim(A), m = s[0], n = s[1];
    var I = numeric.identity(m);
    var P = Array(m);
    var i,j,k,l,Ai,Ii,Z,a;
    var abs = Math.abs;
    var diveq = numeric.diveq;
    A = numeric.clone(A);
    for(i=0;i<m;++i) {
        k = 0;
        Ai = A[i];
        Ii = I[i];
        for(j=1;j<n;++j) if(abs(Ai[k])<abs(Ai[j])) k=j;
        P[i] = k;
        diveq(Ii,Ai[k]);
        diveq(Ai,Ai[k]);
        for(j=0;j<m;++j) if(j!==i) {
            Z = A[j]; a = Z[k];
            for(l=n-1;l!==-1;--l) Z[l] -= Ai[l]*a;
            Z = I[j];
            for(l=m-1;l!==-1;--l) Z[l] -= Ii[l]*a;
        }
    }
    return {I:I, A:A, P:P};
}

numeric.__solveLP = function __solveLP(c,A,b,tol,maxit,x,flag) {
    var sum = numeric.sum, log = numeric.log, mul = numeric.mul, sub = numeric.sub, dot = numeric.dot, div = numeric.div, add = numeric.add;
    var m = c.length, n = b.length,y;
    var unbounded = false, cb,i0=0;
    var alpha = 1.0;
    var f0,df0,AT = numeric.transpose(A), svd = numeric.svd,transpose = numeric.transpose,leq = numeric.leq, sqrt = Math.sqrt, abs = Math.abs;
    var muleq = numeric.muleq;
    var norm = numeric.norminf, any = numeric.any,min = Math.min;
    var all = numeric.all, gt = numeric.gt;
    var p = Array(m), A0 = Array(n),e=numeric.rep([n],1), H;
    var solve = numeric.solve, z = sub(b,dot(A,x)),count;
    var dotcc = dot(c,c);
    var g;
    for(count=i0;count<maxit;++count) {
        var i,j,d;
        for(i=n-1;i!==-1;--i) A0[i] = div(A[i],z[i]);
        var A1 = transpose(A0);
        for(i=m-1;i!==-1;--i) p[i] = (/*x[i]+*/sum(A1[i]));
        alpha = 0.25*abs(dotcc/dot(c,p));
        var a1 = 100*sqrt(dotcc/dot(p,p));
        if(!isFinite(alpha) || alpha>a1) alpha = a1;
        g = add(c,mul(alpha,p));
        H = dot(A1,A0);
        for(i=m-1;i!==-1;--i) H[i][i] += 1;
        d = solve(H,div(g,alpha),true);
        var t0 = div(z,dot(A,d));
        var t = 1.0;
        for(i=n-1;i!==-1;--i) if(t0[i]<0) t = min(t,-0.999*t0[i]);
        y = sub(x,mul(d,t));
        z = sub(b,dot(A,y));
        if(!all(gt(z,0))) return { solution: x, message: "", iterations: count };
        x = y;
        if(alpha<tol) return { solution: y, message: "", iterations: count };
        if(flag) {
            var s = dot(c,g), Ag = dot(A,g);
            unbounded = true;
            for(i=n-1;i!==-1;--i) if(s*Ag[i]<0) { unbounded = false; break; }
        } else {
            if(x[m-1]>=0) unbounded = false;
            else unbounded = true;
        }
        if(unbounded) return { solution: y, message: "Unbounded", iterations: count };
    }
    return { solution: x, message: "maximum iteration count exceeded", iterations:count };
}

numeric._solveLP = function _solveLP(c,A,b,tol,maxit) {
    var m = c.length, n = b.length,y;
    var sum = numeric.sum, log = numeric.log, mul = numeric.mul, sub = numeric.sub, dot = numeric.dot, div = numeric.div, add = numeric.add;
    var c0 = numeric.rep([m],0).concat([1]);
    var J = numeric.rep([n,1],-1);
    var A0 = numeric.blockMatrix([[A                   ,   J  ]]);
    var b0 = b;
    var y = numeric.rep([m],0).concat(Math.max(0,numeric.sup(numeric.neg(b)))+1);
    var x0 = numeric.__solveLP(c0,A0,b0,tol,maxit,y,false);
    var x = numeric.clone(x0.solution);
    x.length = m;
    var foo = numeric.inf(sub(b,dot(A,x)));
    if(foo<0) { return { solution: NaN, message: "Infeasible", iterations: x0.iterations }; }
    var ret = numeric.__solveLP(c, A, b, tol, maxit-x0.iterations, x, true);
    ret.iterations += x0.iterations;
    return ret;
};

numeric.solveLP = function solveLP(c,A,b,Aeq,beq,tol,maxit) {
    if(typeof maxit === "undefined") maxit = 1000;
    if(typeof tol === "undefined") tol = numeric.epsilon;
    if(typeof Aeq === "undefined") return numeric._solveLP(c,A,b,tol,maxit);
    var m = Aeq.length, n = Aeq[0].length, o = A.length;
    var B = numeric.echelonize(Aeq);
    var flags = numeric.rep([n],0);
    var P = B.P;
    var Q = [];
    var i;
    for(i=P.length-1;i!==-1;--i) flags[P[i]] = 1;
    for(i=n-1;i!==-1;--i) if(flags[i]===0) Q.push(i);
    var g = numeric.getRange;
    var I = numeric.linspace(0,m-1), J = numeric.linspace(0,o-1);
    var Aeq2 = g(Aeq,I,Q), A1 = g(A,J,P), A2 = g(A,J,Q), dot = numeric.dot, sub = numeric.sub;
    var A3 = dot(A1,B.I);
    var A4 = sub(A2,dot(A3,Aeq2)), b4 = sub(b,dot(A3,beq));
    var c1 = Array(P.length), c2 = Array(Q.length);
    for(i=P.length-1;i!==-1;--i) c1[i] = c[P[i]];
    for(i=Q.length-1;i!==-1;--i) c2[i] = c[Q[i]];
    var c4 = sub(c2,dot(c1,dot(B.I,Aeq2)));
    var S = numeric._solveLP(c4,A4,b4,tol,maxit);
    var x2 = S.solution;
    if(x2!==x2) return S;
    var x1 = dot(B.I,sub(beq,dot(Aeq2,x2)));
    var x = Array(c.length);
    for(i=P.length-1;i!==-1;--i) x[P[i]] = x1[i];
    for(i=Q.length-1;i!==-1;--i) x[Q[i]] = x2[i];
    return { solution: x, message:S.message, iterations: S.iterations };
}

numeric.MPStoLP = function MPStoLP(MPS) {
    if(MPS instanceof String) { MPS.split('\n'); }
    var state = 0;
    var states = ['Initial state','NAME','ROWS','COLUMNS','RHS','BOUNDS','ENDATA'];
    var n = MPS.length;
    var i,j,z,N=0,rows = {}, sign = [], rl = 0, vars = {}, nv = 0;
    var name;
    var c = [], A = [], b = [];
    function err(e) { throw new Error('MPStoLP: '+e+'\nLine '+i+': '+MPS[i]+'\nCurrent state: '+states[state]+'\n'); }
    for(i=0;i<n;++i) {
        z = MPS[i];
        var w0 = z.match(/\S*/g);
        var w = [];
        for(j=0;j<w0.length;++j) if(w0[j]!=="") w.push(w0[j]);
        if(w.length === 0) continue;
        for(j=0;j<states.length;++j) if(z.substr(0,states[j].length) === states[j]) break;
        if(j<states.length) {
            state = j;
            if(j===1) { name = w[1]; }
            if(j===6) return { name:name, c:c, A:numeric.transpose(A), b:b, rows:rows, vars:vars };
            continue;
        }
        switch(state) {
        case 0: case 1: err('Unexpected line');
        case 2:
            switch(w[0]) {
            case 'N': if(N===0) N = w[1]; else err('Two or more N rows'); break;
            case 'L': rows[w[1]] = rl; sign[rl] = 1; b[rl] = 0; ++rl; break;
            case 'G': rows[w[1]] = rl; sign[rl] = -1;b[rl] = 0; ++rl; break;
            case 'E': rows[w[1]] = rl; sign[rl] = 0;b[rl] = 0; ++rl; break;
            default: err('Parse error '+numeric.prettyPrint(w));
            }
            break;
        case 3:
            if(!vars.hasOwnProperty(w[0])) { vars[w[0]] = nv; c[nv] = 0; A[nv] = numeric.rep([rl],0); ++nv; }
            var p = vars[w[0]];
            for(j=1;j<w.length;j+=2) {
                if(w[j] === N) { c[p] = parseFloat(w[j+1]); continue; }
                var q = rows[w[j]];
                A[p][q] = (sign[q]<0?-1:1)*parseFloat(w[j+1]);
            }
            break;
        case 4:
            for(j=1;j<w.length;j+=2) b[rows[w[j]]] = (sign[rows[w[j]]]<0?-1:1)*parseFloat(w[j+1]);
            break;
        case 5: /*FIXME*/ break;
        case 6: err('Internal error');
        }
    }
    err('Reached end of file without ENDATA');
}
// seedrandom.js version 2.0.
// Author: David Bau 4/2/2011
//
// Defines a method Math.seedrandom() that, when called, substitutes
// an explicitly seeded RC4-based algorithm for Math.random().  Also
// supports automatic seeding from local or network sources of entropy.
//
// Usage:
//
//   <script src=http://davidbau.com/encode/seedrandom-min.js></script>
//
//   Math.seedrandom('yipee'); Sets Math.random to a function that is
//                             initialized using the given explicit seed.
//
//   Math.seedrandom();        Sets Math.random to a function that is
//                             seeded using the current time, dom state,
//                             and other accumulated local entropy.
//                             The generated seed string is returned.
//
//   Math.seedrandom('yowza', true);
//                             Seeds using the given explicit seed mixed
//                             together with accumulated entropy.
//
//   <script src="http://bit.ly/srandom-512"></script>
//                             Seeds using physical random bits downloaded
//                             from random.org.
//
//   <script src="https://jsonlib.appspot.com/urandom?callback=Math.seedrandom">
//   </script>                 Seeds using urandom bits from call.jsonlib.com,
//                             which is faster than random.org.
//
// Examples:
//
//   Math.seedrandom("hello");            // Use "hello" as the seed.
//   document.write(Math.random());       // Always 0.5463663768140734
//   document.write(Math.random());       // Always 0.43973793770592234
//   var rng1 = Math.random;              // Remember the current prng.
//
//   var autoseed = Math.seedrandom();    // New prng with an automatic seed.
//   document.write(Math.random());       // Pretty much unpredictable.
//
//   Math.random = rng1;                  // Continue "hello" prng sequence.
//   document.write(Math.random());       // Always 0.554769432473455
//
//   Math.seedrandom(autoseed);           // Restart at the previous seed.
//   document.write(Math.random());       // Repeat the 'unpredictable' value.
//
// Notes:
//
// Each time seedrandom('arg') is called, entropy from the passed seed
// is accumulated in a pool to help generate future seeds for the
// zero-argument form of Math.seedrandom, so entropy can be injected over
// time by calling seedrandom with explicit data repeatedly.
//
// On speed - This javascript implementation of Math.random() is about
// 3-10x slower than the built-in Math.random() because it is not native
// code, but this is typically fast enough anyway.  Seeding is more expensive,
// especially if you use auto-seeding.  Some details (timings on Chrome 4):
//
// Our Math.random()            - avg less than 0.002 milliseconds per call
// seedrandom('explicit')       - avg less than 0.5 milliseconds per call
// seedrandom('explicit', true) - avg less than 2 milliseconds per call
// seedrandom()                 - avg about 38 milliseconds per call
//
// LICENSE (BSD):
//
// Copyright 2010 David Bau, all rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//   1. Redistributions of source code must retain the above copyright
//      notice, this list of conditions and the following disclaimer.
//
//   2. Redistributions in binary form must reproduce the above copyright
//      notice, this list of conditions and the following disclaimer in the
//      documentation and/or other materials provided with the distribution.
//
//   3. Neither the name of this module nor the names of its contributors may
//      be used to endorse or promote products derived from this software
//      without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
/**
 * All code is in an anonymous closure to keep the global namespace clean.
 *
 * @param {number=} overflow
 * @param {number=} startdenom
 */

// Patched by Seb so that seedrandom.js does not pollute the Math object.
// My tests suggest that doing Math.trouble = 1 makes Math lookups about 5%
// slower.
numeric.seedrandom = { pow:Math.pow, random:Math.random };

(function (pool, math, width, chunks, significance, overflow, startdenom) {


//
// seedrandom()
// This is the seedrandom function described above.
//
math['seedrandom'] = function seedrandom(seed, use_entropy) {
  var key = [];
  var arc4;

  // Flatten the seed string or build one from local entropy if needed.
  seed = mixkey(flatten(
    use_entropy ? [seed, pool] :
    arguments.length ? seed :
    [new Date().getTime(), pool, window], 3), key);

  // Use the seed to initialize an ARC4 generator.
  arc4 = new ARC4(key);

  // Mix the randomness into accumulated entropy.
  mixkey(arc4.S, pool);

  // Override Math.random

  // This function returns a random double in [0, 1) that contains
  // randomness in every bit of the mantissa of the IEEE 754 value.

  math['random'] = function random() {  // Closure to return a random double:
    var n = arc4.g(chunks);             // Start with a numerator n < 2 ^ 48
    var d = startdenom;                 //   and denominator d = 2 ^ 48.
    var x = 0;                          //   and no 'extra last byte'.
    while (n < significance) {          // Fill up all significant digits by
      n = (n + x) * width;              //   shifting numerator and
      d *= width;                       //   denominator and generating a
      x = arc4.g(1);                    //   new least-significant-byte.
    }
    while (n >= overflow) {             // To avoid rounding up, before adding
      n /= 2;                           //   last byte, shift everything
      d /= 2;                           //   right using integer math until
      x >>>= 1;                         //   we have exactly the desired bits.
    }
    return (n + x) / d;                 // Form the number within [0, 1).
  };

  // Return the seed that was used
  return seed;
};

//
// ARC4
//
// An ARC4 implementation.  The constructor takes a key in the form of
// an array of at most (width) integers that should be 0 <= x < (width).
//
// The g(count) method returns a pseudorandom integer that concatenates
// the next (count) outputs from ARC4.  Its return value is a number x
// that is in the range 0 <= x < (width ^ count).
//
/** @constructor */
function ARC4(key) {
  var t, u, me = this, keylen = key.length;
  var i = 0, j = me.i = me.j = me.m = 0;
  me.S = [];
  me.c = [];

  // The empty key [] is treated as [0].
  if (!keylen) { key = [keylen++]; }

  // Set up S using the standard key scheduling algorithm.
  while (i < width) { me.S[i] = i++; }
  for (i = 0; i < width; i++) {
    t = me.S[i];
    j = lowbits(j + t + key[i % keylen]);
    u = me.S[j];
    me.S[i] = u;
    me.S[j] = t;
  }

  // The "g" method returns the next (count) outputs as one number.
  me.g = function getnext(count) {
    var s = me.S;
    var i = lowbits(me.i + 1); var t = s[i];
    var j = lowbits(me.j + t); var u = s[j];
    s[i] = u;
    s[j] = t;
    var r = s[lowbits(t + u)];
    while (--count) {
      i = lowbits(i + 1); t = s[i];
      j = lowbits(j + t); u = s[j];
      s[i] = u;
      s[j] = t;
      r = r * width + s[lowbits(t + u)];
    }
    me.i = i;
    me.j = j;
    return r;
  };
  // For robust unpredictability discard an initial batch of values.
  // See http://www.rsa.com/rsalabs/node.asp?id=2009
  me.g(width);
}

//
// flatten()
// Converts an object tree to nested arrays of strings.
//
/** @param {Object=} result
  * @param {string=} prop
  * @param {string=} typ */
function flatten(obj, depth, result, prop, typ) {
  result = [];
  typ = typeof(obj);
  if (depth && typ == 'object') {
    for (prop in obj) {
      if (prop.indexOf('S') < 5) {    // Avoid FF3 bug (local/sessionStorage)
        try { result.push(flatten(obj[prop], depth - 1)); } catch (e) {}
      }
    }
  }
  return (result.length ? result : obj + (typ != 'string' ? '\0' : ''));
}

//
// mixkey()
// Mixes a string seed into a key that is an array of integers, and
// returns a shortened string seed that is equivalent to the result key.
//
/** @param {number=} smear
  * @param {number=} j */
function mixkey(seed, key, smear, j) {
  seed += '';                         // Ensure the seed is a string
  smear = 0;
  for (j = 0; j < seed.length; j++) {
    key[lowbits(j)] =
      lowbits((smear ^= key[lowbits(j)] * 19) + seed.charCodeAt(j));
  }
  seed = '';
  for (j in key) { seed += String.fromCharCode(key[j]); }
  return seed;
}

//
// lowbits()
// A quick "n mod width" for width a power of 2.
//
function lowbits(n) { return n & (width - 1); }

//
// The following constants are related to IEEE 754 limits.
//
startdenom = math.pow(width, chunks);
significance = math.pow(2, significance);
overflow = significance * 2;

//
// When seedrandom.js is loaded, we immediately mix a few bits
// from the built-in RNG into the entropy pool.  Because we do
// not want to intefere with determinstic PRNG state later,
// seedrandom will not call math.random on its own again after
// initialization.
//
mixkey(math.random(), pool);

// End anonymous scope, and pass initial values.
}(
  [],   // pool: entropy pool starts empty
  numeric.seedrandom, // math: package containing random, pow, and seedrandom
  256,  // width: each RC4 output is 0 <= x < 256
  6,    // chunks: at least six RC4 outputs for each double
  52    // significance: there are 52 significant digits in a double
  ));
/* This file is a slightly modified version of quadprog.js from Alberto Santini.
 * It has been slightly modified by SÃ©bastien Loisel to make sure that it handles
 * 0-based Arrays instead of 1-based Arrays.
 * License is in resources/LICENSE.quadprog */
(function(exports) {

function base0to1(A) {
    if(typeof A !== "object") { return A; }
    var ret = [], i,n=A.length;
    for(i=0;i<n;i++) ret[i+1] = base0to1(A[i]);
    return ret;
}
function base1to0(A) {
    if(typeof A !== "object") { return A; }
    var ret = [], i,n=A.length;
    for(i=1;i<n;i++) ret[i-1] = base1to0(A[i]);
    return ret;
}

function dpori(a, lda, n) {
    var i, j, k, kp1, t;

    for (k = 1; k <= n; k = k + 1) {
        a[k][k] = 1 / a[k][k];
        t = -a[k][k];
        //~ dscal(k - 1, t, a[1][k], 1);
        for (i = 1; i < k; i = i + 1) {
            a[i][k] = t * a[i][k];
        }

        kp1 = k + 1;
        if (n < kp1) {
            break;
        }
        for (j = kp1; j <= n; j = j + 1) {
            t = a[k][j];
            a[k][j] = 0;
            //~ daxpy(k, t, a[1][k], 1, a[1][j], 1);
            for (i = 1; i <= k; i = i + 1) {
                a[i][j] = a[i][j] + (t * a[i][k]);
            }
        }
    }

}

function dposl(a, lda, n, b) {
    var i, k, kb, t;

    for (k = 1; k <= n; k = k + 1) {
        //~ t = ddot(k - 1, a[1][k], 1, b[1], 1);
        t = 0;
        for (i = 1; i < k; i = i + 1) {
            t = t + (a[i][k] * b[i]);
        }

        b[k] = (b[k] - t) / a[k][k];
    }

    for (kb = 1; kb <= n; kb = kb + 1) {
        k = n + 1 - kb;
        b[k] = b[k] / a[k][k];
        t = -b[k];
        //~ daxpy(k - 1, t, a[1][k], 1, b[1], 1);
        for (i = 1; i < k; i = i + 1) {
            b[i] = b[i] + (t * a[i][k]);
        }
    }
}

function dpofa(a, lda, n, info) {
    var i, j, jm1, k, t, s;

    for (j = 1; j <= n; j = j + 1) {
        info[1] = j;
        s = 0;
        jm1 = j - 1;
        if (jm1 < 1) {
            s = a[j][j] - s;
            if (s <= 0) {
                break;
            }
            a[j][j] = Math.sqrt(s);
        } else {
            for (k = 1; k <= jm1; k = k + 1) {
                //~ t = a[k][j] - ddot(k - 1, a[1][k], 1, a[1][j], 1);
                t = a[k][j];
                for (i = 1; i < k; i = i + 1) {
                    t = t - (a[i][j] * a[i][k]);
                }
                t = t / a[k][k];
                a[k][j] = t;
                s = s + t * t;
            }
            s = a[j][j] - s;
            if (s <= 0) {
                break;
            }
            a[j][j] = Math.sqrt(s);
        }
        info[1] = 0;
    }
}

function qpgen2(dmat, dvec, fddmat, n, sol, crval, amat,
    bvec, fdamat, q, meq, iact, nact, iter, work, ierr) {

    var i, j, l, l1, info, it1, iwzv, iwrv, iwrm, iwsv, iwuv, nvl, r, iwnbv,
        temp, sum, t1, tt, gc, gs, nu,
        t1inf, t2min,
        vsmall, tmpa, tmpb,
        go;

    r = Math.min(n, q);
    l = 2 * n + (r * (r + 5)) / 2 + 2 * q + 1;

    vsmall = 1.0e-60;
    do {
        vsmall = vsmall + vsmall;
        tmpa = 1 + 0.1 * vsmall;
        tmpb = 1 + 0.2 * vsmall;
    } while (tmpa <= 1 || tmpb <= 1);

    for (i = 1; i <= n; i = i + 1) {
        work[i] = dvec[i];
    }
    for (i = n + 1; i <= l; i = i + 1) {
        work[i] = 0;
    }
    for (i = 1; i <= q; i = i + 1) {
        iact[i] = 0;
    }

    info = [];

    if (ierr[1] === 0) {
        dpofa(dmat, fddmat, n, info);
        if (info[1] !== 0) {
            ierr[1] = 2;
            return;
        }
        dposl(dmat, fddmat, n, dvec);
        dpori(dmat, fddmat, n);
    } else {
        for (j = 1; j <= n; j = j + 1) {
            sol[j] = 0;
            for (i = 1; i <= j; i = i + 1) {
                sol[j] = sol[j] + dmat[i][j] * dvec[i];
            }
        }
        for (j = 1; j <= n; j = j + 1) {
            dvec[j] = 0;
            for (i = j; i <= n; i = i + 1) {
                dvec[j] = dvec[j] + dmat[j][i] * sol[i];
            }
        }
    }

    crval[1] = 0;
    for (j = 1; j <= n; j = j + 1) {
        sol[j] = dvec[j];
        crval[1] = crval[1] + work[j] * sol[j];
        work[j] = 0;
        for (i = j + 1; i <= n; i = i + 1) {
            dmat[i][j] = 0;
        }
    }
    crval[1] = -crval[1] / 2;
    ierr[1] = 0;

    iwzv = n;
    iwrv = iwzv + n;
    iwuv = iwrv + r;
    iwrm = iwuv + r + 1;
    iwsv = iwrm + (r * (r + 1)) / 2;
    iwnbv = iwsv + q;

    for (i = 1; i <= q; i = i + 1) {
        sum = 0;
        for (j = 1; j <= n; j = j + 1) {
            sum = sum + amat[j][i] * amat[j][i];
        }
        work[iwnbv + i] = Math.sqrt(sum);
    }
    nact = 0;
    iter[1] = 0;
    iter[2] = 0;

    function fn_goto_50() {
        iter[1] = iter[1] + 1;

        l = iwsv;
        for (i = 1; i <= q; i = i + 1) {
            l = l + 1;
            sum = -bvec[i];
            for (j = 1; j <= n; j = j + 1) {
                sum = sum + amat[j][i] * sol[j];
            }
            if (Math.abs(sum) < vsmall) {
                sum = 0;
            }
            if (i > meq) {
                work[l] = sum;
            } else {
                work[l] = -Math.abs(sum);
                if (sum > 0) {
                    for (j = 1; j <= n; j = j + 1) {
                        amat[j][i] = -amat[j][i];
                    }
                    bvec[i] = -bvec[i];
                }
            }
        }

        for (i = 1; i <= nact; i = i + 1) {
            work[iwsv + iact[i]] = 0;
        }

        nvl = 0;
        temp = 0;
        for (i = 1; i <= q; i = i + 1) {
            if (work[iwsv + i] < temp * work[iwnbv + i]) {
                nvl = i;
                temp = work[iwsv + i] / work[iwnbv + i];
            }
        }
        if (nvl === 0) {
            return 999;
        }

        return 0;
    }

    function fn_goto_55() {
        for (i = 1; i <= n; i = i + 1) {
            sum = 0;
            for (j = 1; j <= n; j = j + 1) {
                sum = sum + dmat[j][i] * amat[j][nvl];
            }
            work[i] = sum;
        }

        l1 = iwzv;
        for (i = 1; i <= n; i = i + 1) {
            work[l1 + i] = 0;
        }
        for (j = nact + 1; j <= n; j = j + 1) {
            for (i = 1; i <= n; i = i + 1) {
                work[l1 + i] = work[l1 + i] + dmat[i][j] * work[j];
            }
        }

        t1inf = true;
        for (i = nact; i >= 1; i = i - 1) {
            sum = work[i];
            l = iwrm + (i * (i + 3)) / 2;
            l1 = l - i;
            for (j = i + 1; j <= nact; j = j + 1) {
                sum = sum - work[l] * work[iwrv + j];
                l = l + j;
            }
            sum = sum / work[l1];
            work[iwrv + i] = sum;
            if (iact[i] < meq) {
                // continue;
                break;
            }
            if (sum < 0) {
                // continue;
                break;
            }
            t1inf = false;
            it1 = i;
        }

        if (!t1inf) {
            t1 = work[iwuv + it1] / work[iwrv + it1];
            for (i = 1; i <= nact; i = i + 1) {
                if (iact[i] < meq) {
                    // continue;
                    break;
                }
                if (work[iwrv + i] < 0) {
                    // continue;
                    break;
                }
                temp = work[iwuv + i] / work[iwrv + i];
                if (temp < t1) {
                    t1 = temp;
                    it1 = i;
                }
            }
        }

        sum = 0;
        for (i = iwzv + 1; i <= iwzv + n; i = i + 1) {
            sum = sum + work[i] * work[i];
        }
        if (Math.abs(sum) <= vsmall) {
            if (t1inf) {
                ierr[1] = 1;
                // GOTO 999
                return 999;
            } else {
                for (i = 1; i <= nact; i = i + 1) {
                    work[iwuv + i] = work[iwuv + i] - t1 * work[iwrv + i];
                }
                work[iwuv + nact + 1] = work[iwuv + nact + 1] + t1;
                // GOTO 700
                return 700;
            }
        } else {
            sum = 0;
            for (i = 1; i <= n; i = i + 1) {
                sum = sum + work[iwzv + i] * amat[i][nvl];
            }
            tt = -work[iwsv + nvl] / sum;
            t2min = true;
            if (!t1inf) {
                if (t1 < tt) {
                    tt = t1;
                    t2min = false;
                }
            }

            for (i = 1; i <= n; i = i + 1) {
                sol[i] = sol[i] + tt * work[iwzv + i];
                if (Math.abs(sol[i]) < vsmall) {
                    sol[i] = 0;
                }
            }

            crval[1] = crval[1] + tt * sum * (tt / 2 + work[iwuv + nact + 1]);
            for (i = 1; i <= nact; i = i + 1) {
                work[iwuv + i] = work[iwuv + i] - tt * work[iwrv + i];
            }
            work[iwuv + nact + 1] = work[iwuv + nact + 1] + tt;

            if (t2min) {
                nact = nact + 1;
                iact[nact] = nvl;

                l = iwrm + ((nact - 1) * nact) / 2 + 1;
                for (i = 1; i <= nact - 1; i = i + 1) {
                    work[l] = work[i];
                    l = l + 1;
                }

                if (nact === n) {
                    work[l] = work[n];
                } else {
                    for (i = n; i >= nact + 1; i = i - 1) {
                        if (work[i] === 0) {
                            // continue;
                            break;
                        }
                        gc = Math.max(Math.abs(work[i - 1]), Math.abs(work[i]));
                        gs = Math.min(Math.abs(work[i - 1]), Math.abs(work[i]));
                        if (work[i - 1] >= 0) {
                            temp = Math.abs(gc * Math.sqrt(1 + gs * gs / (gc * gc)));
                        } else {
                            temp = -Math.abs(gc * Math.sqrt(1 + gs * gs / (gc * gc)));
                        }
                        gc = work[i - 1] / temp;
                        gs = work[i] / temp;

                        if (gc === 1) {
                            // continue;
                            break;
                        }
                        if (gc === 0) {
                            work[i - 1] = gs * temp;
                            for (j = 1; j <= n; j = j + 1) {
                                temp = dmat[j][i - 1];
                                dmat[j][i - 1] = dmat[j][i];
                                dmat[j][i] = temp;
                            }
                        } else {
                            work[i - 1] = temp;
                            nu = gs / (1 + gc);
                            for (j = 1; j <= n; j = j + 1) {
                                temp = gc * dmat[j][i - 1] + gs * dmat[j][i];
                                dmat[j][i] = nu * (dmat[j][i - 1] + temp) - dmat[j][i];
                                dmat[j][i - 1] = temp;

                            }
                        }
                    }
                    work[l] = work[nact];
                }
            } else {
                sum = -bvec[nvl];
                for (j = 1; j <= n; j = j + 1) {
                    sum = sum + sol[j] * amat[j][nvl];
                }
                if (nvl > meq) {
                    work[iwsv + nvl] = sum;
                } else {
                    work[iwsv + nvl] = -Math.abs(sum);
                    if (sum > 0) {
                        for (j = 1; j <= n; j = j + 1) {
                            amat[j][nvl] = -amat[j][nvl];
                        }
                        bvec[nvl] = -bvec[nvl];
                    }
                }
                // GOTO 700
                return 700;
            }
        }

        return 0;
    }

    function fn_goto_797() {
        l = iwrm + (it1 * (it1 + 1)) / 2 + 1;
        l1 = l + it1;
        if (work[l1] === 0) {
            // GOTO 798
            return 798;
        }
        gc = Math.max(Math.abs(work[l1 - 1]), Math.abs(work[l1]));
        gs = Math.min(Math.abs(work[l1 - 1]), Math.abs(work[l1]));
        if (work[l1 - 1] >= 0) {
            temp = Math.abs(gc * Math.sqrt(1 + gs * gs / (gc * gc)));
        } else {
            temp = -Math.abs(gc * Math.sqrt(1 + gs * gs / (gc * gc)));
        }
        gc = work[l1 - 1] / temp;
        gs = work[l1] / temp;

        if (gc === 1) {
            // GOTO 798
            return 798;
        }
        if (gc === 0) {
            for (i = it1 + 1; i <= nact; i = i + 1) {
                temp = work[l1 - 1];
                work[l1 - 1] = work[l1];
                work[l1] = temp;
                l1 = l1 + i;
            }
            for (i = 1; i <= n; i = i + 1) {
                temp = dmat[i][it1];
                dmat[i][it1] = dmat[i][it1 + 1];
                dmat[i][it1 + 1] = temp;
            }
        } else {
            nu = gs / (1 + gc);
            for (i = it1 + 1; i <= nact; i = i + 1) {
                temp = gc * work[l1 - 1] + gs * work[l1];
                work[l1] = nu * (work[l1 - 1] + temp) - work[l1];
                work[l1 - 1] = temp;
                l1 = l1 + i;
            }
            for (i = 1; i <= n; i = i + 1) {
                temp = gc * dmat[i][it1] + gs * dmat[i][it1 + 1];
                dmat[i][it1 + 1] = nu * (dmat[i][it1] + temp) - dmat[i][it1 + 1];
                dmat[i][it1] = temp;
            }
        }

        return 0;
    }

    function fn_goto_798() {
        l1 = l - it1;
        for (i = 1; i <= it1; i = i + 1) {
            work[l1] = work[l];
            l = l + 1;
            l1 = l1 + 1;
        }

        work[iwuv + it1] = work[iwuv + it1 + 1];
        iact[it1] = iact[it1 + 1];
        it1 = it1 + 1;
        if (it1 < nact) {
            // GOTO 797
            return 797;
        }

        return 0;
    }

    function fn_goto_799() {
        work[iwuv + nact] = work[iwuv + nact + 1];
        work[iwuv + nact + 1] = 0;
        iact[nact] = 0;
        nact = nact - 1;
        iter[2] = iter[2] + 1;

        return 0;
    }

    go = 0;
    while (true) {
        go = fn_goto_50();
        if (go === 999) {
            return;
        }
        while (true) {
            go = fn_goto_55();
            if (go === 0) {
                break;
            }
            if (go === 999) {
                return;
            }
            if (go === 700) {
                if (it1 === nact) {
                    fn_goto_799();
                } else {
                    while (true) {
                        fn_goto_797();
                        go = fn_goto_798();
                        if (go !== 797) {
                            break;
                        }
                    }
                    fn_goto_799();
                }
            }
        }
    }

}

function solveQP(Dmat, dvec, Amat, bvec, meq, factorized) {
    Dmat = base0to1(Dmat);
    dvec = base0to1(dvec);
    Amat = base0to1(Amat);
    var i, n, q,
        nact, r,
        crval = [], iact = [], sol = [], work = [], iter = [],
        message;

    meq = meq || 0;
    factorized = factorized ? base0to1(factorized) : [undefined, 0];
    bvec = bvec ? base0to1(bvec) : [];

    // In Fortran the array index starts from 1
    n = Dmat.length - 1;
    q = Amat[1].length - 1;

    if (!bvec) {
        for (i = 1; i <= q; i = i + 1) {
            bvec[i] = 0;
        }
    }
    for (i = 1; i <= q; i = i + 1) {
        iact[i] = 0;
    }
    nact = 0;
    r = Math.min(n, q);
    for (i = 1; i <= n; i = i + 1) {
        sol[i] = 0;
    }
    crval[1] = 0;
    for (i = 1; i <= (2 * n + (r * (r + 5)) / 2 + 2 * q + 1); i = i + 1) {
        work[i] = 0;
    }
    for (i = 1; i <= 2; i = i + 1) {
        iter[i] = 0;
    }

    qpgen2(Dmat, dvec, n, n, sol, crval, Amat,
        bvec, n, q, meq, iact, nact, iter, work, factorized);

    message = "";
    if (factorized[1] === 1) {
        message = "constraints are inconsistent, no solution!";
    }
    if (factorized[1] === 2) {
        message = "matrix D in quadratic function is not positive definite!";
    }

    return {
        solution: base1to0(sol),
        value: base1to0(crval),
        unconstrained_solution: base1to0(dvec),
        iterations: base1to0(iter),
        iact: base1to0(iact),
        message: message
    };
}
exports.solveQP = solveQP;
}(numeric));
/*
Shanti Rao sent me this routine by private email. I had to modify it
slightly to work on Arrays instead of using a Matrix object.
It is apparently translated from http://stitchpanorama.sourceforge.net/Python/svd.py
*/

numeric.svd= function svd(A) {
    var temp;
//Compute the thin SVD from G. H. Golub and C. Reinsch, Numer. Math. 14, 403-420 (1970)
    var prec= numeric.epsilon; //Math.pow(2,-52) // assumes double prec
    var tolerance= 1.e-64/prec;
    var itmax= 50;
    var c=0;
    var i=0;
    var j=0;
    var k=0;
    var l=0;

    var u= numeric.clone(A);
    var m= u.length;

    var n= u[0].length;

    if (m < n) throw "Need more rows than columns"

    var e = new Array(n);
    var q = new Array(n);
    for (i=0; i<n; i++) e[i] = q[i] = 0.0;
    var v = numeric.rep([n,n],0);
//  v.zero();

    function pythag(a,b)
    {
        a = Math.abs(a)
        b = Math.abs(b)
        if (a > b)
            return a*Math.sqrt(1.0+(b*b/a/a))
        else if (b == 0.0)
            return a
        return b*Math.sqrt(1.0+(a*a/b/b))
    }

    //Householder's reduction to bidiagonal form

    var f= 0.0;
    var g= 0.0;
    var h= 0.0;
    var x= 0.0;
    var y= 0.0;
    var z= 0.0;
    var s= 0.0;

    for (i=0; i < n; i++)
    {
        e[i]= g;
        s= 0.0;
        l= i+1;
        for (j=i; j < m; j++)
            s += (u[j][i]*u[j][i]);
        if (s <= tolerance)
            g= 0.0;
        else
        {
            f= u[i][i];
            g= Math.sqrt(s);
            if (f >= 0.0) g= -g;
            h= f*g-s
            u[i][i]=f-g;
            for (j=l; j < n; j++)
            {
                s= 0.0
                for (k=i; k < m; k++)
                    s += u[k][i]*u[k][j]
                f= s/h
                for (k=i; k < m; k++)
                    u[k][j]+=f*u[k][i]
            }
        }
        q[i]= g
        s= 0.0
        for (j=l; j < n; j++)
            s= s + u[i][j]*u[i][j]
        if (s <= tolerance)
            g= 0.0
        else
        {
            f= u[i][i+1]
            g= Math.sqrt(s)
            if (f >= 0.0) g= -g
            h= f*g - s
            u[i][i+1] = f-g;
            for (j=l; j < n; j++) e[j]= u[i][j]/h
            for (j=l; j < m; j++)
            {
                s=0.0
                for (k=l; k < n; k++)
                    s += (u[j][k]*u[i][k])
                for (k=l; k < n; k++)
                    u[j][k]+=s*e[k]
            }
        }
        y= Math.abs(q[i])+Math.abs(e[i])
        if (y>x)
            x=y
    }

    // accumulation of right hand gtransformations
    for (i=n-1; i != -1; i+= -1)
    {
        if (g != 0.0)
        {
            h= g*u[i][i+1]
            for (j=l; j < n; j++)
                v[j][i]=u[i][j]/h
            for (j=l; j < n; j++)
            {
                s=0.0
                for (k=l; k < n; k++)
                    s += u[i][k]*v[k][j]
                for (k=l; k < n; k++)
                    v[k][j]+=(s*v[k][i])
            }
        }
        for (j=l; j < n; j++)
        {
            v[i][j] = 0;
            v[j][i] = 0;
        }
        v[i][i] = 1;
        g= e[i]
        l= i
    }

    // accumulation of left hand transformations
    for (i=n-1; i != -1; i+= -1)
    {
        l= i+1
        g= q[i]
        for (j=l; j < n; j++)
            u[i][j] = 0;
        if (g != 0.0)
        {
            h= u[i][i]*g
            for (j=l; j < n; j++)
            {
                s=0.0
                for (k=l; k < m; k++) s += u[k][i]*u[k][j];
                f= s/h
                for (k=i; k < m; k++) u[k][j]+=f*u[k][i];
            }
            for (j=i; j < m; j++) u[j][i] = u[j][i]/g;
        }
        else
            for (j=i; j < m; j++) u[j][i] = 0;
        u[i][i] += 1;
    }

    // diagonalization of the bidiagonal form
    prec= prec*x
    for (k=n-1; k != -1; k+= -1)
    {
        for (var iteration=0; iteration < itmax; iteration++)
        {   // test f splitting
            var test_convergence = false
            for (l=k; l != -1; l+= -1)
            {
                if (Math.abs(e[l]) <= prec)
                {   test_convergence= true
                    break
                }
                if (Math.abs(q[l-1]) <= prec)
                    break
            }
            if (!test_convergence)
            {   // cancellation of e[l] if l>0
                c= 0.0
                s= 1.0
                var l1= l-1
                for (i =l; i<k+1; i++)
                {
                    f= s*e[i]
                    e[i]= c*e[i]
                    if (Math.abs(f) <= prec)
                        break
                    g= q[i]
                    h= pythag(f,g)
                    q[i]= h
                    c= g/h
                    s= -f/h
                    for (j=0; j < m; j++)
                    {
                        y= u[j][l1]
                        z= u[j][i]
                        u[j][l1] =  y*c+(z*s)
                        u[j][i] = -y*s+(z*c)
                    }
                }
            }
            // test f convergence
            z= q[k]
            if (l== k)
            {   //convergence
                if (z<0.0)
                {   //q[k] is made non-negative
                    q[k]= -z
                    for (j=0; j < n; j++)
                        v[j][k] = -v[j][k]
                }
                break  //break out of iteration loop and move on to next k value
            }
            if (iteration >= itmax-1)
                throw 'Error: no convergence.'
            // shift from bottom 2x2 minor
            x= q[l]
            y= q[k-1]
            g= e[k-1]
            h= e[k]
            f= ((y-z)*(y+z)+(g-h)*(g+h))/(2.0*h*y)
            g= pythag(f,1.0)
            if (f < 0.0)
                f= ((x-z)*(x+z)+h*(y/(f-g)-h))/x
            else
                f= ((x-z)*(x+z)+h*(y/(f+g)-h))/x
            // next QR transformation
            c= 1.0
            s= 1.0
            for (i=l+1; i< k+1; i++)
            {
                g= e[i]
                y= q[i]
                h= s*g
                g= c*g
                z= pythag(f,h)
                e[i-1]= z
                c= f/z
                s= h/z
                f= x*c+g*s
                g= -x*s+g*c
                h= y*s
                y= y*c
                for (j=0; j < n; j++)
                {
                    x= v[j][i-1]
                    z= v[j][i]
                    v[j][i-1] = x*c+z*s
                    v[j][i] = -x*s+z*c
                }
                z= pythag(f,h)
                q[i-1]= z
                c= f/z
                s= h/z
                f= c*g+s*y
                x= -s*g+c*y
                for (j=0; j < m; j++)
                {
                    y= u[j][i-1]
                    z= u[j][i]
                    u[j][i-1] = y*c+z*s
                    u[j][i] = -y*s+z*c
                }
            }
            e[l]= 0.0
            e[k]= f
            q[k]= x
        }
    }

    //vt= transpose(v)
    //return (u,q,vt)
    for (i=0;i<q.length; i++)
      if (q[i] < prec) q[i] = 0

    //sort eigenvalues
    for (i=0; i< n; i++)
    {
    //writeln(q)
     for (j=i-1; j >= 0; j--)
     {
      if (q[j] < q[i])
      {
    //  writeln(i,'-',j)
       c = q[j]
       q[j] = q[i]
       q[i] = c
       for(k=0;k<u.length;k++) { temp = u[k][i]; u[k][i] = u[k][j]; u[k][j] = temp; }
       for(k=0;k<v.length;k++) { temp = v[k][i]; v[k][i] = v[k][j]; v[k][j] = temp; }
//     u.swapCols(i,j)
//     v.swapCols(i,j)
       i = j
      }
     }
    }

    return {U:u,S:q,V:v}
};

return numeric;

});
// Helper functions for computing distance.
//
// The name of this should probably be changed, once we learn what other
// kinds of things we're including here.

define('math/distance',['require','math/builtin','numeric'],function (require) {
  var Builtin = require('math/builtin');
  var Numeric = require('numeric');

  var Distance = {
    // sqrt(x^2 + y^2), computed to avoid overflow and underflow.
    // http://en.wikipedia.org/wiki/Hypot
    hypot: function(x, y) {
      if(x === 0 && y === 0) {
        return 0;
      }
      if (Math.abs(x) > Math.abs(y)) {
        return Math.abs(x) * Math.sqrt((y/x) * (y/x) + 1);
      } else {
        return Math.abs(y) * Math.sqrt((x/y) * (x/y) + 1);
      }
    },

    // (x1 + x2)/2, computed to avoid overflow.
    mean: function (x1, x2) {
      return ((x1 > 0) === (x2 > 0)) ? x1 + 0.5*(x2 - x1) : 0.5*(x1 + x2);
    },

    dot: function(x1, y1, x2, y2) {
      return x1*x2 + y1*y2;
    },

    // Consider the line extending the segment, parameterized as
    // v1 + t (v2 - v1), where p, v1, and v2 are (xp, yp), (x1, y1), and
    // (x2, y2) respectively.
    //
    // Return the value of the parameter t for the projected point of p onto
    // the line through the segment.
    //
    // It falls where t = [(p-v) . (w-v)] / |w-v|^2
    //
    // Returns 0 in the degenerate case where v1 === v2.
    pointToSegmentParameter: function(xp, yp, x1, y1, x2, y2) {
      var line_length = this.hypot(x2 - x1, y2 - y1);

      // Degenerate case of a point to a point
      if (line_length === 0) return 0;

      var t = this.dot(
        (xp - x1)/line_length,
        (yp - y1)/line_length,
        (x2 - x1)/line_length,
        (y2 - y1)/line_length
      );

      return t;
    },

    closestPointOnSegment: function (xp, yp, x1, y1, x2, y2) {
      var t = this.pointToSegmentParameter(xp, yp, x1, y1, x2, y2);

      if (t <= 0) return [x1, y1];
      if (t >= 1) return [x2, y2];
      return [x1 + t*(x2 - x1), y1 + t*(y2 - y1)];
    },

    // Shortest distance from a point to a line segment
    // http://stackoverflow.com/questions/849211/shortest-distance-between-a-point-and-a-line-segment
    pointToSegment: function (xp, yp, x1, y1, x2, y2) {
      var p = this.closestPointOnSegment(xp, yp, x1, y1, x2, y2);
      return this.hypot(xp - p[0], yp - p[1]);
    },

    // (Near) 0 if x3, y3 lies on the line from x1, y1 to x2, y2.
    // Positive if x3, y3 is on the left of the line, so that the points form a
    // triangle with clockwise orientation.
    isLine: function (x1, y1, x2, y2, x3, y3) {
      var S = Numeric.svd([
        [x1, y1, 1],
        [x2, y2, 1],
        [x3, y3, 1]
      ]).S;
      return Builtin.approx(S[S.length - 1]/S[0], 0);
    },

    isCircle: function (x1, y1, x2, y2, x3, y3, x4, y4) {
      var S = Numeric.svd([
        [x1*x1 + y1*y1, x1, y1, 1],
        [x2*x2 + y2*y2, x2, y2, 1],
        [x3*x3 + y3*y3, x3, y3, 1],
        [x4*x4 + y4*y4, x4, y4, 1]
      ]).S;
      return Builtin.approx(S[S.length - 1]/S[0], 0);
    },

    // (Near) 0 if x6, y6 lies on the conic defined by the first five points.
    // I don't quite know how to interpret the sign for a general conic.
    isConic: function (x1, y1, x2, y2, x3, y3, x4, y4, x5, y5, x6, y6) {
      var S =  Numeric.svd([
        [x1*x1, y1*y1, 2*x1*y1, x1, y1, 1],
        [x2*x2, y2*y2, 2*x2*y2, x2, y2, 1],
        [x3*x3, y3*y3, 2*x3*y3, x3, y3, 1],
        [x4*x4, y4*y4, 2*x4*y4, x4, y4, 1],
        [x5*x5, y5*y5, 2*x5*y5, x5, y5, 1],
        [x6*x6, y6*y6, 2*x6*y6, x6, y6, 1]
      ]).S;
      return Builtin.approx(S[S.length - 1]/S[0], 0);
    },

    conicQuadraticParameters: function (x1, y1, x2, y2, x3, y3, x4, y4, x5, y5) {
      return {
        a: Numeric.det([
          [y1*y1, 2*x1*y1, x1, y1, 1],
          [y2*y2, 2*x2*y2, x2, y2, 1],
          [y3*y3, 2*x3*y3, x3, y3, 1],
          [y4*y4, 2*x4*y4, x4, y4, 1],
          [y5*y5, 2*x5*y5, x5, y5, 1]
        ]),

        b: Numeric.det([
          [x1*x1, y1*y1, x1, y1, 1],
          [x2*x2, y2*y2, x2, y2, 1],
          [x3*x3, y3*y3, x3, y3, 1],
          [x4*x4, y4*y4, x4, y4, 1],
          [x5*x5, y5*y5, x5, y5, 1]
        ]),

        c: -Numeric.det([
          [x1*x1, 2*x1*y1, x1, y1, 1],
          [x2*x2, 2*x2*y2, x2, y2, 1],
          [x3*x3, 2*x3*y3, x3, y3, 1],
          [x4*x4, 2*x4*y4, x4, y4, 1],
          [x5*x5, 2*x5*y5, x5, y5, 1]
        ])
      };
    },

    // Classify a set of 6 points as line, circle, parabola, hyperbola, ellipse, or none for not a conic.
    classifyConic: function (x1, y1, x2, y2, x3, y3, x4, y4, x5, y5, x6, y6) {
      if (Distance.isLine(x1, y1, x3, y3, x6, y6)) return 'line';
      if (Distance.isCircle(x1, y1, x2, y2, x5, y5, x6, y6)) return 'circle';
      if (!Distance.isConic(x1, y1, x2, y2, x3, y3, x4, y4, x5, y5, x6, y6)) return 'none';

      var p = Distance.conicQuadraticParameters(x1, y1, x2, y2, x3, y3, x4, y4, x5, y5);
      var S = Numeric.svd([[p.a, p.b], [p.b, p.c]]).S;

      if (Builtin.approx(S[S.length - 1]/S[0], 0, 20)) return 'parabola';
      return (p.b*p.b > p.a*p.c) ? 'hyperbola' : 'ellipse';

    }
  };

  return Distance;
});

// Utilites for finding and refining points of interest in samled functions.
//
// bisect* are low level functions take endpoints and a function, and return
// a single [x, f(x)] pair, where f is the function that was passed in, or
// null if a non-finite value of the function is encountered during
// evaluation. These methods have preconditions on the endpoints that callers
// are expected to enforce (because they are called recursively). They bisect
// to machine precision.
//
// find* are higher level. They take an array of segments and a function.
// Each segment is an array of points representing a polyline that
// approximates the function over a range where the function is expected to be
// continuous. No more than one zero and one extremum will be returned between
// individual point pairs in the segments list.
//
// findPOIs collects the results of all the find* methods together.


define('math/poi',['require','console','./builtin','./distance'],function(require){
  var console = require('console');
  var BuiltIn = require('./builtin');
  var Distance = require('./distance');

// floatMiddle is a helper function for bisecting floats. Necessary because
// floats are denser near 0 than they are elsewhere, so using a normal mean
// results in slow bisection to 0.
//
// This function returns the arithmetic mean if both numbers have
// magnitude larger than 1e-2, 0 if the numbers are small and have opposite
// signs, and the signed geometric mean if the numbers have the same sign. The
// geometric mean bisects the exponent instead of the mantissa, which is what
// we want near 0.

function floatMiddle(a, b) {
  var tmp;
  if (a > b) {
    tmp = a; a = b; b = tmp;
  }
  var aPos = a > 0;
  var bPos = b > 0;
  var aLarge = Math.abs(a) > 1e-2;
  var bLarge = Math.abs(b) > 1e-2;
  if (aLarge || bLarge) return Distance.mean(a, b);
  if (a === 0) return b*Math.abs(b);
  if (b === 0) return a*Math.abs(a);
  if (aPos !== bPos) return 0;
  var gMean = (aPos) ? Math.sqrt(a*b) : -Math.sqrt(a*b);
  // Check if the geometric mean actually lies between the numbers (it might
  // not because of floating point rounding). If it does not, return the
  // normal mean, which is computed in a way that guarantees it will be
  // between the inputs.
  return ((gMean >= a) && (b >= gMean)) ? gMean : Distance.mean(a, b);
}

function bisectZero(x0, y0, x2, y2, fn) {
  // Preconditions:
  // 1. y0 and y2 are finite and non-zero and have opposite sign
  if (!(isFinite(y0) && isFinite(y2) && (y0 < 0) !== (y2 < 0))) {
    console.log('bisectZero called with bad y values', [y0, y2]);
    return;
  }

  while (true) {
    var x1 = floatMiddle(x0, x2);
    var y1 = fn(x1);

    if (!isFinite(y1)) return null;

    // We can't bisect any further; return x for side with y closer to 0.
    if (x1 === x0 || x1 === x2) {
      return Math.abs(y0) <= Math.abs(y2) ? [x0, y0] : [x2, y2];
    }

    // Found a 0 early. Check if we're on a flat, and return the center of it.
    if (y1 === 0) return flatCenter(x0, y0, x1, y1, x2, y2, fn);

    // Bisect on side that brackets zero
    if ((y0 < 0) !== (y1 < 0)) {
      x2 = x1; y2 = y1;
    } else {
      x0 = x1; y0 = y1;
    }
  }
}

// Returns the center of a possibly flat region with constant value y1
function flatCenter(x0, y0, x1, y1, x2, y2, fn) {
  // Preconditions:
  // 1. x0 < x1 < x2

  var edge;
  if (!isFinite(y1)) return;

  if (!isFinite(y0)) {
    edge = bisectFinite(x0, y0, x1, y1, fn);
    x0 = edge[0];
    y0 = edge[1];
  }

  if (!isFinite(y2)) {
    edge = bisectFinite(x1, y1, x2, y2, fn);
    x2 = edge[0];
    y2 = edge[1];
  }

  var flatLeft, flatRight;

  if (y0 === y1) {
    flatLeft = [x0, y0];
  } else {
    flatLeft = bisectConstant(x0, y0, x1, y1, fn, y1);
  }

  if (y2 === y1) {
    flatRight = [x2, y2];
  } else {
    flatRight = bisectConstant(x1, y1, x2, y2, fn, y1);
  }

  var xc = floatMiddle(flatLeft[0], flatRight[0]);
  return [xc, fn(xc)];
}

function bisectFinite(x0, y0, x2, y2, fn) {
  // Preconditions:
  // 1. isFinite(y0) !== isFinite(y2)
  if (isFinite(y0) === isFinite(y2)) {
    console.log('bisectFinite called with bad y values', [y0, y2]);
    return;
  }

  while (true) {
    var x1 = floatMiddle(x0, x2);
    var y1 = fn(x1);

    // We can't bisect any further; return [x, y] pair for side that is finite.
    if (x1 === x0 || x1 === x2) return isFinite(y0) ? [x0, y0]: [x2, y2];

    // Bisect on side that brackets zero
    if (isFinite(y1) !== isFinite(y0)) {
      x2 = x1; y2 = y1;
    } else {
      x0 = x1; y0 = y1;
    }
  }
}

function bisectConstant(x0, y0, x2, y2, fn, constant) {
  // Preconditions:
  // 1. (y0 === constant) !== (y2 === constant)
  if ((y0 === constant) === (y2 === constant)) {
    console.log('bisectConstant called with bad y values', [y0, y2, constant]);
    return;
  }

  while (true) {
    var x1 = floatMiddle(x0, x2);
    var y1 = fn(x1);

    // We can't bisect any further; return [x, y] pair for side with
    // y === constant
    if (x1 === x0 || x1 === x2) return (y0 === constant) ? [x0, y0]: [x2, y2];

    if ((y1 === constant) !== (y0 === constant)) {
      x2 = x1; y2 = y1;
    } else {
      x0 = x1; y0 = y1;
    }
  }
}

function bisectExtremum(x0, y0, x2, y2, x4, y4, fn) {
  /* jshint maxcomplexity:11 */
  // Preconditions:
  // 1. x0 < x2 < x4
  // 2. y0, y2, and y4 are finite, non-equal, and y2 > y0 === y2 > y4.
  if (!(x0 < x2 && x2 < x4)) {
    console.log('bisectExtremum called with bad x values', [x0, x2, x4]);
    return;
  }
  if (!(
    (isFinite(y0) && isFinite(y2) && isFinite(y4)) &&
    (y0 !== y2 && y2 !== y4) &&
    (y2 > y0) === (y2 > y4)
  )) {
    console.log('bisectExtremum called with bad y values', [y0, y2, y4]);
    return;
  }

  while (true) {
    var x1 = floatMiddle(x0, x2);
    var y1 = fn(x1);
    var x3 = floatMiddle(x2, x4);
    var y3 = fn(x3);

    if (!isFinite(y1) || !isFinite(y3)) return null;

    // We can't bisect any further; return x and y for most extreme value
    if (x1 === x0 || x1 === x2 || x3 === x2 || x3 === x4) {
      if ((y1 > y2) === (y2 > y0)) return [x1, y1];
      if ((y3 > y2) === (y2 > y0)) return [x3, y3];
      return [x2, y2];
    }

    // We've hit a flat. Find its edges and return x and y for its center.
    if (y1 === y2 || y3 === y2) {
      return flatCenter(x0, y0, x2, y2, x4, y4, fn);
    }

    // Bisect on side that brackets zero
    if ((y1 > y0) === (y2 > y0) && (y1 > y0) === (y1 > y2)) {
      x4 = x2; y4 = y2; x2 = x1; y2 = y1;
    } else if ((y3 > y4) === (y2 > y4) && (y3 > y2) === (y3 > y4)) {
      x0 = x2; y0 = y2; x2 = x3; y2 = y3;
    } else {
      x0 = x1; y0 = y1; x4 = x3; y4 = y3;
    }
  }
}

// Returns larget jump among 4 points. Used in final step of bisectJump
function largestJump(x0, y0, x1, y1, x2, y2, x3, y3) {
  // Preconditions:
  // 1. y0, y1, y2, and y3 are all finite
  var d1 = Math.abs(y1 - y0);
  var d2 = Math.abs(y2 - y1);
  var d3 = Math.abs(y3 - y2);

  if (d1 > d2 && d1 > d3) return [[x0, y0], [x1, y1]];
  if (d3 > d2 && d3 > d1) return [[x2, y2], [x3, y3]];
  return [[x1, y1], [x2, y2]];
}

// Tries to find the largest jump in an interval. Returns left side and right
// side of jump as [[xl, yl], [xr, yr]], or null if no jump was found.
// Tolerance is allowed to be 0, and this works for some smooth functions,
// but returns false positives for others.
function bisectJump(x0, y0, x2, y2, x4, y4, fn, tolerance) {
  /* jshint maxcomplexity:15 */
  // Preconditions:
  // 1. x0 < x2 < x4
  // 2. y0, y2, and y4 are all finite.
  // Also expect x2 - x0 ~= x4 - x2
  if (!(x0 < x2 && x2 < x4)) {
    console.log('bisectJump called with bad x values', [x0, x2, x4]);
    return;
  }
  if (!isFinite(y0) || !isFinite(y4)) {
    console.log('bisectJump called with bad y values', [y0, y2, y4]);
    return;
  }

  if (!isFinite(y2)) {
    return [bisectFinite(x0, y0, x2, y2, fn), bisectFinite(x2, y2, x4, y4, fn)];
  }

  if (Math.abs(y2 - ((x4 - x2)*y0 + (x2 - x0)*y4)/(x4 - x0)) < tolerance) return null;

  while (true) {
    var x1 = floatMiddle(x0, x2);
    var y1 = fn(x1);
    var x3 = floatMiddle(x2, x4);
    var y3 = fn(x3);
    var dy1 = Math.abs(y1 - Distance.mean(y0, y2));
    var dy3 = Math.abs(y3 - Distance.mean(y2, y4));
    var left;
    var right;
    if (!tolerance) tolerance = 0;

    if (dy1 <= tolerance && dy3 <= tolerance) return null;

    // An undefined region counts as a jump.
    if (!isFinite(y1)) {
      left = bisectFinite(x0, y0, x1, y1, fn);
      right = bisectFinite(x1, y1, x4, y4, fn);
      return [left, right];
    }

    if (!isFinite(y3)) {
      left = bisectFinite(x0, y0, x3, y3, fn);
      right = bisectFinite(x3, y3, x4, y4, fn);
      return [left, right];
    }

    if ((x1 === x0 || x1 === x2) && (x3 === x2 || x3 === x4)) {
      if (Math.abs(y2 - y0) > Math.abs(y4 - y2)) {
        left = [x0, y0];
        right = [x2, y2];
      } else {
        left = [x2, y2];
        right = [x4, y4];
      }
      return [left, right];
    } else if (x1 === x0 || x1 === x2) {
      return largestJump(x0, y0, x2, y2, x3, y3, x4, y4);
    } else if (x3 === x2 || x3 === x4) {
      return largestJump(x0, y0, x1, y1, x2, y2, x4, y4);
    }

    if (dy1 > dy3) {
      x4 = x2; y4 = y2; x2 = x1; y2 = y1;
    } else {
      x0 = x2; y0 = y2; x2 = x3; y2 = y3;
    }
  }
}

function findZeros(segments, fn) {
  var segment;
  var accumulator = { x: [], y: [] };
  var x0;
  var y0;
  var x2;
  var y2;
  var zero;
  var flatLeft;
  for (var i=0, li=segments.length; i<li; i++) {
    segment = segments[i];
    flatLeft = undefined;
    if (segment[1] === 0) flatLeft = [segment[0], segment[1]];
    for (var j=0, lj=segment.length; j<lj-2; j = j+2) {
      x0 = segment[j];
      y0 = segment[j+1];
      x2 = segment[j+2];
      y2 = segment[j+3];

      if (!flatLeft) {
        if (y2 === 0) {
          // Entering left side of a potential flat. Save its position.
          flatLeft = [x0, y0];
        } else if ((y0 < 0) !== (y2 < 0)) {
          zero = bisectZero(x0, y0, x2, y2, fn);
          if (zero) {
            accumulator.x.push(zero[0]);
            accumulator.y.push(zero[1]);
          }
        }
      } else {
        if (y2 !== 0) {
          // Leaving right side of a flat. Add its center as a root.
          // Don't label zeros that start on segment boundaries.
          if (flatLeft[0] !== segment[0]) {
            zero = flatCenter(flatLeft[0], flatLeft[1], x0, y0, x2, y2, fn);
            accumulator.x.push(zero[0]);
            accumulator.y.push(zero[1]);
          }
          flatLeft = undefined;
        }
        // Otherwise we're in the middle of the flat; do nothing
      }
    }
    // Don't label zero that ends on a segment boundary.
  }

  return accumulator;
}

function findExtrema (segments, fn, derivative) {
  /* jshint maxcomplexity:13 */
  var segment;
  var accumulator = { x: [], y: [] };
  var x0;
  var y0;
  var x2;
  var y2;
  var x4;
  var y4;
  var extremum;
  var flatLeft;
  for (var i=0, li=segments.length; i<li; i++) {
    segment = segments[i];
    for (var j=0, lj=segment.length; j<lj - 4; j = j+2) {
      x0 = segment[j];
      y0 = segment[j+1];
      x2 = segment[j+2];
      y2 = segment[j+3];
      x4 = segment[j+4];
      y4 = segment[j+5];

      //TODO handle extremal endpoints.
      if (!(isFinite(y0) && isFinite(y2) && isFinite(y4))) continue;

      if (y0 !== y2 && y2 === y4) {
        // Entering left side of a flat. Save its position.
        flatLeft = [x0, y0];
      } else if (y0 === y2 && y2 !== y4 && flatLeft) {
        // Leaving right side of a flat.
        if ((y2 > flatLeft[1]) === (y2 > y4)) {
          // Flat is an extremum. Push it's center.
          extremum = flatCenter(flatLeft[0], flatLeft[1], x2, y2, x4, y4, fn);
          accumulator.x.push(extremum[0]);
          accumulator.y.push(extremum[1]);
        }
        flatLeft = undefined;
      } else if (y0 === y2 && y2 === y4) {
        // Middle of a flat, do nothing
      } else if ((y2 > y0) === (y2 > y4)) {
        if (derivative) {
          // If we have derivative information, find zeros of the derivative
          // to find extrema. This gives greater accuracy in the argmax/argmin
          // because the original function is flat at the extrema, but its
          // derivative is (usually) not.

          // Make sure we satisfy prereqs of bisectZero
          if ((derivative(x0) > 0) === (derivative(x4) > 0)) continue;
          extremum = bisectZero(
            x0, derivative(x0),
            x4, derivative(x4),
            derivative
          );
          // Currently treat maxima and minima the same
          if (extremum) {
            accumulator.x.push(extremum[0]);
            accumulator.y.push(fn(extremum[0]));
          }
        } else {
          extremum = bisectExtremum(x0, y0, x2, y2, x4, y4, fn);
          // Currently treat maxima and minima the same
          if (extremum) {
            accumulator.x.push(extremum[0]);
            accumulator.y.push(extremum[1]);
          }
        }
      }
    }
  }
  return accumulator;
}

function findIntercept(segments, fn) {
  var intercept = fn(0);
  if (!isFinite(intercept)) return { x: [], y: []};
  return { x: [ 0 ], y: [ fn(0) ] };
}

function findEdges(segments, fn) {
  var slen = segments.length;
  var accumulator = { x: [], y: [] };
  //TODO work out robust system for labeling holes so that we can label all
  // edges.
  //
  // For now, only label edges that are close to zero as zeros.

  for (var i = 0; i < slen; i++) {
    var segment = segments[i];
    if (parseFloat(segment[1].toFixed(7)) === 0) {
      accumulator.x.push(segment[0]);
      accumulator.y.push(segment[1]);
    }

    if (parseFloat(segment[segment.length - 1].toFixed(7)) === 0) {
      accumulator.x.push(segment[segment.length - 2]);
      accumulator.y.push(segment[segment.length -1]);
    }
  }
  return accumulator;
}

function findPOIs (segments, fn, derivative) {
  var zeros = findZeros(segments, fn);
  var edges = findEdges(segments, fn);

  // Not displaying edges right now; combine them with zeros.
  zeros.x.push.apply(zeros.x, edges.x);
  zeros.y.push.apply(zeros.y, edges.y);

  return {
    zeros: zeros,
    intercept: findIntercept(segments, fn),
    extrema: findExtrema(segments, fn, derivative)
  };
}

// indicatorFn is a function that is 0 where two curves intersect, and
// indicatorSamples is a series of samples of this function. For two
// y vs x curves, the indicator function is just the difference between
// the two curves. For intersecting a y vs x curve with an x vs y curve,
// e.g. y = f(x) and x = g(y), a suitable indicator function is
// x - g(f(x)). fn1 is used at the end to get y values from the x values
// that are roots of the indicator function.
function findIntersections (indicatorSamples, fn1, indicatorFn) {

  var zeros = findZeros(indicatorSamples, indicatorFn);
  var i, elen, zlen;

  // Find tangent intersections.
  var extrema = findExtrema(indicatorSamples, indicatorFn);
  for (i = 0, elen = extrema.x.length; i < elen; i++) {
    if (BuiltIn.approx(extrema.y[i], 0)) {
      zeros.x.push(extrema.x[i]);
      zeros.y.push(extrema.y[i]);
    }
  }

  // Find original function intersection y values.
  for (i = 0, zlen = zeros.x.length; i < zlen; i++) {
    zeros.y[i] = fn1(zeros.x[i]);
  }
  return zeros;
}

return {
  bisectJump: bisectJump,
  bisectExtremum: bisectExtremum,
  bisectFinite: bisectFinite,
  bisectZero: bisectZero,
  findExtrema: findExtrema,
  findZeros: findZeros,
  findPOIs: findPOIs,
  findIntersections: findIntersections,

  //Enums for POI type
  INTERSECTION: 1001,
  ZERO: 1002,
  INTERCEPT: 1003,
  EXTREMUM: 1004,
  EDGE: 1005,
  DEFINITION: 1006
};

});

define('graphing/graphmode',{
  X: 1,
  Y: 2,
  XYPOINT: 3,
  XYPOINT_MOVABLE: 4,
  PARAMETRIC: 5,
  POLAR: 6,
  POLYGONFILL: 7,
  IMPLICIT: 8,
  NONE: 10
});

define('math/plotter',['require','pjs','./distance','./poi','graphing/graphmode'],function(require) {
  var P = require('pjs');
  var Distance = require('./distance');
  var POI = require('./poi');
  var GRAPHMODE = require('graphing/graphmode');

  var Accumulator = P(function (proto) {
    proto.init = function (domain) {
      this.domain = domain;
      if (domain) {
        this.xtolerance = domain.xtolerance || domain.tolerance || 0;
        this.ytolerance = domain.ytolerance || domain.tolerance || 0;
        this.map = domain.map;
      } else {
        this.xtolerance = this.ytolerance = 0;
      }
      this.segments = [];
      this.segment = null;
      // Second point added to colinear set; defines line direction
      this.pivotPoint = null;
      // Most recent point in colinear set
      this.pendingPoint = null;
    };

    proto.colinear = function (p0, p1, p2) {
      if (this.map) {
        p0 = this.map(p0);
        p1 = this.map(p1);
        p2 = this.map(p2);
      }

      var t = Distance.pointToSegmentParameter(
        p2[0], p2[1],
        p0[0], p0[1],
        p1[0], p1[1]
      );

      if (t < 1) return false;

      var closestPoint = [
        p0[0] + t*(p1[0] - p0[0]),
        p0[1] + t*(p1[1] - p0[1])
      ];

      return (
        Math.abs(p2[0] - closestPoint[0]) <= this.xtolerance &&
        Math.abs(p2[1] - closestPoint[1]) <= this.ytolerance
      );
    };

    proto.addPoint = function (p) {
      this.n+=1;

      if (!this.segment) {
        this.segment = [p[0], p[1]];  //First point of the segment
        return;
      }

      if (this.xtolerance < 0 && this.ytolerance < 0) {
        this.segment.push(p[0], p[1]);
        return;
      }

      if (!this.pivotPoint) {
        this.pivotPoint = p;
        this.pendingPoint = p;
        return;
      }

      // Check if the new point lies on the line segment defined by the
      // last flushed point and the pivot point. If not, flush the pending
      // point and start a new linear section.
      var lastPoint = [
        this.segment[this.segment.length - 2],
        this.segment[this.segment.length - 1]
      ];

      if (!this.colinear(lastPoint, this.pivotPoint, p)) {
        this.flushPending();
        this.pivotPoint = p;
      }

      this.pendingPoint = p;
    };

    proto.flushPending = function () {
      if (this.pendingPoint) { //Only happens when we have a segment
        this.segment.push(this.pendingPoint[0], this.pendingPoint[1]);
        this.pivotPoint = null;
        this.pendingPoint = null;
      }
    };

    proto.breakSegment = function () {
      this.flushPending();

      if (this.segment) {
        if (this.segment.length > 2) {
          this.segments.push(this.segment);
        }
        this.segment = null;
      }
    };

    proto.getSegments = function () {
      this.breakSegment();
      return this.segments;
    };

    proto.finish = function () {
      return {
        segments: this.getSegments(),
        resolved: true
      };
    };

    proto.exhaust = function () {};
  });

  //Simple sampling of a [x(t), y(t)] function.
  //Domain is provided in terms of the independent variable
  //PARAMETERS
  //fn(int) => [x, y]
  //domain = {min, max, step}
  //RETURNS
  //Unclipped list of segments which can be passed directly into onGraph
  function sampleParametricNaive (fn, domain) {
    var accumulator = new Accumulator();
    var point;
    for (var independent = domain.min; independent <= domain.max + domain.step/2; independent += domain.step) {
      point = fn(independent);
      if (isFinite(point[0]) && isFinite(point[1])) {
        accumulator.addPoint(point);
      }
      else {
        accumulator.breakSegment();
      }
    }
    return accumulator.finish();
  }

  //Simple sampling of a y(x) function.
  //PARAMETERS
  //fn(int) => y
  //domain = {min, max, step}
  //RETURNS
  //Unclipped list of segments which can be passed directly into onGraph
  function sampleXYNaive (fn, domain) {
    var accumulator = new Accumulator(domain);
    var y;
    for (var x = domain.min; x <= domain.max + domain.step/2; x += domain.step) {
      y = fn(x);
      if (isFinite(y)) {
        accumulator.addPoint([x, y]);
      } else {
        accumulator.breakSegment();
      }
    }
    return accumulator.finish();
  }

  function sampleLinear (linearCoefficients, domain) {
    var accumulator = new Accumulator(domain);
    accumulator.addPoint([domain.min, linearCoefficients[0] + domain.min*linearCoefficients[1]]);
    accumulator.addPoint([domain.max, linearCoefficients[0] + domain.max*linearCoefficients[1]]);
    return accumulator.finish();
  }

  // Only returns a jump if we also find a jump when previousPoint and point are
  // perturbed by stepPerturbation.
  function _bisectJumpRobust (previousPoint, point, params) {
    var x0, y0, x1, y1, x2, y2;
    var fn = params.fn;
    var jumpTolerance = params.jumpTolerance;
    var stepPerturbation = params.stepPerturbation;

    x0 = previousPoint[0];
    y0 = previousPoint[1];
    x2 = point[0];
    y2 = point[1];
    x1 = Distance.mean(x0, x2);
    y1 = fn(x1);

    var jump = POI.bisectJump(x0, y0, x1, y1, x2, y2, fn, jumpTolerance);

    if (!jump) return;

    // If we found a jump, check whether we still find one with a small perturbation
    // to the left or the right.
    var perturbations = [-stepPerturbation, stepPerturbation];
    for (var i = 0; i < perturbations.length; i++) {
      x0 = previousPoint[0] + perturbations[i];
      y0 = fn(x0);
      if (!isFinite(y0)) {
        x0 = previousPoint[0];
        y0 = previousPoint[1];
      }
      x2 = point[0] + perturbations[i];
      y2 = fn(x2);
      if (!isFinite(y2)) {
        x2 = point[0];
        y2 = point[1];
      }
      x1 = Distance.mean(x0, x2);
      y1 = fn(x1);

      if (POI.bisectJump(x0, y0, x1, y1, x2, y2, fn, jumpTolerance)) return jump;
    }

    // If we made it here, we didn't find a jump under either perturbation, so just
    // conclude that the jump was not robust and return nothing.
  }

  var _handleJump = function (previousPoint, point, params) {
    if (!isFinite(params.jumpTolerance) || (params.jumpTolerance <= 0)) return;
    var jump = _bisectJumpRobust(previousPoint, point, params);
    if (jump) {
      params.accumulator.addPoint(jump[0]);
      params.accumulator.breakSegment();
      params.accumulator.addPoint(jump[1]);
    }
  };

  // Thre are a few pieces of state and configuration that need to get passed to
  // subroutines in sampleXY. This is just a simple container to keep track of
  // them.
  //
  // _handleJump used to be defined inside samlpeXY to close over all of these
  // variables, but it gets called a ton, so it's worth a bit of bureaucracy to
  // avoid paying the runtime cost of closures.
  var SampleXYParameters = function (fn, domain) {
    this.accumulator = new Accumulator(domain);
    this.fn = fn;
    this.jumpTolerance = domain.ytolerance || domain.tolerance;
    this.stepPerturbation = domain.step/10;
  };

  function sampleXY (fn, domain) {

    var params = new SampleXYParameters(fn, domain);
    var edge;
    var x = domain.min;
    var y = fn(x);
    var previousPoint = [x, y];

    if (isFinite(y)) params.accumulator.addPoint([x, y]);
    for (x += domain.step; x <= domain.max + domain.step/2; x += domain.step) {
      var xp = x;
      y = fn(xp);

      // If y isn't finite, try two nearby values to see if we can find an x with a finite y.
      // Policy is to try to avoid numerically spurious jumps and holes by ignoring them if
      // they have no influence outside a region that we could have missed by sampling with
      // a small offset.
      // https://github.com/desmosinc/knox/issues/2230
      // https://github.com/desmosinc/knox/issues/4151
      if (!isFinite(y)) {
        xp = x + params.stepPerturbation;
        y = fn(xp);
      }
      if (!isFinite(y)) {
        xp = x - params.stepPerturbation;
        y = fn(xp);
      }

      if (isFinite(y) && isFinite(previousPoint[1])) {
        _handleJump(previousPoint, [xp, y], params);
        params.accumulator.addPoint([xp, y]);
      } else if (isFinite(y) && !isFinite(previousPoint[1])) {
        edge = POI.bisectFinite(previousPoint[0], previousPoint[1], xp, y, fn);
        if (edge[0] !== xp) params.accumulator.addPoint(edge);
        _handleJump(edge, [xp, y], params);
        params.accumulator.addPoint([xp, y]);
      } else if (!isFinite(y) && isFinite(previousPoint[1])) {
        edge = POI.bisectFinite(previousPoint[0], previousPoint[1], xp, y, fn);
        _handleJump(previousPoint, edge, params);
        if (edge[0] !== previousPoint[0]) params.accumulator.addPoint(edge);
        params.accumulator.breakSegment();
      }
      previousPoint = [xp, y];
    }
    return params.accumulator.finish();
  }

  function findPiPeriod (fn, domain, trigAngleMultiplier, allowAntiperiods) {
    // If the function is periodic by a multiple of 2*pi, or antiperiodic by
    // a multiple of pi within the domain, return the period.
    //
    // Can optionally pass true to find antiperiods if they exist.
    var min = domain.min;
    var range = domain.max - domain.min;
    var tolerance = (domain.xtolerance && domain.ytolerance) ?
      Math.min(domain.xtolerance, domain.ytolerance) :
      domain.tolerance;
    var piRange = Math.floor(range/(Math.PI/trigAngleMultiplier));
    var n, m, period;

    function isPeriod(fn, n) {
      var sign = (n % 2 === 0) ? 1 : -1;
      if (!allowAntiperiods && sign === -1) return false;
      var nPI = n*(Math.PI/trigAngleMultiplier);
      var vals = [ min, min + 1, min + 2, min + 3];

      for (var i = 0, ilen = vals.length; i < ilen; i++) {
        if (
          isFinite(fn(vals[i])) !== isFinite(fn(vals[i] + nPI)) ||
          Math.abs(fn(vals[i]) - sign*fn(vals[i] + nPI)) > tolerance
        ) {
          return false;
        }
      }

      return true;
    }

    for (n = 1; n <= piRange; n++) {
      if (isPeriod(fn, n)) {
        period = n;
        // Check if integer multiples of the period are also periods
        for (m = 2; m*n <= piRange; m++) {
          if (!isPeriod(fn, m*n)) period = undefined;
        }
        if (period) break;
      }
    }

    if (!period) return null;

    return period*(Math.PI/trigAngleMultiplier);
  }

  function mapPolar (p) {
    return [ p[1]*Math.cos(p[0]), p[1]*Math.sin(p[0]) ];
  }

  function samplePolar (fn, domain) {
    // Don't allow line coallescing, since linear segments of a polar
    // equation don't map to lines on the graph paper.
    domain.map = mapPolar;
    return sampleXY(fn, domain);
  }

  // Helper for calling a function at steps along a range that makes sure we
  // hit start and endpoints exactly.
  //
  // TODO, use this in sampling xy also. Not
  // doing that for now because I don't want to step on Eric's toes with
  // extrema interleaving system that is being concurrently developed.
  function eachStep (domain, fn) {
    var min = domain.min;
    var max = domain.max;
    var step = domain.step;
    var range = max - min;
    var nsteps = Math.ceil(range/step);
    var newStep = range/nsteps;
    for (var n = 0; n < nsteps; n++) {
      fn(min + n*newStep);
    }
    fn(max);
  }

  function sampleParametricRecursive (fn, domain) {
    if (domain.max < domain.min) { return [] }

    var accumulator = new Accumulator(domain);

    //Sampling parameters
    var subdivision_levels = 10;

    //Initialize for first pass through loop
    var t0 = domain.min;
    var p0 = fn(t0);
    if (isFinite(p0[0]) && isFinite(p0[1])) {
      accumulator.addPoint(p0);
    }

    var p1;
    // Note, processes first point twice; but that's okay.
    eachStep(domain, function (t1) {
      p1 = fn(t1);
      subsampleParametricRecursive(fn, t0, p0, t1, p1, subdivision_levels, accumulator);
      t0 = t1;
      p0 = p1;
    });

    return accumulator.finish();
  }

  function subsampleParametricRecursive (fn, t0, p0, t1, p1, subdivision_levels_left, accumulator) {
    /* jshint maxcomplexity:13 */
    if (t1 === t0) return; // Nothing new to add, but don't need to break;

    var xtolerance = accumulator.xtolerance, ytolerance = accumulator.ytolerance;
    var t_mid = Distance.mean(t0, t1);
    var p_mid = fn(t_mid, true);

    var p0_valid = isFinite(p0[0]) && isFinite(p0[1]);
    var p1_valid = isFinite(p1[0]) && isFinite(p1[1]);
    var p_mid_valid = isFinite(p_mid[0]) && isFinite(p_mid[1]);

    if (subdivision_levels_left === 0 || t_mid === t0 || t_mid === t1) {
      accumulator.breakSegment(); //Didn't converge.
      if (p1_valid) accumulator.addPoint(p1);
      return;
    }

    // Don't need to break segment, since p0 should already have been processed.
    if (!p0_valid && !p1_valid) return;

    if (p0_valid !== p1_valid) {
      // We're at the edge of where the function is defined.
      // Subdivide until we find where edge point to machine precision.
      var original_t0 = t0;
      var original_t1 = t1;
      var original_p0 = p0;
      var original_p1 = p1;

      while (t0 !== t_mid && t_mid !== t1) {

        if (p_mid_valid == p0_valid) {
          t0 = t_mid;
          p0 = p_mid;
          p0_valid = p_mid_valid;
        }
        else {
          t1 = t_mid;
          p1 = p_mid;
          p1_valid = p_mid_valid;
        }

        t_mid = t0 + (t1-t0)/2;
        p_mid = fn(t_mid, true);
        p_mid_valid = isFinite(p_mid[0]) && isFinite(p_mid[1]);
      } //When this loop terminates, t_mid equals either t0 or t1

      if (p0_valid) {
        subsampleParametricRecursive(fn, original_t0, original_p0, t0, p0, subdivision_levels_left-1, accumulator);
        accumulator.breakSegment();
      }
      else {
        accumulator.breakSegment();
        accumulator.addPoint(p1);
        subsampleParametricRecursive(fn, t1, p1, original_t1, original_p1, subdivision_levels_left-1, accumulator);
      }
      return;
    }

    if (p0_valid && p_mid_valid && p1_valid) {

      var t = Distance.pointToSegmentParameter(
        p_mid[0],
        p_mid[1],
        p0[0],
        p0[1],
        p1[0],
        p1[1]
      );

      // If the new point lies betwen 20 % and 80 % of the way between the
      // outer points, and the distance from the segment to the new point is
      // less than tolerance, add the rightmost point, and stop recursing.
      if (
        t > 0.2 &&
        t < 0.8 &&
        Math.abs(p_mid[0] - (p0[0] + t*(p1[0] - p0[0]))) <= xtolerance &&
        Math.abs(p_mid[1] - (p0[1] + t*(p1[1] - p0[1]))) <= ytolerance
      ) {
        accumulator.addPoint(p1);
        return;
      }
    }

    // If we didn't stop, recurse. Don't recurse between two points that are
    // equal, since this will make us do a lot of work if our point becomes
    // independent of t over some range.
    if (!(p0[0] === p_mid[0] && p0[1] === p_mid[1])) {
      subsampleParametricRecursive(fn, t0, p0, t_mid, p_mid, subdivision_levels_left - 1, accumulator);
    }
    if (!(p1[0] === p_mid[0] && p1[1] === p_mid[1])) {
      subsampleParametricRecursive(fn, t_mid, p_mid, t1, p1, subdivision_levels_left - 1, accumulator);
    }
  }

  function sampleImplicitRecursive (fn, domain) {
    var xmin = domain.xmin;
    var ymin = domain.ymin;
    var xmax = domain.xmax;
    var ymax = domain.ymax;

    var a = 6; // Devide the grid at least a times
    var b = 0; // Allow up to b extra subdivisions locally

    var maxSegments = 10000;
    // Perform an iterative deepening depth first search on how many segments we will produce.
    // This allows us to go to very high precision locally for mostly simple functions that have a few kinks,
    // while still limiting the total number of line segments that we'll ever return to the draw routine.
    var opts;
    var pointCount;
    var lastPointCount = -1;
    var exhaustedCount;
    var incrementPointCount = function () { pointCount++; };
    var incrementExhuastedCount = function () { exhaustedCount++; };

    var maxDepth = 12;

    while (true) {
      pointCount = 0;
      exhaustedCount = 0;

      opts = {
        fn: fn,
        mindepth: b,
        accumulator: {push: incrementPointCount, exhaust: incrementExhuastedCount},
        xtolerance: domain.xtolerance,
        ytolerance: domain.ytolerance
      };

      subsampleImplicitRecursive(
        opts, a + b,
        xmin, ymax, fn(xmin, ymax),
        xmax, ymax, fn(xmax, ymax),
        xmax, ymin, fn(xmax, ymin),
        xmin, ymin, fn(xmin, ymin)
      );

      if (pointCount === lastPointCount || pointCount > maxSegments) {
        b--;
        break;
      }

      if (exhaustedCount === 0) {
        break;
      } else {
        b += Math.max(1, Math.floor(Math.log((maxSegments - pointCount)/exhaustedCount)/Math.log(4)));
        if (b > maxDepth) {
          b = maxDepth;
          break;
        }
      }

      lastPointCount = pointCount;
    }

    var resolved = pointCount < maxSegments;

    var accumulator = [];
    var noop = function () {};

    opts = {
      fn: fn,
      mindepth: b,
      accumulator: {
        push: function() {Array.prototype.push.apply(accumulator, arguments);}, //Avoiding bind for phantomjs
        exhaust: noop
      },
      xtolerance: domain.xtolerance,
      ytolerance: domain.ytolerance
    };

    subsampleImplicitRecursive(
      opts, a + b,
      xmin, ymax, fn(xmin, ymax),
      xmax, ymax, fn(xmax, ymax),
      xmax, ymin, fn(xmax, ymin),
      xmin, ymin, fn(xmin, ymin)
    );

    return {
      segments: accumulator,
      resolved: resolved
    };
  }

  function subsampleImplicitRecursive (
    opts, depth,
    xtl, ytl, ftl,
    xtr, ytr, ftr,
    xbr, ybr, fbr,
    xbl, ybl, fbl
  ) {
    /* jshint maxcomplexity:19 */
    var fn = opts.fn;
    var mindepth = opts.mindepth;
    var accumulator = opts.accumulator;
    var xtolerance = opts.xtolerance;
    var ytolerance = opts.ytolerance;

    if (!depth) depth = 0;
    if (depth < 0) {
      accumulator.exhaust();
      return;
    }

    // No point in continuing to divide once the grid edges are
    // smaller than the tolerances.
    if (Math.abs(xtl - xtr) < 2*xtolerance && Math.abs(ytl - ybl) < 2*ytolerance) {
      depth = 0;
    }

    depth--;

    // Calculate midpoints of 4 edges, and the midpoint of the box.
    var xtm = 0.5*(xtl + xtr);
    var ytm = 0.5*(ytl + ytr);
    var ftm = fn(xtm, ytm);

    var xml = 0.5*(xtl + xbl);
    var yml = 0.5*(ytl + ybl);
    var fml = fn(xml, yml);

    var xmr = 0.5*(xtr + xbr);
    var ymr = 0.5*(ytr + ybr);
    var fmr = fn(xmr, ymr);

    var xbm = 0.5*(xbl + xbr);
    var ybm = 0.5*(ybl + ybr);
    var fbm = fn(xbm, ybm);

    var xmm = 0.5*(xml + xmr);
    var ymm = 0.5*(ytm + ybm);
    var fmm = fn(xmm, ymm);

    // Descend recursively into each of the 4 subboxes of the current box.
    var descend = function () {
      subsampleImplicitRecursive(
        opts, depth,
        xtl, ytl, ftl,
        xtm, ytm, ftm,
        xmm, ymm, fmm,
        xml, yml, fml
      );
      subsampleImplicitRecursive(
        opts, depth,
        xtm, ytm, ftm,
        xtr, ytr, ftr,
        xmr, ymr, fmr,
        xmm, ymm, fmm
      );
      subsampleImplicitRecursive(
        opts, depth,
        xmm, ymm, fmm,
        xmr, ymr, fmr,
        xbr, ybr, fbr,
        xbm, ybm, fbm
      );
      subsampleImplicitRecursive(
        opts, depth,
        xml, yml, fml,
        xmm, ymm, fmm,
        xbm, ybm, fbm,
        xbl, ybl, fbl
      );
    };

    if (depth > mindepth) return descend();

    // If box contains both finite and non-finite vertices, descend
    if (
      isFinite(ftl) !== isFinite(ftr) ||
      isFinite(ftl) !== isFinite(fbr) ||
      isFinite(ftl) !== isFinite(fbl)
    ) return descend();

    // Check for oxo or xox edges and descend.
    if (ftl > 0 === ftr > 0 && ftm > 0 !== ftl > 0) {
      return descend();
    }
    if (ftr > 0 === fbr > 0 && fmr > 0 !== ftr > 0) {
      return descend();
    }
    if (fbr > 0 === fbl > 0 && fbm > 0 !== fbr > 0) {
      return descend();
    }
    if (fbl > 0 === ftl > 0 && fml > 0 !== fbl > 0) {
      return descend();
    }

    // Check for xo/ox or ox/xo boxes and descend.
    if (ftl > 0 !== ftr > 0 && ftr > 0 !== fbr > 0 && fbr > 0 !== fbl > 0) {
      return descend();
    }

    // Check for oo/oo or xx/xx boxes and do nothing
    if (ftl > 0 === ftr > 0 && ftr > 0 === fbr > 0 && fbr > 0 === fbl > 0) {
      return;
    }

    // At this point, we know there are exactly two xo or ox edges in the box.
    // Interpolate is called with a 3-point edge (corner, midpoint, corner),
    // and if the signs of the function values are appropriate, pushes an edge
    // intersection onto the intersections accumulator.
    var intersections = [];
    var interpolate = function (x0, y0, f0, x1, y1, f1, x2, y2, f2) {
      /* jshint maxcomplexity:11 */
      var code = 1*(f0 > 0) + 2*(f1 > 0) + 4*(f2 > 0);

      var a, xm0, xm1, ym0, ym1;
      switch (code) {
        case 0: return false; // ooo
        case 7: return false; // xxx

        case 2: return true; // oxo
        case 5: return true; // xox

        case 1: // xoo
          a = f0/(f0 - f2);
          xm0 = (1 - a)*x0 + a*x2;
          ym0 = (1 - a)*y0 + a*y2;
          a = f0/(f0 - f1);
          xm1 = (1 - a)*x0 + a*x1;
          ym1 = (1 - a)*y0 + a*y1;
          break;

        case 4: // oox
          a = f2/(f2 - f0);
          xm0 = (1 - a)*x2 + a*x0;
          ym0 = (1 - a)*y2 + a*y0;
          a = f2/(f2 - f1);
          xm1 = (1 - a)*x2 + a*x1;
          ym1 = (1 - a)*y2 + a*y1;
          break;

        case 3: // xxo
          a = f0/(f0 - f2);
          xm0 = (1 - a)*x0 + a*x2;
          ym0 = (1 - a)*y0 + a*y2;
          a = f1/(f1 - f2);
          xm1 = (1 - a)*x1 + a*x2;
          ym1 = (1 - a)*y1 + a*y2;
          break;

        case 6: // oxx
          a = f2/(f2 - f0);
          xm0 = (1 - a)*x2 + a*x0;
          ym0 = (1 - a)*y2 + a*y0;
          a = f1/(f1 - f0);
          xm1 = (1 - a)*x1 + a*x0;
          ym1 = (1 - a)*y1 + a*y0;
          break;
      }

      if (Math.abs(xm1 - xm0) > xtolerance || Math.abs(ym1 - ym0) > ytolerance) {
        if (depth >= 0) {
          return true; // At recursion bottom, just draw the line.
        } else {
          accumulator.exhaust();
        }
      }
      intersections.push(xm1, ym1);
      return false;
    };

    // Interpolate each of the 4 edges, and descend if the interpolate routine
    // indicates further precision is necessary.
    if (interpolate(xtl, ytl, ftl, xtm, ytm, ftm, xtr, ytr, ftr)) {
      return descend();
    }
    if (interpolate(xtr, ytr, ftr, xmr, ymr, fmr, xbr, ybr, fbr)) {
      return descend();
    }
    if (interpolate(xbr, ybr, fbr, xbm, ybm, fbm, xbl, ybl, fbl)) {
      return descend();
    }
    if (interpolate(xbl, ybl, fbl, xml, yml, fml, xtl, ytl, ftl)) {
      return descend();
    }

    // Check for differing signs on either side of intersection midpoint
    var x1 = intersections[0];
    var y1 = intersections[1];
    var x2 = intersections[2];
    var y2 = intersections[3];

    var xm = Distance.mean(x1, x2);
    var ym = Distance.mean(y1, y2);

    var dx = x2 - x1;
    var dy = y2 - y1;

    var length = Distance.hypot(dx, dy);

    var fm = fn(xm, ym);
    var f1 = fn(xm + dy/length*ytolerance, ym - dx/length*xtolerance);
    var f2 = fn(xm - dy/length*ytolerance, ym + dx/length*xtolerance);

    if (f1 > fm === f2 > fm) return descend(); // Looks like an asymptote, not a 0 crossing.
    if (f1 > 0 === f2 > 0) {
      if (depth >= 0) {
        return descend();
      } else {
        accumulator.exhaust();
      }
    }

    accumulator.push(intersections);
  }

  function validateViewState (viewState) {
    if (!viewState) return false;
    var xmin = viewState.viewport.xmin;
    var xmax = viewState.viewport.xmax;
    var ymin = viewState.viewport.ymin;
    var ymax = viewState.viewport.ymax;
    if (!isFinite(xmin) || !isFinite(xmax) || xmax <= xmin) return false;
    if (!isFinite(ymin) || !isFinite(ymax) || ymax <= ymin) return false;
    if (!isFinite(viewState.screen.width) || viewState.screen.width <= 0) return false;
    if (!isFinite(viewState.screen.height) || viewState.screen.height <= 0) return false;
    return true;
  }

  // May return false to indicate either an unrecoginzed GRAPHMODE,
  // or function with a domain that doesn't overlap the viewport.
  function computeDomain (viewState, graphInfo, fn) {
    var xmin = viewState.viewport.xmin;
    var xmax = viewState.viewport.xmax;
    var ymin = viewState.viewport.ymin;
    var ymax = viewState.viewport.ymax;
    var trigAngleMultiplier = viewState.trigAngleMultiplier || 1.0;

    var oversample = viewState.oversample || 4;
    var xtolerance = 1/oversample*(xmax - xmin)/viewState.screen.width;
    var ytolerance = 1/oversample*(ymax - ymin)/viewState.screen.height;
    var domainBound = graphInfo.domainBound;

    var domain;
    switch(graphInfo.graphMode) {
      case GRAPHMODE.X:
        ymin = Math.max(ymin, domainBound[0]);
        ymax = Math.min(ymax, domainBound[1]);
        if (!isFinite(ymax) || !isFinite(ymin) || ymax <= ymin) return false;
        domain = {
          min: ymin,
          max: ymax,
          xtolerance: ytolerance, // Note, switched
          ytolerance: xtolerance,
          step: ytolerance
        };
        break;
      case GRAPHMODE.Y:
        xmin = Math.max(xmin, domainBound[0]);
        xmax = Math.min(xmax, domainBound[1]);
        if (!isFinite(xmax) || !isFinite(xmin) || xmax <= xmin) return false;
        domain = {
         min: xmin,
         max: xmax,
         xtolerance: xtolerance,
         ytolerance: ytolerance,
         step: xtolerance
        };
        break;
      case GRAPHMODE.POLAR:
        domain = {
          min :0,
          max: 2*Math.PI/trigAngleMultiplier*6,
          step: (2*Math.PI/trigAngleMultiplier)/1000,
          tolerance: Math.min(xtolerance, ytolerance)
        };
        var period = findPiPeriod(fn, domain, trigAngleMultiplier, graphInfo.operator === '=');
        if (period) domain.max = domain.min + period;
        break;
      case GRAPHMODE.PARAMETRIC:
        //this catch fixes a bug where center coordinate of image
        //with free variables of t would crash
        if (graphInfo.domain) domain = {
          min: graphInfo.domain.min,
          max: graphInfo.domain.max,
          step: graphInfo.domain.step,
          xtolerance: xtolerance,
          ytolerance: ytolerance
        };
        break;
      case GRAPHMODE.IMPLICIT:
        domain = {
          xmin: xmin,
          xmax: xmax,
          ymin: ymin,
          ymax: ymax,
          xtolerance: xtolerance,
          ytolerance: ytolerance
        };
        break;
      default:
        return false;
    }
    return domain;
  }

  function classifyBranchConic (segments) {
    var conic, segmentConic;
    if (segments.length === 1 && segments[0].length === 4) return 'line';
    for (var i = 0; i < segments.length; i++) {
      var segment = segments[i];
      var len = segment.length;
      if (len < 12) return 'unknown';
      try {
        segmentConic = Distance.classifyConic(
          segment[0], segment[1],
          segment[2*Math.floor(1*len/12)], segment[2*Math.floor(1*len/12) + 1],
          segment[2*Math.floor(2*len/12)], segment[2*Math.floor(2*len/12) + 1],
          segment[2*Math.floor(3*len/12)], segment[2*Math.floor(3*len/12) + 1],
          segment[2*Math.floor(4*len/12)], segment[2*Math.floor(4*len/12) + 1],
          segment[len - 2], segment[len - 1]
        );
      } catch (e) {
        // numeric.js's SVD routine can fail to converge and throw an error.
        return 'unknown';
      }

      if (segmentConic === 'none') return 'none';
      if (conic && segmentConic !== conic) return 'none';
      conic = segmentConic;
    }
    return conic;
  }

  //Computes domain, decides what function to use, and returns answer
  function computeGraphData (viewState, graphInfo, fn, derivative) {
    /* jshint maxcomplexity:12 */
    var domain = computeDomain(viewState, graphInfo, fn);
    var segmentData;
    var segments;
    var tmp;
    if (!domain) {
      segments = [];
      segmentData = {resolved: true};
    } else {
      switch(graphInfo.graphMode) {
        case GRAPHMODE.X:
        case GRAPHMODE.Y:
          segmentData = graphInfo.isLinear ? sampleLinear(graphInfo.linearCoefficients, domain) : sampleXY(fn, domain);
        break;
        case GRAPHMODE.POLAR:
        segmentData = samplePolar(fn, domain);
        break;
        case GRAPHMODE.IMPLICIT:
        segmentData = sampleImplicitRecursive(fn, domain);
        break;
        case GRAPHMODE.PARAMETRIC:
        if (!domain.step) domain.step = (domain.max - domain.min) / 1000;
        segmentData = sampleParametricRecursive(fn, domain);
      }

      segments = segmentData.segments;
    }


    var poi = [];
    if (
      graphInfo.graphMode !== GRAPHMODE.PARAMETRIC &&
      graphInfo.graphMode !== GRAPHMODE.IMPLICIT
    ) {
      poi = POI.findPOIs(segments, fn, derivative);
      segments = interleaveExtrema(segments, poi);
    }

    // Flip POI representation if necessary
    if (graphInfo.graphMode === GRAPHMODE.X) {
      for (var type in poi) {
        if (!poi.hasOwnProperty(type)) continue;
        tmp = poi[type].y;
        poi[type].y = poi[type].x;
        poi[type].x = tmp;
      }
    }

    var datum = {
      segments: segments,
      resolved: segmentData.resolved,
      graphMode: graphInfo.graphMode,
      color: graphInfo.color,
      style: graphInfo.style,
      operator: graphInfo.operator,
      poi: poi,
      conic: (graphInfo.graphMode === GRAPHMODE.IMPLICIT) ? 'unknown' : classifyBranchConic(segments),
      expr: null //compiled.fn
    };
    return datum;
  }

  function interleaveExtrema (segments, poi) {
    var nsegments = segments.length;
    var segment;
    var newSegments = Array(nsegments);
    var newSegment;
    var slen;
    var extrema = poi.extrema;
    var j=0;
    var elen = extrema.x.length;

    for (var n = 0; n < nsegments; n++) {
      segment = segments[n];
      slen = segment.length;
      newSegment = [];
      for (var i=0; i < slen; i = i+2) {
        // push extrema between last point and current point onto
        // accumulator.
        while (j < elen && extrema.x[j] <= segment[i]) {
          // Don't push the same point twice
          if (extrema.x[j] !== segment[i]) {
            newSegment.push(extrema.x[j], extrema.y[j]);
          }
          j++;
        }
        // push current point onto accumulator.
        newSegment.push(segment[i], segment[i+1]);
      }
      newSegments[n] = newSegment;
    }
    return newSegments;
  }

  function polygonFromSegments (bottom_segments, top_segments, graphMode) {
    //TODO - respect graphMode (by pushing in proper order)
    var i, j, p, segment;
    var polygon = [];
    var map;
    switch (graphMode) {
      case GRAPHMODE.POLAR:
        map = this.mapPolar;
        break;
      case GRAPHMODE.X:
        map = function(p) {return [p[1], p[0]];};
        break;
    }
    for (i = 0; i < bottom_segments.length; i++) {
      segment = bottom_segments[i];
      for (j = 0; j < segment.length; j += 2) {
        p = [segment[j], segment[j+1]];
        if (map) p = map(p);
        polygon.push(p[0], p[1]);
      }
    }
    for (i = top_segments.length - 1; i>=0; i--) {
      segment = top_segments[i];
      for (j = segment.length - 2; j >= 0; j -= 2) {
        p = [segment[j], segment[j+1]];
        if (map) p = map(p);
        polygon.push(p[0], p[1]);
      }
    }
    return polygon;
  }


  function polygonsFromSegments (bottom_segments, top_segments, graphMode) {
    var last_x = function (segments) {
      var last_segment = segments[segments.length - 1];
      return last_segment[last_segment.length - 2];
    };

    var polygons = [];
    //Until we have pulled the last segment:
      //Continue to pull segments from the top and the bottom until we find two which end at the same point.
      //When that happens, close the polygon, and start another one.
    var i_top = 0;
    var i_bottom = 0;
    var current_bottom = [];
    var current_top = [];
    var top_x = -Infinity;
    var bottom_x = -Infinity;

    while (true) {

      if (top_x <= bottom_x) {
        if (i_top >= top_segments.length) break;
        current_top.push(top_segments[i_top++]);
      }
      if (bottom_x <= top_x) {
        if (i_bottom >= bottom_segments.length) break;
        current_bottom.push(bottom_segments[i_bottom++]);
      }
      top_x = last_x(current_top);
      bottom_x = last_x(current_bottom);

      if (top_x == bottom_x) {
        polygons.push(polygonFromSegments(current_bottom, current_top, graphMode));
        current_top = [];
        current_bottom = [];
      }
    }
    return polygons;
  }

  return {
    Accumulator: Accumulator,
    sampleParametricNaive: sampleParametricNaive,
    sampleXYNaive: sampleXYNaive,
    sampleLinear: sampleLinear,
    sampleXY: sampleXY,
    findPiPeriod: findPiPeriod,
    samplePolar: samplePolar,
    sampleParametricRecursive: sampleParametricRecursive,
    subsampleParametricRecursive: subsampleParametricRecursive,
    sampleImplicitRecursive: sampleImplicitRecursive,
    subsampleImplicitRecursive: subsampleImplicitRecursive,
    validateViewState: validateViewState,
    computeDomain: computeDomain,
    computeGraphData: computeGraphData,
    polygonsFromSegments: polygonsFromSegments
  };
});

define('jison',[], function(){
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"sentence":3,"expr":4,"EOF":5,"assignment":6,"equation":7,"function_declaration":8,"regression":9,"ordered_pair_list":10,"double_inequality":11,"boolean":12,"identifier":13,"=":14,"FUNCTION_PROTOTYPE":15,",":16,"~":17,"comparator":18,"IDENTIFIER_BASE":19,"ordered_pair_list_elements":20,"ordered_pair":21,"(":22,")":23,"list":24,"[":25,"list_elements":26,"]":27,"range":28,"optional_commas_ellipsis":29,"...":30,"list_element_access":31,"expr_atom":32,"expr_sum":33,"<":34,">":35,">=":36,"<=":37,"+":38,"expr_product":39,"-":40,"expr_atom_impmul":41,"*":42,"/":43,"exponent":44,"^N":45,"^I":46,"^":47,"{":48,"}":49,"function_call":50,"function_call_unary":51,"trig_function_call":52,"log_function_call":53,"ln_function_call":54,"left|":55,"right|":56,"FRAC":57,"SQRT":58,"!":59,"repeated_operator":60,"DERIVATIVE":61,"expr_piecewise":62,"constant":63,"NUMBER":64,"repeated_operator_symbol":65,"SUM":66,"PROD":67,"_":68,"{_visible":69,"piecewise_list":70,"}_visible":71,"incomplete_piecewise_list":72,"piecewise_element":73,":":74,"trig_function":75,"TRIG_FUNCTION":76,"log_prefix":77,"LOG":78,"LOG_BASE_N":79,"LN":80,"function_argument_list":81,"$accept":0,"$end":1},
terminals_: {2:"error",5:"EOF",14:"=",15:"FUNCTION_PROTOTYPE",16:",",17:"~",19:"IDENTIFIER_BASE",22:"(",23:")",25:"[",27:"]",30:"...",34:"<",35:">",36:">=",37:"<=",38:"+",40:"-",42:"*",43:"/",45:"^N",46:"^I",47:"^",48:"{",49:"}",55:"left|",56:"right|",57:"FRAC",58:"SQRT",59:"!",61:"DERIVATIVE",64:"NUMBER",66:"SUM",67:"PROD",68:"_",69:"{_visible",71:"}_visible",74:":",76:"TRIG_FUNCTION",78:"LOG",79:"LOG_BASE_N",80:"LN"},
productions_: [0,[3,2],[3,2],[3,2],[3,2],[3,2],[3,2],[3,2],[3,2],[3,3],[3,2],[3,4],[3,1],[6,3],[9,3],[7,3],[11,5],[13,1],[10,1],[20,1],[20,3],[21,5],[24,3],[28,5],[29,1],[29,2],[29,2],[29,3],[26,1],[26,3],[31,4],[4,1],[18,1],[18,1],[18,1],[18,1],[12,3],[12,3],[12,5],[33,3],[33,3],[33,1],[39,2],[39,3],[39,3],[39,1],[44,1],[44,1],[44,4],[41,1],[41,1],[41,1],[41,1],[41,1],[41,1],[41,3],[41,3],[41,3],[41,2],[41,7],[41,4],[41,7],[41,2],[41,1],[41,2],[41,1],[32,1],[32,3],[32,2],[32,2],[32,2],[32,1],[32,1],[32,1],[32,1],[65,1],[65,1],[60,9],[62,3],[62,2],[70,3],[70,1],[72,3],[72,1],[73,3],[73,1],[63,1],[63,2],[51,5],[51,4],[75,1],[52,4],[52,2],[52,7],[52,9],[52,3],[52,5],[77,1],[77,1],[77,3],[77,5],[53,4],[53,2],[53,5],[53,3],[54,4],[54,2],[54,5],[54,3],[50,4],[81,3],[81,3],[8,2]],
performAction: function anonymous(yytext,yyleng,yylineno,yy,yystate,$$,_$) {

var $0 = $$.length - 1;
switch (yystate) {
case 1: return $$[$0-1];
break;
case 2: return $$[$0-1];
break;
case 3: return $$[$0-1];
break;
case 4: return $$[$0-1];
break;
case 5: return $$[$0-1];
break;
case 6: return $$[$0-1];
break;
case 7: return $$[$0-1];
break;
case 8: return $$[$0-1];
break;
case 9: return yy.ErrorMsg.missingRHS($$[$0-2]._symbol);
break;
case 10: var symbol = yy.parseFunctionDeclaration($$[$0-1]).identifier._symbol;
          return yy.ErrorMsg.missingRHS(symbol);

break;
case 11: return yy.ErrorMsg.malformedPoint();
break;
case 12: return yy.ErrorMsg.blankExpression();
break;
case 13:this.$ = yy.Assignment($$[$0-2], $$[$0]);
          yy.setInput(this.$, this._$);

break;
case 14:this.$ = yy.Regression($$[$0-2], $$[$0]);
        yy.setInput(this.$, this._$);

break;
case 15:this.$ = yy.Equation($$[$0-2], $$[$0]);
          yy.setInput(this.$, this._$);

break;
case 16:this.$ = yy.DoubleInequality([$$[$0-4], $$[$0-3], $$[$0-2], $$[$0-1], $$[$0]]);
        yy.setInput(this.$, this._$);

break;
case 17:this.$ = yy.Identifier(yytext);
        yy.setInput(this.$, this._$);

break;
case 18:this.$ = yy.OrderedPair.fromList($$[$0]);
      yy.setInput(this.$, this._$);

break;
case 19: this.$ = [($$[$0])];
break;
case 20: $$[$0-2].push($$[$0]); this.$ = $$[$0-2]
break;
case 21: this.$ = yy.OrderedPair([$$[$0-3], $$[$0-1]]);
break;
case 22:this.$ = yy.List($$[$0-1]);
      yy.setInput(this.$, this._$);

break;
case 23: this.$ = yy.Range([yy.List($$[$0-3]), yy.List($$[$0-1])]);
break;
case 28: this.$ = [$$[$0]]
break;
case 29: $$[$0-2].push($$[$0]); this.$ = $$[$0-2]
break;
case 30: this.$ = yy.ListAccess([$$[$0-3], $$[$0-1]])
break;
case 31:this.$ = $$[$0];
      yy.setInput(this.$, this._$);

break;
case 32:this.$ = '<'
break;
case 33:this.$ = '>'
break;
case 34:this.$ = '>='
break;
case 35:this.$ = '<='
break;
case 36:this.$ = yy.Comparator[$$[$0-1]]([$$[$0-2], $$[$0]]);
        yy.setInput(this.$, this._$);

break;
case 37:this.$ = yy.Comparator['=']([$$[$0-2], $$[$0]]);
        yy.setInput(this.$, this._$);

break;
case 38:
        var c1 = yy.Comparator[$$[$0-3]]([$$[$0-4], $$[$0-2]]);
        var c2 = yy.Comparator[$$[$0-1]]([$$[$0-2], $$[$0]]);
        this.$ = yy.And([c1, c2]);
        yy.setInput(this.$, this._$);

break;
case 39:this.$ = yy.Add([$$[$0-2], $$[$0]]);
break;
case 40:this.$ = yy.Subtract([$$[$0-2], $$[$0]]);
break;
case 41:this.$ = $$[$0]
break;
case 42:this.$ = yy.Multiply([$$[$0-1], $$[$0]]);
break;
case 43:this.$ = yy.Multiply([$$[$0-2], $$[$0]]);
break;
case 44:this.$ = yy.Divide([$$[$0-2], $$[$0]]);
break;
case 45:this.$ = $$[$0];
break;
case 46:this.$ = yy.Constant(Number($$[$0]));
break;
case 47:this.$ = yy.Identifier($$[$0]);
break;
case 48:this.$ = $$[$0-1];
break;
case 49:this.$ = $$[$0];
break;
case 50:this.$ = $$[$0];
break;
case 51:this.$ = $$[$0];
break;
case 52:this.$ = $$[$0];
break;
case 53:this.$ = $$[$0];
break;
case 54:this.$ = $$[$0];
break;
case 55:this.$ = $$[$0-1];
break;
case 56:this.$ = $$[$0-1];
break;
case 57:this.$ = yy.FunctionCall('\\abs', [$$[$0-1]]);
break;
case 58:this.$ = yy.Exponent([$$[$0-1], $$[$0]]);
break;
case 59:this.$ = yy.Divide([$$[$0-4], $$[$0-1]]);
break;
case 60:this.$ = yy.FunctionCall('\\sqrt', [$$[$0-1]]);
break;
case 61:this.$ = yy.FunctionCall('\\nthroot', [$$[$0-1], $$[$0-4]]);
break;
case 62:this.$ = yy.FunctionCall('\\factorial', [$$[$0-1]])
break;
case 63:this.$ = $$[$0];
break;
case 64:this.$ = yy.Derivative($$[$0-1], [$$[$0]]);
break;
case 65:this.$ = $$[$0]
break;
case 66:this.$ = $$[$0];
break;
case 67:this.$ = yy.Negative([yy.Exponent([yy.Constant(Number($$[$0-1])), $$[$0]])]);
break;
case 68:this.$ = yy.Exponent([$$[$0-1], $$[$0]]);
break;
case 69:this.$ = yy.FunctionCall('\\factorial', [$$[$0-1]])
break;
case 70:this.$ = yy.Negative([$$[$0]])
break;
case 71:this.$ = $$[$0]
break;
case 72:this.$ = $$[$0]
break;
case 73:this.$ = $$[$0]
break;
case 74:this.$ = $$[$0]
break;
case 75:this.$ = yy.Sum;
break;
case 76:this.$ =  yy.Product;
break;
case 77:this.$ = $$[$0-8]([$$[$0-5], $$[$0-3], $$[$0-1], $$[$0]]);
break;
case 78:this.$ = yy.Piecewise.chain($$[$0-1]);
break;
case 79:this.$ = yy.Constant(1);
break;
case 80:$$[$0-2].push({condition:yy.Constant(true), if_expr:$$[$0]}); this.$=$$[$0-2];
break;
case 81:this.$=$$[$0]
break;
case 82:$$[$0-2].push($$[$0]); this.$=$$[$0-2];
break;
case 83:this.$=[$$[$0]];
break;
case 84:this.$={condition: $$[$0-2], if_expr: $$[$0]};
break;
case 85:this.$={condition: $$[$0], if_expr: yy.Constant(1)};
break;
case 86:this.$ = yy.Constant(Number(yytext));
break;
case 87:this.$ = yy.Constant(-$$[$0])
break;
case 88:this.$ = yy.FunctionExponent([$$[$0-4], $$[$0-2], $$[$0]]);
break;
case 89:this.$ = yy.FunctionCall($$[$0-3], [$$[$0-1]]);
break;
case 90:this.$ = yy.Identifier(yytext);
break;
case 91:this.$ = yy.FunctionCall($$[$0-3], [$$[$0-1]]);
break;
case 92:
          if(!$$[$0].okForImplicitFunction()) {throw yy.ErrorMsg.badTrigImplicitMultiply();};
          this.$ = yy.FunctionCall($$[$0-1], [$$[$0]]);

break;
case 93:
          if(!$$[$0].okForImplicitFunction()) {throw yy.ErrorMsg.badTrigImplicitMultiply();};
          if($$[$0-2].constantValue != 1) {throw yy.ErrorMsg.badTrigExponent($$[$0-6]._symbol);};
          this.$ = yy.FunctionCall(yy.Identifier(yy.inverses[$$[$0-6]._symbol]), [$$[$0]]);

break;
case 94:
          if($$[$0-4].constantValue != 1) {throw yy.ErrorMsg.badTrigExponent($$[$0-8]._symbol);};
          this.$ = yy.FunctionCall(yy.Identifier(yy.inverses[$$[$0-8]._symbol]), [$$[$0-1]]);

break;
case 95:
          if(!$$[$0].okForImplicitFunction()) {throw yy.ErrorMsg.badTrigImplicitMultiply();};
          if($$[$0-1] != "2") {throw yy.ErrorMsg.badTrigExponent($$[$0-2]._symbol);};
          this.$ = yy.Exponent([yy.FunctionCall($$[$0-2], [$$[$0]]), yy.Constant(2)]);

break;
case 96:
          if($$[$0-3] != "2") {throw yy.ErrorMsg.badTrigExponent($$[$0-4]._symbol);};
          this.$ = yy.Exponent([yy.FunctionCall($$[$0-4], [$$[$0-1]]), yy.Constant(2)]);

break;
case 97: this.$ = yy.Constant(10)
break;
case 98: this.$ = yy.Constant(Number(yytext));
break;
case 99: this.$ = $$[$0]
break;
case 100: this.$ = $$[$0-1]
break;
case 101:this.$ = yy.FunctionCall(yy.Identifier('log'), [$$[$0-1], $$[$0-3]])
break;
case 102:
      if(!$$[$0].okForImplicitFunction()) {throw yy.ErrorMsg.badLogImplicitMultiply();};
      this.$ = yy.FunctionCall(yy.Identifier('log'), [$$[$0], $$[$0-1]])

break;
case 103:
      if($$[$0-3] != "2") {throw yy.ErrorMsg.badLogExponent('log');}
      this.$ = yy.Exponent([yy.FunctionCall(yy.Identifier('log'), [$$[$0-1], $$[$0-4]]), yy.Constant(2)])

break;
case 104:
      if(!$$[$0].okForImplicitFunction()) {throw yy.ErrorMsg.badLogImplicitMultiply();};
      if($$[$0-1] != "2") {throw yy.ErrorMsg.badLogExponent('log');}
      this.$ = yy.Exponent([yy.FunctionCall(yy.Identifier('log'), [$$[$0], $$[$0-2]]), yy.Constant(2)])

break;
case 105:this.$ = yy.FunctionCall(yy.Identifier('ln'), [$$[$0-1]])
break;
case 106:
      if(!$$[$0].okForImplicitFunction()) {throw yy.ErrorMsg.badLogImplicitMultiply();};
      this.$ = yy.FunctionCall(yy.Identifier('ln'), [$$[$0]])

break;
case 107:
      if($$[$0-3] != "2") {throw yy.ErrorMsg.badLogExponent('ln');}
      this.$ = yy.Exponent([yy.FunctionCall(yy.Identifier('ln'), [$$[$0-1]]), yy.Constant(2)])

break;
case 108:
      if(!$$[$0].okForImplicitFunction()) {throw yy.ErrorMsg.badLogImplicitMultiply();};
      if($$[$0-1] != "2") {throw yy.ErrorMsg.badLogExponent('ln');}
      this.$ = yy.Exponent([yy.FunctionCall(yy.Identifier('ln'), [$$[$0]]), yy.Constant(2)])

break;
case 109:this.$ = yy.FunctionCall($$[$0-3], $$[$0-1]);
break;
case 110:this.$ = $$[$0-2].concat([$$[$0]]);
break;
case 111:this.$ = [$$[$0-2], $$[$0]];
break;
case 112:var val = yy.parseFunctionDeclaration($$[$0-1]); this.$ = yy.FunctionDefinition(val.identifier, val.args, $$[$0]);
        yy.setInput(this.$, this._$);

break;
}
},
table: [{3:1,4:2,5:[1,12],6:3,7:4,8:5,9:6,10:7,11:8,12:9,13:10,15:[1,11],19:[1,15],20:14,21:17,22:[1,19],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{1:[3]},{5:[1,50],14:[1,52],16:[1,51],17:[1,53],18:54,34:[1,55],35:[1,56],36:[1,57],37:[1,58]},{5:[1,59]},{5:[1,60]},{5:[1,61]},{5:[1,62]},{5:[1,63]},{5:[1,64]},{5:[1,65]},{5:[2,49],14:[1,66],16:[2,49],17:[2,49],19:[2,49],22:[1,67],25:[2,49],34:[2,49],35:[2,49],36:[2,49],37:[2,49],38:[2,49],40:[2,49],42:[2,49],43:[2,49],45:[2,49],46:[2,49],47:[2,49],48:[2,49],55:[2,49],57:[2,49],58:[2,49],59:[2,49],61:[2,49],66:[2,49],67:[2,49],69:[2,49],76:[2,49],78:[2,49],79:[2,49],80:[2,49]},{4:69,5:[1,68],13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{1:[2,12]},{5:[2,31],14:[2,31],16:[2,31],17:[2,31],19:[2,31],22:[2,31],23:[2,31],25:[2,31],27:[2,31],30:[2,31],34:[2,31],35:[2,31],36:[2,31],37:[2,31],38:[1,72],40:[1,73],42:[2,31],43:[2,31],45:[2,31],46:[2,31],47:[2,31],48:[2,31],49:[2,31],55:[2,31],56:[2,31],57:[2,31],58:[2,31],59:[2,31],61:[2,31],66:[2,31],67:[2,31],69:[2,31],71:[2,31],74:[2,31],76:[2,31],78:[2,31],79:[2,31],80:[2,31]},{5:[2,18],16:[1,74]},{5:[2,17],14:[2,17],16:[2,17],17:[2,17],19:[2,17],22:[2,17],23:[2,17],25:[2,17],27:[2,17],30:[2,17],34:[2,17],35:[2,17],36:[2,17],37:[2,17],38:[2,17],40:[2,17],42:[2,17],43:[2,17],45:[2,17],46:[2,17],47:[2,17],48:[2,17],49:[2,17],55:[2,17],56:[2,17],57:[2,17],58:[2,17],59:[2,17],61:[2,17],64:[2,17],66:[2,17],67:[2,17],69:[2,17],71:[2,17],74:[2,17],76:[2,17],78:[2,17],79:[2,17],80:[2,17]},{5:[2,41],13:70,14:[2,41],16:[2,41],17:[2,41],19:[1,15],22:[1,71],23:[2,41],25:[2,41],27:[2,41],30:[2,41],34:[2,41],35:[2,41],36:[2,41],37:[2,41],38:[2,41],40:[2,41],41:75,42:[1,76],43:[1,77],45:[2,41],46:[2,41],47:[2,41],48:[1,33],49:[2,41],50:28,51:29,52:30,53:31,54:32,55:[1,34],56:[2,41],57:[1,35],58:[1,36],59:[2,41],60:37,61:[1,38],62:39,65:43,66:[1,48],67:[1,49],69:[1,44],71:[2,41],74:[2,41],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,19],16:[2,19]},{5:[2,45],14:[2,45],16:[2,45],17:[2,45],19:[2,45],22:[2,45],23:[2,45],25:[1,80],27:[2,45],30:[2,45],34:[2,45],35:[2,45],36:[2,45],37:[2,45],38:[2,45],40:[2,45],42:[2,45],43:[2,45],44:78,45:[1,81],46:[1,82],47:[1,83],48:[2,45],49:[2,45],55:[2,45],56:[2,45],57:[2,45],58:[2,45],59:[1,79],61:[2,45],66:[2,45],67:[2,45],69:[2,45],71:[2,45],74:[2,45],76:[2,45],78:[2,45],79:[2,45],80:[2,45]},{4:84,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,66],14:[2,66],16:[2,66],17:[2,66],19:[2,66],22:[2,66],23:[2,66],25:[2,66],27:[2,66],30:[2,66],34:[2,66],35:[2,66],36:[2,66],37:[2,66],38:[2,66],40:[2,66],42:[2,66],43:[2,66],45:[2,66],46:[2,66],47:[2,66],48:[2,66],49:[2,66],55:[2,66],56:[2,66],57:[2,66],58:[2,66],59:[2,66],61:[2,66],66:[2,66],67:[2,66],69:[2,66],71:[2,66],74:[2,66],76:[2,66],78:[2,66],79:[2,66],80:[2,66]},{13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:86,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,85],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,71],14:[2,71],16:[2,71],17:[2,71],19:[2,71],22:[2,71],23:[2,71],25:[2,71],27:[2,71],30:[2,71],34:[2,71],35:[2,71],36:[2,71],37:[2,71],38:[2,71],40:[2,71],42:[2,71],43:[2,71],45:[2,71],46:[2,71],47:[2,71],48:[2,71],49:[2,71],55:[2,71],56:[2,71],57:[2,71],58:[2,71],59:[2,71],61:[2,71],66:[2,71],67:[2,71],69:[2,71],71:[2,71],74:[2,71],76:[2,71],78:[2,71],79:[2,71],80:[2,71]},{5:[2,72],14:[2,72],16:[2,72],17:[2,72],19:[2,72],22:[2,72],23:[2,72],25:[2,72],27:[2,72],30:[2,72],34:[2,72],35:[2,72],36:[2,72],37:[2,72],38:[2,72],40:[2,72],42:[2,72],43:[2,72],45:[2,72],46:[2,72],47:[2,72],48:[2,72],49:[2,72],55:[2,72],56:[2,72],57:[2,72],58:[2,72],59:[2,72],61:[2,72],66:[2,72],67:[2,72],69:[2,72],71:[2,72],74:[2,72],76:[2,72],78:[2,72],79:[2,72],80:[2,72]},{5:[2,73],14:[2,73],16:[2,73],17:[2,73],19:[2,73],22:[2,73],23:[2,73],25:[2,73],27:[2,73],30:[2,73],34:[2,73],35:[2,73],36:[2,73],37:[2,73],38:[2,73],40:[2,73],42:[2,73],43:[2,73],45:[2,73],46:[2,73],47:[2,73],48:[2,73],49:[2,73],55:[2,73],56:[2,73],57:[2,73],58:[2,73],59:[2,73],61:[2,73],66:[2,73],67:[2,73],69:[2,73],71:[2,73],74:[2,73],76:[2,73],78:[2,73],79:[2,73],80:[2,73]},{5:[2,74],14:[2,74],16:[2,74],17:[2,74],19:[2,74],22:[2,74],23:[2,74],25:[2,74],27:[2,74],30:[2,74],34:[2,74],35:[2,74],36:[2,74],37:[2,74],38:[2,74],40:[2,74],42:[2,74],43:[2,74],44:87,45:[1,81],46:[1,82],47:[1,83],48:[2,74],49:[2,74],55:[2,74],56:[2,74],57:[2,74],58:[2,74],59:[1,88],61:[2,74],66:[2,74],67:[2,74],69:[2,74],71:[2,74],74:[2,74],76:[2,74],78:[2,74],79:[2,74],80:[2,74]},{5:[2,86],14:[2,86],16:[2,86],17:[2,86],19:[2,86],22:[2,86],23:[2,86],25:[2,86],27:[2,86],30:[2,86],34:[2,86],35:[2,86],36:[2,86],37:[2,86],38:[2,86],40:[2,86],42:[2,86],43:[2,86],45:[2,86],46:[2,86],47:[2,86],48:[2,86],49:[2,86],55:[2,86],56:[2,86],57:[2,86],58:[2,86],59:[2,86],61:[2,86],66:[2,86],67:[2,86],69:[2,86],71:[2,86],74:[2,86],76:[2,86],78:[2,86],79:[2,86],80:[2,86]},{4:90,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],26:89,28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,50],14:[2,50],16:[2,50],17:[2,50],19:[2,50],22:[2,50],23:[2,50],25:[2,50],27:[2,50],30:[2,50],34:[2,50],35:[2,50],36:[2,50],37:[2,50],38:[2,50],40:[2,50],42:[2,50],43:[2,50],45:[2,50],46:[2,50],47:[2,50],48:[2,50],49:[2,50],55:[2,50],56:[2,50],57:[2,50],58:[2,50],59:[2,50],61:[2,50],66:[2,50],67:[2,50],69:[2,50],71:[2,50],74:[2,50],76:[2,50],78:[2,50],79:[2,50],80:[2,50]},{5:[2,51],14:[2,51],16:[2,51],17:[2,51],19:[2,51],22:[2,51],23:[2,51],25:[2,51],27:[2,51],30:[2,51],34:[2,51],35:[2,51],36:[2,51],37:[2,51],38:[2,51],40:[2,51],42:[2,51],43:[2,51],45:[2,51],46:[2,51],47:[2,51],48:[2,51],49:[2,51],55:[2,51],56:[2,51],57:[2,51],58:[2,51],59:[2,51],61:[2,51],66:[2,51],67:[2,51],69:[2,51],71:[2,51],74:[2,51],76:[2,51],78:[2,51],79:[2,51],80:[2,51]},{5:[2,52],14:[2,52],16:[2,52],17:[2,52],19:[2,52],22:[2,52],23:[2,52],25:[2,52],27:[2,52],30:[2,52],34:[2,52],35:[2,52],36:[2,52],37:[2,52],38:[2,52],40:[2,52],42:[2,52],43:[2,52],45:[2,52],46:[2,52],47:[2,52],48:[2,52],49:[2,52],55:[2,52],56:[2,52],57:[2,52],58:[2,52],59:[2,52],61:[2,52],66:[2,52],67:[2,52],69:[2,52],71:[2,52],74:[2,52],76:[2,52],78:[2,52],79:[2,52],80:[2,52]},{5:[2,53],14:[2,53],16:[2,53],17:[2,53],19:[2,53],22:[2,53],23:[2,53],25:[2,53],27:[2,53],30:[2,53],34:[2,53],35:[2,53],36:[2,53],37:[2,53],38:[2,53],40:[2,53],42:[2,53],43:[2,53],45:[2,53],46:[2,53],47:[2,53],48:[2,53],49:[2,53],55:[2,53],56:[2,53],57:[2,53],58:[2,53],59:[2,53],61:[2,53],66:[2,53],67:[2,53],69:[2,53],71:[2,53],74:[2,53],76:[2,53],78:[2,53],79:[2,53],80:[2,53]},{5:[2,54],14:[2,54],16:[2,54],17:[2,54],19:[2,54],22:[2,54],23:[2,54],25:[2,54],27:[2,54],30:[2,54],34:[2,54],35:[2,54],36:[2,54],37:[2,54],38:[2,54],40:[2,54],42:[2,54],43:[2,54],45:[2,54],46:[2,54],47:[2,54],48:[2,54],49:[2,54],55:[2,54],56:[2,54],57:[2,54],58:[2,54],59:[2,54],61:[2,54],66:[2,54],67:[2,54],69:[2,54],71:[2,54],74:[2,54],76:[2,54],78:[2,54],79:[2,54],80:[2,54]},{4:91,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:92,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{48:[1,93]},{25:[1,95],48:[1,94]},{5:[2,63],14:[2,63],16:[2,63],17:[2,63],19:[2,63],22:[2,63],23:[2,63],25:[2,63],27:[2,63],30:[2,63],34:[2,63],35:[2,63],36:[2,63],37:[2,63],38:[2,63],40:[2,63],42:[2,63],43:[2,63],45:[2,63],46:[2,63],47:[2,63],48:[2,63],49:[2,63],55:[2,63],56:[2,63],57:[2,63],58:[2,63],59:[2,63],61:[2,63],66:[2,63],67:[2,63],69:[2,63],71:[2,63],74:[2,63],76:[2,63],78:[2,63],79:[2,63],80:[2,63]},{13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,39:96,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,65],14:[2,65],16:[2,65],17:[2,65],19:[2,65],22:[2,65],23:[2,65],25:[2,65],27:[2,65],30:[2,65],34:[2,65],35:[2,65],36:[2,65],37:[2,65],38:[2,65],40:[2,65],42:[2,65],43:[2,65],45:[2,65],46:[2,65],47:[2,65],48:[2,65],49:[2,65],55:[2,65],56:[2,65],57:[2,65],58:[2,65],59:[2,65],61:[2,65],66:[2,65],67:[2,65],69:[2,65],71:[2,65],74:[2,65],76:[2,65],78:[2,65],79:[2,65],80:[2,65]},{13:70,19:[1,15],22:[1,97],24:22,25:[1,27],28:23,31:24,32:18,39:98,40:[1,21],41:25,45:[1,100],47:[1,99],48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{13:70,19:[1,15],22:[1,101],24:22,25:[1,27],28:23,31:24,32:18,39:102,40:[1,21],41:25,45:[1,103],48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{13:70,19:[1,15],22:[1,104],24:22,25:[1,27],28:23,31:24,32:18,39:105,40:[1,21],41:25,45:[1,106],48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{68:[1,107]},{4:113,12:112,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],70:108,71:[1,109],72:110,73:111,75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{19:[2,90],22:[2,90],25:[2,90],40:[2,90],45:[2,90],47:[2,90],48:[2,90],55:[2,90],57:[2,90],58:[2,90],61:[2,90],64:[2,90],66:[2,90],67:[2,90],69:[2,90],76:[2,90],78:[2,90],79:[2,90],80:[2,90]},{19:[2,97],22:[2,97],25:[2,97],40:[2,97],45:[2,97],48:[2,97],55:[2,97],57:[2,97],58:[2,97],61:[2,97],64:[2,97],66:[2,97],67:[2,97],68:[1,114],69:[2,97],76:[2,97],78:[2,97],79:[2,97],80:[2,97]},{19:[2,98],22:[2,98],25:[2,98],40:[2,98],45:[2,98],48:[2,98],55:[2,98],57:[2,98],58:[2,98],61:[2,98],64:[2,98],66:[2,98],67:[2,98],69:[2,98],76:[2,98],78:[2,98],79:[2,98],80:[2,98]},{68:[2,75]},{68:[2,76]},{1:[2,1]},{4:115,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:116,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:117,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:119,13:118,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{19:[2,32],22:[2,32],25:[2,32],40:[2,32],48:[2,32],55:[2,32],57:[2,32],58:[2,32],61:[2,32],64:[2,32],66:[2,32],67:[2,32],69:[2,32],76:[2,32],78:[2,32],79:[2,32],80:[2,32]},{19:[2,33],22:[2,33],25:[2,33],40:[2,33],48:[2,33],55:[2,33],57:[2,33],58:[2,33],61:[2,33],64:[2,33],66:[2,33],67:[2,33],69:[2,33],76:[2,33],78:[2,33],79:[2,33],80:[2,33]},{19:[2,34],22:[2,34],25:[2,34],40:[2,34],48:[2,34],55:[2,34],57:[2,34],58:[2,34],61:[2,34],64:[2,34],66:[2,34],67:[2,34],69:[2,34],76:[2,34],78:[2,34],79:[2,34],80:[2,34]},{19:[2,35],22:[2,35],25:[2,35],40:[2,35],48:[2,35],55:[2,35],57:[2,35],58:[2,35],61:[2,35],64:[2,35],66:[2,35],67:[2,35],69:[2,35],76:[2,35],78:[2,35],79:[2,35],80:[2,35]},{1:[2,2]},{1:[2,3]},{1:[2,4]},{1:[2,5]},{1:[2,6]},{1:[2,7]},{1:[2,8]},{4:121,5:[1,120],13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:123,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42],81:122},{1:[2,10]},{5:[2,112]},{5:[2,49],14:[2,49],16:[2,49],17:[2,49],19:[2,49],22:[1,67],23:[2,49],25:[2,49],27:[2,49],30:[2,49],34:[2,49],35:[2,49],36:[2,49],37:[2,49],38:[2,49],40:[2,49],42:[2,49],43:[2,49],45:[2,49],46:[2,49],47:[2,49],48:[2,49],49:[2,49],55:[2,49],56:[2,49],57:[2,49],58:[2,49],59:[2,49],61:[2,49],66:[2,49],67:[2,49],69:[2,49],71:[2,49],74:[2,49],76:[2,49],78:[2,49],79:[2,49],80:[2,49]},{4:124,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,39:125,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,39:126,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{21:127,22:[1,128]},{5:[2,42],14:[2,42],16:[2,42],17:[2,42],19:[2,42],22:[2,42],23:[2,42],25:[2,42],27:[2,42],30:[2,42],34:[2,42],35:[2,42],36:[2,42],37:[2,42],38:[2,42],40:[2,42],42:[2,42],43:[2,42],44:87,45:[1,81],46:[1,82],47:[1,83],48:[2,42],49:[2,42],55:[2,42],56:[2,42],57:[2,42],58:[2,42],59:[1,88],61:[2,42],66:[2,42],67:[2,42],69:[2,42],71:[2,42],74:[2,42],76:[2,42],78:[2,42],79:[2,42],80:[2,42]},{13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:129,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:130,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,68],14:[2,68],16:[2,68],17:[2,68],19:[2,68],22:[2,68],23:[2,68],25:[2,68],27:[2,68],30:[2,68],34:[2,68],35:[2,68],36:[2,68],37:[2,68],38:[2,68],40:[2,68],42:[2,68],43:[2,68],45:[2,68],46:[2,68],47:[2,68],48:[2,68],49:[2,68],55:[2,68],56:[2,68],57:[2,68],58:[2,68],59:[2,68],61:[2,68],66:[2,68],67:[2,68],69:[2,68],71:[2,68],74:[2,68],76:[2,68],78:[2,68],79:[2,68],80:[2,68]},{5:[2,69],14:[2,69],16:[2,69],17:[2,69],19:[2,69],22:[2,69],23:[2,69],25:[2,69],27:[2,69],30:[2,69],34:[2,69],35:[2,69],36:[2,69],37:[2,69],38:[2,69],40:[2,69],42:[2,69],43:[2,69],45:[2,69],46:[2,69],47:[2,69],48:[2,69],49:[2,69],55:[2,69],56:[2,69],57:[2,69],58:[2,69],59:[2,69],61:[2,69],66:[2,69],67:[2,69],69:[2,69],71:[2,69],74:[2,69],76:[2,69],78:[2,69],79:[2,69],80:[2,69]},{4:131,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,46],14:[2,46],16:[2,46],17:[2,46],19:[2,46],22:[2,46],23:[2,46],25:[2,46],27:[2,46],30:[2,46],34:[2,46],35:[2,46],36:[2,46],37:[2,46],38:[2,46],40:[2,46],42:[2,46],43:[2,46],45:[2,46],46:[2,46],47:[2,46],48:[2,46],49:[2,46],55:[2,46],56:[2,46],57:[2,46],58:[2,46],59:[2,46],61:[2,46],64:[2,46],66:[2,46],67:[2,46],69:[2,46],71:[2,46],74:[2,46],76:[2,46],78:[2,46],79:[2,46],80:[2,46]},{5:[2,47],14:[2,47],16:[2,47],17:[2,47],19:[2,47],22:[2,47],23:[2,47],25:[2,47],27:[2,47],30:[2,47],34:[2,47],35:[2,47],36:[2,47],37:[2,47],38:[2,47],40:[2,47],42:[2,47],43:[2,47],45:[2,47],46:[2,47],47:[2,47],48:[2,47],49:[2,47],55:[2,47],56:[2,47],57:[2,47],58:[2,47],59:[2,47],61:[2,47],64:[2,47],66:[2,47],67:[2,47],69:[2,47],71:[2,47],74:[2,47],76:[2,47],78:[2,47],79:[2,47],80:[2,47]},{48:[1,132]},{16:[1,133],23:[1,134]},{5:[2,87],14:[2,87],16:[2,87],17:[2,87],19:[2,87],22:[2,87],23:[2,87],25:[2,87],27:[2,87],30:[2,87],34:[2,87],35:[2,87],36:[2,87],37:[2,87],38:[2,87],40:[2,87],42:[2,87],43:[2,87],44:135,45:[1,81],46:[1,82],47:[1,83],48:[2,87],49:[2,87],55:[2,87],56:[2,87],57:[2,87],58:[2,87],59:[2,87],61:[2,87],66:[2,87],67:[2,87],69:[2,87],71:[2,87],74:[2,87],76:[2,87],78:[2,87],79:[2,87],80:[2,87]},{5:[2,70],14:[2,70],16:[2,70],17:[2,70],19:[2,70],22:[2,70],23:[2,70],25:[1,80],27:[2,70],30:[2,70],34:[2,70],35:[2,70],36:[2,70],37:[2,70],38:[2,70],40:[2,70],42:[2,70],43:[2,70],44:78,45:[1,81],46:[1,82],47:[1,83],48:[2,70],49:[2,70],55:[2,70],56:[2,70],57:[2,70],58:[2,70],59:[1,79],61:[2,70],66:[2,70],67:[2,70],69:[2,70],71:[2,70],74:[2,70],76:[2,70],78:[2,70],79:[2,70],80:[2,70]},{5:[2,58],14:[2,58],16:[2,58],17:[2,58],19:[2,58],22:[2,58],23:[2,58],25:[2,58],27:[2,58],30:[2,58],34:[2,58],35:[2,58],36:[2,58],37:[2,58],38:[2,58],40:[2,58],42:[2,58],43:[2,58],45:[2,58],46:[2,58],47:[2,58],48:[2,58],49:[2,58],55:[2,58],56:[2,58],57:[2,58],58:[2,58],59:[2,58],61:[2,58],66:[2,58],67:[2,58],69:[2,58],71:[2,58],74:[2,58],76:[2,58],78:[2,58],79:[2,58],80:[2,58]},{5:[2,62],14:[2,62],16:[2,62],17:[2,62],19:[2,62],22:[2,62],23:[2,62],25:[2,62],27:[2,62],30:[2,62],34:[2,62],35:[2,62],36:[2,62],37:[2,62],38:[2,62],40:[2,62],42:[2,62],43:[2,62],45:[2,62],46:[2,62],47:[2,62],48:[2,62],49:[2,62],55:[2,62],56:[2,62],57:[2,62],58:[2,62],59:[2,62],61:[2,62],66:[2,62],67:[2,62],69:[2,62],71:[2,62],74:[2,62],76:[2,62],78:[2,62],79:[2,62],80:[2,62]},{16:[1,138],27:[1,136],29:137,30:[1,139]},{16:[2,28],27:[2,28],30:[2,28]},{49:[1,140]},{56:[1,141]},{4:142,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:143,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:144,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,64],13:70,14:[2,64],16:[2,64],17:[2,64],19:[1,15],22:[1,71],23:[2,64],25:[2,64],27:[2,64],30:[2,64],34:[2,64],35:[2,64],36:[2,64],37:[2,64],38:[2,64],40:[2,64],41:75,42:[1,76],43:[1,77],45:[2,64],46:[2,64],47:[2,64],48:[1,33],49:[2,64],50:28,51:29,52:30,53:31,54:32,55:[1,34],56:[2,64],57:[1,35],58:[1,36],59:[2,64],60:37,61:[1,38],62:39,65:43,66:[1,48],67:[1,49],69:[1,44],71:[2,64],74:[2,64],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:145,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,92],13:70,14:[2,92],16:[2,92],17:[2,92],19:[1,15],22:[1,71],23:[2,92],25:[2,92],27:[2,92],30:[2,92],34:[2,92],35:[2,92],36:[2,92],37:[2,92],38:[2,92],40:[2,92],41:75,42:[1,76],43:[1,77],45:[2,92],46:[2,92],47:[2,92],48:[1,33],49:[2,92],50:28,51:29,52:30,53:31,54:32,55:[1,34],56:[2,92],57:[1,35],58:[1,36],59:[2,92],60:37,61:[1,38],62:39,65:43,66:[1,48],67:[1,49],69:[1,44],71:[2,92],74:[2,92],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{48:[1,146]},{13:70,19:[1,15],22:[1,148],24:22,25:[1,27],28:23,31:24,32:18,39:147,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:149,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,102],13:70,14:[2,102],16:[2,102],17:[2,102],19:[1,15],22:[1,71],23:[2,102],25:[2,102],27:[2,102],30:[2,102],34:[2,102],35:[2,102],36:[2,102],37:[2,102],38:[2,102],40:[2,102],41:75,42:[1,76],43:[1,77],45:[2,102],46:[2,102],47:[2,102],48:[1,33],49:[2,102],50:28,51:29,52:30,53:31,54:32,55:[1,34],56:[2,102],57:[1,35],58:[1,36],59:[2,102],60:37,61:[1,38],62:39,65:43,66:[1,48],67:[1,49],69:[1,44],71:[2,102],74:[2,102],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{13:70,19:[1,15],22:[1,150],24:22,25:[1,27],28:23,31:24,32:18,39:151,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:152,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,106],13:70,14:[2,106],16:[2,106],17:[2,106],19:[1,15],22:[1,71],23:[2,106],25:[2,106],27:[2,106],30:[2,106],34:[2,106],35:[2,106],36:[2,106],37:[2,106],38:[2,106],40:[2,106],41:75,42:[1,76],43:[1,77],45:[2,106],46:[2,106],47:[2,106],48:[1,33],49:[2,106],50:28,51:29,52:30,53:31,54:32,55:[1,34],56:[2,106],57:[1,35],58:[1,36],59:[2,106],60:37,61:[1,38],62:39,65:43,66:[1,48],67:[1,49],69:[1,44],71:[2,106],74:[2,106],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{13:70,19:[1,15],22:[1,153],24:22,25:[1,27],28:23,31:24,32:18,39:154,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{48:[1,155]},{71:[1,156]},{5:[2,79],14:[2,79],16:[2,79],17:[2,79],19:[2,79],22:[2,79],23:[2,79],25:[2,79],27:[2,79],30:[2,79],34:[2,79],35:[2,79],36:[2,79],37:[2,79],38:[2,79],40:[2,79],42:[2,79],43:[2,79],45:[2,79],46:[2,79],47:[2,79],48:[2,79],49:[2,79],55:[2,79],56:[2,79],57:[2,79],58:[2,79],59:[2,79],61:[2,79],66:[2,79],67:[2,79],69:[2,79],71:[2,79],74:[2,79],76:[2,79],78:[2,79],79:[2,79],80:[2,79]},{16:[1,157],71:[2,81]},{16:[2,83],71:[2,83]},{16:[2,85],71:[2,85],74:[1,158]},{14:[1,160],18:159,34:[1,55],35:[1,56],36:[1,57],37:[1,58]},{13:161,19:[1,15],48:[1,162]},{5:[1,163]},{5:[2,15]},{5:[2,14]},{5:[2,49],18:164,19:[2,49],22:[1,67],25:[2,49],34:[1,55],35:[1,56],36:[1,57],37:[1,58],38:[2,49],40:[2,49],42:[2,49],43:[2,49],45:[2,49],46:[2,49],47:[2,49],48:[2,49],55:[2,49],57:[2,49],58:[2,49],59:[2,49],61:[2,49],66:[2,49],67:[2,49],69:[2,49],76:[2,49],78:[2,49],79:[2,49],80:[2,49]},{5:[2,36],16:[2,36],18:165,34:[1,55],35:[1,56],36:[1,57],37:[1,58],71:[2,36],74:[2,36]},{1:[2,9]},{5:[2,13]},{16:[1,167],23:[1,166]},{16:[1,169],23:[1,168]},{23:[1,134]},{5:[2,39],13:70,14:[2,39],16:[2,39],17:[2,39],19:[1,15],22:[1,71],23:[2,39],25:[2,39],27:[2,39],30:[2,39],34:[2,39],35:[2,39],36:[2,39],37:[2,39],38:[2,39],40:[2,39],41:75,42:[1,76],43:[1,77],45:[2,39],46:[2,39],47:[2,39],48:[1,33],49:[2,39],50:28,51:29,52:30,53:31,54:32,55:[1,34],56:[2,39],57:[1,35],58:[1,36],59:[2,39],60:37,61:[1,38],62:39,65:43,66:[1,48],67:[1,49],69:[1,44],71:[2,39],74:[2,39],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,40],13:70,14:[2,40],16:[2,40],17:[2,40],19:[1,15],22:[1,71],23:[2,40],25:[2,40],27:[2,40],30:[2,40],34:[2,40],35:[2,40],36:[2,40],37:[2,40],38:[2,40],40:[2,40],41:75,42:[1,76],43:[1,77],45:[2,40],46:[2,40],47:[2,40],48:[1,33],49:[2,40],50:28,51:29,52:30,53:31,54:32,55:[1,34],56:[2,40],57:[1,35],58:[1,36],59:[2,40],60:37,61:[1,38],62:39,65:43,66:[1,48],67:[1,49],69:[1,44],71:[2,40],74:[2,40],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,20],16:[2,20]},{4:170,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,43],14:[2,43],16:[2,43],17:[2,43],19:[2,43],22:[2,43],23:[2,43],25:[1,80],27:[2,43],30:[2,43],34:[2,43],35:[2,43],36:[2,43],37:[2,43],38:[2,43],40:[2,43],42:[2,43],43:[2,43],44:78,45:[1,81],46:[1,82],47:[1,83],48:[2,43],49:[2,43],55:[2,43],56:[2,43],57:[2,43],58:[2,43],59:[1,79],61:[2,43],66:[2,43],67:[2,43],69:[2,43],71:[2,43],74:[2,43],76:[2,43],78:[2,43],79:[2,43],80:[2,43]},{5:[2,44],14:[2,44],16:[2,44],17:[2,44],19:[2,44],22:[2,44],23:[2,44],25:[1,80],27:[2,44],30:[2,44],34:[2,44],35:[2,44],36:[2,44],37:[2,44],38:[2,44],40:[2,44],42:[2,44],43:[2,44],44:78,45:[1,81],46:[1,82],47:[1,83],48:[2,44],49:[2,44],55:[2,44],56:[2,44],57:[2,44],58:[2,44],59:[1,79],61:[2,44],66:[2,44],67:[2,44],69:[2,44],71:[2,44],74:[2,44],76:[2,44],78:[2,44],79:[2,44],80:[2,44]},{27:[1,171]},{4:172,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:173,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,55],14:[2,55],16:[2,55],17:[2,55],19:[2,55],22:[2,55],23:[2,55],25:[2,55],27:[2,55],30:[2,55],34:[2,55],35:[2,55],36:[2,55],37:[2,55],38:[2,55],40:[2,55],42:[2,55],43:[2,55],45:[2,55],46:[2,55],47:[2,55],48:[2,55],49:[2,55],55:[2,55],56:[2,55],57:[2,55],58:[2,55],59:[2,55],61:[2,55],66:[2,55],67:[2,55],69:[2,55],71:[2,55],74:[2,55],76:[2,55],78:[2,55],79:[2,55],80:[2,55]},{5:[2,67],14:[2,67],16:[2,67],17:[2,67],19:[2,67],22:[2,67],23:[2,67],25:[2,67],27:[2,67],30:[2,67],34:[2,67],35:[2,67],36:[2,67],37:[2,67],38:[2,67],40:[2,67],42:[2,67],43:[2,67],45:[2,67],46:[2,67],47:[2,67],48:[2,67],49:[2,67],55:[2,67],56:[2,67],57:[2,67],58:[2,67],59:[2,67],61:[2,67],66:[2,67],67:[2,67],69:[2,67],71:[2,67],74:[2,67],76:[2,67],78:[2,67],79:[2,67],80:[2,67]},{5:[2,22],14:[2,22],16:[2,22],17:[2,22],19:[2,22],22:[2,22],23:[2,22],25:[2,22],27:[2,22],30:[2,22],34:[2,22],35:[2,22],36:[2,22],37:[2,22],38:[2,22],40:[2,22],42:[2,22],43:[2,22],45:[2,22],46:[2,22],47:[2,22],48:[2,22],49:[2,22],55:[2,22],56:[2,22],57:[2,22],58:[2,22],59:[2,22],61:[2,22],66:[2,22],67:[2,22],69:[2,22],71:[2,22],74:[2,22],76:[2,22],78:[2,22],79:[2,22],80:[2,22]},{4:90,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],26:174,28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:175,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,30:[1,176],31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{16:[1,177],19:[2,24],22:[2,24],25:[2,24],40:[2,24],48:[2,24],55:[2,24],57:[2,24],58:[2,24],61:[2,24],64:[2,24],66:[2,24],67:[2,24],69:[2,24],76:[2,24],78:[2,24],79:[2,24],80:[2,24]},{5:[2,56],14:[2,56],16:[2,56],17:[2,56],19:[2,56],22:[2,56],23:[2,56],25:[2,56],27:[2,56],30:[2,56],34:[2,56],35:[2,56],36:[2,56],37:[2,56],38:[2,56],40:[2,56],42:[2,56],43:[2,56],45:[2,56],46:[2,56],47:[2,56],48:[2,56],49:[2,56],55:[2,56],56:[2,56],57:[2,56],58:[2,56],59:[2,56],61:[2,56],66:[2,56],67:[2,56],69:[2,56],71:[2,56],74:[2,56],76:[2,56],78:[2,56],79:[2,56],80:[2,56]},{5:[2,57],14:[2,57],16:[2,57],17:[2,57],19:[2,57],22:[2,57],23:[2,57],25:[2,57],27:[2,57],30:[2,57],34:[2,57],35:[2,57],36:[2,57],37:[2,57],38:[2,57],40:[2,57],42:[2,57],43:[2,57],45:[2,57],46:[2,57],47:[2,57],48:[2,57],49:[2,57],55:[2,57],56:[2,57],57:[2,57],58:[2,57],59:[2,57],61:[2,57],66:[2,57],67:[2,57],69:[2,57],71:[2,57],74:[2,57],76:[2,57],78:[2,57],79:[2,57],80:[2,57]},{49:[1,178]},{49:[1,179]},{27:[1,180]},{23:[1,181]},{40:[1,182]},{5:[2,95],13:70,14:[2,95],16:[2,95],17:[2,95],19:[1,15],22:[1,71],23:[2,95],25:[2,95],27:[2,95],30:[2,95],34:[2,95],35:[2,95],36:[2,95],37:[2,95],38:[2,95],40:[2,95],41:75,42:[1,76],43:[1,77],45:[2,95],46:[2,95],47:[2,95],48:[1,33],49:[2,95],50:28,51:29,52:30,53:31,54:32,55:[1,34],56:[2,95],57:[1,35],58:[1,36],59:[2,95],60:37,61:[1,38],62:39,65:43,66:[1,48],67:[1,49],69:[1,44],71:[2,95],74:[2,95],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:183,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{23:[1,184]},{4:185,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,104],13:70,14:[2,104],16:[2,104],17:[2,104],19:[1,15],22:[1,71],23:[2,104],25:[2,104],27:[2,104],30:[2,104],34:[2,104],35:[2,104],36:[2,104],37:[2,104],38:[2,104],40:[2,104],41:75,42:[1,76],43:[1,77],45:[2,104],46:[2,104],47:[2,104],48:[1,33],49:[2,104],50:28,51:29,52:30,53:31,54:32,55:[1,34],56:[2,104],57:[1,35],58:[1,36],59:[2,104],60:37,61:[1,38],62:39,65:43,66:[1,48],67:[1,49],69:[1,44],71:[2,104],74:[2,104],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{23:[1,186]},{4:187,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,108],13:70,14:[2,108],16:[2,108],17:[2,108],19:[1,15],22:[1,71],23:[2,108],25:[2,108],27:[2,108],30:[2,108],34:[2,108],35:[2,108],36:[2,108],37:[2,108],38:[2,108],40:[2,108],41:75,42:[1,76],43:[1,77],45:[2,108],46:[2,108],47:[2,108],48:[1,33],49:[2,108],50:28,51:29,52:30,53:31,54:32,55:[1,34],56:[2,108],57:[1,35],58:[1,36],59:[2,108],60:37,61:[1,38],62:39,65:43,66:[1,48],67:[1,49],69:[1,44],71:[2,108],74:[2,108],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{13:188,19:[1,15]},{5:[2,78],14:[2,78],16:[2,78],17:[2,78],19:[2,78],22:[2,78],23:[2,78],25:[2,78],27:[2,78],30:[2,78],34:[2,78],35:[2,78],36:[2,78],37:[2,78],38:[2,78],40:[2,78],42:[2,78],43:[2,78],45:[2,78],46:[2,78],47:[2,78],48:[2,78],49:[2,78],55:[2,78],56:[2,78],57:[2,78],58:[2,78],59:[2,78],61:[2,78],66:[2,78],67:[2,78],69:[2,78],71:[2,78],74:[2,78],76:[2,78],78:[2,78],79:[2,78],80:[2,78]},{4:189,12:112,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],73:190,75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:191,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:119,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:192,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{19:[2,99],22:[2,99],25:[2,99],40:[2,99],45:[2,99],48:[2,99],55:[2,99],57:[2,99],58:[2,99],61:[2,99],64:[2,99],66:[2,99],67:[2,99],69:[2,99],76:[2,99],78:[2,99],79:[2,99],80:[2,99]},{4:193,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{1:[2,11]},{4:194,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:195,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,109],14:[2,109],16:[2,109],17:[2,109],19:[2,109],22:[2,109],23:[2,109],25:[2,109],27:[2,109],30:[2,109],34:[2,109],35:[2,109],36:[2,109],37:[2,109],38:[2,109],40:[2,109],42:[2,109],43:[2,109],45:[2,109],46:[2,109],47:[2,109],48:[2,109],49:[2,109],55:[2,109],56:[2,109],57:[2,109],58:[2,109],59:[2,109],61:[2,109],66:[2,109],67:[2,109],69:[2,109],71:[2,109],74:[2,109],76:[2,109],78:[2,109],79:[2,109],80:[2,109]},{4:196,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,89],14:[2,89],16:[2,89],17:[2,89],19:[2,89],22:[2,89],23:[2,89],25:[2,89],27:[2,89],30:[2,89],34:[2,89],35:[2,89],36:[2,89],37:[2,89],38:[2,89],40:[2,89],42:[2,89],43:[2,89],44:197,45:[1,81],46:[1,82],47:[1,83],48:[2,89],49:[2,89],55:[2,89],56:[2,89],57:[2,89],58:[2,89],59:[2,89],61:[2,89],66:[2,89],67:[2,89],69:[2,89],71:[2,89],74:[2,89],76:[2,89],78:[2,89],79:[2,89],80:[2,89]},{4:198,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{16:[1,133]},{5:[2,30],14:[2,30],16:[2,30],17:[2,30],19:[2,30],22:[2,30],23:[2,30],25:[2,30],27:[2,30],30:[2,30],34:[2,30],35:[2,30],36:[2,30],37:[2,30],38:[2,30],40:[2,30],42:[2,30],43:[2,30],45:[2,30],46:[2,30],47:[2,30],48:[2,30],49:[2,30],55:[2,30],56:[2,30],57:[2,30],58:[2,30],59:[2,30],61:[2,30],66:[2,30],67:[2,30],69:[2,30],71:[2,30],74:[2,30],76:[2,30],78:[2,30],79:[2,30],80:[2,30]},{49:[1,199]},{23:[1,200]},{16:[1,202],27:[1,201]},{16:[2,29],27:[2,29],30:[2,29]},{16:[1,203],19:[2,25],22:[2,25],25:[2,25],40:[2,25],48:[2,25],55:[2,25],57:[2,25],58:[2,25],61:[2,25],64:[2,25],66:[2,25],67:[2,25],69:[2,25],76:[2,25],78:[2,25],79:[2,25],80:[2,25]},{19:[2,26],22:[2,26],25:[2,26],40:[2,26],48:[2,26],55:[2,26],57:[2,26],58:[2,26],61:[2,26],64:[2,26],66:[2,26],67:[2,26],69:[2,26],76:[2,26],78:[2,26],79:[2,26],80:[2,26]},{48:[1,204]},{5:[2,60],14:[2,60],16:[2,60],17:[2,60],19:[2,60],22:[2,60],23:[2,60],25:[2,60],27:[2,60],30:[2,60],34:[2,60],35:[2,60],36:[2,60],37:[2,60],38:[2,60],40:[2,60],42:[2,60],43:[2,60],45:[2,60],46:[2,60],47:[2,60],48:[2,60],49:[2,60],55:[2,60],56:[2,60],57:[2,60],58:[2,60],59:[2,60],61:[2,60],66:[2,60],67:[2,60],69:[2,60],71:[2,60],74:[2,60],76:[2,60],78:[2,60],79:[2,60],80:[2,60]},{48:[1,205]},{5:[2,91],14:[2,91],16:[2,91],17:[2,91],19:[2,91],22:[2,91],23:[2,91],25:[2,91],27:[2,91],30:[2,91],34:[2,91],35:[2,91],36:[2,91],37:[2,91],38:[2,91],40:[2,91],42:[2,91],43:[2,91],45:[2,91],46:[2,91],47:[2,91],48:[2,91],49:[2,91],55:[2,91],56:[2,91],57:[2,91],58:[2,91],59:[2,91],61:[2,91],66:[2,91],67:[2,91],69:[2,91],71:[2,91],74:[2,91],76:[2,91],78:[2,91],79:[2,91],80:[2,91]},{40:[1,207],63:206,64:[1,26]},{23:[1,208]},{5:[2,101],14:[2,101],16:[2,101],17:[2,101],19:[2,101],22:[2,101],23:[2,101],25:[2,101],27:[2,101],30:[2,101],34:[2,101],35:[2,101],36:[2,101],37:[2,101],38:[2,101],40:[2,101],42:[2,101],43:[2,101],45:[2,101],46:[2,101],47:[2,101],48:[2,101],49:[2,101],55:[2,101],56:[2,101],57:[2,101],58:[2,101],59:[2,101],61:[2,101],66:[2,101],67:[2,101],69:[2,101],71:[2,101],74:[2,101],76:[2,101],78:[2,101],79:[2,101],80:[2,101]},{23:[1,209]},{5:[2,105],14:[2,105],16:[2,105],17:[2,105],19:[2,105],22:[2,105],23:[2,105],25:[2,105],27:[2,105],30:[2,105],34:[2,105],35:[2,105],36:[2,105],37:[2,105],38:[2,105],40:[2,105],42:[2,105],43:[2,105],45:[2,105],46:[2,105],47:[2,105],48:[2,105],49:[2,105],55:[2,105],56:[2,105],57:[2,105],58:[2,105],59:[2,105],61:[2,105],66:[2,105],67:[2,105],69:[2,105],71:[2,105],74:[2,105],76:[2,105],78:[2,105],79:[2,105],80:[2,105]},{23:[1,210]},{14:[1,211]},{14:[1,160],18:159,34:[1,55],35:[1,56],36:[1,57],37:[1,58],71:[2,80]},{16:[2,82],71:[2,82]},{16:[2,84],71:[2,84]},{16:[2,37],71:[2,37],74:[2,37]},{49:[1,212]},{5:[2,16]},{5:[2,38],16:[2,38],71:[2,38],74:[2,38]},{16:[2,110],23:[2,110]},{5:[2,88],14:[2,88],16:[2,88],17:[2,88],19:[2,88],22:[2,88],23:[2,88],25:[2,88],27:[2,88],30:[2,88],34:[2,88],35:[2,88],36:[2,88],37:[2,88],38:[2,88],40:[2,88],42:[2,88],43:[2,88],45:[2,88],46:[2,88],47:[2,88],48:[2,88],49:[2,88],55:[2,88],56:[2,88],57:[2,88],58:[2,88],59:[2,88],61:[2,88],66:[2,88],67:[2,88],69:[2,88],71:[2,88],74:[2,88],76:[2,88],78:[2,88],79:[2,88],80:[2,88]},{16:[2,111],23:[2,111]},{5:[2,48],14:[2,48],16:[2,48],17:[2,48],19:[2,48],22:[2,48],23:[2,48],25:[2,48],27:[2,48],30:[2,48],34:[2,48],35:[2,48],36:[2,48],37:[2,48],38:[2,48],40:[2,48],42:[2,48],43:[2,48],45:[2,48],46:[2,48],47:[2,48],48:[2,48],49:[2,48],55:[2,48],56:[2,48],57:[2,48],58:[2,48],59:[2,48],61:[2,48],64:[2,48],66:[2,48],67:[2,48],69:[2,48],71:[2,48],74:[2,48],76:[2,48],78:[2,48],79:[2,48],80:[2,48]},{5:[2,21],16:[2,21]},{5:[2,23],14:[2,23],16:[2,23],17:[2,23],19:[2,23],22:[2,23],23:[2,23],25:[2,23],27:[2,23],30:[2,23],34:[2,23],35:[2,23],36:[2,23],37:[2,23],38:[2,23],40:[2,23],42:[2,23],43:[2,23],45:[2,23],46:[2,23],47:[2,23],48:[2,23],49:[2,23],55:[2,23],56:[2,23],57:[2,23],58:[2,23],59:[2,23],61:[2,23],66:[2,23],67:[2,23],69:[2,23],71:[2,23],74:[2,23],76:[2,23],78:[2,23],79:[2,23],80:[2,23]},{4:175,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{19:[2,27],22:[2,27],25:[2,27],40:[2,27],48:[2,27],55:[2,27],57:[2,27],58:[2,27],61:[2,27],64:[2,27],66:[2,27],67:[2,27],69:[2,27],76:[2,27],78:[2,27],79:[2,27],80:[2,27]},{4:213,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:214,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{49:[1,215]},{64:[1,216]},{5:[2,96],14:[2,96],16:[2,96],17:[2,96],19:[2,96],22:[2,96],23:[2,96],25:[2,96],27:[2,96],30:[2,96],34:[2,96],35:[2,96],36:[2,96],37:[2,96],38:[2,96],40:[2,96],42:[2,96],43:[2,96],45:[2,96],46:[2,96],47:[2,96],48:[2,96],49:[2,96],55:[2,96],56:[2,96],57:[2,96],58:[2,96],59:[2,96],61:[2,96],66:[2,96],67:[2,96],69:[2,96],71:[2,96],74:[2,96],76:[2,96],78:[2,96],79:[2,96],80:[2,96]},{5:[2,103],14:[2,103],16:[2,103],17:[2,103],19:[2,103],22:[2,103],23:[2,103],25:[2,103],27:[2,103],30:[2,103],34:[2,103],35:[2,103],36:[2,103],37:[2,103],38:[2,103],40:[2,103],42:[2,103],43:[2,103],45:[2,103],46:[2,103],47:[2,103],48:[2,103],49:[2,103],55:[2,103],56:[2,103],57:[2,103],58:[2,103],59:[2,103],61:[2,103],66:[2,103],67:[2,103],69:[2,103],71:[2,103],74:[2,103],76:[2,103],78:[2,103],79:[2,103],80:[2,103]},{5:[2,107],14:[2,107],16:[2,107],17:[2,107],19:[2,107],22:[2,107],23:[2,107],25:[2,107],27:[2,107],30:[2,107],34:[2,107],35:[2,107],36:[2,107],37:[2,107],38:[2,107],40:[2,107],42:[2,107],43:[2,107],45:[2,107],46:[2,107],47:[2,107],48:[2,107],49:[2,107],55:[2,107],56:[2,107],57:[2,107],58:[2,107],59:[2,107],61:[2,107],66:[2,107],67:[2,107],69:[2,107],71:[2,107],74:[2,107],76:[2,107],78:[2,107],79:[2,107],80:[2,107]},{4:217,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{19:[2,100],22:[2,100],25:[2,100],40:[2,100],45:[2,100],48:[2,100],55:[2,100],57:[2,100],58:[2,100],61:[2,100],64:[2,100],66:[2,100],67:[2,100],69:[2,100],76:[2,100],78:[2,100],79:[2,100],80:[2,100]},{49:[1,218]},{49:[1,219]},{13:70,19:[1,15],22:[1,221],24:22,25:[1,27],28:23,31:24,32:18,39:220,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{49:[2,87]},{49:[1,222]},{5:[2,59],14:[2,59],16:[2,59],17:[2,59],19:[2,59],22:[2,59],23:[2,59],25:[2,59],27:[2,59],30:[2,59],34:[2,59],35:[2,59],36:[2,59],37:[2,59],38:[2,59],40:[2,59],42:[2,59],43:[2,59],45:[2,59],46:[2,59],47:[2,59],48:[2,59],49:[2,59],55:[2,59],56:[2,59],57:[2,59],58:[2,59],59:[2,59],61:[2,59],66:[2,59],67:[2,59],69:[2,59],71:[2,59],74:[2,59],76:[2,59],78:[2,59],79:[2,59],80:[2,59]},{5:[2,61],14:[2,61],16:[2,61],17:[2,61],19:[2,61],22:[2,61],23:[2,61],25:[2,61],27:[2,61],30:[2,61],34:[2,61],35:[2,61],36:[2,61],37:[2,61],38:[2,61],40:[2,61],42:[2,61],43:[2,61],45:[2,61],46:[2,61],47:[2,61],48:[2,61],49:[2,61],55:[2,61],56:[2,61],57:[2,61],58:[2,61],59:[2,61],61:[2,61],66:[2,61],67:[2,61],69:[2,61],71:[2,61],74:[2,61],76:[2,61],78:[2,61],79:[2,61],80:[2,61]},{5:[2,93],13:70,14:[2,93],16:[2,93],17:[2,93],19:[1,15],22:[1,71],23:[2,93],25:[2,93],27:[2,93],30:[2,93],34:[2,93],35:[2,93],36:[2,93],37:[2,93],38:[2,93],40:[2,93],41:75,42:[1,76],43:[1,77],45:[2,93],46:[2,93],47:[2,93],48:[1,33],49:[2,93],50:28,51:29,52:30,53:31,54:32,55:[1,34],56:[2,93],57:[1,35],58:[1,36],59:[2,93],60:37,61:[1,38],62:39,65:43,66:[1,48],67:[1,49],69:[1,44],71:[2,93],74:[2,93],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{4:223,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{44:224,45:[1,81],46:[1,82],47:[1,83]},{23:[1,225]},{4:226,13:70,19:[1,15],22:[1,71],24:22,25:[1,27],28:23,31:24,32:18,33:13,39:16,40:[1,21],41:25,48:[1,33],50:28,51:29,52:30,53:31,54:32,55:[1,34],57:[1,35],58:[1,36],60:37,61:[1,38],62:39,63:20,64:[1,26],65:43,66:[1,48],67:[1,49],69:[1,44],75:40,76:[1,45],77:41,78:[1,46],79:[1,47],80:[1,42]},{5:[2,94],14:[2,94],16:[2,94],17:[2,94],19:[2,94],22:[2,94],23:[2,94],25:[2,94],27:[2,94],30:[2,94],34:[2,94],35:[2,94],36:[2,94],37:[2,94],38:[2,94],40:[2,94],42:[2,94],43:[2,94],45:[2,94],46:[2,94],47:[2,94],48:[2,94],49:[2,94],55:[2,94],56:[2,94],57:[2,94],58:[2,94],59:[2,94],61:[2,94],66:[2,94],67:[2,94],69:[2,94],71:[2,94],74:[2,94],76:[2,94],78:[2,94],79:[2,94],80:[2,94]},{5:[2,77],14:[2,77],16:[2,77],17:[2,77],19:[2,77],22:[2,77],23:[2,77],25:[2,77],27:[2,77],30:[2,77],34:[2,77],35:[2,77],36:[2,77],37:[2,77],38:[2,77],40:[2,77],42:[2,77],43:[2,77],45:[2,77],46:[2,77],47:[2,77],48:[2,77],49:[2,77],55:[2,77],56:[2,77],57:[2,77],58:[2,77],59:[2,77],61:[2,77],66:[2,77],67:[2,77],69:[2,77],71:[2,77],74:[2,77],76:[2,77],78:[2,77],79:[2,77],80:[2,77]}],
defaultActions: {12:[2,12],48:[2,75],49:[2,76],50:[2,1],59:[2,2],60:[2,3],61:[2,4],62:[2,5],63:[2,6],64:[2,7],65:[2,8],68:[2,10],69:[2,112],116:[2,15],117:[2,14],120:[2,9],121:[2,13],163:[2,11],194:[2,16],216:[2,87]},
parseError: function parseError(str, hash) {
    throw new Error(str);
},
parse: function parse(input) {
    var self = this, stack = [0], vstack = [null], lstack = [], table = this.table, yytext = "", yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    this.lexer.setInput(input);
    this.lexer.yy = this.yy;
    this.yy.lexer = this.lexer;
    this.yy.parser = this;
    if (typeof this.lexer.yylloc == "undefined")
        this.lexer.yylloc = {};
    var yyloc = this.lexer.yylloc;
    lstack.push(yyloc);
    var ranges = this.lexer.options && this.lexer.options.ranges;
    if (typeof this.yy.parseError === "function")
        this.parseError = this.yy.parseError;
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    function lex() {
        var token;
        token = self.lexer.lex() || 1;
        if (typeof token !== "number") {
            token = self.symbols_[token] || token;
        }
        return token;
    }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == "undefined") {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
        if (typeof action === "undefined" || !action.length || !action[0]) {
            var errStr = "";
            if (!recovering) {
                expected = [];
                for (p in table[state])
                    if (this.terminals_[p] && p > 2) {
                        expected.push("'" + this.terminals_[p] + "'");
                    }
                if (this.lexer.showPosition) {
                    errStr = "Parse error on line " + (yylineno + 1) + ":\n" + this.lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + (this.terminals_[symbol] || symbol) + "'";
                } else {
                    errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == 1?"end of input":"'" + (this.terminals_[symbol] || symbol) + "'");
                }
                this.parseError(errStr, {text: this.lexer.match, token: this.terminals_[symbol] || symbol, line: this.lexer.yylineno, loc: yyloc, expected: expected});
            }
        }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(this.lexer.yytext);
            lstack.push(this.lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = this.lexer.yyleng;
                yytext = this.lexer.yytext;
                yylineno = this.lexer.yylineno;
                yyloc = this.lexer.yylloc;
                if (recovering > 0)
                    recovering--;
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {first_line: lstack[lstack.length - (len || 1)].first_line, last_line: lstack[lstack.length - 1].last_line, first_column: lstack[lstack.length - (len || 1)].first_column, last_column: lstack[lstack.length - 1].last_column};
            if (ranges) {
                yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]];
            }
            r = this.performAction.call(yyval, yytext, yyleng, yylineno, this.yy, action[1], vstack, lstack);
            if (typeof r !== "undefined") {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}
};
/* Jison generated lexer */
var lexer = (function(){
var lexer = ({EOF:1,
parseError:function parseError(str, hash) {
        if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },
setInput:function (input) {
        this._input = input;
        this._more = this._less = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {first_line:1,first_column:0,last_line:1,last_column:0};
        if (this.options.ranges) this.yylloc.range = [0,0];
        this.offset = 0;
        return this;
    },
input:function () {
        var ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        var lines = ch.match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
        } else {
            this.yylloc.last_column++;
        }
        if (this.options.ranges) this.yylloc.range[1]++;

        this._input = this._input.slice(1);
        return ch;
    },
unput:function (ch) {
        var len = ch.length;
        var lines = ch.split(/(?:\r\n?|\n)/g);

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length-len-1);
        //this.yyleng -= len;
        this.offset -= len;
        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
        this.match = this.match.substr(0, this.match.length-1);
        this.matched = this.matched.substr(0, this.matched.length-1);

        if (lines.length-1) this.yylineno -= lines.length-1;
        var r = this.yylloc.range;

        this.yylloc = {first_line: this.yylloc.first_line,
          last_line: this.yylineno+1,
          first_column: this.yylloc.first_column,
          last_column: lines ?
              (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length:
              this.yylloc.first_column - len
          };

        if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
        }
        return this;
    },
more:function () {
        this._more = true;
        return this;
    },
less:function (n) {
        this.unput(this.match.slice(n));
    },
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20)+(next.length > 20 ? '...':'')).replace(/\n/g, "");
    },
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c+"^";
    },
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) this.done = true;

        var token,
            match,
            tempMatch,
            index,
            col,
            lines;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i=0;i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                match = tempMatch;
                index = i;
                if (!this.options.flex) break;
            }
        }
        if (match) {
            lines = match[0].match(/(?:\r\n?|\n).*/g);
            if (lines) this.yylineno += lines.length;
            this.yylloc = {first_line: this.yylloc.last_line,
                           last_line: this.yylineno+1,
                           first_column: this.yylloc.last_column,
                           last_column: lines ? lines[lines.length-1].length-lines[lines.length-1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length};
            this.yytext += match[0];
            this.match += match[0];
            this.matches = match;
            this.yyleng = this.yytext.length;
            if (this.options.ranges) {
                this.yylloc.range = [this.offset, this.offset += this.yyleng];
            }
            this._more = false;
            this._input = this._input.slice(match[0].length);
            this.matched += match[0];
            token = this.performAction.call(this, this.yy, this, rules[index],this.conditionStack[this.conditionStack.length-1]);
            if (this.done && this._input) this.done = false;
            if (token) return token;
            else return;
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            return this.parseError('Lexical error on line '+(this.yylineno+1)+'. Unrecognized text.\n'+this.showPosition(),
                    {text: "", token: null, line: this.yylineno});
        }
    },
lex:function lex() {
        var r = this.next();
        if (typeof r !== 'undefined') {
            return r;
        } else {
            return this.lex();
        }
    },
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },
popState:function popState() {
        return this.conditionStack.pop();
    },
_currentRules:function _currentRules() {
        return this.conditions[this.conditionStack[this.conditionStack.length-1]].rules;
    },
topState:function () {
        return this.conditionStack[this.conditionStack.length-2];
    },
pushState:function begin(condition) {
        this.begin(condition);
    }});
lexer.options = {};
lexer.performAction = function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {

var YYSTATE=YY_START
switch($avoiding_name_collisions) {
case 0:/* skip whitespace */
break;
case 1:return 48
break;
case 2:return 49
break;
case 3:return 'MATH_SHIFT'
break;
case 4:yy_.yytext = this.matches[this.matches.length - 1]; return 45
break;
case 5:yy_.yytext = this.matches[this.matches.length - 1]; return 46
break;
case 6:return 47
break;
case 7:yy_.yytext=Number(this.matches[2]) + Number(this.matches[5]) / Number(this.matches[6]); return 64
break;
case 8:return 64
break;
case 9:return 42
break;
case 10:return 43
break;
case 11:yy_.yytext = this.matches[3]; return 61
break;
case 12:yy_.yytext = this.matches[this.matches.length - 1]; return 79
break;
case 13:return 80
break;
case 14:return 78
break;
case 15:return 57
break;
case 16:return 58
break;
case 17:return 66
break;
case 18:return 67
break;
case 19:return 19
break;
case 20:return 55  /* rely on mathquill */
break;
case 21:return 56 /* for pairing */
break;
case 22:return 40
break;
case 23:return 38
break;
case 24:return 14
break;
case 25:return 17
break;
case 26:return "..."
break;
case 27:return 68
break;
case 28:return 59
break;
case 29:return 5
break;
case 30:return 22
break;
case 31:return 23
break;
case 32:return 25
break;
case 33:return 27
break;
case 34:return 69
break;
case 35:return 71
break;
case 36:return 74
break;
case 37:return 36
break;
case 38:return 37
break;
case 39:return 35
break;
case 40:return 34
break;
case 41:return 16
break;
case 42:return 15
break;
case 43:return 76        /* sin, cos, sinh, ln*/
break;
case 44:yy_.yytext = '\\sign'; return 19
break;
case 45:yy_.yytext = '\\gcd'; return 19
break;
case 46:yy_.yytext = '\\lcm'; return 19
break;
case 47:yy_.yytext = '\\stdevp'; return 19
break;
case 48:yy_.yytext = '\\stdevp'; return 19
break;
case 49:yy_.yytext = '\\stdev'; return 19
break;
case 50:yy_.yytext = '\\stdev'; return 19
break;
case 51:yy_.yytext = '\\var'; return 19
break;
case 52:return 19          /* Predefined functions, as well as user-defined variables.  Doesn't include subscripts */
break;
case 53:/* skip LINE_START if it's not needed for something else */
break;
case 54:return 'UNRECOGNIZED'
break;
}
};
lexer.rules = [/^(?:(\\space|\\:|\s)+)/,/^(?:\{)/,/^(?:\})/,/^(?:\$)/,/^(?:\^([0-9]))/,/^(?:\^([a-zA-Z]))/,/^(?:\^)/,/^(?:(([0-9]+)((?:\s|\\space|\\:)*)\\frac((?:\s|\\space|\\:)*)\{([0-9]+)\}\{([0-9]+)\}))/,/^(?:[0-9]+(\.[0-9]+)?|(\.[0-9]+))/,/^(?:\*|(\\cdot))/,/^(?:\/)/,/^(?:(\\frac((?:\s|\\space|\\:)*)\{d\}\{d(((\\[a-zA-Z]+|[a-zA-Z])(_[a-zA-Z0-9]|_\{[a-zA-Z0-9]+\})?))\}))/,/^(?:(\\log)((?:\s|\\space|\\:)*)*_([0-9]))/,/^(?:(\\ln))/,/^(?:(\\log))/,/^(?:(\\frac))/,/^(?:(\\sqrt))/,/^(?:(\\sum))/,/^(?:(\\prod))/,/^(?:(\\length))/,/^(?:\\left\|)/,/^(?:\\right\|)/,/^(?:-)/,/^(?:\+)/,/^(?:=)/,/^(?:~)/,/^(?:\.\.\.)/,/^(?:[_])/,/^(?:!)/,/^(?:$)/,/^(?:(\()|\\left\()/,/^(?:(\))|\\right\))/,/^(?:(\[)|\\left\[)/,/^(?:(\])|\\right\])/,/^(?:(\\\{)|\\left\\\{)/,/^(?:(\\\})|\\right\\\})/,/^(?::)/,/^(?:(\\ge|>=))/,/^(?:(\\le|<=))/,/^(?:(\\gt|>))/,/^(?:(\\lt|<))/,/^(?:,)/,/^(?:(###)(((?:\s|\\space|\\:)*)((\\[a-zA-Z]+|[a-zA-Z])(_[a-zA-Z0-9]|_\{[a-zA-Z0-9]+\})?)((?:\s|\\space|\\:)*)(\\left\(|\()((?:\s|\\space|\\:)*)((\\[a-zA-Z]+|[a-zA-Z])(_[a-zA-Z0-9]|_\{[a-zA-Z0-9]+\})?)(((?:\s|\\space|\\:)*),((?:\s|\\space|\\:)*)((\\[a-zA-Z]+|[a-zA-Z])(_[a-zA-Z0-9]|_\{[a-zA-Z0-9]+\})?)((?:\s|\\space|\\:)*))*((?:\s|\\space|\\:)*)(\\right\)|\))((?:\s|\\space|\\:)*)=))/,/^(?:(\\(arc)?(sin|cos|tan|cot|sec|csc)h?))/,/^(?:(\\signum))/,/^(?:(\\(gcf|mcd)))/,/^(?:(\\mcm))/,/^(?:(\\stdDevP))/,/^(?:(\\stddevp))/,/^(?:(\\stdDev))/,/^(?:(\\stddev))/,/^(?:(\\variance))/,/^(?:((\\[a-zA-Z]+|[a-zA-Z])(_[a-zA-Z0-9]|_\{[a-zA-Z0-9]+\})?))/,/^(?:(###))/,/^(?:.)/];
lexer.conditions = {"conditional":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54],"inclusive":true},"INITIAL":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54],"inclusive":true}};
return lexer;})()
parser.lexer = lexer;
return parser;
});
define('math/policy',['require','graphing/graphmode'],function(require){
  var GRAPHMODE = require('graphing/graphmode');

  var Policy = {
    assignmentForbidden: function(identifier){
      return (
        identifier === 'x' ||
        identifier === 'y' ||
        identifier === 'theta' ||
        identifier.slice(0, 3) === 'tmp'
      );
    },

    validRegressionParameter: function (identifier) {
      return identifier !== 'x' && identifier !== 'y';
    },

    sliderVariables: function (identifiers) {
      if (identifiers.indexOf('theta') !== -1) {
        identifiers = identifiers.filter(function (s) { return s !== 'r'; });
      }
      var self = this;
      return identifiers.filter(function (s) { return !self.assignmentForbidden(s); });
    },

    validLHS: function (identifier) {
      return identifier !== 'theta';
    },

    unplottablePolarFunction: function (head, args) {
      if (head !== 'theta') return false;
      return args.indexOf('r') !== -1;
    },

    validDoubleInequalitySymbol: function (identifier) {
      return identifier === 'x' || identifier === 'y';
    },

    validDoubleInequalityVariables: function (identifiers) {
      if (identifiers.length > 2) return false;
      return identifiers.every(Policy.validDoubleInequalitySymbol);
    },

    validExpressionVariable: function (identifier) {
      return identifier === 'x';
    },

    validSolvedVariable: function (identifier) {
      return identifier === 'x' || identifier === 'y' || identifier === 'r';
    },

    validImplicitVariables: function (identifiers) {
      if (identifiers.length !== 2) return false;
      return (
        (identifiers[0] === 'x' && identifiers[1] === 'y') ||
        (identifiers[0] === 'y' && identifiers[1] === 'x') ||
        (identifiers[0] === 'r' && identifiers[1] === 'theta') ||
        (identifiers[0] === 'theta' && identifiers[1] === 'r')
      );
    },

    graphableListVariables: function (leftSymbol, rightSymbol) {
      return (
        leftSymbol === 'x' ||
        leftSymbol === 'y' ||
        leftSymbol === 'r' ||
        rightSymbol === 'x' ||
        rightSymbol === 'y'
      );
    },

    validParametricVariable: function (identifier) {
      return identifier === 't';
    },

    validParametricVariables: function (identifiers) {
      return identifiers.length === 1 && Policy.validParametricVariable(identifiers[0]);
    },

    validInequalityVariables: function (identifiers) {
      switch (identifiers.length) {
        case 1:
          return identifiers[0] === 'x' || identifiers[0] === 'y' || identifiers[0] === 'r';
        case 2:
          return Policy.validImplicitVariables(identifiers);
        default:
          return false;
      }
    },

    validFirstColumnVariable: function (symbol) {
      return symbol !== 'y' && symbol !== 'r' && symbol !== 'theta' && !symbol.match(/y_(\d+)/);
    },

    complicatedPolarImplicit: function (identifier, order) {
      return identifier === 'theta' || (identifier === 'r' && order !== 1);
    },

    constantGraphMode: function (symbol) {
      if (symbol === 'x') return GRAPHMODE.X;
      if (symbol === 'r') return GRAPHMODE.POLAR;
      return GRAPHMODE.Y;
    },

    graphMode: function (independent, dependent) {
      if (dependent === 'y') return GRAPHMODE.X;
      if (independent === 'x') return GRAPHMODE.X;
      if (independent === 'r' && dependent === 'theta') return GRAPHMODE.POLAR;
      return GRAPHMODE.Y;
    },

    tableableAsConstant: function (identifier) {
      if (identifier === 'x') return false;
      if (identifier === 'r') return false;
      if (identifier === 'theta') return false;
      return true;
    },

    implicitIndependent: function (identifier) {
      return 'x';
    },

    implicitDependency: function (identifier) {
      if(identifier === 'y') return 'x';
      if(identifier === 'theta') return 'r';
      return 'y';
    },

    graphableAsConstant: function (identifier) {
      return identifier === 'y' || identifier === 'x' || identifier === 'r';
    },

    graphableAsBareIdentifier: function (identifier) {
      return identifier === 'x';
    }
  };

  return Policy;
});

// Utility for serializing/deserializing functions.
define('math/functions',['require','math/builtin'],function (require) {
  var BuiltIn = require('math/builtin');

  function dehydrateGraphData (data) {
    for (var i = 0; i < data.length; i++) {
      if (data[i].compiled) {
        delete data[i].compiled.fn;
      }
    }
  }

  function rehydrateGraphData (data) {
    /* jshint evil: true */
    for (var i = 0; i < data.length; i++) {
      var compiled = data[i].compiled;
      if (compiled) {
        compiled.fn = closureFunctionWithBuiltIn(compiled.args, compiled.source);
      }
    }
  }

  //Helper function to auto-generate evaluateOnce calls from evaluation strings
  function createEvaluateFunction (evalExpressionFn, n) {
    /*jshint evil:true*/
    var argList = [];
    for(var i = 0; i < n; i++){
      argList.push('values['+i+']');
    }
    return closureFunctionWithBuiltIn(['values'], 'return ' + evalExpressionFn(argList));
  }

  function closureFunctionWithBuiltIn (args, body) {
    /*jshint evil:true*/
    var argList = args.join(',');
    var functionString = "return (function("+argList+"){"+body+"})";
    var compilerFunction = new Function(['BuiltIn'], functionString);
    return compilerFunction(BuiltIn);
  }

  return {
    dehydrateGraphData: dehydrateGraphData,
    rehydrateGraphData: rehydrateGraphData,
    closureFunctionWithBuiltIn: closureFunctionWithBuiltIn,
    createEvaluateFunction: createEvaluateFunction
  };
});

var define_enum_constant;
var enum_strings = {};
var debuggable_enums = true;

if(debuggable_enums){
  define_enum_constant = function(s){
    this[s] = s;
  };
}
else{
  var next_enum = 1000;
  define_enum_constant = function(s){
    enum_strings[next_enum] = s;
    this[s] = next_enum++;
  };
}

//Statement types (determined entirely from the root element of the parse tree)
define_enum_constant("EXPRESSION");              //a+1 or 1+1
define_enum_constant("FUNCTION_DEFINITION");     //f(x)=???
define_enum_constant("VARIABLE_DEFINITION");     //a=???
define_enum_constant("ORDERED_PAIR_LIST");     // (?, ?), (?, ?).  Support lists of points, but only single parametrics
define_enum_constant("DOUBLE_INEQUALITY");       // expr < y < expr, shade-between
define_enum_constant("COMPARATOR");       // expr < expr - unsolved inequality
define_enum_constant("CHAINED_COMPARATOR");       // a < ??? - not a conditional as an expression
define_enum_constant("EQUATION");         // expr = expr
define_enum_constant("CONSTANT");
define_enum_constant("IDENTIFIER");
define_enum_constant("LIST");

define("math/enums", function(){});

define('math/parsenode/base',['require','console','pjs','math/policy','math/functions','../enums'],function(require){
  //Parse-nodes are immutable objects
  //Built by the parse tree
  var console = require('console');
  var P = require('pjs');
  var Policy = require('math/policy');
  var Functions = require('math/functions');
  require('../enums');

  return P(function(node, _super, _class) {
    node.init = function() {
      this._dependencies = [];
      this._inputString = '';
      this._exports = [];
    };

    node.exportPenalty = 0;

    //Utility function for generating temporary variables
    var tmpVarCounter = 0; //Singleton used for generating tmp variables in compilation
    node.tmpVar = function () {
      return 'tmp' + tmpVarCounter++;
    };

    /* START OF ADAPTATION CODE */
    node.statementType = EXPRESSION; //TODO - remove this
    node.dependencies = function(){return this.getDependencies()};
    node.evaluateOnce = function(frame){
      if(frame === undefined) frame = {};
      var concreteTree = this.getConcreteTree(frame);
      var evaluationInfo = concreteTree.getEvaluationInfo();
      if(evaluationInfo) return evaluationInfo[0].val;
      return NaN;
    };
    /*END OF ADAPTATION CODE */

    //Track input string (for error messages, etc.)
    node.setInputString = function(s){
      this._inputString = s;
    };

    node.getInputString = function(){
      return this._inputString;
    };

    //Track dependencies and referenced variables
    //Anything that we need to be evaluated after
    //is a dependency (even things like "a" for "f(a) = a"
    //Don't track type of dependencies.  That will be checked dynamically
    //as the parse tree is rolled up
    node.addDependency = function(identifier){
      if(this.dependsOn(identifier)) return;
      this._dependencies.push(identifier);
    };

    node.addDependencies = function(identifiers){
      for(var i = 0; i < identifiers.length; i++){
        this.addDependency(identifiers[i]);
      }
    };

    node.getDependencies = function(){
      return (this._dependencies);
    };

    node.removeDependency = function(identifier){
      this._dependencies.splice(this._dependencies.indexOf(identifier), 1);
    };

    node.dependsOn = function(identifier) {
      return (this._dependencies.indexOf(identifier) > -1);
    };

    //Track which symbols we export definitions for
    node.getExports = function(){
      return this._exports;
    };

    node.exportsSymbol = function (symbol) {
      return this._exports.indexOf(symbol) > -1;
    };

    node.exportTo = function (concrete, frame) {
      var exports = this.getExports();
      if (exports.length === 0) return;
      if (exports.length > 1) {
        throw new Error("exportsTo unimplemented for nodes that define multiple symbols.");
      }

      var symbol = exports[0];
      if (Policy.assignmentForbidden(symbol)) return;
      if (frame[symbol]) return;

      // The concrete tree might be an error that blocks exporting the symbol.
      // In this case, export the error instead.
      frame[symbol] = concrete.blocksExport ? concrete : this;
    };

    node.getOperator = function () {
      return this.operator || '=';
    };

    node.isInequality = function () { return false; };

    node.isShadeBetween = function () {
      return false;
    };

    node.getAllIds = function () {
      return this.userData ? [this.userData.id] : [];
    };

    //Default to falsy evaluationInfo
    node.getEvaluationInfo = function(){
      return false;
    };

    //Default to falsy sliderInfo
    node.getSliderInfo = function(){
      return false;
    };

    node.getSliderVariables = function (concrete) {
      return Policy.sliderVariables(concrete.getDependencies());
    };

    //Default to not accepting in implicit function calls (e.g. "sin x")
    node.okForImplicitFunction = function(){
      return false;
    };

    node.getConcreteTree = function(frame){
      console.log("Warning - default empty version of getConcreteTree being called");
      return this;
    };

    node.tryGetConcreteTree = function () {
      var concrete;
      try {
        concrete = this.getConcreteTree.apply(this, arguments);
      } catch (e) {
        if (e instanceof _class) { //only catch ErrorNodes
          concrete = e;
        } else {
          throw e; //Re-throw
        }
      }
      return concrete;
    };

    //Function compilation helpers
    //TODO - put this compilation functionality somewhere more general
    node.getCompiledFunctions = function (args) {
      var strings = this.getEvalStrings();
      var source = strings.statements.join(';') + ';return ' + strings.expression;

      if (args === undefined) {
        args = this.getDependencies();

        // By convention, 'x' always comes first in the argument list
        var i = args.indexOf('x');
        if (i !== -1) {
          var tmp = args[0];
          args[0] = args[i];
          args[i] = tmp;
        }
      }

      return [{
        args: args,
        source: source,
        fn: Functions.closureFunctionWithBuiltIn(args, source)
      }];
    };

    node.getCompiledDerivatives = function () {
      var dependencies = this.getDependencies();
      var derivative = this.takeDerivative(dependencies[0] || 'x');
      return derivative.getCompiledFunctions();
    };
  });
});

define('lib/worker-i18n',['require','underscore'],function (require) {
  var _ = require('underscore');
  //in the worker, we don't want the real i18n. But we do want:
  // * a familiar API
  // * for the i18n parser to be able to go through and find strings to push to crowdin
  //
  // this function only has the 't' method, and it just turns the whole ordeal into
  // a single JSON.stringified string that can be unpacked and translated outside of the worker.

  var packString = function (message, variables) {
    if (!variables || _.size(variables) === 0) return message;
    return JSON.stringify({
      msg: message,
      vars: variables
    });
  };

  return {
    t: packString
  };
});

define('math/parsenode/error',['require','pjs','./base'],function(require){
  var P = require('pjs');
  var ParseNode = require('./base');
  return P(ParseNode, function(node, _super){
    node.init = function(msg) {
      _super.init.call(this);
      this._msg = msg;
      this._sliderVariables = [];
      this.blocksExport = true;
    };

    node.evaluateOnce = function(frame){
      return this._msg;
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      return this;
    };

    node.isError = true;

    node.getError = function(){
      return this._msg;
    };

    node.setDependencies = function (symbols) {
      this._dependencies = symbols;
      return this;
    };

    node.allowExport = function () {
      this.blocksExport = false;
      return this;
    };
  });
});

define('graphing/label',['math/builtin'], function (BuiltIn) {
// Returns a label for a point with an appropriate number of decimals for the
// given scale. Scale is typically chosen to be the range of numbers displayed
// in the current viewport. Rounds to pi fractions when the denominator is 24
// or less, according to a tolerance that depends on x and scale.
//
// Label is returned as on object with the string representation given by
// label.string, and represented value label.value, which is equal to x when
// the string is a decimal representation, and equal to n*Math.PI/d for pi
// fractions. This is used for checking if a labeled value is actually a hole
// in the function.
function value(x, scale) {

  if (isNaN(x)) return { string: 'undefined', value: x };

  if (x === 0) return { string: '0', value: x };

  if (!scale) scale = x;

  var piFraction = BuiltIn.toFraction(x/Math.PI, 24);
  var nString;
  var dString;

  if (
    fewDigits(scale) &&
    BuiltIn.approx(piFraction.n/piFraction.d*Math.PI, x, 3)
  ) {
    if (piFraction.n === 0) {
      nString = "0";
    } else if (piFraction.n === 1) {
      nString = "Ï€";
    } else if (piFraction.n === -1) {
      nString = "-Ï€";
    } else {
      nString = piFraction.n.toString() + "Ï€";
    }

    if (piFraction.d === 1) {
      dString = "";
    } else {
      dString = "/" + piFraction.d.toString();
    }

    return {
      string: nString + dString,
      value: piFraction.n/piFraction.d*Math.PI
    };
  }

  var mantissa, superscript, string;
  if (fewDigits(scale)) {
    string = stripZeros(x.toFixed(decimalsFromScale(scale)));
    superscript = null;
    mantissa = null;

  } else {
    var parts = stripExponentialZeros(x.toExponential(decimalsFromScale(scale/x))).split('e');
    mantissa = parts[0] + '\u00d7' + '10';
    superscript = parts[1].replace('+', '');
    string = stripExponentialZeros(x.toExponential(decimalsFromScale(scale/x))).replace('+', '');
  }

  return { string: string, mantissa: mantissa, superscript: superscript, value: x };
}

// x and f(value(x).value), returning the results as two strings. Useful
// because the function may have a hole at value(x).value.
function point(x, xscale, yscale, fn) {
  var xlabel = value(x, xscale);
  var ylabel = value(fn(xlabel.value), yscale);
  return [xlabel, ylabel];
}

// Strip trailing zeros from a string representation of a decimal.
var trailingZerosRegex = /\.?0+$/;
function stripZeros(string) {
  if (string.indexOf('.') === -1) return string;
  return string.replace(trailingZerosRegex, '');
}

var exponentialTrailingZerosRegex = /\.?0+e/;
function stripExponentialZeros(string) {
  return string.replace(exponentialTrailingZerosRegex, 'e');
}

function fewDigits(x) {
  x = Math.abs(x);
  return 1e-4 < x && x < 1e7;
}

// Returns integer number of decimals to show given scale of numbers to be
// represented.
function decimalsFromScale(scale) {
  scale = Math.abs(scale);
  scale = Math.max(scale, 1e-16);
  return Math.max(0, Math.floor(4.5 - Math.log(scale)/Math.LN10));
}

function htmlSciNote(string) {
  string = stripExponentialZeros(string);
  return string.replace(/([\d\.\-]+)e\+?([\d\-]+)/, "$1<span class='dcg-cross'>Ã—</span>10<sup>$2</sup>");
}

function latexSciNote(string) {
  string = stripExponentialZeros(string);
  return string.replace(/([\d\.\-]+)e\+?([\d\-]+)/, "$1\\times10^{$2}");
}

var symbolTable = {
  'pi': 'Ï€',
  'tau': 'Ï„',
  'theta': 'Î¸'
};

function formatSymbol(symbol) {
  return symbolTable.hasOwnProperty(symbol) ? symbolTable[symbol] : symbol;
}

function identifierToLatex (symbol) {
  var pieces = symbol.split('_');
  var out = '';
  if (pieces[0].length > 1) out += '\\';
  out += pieces[0];
  if (pieces[1]) {
    if (pieces[1].length === 1) {
      out += '_' + pieces[1];
    } else {
      out += '_{' + pieces[1] + '}';
    }
  }
  return out;
}

function latexToIdentifier (symbol) {
  return symbol.replace(/[{}\\]/g, '');
}

return {
  stripZeros: stripZeros,
  htmlSciNote: htmlSciNote,
  latexSciNote: latexSciNote,
  value: value,
  point: point,
  formatSymbol: formatSymbol,
  identifierToLatex: identifierToLatex,
  latexToIdentifier: latexToIdentifier
};

});

// NOTE, this file is an exception to our usual style guide.
//
// It uses double quoted strings to avoid escaping a lot of single quotes, and it uses long lines
// because our i18n parser requires translation strings to be literals that appear on the same line
// as the `i18n.t(` function invocation.
define('math/errormsg',['require','lib/worker-i18n','math/parsenode/error','graphing/label','math/policy'],function(require){
  /*jshint maxlen:200*/

  var i18n = require('lib/worker-i18n');
  var ErrorNode = require('math/parsenode/error');
  var Label = require('graphing/label');
  var Policy = require('math/policy');

  return {
    parseError: function () {
      return ErrorNode(i18n.t("Sorry, I don't understand this."));
    },

    deeplyNested: function () {
      return ErrorNode(i18n.t("Definitions are nested too deeply."));
    },

    wrongArity: function(symbol, arity, providedArity){
      symbol = Label.formatSymbol(symbol);
      var msg, supplement;
      if(arity === 1){

        supplement = i18n.t("For example, try typing: __dependency__(x).", {
          dependency: symbol
        });

        if(providedArity > 1){ //requires 1 vs require an
          msg = i18n.t("Function '__dependency__' requires only 1 argument. __supplement__", {
            dependency: symbol,
            supplement: supplement
          });
        } else {
          msg = i18n.t("Function '__dependency__' requires an argument. __supplement__", {
            dependency: symbol,
            supplement: supplement
          });
        }
      } else {
        var args = [];
        //construct an example of using the function
        for (var j = 0 ; j < arity ; j++) {args[j] = j+1; }
        var recommendation = symbol + "(" + args.join(", ") + ")";

        supplement = i18n.t("For example, try typing: __recommendation__.", {
          recommendation: recommendation
        });

        msg = i18n.t("Function '__dependency__' requires __assignment_arity__ arguments. __supplement__", {
          dependency: symbol,
          assignment_arity: arity,
          supplement: supplement
        });
      }
      return ErrorNode(msg);
    },

    zeroArgReducer: function(symbol){
      return ErrorNode(i18n.t("Function '__symbol__' requires at least one argument. For example, try typing: __symbol__(1, 2).", {
        symbol: Label.formatSymbol(symbol)
      }));
    },

    missingRHS: function (symbol) {
      symbol = Label.formatSymbol(symbol);
      return ErrorNode(i18n.t("What do you want '__symbol__' to equal?", {
        symbol: symbol
      }));
    },

    malformedPoint: function () {
      return ErrorNode(i18n.t("Points are written like this: (1, 2)."));
    },

    badTrigImplicitMultiply: function () {
      return ErrorNode(i18n.t("Too complicated. Use parens."));
    },

    badTrigExponent: function (prefix) {
      var form1 = prefix + '^2';
      var form2 = prefix + '^-1';
      return ErrorNode(i18n.t("Only __form1__ and __form2__ are supported. Otherwise, use parens.", {
        form1: form1,
        form2: form2
      }));
    },

    badLogImplicitMultiply: function () {
      return ErrorNode(i18n.t("Too complicated. Use parens."));
    },

    badLogExponent: function (prefix) {
      var form = prefix + '^2';
      return ErrorNode(i18n.t("Only __form__ is supported. Otherwise, use parens.", {
        form: form
      }));
    },

    blankExpression: function () {
      return ErrorNode(i18n.t("You haven't written anything yet."));
    },

    functionNotDefined: function(symbol){
      symbol = Label.formatSymbol(symbol);
      return ErrorNode(i18n.t("Function '__dependency__' is not defined.", {
        dependency: symbol
      }));
    },

    parameterAlreadyDefined: function(symbol){
      symbol = Label.formatSymbol(symbol);
      return ErrorNode(i18n.t("You can't use '__dependency__' as a parameter of this function because '__dependency__' is already defined.", {
        dependency: symbol
      }));
    },

    cannotRedefine: function(symbol){
      symbol = Label.formatSymbol(symbol);
      return ErrorNode(i18n.t("You can't redefine '__symbol__' because it's already defined.", {
        symbol: symbol
      }));
    },

    multiplyDefined: function (symbol) {
      symbol = Label.formatSymbol(symbol);
      return ErrorNode(i18n.t("You've defined '__dependency__' in more than one place. Try picking a different variable, or deleting some of the definitions of '__dependency__'.", {
        dependency: symbol
      }));
    },

    shadowedIndex: function (symbol) {
      symbol = Label.formatSymbol(symbol);
      return ErrorNode(i18n.t("You can't use '__symbol__' as an index because it's already defined.", {
        symbol: symbol
      }));
    },

    cycle: function (symbols) {
      symbols = symbols.map(Label.formatSymbol);

      var lastSymbol = symbols.pop();

      return ErrorNode(i18n.t("'__symbols__' and '__lastSymbol__' can't be defined in terms of each other.", {
        symbols: symbols.join("', '"), lastSymbol: lastSymbol
      }));
    },

    tooManyVariables: function (symbols) {
      symbols = symbols.map(Label.formatSymbol);

      if (symbols.length === 0) {
        return ErrorNode(i18n.t("Too many variables, I don't know what to do with this."));
      }

      var lastSymbol = symbols.pop();

      return ErrorNode(i18n.t("Too many variables. Try defining '__variables__'.", {
        variables: (symbols.length ? symbols.join("', '") + "' or '" : "") + lastSymbol
      }));
    },

    addArgumentsToDefinition: function (symbols, head, args) {
      symbols = symbols.map(Label.formatSymbol);
      head = Label.formatSymbol(head);
      args = args.map(Label.formatSymbol);

      var newSignature = head + '(' + args.join(',') + ',' + symbols.join(',') + ')';
      var lastSymbol = symbols.pop();

      var interpolants = {
        symbols: symbols.join("', '"),
        lastSymbol: lastSymbol,
        newSignature: newSignature
      };

      if (symbols.length) {
        return ErrorNode(i18n.t("Try including '__symbols__' and '__lastSymbol__' as arguments by defining the function as '__newSignature__'.",
          interpolants
        ));
      } else {
        return ErrorNode(i18n.t("Try including '__lastSymbol__' as an argument by defining the function as '__newSignature__'.",
          interpolants
        ));
      }
    },

    invalidLHS: function (symbol) {
      symbol = Label.formatSymbol(symbol);
      return ErrorNode(i18n.t("Sorry, you can't graph __symbol__ as a function of anything yet.", {
        symbol: symbol
      }));
    },

    unplottablePolarFunction: function () {
      return ErrorNode(i18n.t("We can't plot Î¸ as a function of r. Try plotting r(Î¸) instead."));
    },

    invalidInequalityVariables: function () {
      return ErrorNode(i18n.t('We only plot inequalities of x and y, or r and Î¸.'));
    },

    invalidImplicitVariables: function () {
      return ErrorNode(i18n.t("We only support implicit equations of x and y."));
    },

    unsolvable: function () {
      return ErrorNode(i18n.t("We don't solve complicated single-variable equations yet."));
    },

    singleVariableListSolve: function () {
      return ErrorNode(i18n.t("We don't solve single-variable equations involving lists yet."));
    },

    complicatedImplicitInequality: function () {
      return ErrorNode(i18n.t("We can only plot inequalities when one variable is quadratic or linear."));
    },

    complicatedPolarImplicit: function () {
      return ErrorNode(i18n.t("Polar equations must be linear in r."));
    },

    invalidDoubleInequalityVariables: function () {
      return ErrorNode(i18n.t('We only plot double inequalities of x and y.'));
    },

    mismatchedDoubleInequality: function () {
      return ErrorNode(i18n.t("Double inequalities must both go the same way, e.g. 1 < y < 2."));
    },

    complicatedDoubleInequality: function () {
      return ErrorNode(i18n.t("We only support solved double inequalities. Try deleting one side of the inequality."));
    },

    equationRequired: function (symbol) {
      if (symbol) {
        return ErrorNode(i18n.t("Try adding '__lhs__' to the beginning of this equation.", {
          lhs: Policy.implicitDependency(symbol) + "="
        }));
      } else {
        return ErrorNode(i18n.t("Try adding an equals sign to turn this into an equation."));
      }
    },

    variableAsFunction: function(symbol){
      symbol = Label.formatSymbol(symbol);
      return ErrorNode(i18n.t("Variable '__dependency__' can't be used as a function.", {
        dependency: symbol
      }));
    },

    nestedList: function () {
      return ErrorNode(i18n.t("Nested lists are not allowed."));
    },

    invalidTableHeader: function (supplement) {
      return ErrorNode(i18n.t("Table headers must be simple expressions. __supplement__", {
        supplement: supplement
      }));
    },

    invalidTableEntry: function (supplement) {
      return ErrorNode(i18n.t("Table entries must be simple expressions. __supplement__", {
        supplement: supplement
      }));
    },

    invalidFirstTableColumn: function () {
      return ErrorNode(i18n.t("First column may not be __most__ or __last__.", {
        most: "'y', 'r',",
        last: "'Î¸'"
      }));
    },

    invalidDependentFirstTableColumn: function () {
      return ErrorNode(i18n.t("This column header can't be defined elsewhere in the calculator."));
    },

    invalidRegressionParameter: function (symbol) {
      return ErrorNode(i18n.t("'__symbol__' may not be used as a regression parameter.", {
        symbol: Label.formatSymbol(symbol)
      }));
    },

    optimizationError: function () {
      return ErrorNode(i18n.t("Failed to find regression coefficients."));
    },

    nonListRegression: function () {
      return ErrorNode(i18n.t("Regressions must contain at least one list of data."));
    },

    badListInReducer: function (symbol) {
      return ErrorNode(i18n.t("When __symbol__ is called with multiple arguments, no argument can be a list.", {
        symbol: Label.formatSymbol(symbol)
      }));
    },

    indexIntoNonList: function () {
      return ErrorNode(i18n.t("Cannot index into something that is not a list."));
    },

    listAsIndex: function () {
      return ErrorNode(i18n.t("List index must not be a list."));
    },

    variableRange: function (symbols) {
      return ErrorNode(i18n.t("Range cannot depend on free variable '__symbol__'.", {
        symbol: Label.formatSymbol(symbols[0])
      }));
    },

    nonArithmeticRange: function (symbols) {
      return ErrorNode(i18n.t("Ranges must be arithmetic sequences."));
    }
  };
});

define('math/parsenode/expression',['require','pjs','./base','math/errormsg'],function(require){
  //Expression parse-nodes have an output value
  //And can exist within an expression tree
  //This includes constants, variables, math operators, and functions
  //This does not include function calls, inequalities,
  //or variable definitions
  var P = require('pjs');
  var ParseNode = require('./base');
  var ErrorMsg = require('math/errormsg');

  return P(ParseNode, function(node, _super) {
    node.init = function(args) {
      if (!Array.isArray(args)) {
        throw new TypeError('Argument to expression constructor must be an Array.');
      }

      _super.init.call(this);
      this.args = args;
      this.registerDependencies();
      this.computeTreeSize();
    };

    //By default, we depend on all of our args
    node.registerDependencies = function(){
      for(var i = 0; i < this.args.length; i++){
        this.addDependencies(this.args[i].getDependencies());
      }
    };

    node.computeTreeSize = function () {
      var treeSize = 0;
      for (var i = 0; i < this.args.length; i++) {
        if (this.args[i].treeSize) treeSize += this.args[i].treeSize;
      }
      this.treeSize = treeSize + 1;
      if (treeSize > 1e4) throw ErrorMsg.deeplyNested();
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      var concreteArgs = [];
      for(var i = 0; i < this.args.length; i++){
        concreteArgs.push(this.args[i].getConcreteTree(frame, overrides));
      }
      return this.copyWithArgs(concreteArgs);
    };

    //Default behavior.
    //Some nodes need to over-ride, since they have additional configuration beyond args
    node.copyWithArgs = function(args){
      return new this.constructor(args);
    };

  });
});

define('math/parsenode/constant',['require','pjs','./base'],function(require){
  var P = require('pjs');
  var ParseNode = require('./base');

  return P(ParseNode, function(node, _super) {
    node.init = function(value){
      _super.init.call(this, []);
      this.constantValue = value;
    };

    node.isConstant = true;

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      return this;
    };

    node.getEvalStrings = function(){
      return {
        statements: [],
        expression: this.scalarExprString()
      };
    };

    node.scalarExprString = function(){
      if(this.constantValue > 0) return String(this.constantValue);
      return '(' + String(this.constantValue) + ')';
    };

    node.getEvaluationInfo = function(){
      return [{val: this.constantValue, operator: '='}];
    };

    node.okForImplicitFunction = function(){
      return true;
    };
  });
});

define('math/parsenode/list',['require','pjs','./expression','./constant','math/errormsg'],function(require){
  var P = require('pjs');
  var Expression = require('./expression');
  var Constant = require('./constant');
  var ErrorMsg = require('math/errormsg');

  return P(Expression, function(node, _super, _class) {
    node.init = function(elements){
      _super.init.call(this, elements);
      this.length = elements.length;
    };

    node.isList = true;

    node.elementAt = function(i){
      i = Math.floor(i);
      if (i >= 0 && i < this.args.length) return this.args[i];
      return Constant(NaN);
    };

    node.getEvalStrings = function(){
      var retVal = [];
      for(var i = 0; i < this.args.length; i++){
        retVal.push(this.args[i].getEvalStrings());
      }
      return retVal;
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      var concreteElements = [];
      for(var i = 0; i < this.args.length; i++){
        var concreteElement = this.args[i].getConcreteTree(frame, overrides);
        if (concreteElement.isList) throw ErrorMsg.nestedList();
        concreteElements.push(concreteElement);
      }
      return new this.constructor(concreteElements);
    };

    node.getEvaluationInfo = function(){
      /*If we're a list of constants, we're evaluable*/
      if(this.args.every(function(a){return a.isConstant})){
        return [{val: this.args.map(function(a){return a.constantValue}), operator: '='}];
      }
    };

    node.getCompiledFunctions = function (args) {
      return this.args.map(function (a) { return a.getCompiledFunctions(args)[0]; });
    };

    // Length of longest list in args. Returns Infinity if there are no lists
    // in args.
    function _listLength (args) {
      var length = Infinity;
      for (var i = 0; i < args.length; i++) {
        if (args[i].isList) length = Math.min(length, args[i].length);
      }
      return length;
    }

    _class.eachArgs = function (args, fn) {
      var length = _listLength(args);

      if (!isFinite(length)) {
        fn(args);
        return;
      }

      for (var i = 0; i < length; i++) {
        var elts = [];
        for (var j = 0; j < args.length; j++) {
          elts.push(args[j].isList ? args[j].elementAt(i) : args[j]);
        }
        fn(elts);
      }
    };

    _class.mapArgs = function (args, fn) {
      var length = _listLength(args);

      if (!isFinite(length)) return [fn(args)];

      var accum = [];
      for (var i = 0; i < length; i++) {
        var elts = [];
        for (var j = 0; j < args.length; j++) {
          elts.push(args[j].isList ? args[j].elementAt(i) : args[j]);
        }
        accum.push(fn(elts));
      }
      return accum;
    };
  });
});

define('math/parsenode/scalarexpression',['require','pjs','./expression','./constant','./list'],function(require){
  var P = require('pjs');
  var ExpressionNode = require('./expression');
  var Constant = require('./constant');
  var List = require('./list');

  //This represents expressions which follow the standard broadcast pattern
  //for all of their arguments (scalar if all arguments are scalar, otherwise
  //a list with length equal to the minimum length of their list arguments).
  //
  //On getConcreteTree, this will bubble any list arguments up above itself,
  //to convert an operation on lists to a list of operations on scalars

  return P(ExpressionNode, function(node, _super) {
    node.init = function(args) {
      _super.init.call(this, args);
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      //Return a tree which supports frame-based operations like
      //computing polynomialOrder, compiling, type checks, etc.
      //
      //This operation will descend into function calls,
      //substitute variables, and collapse constants
      //
      //This operation will also perform the broadcast logic
      //to map an operation over lists into a list of scalar
      //operation trees.
      //
      //Default operation is to ignore the frame, and generate
      //an identical node but with concrete children
      var i;

      var concreteArgs = [];
      var anyIsList = false;
      for (i = 0; i < this.args.length; i++) {
        var concreteArg = this.args[i].getConcreteTree(frame, overrides);
        if (concreteArg.isList) anyIsList = true;
        concreteArgs.push(concreteArg);
      }

      if (!anyIsList) return this._constantCollapsedCopy(concreteArgs, frame);

      var self = this;
      var elements = List.mapArgs(concreteArgs, function (args) {
        return self._constantCollapsedCopy(args, frame);
      });
      return List(elements);
    };

    node._constantCollapsedCopy = function(args){
      var constantArgs = [];
      for(var i = 0; i < args.length; i++){
        if(!args[i].isConstant) //Not constant - just copy
          return this.copyWithArgs(args);
        constantArgs.push(args[i].constantValue);
      }
      return Constant(this.evaluate(constantArgs)); //Everything was a constant.  Evaluate and return
    };

    node.getEvalStrings = function(){
      //Only works when frame has been baked into the tree, so
      //that lists are guaranteed to be above us or below
      //reducers, and we don't have to deal with them
      //Default implementation:
      //Calls getEvalStrings on each argument
      //Prepends statements, and replaces expression
      //using scalarEvalExpression()
      var statements = [];
      var argExpressions = [];
      for(var i = 0; i < this.args.length; i++){
        var evalStrings = this.args[i].getEvalStrings();
        statements = statements.concat(evalStrings.statements);
        argExpressions.push(evalStrings.expression);
      }
      return {statements: statements, expression: this.scalarEvalExpression(argExpressions)};
    };

  });
});

define('math/parsenode/expressionTypes',['require','pjs','./scalarexpression'],function(require){
  var P = require('pjs');
  var ScalarExpression = require('./scalarexpression');

  return {
    Add: P(ScalarExpression, {}),
    Subtract: P(ScalarExpression, {}),
    Multiply: P(ScalarExpression, {}),
    Divide: P(ScalarExpression, {}),
    Exponent: P(ScalarExpression, {}),
    Negative: P(ScalarExpression, {}),
    And: P(ScalarExpression, {
      isInequality: function () { return this.args[0].isInequality() && this.args[1].isInequality(); }
    })
  };
});

define('math/parsenode/freevariable',['require','pjs','./scalarexpression'],function(require){
  var P = require('pjs');
  var Parent = require('./scalarexpression');

  //Only meant to exist after a call to getConcreteTree
  //This is what an identifier that is not defined in the frame becomes

  return P(Parent, function(node, _super){
    node.init = function(symbol){
      _super.init.call(this, []);
      this.addDependency(symbol);
      this._symbol = symbol;
    };

    node.isFreeVariable = true;

    node.scalarEvalExpression = function(argExpressions) {
      return this._symbol;
    };

    node.copyWithArgs = function(args){
      return this;
    };

    node._constantCollapsedCopy = function(args){
      return this;
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      return this;
    };

  });
});

define('math/parsenode/identifier',['require','pjs','./expression','./freevariable','graphing/label'],function(require){
  var P = require('pjs');
  var Parent = require('./expression');
  var FreeVariable = require('./freevariable');
  var Label = require('graphing/label');

  return P(Parent, function(node, _super, _class) {
    node.init = function(symbol){
      _super.init.call(this, []);
      this._symbol = Label.latexToIdentifier(symbol);
      this.addDependency(this._symbol);
    };

    node.evaluate = function(){throw ("Cannot evaluate undefined variable " + this._symbol)};

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      //If tree is defined in frame, return concrete version of that
      var tree = frame[this._symbol];
      if (tree) {
        if (tree.isError) throw tree;
        if (tree.isFunction) return tree.getConcreteInvocationTree(frame, [], this._symbol, overrides);
        return tree.getConcreteTree(frame, overrides);
      }
      //Otherwise, we're a free variable
      return FreeVariable(this._symbol);
    };

    node.okForImplicitFunction = function(){
      return true;
    };
  });
});

define('math/parsenode/dummyindex',['require','pjs','./freevariable'],function(require){
  var P = require('pjs');
  var Parent = require('./freevariable');

  // Only meant to exist after a call to getConcreteTree
  // This is what the index symbol of a repeated operator becomes. It's main purpose
  // is to express the fact that the concrete tree no longer depends on external
  // values of that variable.

  return P(Parent, function (node, _super) {
    node.init = function () {
      _super.init.apply(this, arguments);
      this._dependencies = [];
    };
  });
});

define('math/parsenode/range',['require','pjs','./expression','math/errormsg','./list','./constant','math/builtin'],function(require){
  var P = require('pjs');
  var Parent = require('./expression');
  var ErrorMsg = require('math/errormsg');
  var List = require('./list');
  var Constant = require('./constant');
  var BuiltIn = require('math/builtin');

  return P(Parent, function(node, _super, _class) {
    node.init = function (args) {
      _super.init.call(this, args);
      this.beginning = args[0];
      this.end = args[1];
    };

    function _checkVal (concreteBeginning, concreteEnd, i, nsteps, val) {
      if (i < concreteBeginning.length) {
        if (!BuiltIn.approx(val, concreteBeginning.elementAt(i).constantValue, 10)) {
          throw ErrorMsg.nonArithmeticRange();
        }
      }
      // Note, puprosely don't check actual end value
      if (nsteps - i <= concreteEnd.length && nsteps - i > 1) {
        if (!BuiltIn.approx(val, concreteEnd.elementAt(concreteEnd.length - nsteps + i).constantValue, 10)) {
          throw ErrorMsg.nonArithmeticRange();
        }
      }
    }

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      var concreteBeginning = this.beginning.getConcreteTree(frame, overrides);
      var concreteEnd = this.end.getConcreteTree(frame, overrides);

      if (concreteBeginning.getDependencies().length) {
        throw ErrorMsg.variableRange(concreteBeginning.getDependencies());
      }
      if (concreteEnd.getDependencies().length) {
        throw ErrorMsg.variableRange(concreteEnd.getDependencies());
      }
      if (!concreteBeginning.isList || !concreteEnd.isList) {
        throw new Error("Programming Error: range bounds must be List nodes.");
      }

      var start = concreteBeginning.elementAt(0).constantValue;
      var end = concreteEnd.elementAt(concreteEnd.length - 1).constantValue;
      var diff = end - start;
      var step;
      if (concreteBeginning.length === 1) {
        step = diff >= 0 ? 1 : -1;
      } else {
        step = concreteBeginning.elementAt(1).constantValue - start;
      }
      var nsteps = Math.round(diff/step) + 1;
      if (!isFinite(nsteps) || nsteps < concreteBeginning.length || nsteps < concreteEnd.length) {
        throw ErrorMsg.nonArithmeticRange();
      }

      var accum = [Constant(start)];

      for (var i = 1; i < nsteps; i++) {
        // Barrycentric interpolation is the best way to
        // hit start and end exactly, and get good values
        // in the middle
        var val = start + i*step;
        _checkVal(concreteBeginning, concreteEnd, i, nsteps, val);
        accum.push(Constant(val));
      }

      return List(accum);
    };
  });
});

define('math/parsenode/listaccess',['require','pjs','./expression','math/errormsg'],function(require){
  var P = require('pjs');
  var Super = require('./expression');
  var ErrorMsg = require('math/errormsg');

  return P(Super, function(node, _super) {
    node.init = function(args){
      _super.init.call(this, args);
      this.list = args[0];
      this.index = args[1];
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      var concreteIndex = this.index.getConcreteTree(frame, overrides);
      if (concreteIndex.isList) throw ErrorMsg.listAsIndex();
      if (concreteIndex.isConstant) {
        //Convert from 1-index user-visible math to 0-indexed internal math
        //TODO - could be more efficient, and only make that list element concrete
        //but this is hard for examples where the list has to be evaluated or looked up
        var concreteList = this.list.getConcreteTree(frame, overrides);
        if (!concreteList.isList) throw ErrorMsg.indexIntoNonList();
        return concreteList.getConcreteTree(frame, overrides).elementAt(concreteIndex.constantValue - 1);
      }
      return new this.constructor([this.list.getConcreteTree(frame, overrides), concreteIndex]);
    };

    node.getEvalStrings = function(){
      var indexStrings = this.index.getEvalStrings();
      var listStrings = this.list.getEvalStrings();
      var statements = indexStrings.statements.slice(); //Statements required to compute index

      var tmp = this.tmpVar();
      statements.push('var '+tmp);

      var caseStrings = [];
      for(var i = 0; i < listStrings.length; i++){
        caseStrings.push('case '+i+':'+
                        listStrings[i].statements.join(';')+';'+
                        tmp+'='+listStrings[i].expression);
      }
      caseStrings.push('default:'+tmp+'=NaN');
      //Convert from 1-index user-visible math to 0-indexed internal math
      var switchStatement = 'switch(Math.floor('+(indexStrings.expression)+')-1){\n' +
                            caseStrings.join(';break\n') +
                            '\n}';

      statements.push(switchStatement);
      return {statements: statements, expression: tmp};
    };
  });
});

define('math/parsenode/orderedpair',['require','pjs','./expression','./list','math/policy'],function(require){
  var P = require('pjs');
  var Expression = require('./expression');
  var List = require('./list');
  var Policy = require('math/policy');

  return P(Expression, function(node, _super, _class) {
    node.getCompiledFunctions = function (args) {
      return [
        this.args[0].getCompiledFunctions(args)[0],
        this.args[1].getCompiledFunctions(args)[0]
      ];
    };

    node.getSliderVariables = function (concrete) {
      return Policy.sliderVariables(concrete.getDependencies()).filter(function (symbol) {
        return !Policy.validParametricVariable(symbol);
      });
    };

    node.getConcreteTree = function (frame, overrides) {
      var concreteArgs = [];
      for (var i = 0; i < this.args.length; i++) {
        concreteArgs.push(this.args[i].getConcreteTree(frame, overrides));
      }

      return this.copyWithArgs(concreteArgs);
    };

    // nonstandard constructor used by parser to desugar an ordered pair list
    // into a single ordered pair with lists of coordinates, i.e. to desugar
    // (1, 2), (3, 4) into ([1,3], [2,4])
    _class.fromList = function (list) {
      if (list.length === 1) return list[0];
      var xargs = [];
      var yargs = [];
      for (var i = 0; i < list.length; i++) {
        xargs.push(list[i].args[0]);
        yargs.push(list[i].args[1]);
      }
      return _class([List(xargs), List(yargs)]);
    };
  });
});

define('math/parsenode/movablepoint',['require','pjs','./orderedpair'],function(require){
  var P = require('pjs');
  var Parent = require('./orderedpair');

  return P(Parent, function(node, _super) {
    node.init = function (args, moveIds, moveMatrix) {
      _super.init.call(this, args);
      this._moveIds = moveIds;
      this._moveMatrix = moveMatrix;
    };

    node.isMovablePoint = true;
  });
});

//Use this table to get rid of all the string comparisons used to interpret comparators
define('math/comparators',['require'],function(require){

var ComparatorTable = {
   '<': {inclusive: false, direction: -1},
  '!=': {inclusive: false, direction:  0},
   '>': {inclusive: false, direction:  1},
  '<=': {inclusive: true,  direction: -1},
  '=': {inclusive: true,  direction:  0},
  '>=': {inclusive: true,  direction:  1}
};

var getComparator = function(inclusive, direction){
  switch(direction){
    case -1:
      return (inclusive ? '<=' : '<');
    case 0:
      return (inclusive ? '=' : '!=');
    case 1:
      return (inclusive ? '>=' : '>');
    default:
      throw "Programming error.  Comparators must have a direction of -1, 0, or 1";
  }
};

return {
  table: ComparatorTable,
  get: getComparator,
};

});

define('math/parsenode/basecomparator',['require','pjs','./scalarexpression','./expressionTypes','math/comparators','math/functions'],function(require){
  var P = require('pjs');
  var ScalarExpression = require('./scalarexpression');
  var Subtract = require('./expressionTypes').Subtract;
  var comparatorTable = require('math/comparators').table;
  var Functions = require('math/functions');

  return P(ScalarExpression, function (node, _super, _class) {
    // Create concrete Comparator classes by calling BaseComparator.create(operator).
    // This happens in parsenode/comparator.js
    _class.create = function (operator, compiledOperator) {
      compiledOperator = compiledOperator || operator;
      return P(_class, function(node, _super){
        node.operator = operator;
        node.isInequality = function () { return comparatorTable[operator].direction !== 0; };
        node.compiledOperator = compiledOperator || operator;
        node.scalarEvalExpression = function (args) { return args.join(compiledOperator); };

        node.evaluate = Functions.createEvaluateFunction(node.scalarEvalExpression, 2);
      });
    };

    node.init = function (args) {
      _super.init.call(this, args);

      this._difference = comparatorTable[this.operator].direction === -1 ?
        Subtract([args[1], args[0]]) :
        Subtract([args[0], args[1]])
      ;
    };
  });
});

define('math/parsenode/comparator',['require','math/parsenode/basecomparator'],function (require) {
  var BaseComparator = require('math/parsenode/basecomparator');

  return {
    '<': BaseComparator.create('<'),
    '>': BaseComparator.create('>'),
    '<=': BaseComparator.create('<='),
    '>=': BaseComparator.create('>='),
    '=': BaseComparator.create('=', '===')
  };
});

define('math/parsenode/piecewise',['require','pjs','./scalarexpression','./constant'],function (require) {
  var P = require('pjs');
  var Parent = require('./scalarexpression');
  var Constant = require('./constant');

  var Piecewise = P(Parent, {});

  Piecewise.chain = function (args) {
    var next;
    var head = Constant(NaN); //Default if nothing matches
    while (args.length) {
      next = args.pop();
      head = Piecewise([next.condition, next.if_expr, head]);
    }
    return head;
  };

  return Piecewise;
});

define('math/parsenode/doubleinequality',['require','pjs','./base','./identifier','./constant','./piecewise','math/comparators','./comparator'],function(require){
  var P = require('pjs');
  var Parent = require('./base');
  var Identifier = require('./identifier');
  var Constant = require('./constant');
  var Piecewise = require('./piecewise');
  var Comparators = require('math/comparators');
  var Comparator = require('./comparator');

  return P(Parent, function (node, _super) {
    node.init = function (args) {
      _super.init.call(this);
      this._symbol = args[2]._symbol;
      this._operators = [args[1], args[3]];
      this._expressions = [args[0], args[4]];

      var indicatorComparator = Comparators.get(
        Comparators.table[args[1]].inclusive && Comparators.table[args[3]].inclusive,
        Comparators.table[args[1]].direction
      );

      this._indicator = Comparator[indicatorComparator]([args[0], args[4]]);
      this.addDependency(this._symbol);
      this.addDependencies(this._expressions[0].getDependencies());
      this.addDependencies(this._expressions[1].getDependencies());
    };

    node.isInequality = function () { return true; };

    node.isShadeBetween = function () { return true; };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      return this.constructor.call(this, [
        Piecewise([this._indicator, this._expressions[0], Constant(NaN)]).getConcreteTree(frame, overrides),
        this._operators[0],
        Identifier(this._symbol), // TODO what if _symbol is in the frame?
        this._operators[1],
        Piecewise([this._indicator, this._expressions[1], Constant(NaN)]).getConcreteTree(frame, overrides)
      ]);
    };

    node.getCompiledFunctions = function (args) {
      return [
        this._expressions[0].getCompiledFunctions(args)[0], // TODO handle list expressions
        this._expressions[1].getCompiledFunctions(args)[0]
      ];
    };

    node.getCompiledDerivatives = function () {
      return [
        this._expressions[0].getCompiledDerivatives()[0],
        this._expressions[1].getCompiledDerivatives()[0]
      ];
    };
  });

});

define('math/parsenode/repeatedoperator',['require','pjs','./scalarexpression','./dummyindex','./constant','math/errormsg'],function(require){
  var P = require('pjs');
  var Parent = require('./scalarexpression');
  var DummyIndex = require('./dummyindex');
  var Constant = require('./constant');
  var ErrorMsg = require('math/errormsg');

  return P(Parent, function(node, _super) {
    node.init = function (args) {
      _super.init.call(this, args);
      this._index = args[0];
    };

    //Must define starting_value (e.g. 0)
    //Must define in_place_operator (e.g. "+=")
    //Must define evaluateConstant function

    //Always runs in a scalar environment, thanks to inheriting
    //from scalarexpression
    node.getEvalStrings = function(){
      var statements = [];

      var sum = this.tmpVar();
      var index = this._index._symbol;
      var lower_bound = this.tmpVar();
      var upper_bound = this.tmpVar();

      var lower_bound_strings = this.args[1].getEvalStrings();
      var upper_bound_strings = this.args[2].getEvalStrings();
      var summand_strings = this.args[3].getEvalStrings();

      Array.prototype.push.apply(statements, lower_bound_strings.statements);
      statements.push('var '+lower_bound+' = Math.round(' + lower_bound_strings.expression + ')');
      Array.prototype.push.apply(statements, upper_bound_strings.statements);
      statements.push('var '+upper_bound+' = Math.round(' + upper_bound_strings.expression + ')');
      statements.push('var '+sum+'='+this.starting_value);

      var loop = 'for (var '+index+'='+lower_bound+';'+index+'<='+upper_bound+';'+index+'++) {'+
          summand_strings.statements.join(';')+';'+sum+this.in_place_operator+summand_strings.expression+'};';

      var protected_loop = 'if(!isFinite('+upper_bound+'-'+lower_bound+')) {'+
          sum+'=('+upper_bound+'<'+lower_bound+'?'+this.starting_value+':NaN);}else{'+loop+'}';

      statements.push(protected_loop);

      return {statements: statements, expression: sum};
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      if (frame[this._index._symbol]) throw ErrorMsg.shadowedIndex(this._index._symbol);
      var localFrame = Object.create(frame);
      localFrame[this._index._symbol] = DummyIndex(this._index._symbol);
      var concreteTree = _super.getConcreteTree.call(this, localFrame, overrides);
      return concreteTree;
    };

    node.evaluate = function(lowerBound, upperBound, summandExpression){
      //Compile summand as function of loopVariable.
      //TODO - assert that it's not a list by this point
      var fn = summandExpression.getCompiledFunctions([this._index._symbol])[0].fn;
      //We know bounds are constant, otherwise we can't evaluate to a constant
      upperBound = Math.round(upperBound);
      lowerBound = Math.round(lowerBound);

      //Protect against NaNs and Infinities
      if(!isFinite(upperBound - lowerBound)) return (upperBound < lowerBound ? this.starting_value : NaN);

      //Run the loop
      var sum = this.starting_value;
      for(var index = lowerBound; index <= upperBound; index++){
        sum = this.update(sum, fn(index));
      }
      return sum;
    };

    node._constantCollapsedCopy = function(args){
      //Should collapse to constant if summand only depends on index variable
      if(args[1].isConstant && args[2].isConstant){
        var lowerBound = args[1].constantValue;
        var upperBound = args[2].constantValue;
        var summand = args[3];
        if(summand.isConstant){
          //Constant loop can just be multiplied
          return Constant(this.evaluateConstant([lowerBound, upperBound, summand.constantValue]));
        }
        if(summand.getDependencies().length === 0){
          //Compute, since we only depend on the loop variable
          return Constant(this.evaluate(lowerBound, upperBound, summand));
        }
      }
      return this.copyWithArgs(args);
    };
  });
});

define('math/parsenode/sum',['require','pjs','./repeatedoperator'],function(require){
  var P = require('pjs');
  var Parent = require('./repeatedoperator');

  return P(Parent, function(node, _super) {
    node.in_place_operator = '+=';
    node.starting_value = 0;

    node.evaluateConstant = function(args){
      var num_loops = 1 + Math.round(args[1]) - Math.round(args[0]);
      if(num_loops <= 0) return this.starting_value;
      return num_loops * args[3];
    };

    node.update = function(sum, value){
      return sum + value;
    };
  });
});

define('math/parsenode/product',['require','pjs','./repeatedoperator'],function(require){
  var P = require('pjs');
  var Parent = require('./repeatedoperator');

  return P(Parent, function(node, _super) {
    node.in_place_operator = '*=';
    node.starting_value = 1;

    node.evaluateConstant = function(args){
      var num_loops = 1 + Math.round(args[1]) - Math.round(args[0]);
      if(num_loops <= 0) return this.starting_value;
      return Math.pow(args[3], num_loops);
    };

    node.update = function(sum, value){
      return sum * value;
    };
  });
});

define('math/parsenode/functioncall',['require','pjs','./expression','math/errormsg','./identifier','./expressionTypes'],function(require){
  var P = require('pjs');
  var Parent = require('./expression');
  var ErrorMsg = require('math/errormsg');
  var Identifier = require('./identifier');
  var Multiply = require('./expressionTypes').Multiply;

  return P(Parent, function(node, _super) {
    node.init = function(identifier, args){
      if(typeof(identifier) === 'string') identifier = Identifier(identifier);
      this._symbol = identifier._symbol; //Relying on symbol rewrite logic in Identifier
      _super.init.call(this, args);
      this.addDependency(this._symbol);
    };

    node.copyWithArgs = function (args) {
      return new this.constructor(Identifier(this._symbol), args);
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      var fn = frame[this._symbol];
      if(fn && fn.isError) throw fn;
      if(!fn || !fn.isFunction){
        if(this.args.length == 1) {
          var multiplyArgs = [Identifier(this._symbol), this.args[0]];
          return Multiply(multiplyArgs).getConcreteTree(frame, overrides);
        }
        if(fn){
          throw ErrorMsg.variableAsFunction(this._symbol);
        }
        throw ErrorMsg.functionNotDefined(this._symbol);
      }

      var concreteArgs = [];
      for(var i = 0; i < this.args.length; i++){
        var concreteArg = this.args[i].getConcreteTree(frame, overrides);
        concreteArgs.push(concreteArg);
      }

      return fn.getConcreteInvocationTree(frame, concreteArgs, this._symbol, overrides);
    };
  });
});

define('math/parsenode/functionexponent',['require','pjs','./expression','./expressionTypes','./functioncall'],function(require){
  var P = require('pjs');
  var Parent = require('./expression');
  var expressionTypes = require('./expressionTypes');
  var Multiply = expressionTypes.Multiply;
  var Exponent = expressionTypes.Exponent;
  var FunctionCall = require('./functioncall');
  //Ambiguous function call / exponent node
  //e.g. a(b)^c
  //could be function a(b) raised to the c,
  //or could be a * (b)^c

  return P(Parent, function(node, _super){
    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      var fn = this.args[0]._symbol;
      if(frame[fn] && frame[fn].isFunction){
        return Exponent([FunctionCall(fn, [this.args[1]]), this.args[2]]).getConcreteTree(frame, overrides);
      } else {
        return Multiply([this.args[0], Exponent([this.args[1], this.args[2]])]).getConcreteTree(frame, overrides);
      }
    };
  });
});

define('math/parsenode/nativefunction',['require','pjs','./scalarexpression','math/errormsg','math/functions'],function(require){
  //This is the default definition of a built-in function, which can be expressed
  //as a string (e.g. "Math.sin")
  //This can be expanded to cover functions with unique signatures (like reducers),
  //Functions on BuiltIn instead of on Math, etc.
  var P = require('pjs');
  var ScalarExpression = require('./scalarexpression');
  var ErrorMsg = require('math/errormsg');
  var Functions = require('math/functions');

  var Invocation = P(ScalarExpression, function(node, _super){
    node.init = function(fn, args){
      _super.init.call(this, args);
      this._fn = fn;
      this.scalarEvalExpression = this._fn.scalarEvalExpression;
      this.evaluate = this._fn.evaluate;
    };

    node.copyWithArgs = function(args){
      return new this.constructor(this._fn, args);
    };

    node.polynomialOrder = function(symbol){
      return this.dependsOn(symbol) ? Infinity : 0;
    };
  });

  //This thing lives in the BuiltIn frame, but there's no way for a user to declare it,
  //or for it to actually exist as a term in an expression.
  //
  //It's not clear that it should actually be parsenode, since it's not parsed.
  //
  //It would be the thing that a user declared if we allowed them to pass
  //in arbitrary javascript for us to evaluate, e.g. via the API
  return P(function(node, _super, _class) {

    //Sample call is NativeFunction('Math.sin', 1)
    node.init = function(head, arity) {
      this._arity = arity; //TODO - verify this
      this.head = head;
      // create here to clouse in head
      this.scalarEvalExpression = function (argExpressions) {
        return head + '(' + argExpressions.join(',') + ')';
      };
      this.evaluate = Functions.createEvaluateFunction(this.scalarEvalExpression, arity);
    };

    node.isFunction = true;

    node.getConcreteInvocationTree = function (frame, args, symbol, overrides) {
      if(args.length !== this._arity) throw ErrorMsg.wrongArity(symbol, this._arity, args.length);
      return this._getInvocationTree(args).getConcreteTree(frame, overrides);
    };

    node._getInvocationTree = function(args){
      return Invocation(this, args);
    };

    _class.Invocation = Invocation;
  });
});

define('math/parsenode/trigfunction',['require','pjs','./nativefunction','./expressionTypes','./identifier'],function(require){
  //For functions like sin(x) which depend on the angleMultiplier
  //to switch between radians and degrees

  var P = require('pjs');
  var NativeFunction = require('./nativefunction');
  var Multiply = require('./expressionTypes').Multiply;
  var Identifier = require('./identifier');

  return P(NativeFunction, function(node, _super) {
    node.init = function(head){
      _super.init.call(this, head, 1);
    };

    node.getConcreteInvocationTree = function (frame, args, symbol, overrides) {
      if(frame.trigAngleMultiplier){
        var scaledArgs = [Multiply([args[0], Identifier('trigAngleMultiplier')])];
        return _super.getConcreteInvocationTree.call(this, frame, scaledArgs, symbol, overrides);
      } else {
        return _super.getConcreteInvocationTree.call(this, frame, args, symbol, overrides);
      }
    };
  });
});

define('math/parsenode/inversetrigfunction',['require','pjs','./nativefunction','./expressionTypes','./identifier'],function(require){
  //For functions like arcsin(x) which depend on the angleMultiplier
  //to switch between radians and degrees

  var P = require('pjs');
  var NativeFunction = require('./nativefunction');
  var Divide = require('./expressionTypes').Divide;
  var Identifier = require('./identifier');

  return P(NativeFunction, function(node, _super) {
    node.init = function(head){
      _super.init.call(this, head, 1);
    };

    node.getConcreteInvocationTree = function (frame, args, symbol, overrides) {
      if(frame.trigAngleMultiplier){
        var tree = this._getInvocationTree(args);
        return Divide([tree, Identifier('trigAngleMultiplier')]).getConcreteTree(frame);
      } else {
        return _super.getConcreteInvocationTree.call(this, frame, args, symbol, overrides);
      }
    };
  });
});

define('math/parsenode/reducerfunction',['require','pjs','./expression','./list','./constant','math/functions','math/errormsg'],function(require){
  //This is the definition of a built-in function which maps a single
  //list to a single scalar

  var P = require('pjs');
  var Expression = require('./expression');
  var List = require('./list');
  var Constant = require('./constant');
  var Functions = require('math/functions');
  var ErrorMsg = require('math/errormsg');

  var Invocation = P(Expression, function(node, _super){
    node.init = function(symbol, fn, args){
      _super.init.call(this, args);
      this._symbol = symbol;
      this._fn = fn;
      this.evalExpression = this._fn.evalExpression;
      this.evaluate = this._fn.evaluate;
    };

    node.copyWithArgs = function(args){
      return new this.constructor(this._symbol, this._fn, args);
    };

    node.getEvalStrings = function(){
      var list = this.args[0];
      var statements = [];
      var elementExpressions = [];
      for(var i = 0; i < list.length; i++){
        var elementStrings = list.elementAt(i).getEvalStrings();
        statements = statements.concat(elementStrings.statements);
        elementExpressions.push(elementStrings.expression);
      }
      var argExpressions = ['[' + elementExpressions.join(',') + ']'];
      return {statements: statements, expression: this.evalExpression(argExpressions)};
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);

      var i;
      var args = this.args;

      var list;
      var collect;
      if (args.length === 0) throw ErrorMsg.zeroArgReducer(this._symbol);

      if (args.length === 1) {
        list = args[0].getConcreteTree(frame, overrides);
        collect = !list.isList;
      } else if (args.length === 2 && (args[0].isList || args[1].isList)) {
        var self = this;
        return List(List.mapArgs(this.args, function (args) {
          return self.copyWithArgs(args).getConcreteTree(frame, overrides);
        }));
      } else {
        collect = true;
      }

      var concreteArgs = [];
      if (collect) {
        for (i = 0; i < args.length; i++) {
          if (args[i].isList) throw ErrorMsg.badListInReducer(this._symbol);
          concreteArgs.push(args[i].getConcreteTree(frame, overrides));
        }
        list = List(args);
      }

      //If list elements are all constant, we can constant collapse
      var constantElements = [];
      for (i = 0; i < list.length; i++) {
        var element = list.elementAt(i);
        if(!element.isConstant){
          return this.copyWithArgs([list]);
        }
        constantElements.push(element.constantValue);
      }
      return Constant(this.evaluate([constantElements]));
    };
  });

  return P(function(node, _super, _class) {
    //Sample call is ReducerFunction('Reducers.mean', 1)
    node.init = function(head, arity) {
      this.head = head;
      if (arity !== 1) throw new Error("Higher arity reduces not yet implemented");
      this._arity = arity;
      // create here to clouse in head
      this.evalExpression = function (argExpressions) {
        return head + '(' + argExpressions.join(',') + ')';
      };
      this.evaluate = Functions.createEvaluateFunction(this.evalExpression, arity);
    };

    node.isFunction = true;
    node.isReducer = true;

    node.getConcreteInvocationTree = function (frame, args, symbol, overrides) {
      return Invocation(symbol, this, args).getConcreteTree(frame, overrides);
    };

    _class.Invocation = Invocation;
  });
});

//Definition of built-in functions and variables

define('math/builtinframe',['require','math/parsenode/constant','math/parsenode/nativefunction','math/parsenode/trigfunction','math/parsenode/inversetrigfunction','math/parsenode/reducerfunction'],function(require){
  //Defining with short names
  var Constant = require('math/parsenode/constant');
  var F = require('math/parsenode/nativefunction');
  var Trig = require('math/parsenode/trigfunction');
  var ITrig = require('math/parsenode/inversetrigfunction');
  var Reducer = require('math/parsenode/reducerfunction');

  return {
    pi: Constant(Math.PI),
    tau: Constant(2 * Math.PI),
    e: Constant(Math.E),
    trigAngleMultiplier: Constant(1),

    //Trig functions
    sin: Trig('BuiltIn.sin'),
    cos: Trig('BuiltIn.cos'),
    tan: Trig('BuiltIn.tan'),
    cot: Trig('BuiltIn.cot'),
    sec: Trig('BuiltIn.sec'),
    csc: Trig('BuiltIn.csc'),
    //Inverse trig function
    arcsin: ITrig('Math.asin'),
    arccos: ITrig('Math.acos'),
    arctan: ITrig('Math.atan'),
    arccot: ITrig('BuiltIn.acot'),
    arcsec: ITrig('BuiltIn.asec'),
    arccsc: ITrig('BuiltIn.acsc'),

    //Hyperbolic trig functions
    sinh: F('BuiltIn.sinh', 1),
    cosh: F('BuiltIn.cosh', 1),
    tanh: F('BuiltIn.tanh', 1),
    coth: F('BuiltIn.coth', 1),
    sech: F('BuiltIn.sech', 1),
    csch: F('BuiltIn.csch', 1),
    arcsinh: F('BuiltIn.asinh', 1),
    arccosh: F('BuiltIn.acosh', 1),
    arctanh: F('BuiltIn.atanh', 1),
    arccoth: F('BuiltIn.acoth', 1),
    arcsech: F('BuiltIn.asech', 1),
    arccsch: F('BuiltIn.acsch', 1),

    //Power functions
    pow: F('BuiltIn.pow', 2),
    sqrt: F('Math.sqrt', 1),
    nthroot: F('BuiltIn.nthroot', 2),
    log: F('BuiltIn.log_base', 2),
    ln: F('Math.log', 1),
    exp: F('Math.exp', 1),

    //Integer functions
    floor: F('Math.floor', 1),
    ceil: F('Math.ceil', 1),
    round: F('Math.round', 1),
    abs: F('Math.abs', 1),
    sign: F('BuiltIn.sign', 1),
    mod: F('BuiltIn.mod', 2),

    lcm: F('BuiltIn.lcm', 2),
    gcd: F('BuiltIn.gcd', 2),
    nCr: F('BuiltIn.nCr', 2),
    nPr: F('BuiltIn.nPr', 2),
    factorial: F('BuiltIn.factorial', 1),
    polyGamma: F('BuiltIn.polyGamma', 2),

    //Stats
    mean: Reducer('BuiltIn.mean', 1),
    total: Reducer('BuiltIn.total', 1),
    'var': Reducer('BuiltIn.var', 1),
    stdev: Reducer('BuiltIn.stdev', 1),
    stdevp: Reducer('BuiltIn.stdevp', 1),
    length: Reducer('BuiltIn.length', 1),
    min: Reducer('BuiltIn.listMin', 1),
    max: Reducer('BuiltIn.listMax', 1),
    argmin: Reducer('BuiltIn.argMin', 1),
    argmax: Reducer('BuiltIn.argMax', 1)
  };
});

define('math/parsenode/derivative',['require','pjs','./scalarexpression','./freevariable','./identifier','math/builtinframe'],function(require){
  var P = require('pjs');
  var Parent = require('./scalarexpression');
  var FreeVariable = require('./freevariable');
  var Identifier = require('./identifier');
  var BuiltInFrame = require('math/builtinframe');

  return P(Parent, function(node, _super){
    node.init = function (symbol, args) {
      this._symbol = Identifier(symbol)._symbol; // Use identifier normalization for symbol
      _super.init.call(this, args);
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      if (frame[this._symbol]) {
        var childFrame = Object.create(frame);
        childFrame[this._symbol] = FreeVariable(this._symbol);
        var substitution = {};
        substitution[this._symbol] = frame[this._symbol];
        return _super.getConcreteTree.call(this, childFrame, overrides)
          .substitute(substitution)
          .getConcreteTree(frame, overrides)
        ;
      }
      return _super.getConcreteTree.call(this, frame, overrides);
    };

    //Not really a great name for derivatives, since they think about constants differently
    //More like getScalarConcreteTree...
    node._constantCollapsedCopy = function (concreteArgs) {
      return concreteArgs[0].takeDerivative(this._symbol).getConcreteTree(BuiltInFrame);
    };
  });
});

define('math/parsenode/equation',['require','./base','pjs','./expressionTypes','math/parsenode/comparator'],function(require){
  var Parent = require('./base');
  var P = require('pjs');
  var Subtract = require('./expressionTypes').Subtract;
  var Comparator = require('math/parsenode/comparator');

  return P(Parent, function(node, _super){
    node.init = function(lhs, rhs){
      _super.init.call(this);
      this.addDependencies(lhs.getDependencies());
      this.addDependencies(rhs.getDependencies());
      this._lhs = lhs;
      this._rhs = rhs;
      this._difference = Subtract([this._lhs, this._rhs]);
    };

    node.asComparator = function () {
      return Comparator['=']([this._lhs, this._rhs]);
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      return this.asComparator().getConcreteTree(frame, overrides);
    };
  });
});

define('math/parsenode/assignment',['require','./base','math/policy','./equation','./identifier','pjs'],function(require){
  var Parent = require('./base');
  var Policy = require('math/policy');
  var Equation = require('./equation');
  var Identifier = require('./identifier');
  var P = require('pjs');

  return P(Parent, function(node, _super){
    node.init = function(symbol, expression){
      _super.init.call(this);
      symbol = symbol._symbol; //TODO - normalize symbol processing.
      //Would like to always pass around strings, but sometimes we pass around Identifiers instead
      //due to the way the parser works.
      this.addDependencies(expression.getDependencies());
      this._expression = expression;
      this._symbol = symbol;
      this._exports = Policy.assignmentForbidden(symbol) ? [] : [symbol];
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      return this._expression.getConcreteTree(frame, overrides);
    };

    node.asEquation = function () {
      var eqn = Equation(Identifier(this._symbol), this._expression);
      // TODO was hard to predict by reading that this would be necessary. API smell.
      eqn.userData = this.userData;
      return eqn;
    };

    node.getSliderInfo = function () {
      if (this._expression.isConstant) return {value: this._expression.constantValue};
    };

  });
});

define('math/parsenode/functiondefinition',['require','pjs','./base','math/errormsg','math/policy'],function(require){
  var P = require('pjs');
  var ParseNode = require('./base');
  var ErrorMsg = require('math/errormsg');
  var Policy = require('math/policy');

  return P(ParseNode, function(node, _super) {

    node.init = function(symbol, args, expression) {
      _super.init.call(this);

      symbol = symbol._symbol; //TODO - normalize symbol processing.
      // Currently using Identifer constructor to normalize symbols

      this._argSymbols = args.map(function (identifier) { return identifier._symbol; });
      this._symbol = symbol;
      this._exports = Policy.assignmentForbidden(symbol) ? [] : [symbol];
      this._expression = expression;
      this.addDependencies(this._argSymbols);
      this.addDependencies(this._expression.getDependencies()); //Will depend on formal arguments
    };

    node.isFunction = true;

    node.getConcreteInvocationTree = function(frame, args, symbol, overrides) {
      if (args.length !== this._argSymbols.length) {
        throw ErrorMsg.wrongArity(this._symbol, this._argSymbols.length, args.length);
      }
      var localFrame = Object.create(frame);

      for (var i = 0; i < this._argSymbols.length; i++) {
        localFrame[this._argSymbols[i]] = args[i];
      }

      return this._expression.getConcreteTree(localFrame, overrides);
    };

    node.getConcreteTree = function(frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      for(var i = 0; i < this._argSymbols.length; i++){
        if(frame[this._argSymbols[i]]) throw ErrorMsg.parameterAlreadyDefined(this._argSymbols[i]);
        if(this._argSymbols[i] === this._symbol) throw ErrorMsg.parameterAlreadyDefined(this._argSymbols[i]);
      }
      return this._expression.getConcreteTree(frame, overrides);
    };

    node.getArgs = function(){
      return this._args;
    };

    node.getSliderVariables = function (concrete) {
      var argSymbols = this._argSymbols;
      return Policy.sliderVariables(concrete.getDependencies()).filter(function (symbol) {
        return argSymbols.indexOf(symbol) === -1;
      });
    };
  });
});

define('math/parsenode/optimizedregression',['require','pjs','./base'],function (require) {
  var P = require('pjs');
  var Parent = require('./base');

  return P(Parent, function (node, _super) {
    node.init = function (parameters, residuals, statistics, model, opts) {
      _super.init.call(this);
      this.parameters = parameters;
      this.residuals = residuals;
      this.statistics = statistics;
      this.model = model;

      this.isModelValid = opts.isModelValid;
      this.residualVariable = opts.residualVariable;
      this.residualSuggestionId = opts.residualSuggestionId;

      // An optimized regression exports its residual variable and all of its
      // parameters
      this._exports = [this.residualVariable];
      for (var p in parameters) {
        if (parameters.hasOwnProperty(p)) this._exports.push(p);
      }
      // TODO this is a little sketchy, since these dependencies are just a bunch
      // of tmpVars used for plotting.
      this.addDependencies(model.getDependencies());
    };

    // Forward getCompiledFunctions calls to model
    node.getCompiledFunctions = function () {
      return this.model.getCompiledFunctions.apply(this.model, arguments);
    };
    node.evaluate = function () {
      return this.model.evaluate.apply(this.model, arguments);
    };
  });
});

define('math/parsenode/regression',['require','pjs','./base','numeric','math/builtin','math/policy','graphing/label','math/errormsg','./optimizedregression','./list','./identifier','./constant','./freevariable','./expressionTypes','console'],function (require) {
  var P = require('pjs');
  var Parent = require('./base');
  var Numeric = require('numeric');
  var BuiltIn = require('math/builtin');
  var Policy = require('math/policy');
  var Label = require('graphing/label');
  var ErrorMsg = require('math/errormsg');
  var OptimizedRegression = require('./optimizedregression');
  var List = require('./list');
  var Identifier = require('./identifier');
  var Constant = require('./constant');
  var FreeVariable = require('./freevariable');
  var expressionTypes = require('./expressionTypes');
  var console = require('console');

  var Subtract = expressionTypes.Subtract;

  return P(Parent, function(node, _super){
    node.init = function(lhs, rhs){
      _super.init.call(this);
      this._lhs = lhs;
      this._rhs = rhs;
      this._difference = Subtract([lhs, rhs]);
      this.addDependencies(lhs.getDependencies());
      this.addDependencies(rhs.getDependencies());
    };

    node.isRegression = true;

    node.chooseResidualVariable = function (exportFrame) {
      if (this.userData && this.userData.residualVariable) {
        var stripped = Label.latexToIdentifier(this.userData.residualVariable);
        if (!exportFrame[stripped]) return stripped;
      }
      var dependencies = this.getDependencies();
      var candidate;
      for (var i = 0; i < dependencies.length; i++) {
        var match = dependencies[i].match(/_(.*)/);
        if (!match) continue;
        candidate = 'e_' + match[1];
        if (!exportFrame[candidate]) return candidate;
      }
      var n = 1;
      while (true) {
        candidate = 'e_' + n;
        if (!exportFrame[candidate]) return candidate;
        n++;
      }
    };

    function canCorrelate (modelNode, replacedNodes) {
      // Check if the model is of the form y = f(u, v)*x + g(u, v). Where f and g are
      // linearly independent linear (well, actually affine) functions of u and v.
      //
      // The point of this is to be sure that we actually can find the best linear fit
      // to the data by adjusting the model parameters.
      if (replacedNodes.length !== 1) return false;
      var dependencies = modelNode.getDependencies();
      if (dependencies.length !== 3) return false;
      var replacedSymbol = replacedNodes[0].symbol;

      if (!modelNode.isLinear(dependencies[0])) return false;
      if (!modelNode.isLinear(dependencies[1])) return false;
      if (!modelNode.isLinear(dependencies[2])) return false;

      // Check the slope and intercept of f(u, v)*x + g(u, v), for different values of
      // u and v to make sure that f(u, v) and g(u, v) are linearly independent.
      var i = dependencies.indexOf(replacedSymbol);
      if (i === -1) return false;
      var orderedDependencies = [dependencies[i]];
      i = (i + 1) % 3;
      orderedDependencies.push(dependencies[i]);
      i = (i + 1) % 3;
      orderedDependencies.push(dependencies[i]);

      // Because of the dependency ordering above, fn is a function fn(x, u, v).
      var fn = modelNode.getCompiledFunctions(orderedDependencies)[0].fn;

      var b0 = fn(0, 0, 0);
      var m0 = fn(1, 0, 0) - b0;

      var bu = fn(0, 1, 0);
      var mu = fn(1, 1, 0) - bu;

      var bv = fn(0, 0, 1);
      var mv = fn(1, 0, 1) - bv;

      // Check that [mu - m0, bu - b0] and [mv - m0, bv - b0] are linearly independent
      // vectors by making sure that the area of the parallelogram that they span is not
      // 0.
      return !BuiltIn.approx((mu-m0)*(bv-b0), (mv-m0)*(bu-b0));
    }

    node.getRHSModel = function (frame) {
      // Store a map of lists that have been replaced by temporary variables.
      // Have to linear search on this because JS doesn't have object hashes.
      var replacedNodes = [];
      var isValid = true;
      function _replaceWithFreeVariable (frame, overrides) {
        for (var i = 0; i < replacedNodes.length; i++) {
          if (replacedNodes[i].node === this) return replacedNodes[i].tmpVar;
        }
        var tmpVar = FreeVariable(this.tmpVar());
        var concrete = this.getConcreteTree(frame);
        if (concrete.getDependencies().length) isValid = false;
        replacedNodes.push({
          node: this,
          tmpVar: tmpVar,
          symbol: tmpVar._symbol,
          concrete: concrete
        });
        return tmpVar;
      }

      var overrides = {
        List: _replaceWithFreeVariable,
        TableColumn: _replaceWithFreeVariable,
        Range: _replaceWithFreeVariable
      };

      var node = this._rhs.tryGetConcreteTree(frame, overrides); // Actual work happens here

      return {
        node: node,
        replacedNodes: replacedNodes,
        canCorrelate: isValid && canCorrelate(node, replacedNodes),
        isValid: isValid
      };

    };

    function _mse (compiledDifference, solution) {
      var sse = 0;
      for (var j = 0; j < compiledDifference.length; j++) {
        var d = compiledDifference[j].fn.apply(undefined, solution);
        sse += d*d;
      }
      return sse/compiledDifference.length;
    }

    function _evaluateDifference (compiledDifference, solution) {
      var dy = [];
      for (var j = 0; j < compiledDifference.length; j++) {
        dy.push(compiledDifference[j].fn.apply(undefined, solution));
      }
      return dy;
    }

    function _evaluateJacobian (compiledJacobian, solution) {
      var JT = [];
      for (var i = 0; i < compiledJacobian.length; i++) {
        var Jj = [];
        for (var j = 0; j < compiledJacobian[i].length; j++) {
          Jj.push(compiledJacobian[i][j].fn.apply(undefined, solution));
        }
        JT.push(Jj);
      }
      return JT;
    }

    // Gauss-Newton iteration: steps parameters by solving JT*J*dx=-JT*dy
    // where dy is vector that we're minimizing the squares of, evaluated at the current
    // parameters, dx is the update to the parameters on the next step, and J and JT are
    // the Jacobian and its transpose.
    //
    // It would be better to solve the linear system using a QR decomposition instead of
    // an LUP decomposition, but Numeric.js doesn't support QR solves (yet...).
    function optimizeLinear (compiledDifference, compiledJacobian) {
      var solution = [];

      for (var i = 0; i < compiledJacobian.length; i++) { solution.push(0); }

      var JT = _evaluateJacobian(compiledJacobian, solution);

      var LUJTJ = Numeric.LU(Numeric.dot(JT, Numeric.transpose(JT)), true);

      // In principle, only need one iteration in linear cases, but additional steps help us
      // clean up rounding errors. Don't need to update jacobian because in a linear problem,
      // it is independent of the parameters.
      var lastSolution = solution;
      var converged = false;
      for (var m = 0; m < 5; m++) {
        var dy = _evaluateDifference(compiledDifference, solution);
        var dx = Numeric.neg(Numeric.LUsolve(LUJTJ, Numeric.dot(JT, dy)));
        if (!Numeric.all(Numeric.isFinite(dx))) break;
        solution = Numeric.add(lastSolution, dx);
        converged = Numeric.all(Numeric.eq(lastSolution, solution));
        if (converged) break;
        lastSolution = solution;
      }

      return {
        solution: solution,
        f: _mse(compiledDifference, solution),
        converged: converged
      };
    }

    // Modified Levenberg-Marquardt algorithm, based on
    //
    // Transtrum, Machta, and Sethna, Phys. Rev. E 83, 036701 (2011)
    // http://dx.doi.org/10.1103/PhysRevE.83.036701
    // http://link.aps.org/accepted/10.1103/PhysRevE.83.036701 [PDF]
    //
    // This is currently their "delayed gratification algorithm," but I intend to add
    // the geodesic acceleration term to implement the full "Algorithm 2" from appendix
    // B.
    //
    // The full algorithm iterates by solving
    //
    // (JT*J + lambda*I)*v=JT*dy
    // JT*J*a=JT*(dvdvdy)
    //
    // for v and a, where J and JT are the jacobian and its transpose, I is an identity
    // matrix, dy is the vector of differences that is being minimized, dvdvdy is the
    // directional second derivative of the difference vector, evaluated in the v direction,
    // and lambda is a dynamically adjusted parameter that controls step size
    //
    // The parameters are then updated according to
    // solution = solution + v + 1/2*a
    //
    // If the new solution is worse than the old solution, lambda is increased, producing
    // a smaller step. If the new solution is better, it is accepted, and lambda is decreased.
    function _optimizeNonLinear (compiledDifference, compiledJacobian, p0, maxIterations) {
      var solution = p0;
      var f = _mse(compiledDifference, solution);

      var lambda = 0.001;
      var lambdaUp = 2;
      var lambdaDown = 0.1;

      var ones = [];
      for (var j = 0; j < compiledJacobian.length; j++) { ones.push(1); }

      var it = 0;

      var converged = false;
      var JT = _evaluateJacobian(compiledJacobian, solution);
      var lastSolution = solution;
      var lastF = f;
      while (it < maxIterations && !converged) {
        var dy = _evaluateDifference(compiledDifference, solution);
        var J = Numeric.transpose(JT);
        var JTJ = Numeric.dot(JT, J);

        if (!Numeric.all(Numeric.isFinite(dy))) break;
        if (!Numeric.all(Numeric.isFinite(JTJ))) break;

        var decreased = false;

        while (it < maxIterations && !converged && !decreased) {
          it += 1;

          // metric = JT*J + lambda*I
          var LUmetric = Numeric.LU(
            Numeric.add(JTJ, Numeric.diag(Numeric.mul(lambda, ones))),
          true);

          var v = Numeric.neg(Numeric.LUsolve(LUmetric, Numeric.dot(JT, dy)));

          //TODO calculate geodesic acceleration here and add it to v.
          var dx = v;

          solution = Numeric.add(lastSolution, dx);
          f = _mse(compiledDifference, solution);

          converged = Numeric.all(Numeric.eq(solution, lastSolution));

          if (converged) {
            lastSolution = solution;
            lastF = f;
            break;
          }

          var tmpJT;
          if (isFinite(f) && f <= lastF) {
            tmpJT = _evaluateJacobian(compiledJacobian, solution);
            decreased = Numeric.all(Numeric.isFinite(tmpJT));
          }

          if (decreased) {
            JT = tmpJT;
            lastSolution = solution;
            lastF = f;
            lambda *= lambdaDown;
            // Don't let lambda underflow
            lambda = Math.max(1e-64, lambda);
            break;
          } else {
            lambda *= lambdaUp;
          }
        }
      }

      return {
        solution: lastSolution,
        f: lastF,
        converged: converged
      };
    }

    //goal of these:
    // 1/4 are negative (8), 3/4 (24) are positive
    // approximately log-normal, w/ variance of 3
    // generated on: https://www.desmos.com/calculator/1xxlt84tvo
    //plus some from Eli thrown in (1, -1, 120, 1500, -.3)
    var pseudoRandoms = [
      18.9, 0.105, 0.0113, 0.089,
      4.414, 34.32, 8.61, 0.373,
      0.06, 0.149, 1.84, 9.26,
      5, 0.7, 0.2, 1.13,
      2.61, 1.89, 1, 0.007, 30,
      120, 1500, 0.0004, 7.23,
      -1, -0.0081, -0.03, -28.6,
      -1.71, -0.4, -6.94, -0.777
    ];


    var pseudoRandom = function (seed) {
      //503 is prime. That's all it's got going for it
      var index = (seed * 503) % (pseudoRandoms.length);
      return pseudoRandoms[index];
    };

    var generateStartingValues = function (numVals, args) {
      var startingVals = [], newStartingVals, nargs = args.length;
      for (var i = 0 ; i < numVals ; i++) {
        newStartingVals = [];
        for (var j = 0 ; j < nargs ; j++) {
          //prepopulate with a few stock starting values:
          //  * all 0, which helps with y1 ~ e^(a*x1+b)
          //  * all 1, which helps with y1 ~ a*b^x1
          //then use pseudo-randomly generated parameters for the rest
          if (i === 0) {
            newStartingVals[j] = 0;
          } else if (i === 1) {
            newStartingVals[j] = 1;
          } else {
            newStartingVals[j] = pseudoRandom(i*nargs+j);
          }
        }
        startingVals.push(newStartingVals);
      }
      return startingVals;
    };

    //
    // goal of this is to try a bunch of random starting values, and only explore the ones that are closest
    // niterations is the depth to search each option
    // nreturn is the number to return
    //
    var filterStartingValues = function (compiledDifference, compiledJacobian, startingVals, niterations, nreturn) {
      var scores = [];

      for (var j = 0; j < startingVals.length; j++) {
        scores.push({
          soln: _optimizeNonLinear(compiledDifference, compiledJacobian, startingVals[j], niterations),
          startingVals: startingVals[j]
        });
      }

      scores.sort(function(el1, el2) {
        if (isNaN(el1.soln.f)) return 1;
        if (isNaN(el2.soln.f)) return -1;
        return el1.soln.f - el2.soln.f;
      });

      var toReturn = [];
      for (var i = 0 ; i < nreturn ; i++) {
        toReturn.push(scores[i].startingVals);
      }
      return toReturn;
    };

    function optimizeNonLinear (compiledDifference, compiledJacobian, args, userParams, lastExportFrame) {
      /* jshint maxcomplexity: 11 */
      var i;
      var xlast = [];
      if (!userParams) userParams = {};
      if (!lastExportFrame) lastExportFrame = {};
      for (i = 0; i < args.length; i++) {
        var symbol = args[i];
        if (lastExportFrame[symbol] && isFinite(lastExportFrame[symbol].constantValue)) {
          xlast.push(+lastExportFrame[symbol].constantValue);
        } else if (userParams.hasOwnProperty(symbol) && isFinite(userParams[symbol])) {
          xlast.push(+userParams[symbol]);
        } else {
          xlast.push(1);
        }
      }

      //generate some random starting points
      var startingVals = generateStartingValues(30, args);
      //filter these down, first by finding 5 promising starting points, and then filtering down to 1 deeply
      var firstPass = filterStartingValues(compiledDifference, compiledJacobian, startingVals, 3, 5);
      var secondPass = filterStartingValues(compiledDifference, compiledJacobian, firstPass, 60, 1);

      var solnrestart = _optimizeNonLinear(compiledDifference, compiledJacobian, secondPass[0], 250);
      var solnlast = _optimizeNonLinear(compiledDifference, compiledJacobian, xlast, 100);

      if (!isFinite(solnlast.f)) return solnrestart;
      if (solnlast.f < solnrestart.f) return solnlast;
      return BuiltIn.approx(solnlast.f, solnrestart.f, 8) ? solnlast : solnrestart;
    }

    function getCorrelation (concreteIndependent, concreteDependent) {
      var l1 = [];
      var l2 = [];
      List.eachArgs([concreteIndependent, concreteDependent], function (elts) {
        l1.push(+elts[0].constantValue);
        l2.push(+elts[1].constantValue);
      });
      return BuiltIn.corr(l1, l2);
    }

    node.getResidualSuggestionId = function (residualVariable, priorAnalysis) {
      // Search for a table who's first column is in the regressions rhs.
      // If any table that the regression depends on already has a column
      // that depends on the regression's residual variable, return undefined.
      var rhsDependencies = this._rhs.getDependencies();
      var candidateId;
      for (var id in priorAnalysis) {
        if (!priorAnalysis.hasOwnProperty(id)) continue;
        if (!priorAnalysis[id].concreteTree.isTable) continue;
        if (!priorAnalysis[id].concreteTree.columns[0]) continue;
        var rawColumns = priorAnalysis[id].rawTree.columns;
        if (!rawColumns || !rawColumns.length) continue;
        var exports = rawColumns[0].getExports();
        if (exports.length !== 1) continue;
        if (rhsDependencies.indexOf(exports[0]) === -1) continue;

        for (var i = 1; i < rawColumns.length; i++) {
          if (rawColumns[i].getDependencies().indexOf(residualVariable) !== - 1) return undefined;
        }
        candidateId = candidateId ? candidateId : id;
      }

      return candidateId ? candidateId : undefined;
    };

    node.optimize = function (frame, exportFrame, lastExportFrame, priorAnalysis) {
      /* jshint maxcomplexity: 15*/
      var concreteLHS = this._lhs.tryGetConcreteTree(frame);
      var concreteRHS = this._rhs.tryGetConcreteTree(frame);
      if (concreteLHS.isError) return concreteLHS;
      if (concreteRHS.isError) return concreteRHS;

      var concreteDifference = this._difference.tryGetConcreteTree(frame);
      if (concreteDifference.isError) return concreteDifference;
      if (!concreteDifference.isList) return ErrorMsg.nonListRegression();

      var soln, i;
      var args = concreteDifference.getDependencies();

      for (i = 0; i < args.length; i++) {
        if (!Policy.validRegressionParameter(args[i])) {
          return ErrorMsg.invalidRegressionParameter(args[i]);
        }
      }

      var compiledDifference = concreteDifference.getCompiledFunctions(args);
      if (!args.length) {
        soln = {
          f: _mse(compiledDifference, []),
          solution: []
        };
      } else {

        // Since this is a multivariate function in general, we have to be careful with our
        // isLinear check. Can't check each arg separately, because (1+x)*(1+y) is linear in
        // x and y separately, but is not linear overall (where by linear, we actually mean
        // affine, here and in many places).
        var argmap = {};
        for (i = 1; i < args.length; i++) {
          argmap[args[i]] = FreeVariable(args[0]);
        }

        var isLinear = concreteDifference.substitute(argmap).isLinear(args[0]);
        // This block can fail because takeDerivative can produce too many nodes, or possibly
        // inside calls to Numeric
        try {
          var compiledJacobian = [];
          for (i = 0; i < args.length; i++) {
            compiledJacobian.push(concreteDifference.takeDerivative(args[i]).getCompiledFunctions(args));
          }
          if (isLinear) {
            soln = optimizeLinear(compiledDifference, compiledJacobian);
          } else {
            soln = optimizeNonLinear(compiledDifference, compiledJacobian,
              args, this.userData.regressionParameters, lastExportFrame
            );
          }
        } catch (e) {
          console.log(e);
          return ErrorMsg.optimizationError();
        }
      }
      var localFrame = Object.create(frame, parameters);
      var parameters = {};
      for (i = 0; i < args.length; i++) {
        localFrame[args[i]] = parameters[args[i]] = Constant(soln.solution[i]);
      }

      var model = this.getRHSModel(frame);
      var residuals = this._difference.getConcreteTree(localFrame);

      // If the lhs depends on parameters, return the RMS of the residuals instead of Rsquared.
      var statistics;
      var msqres = soln.f;
      var lhsVariance = concreteLHS.isList ?
        BuiltIn.var(concreteLHS.args.map(function (c) {return +c.constantValue})) :
        0
      ;
      if (
        concreteLHS.getDependencies().length ||
        !isFinite(lhsVariance) ||
        lhsVariance <= 0 ||
        !(this._lhs instanceof Identifier || this._lhs instanceof List)
      ) {
        statistics = {
          'RMSE': Math.sqrt(msqres)
        };
      } else if (model.canCorrelate) {
        statistics = {
          'r': getCorrelation(concreteLHS, model.replacedNodes[0].concrete)
        };
      } else {
        statistics = {
          'Rsquared': 1 - msqres/lhsVariance
        };
      }

      var substitutedModel = model.node.isError ? model.node : model.node.substitute(parameters);

      var residualVariable = this.chooseResidualVariable(exportFrame);
      var residualSuggestionId = this.getResidualSuggestionId(residualVariable, priorAnalysis);
      // Update userData here because there is no guarantee that the new value has to
      // to come back from the frontend.
      this.userData.residualVariable = Label.identifierToLatex(residualVariable);

      return OptimizedRegression(parameters, residuals, statistics, substitutedModel, {
        isModelValid: model.isValid,
        residualVariable: residualVariable,
        residualSuggestionId: residualSuggestionId
      });
    };

    node.exportTo = function (concrete, frame) {
      if (concrete.isError) return;
      for (var symbol in concrete.parameters) {
        if (!concrete.parameters.hasOwnProperty(symbol)) continue;
        if (Policy.assignmentForbidden(symbol)) continue;
        frame[symbol] = frame[symbol] ? ErrorMsg.multiplyDefined(symbol) : concrete.parameters[symbol];
      }

      // Never expect this to happen, but just to be safe...
      if (Policy.assignmentForbidden(concrete.residualVariable)) return;
      // Shouldn't have to worry about residualVariable being in the frame, since we chose it not to be.
      frame[concrete.residualVariable] = concrete.residuals;
    };

    // Regressions should never suggest sliders
    node.getSliderVariables = function () { return []; };
  });
});

define ('math/parsenode/table',['require','pjs','./base','math/policy','./constant','./list'],function (require) {
  var P = require('pjs');
  var Parent = require('./base');
  var Policy = require('math/policy');
  var Constant = require('./constant');
  var List = require('./list');

  return P(Parent, function (node, _super) {
    node.init = function (columns) {
      _super.init.call(this);
      this.columns = columns;
      this._exports = [];
      for (var i = 0; i < columns.length; i++) {
        this.addDependencies(columns[i].getDependencies());
        Array.prototype.push.apply(this._exports, columns[i].getExports());
      }
    };

    node.exportPenalty = 1;

    node.isTable = true;

    node.canAutoRegress = function (concrete) {
      /* jshint maxcomplexity: 11 */
      if (concrete.isError) return false;
      if (this.columns.length > 2) return false;

      for (var i = 0; i < this.columns.length; i++) {
        var symbols = this.columns[i].getExports();
        if (symbols.length !== 1) return false;
        if (Policy.assignmentForbidden(symbols[0])) return false;
        if (concrete.columns[i].isError) return false;
        if (!concrete.columns[i].isIndependent) return false;
        var columnLength = concrete.columns[i].values.args.length;
        if (columnLength < 2) return false;
        for (var j = 0; j < columnLength; j++) {
          if (isNaN(+concrete.columns[i].values.args[j].constantValue)) return false;
        }
      }

      return true;
    };

    function _replaceErrorWithNaN (arg) {
      return (arg.isError) ? Constant(NaN) : arg;
    }

    // Note, only exports table column values. Will need to modify this if we allow,
    // e.g., assignments in headers.
    node.exportTo = function (concrete, frame) {
      for (var i = 0; i < this.columns.length; i++) {
        var symbols = this.columns[i].getExports();
        if (!symbols.length) continue;
        var symbol = symbols[0];
        if (Policy.assignmentForbidden(symbol)) continue;
        if (frame[symbol]) continue;
        // Replace errors with NaN's for export
        if (concrete.isError) {
          frame[symbol] = concrete;
        } else if (concrete.columns[i].isError) {
          frame[symbol] = concrete.columns[i];
        } else {
          frame[symbol] = List(concrete.columns[i].values.args.map(_replaceErrorWithNaN));
        }
      }
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      var concreteColumns = [];
      var localFrame = Object.create(frame);
      for (var i = 0; i < this.columns.length; i++) {
        var concreteColumn = this.columns[i].getConcreteTree(localFrame, frame, overrides);
        if (concreteColumn.isIndependent) {
          localFrame[concreteColumn.header._symbol] = concreteColumn.values;
        }
        concreteColumns.push(concreteColumn);
      }
      return this.constructor(concreteColumns);
    };

    // TODO shim
    node.getAllIds = function () {
      return this.columns.map(function (c) { return c.header.userData.id; });
    };
  });
});
define ('math/parsenode/tablecolumn',['require','pjs','./base','./list','./identifier','math/policy'],function (require) {
  var P = require('pjs');
  var Parent = require('./base');
  var List = require('./list');
  var Identifier = require('./identifier');
  var Policy = require('math/policy');

  return P(Parent, function (node, _super) {
    node.init = function (header, length, values) {
      _super.init.call(this);
      this.header = header;
      this.length = length;
      this.values = values;
      this.isIndependent = false; // May be changed to true in a concrete tree
      this.addDependencies(header.getDependencies());
      this.addDependencies(values.getDependencies());
      this._exports = this._computeExports();
    };

    node._computeExports = function () {
      if (!(this.header instanceof Identifier)) return [];
      var symbol = this.header._symbol;
      return Policy.assignmentForbidden(symbol) ? [] : [symbol];
    };

    // Override getConcreteTree to allow storing errors in individual elements
    // instead of propagating errors to the top of the column.
    node.getConcreteTree = function (frame, parentFrame) {
      var concreteHeader = this.header.getConcreteTree(frame);
      var concreteElements;
      var concrete;
      if (concreteHeader.isFreeVariable) {
        concreteElements = [];
        for (var i = 0; i < this.values.args.length; i++) {
          var concreteElement = this.values.args[i].tryGetConcreteTree(frame);
          concreteElements.push(concreteElement);
        }
        concrete = this.constructor(concreteHeader, this.length, List(concreteElements));
        concrete.isIndependent = true;
        concrete.isDiscrete = true;
        return concrete;
      } else {
        if (concreteHeader.isConstant) {
          var values = [];
          for (var n = 0; n < this.length; n++) values.push(concreteHeader);
          concreteElements = List(values);
        } else {
          concreteElements = concreteHeader;
        }
        concreteHeader = this.header.getConcreteTree(parentFrame);
        concrete = this.constructor(concreteHeader, this.length, concreteElements);
        concrete.isDiscrete = !!(concreteHeader.isList || concreteHeader.isConstant);
        return concrete;
      }
    };
  });
});

define('math/parsenode/solvedequation',['require','pjs','./base'],function (require) {

  var P = require('pjs');
  var ParseNode = require('./base');

  return P(ParseNode, function(node, _super) {
    node.init = function (symbol, expression) {
      _super.init.call(this);
      this._symbol = symbol; // The symbol that was solved for.
      this._expression = expression;
      this.addDependencies(expression.getDependencies());
    };

    node.getConcreteTree = function (frame, overrides) {
      if (overrides && overrides[this.type]) return overrides[this.type].call(this, frame, overrides);
      return this.constructor(this._symbol, this._expression.getConcreteTree(frame, overrides));
    };

    node.getEvaluationInfo = function () {
      if (this._expression.isList) {
        return this._expression.args.map(function (a) {
          return {val: a.constantValue, operator: '='};
        });
      }
      return this._expression.getEvaluationInfo();
    };

    // Delegate to _expression
    node.getCompiledFunctions = function () {
      return this._expression.getCompiledFunctions.apply(this._expression, arguments);
    };
    node.evaluate = function () {
      return this._expression.evaluate.apply(this._expression, arguments);
    };
  });
});

define('parsenodes',['require','math/parsenode/expressionTypes','math/parsenode/base','math/parsenode/expression','math/parsenode/scalarexpression','math/parsenode/error','math/parsenode/constant','math/parsenode/identifier','math/parsenode/freevariable','math/parsenode/dummyindex','math/parsenode/list','math/parsenode/range','math/parsenode/listaccess','math/parsenode/orderedpair','math/parsenode/movablepoint','math/parsenode/basecomparator','math/parsenode/comparator','math/parsenode/doubleinequality','math/parsenode/repeatedoperator','math/parsenode/sum','math/parsenode/product','math/parsenode/functioncall','math/parsenode/functionexponent','math/parsenode/piecewise','math/parsenode/derivative','math/parsenode/assignment','math/parsenode/functiondefinition','math/parsenode/equation','math/parsenode/regression','math/parsenode/table','math/parsenode/tablecolumn','math/parsenode/nativefunction','math/parsenode/reducerfunction','math/parsenode/solvedequation','math/parsenode/optimizedregression'],function(require){
  var expressionParseNodes = require('math/parsenode/expressionTypes'); //Require expressionsTypes

  var nodes = {
    //Base Types
    Base:         require('math/parsenode/base'),
    Expression:   require('math/parsenode/expression'),
    ScalarExpression: require('math/parsenode/scalarexpression'),

    //Primitive Types
    Error:        require('math/parsenode/error'),
    Constant:     require('math/parsenode/constant'),
    Identifier:   require('math/parsenode/identifier'),
    FreeVariable: require('math/parsenode/freevariable'),
    DummyIndex:   require('math/parsenode/dummyindex'),

    //List types
    List:         require('math/parsenode/list'),
    Range:        require('math/parsenode/range'),
    ListAccess:   require('math/parsenode/listaccess'),

    // Points and point lists
    OrderedPair:        require('math/parsenode/orderedpair'),
    MovablePoint:       require('math/parsenode/movablepoint'),

    //Expressions and operators
    BaseComparator:   require('math/parsenode/basecomparator'),
    Comparator:       require('math/parsenode/comparator'),
    DoubleInequality: require('math/parsenode/doubleinequality'),
    RepeatedOperator:  require('math/parsenode/repeatedoperator'),
    Sum:              require('math/parsenode/sum'),
    Product:          require('math/parsenode/product'),
    FunctionCall:     require('math/parsenode/functioncall'),
    FunctionExponent: require('math/parsenode/functionexponent'),
    Piecewise:        require('math/parsenode/piecewise'),
    Derivative:       require('math/parsenode/derivative'),

    //Exports and definitions
    Assignment:         require('math/parsenode/assignment'),
    FunctionDefinition: require('math/parsenode/functiondefinition'),
    Equation:           require('math/parsenode/equation'),
    Regression:         require('math/parsenode/regression'),

    // Tables
    Table:            require('math/parsenode/table'),
    TableColumn:      require('math/parsenode/tablecolumn'),

    // Concrete function call nodes
    NativeFunction:   require('math/parsenode/nativefunction'),
    ReducerFunction:  require('math/parsenode/reducerfunction'),

    // Concrete solved equation
    SolvedEquation:   require('math/parsenode/solvedequation'),
    OptimizedRegression: require('math/parsenode/optimizedregression')

  };

  //Each of the simple expression types
  for(var nodeType in expressionParseNodes){
    nodes[nodeType] = expressionParseNodes[nodeType];
  }

  for (var t in nodes) {
    if (!nodes.hasOwnProperty(t)) continue;
    if (t === 'Comparator') continue;
    nodes[t].prototype.type = t;
  }

  for (var op in nodes.Comparator) {
    if (!nodes.Comparator.hasOwnProperty(op)) continue;
    nodes.Comparator[op].prototype.type = 'Comparator[\'' + op + '\']';
  }

  return nodes;
});

define('math/inverses',[],function () {
  var inverses = {};

  // Functions with an inverse spelled arcname
  var arcNames = [
    'sin',
    'cos',
    'tan',
    'cot',
    'sec',
    'csc',
    'sinh',
    'cosh',
    'tanh',
    'coth',
    'sech',
    'csch'
  ];

  arcNames.forEach(function (name) {
    inverses[name] = 'arc' + name;
    inverses['arc' + name] = name;
  });

  return inverses;
});
/*
* baseparser is separated from parser so that it can be used inside
* features without creating a circular dependency. Outside users
* should include parser, which adds features to the baseparse.
*/
define('math/baseparser',['require','jison','parsenodes','math/inverses','math/errormsg'],function(require){
  var jison = require('jison');
  var yy = jison.yy;
  var ParseNodes = require('parsenodes');
  var inverses = require('math/inverses');
  var ErrorMsg = require('math/errormsg');

  var exports = {};

  //Public parsing API
  exports.parse = function(input) {
    try {
      return jison.parse('###'+input);
    } catch (e) {
      if (e instanceof ParseNodes.Error) return e;
      return ErrorMsg.parseError();
    }
  };

  yy.ErrorMsg = ErrorMsg;

  yy.setInput = function (node, range) {
    //Don't ever show the '###' mark we insert to mark the start of the string
    node.setInputString(yy.lexer.matched.slice(Math.max(3, range.first_column), range.last_column));
  };

  //Make all ParseNodes available on yy object for jison
  for(var nodeType in ParseNodes){
    yy[nodeType] = ParseNodes[nodeType];
  }

  //Register known inverses
  yy.inverses = inverses;

  /* This function takes the entire function declaration as a single lexed token and parses with a regexp,
   * to keep the overall grammar context-free and LALR(1)-parseable.
   * TODO - generate this once, not every time we parse a function declaration */
  yy.parseFunctionDeclaration = function (declaration_string) {
    declaration_string = declaration_string.replace('###', '');  //Strip off start-of-line marker
    var whitespace_pattern =  //Non-capturing latex whitespace pattern
       "(?:\\s|\\\\space|\\\\\\:)*";
       //   \s   \\space  \\ \ :
    var id_body_pattern = //Non-capturing latex identifier pattern
       "(?:[a-zA-Z]|\\\\[a-zA-Z]+)";
    var id_subscript_pattern = //Non-capturing latex subscript pattern
       "(?:_[a-zA-Z0-9]|_{[a-zA-Z0-9]+})?";
    var id_pattern = id_body_pattern+id_subscript_pattern;

    var arglist_pattern = //Non-capturing comma-separated list of identifiers in whitespace-free string
      "(?:" + id_pattern + "(?:\\," + id_pattern + ")*)";

    var declaration_pattern = //Captures function name as first group, and arglist as second group
      "(" + id_pattern + ")" + "(?:\\\\left)?\\((" + arglist_pattern + ")(?:\\\\right)?\\)=";

    var declaration_regexp = new RegExp(declaration_pattern);
    var whitespace_regexp = new RegExp(whitespace_pattern, "g");
    //Want "g" flag to ensure global capturing of whitespace
    declaration_string = declaration_string.replace(whitespace_regexp, '');
    var match = declaration_regexp.exec(declaration_string);

    return {
      identifier: ParseNodes.Identifier(match[1]),      //match[1] is the function symbol.
      //match[2] is the argument list.  Split it on commas.
      args: match[2].split(',').map(function (symbol) { return ParseNodes.Identifier(symbol); }),
    };
  };

  return exports;
});

// String representation of parse nodes that should return the same parse tree when executed.
// Intended to be used for debugging and experiments, not for implementing other features.
define('math/features/repr',['require','parsenodes'],function (require) {
  var nodes = require('parsenodes');

  var reprArgs = function (args, prefix, level) {
    level = level || 0;
    var lastIndent = Array(level + 1).join('  ');
    var indent = lastIndent + '  ';
    return '[' + '\n' +
      indent + args.map(function (arg) {
        return arg.repr(prefix, level + 1);
      }).join(',\n' + indent) + '\n' +
    lastIndent + ']';
  };

  var reprHead = function (head, prefix) {
    prefix = prefix || '';
    return '' + prefix + '' + head;
  };

  nodes.DoubleInequality.prototype.repr =
  nodes.Expression.prototype.repr = function (prefix, level) {
    return reprHead(this.type, prefix) + '(' + reprArgs(this.args, prefix, level) + ')';
  };

  nodes.Identifier.prototype.repr =
  nodes.FreeVariable.prototype.repr = function (prefix) {
    return reprHead(this.type, prefix) + '(\'' + this._symbol + '\')';
  };

  nodes.Constant.prototype.repr = function (prefix) {
    return reprHead(this.type, prefix) + '(' + this.constantValue + ')';
  };

  nodes.FunctionCall.prototype.repr = function (prefix, level) {
    return reprHead(this.type, prefix) + '(' +
      '\'' + this._symbol + '\'' + ', ' + reprArgs(this.args, prefix, level) +
    ')';
  };

  nodes.Assignment.prototype.repr = function (prefix, level) {
    return reprHead(this.type, prefix) + '(' +
      nodes.Identifier(this._symbol).repr(prefix, level) + ', ' +
      this._expression.repr(prefix, level) +
    ')';
  };

  nodes.Regression.prototype.repr =
  nodes.Equation.prototype.repr = function (prefix, level) {
    return reprHead(this.type, prefix) + '(' +
      this._lhs.repr(prefix, level) + ', ' +
      this._rhs.repr(prefix, level) +
    ')';
  };

  nodes.FunctionDefinition.prototype.repr = function (prefix, level) {
    return reprHead(this.type, prefix) + '(' +
      nodes.Identifier(this._symbol).repr(prefix, level) + ', ' +
      reprArgs(this._argSymbols.map(function (s) { return nodes.Identifier(s); }), prefix, level) + ', ' +
      this._expression.repr(prefix, level) +
    ')';
  };

  nodes.Error.prototype.repr = function (prefix, level) {
    return reprHead(this.type, prefix) + '(\'' + this._msg + '\')';
  };

  nodes.Derivative.prototype.repr = function (prefix, level) {
    return reprHead(this.type, prefix) + '(' +
      '\'' + this._symbol + '\'' + ', ' + reprArgs(this.args, prefix, level) +
    ')';
  };

  nodes.SolvedEquation.prototype.repr = function (prefix, level) {
    return reprHead(this.type, prefix) + '(' +
      '\'' + this._symbol + '\'' + ', ' + this._expression.repr(prefix, level) +
    ')';
  };

  nodes.OptimizedRegression.prototype.repr = function (prefix, level) {
    return reprHead(this.type, prefix) + '(' +
      JSON.stringify(this.parameters) + ', ' +
      JSON.stringify(this.residuals) + ', ' +
      JSON.stringify(this.statistics) + ', ' +
      this.model.repr(prefix, level + 1) + ', ' +
      JSON.stringify({
        isModelValid: this.isModelValid,
        residualVariable: this.residualVariable,
        residualSuggestionId: this.residualSuggestionId
      }) +
    ')';
  };

  // TODO, Table could be an expression
  nodes.Table.prototype.repr = function (prefix, level) {
    return reprHead(this.type, prefix) + '(' + reprArgs(this.columns, prefix, level) + ')';
  };

  nodes.TableColumn.prototype.repr = function (prefix, level) {
    return reprHead(this.type, prefix) + '(' +
      this.header.repr(prefix, level) + ', ' + this.length + ', ' +
      reprArgs(this.values, prefix, level) +
    ')';
  };


});

define('math/features/scalarEvalExpression',['require','parsenodes','math/functions'],function(require){
  var nodes = require('parsenodes');
  var Functions = require('math/functions');

  var expressions = {
    Add: function(args){
      return '(' + args.join('+') + ')';
    },
    Multiply: function(args){
      return '(' + args.join('*') + ')';
    },
    Divide: function(args){
      return '(' + args.join('/') + ')';
    },
    Subtract: function(args){
      return '(' + args.join('-') + ')';
    },
    Exponent: function(args){
      return 'BuiltIn.pow('+args.join(',')+')';
    },
    Negative: function(args){
      return '(-' + args[0] + ')';
    },
    And: function(args){
      //Used for Chained Comparators (a<b<c becomes a<b && b<c)
      //TODO - this naively re-evaluates middle terms
      //TODO - this doesn't check that directions agree
      return args.join('&&');
    },
    Piecewise: function(args){
      //TODO - this will naively evaluate statements
      //for all branches.
      //This will produce correct output, but performance
      //will be better if we only evaluate needed statements
      return '('+args[0]+'?'+args[1]+':'+args[2]+')';
    }
  };

  var arities = {
    Add: 2,
    Multiply: 2,
    Divide: 2,
    Subtract: 2,
    Exponent: 2,
    Negative: 1,
    And: 2,
    Piecewise: 3
  };

  for (var nodeType in expressions) {
    var p = nodes[nodeType].prototype;
    p.scalarEvalExpression = expressions[nodeType];
    p.evaluate = Functions.createEvaluateFunction(p.scalarEvalExpression, arities[nodeType]);
  }

});

define('math/features/okForImplicitFunction',['require','parsenodes'],function(require){
  var nodes = require('parsenodes');

  nodes.Add.prototype.okForImplicitFunction =
  nodes.Subtract.prototype.okForImplicitFunction =
  nodes.Add.prototype.okForImplicitFunction =
  nodes.Multiply.prototype.okForImplicitFunction =
  nodes.Divide.prototype.okForImplicitFunction =
  nodes.Exponent.prototype.okForImplicitFunction = function(){
    for(var i = 0; i < this.args.length; i++){
      if(!this.args[i].okForImplicitFunction()) return false;
    }
    return true;
  };
});

define('math/features/constantcollapsedcopy',['require','parsenodes'],function(require) {
  var nodes = require('parsenodes');
  var Constant = nodes.Constant;

  var defs = {
    Add: function (args) {
      if (args[0].isConstant && args[1].isConstant) {
        return Constant(this.evaluate([args[0].constantValue, args[1].constantValue]));
      }
      if (args[0].constantValue === 0) return args[1];
      if (args[1].constantValue === 0) return args[0];
      return this.copyWithArgs(args);
    },
    Multiply: function (args) {
      if (args[0].isConstant && args[1].isConstant) {
        return Constant(this.evaluate([args[0].constantValue, args[1].constantValue]));
      }
      if (args[0].constantValue === 1) return args[1];
      if (args[1].constantValue === 1) return args[0];
      return this.copyWithArgs(args);
    },
    Subtract: function (args) {
      if (args[0].isConstant && args[1].isConstant) {
        return Constant(this.evaluate([args[0].constantValue, args[1].constantValue]));
      }
      if (args[0].constantValue === 0) return nodes.Negative([args[1]]);
      if (args[1].constantValue === 0) return args[0];
      return this.copyWithArgs(args);
    },
    Divide: function (args) {
      if (args[0].isConstant && args[1].isConstant) {
        return Constant(this.evaluate([args[0].constantValue, args[1].constantValue]));
      }
      if (args[1].constantValue === 1) return args[0];
      return this.copyWithArgs(args);
    },
    Exponent: function (args) {
      if (args[0].isConstant && args[1].isConstant) {
        return Constant(this.evaluate([args[0].constantValue, args[1].constantValue]));
      }
      if (args[1].constantValue === 1) return args[0];
      return this.copyWithArgs(args);
    },
    Negative: function (args) {
      if (args[0].isConstant) return Constant(-args[0].constantValue);
      if (args[0] instanceof nodes.Negative) return args[0].args[0];
      return this.copyWithArgs(args);
    },
    And: function (args) {
      if (args[0].isConstant && args[1].isConstant) {
        return Constant(args[0].constantValue && args[1].constantValue);
      }
      if (args[0].isConstant && args[0] === true) return args[1];
      if (args[0].isConstant && args[0] === false) return Constant(false);
      if (args[1].isConstant && args[1] === true) return args[0];
      if (args[1].isConstant && args[1] === false) return Constant(false);
      return this.copyWithArgs(args);
    },
    Piecewise: function (args) {
      if (args[0].isConstant && args[0].constantValue === true) return args[1];
      if (args[0].isConstant && args[0].constantValue === false) return args[2];
      return this.copyWithArgs(args);
    }
  };

  for (var k in defs) {
    nodes[k].prototype._constantCollapsedCopy = defs[k];
  }

});
define('math/features/polynomialorder',['require','parsenodes'],function (require) {
  var nodes = require('parsenodes');

  var polynomialOrders = {
    Expression:     "this.dependsOn(symbol) ? Infinity : 0",
    FreeVariable:   "(symbol === this._symbol ? 1 : 0)",
    Constant:       "0",
    Add:            "Math.max(order0, order1)",
    Subtract:       "Math.max(order0, order1)",
    Multiply:       "order0 + order1",
    Negative:       "order0",
    Divide:         "order1 > 0 ? Infinity : order0"
  };

  //Convert data above into proper member functions
  var wrap = function (expr) {
    /*jshint evil: true */
    expr = expr.replace("order0", "this.args[0].polynomialOrder(symbol)");
    expr = expr.replace("order1", "this.args[1].polynomialOrder(symbol)");
    return new Function(['symbol'], 'return ' + expr);
  };

  for (var nodeType in polynomialOrders) {
    var order = polynomialOrders[nodeType];
    nodes[nodeType].prototype.polynomialOrder = wrap(order);
  }

  nodes.Exponent.prototype.polynomialOrder = function (symbol) {
    var baseOrder = this.args[0].polynomialOrder(symbol);
    var exponentOrder = this.args[1].polynomialOrder(symbol);
    if (baseOrder === 0 && exponentOrder === 0) return 0;
      var exponent = this.args[1];
      if (exponent.isConstant &&
         exponent.constantValue === Math.round(exponent.constantValue) &&
         exponent.constantValue > 0) {
        return baseOrder * exponent.constantValue;
      }
    return Infinity;
  };

  // Allow piecewise expressions of the form {f(x):5} where f(x) is a boolean
  // expression in symbol
  nodes.Piecewise.prototype.polynomialOrder = function (symbol) {
    if (!this.dependsOn(symbol)) return 0;
    if (!this.args[2].isConstant || !isNaN(this.args[2].constantValue)) return Infinity;
    if (this.args[1].dependsOn(symbol)) return Infinity;
    return 0;
  };

  nodes.List.prototype.polynomialOrder = function (symbol) {
    var order = 0;
    for (var i = 0; i < this.args.length; i++) {
      order = Math.max(order, this.args[i].polynomialOrder(symbol));
    }
    return order;
  };
});

define('math/features/polynomialcoefficients',['require','parsenodes'],function (require) {
  var nodes = require('parsenodes');
  var zero = nodes.Constant(0);
  var one = nodes.Constant(1);

  nodes.FreeVariable.prototype.getPolynomialCoefficients = function (symbol) {
    if (symbol === this._symbol) return [zero, one];
    return [this];
  };

  nodes.Constant.prototype.getPolynomialCoefficients = function (symbol) {
    return [this];
  };

  nodes.Add.prototype.getPolynomialCoefficients = function (symbol) {
    var coeffs0 = this.args[0].getPolynomialCoefficients(symbol);
    var coeffs1 = this.args[1].getPolynomialCoefficients(symbol);
    var order0 = coeffs0.length - 1;
    var order1 = coeffs1.length - 1;
    var coeffs = [];
    for (var i = 0; i <= Math.max(order0, order1); i++) {
      if (order0 >= i && order1 >= i) {
        coeffs.push(nodes.Add([coeffs0[i], coeffs1[i]]));
      } else {
        coeffs.push(order0 > order1 ? coeffs0[i] : coeffs1[i]);
      }
    }
    return coeffs;
  };

  nodes.Subtract.prototype.getPolynomialCoefficients = function (symbol) {
    var coeffs0 = this.args[0].getPolynomialCoefficients(symbol);
    var coeffs1 = this.args[1].getPolynomialCoefficients(symbol);
    var order0 = coeffs0.length - 1;
    var order1 = coeffs1.length - 1;
    var coeffs = [];
    for (var i = 0; i <= Math.max(order0, order1); i++) {
      if (order0 >= i && order1 >= i) {
        coeffs.push(nodes.Subtract([coeffs0[i], coeffs1[i]]));
      } else {
        coeffs.push(order0 > order1 ? coeffs0[i] : nodes.Negative([coeffs1[i]]));
      }
    }
    return coeffs;
  };

  nodes.Negative.prototype.getPolynomialCoefficients = function (symbol) {
    var coeffs0 = this.args[0].getPolynomialCoefficients(symbol);
    var coeffs = [];
    for (var i = 0; i < coeffs0.length; i++) {
      coeffs.push(nodes.Negative([coeffs0[i]]));
    }
    return coeffs;
  };

  nodes.Exponent.prototype.getPolynomialCoefficients = function (symbol) {
    var coeffs0 = this.args[0].getPolynomialCoefficients(symbol);
    var coeffs1 = this.args[1].getPolynomialCoefficients(symbol);
    var order0 = coeffs0.length - 1;
    var order1 = coeffs1.length - 1;
    if (order1 > 0) throw "can't solve for variable in exponent";
    if (order0 === 0) return [nodes.Exponent([coeffs0[0], coeffs1[0]])];
    if (this.args[1].isConstant) {
      var exponent = this.args[1].constantValue;
      switch(exponent) {
        case 0:
          return [zero];
        case 1:
          return coeffs0;
        case 2:
          return nodes.Multiply([this.args[0], this.args[0]]).getPolynomialCoefficients(symbol);
      }
    }
    throw "Unable to compile polynomial representation";
  };

  nodes.Multiply.prototype.getPolynomialCoefficients = function (symbol) {
    var coeffs0 = this.args[0].getPolynomialCoefficients(symbol);
    var coeffs1 = this.args[1].getPolynomialCoefficients(symbol);
    var order0 = coeffs0.length - 1;
    var order1 = coeffs1.length - 1;
    var coeffs = [];
    for (var i = 0; i <= order0; i++) {
      for (var j = 0; j <= order1; j++) {
        var newTerm = nodes.Multiply([coeffs0[i], coeffs1[j]]);
        var currentTerm = coeffs[i+j];
        if (currentTerm === undefined) {
          coeffs[i+j] = newTerm;
        } else {
          coeffs[i+j] = nodes.Add([currentTerm, newTerm]);
        }
      }
    }
    return coeffs;
  };

  nodes.Divide.prototype.getPolynomialCoefficients = function (symbol) {
    var coeffs0 = this.args[0].getPolynomialCoefficients(symbol);
    var coeffs1 = this.args[1].getPolynomialCoefficients(symbol);
    var order1 = coeffs1.length - 1;
    var coeffs = [];
    if (order1 > 0) throw "Can't solve for variable in denominator";
    for (var i = 0; i < coeffs0.length; i++) {
      coeffs.push(nodes.Divide([coeffs0[i], coeffs1[0]]));
    }
    return coeffs;
  };

  nodes.Expression.prototype.getPolynomialCoefficients = function (symbol) {
    if (this.dependsOn(symbol)) throw "Unimplemented polynomialCoefficient call";
    return [this];
  };

  // Only treating special case of expressions like {f(x):2} where f(x) is a boolean
  // expression in symbol. Everything else is screened out by polynomialOrder.
  //
  // In this case, behave as if condition is satisfied. Later, we use node.extractConditions
  // to reapply the original conditions to the solution.
  nodes.Piecewise.prototype.getPolynomialCoefficients = function (symbol) {
    if (!this.dependsOn(symbol)) return [this];
    var ifExprCoeffs = this.args[1].getPolynomialCoefficients(symbol);
    if (this.args[0].dependsOn(symbol)) return ifExprCoeffs;
    return [nodes.Piecewise(this.args[0], ifExprCoeffs[0], this.args[2])];
  };

});

// node.extractConditions(symbol, replacement) applies conditions in
// expression given by node to expression given by replacement, replacing
// instances of symbol in the conditions with replacement.
//
// The rationale for this is to allow solving expressions like
// y=sin(x){0<y<2}. Our solver first solves this to y=sin(x),
// and then extractConditions wraps the solution to be y={0<sin(x)<2:sin(x)}
define('math/features/extractconditions',['require','parsenodes'],function (require) {
  var nodes = require('parsenodes');

  nodes.Expression.prototype.extractConditions = function (symbol, replacement) {
    for (var i = 0; i < this.args.length; i++) {
      var arg = this.args[i];
      replacement = arg.extractConditions(symbol, replacement);
    }
    return replacement;
  };

  nodes.Constant.prototype.extractConditions = function (symbol, replacement) {
    return replacement;
  };

  nodes.Piecewise.prototype.extractConditions = function (symbol, replacement) {
    if (!this.dependsOn(symbol)) return replacement;
    if (!this.args[0].dependsOn(symbol)) {
      replacement = this.args[1].extractConditions(symbol, replacement);
      replacement = this.args[2].extractConditions(symbol, replacement);
      return replacement;
    }
    var substitution = {};
    substitution[symbol] = replacement;
    return nodes.Piecewise([
      this.args[0].substitute(substitution),
      replacement,
      nodes.Constant(NaN)
    ]);
  };
});

// node.boundDomain(symbol) returns an upper bound on the domain of symbol for
// which the expression given by node is defined.
//
//
// Returns false if we cannot bound the domain, or a domain in the form
// [xmin, xmax], in which case it should be valid for the plotter to plot the
// function only from xmin to xmax,.
//
// Ignores the distinction between strict and non-strict inequalities. This is
// important because the function may return NaN when evaluated exactly at the
// domain bounds, so the plotter needs to know how to deal with that.
// Otherwise, the domain bound should be "nearly tight" in the sense that it is
// tight up to floating point rounding.
//
// May return false when we don't know how to supply a "nearly tight" domain.
define('math/features/bounddomain',['require','parsenodes','math/builtinframe'],function (require) {
  var nodes = require('parsenodes');
  var BuiltInFrame = require('math/builtinframe');

  var zero = nodes.Constant(0);

  nodes.Base.prototype.boundDomain = function (symbol) {
    return false;
  };

  // Bail on lists for now. Cound bound each term separately, but
  // can't just take intersection of term bounds.
  nodes.List.prototype.boundDomain = function (symbol) {
    return false;
  };

  // The domain of an expression is the intersection of the domains of
  // its arguments.
  nodes.Expression.prototype.boundDomain = function (symbol) {
    var out = [-Infinity, Infinity];
    for (var i = 0; i < this.args.length; i++) {
      var arg = this.args[i];
      var domain = arg.boundDomain(symbol);
      if (!domain) return false;
      out = [Math.max(out[0], domain[0]), Math.min(out[1], domain[1])];
    }
    return out;
  };

  nodes.Constant.prototype.boundDomain = function (symbol) {
    return [-Infinity, Infinity];
  };

  // Tighten domain for piecewise functions with a linear inequality condition
  // and a NaN else_expr.
  nodes.Piecewise.prototype.boundDomain = function (symbol) {
    if (!this.args[2].isConstant || !isNaN(this.args[2].constantValue)) return false;
    var condDomain = this.args[0].boundDomain(symbol);
    var ifExprDomain = this.args[1].boundDomain(symbol);
    if (!condDomain || !ifExprDomain) return false;
    return [Math.max(condDomain[0], ifExprDomain[0]), Math.min(condDomain[1], ifExprDomain[1])];
  };

  nodes.BaseComparator.prototype.boundDomain = function (symbol) {
    if (this.operator === '=') return false; // Just bail on equality case
    var differenceTree = this._difference;
    var polynomialOrder = differenceTree.polynomialOrder(symbol);
    if (polynomialOrder > 1) return false;
    // Should strictly check sign of 0 order term, and return either complete or empty
    // set accordingly, but for plotting, this isn't relevant.
    if (polynomialOrder < 1) return [-Infinity, Infinity];

    var coeffTrees = differenceTree.getPolynomialCoefficients(symbol);
    var b = coeffTrees[1] ? coeffTrees[1].getConcreteTree(BuiltInFrame) : zero;
    var c = coeffTrees[0] ? coeffTrees[0].getConcreteTree(BuiltInFrame) : zero;

    // Only handle cases that constant collapse to finite constants.
    if (!b.isConstant || !c.isConstant) return false;
    if (!isFinite(b.constantValue) || !isFinite(c.constantValue)) return false;

    // Same note as polynomialOrder < 1 above.
    if (b.constantValue === 0) return [-Infinity, Infinity];

    var soln = -c.constantValue/b.constantValue;
    return (b.constantValue < 0) ? [-Infinity, soln] : [soln, Infinity];
  };
});
define('math/features/derivative',['require','parsenodes','math/baseparser','math/builtinframe'],function (require) {
  var Nodes = require('parsenodes');
  var Parser = require('math/baseparser');
  var BuiltInFrame = require('math/builtinframe');

  var zero = Nodes.Constant(0);
  var one = Nodes.Constant(1);
  var two = Nodes.Constant(2);

  var derivatives = {
    FreeVariable:   function (symbol) {return symbol === this._symbol ? one : zero},
    Constant:       function (symbol) {
      return isFinite(this.constantValue) ? zero : Nodes.Constant(this.constantValue);
    },
    Negative:       function (symbol) {return Nodes.Negative([this.args[0].takeDerivative(symbol)])},
    // ['x_1', 'y_1']
    Add: function (symbol) {
      return Nodes.Add([
        this.args[0].takeDerivative(symbol),
        this.args[1].takeDerivative(symbol)
      ]);
    },
    // Subtract: ['x_1', '-y_1'],
    Subtract: function (symbol) {
      return Nodes.Subtract([
        this.args[0].takeDerivative(symbol),
        this.args[1].takeDerivative(symbol)
      ]);
    },
    // Multiply: ['x*y_1', 'x_1*y'],
    Multiply: function(symbol){
      return Nodes.Add([
        checkDependence(symbol, this.args[0], Nodes.Multiply([this.args[0].takeDerivative(symbol), this.args[1]])),
        checkDependence(symbol, this.args[1], Nodes.Multiply([this.args[0], this.args[1].takeDerivative(symbol)])),
      ]);
    },
    // ['x_1/y, -(x*y_1)/y^2']
    Divide: function (symbol) {
      return Nodes.Subtract([
        checkDependence(symbol, this.args[0], Nodes.Divide([this.args[0].takeDerivative(symbol), this.args[1]])),
        checkDependence(symbol, this.args[1], Nodes.Divide([
          Nodes.Multiply([this.args[0], this.args[1].takeDerivative(symbol)]),
          Nodes.Exponent([this.args[1], two])
        ]))
      ]);
    },
    // ['y*x^y*x_1', '\\ln(x)*x^y*y_1']
    Exponent: function (symbol) {
      return Nodes.Add([
        checkDependence(symbol, this.args[0], Nodes.Multiply([
          Nodes.Multiply([
            this.args[1],
            Nodes.Exponent([this.args[0], Nodes.Subtract([this.args[1], one])])
          ]),
          this.args[0].takeDerivative(symbol)
        ])),
        checkDependence(symbol, this.args[1], Nodes.Multiply([
          Nodes.Multiply([
            Nodes.FunctionCall('\\ln', [this.args[0]]),
            Nodes.Exponent([this.args[0], this.args[1]])
          ]),
          this.args[1].takeDerivative(symbol)
        ]))
      ]).getConcreteTree(BuiltInFrame);
    },
    Sum: function (symbol) {
      return this.copyWithArgs([
        this.args[0],
        this.args[1],
        this.args[2],
        this.args[3].takeDerivative(symbol)
      ]);
    },
    Product: function (symbol) {
      // If product has no zero terms, use (sum_i fi'/fi)(product_i fi)
      // If product has exactly 1 zero at ith term, use f1*f2*...*fi'*...*fn
      // If product has more than 1 non-zero term, then its derivative is 0.

      var nzeros = Nodes.Sum([
        this.args[0],
        this.args[1],
        this.args[2],
        Nodes.Piecewise([
          Nodes.Comparator['=']([zero, this.args[3]]),
          one,
          zero
        ])
      ]);

      var noZeros = Nodes.Multiply([
        Nodes.Sum([
          this.args[0],
          this.args[1],
          this.args[2],
          Nodes.Divide([
            this.args[3].takeDerivative(symbol),
            this.args[3]
          ])
        ]),
        Nodes.Product(this.args)
      ]);

      var oneZero = Nodes.Product([
        this.args[0],
        this.args[1],
        this.args[2],
        Nodes.Piecewise([
          Nodes.Comparator['=']([zero, this.args[3]]),
          this.args[3].takeDerivative(symbol),
          this.args[3]
        ])
      ]);

      return Nodes.Piecewise([
        Nodes.Comparator['=']([zero, nzeros]),
        noZeros,
        Nodes.Piecewise([
          Nodes.Comparator['=']([one, nzeros]),
          oneZero,
          zero
        ])
      ]);
    },
    Piecewise: function (symbol) {
      // TODO incorrect at condition boundaries
      if (this.args.length === 2) {
        return Nodes.Piecewise([
          this.args[0],
          this.args[1].takeDerivative(symbol)
        ]);
      } else if (this.args.length === 3) {
        return Nodes.Piecewise([
          this.args[0],
          this.args[1].takeDerivative(symbol),
          this.args[2].takeDerivative(symbol)
        ]);
      }
    },
    List: function (symbol) {
      return Nodes.List(this.args.map(function (arg) {
        return arg.takeDerivative(symbol);
      }));
    },
    ListAccess: function (symbol) {
      return this.constructor([this.args[0].takeDerivative(symbol), this.args[1]]);
    },
    SolvedEquation: function (symbol) {
      return this._expression.takeDerivative(symbol);
    },
    OptimizedRegression: function (symbol) {
      return this.model.takeDerivative(symbol);
    }
  };

  Nodes.NativeFunction.Invocation.prototype.takeDerivative = function (symbol) {
    return this._fn.takeDerivative(symbol, this.args);
  };

  Nodes.ReducerFunction.Invocation.prototype.takeDerivative = function (symbol) {
    return this._fn.takeDerivative(symbol, this.args);
  };

  // TODO restrict domain on derivatives of inverse functions
  var oneArgFunctionDerivatives = {
    exp: '\\exp(x)*x_1',
    ln: '\\{x >= 0: x_1/x \\}',
    sqrt: 'x_1/(2*\\sqrt{x})',
    sin: '\\cos(x)*x_1',
    cos: '-\\sin(x)*x_1',
    tan: '\\sec(x)^2*x_1',
    arcsin: 'x_1/\\sqrt{1 - x^2}',
    arccos: '-x_1/\\sqrt{1 - x^2}',
    arctan: 'x_1/(1+x^2)',
    sinh: '\\cosh(x)*x_1',
    cosh: '\\sinh(x)*x_1',
    tanh: '(\\sech(x))^2*x_1',
    arcsinh: 'x_1/\\sqrt{x^2 + 1}',
    arccosh: '\\{ x > 0: x_1/\\sqrt{x^2 - 1} \\}',
    arctanh: '\\{ \\abs(x) < 1: x_1/(1 - x^2) \\}',
    csc: '-\\cot(x)*\\csc(x)*x_1',
    sec: '\\tan(x)*\\sec(x)*x_1',
    cot: '-\\csc(x)^2*x_1',
    arccsc: '-x_1/(x\\sqrt{x^2 - 1})',
    arcsec: 'x_1/(x\\sqrt{x^2 - 1})',
    arccot: '-x_1/(1+x^2)',
    csch: '-\\coth(x)*\\csch(x)*x_1',
    sech: '-\\tanh(x)*\\sech(x)*x_1',
    coth: '-(\\csch(x))^2*x_1',
    arccsch: '-x_1/(x*\\sqrt{1 + x^2})',
    arcsech: '\\{ x >= 0: -x_1/(x*\\sqrt{1 - x^2}) \\}',
    arccoth: '\\{ \\abs(x) > 1 : x_1/(1 - x^2) \\}',
    factorial: '(x)!*\\polyGamma(0, x + 1)*x_1',
    floor: '\\{ \\mod(x, 1) > 0: 0*x_1 \\}',
    ceil: '\\{ \\mod(x, 1) > 0: 0*x_1 \\}',
    round: '\\{ \\abs(\\mod(x, 1) - 0.5) > 0: 0*x_1 \\}',
    abs: '\\{ \\abs(x) > 0: \\sign(x)*x_1 \\}',
    sign: '\\{ \\abs(x) > 0: 0*x_1 \\}',
    mean: '\\mean(x_1)',
    total: '\\total(x_1)',
    length: '0',
    'var': '2\\mean((x-\\mean(x))*(x_1-\\mean(x_1)))',
    stdev: '\\length(x)/(\\length(x) - 1)*\\mean((x-\\mean(x))*(x_1-\\mean(x_1)))/\\stdev(x)',
    stdevp: '\\mean((x-\\mean(x))*(x_1-\\mean(x_1)))/\\stdevp(x)',
    // TODO: ignores the case that the supremum/infimum of x contains more than 1 element.
    // In that case, the result should be NaN unless the derivative of all of the elements
    // of the supremum/infimum are equal.
    min: 'x_1[\\argmin(x)]',
    max: 'x_1[\\argmax(x)]',
    // zero would be an okay answer here too, but this usually isn't relevant
    argmin: '0/0',
    argmax: '0/0'
  };

  var twoArgFunctionDerivatives = {
    log: [
      // d/dx ln(x) is actually real for negative x, too, but showing the
      // derivative in places where we don't show the function is confusing,
      // so restrict to x > 0.
      '\\{x > 0: \\frac{x_1}{x*\\ln(y)}\\}',
      '\\frac{-\\log_{y}(x)*y_1}{y*\\ln(y)}'
    ],
    pow: [
      'y*x^{y - 1}*x_1',
      'x^{y}*\\ln(x)*y_1'
    ],
    nthroot: [
      'x^{1/y - 1}/y*x_1',
      '-\\frac{x^{1/y}*\\ln(x)*y_1}{y^2}'
    ],
    polyGamma: [
      '0/0',
      '\\polyGamma(1 + x, y)*y_1'
    ],
    mod: [
      '\\{ \\abs(\\mod(x, y)) > 0: x_1 \\}',
      // Check whether division results in an integer directly instead
      // of computing mod of the args because division sometimes results
      // in an integer when modulus does not result in 0, e.g.
      //
      // 3.8 % -0.7599999999999999 -> 3.3306690738754696e-16, but
      // 3.8 / -0.7599999999999999 -> -5
      //
      // This can confuse the jump detector, resulting in spurious
      // connections.
      //
      //TODO still have some spurious connections near 0 in d/dx mod(3,x).
      // Why?
      '\\{ \\mod(x/y, 1) > 0: -\\floor(x/y)*y_1 \\}'
    ],
    // We actually round arguments for these functions, so to be consistent,
    // these could be defined as 0 except at integers where they're undefined,
    // but that is not a standard definition.
    //
    // Can also define continuous nCr and nPr using gamma function.
    lcm: ['0/0', '0/0'],
    gcd: ['0/0', '0/0'],
    nCr: ['0/0', '0/0'],
    nPr: ['0/0', '0/0']
  };

  var oneArgDerivativeFunction = function (derivativeTree) {
    return function (symbol, args) {
      var substitutions = {
        x: args[0],
        x_1: args[0].takeDerivative(symbol)
      };
      return checkDependence(symbol, args[0], derivativeTree.substitute(substitutions)).getConcreteTree(BuiltInFrame);
    };
  };

  var twoArgDerivativeFunction = function (derivativeTree1, derivativeTree2) {
    return function (symbol, args) {
      var substitutions = {
        x: args[0],
        x_1: args[0].takeDerivative(symbol),
        y: args[1],
        y_1: args[1].takeDerivative(symbol)
      };

      return Nodes.Add([
        checkDependence(symbol, args[0], derivativeTree1.substitute(substitutions)),
        checkDependence(symbol, args[1], derivativeTree2.substitute(substitutions))
      ]).getConcreteTree(BuiltInFrame);
    };
  };

  for (var k in oneArgFunctionDerivatives) {
    BuiltInFrame[k].takeDerivative = oneArgDerivativeFunction(
      Parser.parse(oneArgFunctionDerivatives[k])
    );
  }

  for (k in twoArgFunctionDerivatives) {
    BuiltInFrame[k].takeDerivative = twoArgDerivativeFunction(
      Parser.parse(twoArgFunctionDerivatives[k][0]),
      Parser.parse(twoArgFunctionDerivatives[k][1])
    );
  }

  var checkDependence = function (symbol, arg, tree) {
    return arg.dependsOn(symbol) ? tree : zero;
  };

  for(var nodeType in derivatives){
    var derivative = derivatives[nodeType];
    Nodes[nodeType].prototype.takeDerivative = derivative;
  }
});

// substitute does non-recursive replacement of identifiers specified in a frame.
// It differs from getConcreteTree by being non-recursive. Currently, this feature
// is used only in the derivative system to substitute arguments into derivative
// definitions.
define('math/features/substitute',['require','parsenodes'],function (require) {
  var Nodes = require('parsenodes');

  var substitutions = {
    Identifier: function (frame) { return frame[this._symbol] ? frame[this._symbol] : this; },
    FreeVariable: function (frame) { return frame[this._symbol] ? frame[this._symbol] : this; },
    Constant: function (frame) { return this; },
    Expression: function (frame) {
      return this.copyWithArgs(this.args.map(function (arg) {
        return arg.substitute(frame);
      }));
    },
    List: function (frame) {
      return Nodes.List(this.args.map(function (arg) {
        return arg.substitute(frame);
      }));
    },
    SolvedEquation: function (symbol) {
      return this.constructor(this._symbol, this._expression.substitute(symbol));
    },
    OptimizedRegression: function (symbol) {
      return this.constructor(
        this.model.substitute(symbol),
        this.parameters,
        this.residualVariables,
        this.residuals,
        this.statistics
      );
    }
  };

  for (var key in substitutions) {
    Nodes[key].prototype.substitute = substitutions[key];
  }
});

// Only defines a function on basecomparator, but making this a feature because
// it needs to use baseparser.
define('math/features/solve',['require','math/baseparser','math/parsenode/constant','math/parsenode/equation','math/parsenode/solvedequation','math/parsenode/basecomparator','math/parsenode/list','math/errormsg','math/builtinframe','math/policy'],function (require) {
  var Parser = require('math/baseparser');
  var Constant = require('math/parsenode/constant');
  var Equation = require('math/parsenode/equation');
  var SolvedEquation = require('math/parsenode/solvedequation');
  var BaseComparator = require('math/parsenode/basecomparator');
  var List = require('math/parsenode/list');
  var ErrorMsg = require('math/errormsg');
  var BuiltInFrame = require('math/builtinframe');
  var Policy = require('math/policy');

  var zero = Constant(0);

  // Can't easily write this as a single calculator expression because the length
  // of the result depends on values.
  var linearSolutionTree = Parser.parse('[-c/b]');
  var degenerateSolutionTree = Parser.parse('[-b/(2*a)]');
  var generalSolutionTree = Parser.parse('[\\{a>0:q,p\\},\\{a>0:p,q\\}]');
  function _solveSingleVariableEquation (localFrame) {
    _populateFrame(localFrame);
    if (localFrame.a.constantValue === 0) {
      if (localFrame.b.constantValue === 0) {
        return Constant(localFrame.c.constantValue === 0);
      }
      return linearSolutionTree.getConcreteTree(localFrame);
    }
    // f - g is the discriminant. If it's negative, there are no solutions
    // If it's 0, there is only one solution (with multiplicity 2)
    if (localFrame.f.constantValue - localFrame.g.constantValue < 0) {
      return List([Constant(false)]);
    }
    if (localFrame.f.constantValue - localFrame.g.constantValue === 0) {
      return degenerateSolutionTree.getConcreteTree(localFrame);
    }
    return generalSolutionTree.getConcreteTree(localFrame);
  }


  function _populateABC (coeffTrees) {
    var localFrame = Object.create(BuiltInFrame);
    // Set up a frame with variables relevant to the solution of a quadratic inequality
    // or equation: ax^2+bx+c=0
    localFrame.a = coeffTrees[2] ? coeffTrees[2].tryGetConcreteTree(BuiltInFrame) : zero;
    localFrame.b = coeffTrees[1] ? coeffTrees[1].tryGetConcreteTree(BuiltInFrame) : zero;
    localFrame.c = coeffTrees[0] ? coeffTrees[0].tryGetConcreteTree(BuiltInFrame) : zero;
    return localFrame;
  }

  var fTree = Parser.parse('b*b');
  var gTree = Parser.parse('4*a*c');
  // p and q are the two solutions to the quadratic equation.
  var pTree = Parser.parse('(-b+\\sqrt{b*b-4*a*c})/(2*a)');
  var qTree = Parser.parse('(-b-\\sqrt{b*b-4*a*c})/(2*a)');
  var eqnSolutionTree = Parser.parse('[' +
    '\\{a=0:\\{b<0:-c/b\\},q\\},' +
    '\\{a=0:\\{b>=0:-c/b\\},p\\}' +
  ']');
  var inequalitySolutionTree = Parser.parse('[' +
    '\\{a=0:\\{b<0:-c/b\\},a>0:q\\},' +
    '\\{a=0:\\{b=0:\\{c>0:-m\\}\\},a>0:\\{f<g:-m\\},p\\},' +
    '\\{a=0:\\{b=0:\\{c>0:m\\}\\},a>0:\\{f<g:m\\},q\\},' +
    '\\{a=0:\\{b>0:-c/b\\},a>0:p\\}' +
  ']');

  function _effectiveOrder (localFrame) {
    if (localFrame.a.constantValue === 0) {
      if (localFrame.b.constantValue === 0) return 0;
      return 1;
    }
    return 2;
  }

  function _chooseVariable (concreteDifference, dependencies, isInequality) {
    //ask for trees to represent the coefficients

    var variableOfInterest;
    var effectiveOrders = [];
    var localFrames = [];
    var localFrame;
    for (var i = 0; i < dependencies.length; i++) {
      var dependency = dependencies[i];
      var order = concreteDifference.polynomialOrder(dependency);
      var orderTooHigh = order > 2;
      var invalidVariable = dependencies.length > 1 && !Policy.validSolvedVariable(dependency);
      // piecewiseIneqality check is a little bit subtle. Relies on the fact that extractConditions
      // returns the original expression iff it finds no piecewise expressions that depend on
      // dependency.
      var piecewiseInequality = isInequality && concreteDifference.extractConditions(dependency, zero) !== zero;

      if (orderTooHigh || invalidVariable || piecewiseInequality) {
        localFrames[i] = {};
        effectiveOrders[i] = Infinity;
        continue;
      }

      localFrames[i] = [];
      effectiveOrders[i] = 0;
      for (var j = 0; j < concreteDifference.args.length; j++) {
        localFrame = _populateABC(concreteDifference.args[j].getPolynomialCoefficients(dependency));
        localFrames[i][j] = localFrame;
        effectiveOrders[i] = Math.max(effectiveOrders[i], _effectiveOrder(localFrame));
      }
    }

    var effectiveOrder;
    if (dependencies.length === 1) {
      localFrame = localFrames[0];
      variableOfInterest = dependencies[0];
      effectiveOrder = effectiveOrders[0];
    } else { // dependencies.length === 2
      var index;
      if (effectiveOrders[0] === 0) {
        index = 1;
      } else if (effectiveOrders[1] === 0) {
        index = 0;
      } else {
        index = effectiveOrders[0] < effectiveOrders[1] ? 0 : 1;
      }
      localFrame = localFrames[index];
      variableOfInterest = dependencies[index];
      effectiveOrder = effectiveOrders[index];
    }

    return {
      localFrame: localFrame,
      variableOfInterest: variableOfInterest,
      effectiveOrder: effectiveOrder
    };
  }

  var solvers = {
    singleVariable: _solveSingleVariableEquation,
    inequality: function (localFrame) {
      _populateFrame(localFrame);
      return inequalitySolutionTree.getConcreteTree(localFrame);
    },
    generalEquation: function (localFrame) {
      _populateFrame(localFrame);
      return eqnSolutionTree.getConcreteTree(localFrame);
    }
  };

  function _chooseSolver (dependencies, isInequality) {
    if (isInequality) return solvers.inequality;
    if (dependencies.length === 1) return solvers.singleVariable;
    return solvers.generalEquation;
  }

  function _populateFrame (localFrame) {
    // f - g is the discriminant
    localFrame.f = fTree.getConcreteTree(localFrame);
    localFrame.g = gTree.getConcreteTree(localFrame);
    // p and q are the two solutions to the quadratic equation.
    localFrame.p = pTree.getConcreteTree(localFrame);
    localFrame.q = qTree.getConcreteTree(localFrame);
    // m is a standin for Infinity. This is kind of a hack to help us shade from a
    // solution to "infinity," working around the fact that the rest of the pipeline
    // doesn't always handle infinity well.
    localFrame.m = Constant(1e305);
  }

  Equation.prototype.solve = function (frame) {
    return this.asComparator().solve(frame);
  };

  BaseComparator.prototype.solve = function (frame) {
    /* jshint maxcomplexity:18 */
    var concrete = this.tryGetConcreteTree(frame);
    if (concrete.isError) return concrete;
    if (concrete.isConstant) return concrete;

    var isInequality = this.getOperator() !== '=';

    //get concrete tree for the difference
    var concreteDifference = this._difference.tryGetConcreteTree(frame);

    var dependencies = concreteDifference.getDependencies();

    if (dependencies.length === 0) {
      if (concreteDifference.isList) return List(concreteDifference.args.map(function (arg) {
        return Constant(arg.constantValue === 0);
      }));
      return Constant(concreteDifference.constantValue === 0);
    }

    if (dependencies.length === 1 && concreteDifference.isList && !isInequality) {
      return ErrorMsg.singleVariableListSolve();
    }

    // After this point, it's easier if we can just assume everything is a list.
    var concreteDifferences = concreteDifference.isList ? concreteDifference : List([concreteDifference]);

    if (dependencies.length > 2) {
      return ErrorMsg.tooManyVariables(this.getSliderVariables(concrete)).setDependencies(dependencies);
    }

    if (isInequality && !Policy.validInequalityVariables(dependencies)) {
      return ErrorMsg.invalidInequalityVariables().setDependencies(dependencies);
    }

    if (dependencies.length === 2 && !Policy.validImplicitVariables(dependencies)) {
      return ErrorMsg.invalidImplicitVariables().setDependencies(dependencies);
    }

    var result = _chooseVariable(concreteDifferences, dependencies, isInequality);
    var localFrame = result.localFrame;
    var effectiveOrder = result.effectiveOrder;
    var variableOfInterest = result.variableOfInterest;

    if (Policy.complicatedPolarImplicit(variableOfInterest, effectiveOrder)) {
      if (isInequality || dependencies.length > 1) {
        return ErrorMsg.complicatedPolarImplicit().setDependencies(dependencies);
      }
    }

    if (effectiveOrder > 2) {
      if (dependencies.length === 1) return ErrorMsg.unsolvable().setDependencies(dependencies);
      if (isInequality) return ErrorMsg.complicatedImplicitInequality().setDependencies(dependencies);
      return concreteDifference;
    }

    var solveScalar = _chooseSolver(dependencies, isInequality);

    var allBranches = [];
    for (var i = 0; i < localFrame.length; i++) {
      var branches = solveScalar(localFrame[i]);
      if (branches.isError) return branches;
      if (branches.isConstant) {
        allBranches.push(branches);
        continue;
      }
      for (var j = 0; j < branches.args.length; j++) {
        var branch = branches.args[j];
        var restricted = concreteDifferences.args[i]
          .extractConditions(variableOfInterest, branch)
          .getConcreteTree(frame)
        ;
        allBranches.push(restricted);
      }
    }

    return SolvedEquation(variableOfInterest, List(allBranches));
  };
});
// Basically temporary shim to support the API of the current formula object and allow integration into the rest of the
// system. API here is just a direct copy, funny naming and all.

define('math/evaluationstate',['require','graphing/graphmode','parsenodes','graphing/label'],function(require){
  var GRAPHMODE = require('graphing/graphmode');
  var nodes = require('parsenodes');
  var Label = require('graphing/label');

  function _tableCellValue (concrete) {
    if (concrete.isError) return concrete.getError();
    if (concrete.constantValue === undefined) return '';
    return +concrete.constantValue;
  }

  function _tableState (raw, concrete) {
    var columnData = [];
    for (var i = 0; i < raw.columns.length; i++) {
      var column = concrete.columns[i];
      var state = {
        dependent: !column.isIndependent,
        discrete: column.isIndependent
      };
      if (column.isError) {
        state.error = column.getError();
        state.values = [];
      } else {
        state.values = column.values.args.map(_tableCellValue);
      }
      columnData.push(state);
    }
    return {
      can_auto_regress: raw.canAutoRegress(concrete),
      column_data: columnData
    };
  }

  var _defaultEvaluationState = function () {
    return {
     operator: '=',
     variables: []
    };
  };

  var EvaluationState = function (raw, concrete) {
    /* jshint maxcomplexity:20 */
    //Compute serializable evaluation state from raw and concrete parseTrees

    // Tables follow a completely different format for their
    // evaluation state.
    if (raw.isTable) return _tableState(raw, concrete);

    //Reasonable defaults
    var state = _defaultEvaluationState();

    //What errors should it return? (if any)
    if (concrete.isError) {
      state.error = concrete.getError();
      state.variables = raw.getSliderVariables(concrete);
      return state;
    }

    if (concrete.isMovablePoint) {
      state.move_ids = concrete._moveIds;
      state.move_matrix = concrete._moveMatrix;
    }

    if (raw.isInequality()) state.is_inequality = true;
    state.operator = raw.getOperator();

    //Does it assign anything
    if (concrete instanceof nodes.SolvedEquation) {
      // Set assignment for things like x=3, but not for equations
      // that are satisfied everywhere or nowhere
      if (
        concrete._expression.constantValue !== true &&
        concrete._expression.constantValue !== false
      ) {
        state.assignment = concrete._symbol;
      }
    } else if (raw instanceof nodes.Assignment) {
      // Cover assignments that don't need to be solved, like b=1+2
      state.assignment = raw._symbol;
    }

    //How should it be graphed? (if at all)
    var graphMode = raw.getGraphMode(concrete);
    if (graphMode !== GRAPHMODE.NONE) {
      state.is_graphable = true;

      if (graphMode === GRAPHMODE.XYPOINT)         state.is_point_list = true;
      if (graphMode === GRAPHMODE.XYPOINT_MOVABLE) state.is_point_list = true;
      if (graphMode === GRAPHMODE.PARAMETRIC)      state.is_parametric = true;
      if (concrete.isShadeBetween())               state.is_shade_between = true;

      var table_info = raw.tableInfo(concrete);
      if (table_info) {
        state.is_tableable = true;
        state.table_info = table_info;
      }
    }

    //What sliders should it prompt for? (none if graphable)
    state.variables = state.is_graphable ? [] : raw.getSliderVariables(concrete);

    var sliderInfo = raw.getSliderInfo();
    if (sliderInfo) {
      state.is_slidable = true;
      state.is_animatable = !state.is_graphable; //Don't animate graphed sliders
      state.constant_value = sliderInfo.value;
    } else if (concrete.isConstant) {
      state.constant_value = concrete.constantValue;
    }

    //How should it be evaluated? (if at all)
    var values = concrete.getEvaluationInfo();
    if (values && !raw.isConstant && !raw.isFunction && !state.is_graphable && !state.is_slidable) {
      state.is_evaluable = true;
      state.zero_values = values;
    }

    if (concrete instanceof nodes.OptimizedRegression) {
      var parameterValues = {};
      for (var p in concrete.parameters) {
        if (!concrete.parameters.hasOwnProperty(p)) continue;
        parameterValues[Label.identifierToLatex(p)] = +concrete.parameters[p].constantValue;
      }

      state.is_regression = true;
      state.regression = {
        parameters: parameterValues,
        residualVariable: Label.identifierToLatex(concrete.residualVariable),
        residualSuggestionId: concrete.residualSuggestionId,
        statistics: concrete.statistics
      };
    }

    return state;
  };

  EvaluationState.default = _defaultEvaluationState;

  return EvaluationState;
});

define('math/statementanalysis',['require','math/evaluationstate','pjs','graphing/graphmode'],function(require){
  var getEvaluationState = require('math/evaluationstate');
  var P = require('pjs');
  var GRAPHMODE = require('graphing/graphmode');

  return P(function(analysis){
    analysis.init = function(raw, concrete){
      this.rawTree = raw;
      this.concreteTree = concrete;
      this.evaluationState = getEvaluationState(raw, concrete);
    };

    analysis.exportTo = function (frame) {
      this.rawTree.exportTo(this.concreteTree, frame);
    };

    analysis.graph = function (viewState) {
      return this.rawTree.graph(this.concreteTree, viewState);
    };

    analysis.getGraphMode = function () {
      return this.rawTree.getGraphMode(this.concreteTree);
    };

    analysis.getGraphInfo = function () {
      return this.rawTree.getGraphInfo(this.concreteTree);
    };

    analysis.shouldIntersect = function () {
      if (!this.evaluationState.is_graphable) return false;
      if (!this.rawTree.userData.shouldGraph) return false;
      var graphMode = this.getGraphMode();
      return graphMode === GRAPHMODE.X || graphMode === GRAPHMODE.Y;
    };
  });
});

define('math/features/analyze',['require','parsenodes','math/statementanalysis','math/builtinframe','math/policy','math/errormsg','math/comparators'],function(require){
  var nodes = require('parsenodes');
  var StatementAnalysis = require('math/statementanalysis');
  var BuiltInFrame = require('math/builtinframe');
  var Policy = require('math/policy');
  var Constant = nodes.Constant;
  var ErrorMsg = require('math/errormsg');
  var Comparators = require('math/comparators');
  var FreeVariable = nodes.FreeVariable;

  var zero = Constant(0);

  nodes.Base.prototype.analyze = function(frame){
    return StatementAnalysis(this, this.tryGetConcreteTree(frame));
  };

  nodes.Expression.prototype.analyze = function(frame){
    var concrete = this.tryGetConcreteTree(frame);
    if (concrete.isError) return StatementAnalysis(this, concrete);
    var dependencies = concrete.getDependencies();
    if (dependencies.length > 1) {
      if (Policy.validImplicitVariables(dependencies)) {
        return StatementAnalysis(this, ErrorMsg.equationRequired().setDependencies(dependencies));
      } else {
        return StatementAnalysis(
          this,
          ErrorMsg.tooManyVariables(this.getSliderVariables(concrete)).setDependencies(dependencies)
        );
      }
    } else if (dependencies.length === 1 && !Policy.validExpressionVariable(dependencies[0])) {
      return StatementAnalysis(
        this,
        ErrorMsg.equationRequired(dependencies[0]).setDependencies(dependencies)
      );
    } else {
      return StatementAnalysis(this, concrete);
    }
  };

  nodes.Identifier.prototype.analyze = function (frame) {
    return StatementAnalysis(this, this.tryGetConcreteTree(frame));
  };

  nodes.FunctionDefinition.prototype.analyze = function(frame){
    if (BuiltInFrame[this._symbol]) {
      return StatementAnalysis(this, ErrorMsg.cannotRedefine(this._symbol));
    }

    //Make sure free variables are all arguments
    var concrete = this.tryGetConcreteTree(frame);
    if (concrete.isError) return StatementAnalysis(this, concrete);
    var argSymbols = this._argSymbols;

    var dependencies = concrete.getDependencies();

    var freeVariables = dependencies.filter(function (symbol) {
      return argSymbols.indexOf(symbol) === -1;
    });

    if (Policy.unplottablePolarFunction(this._symbol, dependencies)) {
      return StatementAnalysis(this, ErrorMsg.unplottablePolarFunction());
    }

    if (freeVariables.some(Policy.assignmentForbidden)) {
      return StatementAnalysis(
        this,
        ErrorMsg.addArgumentsToDefinition(freeVariables, this._symbol, argSymbols).setDependencies(dependencies)
      );
    } else if (freeVariables.length) {
      return StatementAnalysis(
        this,
        ErrorMsg.tooManyVariables(this.getSliderVariables(concrete)).setDependencies(dependencies)
      );
    } else {
      return StatementAnalysis(this, concrete);
    }
  };

  nodes.Assignment.prototype.analyze = function(frame){
    var lhs = this._symbol;
    if (!Policy.validLHS(lhs)) return StatementAnalysis(this, ErrorMsg.invalidLHS(lhs));
    if (BuiltInFrame[lhs]) return StatementAnalysis(this, ErrorMsg.cannotRedefine(lhs));

    var concrete = this.tryGetConcreteTree(frame);
    if (concrete.isError) return StatementAnalysis(this, concrete);
    var dependencies = concrete.getDependencies();

    // If the assigned symbol appears on the RHS, analyze as an equation
    if (dependencies.indexOf(this._symbol) !== -1) {
      var eqnAnalysis = this.asEquation().analyze(frame);
      return StatementAnalysis(this, eqnAnalysis.concreteTree);
    }

    if (dependencies.length > 1) {
      return StatementAnalysis(
        this,
        ErrorMsg.tooManyVariables(this.getSliderVariables(concrete)).allowExport().setDependencies(dependencies)
      );
    }

    return StatementAnalysis(this, concrete);
  };

  nodes.Regression.prototype.analyze = function (frame, exportFrame, lastExportFrame, priorAnalysis) {
    return StatementAnalysis(this, this.optimize(frame, exportFrame, lastExportFrame, priorAnalysis));
  };

  nodes.Equation.prototype.analyze =
  nodes.BaseComparator.prototype.analyze = function (frame) {
    return StatementAnalysis(this, this.solve(frame));
  };

  nodes.DoubleInequality.prototype.analyze = function (frame) {
    var concrete = this.tryGetConcreteTree(frame);
    if (concrete.isError) return StatementAnalysis(this, concrete);

    var dependencies = concrete.getDependencies();

    if (Comparators.table[this._operators[0]].direction !== Comparators.table[this._operators[1]].direction) {
      return StatementAnalysis(this, ErrorMsg.mismatchedDoubleInequality());
    }

    if (!Policy.validDoubleInequalitySymbol(concrete._symbol)) {
      return StatementAnalysis(
        this,
        ErrorMsg.invalidDoubleInequalityVariables().setDependencies(dependencies)
      );
    }

    if (!Policy.validDoubleInequalityVariables(dependencies)) {
      return StatementAnalysis(
        this,
        ErrorMsg.invalidDoubleInequalityVariables().setDependencies(dependencies)
      );
    }

    if (dependencies.length > 2) {
      return StatementAnalysis(
        this,
        ErrorMsg.tooManyVariables(this.getSliderVariables(concrete)).setDependencies(dependencies)
      );
    }

    if (
      concrete._expressions[0].getDependencies().indexOf(concrete._symbol) !== -1 ||
      concrete._expressions[1].getDependencies().indexOf(concrete._symbol) !== -1
    ) {
      return StatementAnalysis(this, ErrorMsg.complicatedDoubleInequality().setDependencies(dependencies));
    }

    return StatementAnalysis(this, concrete);
  };

  // Complicated double inequalities like x < y^2 < z compile to And comparators.
  nodes.And.prototype.analyze = function (frame) {
    var concrete = this.tryGetConcreteTree(frame);
    if (concrete.isError) return StatementAnalysis(this, concrete);

    var dependencies = concrete.getDependencies();
    if (dependencies.length) {
      if (Policy.validDoubleInequalityVariables(dependencies)) {
        return StatementAnalysis(
          this,
          ErrorMsg.complicatedDoubleInequality().setDependencies(dependencies)
        );
      }
      return StatementAnalysis(
        this,
        ErrorMsg.tooManyVariables(this.getSliderVariables(concrete)).setDependencies(dependencies)
      );
    }

    return StatementAnalysis(this, concrete);
  };

  nodes.OrderedPair.prototype.analyze = function (frame, priorAnalysis) {
    //movable points rely on prior analysis to find moveIds
    var concrete = this.tryGetConcreteTree(frame);
    if (concrete.isError) return StatementAnalysis(this, concrete);
    var analysis = StatementAnalysis(this, concrete);

    //Check for free variables that aren't t
    var dependencies = concrete.getDependencies();

    if (dependencies.length) {
      if (Policy.validParametricVariables(dependencies)) return analysis;
      return StatementAnalysis(
        this,
        ErrorMsg.tooManyVariables(this.getSliderVariables(concrete)).setDependencies(dependencies)
      );
    }

    //Check preconditions for being a movable point
    if(!analysis.evaluationState.is_graphable) return analysis;
    if(analysis.evaluationState.variables.length !== 0) return analysis;
    if(this.args[0].isList || this.args[1].isList) return analysis; //We only move single points

    var movable;
    var coupled;
    var moveIds = [undefined, undefined];
    var moveMatrix = [
      [1, 0, 0],
      [0, 1, 0]
    ];

    var coordTrees = this.args; //Each coordinate of the point
    coordTrees.forEach(function(tree, index){
      /* jshint maxcomplexity:14 */
      if(coupled) return;
      var symbols = tree.getDependencies();
      var otherTree = coordTrees[index === 0 ? 1 : 0];
      var definitionId;

      // Symbols are stored in order of lexical first appearance in _referencedSymbols.
      // Traversing the array in reverse order means we will move the slider variable that
      // has the last first occurance.
      for (var i = symbols.length - 1; i >= 0; i--) {
        definitionId = undefined;
        var symbol = symbols[i];
        //Make sure the variable is defined by a slider
        //TODO - find statement ID from symbol var definitionId = frame.getDefinitionId(symbol);
        for(var id in priorAnalysis){
          //Find id of slider defining symbol if there is one
          if(priorAnalysis[id].evaluationState.assignment === symbol &&
             priorAnalysis[id].evaluationState.is_slidable){
              definitionId = id;
              break;
          }
        }
        //Make sure we found a slider
        if(definitionId === undefined) continue;

        //Make sure we are linear in the variable

        //Create a frame that shadows the definition of our symbol of interest
        //So that we can ask for the polynomialOrder, etc.
        var localFrame = Object.create(frame);
        localFrame[symbol] = FreeVariable(symbol);
        var concreteTree = tree.tryGetConcreteTree(localFrame);
        if (concreteTree.isError) continue;
        var order = concreteTree.polynomialOrder(symbol);
        if (order !== 1) continue;

        //Find the parameters
        var coeffs = concreteTree.getPolynomialCoefficients(symbol);
        var b = coeffs[1] ? coeffs[1].getConcreteTree(localFrame) : zero;
        var c = coeffs[0] ? coeffs[0].getConcreteTree(localFrame) : zero;
        if (!c.isConstant || !b.isConstant) continue;
        if (b.constantValue === 0) continue;

        // Don't handle coupled variables (yet...)
        //var otherOrder = otherTree.polynomialOrder(frame, symbol);
        var otherConcreteTree = otherTree.tryGetConcreteTree(localFrame);
        if (otherConcreteTree.isError) continue;
        var otherOrder = otherConcreteTree.polynomialOrder(symbol);
        if (otherOrder > 0) {
          //if other moveID exists, continue
          if (moveIds[0]) continue;
          //set coupled = true to prevent future links
          if (otherOrder !== 0) coupled = true;
        }

        moveMatrix[index][index] = 1 / b.constantValue;  //Linear term
        moveMatrix[index][2] = -c.constantValue / b.constantValue;      //Constant term

        movable = true;
        moveIds[index] = definitionId;

        break;
      }

    });

    if (movable) {
      // Avoid double updating in case of [ 'a = 1', '(a, a)' ]
      // TODO - may be able to avoid this check with coupling check above
      if (moveIds[1] === moveIds[0]) moveIds[1] = undefined;
      return StatementAnalysis(this, nodes.MovablePoint(concrete.args, moveIds, moveMatrix));
    } else {
      return analysis;
    }
  };

  function _removeLocals (symbols, localFrame) {
    return symbols.filter(function(symbol) { return !localFrame[symbol]; });
  }

  nodes.Table.prototype.analyze = function (frame) {
    var localFrame = Object.create(frame);

    // Note, currently process column definitions left to right.
    // Could switch to running dependency ordering first.
    var concreteColumns = [];
    var firstColumnSymbol;
    for (var i = 0; i < this.columns.length; i++) {
      var columnAnalysis = this.columns[i].analyze(localFrame, frame);
      if (i === 0) {
        // First column must be an independent variable. Check with Policy
        // that that variable is valid.
        if (!columnAnalysis.concreteTree.isIndependent) {
          columnAnalysis = StatementAnalysis(this.columns[i], ErrorMsg.invalidDependentFirstTableColumn());
        } else if (!Policy.validFirstColumnVariable(columnAnalysis.concreteTree.header._symbol)) {
          columnAnalysis = StatementAnalysis(this.columns[i], ErrorMsg.invalidFirstTableColumn());
        } else {
          firstColumnSymbol = columnAnalysis.concreteTree.header._symbol;
        }
      }
      if (columnAnalysis.concreteTree.isIndependent) {
        localFrame[columnAnalysis.concreteTree.header._symbol] = columnAnalysis.concreteTree.values;
      } else if (!columnAnalysis.concreteTree.isError) {
        // Dependent columns must have no dependencies, or depend only on the
        // first column variable
        var dependencies = columnAnalysis.concreteTree.header.getDependencies();
        var freeDependencies = _removeLocals(dependencies, localFrame);
        if (freeDependencies.length) {
          columnAnalysis = StatementAnalysis(
            this.columns[i],
            ErrorMsg.tooManyVariables(freeDependencies).setDependencies(freeDependencies)
          );
        }
      }
      concreteColumns.push(columnAnalysis.concreteTree);
    }
    var concreteTable = nodes.Table(concreteColumns);
    var analysis = StatementAnalysis(this, concreteTable);
    analysis.evaluationState.is_graphable = true; // TODO wrong place for this
    return analysis;
  };

  nodes.TableColumn.prototype.analyze = function (frame, parentFrame) {
    var headerError = this.header.tableError();
    if (headerError) return StatementAnalysis(this, ErrorMsg.invalidTableHeader(headerError));

    var concrete = this.tryGetConcreteTree(frame, parentFrame);
    if (concrete.isError) return StatementAnalysis(this, concrete);
    // TODO following error checking lines should not be necessary, because an error in
    // the header should throw
    if (concrete.header.isError) return StatementAnalysis(this, concrete.header);
    if (concrete.values.isError) return StatementAnalysis(this, concrete.values);
    for (var i = 0; i < concrete.values.args.length; i++) {
      if (concrete.values.args[i].isError) continue;
      var entryError = this.values.args[i] && this.values.args[i].tableError();
      if (entryError) {
        concrete.values.args[i] = ErrorMsg.invalidTableEntry(entryError);
        continue;
      }
      var dependencies = concrete.values.args[i].getDependencies();
      if (dependencies.length) {
        concrete.values.args[i] = ErrorMsg.tooManyVariables(dependencies).setDependencies(dependencies);
      }
    }

    return StatementAnalysis(this, concrete);
  };
});

define('math/features/getgraphmode',['require','parsenodes','math/policy','graphing/graphmode'],function (require) {
  var nodes = require('parsenodes');
  var Policy = require('math/policy');
  var GRAPHMODE = require('graphing/graphmode');

  // Default to graphing nothing.
  nodes.Base.prototype.getGraphMode = function (concrete) {
    return GRAPHMODE.NONE;
  };

  nodes.Identifier.prototype.getGraphMode = function (concrete) {
    if (Policy.graphableAsBareIdentifier(this._symbol)) return GRAPHMODE.Y;
    return GRAPHMODE.NONE;
  };

  nodes.Expression.prototype.getGraphMode = function (concrete) {
    var dependencies = concrete.getDependencies();
    if (dependencies.length !== 1) return GRAPHMODE.NONE;
    return GRAPHMODE.Y;
  };

  // Helper for solved assignments and equations
  function _solvedEquationGraphInfo (concrete) {
    var dependencies = concrete._expression.getDependencies();
    if (dependencies.length !== 1) return GRAPHMODE.NONE;
    var independent = concrete._symbol;
    var dependent = dependencies[0];
    return Policy.graphMode(independent, dependent);
  }

  nodes.BaseComparator.prototype.getGraphMode = function (concrete) {
    // concrete is either
    // 1. a constant Boolean
    // 2. a SolvedEquation
    // 3. an Expression representing a multivariate implicit inequality
    var dependencies = concrete.getDependencies();
    if (concrete.isConstant) return GRAPHMODE.NONE;
    if (concrete instanceof nodes.SolvedEquation) {
      if (dependencies.length === 0) {
        if (Policy.graphableAsConstant(concrete._symbol)) return Policy.constantGraphMode(concrete._symbol);
        return GRAPHMODE.NONE;
      }
      return _solvedEquationGraphInfo(concrete);
    }
    return GRAPHMODE.NONE;
  };

  nodes.DoubleInequality.prototype.getGraphMode = function (concrete) {
    return Policy.constantGraphMode(concrete._symbol);
  };

  nodes.Equation.prototype.getGraphMode = function (concrete) {
    // concrete is either
    // 1. a constant Boolean
    // 2. a SolvedEquation
    // 3. an Expression representing a multivariate implicit function
    if (concrete.isConstant) return GRAPHMODE.NONE;
    if (concrete instanceof nodes.SolvedEquation) return _solvedEquationGraphInfo(concrete);

    if (concrete.getDependencies().length !== 2) return GRAPHMODE.NONE;
    return GRAPHMODE.IMPLICIT;
  };

  nodes.Assignment.prototype.getGraphMode = function (concrete) {
    // concrete is either a SolvedEquation or an Expression.
    if (concrete instanceof nodes.SolvedEquation) return _solvedEquationGraphInfo(concrete);

    var dependencies = concrete.getDependencies();

    switch (dependencies.length) {
      case 0:
        if (!Policy.graphableAsConstant(this._symbol)) return GRAPHMODE.NONE;
        return Policy.constantGraphMode(this._symbol);
      case 1:
        if (concrete.isList && !Policy.graphableListVariables(this._symbol, dependencies[0])) {
          return GRAPHMODE.NONE;
        }
        return Policy.graphMode(this._symbol, dependencies[0]);
      case 2:
        return GRAPHMODE.IMPLICIT;
      default:
        return GRAPHMODE.NONE;
    }
  };

  nodes.FunctionDefinition.prototype.getGraphMode = function (concrete) {
    if (this._argSymbols.length !== 1) return GRAPHMODE.NONE;

    var graphMode = Policy.graphMode(this._symbol, this._argSymbols[0]);
    var dependencies = concrete.getDependencies();
    switch (dependencies.length) {
      case 0:
        return graphMode;
      case 1:
        if (dependencies[0] !== this._argSymbols[0]) return GRAPHMODE.NONE;
        return graphMode;
      default:
        return GRAPHMODE.NONE;
    }
  };

  nodes.OrderedPair.prototype.getGraphMode = function (concrete) {
    if (concrete.isMovablePoint) return GRAPHMODE.XYPOINT_MOVABLE;
    var dependencies = concrete.getDependencies();
    if (dependencies.length === 0) return GRAPHMODE.XYPOINT;
    return Policy.validParametricVariables(dependencies) ? GRAPHMODE.PARAMETRIC : GRAPHMODE.NONE;
  };

  nodes.List.prototype.getGraphMode = function (concrete) {
    /*If we have one free variable, we're graphable*/
    if (concrete.getDependencies().length !== 1) return GRAPHMODE.NONE;
    return GRAPHMODE.Y;
  };

  nodes.Regression.prototype.getGraphMode = function (concrete) {
    if (!(this._lhs instanceof nodes.Identifier) && !(this._lhs instanceof nodes.List)) return GRAPHMODE.NONE;
    if (!concrete.isModelValid) return GRAPHMODE.NONE;
    if (concrete.model.getDependencies().length !== 1) return GRAPHMODE.NONE;
    return GRAPHMODE.Y;
  };

});
define('math/features/getgraphinfo',['require','parsenodes','math/builtinframe'],function (require) {
  var nodes = require('parsenodes');
  var BuiltInFrame = require('math/builtinframe');

  // Needs to be a feature because it relies on BuiltInFrame.

  nodes.Base.prototype.getGraphInfo = function (concrete) {
    var dependencies = concrete.getDependencies();

    var isLinear, domainBound;
    var linearCoefficients = [NaN, NaN];

    switch (dependencies.length) {
      case 0:
        isLinear = true;
        linearCoefficients = [+concrete.constantValue, 0];
        domainBound = [-Infinity, Infinity];
        break;
      case 1:
        domainBound = concrete.boundDomain(dependencies[0]);
        if (!domainBound) {
          domainBound = [-Infinity, Infinity];
          isLinear = false;
        } else {
          isLinear = concrete.isLinear(dependencies[0]);
        }
        if (isLinear) {
          var cs = concrete.getPolynomialCoefficients(dependencies[0]);
          linearCoefficients[0] = cs[0] ? +cs[0].getConcreteTree(BuiltInFrame).constantValue : 0;
          linearCoefficients[1] = cs[1] ? +cs[1].getConcreteTree(BuiltInFrame).constantValue : 0;
        }
        break;
      case 2: isLinear = false; domainBound = [-Infinity, Infinity]; break;
    }

    return {
      graphMode: this.getGraphMode(concrete),
      color: this.userData.color,
      style: this.userData.style,
      operator: this.getOperator(),
      isLinear: isLinear,
      linearCoefficients: linearCoefficients,
      domainBound: domainBound
    };
  };
});

// node.tableInfo returns either
// 1. false if the node cannot be converted to a table
// 2 {
//     independent_variable: 'symbol',
//     dependent_column: 'latex',
//     values: [[x1, y1], [x2, y2], ...], // (optional),
//     by_reference: t/f // Whether the table should replace or reference the statement
//   }
define('math/features/tableinfo',['require','parsenodes','math/policy'],function (require) {
  var nodes = require('parsenodes');
  var Policy = require('math/policy');

  var latexTrim = function (str) {
    return str.replace(/^( |\\space)+/, '').replace(/( |\\space)+$/, '');
  };

  // Default to graphing nothing.
  nodes.Base.prototype.tableInfo = function (concrete) {
    return false;
  };

  nodes.Identifier.prototype.tableInfo = function (concrete) {
    if (!Policy.graphableAsBareIdentifier(this._symbol)) return false;
    if (!Policy.validFirstColumnVariable(this._symbol)) return false;
    return {
      independent_variable: this._symbol,
      dependent_column: this._inputString,
      by_reference: false
    };
  };

  nodes.Expression.prototype.tableInfo = function (concrete) {
    var dependencies = concrete.getDependencies();

    if (dependencies.length !== 1) return false;
    var independent = dependencies[0];
    if (!Policy.validFirstColumnVariable(independent)) return false;

    return {
      independent_variable: independent,
      dependent_column: this._inputString,
      by_reference: false
    };
  };

  nodes.Assignment.prototype.tableInfo = function (concrete) {
    // concrete is either a SolvedEquation or an Expression.
    if (concrete instanceof nodes.SolvedEquation) return false;
    // Comes up in the case of generated expressions. We won't need to table those anyway.
    if (!this._inputString.length) return false;

    var dependencies = concrete.getDependencies();

    if (dependencies.length > 1) return false;
    var independent;
    if (dependencies.length === 0) {
      if (!Policy.tableableAsConstant(this._symbol)) return false;
      independent = Policy.implicitIndependent(this._symbol);
    } else {
      independent = dependencies[0];
    }

    if (!Policy.validFirstColumnVariable(independent)) return false;

    var dependent = Policy.assignmentForbidden(this._symbol) ?
      latexTrim(this._inputString.replace(/[^=]*=/,'')) :
      latexTrim(this._inputString.split('=')[0])
    ;

    return {
      independent_variable: independent,
      dependent_column: dependent,
      by_reference: !Policy.assignmentForbidden(this._symbol)
    };
  };

  nodes.FunctionDefinition.prototype.tableInfo = function (concrete) {
    if (this._argSymbols.length !== 1) return false;
    // Comes up in the case of generated expressions. We won't need to table those anyway.
    if (!this._inputString.length) return false;

    var dependencies = concrete.getDependencies();

    if (dependencies.length > 1) return false;
    var independent = this._argSymbols[0];
    if (!Policy.validFirstColumnVariable(independent)) return false;

    var assignmentForbidden = Policy.assignmentForbidden(this._symbol);
    var dependent = assignmentForbidden ?
      latexTrim(this._inputString.replace(/[^=]*=/,'')) :
      latexTrim(this._inputString.split('=')[0])
    ;

    return {
      independent_variable: independent,
      // Close to this._symbol, but we want to preserve, e.g., curly brackets in
      // a_{ro}.
      dependent_column: dependent,
      by_reference: !assignmentForbidden
    };
  };

  nodes.BaseComparator.prototype.tableInfo = function (concrete) {
    return false;
  };

  nodes.DoubleInequality.prototype.tableInfo = function (concrete) {
    return false;
  };

  nodes.Equation.prototype.tableInfo = function (concrete) {
    return false;
  };

  nodes.OrderedPair.prototype.tableInfo = function (concrete) {
    var dependencies = concrete.getDependencies();
    if (dependencies.length !== 0) return false;
    if (concrete.isMovablePoint) return false;
    return {
      independent_variable: 'x',
      dependent_column: 'y',
      by_reference: false,
      // TODO, would like to be able to pass full expressions to tables,
      // not just numbers
      values: nodes.List.mapArgs(concrete.args, function (pair) {
        return [+pair[0].constantValue, +pair[1].constantValue];
      })
    };
  };

  nodes.List.prototype.tableInfo = function (concrete) {
    return false;
  };
});
define('math/features/tableerror',['require','parsenodes','lib/worker-i18n'],function (require) {
  var nodes = require('parsenodes');
  var i18n = require('lib/worker-i18n');

  nodes.Base.prototype.tableError = function () {
    if (this.isInequality()) return i18n.t("Inequalities are not allowed.");
    return false;
  };
  nodes.List.prototype.tableError = function () {
    return i18n.t("Lists are not allowed.");
  };
  nodes.OrderedPair.prototype.tableError = function () {
    return i18n.t("Points are not allowed.");
  };
  nodes.Equation.prototype.tableError =
  nodes.Assignment.prototype.tableError = function () {
    return i18n.t("Equations are not allowed.");
  };
  nodes.FunctionDefinition.prototype.tableError = function () {
    return i18n.t("Function definitions are not allowed.");
  };
});
define('math/features/islinear',['require','parsenodes'],function (require) {
  var nodes = require('parsenodes');

  nodes.Base.prototype.isLinear = function (symbol) {
    return false;
  };

  nodes.Expression.prototype.isLinear = function (symbol) {
    return this.polynomialOrder(symbol) <= 1;
  };

  nodes.SolvedEquation.prototype.isLinear = function (symbol) {
    return this._expression.isLinear(symbol);
  };

  nodes.OptimizedRegression.prototype.isLinear = function (symbol) {
    return this.model.isLinear(symbol);
  };

});
define('graphing/columnmode',{
  POINTS: 'POINTS',
  LINES: 'LINES',
  POINTS_AND_LINES: 'POINTS_AND_LINES'
});

define('math/features/graph',['require','parsenodes','math/plotter','graphing/graphmode','math/comparators','graphing/columnmode'],function (require) {
  var nodes = require('parsenodes');
  var Plotter = require('math/plotter');
  var GRAPHMODE = require('graphing/graphmode');
  var Comparators = require('math/comparators');
  var COLUMNMODE = require('graphing/columnmode');
  var List = nodes.List;

  function copyDefinedPOIs (points) {
    var xs = [];
    var ys = [];

    var len = points.length;
    for (var i=0; i<len; i++) {
      xs.push(points[i][0]);
      ys.push(points[i][1]);
    }

    return {
      defined: {x: xs, y: ys}
    };
  }

  nodes.Base.prototype._graph = function (concrete, viewState, graphInfo) {
    if (graphInfo.graphMode === GRAPHMODE.NONE) return false;

    //Compile, pass to plotter, and return
    var fns = concrete.getCompiledFunctions();
    var derivatives;

    // TODO, taking derivatives can throw an error if the nodecount of the
    // tree gets to large. Can just plot without derivatives if we can't
    // compute them. Would be nice to clean this up.
    try {
      derivatives = concrete.getCompiledDerivatives();
    } catch (e) {
      // do nothing
    }

    var branches = [];
    for (var i = 0; i < fns.length; i++) {
      var localGraphInfo;
      if (concrete.isList) {
        localGraphInfo = this.getGraphInfo(concrete.args[i]);
        localGraphInfo.graphMode = graphInfo.graphMode;
      } else {
        localGraphInfo = graphInfo;
      }

      var branch = derivatives ?
        Plotter.computeGraphData(viewState, localGraphInfo, fns[i].fn, derivatives[i].fn) :
        Plotter.computeGraphData(viewState, localGraphInfo, fns[i].fn)
      ;
      branch.compiled = fns[i];
      branches.push(branch);
    }

    return branches;
  };

  nodes.Base.prototype.graph = function (concrete, viewState) {
    var graphInfo = this.getGraphInfo(concrete);
    return this._graph(concrete, viewState, graphInfo);
  };

  nodes.BaseComparator.prototype.graph = function (concrete, viewState) {
    var graphMode = this.getGraphInfo(concrete).graphMode;
    if (graphMode === GRAPHMODE.NONE) return false;
    if (!concrete instanceof nodes.SolvedEquation) return false;

    var operator = this.getOperator();
    //Compile, pass to plotter, and return
    var fns = concrete.getCompiledFunctions();

    var derivatives;
    try {
      derivatives = concrete.getCompiledDerivatives();
    } catch (e) {
      // do nothing
    }

    var branch, i;
    var branches = [];
    var polarities = [ -1, 0, 0, 1 ];

    var nbranches = fns.length;
    for (i = 0; i < nbranches; i++) {
      var graphInfo = this.getGraphInfo(concrete._expression.args[i]);
      graphInfo.graphMode = graphMode;
      branch = derivatives ?
        Plotter.computeGraphData(viewState, graphInfo, fns[i].fn, derivatives[i].fn) :
        Plotter.computeGraphData(viewState, graphInfo, fns[i].fn)
      ;
      branch.compiled = fns[i];
      branch.operator = Comparators.get(
        Comparators.table[operator].inclusive,
        polarities[i % 4]
      );
      branches.push(branch);
    }

    for (i = 0; i < nbranches; i += 4) {
      var polygons = Plotter.polygonsFromSegments(
        branches[i + 1].segments,
        branches[i + 2].segments,
        graphMode
      );
      branches.push({
        graphMode: GRAPHMODE.POLYGONFILL,
        segments: polygons,
        poi:{}
      });
    }

    return branches;
  };

  nodes.DoubleInequality.prototype.graph = function (concrete, viewState) {
    var graphInfo = this.getGraphInfo(concrete);
    if (graphInfo.graphMode === GRAPHMODE.NONE) return false;

    var branches = [];
    var op0 = Comparators.get(Comparators.table[this._operators[0]].inclusive, 0);
    var op1 = Comparators.get(Comparators.table[this._operators[1]].inclusive, 0);

    var userData = this.userData;

    var self = this;
    List.eachArgs(concrete._expressions, function (args) {
      var branch0, branch1;
      args[0].userData = args[1].userData = userData; // TODO ick, prefer nodes to be immutable
      branch0 = self._graph(args[0], viewState, graphInfo)[0];
      branch0.operator = op0;
      branches.push(branch0);
      branch1 = self._graph(args[1], viewState, graphInfo)[0];
      branch1.operator = op1;
      branches.push(branch1);

      var polygons = Plotter.polygonsFromSegments(branch0.segments, branch1.segments, branch0.graphMode);
      branches.push({
        graphMode: GRAPHMODE.POLYGONFILL,
        segments: polygons,
        poi:{}
      });
    });

    return branches;
  };

  nodes.OrderedPair.prototype.graph = function (concrete, viewState) {
    var graphInfo = this.getGraphInfo(concrete);
    var points;
    switch (graphInfo.graphMode) {
      case GRAPHMODE.XYPOINT_MOVABLE:
        points = [[concrete.args[0].constantValue, concrete.args[1].constantValue]];

        return [{
          segments: [points],
          graphMode: graphInfo.graphMode,
          color: this.userData.color,
          style: this.userData.style,
          poi: copyDefinedPOIs(points)
        }];
      case GRAPHMODE.XYPOINT:
        points = [];
        List.eachArgs(concrete.args, function (args) {
          if (isFinite(args[0].constantValue) && isFinite(args[1].constantValue)) {
            points.push([args[0].constantValue, args[1].constantValue]);
          }
        });

        return[{
          segments: [points],
          graphMode: graphInfo.graphMode,
          color: this.userData.color,
          style: this.userData.style,
          poi: copyDefinedPOIs(points)
        }];
      case GRAPHMODE.PARAMETRIC:
        var userData = this.userData;
        var branches = List.mapArgs(concrete.args, function (args) {
          // Handle case that args don't actually depend on t. This can
          // happen for some elements in a parametric with list coordinates,
          // e.g. (1, [t, 2]) has one curve and one point.
          if (args[0].isConstant && args[1].isConstant) {
            var points = [[args[0].constantValue, args[1].constantValue]];
            return {
              segments: [points],
              graphMode: GRAPHMODE.XYPOINT,
              color: userData.color,
              style: userData.style,
              poi: copyDefinedPOIs(points)
            };
          } else {
            var fn1 = args[0].getCompiledFunctions()[0].fn;
            var fn2 = args[1].getCompiledFunctions()[0].fn;
            // TODO modify parametric plotter to work with array of fns instead
            // of an fn that returns an array
            var fn = function (t) {return [fn1(t), fn2(t)];};
            graphInfo.domain = userData.domain;
            return Plotter.computeGraphData(viewState, graphInfo, fn);
          }
        });

        return branches;
      default:
        return false;
    }
  };

  nodes.Regression.prototype.graph = function (concrete, viewState) {
    var graphInfo = this.getGraphInfo(concrete);
    return this._graph(concrete.model, viewState, graphInfo);
  };

  function _flatten (arr) { return Array.prototype.concat.apply([], arr); }

  nodes.Table.prototype.graph = function (concrete, viewState) {
    /* jshint maxcomplexity:13 */
    var graphs = [];

    if (concrete.columns[0].isError) return graphs;
    var firstColumnValues = concrete.columns[0].values;

    for (var i = 1; i < this.columns.length; i++) {
      var column = concrete.columns[i];
      if (column.isError) continue;
      var userData = this.columns[i].header.userData;
      if (userData.hidden) continue;
      var columnMode = userData.columnMode;
      var showPoints = columnMode === COLUMNMODE.POINTS || columnMode === COLUMNMODE.POINTS_AND_LINES;
      var showLine = columnMode === COLUMNMODE.LINES || columnMode === COLUMNMODE.POINTS_AND_LINES;
      //Connect the dots if we're independent numbers, or an externally defined list
      //Draw a smooth line if it's a defined function
      var showDiscreteLine = showLine && column.isDiscrete;
      var showContinuousLine = showLine && !column.isDiscrete;

      var branches = [];
      if (showPoints || showDiscreteLine) {
        var segments = [];
        var thisSegment = [];
        var columnValues = column.values;
        /* jshint loopfunc: true */
        List.eachArgs([firstColumnValues, columnValues], function (args) {
          if (isFinite(args[0].constantValue) && isFinite(args[1].constantValue)) {
            thisSegment.push([args[0].constantValue, args[1].constantValue]);
          } else {
            segments.push(thisSegment);
            thisSegment = [];
          }
        });
        segments.push(thisSegment);
        if (showPoints) {
          branches.push({
            segments: segments,
            graphMode: GRAPHMODE.XYPOINT,
            poi: copyDefinedPOIs(segments),
            color: userData.color,
            style: userData.style
          });
        }
        if (showDiscreteLine) {
          branches.push({
            // flatten segments into format expected by line plotter
            segments: segments.map(_flatten),
            // Using PARAMETRIC instead of Y here is a bit of a hack
            // to keep graph controller from trying to trace, etc.
            graphMode: GRAPHMODE.PARAMETRIC,
            poi: [],
            color: userData.color,
            style: userData.style
          });
        }
      }
      if (showContinuousLine) {
        var continuousBranches = this.columns[i].header.graph(concrete.columns[i].header, viewState);
        if (continuousBranches.length) Array.prototype.push.apply(branches, continuousBranches);
      }

      if (branches.length) graphs[userData.id] = branches;
    }
    return graphs;
  };
});

define('parser',['require','math/baseparser','math/features/repr','math/features/scalarEvalExpression','math/features/okForImplicitFunction','math/features/constantcollapsedcopy','math/features/polynomialorder','math/features/polynomialcoefficients','math/features/extractconditions','math/features/bounddomain','math/features/derivative','math/features/substitute','math/features/solve','math/features/analyze','math/features/getgraphmode','math/features/getgraphinfo','math/features/tableinfo','math/features/tableerror','math/features/islinear','math/features/graph'],function (require) {
  var Parser = require('math/baseparser');

  //Append each types of node with additional features
  require('math/features/repr');
  require('math/features/scalarEvalExpression');
  require('math/features/okForImplicitFunction');
  require('math/features/constantcollapsedcopy');
  require('math/features/polynomialorder');
  require('math/features/polynomialcoefficients');
  require('math/features/extractconditions');
  require('math/features/bounddomain');
  require('math/features/derivative');
  require('math/features/substitute');
  require('math/features/solve');
  require('math/features/analyze');
  require('math/features/getgraphmode');
  require('math/features/getgraphinfo');
  require('math/features/tableinfo');
  require('math/features/tableerror');
  require('math/features/islinear');
  require('math/features/graph');

  return Parser;
});

define('math/finddependencyorder',['require','math/builtinframe','underscore'],function (require) {
  var BuiltInFrame = require('math/builtinframe');
  var _ = require('underscore');
  // Order statements according to their dependencies.
  //
  // Optional 2nd arguments is a list of ids giving the roots to start searching
  // for dependencies from. This is used by the regression pass to only traverse
  // statements that regressions depend on, and to preserve order in case of ties
  // for the purpose of picking good residual variables.
  //
  // Implements Tarjan's algorithm
  //
  // https://en.wikipedia.org/wiki/Tarjan's_strongly_connected_components_algorithm
  //
  // to topologically sort DAG of strongly connected components of dependency graph.
  // A strongly connected component is a subgraph for which every node can be
  // reached by following directed edges from every other node. Any time we find a
  // strongly connected component with more than one statement in it, that's a
  // cyclic dependency error.
  function findDependencyOrder (statements, roots) {
    /* jshint maxcomplexity:16 */
    var exportLevels = [];
    var assignments = {}; // symbol => [id] of assigners
    var multiplyDefined = {}; // symbol => sentinal
    var cyclicallyDefined = {}; // symbol => [symbols]
    var nodes = {}; // id => { id: #, index: #, lowval: #, error: {}, instack: t/f }
    var index = 0; // Number of nodes reached so far in DFS
    var stack = []; // [node]
    var resolved = []; // [id]
    var id, i, j, symbol, penalty;

    if (!roots) {
      roots = [];
      for (id in statements) {
        if (statements.hasOwnProperty(id)) roots.push(id);
      }
    }

    // Separate statements by export penalty
    for (id in statements) {
      if (!statements.hasOwnProperty(id)) continue;
      penalty = statements[id].exportPenalty || 0;
      while (exportLevels.length < penalty + 1) exportLevels.push([]);
      exportLevels[penalty].push(id);
    }

    for (penalty = 0; penalty < exportLevels.length; penalty++) {
      var levelAssignments = {};
      for (i = 0; i < exportLevels[penalty].length; i++) {
        id = exportLevels[penalty][i];
        var exports = statements[id].getExports();

        // Fill in dictionary of assignments at the current level, skipping
        // symbols that have already been assigned at a lower penalty
        for (j = 0; j < exports.length; j++) {
          symbol = exports[j];
          if (BuiltInFrame[symbol]) continue;
          if (assignments[symbol]) continue;
          levelAssignments[symbol] = levelAssignments[symbol] || [];
          levelAssignments[symbol].push(id);
          if (levelAssignments[symbol].length > 1) multiplyDefined[symbol] = true;
        }
      }
      // Commit assignments from this level to the accumulated assignments
      // dictionary
      for (symbol in levelAssignments) {
        assignments[symbol] = levelAssignments[symbol];
      }
    }

    // Traverse all nodes, finding their strongly connected components.
    // Note that strongConnect calls itself recursively.
    for (i = 0; i < roots.length; i++) {
      if (!nodes.hasOwnProperty(roots[i])) strongConnect(roots[i]);
    }

    function strongConnect(id) {
      nodes[id] = nodes[id] || {};
      var v = nodes[id];
      var w;
      v.id = id;
      v.index = index;
      v.lowlink = index;
      stack.push(v);
      v.instack = true;
      index++;

      var dependencies = statements[id].getDependencies();
      for (var i = 0; i < dependencies.length; i++) {
        var symbol = dependencies[i];
        if (!assignments.hasOwnProperty(symbol)) continue;
        var assigners = assignments[symbol];

        // Visit the dependencies w of v
        for (var j = 0; j < assigners.length; j++) {
          var assigner = assigners[j];
          if (!nodes.hasOwnProperty(assigner)) {
            // assigner has not yet been visited; recurse on it
            strongConnect(assigner);
            w = nodes[assigner];
            v.lowlink = Math.min(v.lowlink, w.lowlink);
          } else {
            w = nodes[assigner];
            // If w is already in the stack, it is part of the SCC of v
            if (w.instack) v.lowlink = Math.min(v.lowlink, w.index);
          }
        }
      }

      // If v is a root node, the current stack is a strongly connected component
      if (v.lowlink === v.index) {
        w = stack.pop();
        w.instack = false;

        if (w === v) {
          markSingle(v);
        } else {
          var scc = [w];
          while (true) {
            w = stack.pop();
            w.instack = false;
            scc.push(w);
            if (w === v) break;
          }
          markCycle(scc);
        }
      }
    }

    function markSingle (v) {
      resolved.push(v.id);
    }

    function markCycle (scc) {
      var cycleSymbols = [];
      var v;
      var i;

      for (i = scc.length - 1; i >= 0; i--) {
        v = scc[i];
        var exports = statements[v.id].getExports();

        // TODO for expressions with multiple exports, does not distinguish between
        // symbols that are and are not involved in the cycle.
        Array.prototype.push.apply(cycleSymbols, exports);

        cycleSymbols.push(exports[0]);
        resolved.push(v.id);
      }

      cycleSymbols = _.unique(cycleSymbols);
      cycleSymbols.sort();

      for (i = 0; i < cycleSymbols.length; i++) {
        cyclicallyDefined[cycleSymbols[i]] = cycleSymbols;
      }
    }

    return {
      resolved: resolved,
      multiplyDefined: multiplyDefined,
      cyclicallyDefined: cyclicallyDefined
    };
  }

  return findDependencyOrder;
});
define('math/context',['require','console','pjs','underscore','./plotter','./poi','parser','math/builtinframe','math/parsenode/constant','math/parsenode/table','math/parsenode/tablecolumn','math/parsenode/freevariable','math/parsenode/list','math/finddependencyorder','math/errormsg','graphing/graphmode'],function(require){
  var console = require('console');
  var P = require('pjs');
  var _ = require('underscore');
  var Plotter = require('./plotter');
  var POI = require('./poi');
  var Parser = require('parser');
  var BuiltInFrame = require('math/builtinframe');
  var Constant = require('math/parsenode/constant');
  var Table = require('math/parsenode/table');
  var TableColumn = require('math/parsenode/tablecolumn');
  var FreeVariable = require('math/parsenode/freevariable');
  var List = require('math/parsenode/list');
  var findDependencyOrder = require('math/finddependencyorder');
  var ErrorMsg = require('math/errormsg');
  var GRAPHMODE = require('graphing/graphmode');

  return P(function(context){

    // callback noop
    context.triggerGraphComputed = function(){};
    context.triggerStatusChange = function(){};
    context.triggerRemoveGraph = function(){};
    context.triggerRender = function(){};
    context.triggerRenderSlowly = function(){};
    context.triggerDidAddStatement = function(){};
    context.triggerDidRemoveStatement = function(){};
    context.triggerDidSetCompleteState = function(){};
    context.triggerDidUpdateIntersections = function () {};

    context.init = function(frame){
      if(!frame) frame = BuiltInFrame;
      // Only trigAngleMultiplier is ever updated in parent_frame
      this.parent_frame = Object.create(frame);
      // statements export definitions to this.frame
      this.frame = Object.create(this.parent_frame);
      this.lastFrame = Object.create(this.parent_frame);
      this.regressionFrame = Object.create(this.parent_frame);
      this.statements = {};    //Each statement should be immutable
      this.analysis = {};    //This can be cleaned out at re-derived each round
      this.currentStatus = {}; //Remember last sent message, so that we only update when necessary
      this.unanalyzedIds = {};
      this.unpublishedIds = {};
      this.intersectIds = {};
    };

    context.processChangeSet = function (changeSet) {
      /* jshint maxcomplexity:44 */
      var ids, triggerRender;

      if (changeSet.isCompleteState) {
        this.invalidate();
        this.statements = {};
      }

      // update the viewport
      if (changeSet.viewState) {
        this.setViewState(changeSet.viewState);
      }

      // update degree mode
      if (changeSet.hasOwnProperty('degreeMode')) {
        this.setDegreeMode(changeSet.degreeMode);
      }

      // change which expressions 'intersectId' attempts to intersect with
      if (changeSet.hasOwnProperty('intersectIds')) {
        this.intersectIds = changeSet.intersectIds;
      }

      if (changeSet.statements) {
        for (var id in changeSet.statements) {
          var statement = changeSet.statements[id];

          // remove the statement if it is null
          if (statement === null) {
            if (!changeSet.isCompleteState && this.statements.hasOwnProperty(id)) {
              ids = this.statements[id].getAllIds();
            }

            this.removeStatement(id);

            if (!changeSet.isCompleteState && ids) {
              for (var i = 0; i < ids.length; i++) {
                this.triggerRemoveGraph(ids[i]);
              }
              this.triggerDidRemoveStatement(id);
            }
          } else {
            this.addStatement(statement);

            if (!changeSet.isCompleteState) {
              this.triggerDidAddStatement(statement);
            }
          }
        }
      }

      if (changeSet.isCompleteState) {
        this.triggerDidSetCompleteState(changeSet.statements);

        //Temporarily use slow rendering callback
        //TODO - handle renderSlowly via some other mechanism.
        triggerRender = this.triggerRender;
        this.triggerRender = this.triggerRenderSlowly;
      }

      this.updateAnalysis();

      if (changeSet.hasOwnProperty('intersectId')) this._updateIntersections(changeSet.intersectId);

      this.publishChanges();

      if (changeSet.isCompleteState) {
        this.triggerRender = triggerRender;
      }
    };

    context.setViewState = function (viewState) {
      if (_.isEqual(viewState, this.viewState)) return;
      this.viewState = viewState;
      for (var id in this.statements) {
        if (!this.statements.hasOwnProperty(id)) continue;
        this.unpublishedIds[id] = true;
      }
    };

    context.getViewState = function () {
      if (!this.viewState) return;
      // Hack to smuggle trigAngleMultiplier into viewState while allowing these to be
      // set separately by external calls.
      var localViewState = Object.create(this.viewState);
      if (this.parent_frame && this.parent_frame.trigAngleMultiplier) {
        localViewState.trigAngleMultiplier = this.parent_frame.trigAngleMultiplier.constantValue;
      } else {
        localViewState.trigAngleMultiplier = 1.0;
      }
      return localViewState;
    };

    context.setDegreeMode = function(use_degrees) {
      this.parent_frame.trigAngleMultiplier = Constant(use_degrees ? Math.PI / 180 : 1);
      this.invalidate();
    };

    context.publishChanges = function(){
      this.updateAnalysis();
      this._publishAllStatuses();
      this._graphAllChanged();
      this.unpublishedIds = {};
    };

    // `_publishAllStatuses`, `_graphAllChanged`, and `_updateIntersections`
    // use `this.analysis`, and so expect it to be up to date, i.e. no statements
    // should have been added or removed since `this.updateAnalysis()` was called.
    //
    context._publishAllStatuses = function(){
      //Compute new states, but only send them out if they're different from what we sent last time
      var changes = {};
      var lastStatus = this.currentStatus;
      this.currentStatus = {};

      for (var id in this.unpublishedIds) {
        if (!this.analysis.hasOwnProperty(id)) continue;
        var newState = this.analysis[id].evaluationState;
        if (JSON.stringify(newState) !== JSON.stringify(lastStatus[id])) {
          changes[id] = newState;
        }
        this.currentStatus[id] = newState;
      }

      this.triggerStatusChange(changes);
    };

    context._graphAllChanged = function(){
      /* jshint maxcomplexity:13 */
      var viewState = this.getViewState();
      if (!Plotter.validateViewState(viewState)) return;

      for (var id in this.unpublishedIds) {
        if (!this.analysis.hasOwnProperty(id)) continue;
        var analysis = this.analysis[id];
        if (analysis.rawTree.isTable) {
          var graphs = analysis.graph(viewState);
          var columnIds = analysis.rawTree.getAllIds();
          for (var i = 0; i < columnIds.length; i++) {
            if (graphs[columnIds[i]]) {
              this.triggerGraphComputed(columnIds[i], graphs[columnIds[i]]);
            } else {
              this.triggerRemoveGraph(columnIds[i]);
            }
          }
        } else if (analysis.evaluationState.is_graphable && analysis.rawTree.userData.shouldGraph) {
          this.triggerGraphComputed(id, analysis.graph(viewState));
          if (this.intersectIds.hasOwnProperty(id)) this._updateIntersections(id);
        } else {
          this.triggerRemoveGraph(id); //TODO - removing evaluable things every cycle
        }
      }

      // Recompute all visible intersections for curves that weren't regraphed.
      // Curves that were regraphed already had their intersections updated in
      // the graph routine. Need to do this because we're only keeping track of
      // one partner in an intersection, and the other partner might have
      // changed.
      if (_.keys(this.unpublishedIds).length) {
        for (var intersectId in this.intersectIds) {
          if (this.unpublishedIds.hasOwnProperty(intersectId)) continue;
          if (this.intersectIds.hasOwnProperty(intersectId)) this._updateIntersections(intersectId);
        }
      }

      this.triggerRender();
    };

    // Find all intersections between a curve with the given id and other
    // curves.
    context._updateIntersections = function (id) {
      if (!this.viewState) return;
      var analysis = this.analysis[id];

      if (!analysis || !analysis.shouldIntersect()) {
        this.triggerDidUpdateIntersections(id, []);
        return;
      }

      this.findSomeIntersectionsWith(id).streamRest();
    };

    // context.findSomeIntersectionsWith computes as many intersections with the
    // curve with given id as it can in 20 ms and then returns an object:
    // {
    //   intersections: // Intersections found so far
    //   streamRest: // Function that will stream the rest of the intersections
    //               // back to the grapher.
    // }
    //
    // We run a different timeout for every curve id that is having
    // having intersections computed on it so that we can start computing
    // intersections with a few curves at once without having them cancel
    // eachother. This will happen if you open intersections on a few different
    // curves and then change something that triggers a graphAll.
    //
    // Note that we typically only stick the intersection POI on one of the two
    // curves that is involved in an intersection (the one that was selected
    // when the intersection was computed).
    var streamIntersectionsTimeouts = {};
    context.findSomeIntersectionsWith = function (id1) {
      this.cancelIntersectionStreaming(id1);
      var runFor = 20; // ms
      var waitFor = 60; // ms
      var self = this;
      var push = Array.prototype.push;
      var viewState = this.getViewState();
      var analysis1 = self.analysis[id1];
      var graphInfo = analysis1.getGraphInfo();
      var graphMode = graphInfo.graphMode;
      var compiled1 = analysis1.concreteTree.getCompiledFunctions();

      var otherAnalyses = [];
      for (var id2 in self.analysis) {
        if (!self.analysis.hasOwnProperty(id2)) continue;
        if (String(id2) === String(id1)) continue;
        if (!self.analysis[id2].shouldIntersect()) continue;
        otherAnalyses.push(self.analysis[id2]);
      }

      // intersections accumulator and iterator i are modified during successive
      // calls to computeSome()
      var intersections = [];
      for (var branch = 0; branch < compiled1.length; branch++) {
        intersections[branch] = { x: [], y: [], intersects: [] };
      }
      var i = otherAnalyses.length - 1;
      var stream = false;
      var computeSome = function () {
        /* jshint maxcomplexity:14 */
        /* jshint loopfunc: true */
        var now = new Date();
        var updated = false;
        var fn1;
        var fn2;
        var newIntersections;
        var analysis2, graphMode2, compiled2;
        var swap;
        var indicatorSamples;
        var domain;
        for (i; i >= 0; i--) {
          if (new Date() - now > runFor) {
            if (!stream) return;
            streamIntersectionsTimeouts[id1] = setTimeout(computeSome, waitFor);
            if (!updated) return;
            self.triggerDidUpdateIntersections(id1, intersections);
            return;
          }
          analysis2 = otherAnalyses[i];
          graphMode2 = analysis2.getGraphInfo().graphMode;

          var modesxx = graphMode === GRAPHMODE.X && graphMode2 === GRAPHMODE.X;
          var modesyy = graphMode === GRAPHMODE.Y && graphMode2 === GRAPHMODE.Y;
          var modesxy = graphMode === GRAPHMODE.X && graphMode2 === GRAPHMODE.Y;
          var modesyx = graphMode === GRAPHMODE.Y && graphMode2 === GRAPHMODE.X;
          // Currently only intersect x and y graphs
          if (!(modesxx || modesyy || modesxy || modesyx)) continue;

          compiled2 = analysis2.concreteTree.getCompiledFunctions();

          for (var branch1=0; branch1 < compiled1.length; branch1++) {
            fn1 = compiled1[branch1].fn;
            domain = Plotter.computeDomain(viewState, graphInfo, fn1);
            for (var branch2 = 0; branch2 < compiled2.length; branch2++) {
              fn2 = compiled2[branch2].fn;

              var indicatorFn;
              if (modesxx || modesyy) {
                indicatorFn = function (x) { return fn2(x) - fn1(x); };
              } else if (modesxy || modesyx) {
                indicatorFn = function (x) { return x - fn2(fn1(x)); };
              } else {
                continue;
              }
              indicatorSamples = Plotter.sampleXY(indicatorFn, domain).segments;
              newIntersections = POI.findIntersections(
                indicatorSamples,
                fn1,
                indicatorFn
              );
              if (newIntersections.x.length) updated = true;
              newIntersections.intersects = Array(newIntersections.x.length);
              for (var j = 0, jlen = newIntersections.x.length; j < jlen; j++) {
                newIntersections.intersects[j] = analysis2.id;
              }
              // Need to swap x and y if graphmode is GRAPHMODE.X
              if (graphMode === GRAPHMODE.X) {
                swap = newIntersections.y;
                newIntersections.y = newIntersections.x;
                newIntersections.x = swap;
              }
              push.apply(intersections[branch1].x, newIntersections.x);
              push.apply(intersections[branch1].y, newIntersections.y);
              push.apply(intersections[branch1].intersects, newIntersections.intersects);
            }
          }
        }

        if (!stream || !updated) return;
        self.triggerDidUpdateIntersections(id1, intersections);
        self.cancelIntersectionStreaming(id1);
      };

      computeSome();

      return {
        intersections: intersections,
        streamRest: function () {
          // Slightly wasteful, but handy for clearing old intersections early.
          self.triggerDidUpdateIntersections(id1, intersections);
          stream = true;
          computeSome();
        }
      };
    };

    context.cancelIntersectionStreaming = function (id) {
      clearTimeout(streamIntersectionsTimeouts[id]);
      delete streamIntersectionsTimeouts[id];
    };

    //Takes a object representing a statement
    //Expects statement to have properties:
    // * id (integer)
    // * latex (string)
    // * shouldGraph (boolean)
    // * color (string)
    context.addStatement = function(statement){
      if(!statement) return;
      var id = statement.id;
      this.markDirty(id); // Mark existing dependencies as dirty

      if (statement.type === 'table') {
        var previousIds = [];  //Used to tell tables to ungraph old columns

        if (this.statements.hasOwnProperty(id)) previousIds = this.statements[id].getAllIds();

        statement.shouldGraph = true; // TODO hack

        var columns = statement.columns;
        var parsedColumns = [];
        var header, values, parsedColumn;

        var maxLength = 0;
        for (var n = 0; n < columns.length; n++) {
          maxLength = Math.max(columns[n].values.length, maxLength);
        }

        for (var i = 0; i < columns.length; i++) {
          header = Parser.parse(columns[i].latex);
          values = [];
          var lastNonEmptyIndex = 0;
          for (var j = 0; j < columns[i].values.length; j++) {
            if (columns[i].values[j].replace(/\\space/g, '').match(/\S/)) {
              values.push(Parser.parse(columns[i].values[j]));
              lastNonEmptyIndex = j;
            } else {
              // Parse blank entries as NaN
              values.push(Constant(NaN));
            }
          }
          values.splice(lastNonEmptyIndex + 1);
          parsedColumn = TableColumn(header, maxLength, List(values));
          parsedColumn.id = columns[i].id;
          // Hang onto things like color, style, and columnMode
          if (parsedColumn.header) parsedColumn.header.userData = columns[i];
          parsedColumns.push(parsedColumn);
        }

        this.statements[id] = Table(parsedColumns);

        // NOTE: quadratic algorithm; assuming you can't have that many table columns
        var self = this;
        var currentIds = this.statements[id].getAllIds();
        previousIds.forEach(function (id) {
          if (currentIds.indexOf(id) === -1) self.triggerRemoveGraph(id);
        });
      } else {
        this.statements[id] = Parser.parse(statement.latex);
      }

      this.statements[id].userData = statement; //Hold on to domain, color, etc.

      // Need to mark clean before marking dirty again because otherwise we'll
      // hit an early return and fail to mark new dependencies dirty.
      this.markClean(statement.id);
      this.markDirty(statement.id); // Mark any new dependencies as dirty
    };

    context.removeStatement = function(id){
      if(!this.statements.hasOwnProperty(id)) return;
      // Looks like it was already deleted.
      // This happens when a table is deleted, and then each column is deleted.
      var statement = this.statements[id];

      this.markDirty(id); //Mark dirty before deletion
      if (statement.isTable) {
        var self = this;
        statement.getAllIds().forEach(function (id) { self.triggerRemoveGraph(id); });
      } else {
        this.triggerRemoveGraph(id); //TODO - removes even if it wasn't graphed
      }

      delete this.statements[id];
    };

    context.invalidate = function(){
      for (var id in this.statements) {
        if (this.statements.hasOwnProperty(id)) this.markDirty(id);
      }
      this.currentStatus = {};
      // TODO too conservative.
      this.frame = Object.create(this.parent_frame);
      this.regressionFrame = Object.create(this.parent_frame);
    };

    context.markDirty = function(id){
      if (!this.statements[id]) return;
      if (this.unanalyzedIds[id]) return;

      this.unanalyzedIds[id] = true;
      this.unpublishedIds[id] = true;
      delete this.analysis[id];

      var statement = this.statements[id];

      var symbols = statement.getExports();
      for (var i = 0; i < symbols.length; i++) {
        this.markSymbolDirty(symbols[i]);
      }

      if (statement.isRegression) {
        // TODO too conservative. Problem with regressions is that we need to
        // mark their (recursive) dependencies dirty as well as their exports,
        // since they might export any of their recursive dependencies.
        //
        // Note, when this is fixed, don't forget to mark residualVariable dirty
        // too.
        this.invalidate();
      }

      this.cancelIntersectionStreaming(id);
    };

    context.markSymbolDirty = function (symbol) {
      delete this.frame[symbol];
      delete this.regressionFrame[symbol];
      for (var id in this.statements) {
        if (!this.statements.hasOwnProperty(id)) continue;
        if (this.statements[id].dependsOn(symbol)) this.markDirty(id);
        if (this.statements[id].exportsSymbol(symbol)) this.markDirty(id);
      }
    };

    context.markClean = function(id){
      delete this.unanalyzedIds[id];
    };

    context.getFrame = function(){
      this.updateAnalysis();
      return this.frame;
    };

    context.getAnalysis = function(){
      this.updateAnalysis();
      return this.analysis;
    };

    context.getStatus = function(id){
      this.updateAnalysis();
      if (!this.analysis[id]) return undefined;
      return this.analysis[id].status;
    };

    //Returns an object that mirrors the API of Formula
    context.getEvaluationState = function(id){
      this.updateAnalysis();
      if (!this.analysis[id]) return undefined;
      return this.analysis[id].evaluationState;
    };

    function exportErrors(dependencyOrder, frame) {
      var multiplyDefined = dependencyOrder.multiplyDefined;
      var cyclicallyDefined = dependencyOrder.cyclicallyDefined;

      var symbol;
      for (symbol in multiplyDefined) {
        if (!multiplyDefined.hasOwnProperty(symbol)) continue;
        frame[symbol] = ErrorMsg.multiplyDefined(symbol);
      }
      for (symbol in cyclicallyDefined) {
        if (!cyclicallyDefined.hasOwnProperty(symbol)) continue;
        frame[symbol] = ErrorMsg.cycle(cyclicallyDefined[symbol]);
      }
    }

    context._updateRegressions = function (dirtyStatements) {
      var frame = this.frame;
      var lastFrame = this.lastFrame;
      var regressionFrame = this.regressionFrame;

      var id;

      // In this pass, we are only interested in statements that dirty regressions
      // depend on.
      var roots = [];
      for (id in dirtyStatements) {
        if (!dirtyStatements.hasOwnProperty(id)) continue;
        if (dirtyStatements[id].isRegression) roots.push(id);
      }

      // Prefer to process regressions that already have a residualVariable first.
      var self = this;
      roots.sort(function (a, b) {
        var aHasResidual = self.statements[a].userData && self.statements[a].userData.residualVariable;
        var bHasResidual = self.statements[b].userData && self.statements[b].userData.residualVariable;

        if (aHasResidual && !bHasResidual) return -1;
        if (bHasResidual && !aHasResidual) return 1;
        return 0;
      });

      // Walk through statements in dependencyOrder populating the regression frame, and then
      // run the regressions.
      var dependencyOrder = findDependencyOrder(dirtyStatements, roots);
      exportErrors(dependencyOrder, regressionFrame);
      var resolved = dependencyOrder.resolved;
      // TODO this is needed for determining whether we can add a regression plot suggestion,
      // but it isn't a full "analysis" because its members don't have evaluation states.
      var regressionAnalysis = {};

      for (var i = 0; i < resolved.length; i++) {
        id = resolved[i];

        if (this.statements[id].isRegression) {
          // Also pass frame to allow regression to pick a residual variable
          this.analysis[id] = dirtyStatements[id].analyze(
            regressionFrame,
            frame,
            lastFrame,
            regressionAnalysis
          );
          this.analysis[id].exportTo(frame);
          delete dirtyStatements[id];
        } else {
          // TODO not clear if it is sound to just call getConcreteTree here, or if
          // we need to run more of analyze. Only expect to run into assignments,
          // function definitions, and tables/table columns here. Don't want to throw
          // tooManyVariable errors here like we normally would in analyze.
          //
          //  Definitely not working on tables right now because they don't implement
          //  getConcreteTree yet. They probably should.
          var concrete = dirtyStatements[id].tryGetConcreteTree(regressionFrame);
          dirtyStatements[id].exportTo(concrete, regressionFrame);
          regressionAnalysis[id] = {rawTree: dirtyStatements[id], concreteTree: concrete};
        }
      }
    };

    context.updateAnalysis = function(){
      var id;
      var dirtyStatements = {};
      for (id in this.unanalyzedIds) {
        if (this.unanalyzedIds.hasOwnProperty(id) && this.statements[id]) {
          dirtyStatements[id] = this.statements[id];
        }
      }

      // Note: mutates dirtyStatements to remove regressions
      this._updateRegressions(dirtyStatements);

      var analysis = this.analysis;
      var frame = this.frame;

      // _updateRegressions has already taken care of analyzing regressions and
      // exporting regressed parameters to the frame. Now analyze all other
      // statements.
      var dependencyOrder = findDependencyOrder(dirtyStatements);
      exportErrors(dependencyOrder, frame);
      var resolved = dependencyOrder.resolved;

      for (var i = 0; i < resolved.length; i++) {
        id = resolved[i];

        // Special handling when 'r' is in the frame. First, check if the statement
        // is graphable as a polar equation with r removed from the frame. If not,
        // use the full frame.
        if (frame.r) {
          var localFrame = Object.create(frame, {r: FreeVariable('r')});
          analysis[id] = this.statements[id].analyze(localFrame, analysis);
          if (analysis[id].getGraphMode() === GRAPHMODE.POLAR) {
            analysis[id].exportTo(frame);
            continue;
          }
        }

        //Pass in previous analysis to allow populating movable points
        analysis[id] = this.statements[id].analyze(frame, analysis);
        analysis[id].exportTo(frame, dependencyOrder);
      }

      this.unanalyzedIds = {};
      this.lastFrame = Object.create(this.parent_frame);
      for (var symbol in frame) {
        if (frame.hasOwnProperty(symbol)) this.lastFrame[symbol] = frame[symbol];
      }
    };

    //Below this point, these are shims for compatibility with existing tests
    //TODO - remove these and re-factor tests
    context.evaluateOnce = function(id){
      console.log("Deprecated console.evaluateOnce - this should not run in production code");
      return this.analysis[id].concreteTree.constantValue;
    };

    context.compile = function(id){
      console.log("Deprecated console.compile - this should not run in production code");
      var compiled = this.analysis[id].concreteTree.getCompiledFunctions();
      if(compiled.length === 1) return compiled[0];
      return compiled;
    };

    context.evalStrings = function(id){
      console.log("Deprecated console.evalStrings - this should not run in production code");
      return this.analysis[id].concreteTree.getEvalStrings();
    };
  });
});

define('worker/workercore',['require','math/context','math/functions'],function(require){
  var EvaluatorContext = require('math/context');
  var Functions = require('math/functions');

  return function(sendMessage){

    //Initialize environment
    var context = EvaluatorContext(); //TODO - pass in frame

    //Functions to send data back to main thread
    context.triggerGraphComputed = function(id, data) {
      Functions.dehydrateGraphData(data);
      sendMessage('graphComputed', {id:id, graphData:data});
    };

    context.triggerDidUpdateIntersections = function(id, intersections) {
      sendMessage('updateIntersections', {id:id, intersections:intersections});
    };

    context.triggerRender = function(){
      sendMessage('render');
    };

    context.triggerRenderSlowly = function(){
      sendMessage('renderSlowly');
    };

    context.triggerRemoveGraph = function(id){
      sendMessage('removeGraph', id);
    };

    context.triggerStatusChange = function(data){
      sendMessage('statusChange', data);
    };

    return {
      processChangeSet: function (changeSet) {
        context.processChangeSet(changeSet);

        sendMessage('processChangeSet', changeSet);
      }
    };

  };

});

/* jshint worker: true */
define('worker/worker',['require','worker/workercore','console'],function(require){
  var WorkerCore = require('worker/workercore');
  var connections = {};
  var console = require('console');
  console.log = function (m) { self.postMessage({log:JSON.stringify(m)}); }; //Override local console

  // Point of this is to closure in the current self object, in case someone rebinds
  // it later. This is a workaround for a bug in FireFox 33. Not much info on the
  // the internet about the bug yet--the only other place I've seen it mentioned is
  // this: http://www.reddit.com/r/Khan/comments/2e4cof/typeerror_self_getter_called_on_an_object_that/
  var _self = self;

  _self.window = _self;

  _self.onmessage = function(e){
    var connectionId = e.data && e.data.connectionId;
    if (connectionId) {
      var workerCore = connections[connectionId];
      if (!workerCore) {
        workerCore = WorkerCore(function (type, payload) {
          _self.postMessage({connectionId: connectionId, originalMessage: {type:type, payload:payload}});
        });
        connections[connectionId] = workerCore;
      }

      workerCore.processChangeSet(e.data.originalMessage);
    }
  };

  if (_self.loadMessageQueue) {
    _self.loadMessageQueue.forEach(function (e) { _self.onmessage(e); });
  }
});

/* jshint worker: true */
//Used for /embed/graphpaper and for /calculator

//Bootstrap if run standalone (for noconcat)
if (typeof requirejs === 'undefined'){
  importScripts('../vendor/underscore.js');
  importScripts('../vendor/require.js');
  importScripts('config.js');
}

// Queue messages until the onmessage handler becomes available.
self.loadMessageQueue = [];
self.onmessage = function (e) {
  self.loadMessageQueue.push(e);
};

requirejs(['worker/worker']);

define("toplevel/worker", function(){});
