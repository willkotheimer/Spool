/**
 * The compiled addon, loaded from wherever the build put it.
 *
 * This file is deliberately tiny: everything above it is TypeScript in `src/main/clipboard/`, and
 * everything below it is C++. The addon is N-API, so it is ABI-stable across Node and Electron
 * versions rather than needing a rebuild for each (PLAN.md 6, "the native-module tax").
 */
module.exports = require('./build/Release/spool_clipboard.node')
