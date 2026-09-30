//=====================================================================
// Share links.
//
// The whole snippet rides in the URL fragment. A fragment is never sent to a
// server, so this needs no backend, works offline, and nothing is stored
// anywhere on the way - but it also means anyone holding the link can read the
// code, which the toolbar says out loud when it copies one.
//
// The format is plain deflate-raw in base64url, so it is readable by anything,
// not just by this page.
//=====================================================================

const SHARE_PREFIX = '#s='
const SHARE_VERSION = 1

// past this the link still works, but chat apps and mail clients start
// truncating it, and a truncated link is worse than no link
const SHARE_WARN_BYTES = 8000

const shareSupported = () => typeof CompressionStream === 'function'

// btoa wants a binary string, and String.fromCharCode(...bytes) overflows the
// call stack somewhere around a hundred thousand arguments
const bytesToBase64Url = (bytes) => {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const base64UrlToBytes = (text) => {
  const standard = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Only what reproduces the snippet: the three files, the language, and the two
// preview toggles. The tab, split and ratio are how someone likes to sit at
// their own editor, not part of what is being shared.
const encodeShare = async (record) => {
  const payload = {
    v: SHARE_VERSION,
    name: record.name,
    code: record.code,
    css: record.css,
    js: record.js,
    lang: record.settings.lang,
    cssOn: Boolean(record.settings.css),
    jsOn: Boolean(record.settings.js),
  }
  const stream = new Blob([JSON.stringify(payload)]).stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  return bytesToBase64Url(bytes)
}

const decodeShare = async (fragment) => {
  const stream = new Blob([base64UrlToBytes(fragment)]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  const payload = JSON.parse(await new Response(stream).text())
  // the version is in the payload so a future format can be turned away with
  // something better than a parse error
  if (!payload || payload.v !== SHARE_VERSION) {
    throw new Error('it was made by a different version of QuickCode')
  }
  return payload
}

const shareUrl = (fragment) =>
  location.origin + location.pathname + location.search + SHARE_PREFIX + fragment

const sharedFragment = () =>
  location.hash.indexOf(SHARE_PREFIX) === 0 ? location.hash.slice(SHARE_PREFIX.length) : ''
