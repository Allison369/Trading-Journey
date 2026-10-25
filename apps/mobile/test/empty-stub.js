/**
 * An empty stand-in for native Expo modules.
 *
 * The pure modules under test import these transitively, but must not actually
 * call them. Anything a test genuinely needs would be a sign the module is not
 * pure, so this stays empty on purpose.
 */

module.exports = {};
