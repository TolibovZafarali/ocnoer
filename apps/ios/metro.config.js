const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

function resolveWorkspacePackage(packageName) {
  return path.dirname(
    require.resolve(`${packageName}/package.json`, {
      paths: [projectRoot, workspaceRoot]
    })
  );
}

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "expo-image": resolveWorkspacePackage("expo-image")
};

module.exports = config;
