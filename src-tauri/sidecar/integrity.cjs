#!/usr/bin/env node
'use strict';

// Flow Desktop — headless YouTube BotGuard / WAA poToken minter.
//
// Self-contained port of the verified reverse-engineered flow (see
// notes/reverse/{youtube_integrity_spec.md,vm_runner.cjs,extractor.py}). It runs
// Google's BotGuard VM inside a plain Node `vm` sandbox with a custom DOM mock —
// no Chromium, no jsdom — and mints a real, visitorData-bound poToken.
//
// Contract:
//   node integrity.cjs <visitorData>
// stdout: exactly one JSON object (the only thing written to stdout):
//   { "success": true,  "poToken": "...", "integrityToken": "...", "ttl": 43200, "visitorData": "..." }
//   { "success": false, "error": "<message>" }
// Diagnostics (when FLOW_INTEGRITY_DEBUG is set) go to stderr only, so stdout
// stays cleanly parseable by the Rust caller. Exit code 0 on success, 1 on error.

const vm = require('vm');

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
const API_KEY = 'AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw';
const CREATE_URL =
  'https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/Create';
const GENERATE_IT_URL =
  'https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/GenerateIT';
const SNAPSHOT_TIMEOUT_MS = 10000;

function diag(...args) {
  if (process.env.FLOW_INTEGRITY_DEBUG) console.error('[integrity]', ...args);
}
function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

// base64 (incl. url-safe) -> Uint8Array
function base64ToU8(base64) {
  let mod = base64;
  const urlChars = /[-_.]/g;
  const map = { '-': '+', '_': '/', '.': '=' };
  if (urlChars.test(base64)) {
    mod = base64.replace(urlChars, (m) => map[m]);
  }
  const raw = atob(mod);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

// Uint8Array -> base64 (url-safe, no padding stripping beyond +/ replacement)
function u8ToBase64(u8, urlSafe = false) {
  const result = btoa(String.fromCharCode(...u8));
  return urlSafe ? result.replace(/\+/g, '-').replace(/\//g, '_') : result;
}

// Stage 1: fetch the scrambled BotGuard challenge from Waa/Create.
async function fetchChallenge(visitorData) {
  const resp = await fetch(CREATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'X-Goog-Api-Key': API_KEY,
      'X-User-Agent': 'sap/waa/1',
    },
    body: JSON.stringify([REQUEST_KEY, visitorData]),
  });
  if (!resp.ok) throw new Error(`Waa/Create HTTP ${resp.status}`);
  return resp.json();
}

// Descramble: base64-decode response[1], add 97 to each byte (mod 256), parse
// the UTF-8 JSON array:
//   [messageId, wrappedScript, wrappedUrl, interpreterHash, program, globalName, , expsBlob]
function descramble(raw) {
  if (!Array.isArray(raw) || typeof raw[1] !== 'string') {
    throw new Error('unexpected Waa/Create challenge structure');
  }
  let scrambled = raw[1];
  const pad = scrambled.length % 4;
  if (pad) scrambled += '='.repeat(4 - pad);
  const buf = base64ToU8(scrambled);
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = (buf[i] + 97) & 0xff;
  return JSON.parse(new TextDecoder().decode(out));
}

// Build the headless DOM mock the BotGuard VM probes for browser telemetry.
// Without it the VM never registers a minter (webPoSignalOutput stays empty).
// Ported verbatim from the verified vm_runner.cjs; logging stripped.
function buildSandbox() {
  const nodeConstants = {
    ELEMENT_NODE: 1, ATTRIBUTE_NODE: 2, TEXT_NODE: 3, CDATA_SECTION_NODE: 4,
    ENTITY_REFERENCE_NODE: 5, ENTITY_NODE: 6, PROCESSING_INSTRUCTION_NODE: 7,
    COMMENT_NODE: 8, DOCUMENT_NODE: 9, DOCUMENT_TYPE_NODE: 10,
    DOCUMENT_FRAGMENT_NODE: 11, NOTATION_NODE: 12,
    DOCUMENT_POSITION_DISCONNECTED: 1, DOCUMENT_POSITION_PRECEDING: 2,
    DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_CONTAINS: 8,
    DOCUMENT_POSITION_CONTAINED_BY: 16,
    DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32,
  };

  // Proxy that, on a missing prop, falls back to "" for styles, then to the
  // sandbox / host global — mirrors how a real window resolves unknown lookups.
  function fallbackProxy(obj, isStyle = false) {
    return new Proxy(obj, {
      get(target, prop, receiver) {
        let val = Reflect.get(target, prop, receiver);
        if (val === undefined) {
          if (isStyle && typeof prop === 'string') return '';
          if (sandbox && prop in sandbox) val = sandbox[prop];
          else if (prop in globalThis) val = globalThis[prop];
        }
        return val;
      },
      set(target, prop, value, receiver) {
        return Reflect.set(target, prop, value, receiver);
      },
    });
  }

  class Node {
    constructor(nodeType) {
      Object.assign(this, nodeConstants);
      this.nodeType = nodeType;
      this.ownerDocument = null;
      this.parentNode = null;
      this.children = [];
      this.childNodes = [];
      this.textContent = '';
    }
    insertBefore(n) { return n; }
    appendChild(c) { return c; }
    removeChild(c) { return c; }
    replaceChild(n) { return n; }
    compareDocumentPosition() { return 0; }
    contains() { return false; }
    lookupPrefix() { return null; }
    lookupNamespaceURI() { return null; }
    isDefaultNamespace() { return false; }
    normalize() {}
    cloneNode() {
      const cloned = new this.constructor(this.tagName || this.nodeName || '');
      Object.assign(cloned, this);
      return fallbackProxy(cloned);
    }
  }

  class Element extends Node {
    constructor(tag) {
      super(1);
      this.ownerDocument = rawDocument;
      this.tagName = tag.toUpperCase();
      this.nodeName = tag.toUpperCase();
      this.id = '';
      this.className = '';
      this.name = '';
      this.attributes = {};
      this.scrollLeft = 0; this.scrollTop = 0;
      this.scrollWidth = 0; this.scrollHeight = 0;
      this.clientLeft = 0; this.clientTop = 0;
      this.dir = 'ltr';
      this.clientWidth = 0; this.clientHeight = 0;
    }
    setAttribute() {}
    removeAttribute() {}
    setAttributeNode(a) { return a; }
    getAttribute() { return null; }
    hasAttribute() { return false; }
    hasAttributeNS() { return false; }
    getAttributeNS() { return null; }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
    scroll() {} scrollTo() {} scrollBy() {}
    animate() {
      return {
        cancel() {}, play() {}, pause() {}, finish() {},
        addEventListener() {}, removeEventListener() {},
      };
    }
  }

  class HTMLElement extends Element {
    constructor(tag) {
      super(tag);
      this.style = fallbackProxy({}, true);
      this.offsetLeft = 0; this.offsetTop = 0;
      this.offsetWidth = 0; this.offsetHeight = 0;
    }
    blur() {} focus() {}
    checkVisibility() { return true; }
  }

  class HTMLDivElement extends HTMLElement { constructor() { super('div'); } }
  class HTMLImageElement extends HTMLElement {
    constructor() {
      super('img');
      this.src = ''; this.isMap = false; this.width = 0; this.height = 0;
      this.fetchPriority = 'auto'; this.referrerPolicy = '';
    }
  }
  class HTMLIFrameElement extends HTMLElement { constructor() { super('iframe'); } }
  class HTMLBodyElement extends HTMLElement {}
  class HTMLInputElement extends HTMLElement {}
  class CSSRule {}
  class PictureInPictureWindow {}
  class XRSession {}
  class TrackEvent {}

  class Document extends Node {
    constructor() {
      super(9);
      this.readyState = 'complete';
      this.referrer = 'https://www.youtube.com/';
      this.cookie = '';
    }
    createEvent(type) {
      const ev = {
        type, target: null, currentTarget: null, eventPhase: 0,
        bubbles: false, cancelable: false, defaultPrevented: false,
        composed: false, timeStamp: Date.now(),
        shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
        clientX: 0, clientY: 0, screenX: 0, screenY: 0, button: 0,
        stopPropagation() {}, preventDefault() {},
        initEvent(name, bubbles, cancelable) {
          this.type = name; this.bubbles = bubbles; this.cancelable = cancelable;
        },
        initUIEvent(name, bubbles, cancelable, view, detail) {
          this.type = name; this.bubbles = bubbles; this.cancelable = cancelable;
          this.view = view; this.detail = detail;
        },
      };
      return fallbackProxy(ev);
    }
    createElement(tag) {
      let el;
      if (tag === 'div') el = new HTMLDivElement();
      else if (tag === 'img') el = new HTMLImageElement();
      else if (tag === 'iframe') {
        el = new HTMLIFrameElement();
        const iframeWindowMock = {
          document: rawDocument, location: rawLocation, navigator: rawNavigator,
          performance: sandbox.performance,
          setTimeout: sandbox.setTimeout, clearTimeout: sandbox.clearTimeout,
          setInterval: sandbox.setInterval, clearInterval: sandbox.clearInterval,
          console: sandbox.console,
          TextEncoder, TextDecoder, atob, btoa, fetch,
        };
        iframeWindowMock.window = iframeWindowMock;
        iframeWindowMock.self = iframeWindowMock;
        iframeWindowMock.global = iframeWindowMock;
        el.contentWindow = fallbackProxy(iframeWindowMock);
        el.contentDocument = rawDocument;
      } else el = new HTMLElement(tag);
      return fallbackProxy(el);
    }
    getElementsByTagName() { return []; }
  }

  const rawNavigator = {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    webdriver: false,
    plugins: [],
    languages: ['en-US', 'en'],
    platform: 'Win32',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    onLine: true,
  };
  rawNavigator.userAgentData = {
    brands: [
      { brand: 'Chromium', version: '120' },
      { brand: 'Not?A_Brand', version: '24' },
    ],
    mobile: false,
    platform: 'Windows',
    getHighEntropyValues: () => Promise.resolve({}),
  };

  const rawLocation = {
    href: 'https://www.youtube.com/',
    hostname: 'www.youtube.com',
    origin: 'https://www.youtube.com',
    protocol: 'https:',
    host: 'www.youtube.com',
    pathname: '/',
    search: '',
    hash: '',
  };
  const rawScreen = {
    width: 1920, height: 1080, availWidth: 1920, availHeight: 1040,
    colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary', angle: 0 },
  };
  const rawDocument = new Document();
  rawDocument.body = new HTMLElement('body');
  rawDocument.documentElement = new HTMLElement('html');

  const sandbox = {
    window: null, self: null, global: null, top: null, parent: null,
    document: fallbackProxy(rawDocument),
    navigator: fallbackProxy(rawNavigator),
    location: fallbackProxy(rawLocation),
    screen: rawScreen,
    origin: 'https://www.youtube.com',
    performance: { now: () => Date.now(), timeOrigin: Date.now(), timing: {}, getEntriesByType: () => [] },
    // The BotGuard minter signs with WebCrypto; without `crypto` on the sandbox
    // the VM runs the snapshot but never registers the webpo minter.
    crypto: globalThis.crypto,
    setTimeout, clearTimeout, setInterval, clearInterval,
    queueMicrotask,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: () => ({
      matches: false, media: '', onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {},
      removeEventListener() {}, dispatchEvent() { return false; },
    }),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    console: { log() {}, error() {}, warn() {}, info() {}, debug() {} },
    TextEncoder, TextDecoder, atob, btoa, fetch, URL, URLSearchParams,
    chrome: { app: {}, runtime: {}, loadTimes() {}, csi() {} },
    Node, Element, HTMLElement, HTMLDivElement, HTMLImageElement,
    HTMLIFrameElement, HTMLBodyElement, HTMLInputElement,
    CSSRule, PictureInPictureWindow, XRSession, TrackEvent,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.global = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;
  return sandbox;
}

// One full attestation attempt against a freshly fetched challenge.
async function attemptMint(visitorData) {
  const rawChallenge = await fetchChallenge(visitorData);
  const challenge = descramble(rawChallenge);
  const wrappedScript = challenge[1];
  const program = challenge[4];
  const globalName = challenge[5];

  let interpreterJs = null;
  if (Array.isArray(wrappedScript)) {
    for (const v of wrappedScript) {
      if (
        typeof v === 'string' &&
        (v.includes('function') || v.includes('window') || v.includes('eval'))
      ) {
        interpreterJs = v;
        break;
      }
    }
  }
  if (!interpreterJs) throw new Error('interpreter JS not found in challenge[1]');
  diag(`globalName=${globalName} program=${program?.length}B`);

  const context = vm.createContext(buildSandbox());
  vm.runInContext(interpreterJs, context);

  const vmInstance = context[globalName];
  if (!vmInstance || typeof vmInstance.a !== 'function') {
    throw new Error(`VM init function 'a' not found under '${globalName}'`);
  }

  const { asyncSnapshotFunction } = await new Promise((resolve) => {
    vmInstance.a(
      program,
      (asyncSnapshot, shutdown, passEvent, checkCamera) =>
        resolve({ asyncSnapshotFunction: asyncSnapshot, shutdown, passEvent, checkCamera }),
      true,
      undefined,
      () => {},
      [[], []],
    );
  });
  if (!asyncSnapshotFunction) throw new Error('asyncSnapshotFunction not found');

  const webPoSignalOutput = [];
  const botguardResponse = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('VM snapshot timed out')), SNAPSHOT_TIMEOUT_MS);
    asyncSnapshotFunction(
      (res) => { clearTimeout(t); resolve(res); },
      [undefined, undefined, webPoSignalOutput, true],
    );
  });
  diag(`snapshot ${botguardResponse.length} chars`);

  const itResp = await fetch(GENERATE_IT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'X-Goog-Api-Key': API_KEY,
      'X-User-Agent': 'grpc-web-javascript/0.1',
    },
    body: JSON.stringify([REQUEST_KEY, botguardResponse]),
  });
  if (!itResp.ok) throw new Error(`Waa/GenerateIT HTTP ${itResp.status}`);
  const [integrityToken, estimatedTtlSecs] = await itResp.json();
  diag(`integrityToken ttl=${estimatedTtlSecs}s`);

  const getMinter = webPoSignalOutput[0];
  if (!getMinter) {
    throw new Error(`minter not registered (webPoSignalOutput len=${webPoSignalOutput.length})`);
  }
  const mintCallback = await getMinter(base64ToU8(integrityToken));
  if (typeof mintCallback !== 'function') {
    throw new Error('minter did not return a mint callback');
  }
  const rawPoToken = await mintCallback(new TextEncoder().encode(visitorData));
  if (!rawPoToken || rawPoToken.constructor?.name !== 'Uint8Array') {
    throw new Error('mint callback did not return a Uint8Array');
  }

  return {
    success: true,
    poToken: u8ToBase64(rawPoToken, true),
    integrityToken,
    ttl: estimatedTtlSecs,
    visitorData,
  };
}

// Google randomly serves several challenge-program variants; some probe browser
// telemetry our headless mock can't fully reproduce, so the webpo minter isn't
// always registered. Each attempt fetches an independent fresh challenge, so a
// bounded retry reliably lands on a variant the mock satisfies (each ~1s).
const MAX_ATTEMPTS = 5;
async function mint(visitorData) {
  let lastError = 'unknown';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptMint(visitorData);
    } catch (err) {
      lastError = err && err.message ? err.message : String(err);
      diag(`attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}`);
    }
  }
  throw new Error(`all ${MAX_ATTEMPTS} mint attempts failed (last: ${lastError})`);
}

(async () => {
  try {
    const visitorData = process.argv[2];
    if (!visitorData) {
      emit({ success: false, error: 'missing visitorData argument' });
      process.exit(1);
    }
    emit(await mint(visitorData));
    process.exit(0);
  } catch (err) {
    emit({ success: false, error: err && err.message ? err.message : String(err) });
    process.exit(1);
  }
})();
