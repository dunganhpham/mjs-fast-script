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
  node index.mjs [generator...]   Run specific generator(s)
  node index.mjs --all            Run all generators
  node index.mjs --list           List available generators
  node index.mjs --help           Show this help

Available generators:
${Object.entries(generators)
  .map(([name, file]) => `  ${name.padEnd(18)} → ${file}`)
  .join("\n")}

Examples:
  node index.mjs dockerfile k8s
  node index.mjs github-actions helm
  node index.mjs --all
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

const toRun = args.includes("--all")
  ? Object.keys(generators)
  : args.filter((a) => !a.startsWith("-"));

let hasError = false;

for (const name of toRun) {
  if (!generators[name]) {
    console.error(`❌ Unknown generator: ${name}`);
    hasError = true;
    continue;
  }

  const script = resolve(__dirname, generators[name]);
  console.log(`\n━━━ Running: ${name} ━━━`);

  try {
    execSync(`node "${script}"`, { stdio: "inherit" });
  } catch {
    console.error(`❌ Failed: ${name}`);
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
}
