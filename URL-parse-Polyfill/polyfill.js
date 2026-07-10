(function () {
  "use strict";

  // 基础垫片：直接打在真实的 window 全局对象上
  if (typeof URL !== "undefined") {
    if (!URL.canParse) {
      URL.canParse = function (url, base) {
        try {
          new URL(url, base);
          return true;
        } catch (e) {
          return false;
        }
      };
    }
    if (!URL.parse) {
      URL.parse = function (url, base) {
        try {
          return new URL(url, base);
        } catch (e) {
          return null;
        }
      };
    }
  }

  // 劫持 Web Worker (处理多线程中的报错，azure portal 会用到)
  function hijackWorker(workerType) {
    if (!window[workerType] || window[workerType].__hijacked) return;

    const OriginalWorker = window[workerType];
    const ProxyWorker = new Proxy(OriginalWorker, {
      construct(target, args) {
        try {
          const scriptURL = args[0];
          if (typeof scriptURL === "string") {
            const absoluteUrl = new URL(scriptURL, location.href).href;

            // 构造 Worker 内部的垫片
            const workerPolyfillStr = `
    if (typeof URL !== 'undefined') {
        if (!URL.parse) URL.parse = function(url, base) { try { return new URL(url, base); } catch (e) { return null; } };
        if (!URL.canParse) URL.canParse = function(url, base) { try { new URL(url, base); return true; } catch (e) { return false; } };
    }
    importScripts('${absoluteUrl}');
`;
            const blob = new Blob([workerPolyfillStr], { type: "application/javascript" });
            args[0] = URL.createObjectURL(blob);
          }
        } catch (e) {
          // 静默失败
        }
        return new target(...args);
      },
    });

    ProxyWorker.__hijacked = true;
    window[workerType] = ProxyWorker;
  }

  // 劫持常规 Worker 和 SharedWorker
  hijackWorker("Worker");
  hijackWorker("SharedWorker");
})();
