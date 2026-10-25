// Metro configuration for this npm-workspace monorepo.
//
// The workspace root is four levels up (`tradevault/`), and the shared
// `@tradevault/core` package is hoisted/symlinked into the root `node_modules`.
// Metro only serves, watches and transforms files that live inside
// `projectRoot` or an explicit `watchFolders` entry, so the root has to be
// listed or `@tradevault/core` fails to resolve during a release bundle.
//
// This mirrors Expo's documented monorepo setup:
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Walk the parent folders so hoisted packages resolve the normal way.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
