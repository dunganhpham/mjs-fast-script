#!/usr/bin/env node

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const generators = {
  // ─── DevOps & Infrastructure ───
  dockerfile: "make-dockerfile.mjs",
  "github-actions": "make-github-actions.mjs",
  "gitlab-ci": "make-gitlab-ci.mjs",
  k8s: "make-k8s.mjs",
  helm: "make-helm.mjs",
  jenkins: "make-jenkinsfile.mjs",
  nginx: "make-nginx.mjs",
  terraform: "make-terraform.mjs",
  pm2: "make-pm2.mjs",
  monitoring: "make-monitoring.mjs",
  elasticsearch: "make-elasticsearch.mjs",

  // ─── Code Quality & DX ───
  eslint: "make-eslint-prettier.mjs",
  husky: "make-husky.mjs",
  typescript: "make-typescript.mjs",
  testing: "make-testing.mjs",
  vscode: "make-vscode.mjs",

  // ─── Project Config ───
  git: "make-git.mjs",
  env: "make-env.mjs",
  security: "make-security.mjs",
  "api-docs": "make-api-docs.mjs",
  makefile: "make-makefile.mjs",
};

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
DevOps Config Generator
=======================

Usage:
  node index.mjs [generator...]              Run specific generator(s)
  node index.mjs [generator...] --path DIR   Generate to target directory
  node index.mjs --all                       Run all generators
  node index.mjs --all --path DIR            Run all generators to target directory
  node index.mjs --list                      List available generators
  node index.mjs --help                      Show this help

Available generators:
${Object.entries(generators)
  .map(([name, file]) => `  ${name.padEnd(18)} → ${file}`)
  .join("\n")}

Examples:
  node index.mjs dockerfile k8s
  node index.mjs github-actions helm
  node index.mjs elasticsearch --path ./my-project
  node index.mjs --all --path ./my-project
`);
}

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (args.includes("--list")) {
  console.log("Available generators:");
  for (const [name, file] of Object.entries(generators)) {
    console.log(`  ${name.padEnd(18)} → ${file}`);
  }
  process.exit(0);
}

// ─── Parse --path argument ───
const pathIdx = args.indexOf("--path");
const targetPath = pathIdx !== -1 ? args[pathIdx + 1] : null;

const toRun = args.includes("--all")
  ? Object.keys(generators)
  : args.filter((a) => !a.startsWith("-") && a !== targetPath);

let hasError = false;

for (const name of toRun) {
  if (!generators[name]) {
    console.error(`❌ Unknown generator: ${name}`);
    hasError = true;
    continue;
  }

  const script = resolve(__dirname, generators[name]);
  const pathArg = targetPath ? ` "${resolve(targetPath)}"` : "";
  console.log(`\n━━━ Running: ${name}${targetPath ? ` → ${targetPath}` : ""} ━━━`);

  try {
    execSync(`node "${script}"${pathArg}`, { stdio: "inherit" });
  } catch {
    console.error(`❌ Failed: ${name}`);
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
}
