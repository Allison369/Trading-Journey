/**
 * A minimal react-native stub for the pure-module tests.
 *
 * Only the handful of exports the tested modules touch are provided. If a test
 * reaches for something that is not here, that is a signal the module under
 * test is not pure and should not be in this suite — which is exactly the
 * behaviour we want.
 */

module.exports = {
  Platform: { OS: "android", select: (obj) => obj.android ?? obj.default },
  StyleSheet: { create: (styles) => styles },
};
