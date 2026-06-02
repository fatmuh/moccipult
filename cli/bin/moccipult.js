#!/usr/bin/env node

/**
 * moccipult — Self-hosted Shorebird Patch CLI
 * 
 * Cross-platform CLI tool (Windows, Linux, macOS)
 * untuk manage apps, releases, dan patches di patch server lo sendiri.
 * 
 * Usage:
 *   moccipult config --server http://localhost:3001
 *   moccipult apps create --name "My App" --package com.example.app
 *   moccipult releases create --app <APP_ID> --version 1.0.0
 *   moccipult patches upload --release <RELEASE_ID> --file patch.bin
 *   moccipult patches check --app <APP_ID> --version 1.0.0
 */

const { Command } = require("commander");
const chalk = require("chalk");
const ora = require("ora");
const Conf = require("conf");
const inquirer = require("inquirer");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const FormData = require("form-data");
const fetch = require("node-fetch");

// ─── Config Store ───────────────────────────────────────────────────────────
const config = new Conf({
  projectName: "moccipult",
  defaults: {
    server: "http://localhost:3001",
  },
});

function getServer() {
  return config.get("server").replace(/\/+$/, "");
}

// ─── API Helper ─────────────────────────────────────────────────────────────
async function api(method, endpoint, body = null, isFile = false) {
  const url = `${getServer()}${endpoint}`;
  const opts = { method, headers: {} };

  if (isFile && body) {
    opts.body = body;
    opts.headers = body.getHeaders();
  } else if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const text = await res.text();

  try {
    const data = JSON.parse(text);
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  } catch {
    throw new Error(`Server error: ${res.status} - ${text.substring(0, 200)}`);
  }
}

// ─── Brand Banner ───────────────────────────────────────────────────────────
const BANNER = `
    __  _______  ____________________  __  ____  ______
   /  |/  / __ \/ ____/ ____/  _/ __ \/ / / / / /_  __/
  / /|_/ / / / / /   / /    / // /_/ / / / / /   / /
 / /  / / /_/ / /___/ /____/ // ____/ /_/ / /___/ /
/_/  /_/\____/\____/\____/___/_/    \____/_____/_/
`;

// ─── CLI Program ────────────────────────────────────────────────────────────
const program = new Command();

program
  .name("moccipult")
  .description("Moccipult — Self-hosted code push for Flutter apps")
  .version("1.0.0");

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const configCmd = program.command("config").description("Manage CLI configuration");

configCmd
  .command("set")
  .description("Set a config value")
  .argument("<key>", "Config key (server)")
  .argument("<value>", "Config value")
  .action((key, value) => {
    config.set(key, value);
    console.log(chalk.green("✅"), `Config set: ${chalk.cyan(key)} = ${chalk.yellow(value)}`);
  });

configCmd
  .command("get")
  .description("Get a config value")
  .argument("<key>", "Config key")
  .action((key) => {
    const val = config.get(key);
    if (val === undefined) {
      console.log(chalk.red("❌"), `Key "${key}" not found`);
    } else {
      console.log(`${chalk.cyan(key)} = ${chalk.yellow(val)}`);
    }
  });

configCmd
  .command("show")
  .description("Show all config")
  .action(() => {
    console.log(chalk.bold("📋 Current Configuration:"));
    console.log(chalk.dim("─".repeat(40)));
    for (const [key, value] of Object.entries(config.store)) {
      console.log(`  ${chalk.cyan(key.padEnd(15))} ${chalk.yellow(value)}`);
    }
    console.log(chalk.dim("─".repeat(40)));
    console.log(chalk.dim(`Config file: ${config.path}`));
  });

configCmd
  .command("server")
  .description("Quick set server URL")
  .argument("<url>", "Server URL")
  .action((url) => {
    config.set("server", url.replace(/\/+$/, ""));
    console.log(chalk.green("✅"), `Server set to ${chalk.yellow(getServer())}`);
  });

// ─── APPS ───────────────────────────────────────────────────────────────────
const appsCmd = program.command("apps").description("Manage apps");

appsCmd
  .command("create")
  .description("Register a new app")
  .option("-n, --name <name>", "App name")
  .option("-p, --package <package>", "Package name (e.g. com.example.app)")
  .option("--platform <platform>", "Platform (android/ios)", "android")
  .action(async (opts) => {
    const spinner = ora("Creating app...").start();
    try {
      if (!opts.name) {
        const answers = await inquirer.prompt([
          { type: "input", name: "name", message: "App name:" },
          { type: "input", name: "package", message: "Package name (e.g. com.example.app):" },
        ]);
        opts.name = answers.name;
        opts.package = opts.package || answers.package;
      }

      const result = await api("POST", "/api/v1/apps", {
        name: opts.name,
        package_name: opts.package,
        platform: opts.platform,
      });

      spinner.succeed(chalk.green("App created!"));
      console.log();
      console.log(chalk.bold("  App Details:"));
      console.log(chalk.dim("  ─────────────────────────────────"));
      console.log(`  ID:         ${chalk.cyan(result.app.id)}`);
      console.log(`  Name:       ${chalk.white(result.app.name)}`);
      console.log(`  Package:    ${chalk.white(result.app.package_name || "-")}`);
      console.log(`  Platform:   ${chalk.white(result.app.platform)}`);
      console.log();
      console.log(chalk.yellow(`  💡 Save this App ID: ${result.app.id}`));
    } catch (err) {
      spinner.fail(chalk.red("Failed to create app"));
      console.error(chalk.red(err.message));
    }
  });

appsCmd
  .command("list")
  .description("List all apps")
  .action(async () => {
    const spinner = ora("Fetching apps...").start();
    try {
      const result = await api("GET", "/api/v1/apps");
      spinner.succeed(`Found ${result.apps.length} app(s)`);
      console.log();

      if (result.apps.length === 0) {
        console.log(chalk.dim("  No apps registered yet."));
        console.log(chalk.dim("  Run: moccipult apps create"));
        return;
      }

      console.log(chalk.bold("  Apps:"));
      console.log(chalk.dim("  ────────────────────────────────────────────────────────"));
      for (const app of result.apps) {
        console.log(`  ${chalk.cyan(app.id.substring(0, 8))}...  ${chalk.white(app.name.padEnd(25))}  ${chalk.gray(app.platform.padEnd(10))}  ${chalk.dim(app.created_at)}`);
      }
      console.log(chalk.dim("  ────────────────────────────────────────────────────────"));
    } catch (err) {
      spinner.fail(chalk.red("Failed to list apps"));
      console.error(chalk.red(err.message));
    }
  });

// ─── RELEASES ───────────────────────────────────────────────────────────────
const releasesCmd = program.command("releases").description("Manage releases");

releasesCmd
  .command("create")
  .description("Create a new release")
  .option("-a, --app <appId>", "App ID")
  .option("-v, --version <version>", "Version (e.g. 1.0.0)")
  .option("--platform <platform>", "Platform (android/ios)", "android")
  .option("--channel <channel>", "Channel (stable/beta)", "stable")
  .action(async (opts) => {
    const spinner = ora("Creating release...").start();
    try {
      if (!opts.app || !opts.version) {
        const answers = await inquirer.prompt([
          { type: "input", name: "app", message: "App ID:", default: opts.app },
          { type: "input", name: "version", message: "Version:", default: opts.version },
        ]);
        opts.app = answers.app;
        opts.version = answers.version;
      }

      const result = await api("POST", "/api/v1/releases", {
        app_id: opts.app,
        version: opts.version,
        platform: opts.platform,
        channel: opts.channel,
      });

      spinner.succeed(chalk.green("Release created!"));
      console.log();
      console.log(chalk.bold("  Release Details:"));
      console.log(chalk.dim("  ─────────────────────────────────"));
      console.log(`  ID:         ${chalk.cyan(result.release.id)}`);
      console.log(`  Version:    ${chalk.white(result.release.version)}`);
      console.log(`  Platform:   ${chalk.white(result.release.platform)}`);
      console.log(`  Channel:    ${chalk.white(result.release.channel)}`);
      console.log();
      console.log(chalk.yellow(`  💡 Save this Release ID: ${result.release.id}`));
    } catch (err) {
      spinner.fail(chalk.red("Failed to create release"));
      console.error(chalk.red(err.message));
    }
  });

releasesCmd
  .command("list")
  .description("List releases for an app")
  .option("-a, --app <appId>", "App ID")
  .action(async (opts) => {
    const spinner = ora("Fetching releases...").start();
    try {
      const appId = opts.app;
      if (!appId) {
        spinner.fail("App ID required. Use: -a <APP_ID>");
        return;
      }

      const result = await api("GET", `/api/v1/releases?app_id=${appId}`);
      spinner.succeed(`Found ${result.releases.length} release(s)`);
      console.log();

      if (result.releases.length === 0) {
        console.log(chalk.dim("  No releases yet."));
        return;
      }

      console.log(chalk.bold("  Releases:"));
      console.log(chalk.dim("  ────────────────────────────────────────────────────────────────"));
      for (const rel of result.releases) {
        console.log(`  ${chalk.cyan(rel.id.substring(0, 8))}...  v${chalk.white(rel.version.padEnd(10))}  ${chalk.gray(rel.platform.padEnd(10))}  ${chalk.gray(rel.channel.padEnd(10))}  ${chalk.dim(rel.created_at)}`);
      }
      console.log(chalk.dim("  ────────────────────────────────────────────────────────────────"));
    } catch (err) {
      spinner.fail(chalk.red("Failed to list releases"));
      console.error(chalk.red(err.message));
    }
  });

// ─── PATCHES ────────────────────────────────────────────────────────────────
const patchesCmd = program.command("patches").description("Manage patches");

patchesCmd
  .command("upload")
  .description("Upload a patch")
  .option("-r, --release <releaseId>", "Release ID")
  .option("-f, --file <filePath>", "Patch file path")
  .action(async (opts) => {
    const spinner = ora("Uploading patch...").start();
    try {
      if (!opts.release || !opts.file) {
        const answers = await inquirer.prompt([
          { type: "input", name: "release", message: "Release ID:", default: opts.release },
          { type: "input", name: "file", message: "Patch file path:", default: opts.file },
        ]);
        opts.release = answers.release;
        opts.file = answers.file;
      }

      const filePath = path.resolve(opts.file);
      if (!fs.existsSync(filePath)) {
        spinner.fail(chalk.red(`File not found: ${filePath}`));
        return;
      }

      const fileSize = fs.statSync(filePath).size;
      spinner.text = `Uploading patch (${(fileSize / 1024).toFixed(1)} KB)...`;

      const form = new FormData();
      form.append("file", fs.createReadStream(filePath));
      form.append("release_id", opts.release);

      const result = await api("POST", "/api/v1/patches/upload", form, true);

      spinner.succeed(chalk.green("Patch uploaded!"));
      console.log();
      console.log(chalk.bold("  Patch Details:"));
      console.log(chalk.dim("  ─────────────────────────────────"));
      console.log(`  ID:           ${chalk.cyan(result.patch.id)}`);
      console.log(`  Patch Number: ${chalk.green.bold("#" + result.patch.patch_number)}`);
      console.log(`  File Size:    ${chalk.white((result.patch.file_size / 1024).toFixed(1) + " KB")}`);
      console.log(`  File Hash:    ${chalk.gray(result.patch.file_hash.substring(0, 24) + "...")}`);
      console.log(`  Download URL: ${chalk.blue(result.patch.download_url)}`);
      console.log();
      console.log(chalk.green("  ✅ Patch is now live! Users will receive it on next app launch."));
    } catch (err) {
      spinner.fail(chalk.red("Failed to upload patch"));
      console.error(chalk.red(err.message));
    }
  });

patchesCmd
  .command("check")
  .description("Check for available patches")
  .option("-a, --app <appId>", "App ID")
  .option("-v, --version <version>", "App version")
  .option("--patch-number <number>", "Current patch number", "0")
  .option("--platform <platform>", "Platform", "android")
  .option("--channel <channel>", "Channel", "stable")
  .action(async (opts) => {
    const spinner = ora("Checking for patches...").start();
    try {
      if (!opts.app || !opts.version) {
        const answers = await inquirer.prompt([
          { type: "input", name: "app", message: "App ID:", default: opts.app },
          { type: "input", name: "version", message: "App version:", default: opts.version },
        ]);
        opts.app = answers.app;
        opts.version = answers.version;
      }

      const result = await api("POST", "/api/v1/patches/check", {
        app_id: opts.app,
        version: opts.version,
        current_patch_number: parseInt(opts.patchNumber),
        platform: opts.platform,
        channel: opts.channel,
      });

      if (result.patch_available) {
        spinner.succeed(chalk.green("Patch available!"));
        console.log();
        console.log(chalk.bold("  Patch Details:"));
        console.log(chalk.dim("  ─────────────────────────────────"));
        console.log(`  Patch Number: ${chalk.green.bold("#" + result.patch.patch_number)}`);
        console.log(`  Download URL: ${chalk.blue(result.patch.download_url)}`);
        console.log(`  File Size:    ${chalk.white(result.patch.file_size + " bytes")}`);
        console.log(`  File Hash:    ${chalk.gray(result.patch.file_hash.substring(0, 24) + "...")}`);
      } else {
        spinner.info(chalk.yellow("No patches available"));
        console.log(chalk.dim(`  ${result.message || "Already up to date"}`));
      }
    } catch (err) {
      spinner.fail(chalk.red("Failed to check patches"));
      console.error(chalk.red(err.message));
    }
  });

patchesCmd
  .command("list")
  .description("List patches for a release")
  .option("-r, --release <releaseId>", "Release ID")
  .action(async (opts) => {
    const spinner = ora("Fetching patches...").start();
    try {
      if (!opts.release) {
        spinner.fail("Release ID required. Use: -r <RELEASE_ID>");
        return;
      }

      const result = await api("GET", `/api/v1/patches?release_id=${opts.release}`);
      spinner.succeed(`Found ${result.patches.length} patch(es)`);
      console.log();

      if (result.patches.length === 0) {
        console.log(chalk.dim("  No patches yet."));
        return;
      }

      console.log(chalk.bold("  Patches:"));
      console.log(chalk.dim("  ───────────────────────────────────────────────────────────────────"));
      for (const p of result.patches) {
        const status = p.status === "active"
          ? chalk.green("● active")
          : p.status === "disabled"
            ? chalk.red("● disabled")
            : chalk.yellow("● rolled_back");
        const size = (p.file_size / 1024).toFixed(1) + " KB";
        console.log(`  #${chalk.green.bold(String(p.patch_number).padEnd(3))} ${status.padEnd(20)} ${chalk.white(size.padEnd(12))} ${chalk.dim(p.created_at)}`);
      }
      console.log(chalk.dim("  ───────────────────────────────────────────────────────────────────"));
    } catch (err) {
      spinner.fail(chalk.red("Failed to list patches"));
      console.error(chalk.red(err.message));
    }
  });

patchesCmd
  .command("status")
  .description("Update patch status")
  .argument("<patchId>", "Patch ID")
  .argument("<status>", "New status (active/disabled/rolled_back)")
  .action(async (patchId, status) => {
    const spinner = ora(`Setting patch status to ${status}...`).start();
    try {
      const result = await api("PATCH", `/api/v1/patches/${patchId}/status`, { status });
      spinner.succeed(chalk.green(result.message));
    } catch (err) {
      spinner.fail(chalk.red("Failed to update status"));
      console.error(chalk.red(err.message));
    }
  });

// ─── SETUP SHOREBIRD ─────────────────────────────────────────────────────────
program
  .command("setup-shorebird")
  .description("Auto-setup Shorebird CLI — clone, patch URLs, build, install to PATH")
  .option("--shorebird-path <path>", "Custom directory to store Shorebird workspace")
  .option("--skip-build", "Skip building, just clone & patch")
  .action(async (opts) => {
    console.log(chalk.bold.cyan(BANNER));
    console.log(chalk.bold("  🔧 Shorebird CLI Setup\n"));

    const serverUrl = getServer();
    console.log(chalk.dim(`  Target server: ${serverUrl}`));

    const ws = opts.shorebirdPath || path.join(os.homedir(), ".moccipult", "shorebird-workspace");
    console.log(chalk.dim(`  Workspace: ${ws}`));
    console.log();

    const { execSync } = require("child_process");

    const run = (cmd, label) => {
      try {
        execSync(cmd, { stdio: "pipe", cwd: ws, shell: true });
        ok(label);
      } catch (err) {
        fail(label + " — " + err.stderr?.toString().split("\n").slice(-3).join("").trim());
        throw err;
      }
    };

    const ok = (msg) => console.log(chalk.green("  ✅ " + msg));
    const fail = (msg) => console.log(chalk.red("  ❌ " + msg));

    try {
      // Check prerequisites
      const spinner0 = ora("Checking prerequisites...").start();
      const missing = [];
      try { execSync("git --version", { stdio: "pipe" }); } catch { missing.push("git"); }
      try { execSync("rustc --version", { stdio: "pipe" }); } catch { missing.push("rust (rustup.rs)"); }
      try { execSync("dart --version", { stdio: "pipe" }); } catch { missing.push("dart (Flutter SDK)"); }
      try { execSync("protoc --version", { stdio: "pipe" }); } catch { missing.push("protobuf"); }

      if (missing.length > 0) {
        spinner0.fail(chalk.red(`Missing: ${missing.join(", ")}`));
        console.log(chalk.dim("  Install them first, then run this command again."));
        return;
      }
      spinner0.succeed("Prerequisites OK");

      // Create workspace
      fs.ensureDirSync(ws);

      // Clone shorebird
      const sbDir = path.join(ws, "shorebird");
      const upDir = path.join(ws, "updater");

      const spinner1 = ora("Cloning Shorebird CLI...").start();
      if (!fs.existsSync(sbDir)) {
        execSync("git clone --depth 1 https://github.com/shorebirdtech/shorebird.git", { stdio: "pipe", cwd: ws });
        spinner1.succeed("Shorebird CLI cloned");
      } else {
        spinner1.succeed("Shorebird CLI already exists");
      }

      const spinner2 = ora("Cloning Shorebird updater...").start();
      if (!fs.existsSync(upDir)) {
        execSync("git clone --depth 1 https://github.com/shorebirdtech/updater.git", { stdio: "pipe", cwd: ws });
        spinner2.succeed("Shorebird updater cloned");
      } else {
        spinner2.succeed("Shorebird updater already exists");
      }

      // Patch URLs
      const spinner3 = ora(`Patching URLs to ${serverUrl}...`).start();
      const patchScript = path.join(__dirname, "..", "..", "patch_repos.py");
      const pythonCmd = process.platform === "win32" ? "py" : "python3";
      execSync(
        `${pythonCmd} "${patchScript}" --shorebird-path "${sbDir}" --updater-path "${upDir}" --target-url "${serverUrl}"`,
        { stdio: "pipe" }
      );
      spinner3.succeed(`URLs patched to ${serverUrl}`);

      if (opts.skipBuild) {
        console.log(chalk.yellow("\n  ⚠️  --skip-build: skipping build. Build manually with:"));
        console.log(chalk.dim(`    cd ${sbDir} && dart compile exe bin/shorebird.dart -o shorebird`));
        return;
      }

      // Build updater
      const spinner4 = ora("Building updater (Rust)...").start();
      execSync("cargo build --release", { stdio: "pipe", cwd: upDir });
      spinner4.succeed("Updater built");

      // Build CLI
      const spinner5 = ora("Building Shorebird CLI...").start();
      execSync("dart pub get", { stdio: "pipe", cwd: sbDir });
      const ext = process.platform === "win32" ? ".exe" : "";
      const sbBin = path.join(sbDir, `shorebird${ext}`);
      execSync(`dart compile exe bin/shorebird.dart -o "${sbBin}"`, { stdio: "pipe", cwd: sbDir });
      spinner5.succeed("Shorebird CLI built");

      // Install to moccipult bin
      const moccBin = path.join(os.homedir(), ".moccipult", "bin");
      fs.ensureDirSync(moccBin);
      const dest = path.join(moccBin, `shorebird${ext}`);
      fs.copyFileSync(sbBin, dest);
      fs.chmodSync(dest, 0o755);

      console.log();
      console.log(chalk.bold.green("  ✅ Shorebird CLI installed!"));
      console.log(chalk.dim(`  Binary: ${dest}`));
      console.log(chalk.dim(`  Server: ${serverUrl}`));
      console.log();
      console.log(chalk.yellow("  Langkah selanjutnya:"));
      console.log(chalk.white("  1. Buka terminal BARU (reload PATH)"));
      console.log(chalk.white("  2. cd /path/to/flutter/app"));
      console.log(chalk.white("  3. shorebird login"));
      console.log(chalk.white("  4. shorebird release android"));
      console.log(chalk.white("  5. Fix bug, lalu: shorebird patch android"));
      console.log();

    } catch (err) {
      console.error(chalk.red("\n  ❌ Setup gagal:"), err.message?.split("\n").slice(-3).join("\n"));
      console.error(chalk.dim("  Cek error di atas. Mungkin ada prerequisite yang belum terinstall."));
    }
  });

program
  .command("init")
  .description("Interactive quick setup — register app + create release")
  .action(async () => {
    console.log(chalk.bold.cyan(BANNER));
    console.log(chalk.bold("  Welcome to Moccipult — Self-hosted Code Push\n"));
    console.log(chalk.dim(`  Server: ${getServer()}\n`));

    try {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "name",
          message: "📱 App name:",
          default: path.basename(process.cwd()),
        },
        {
          type: "input",
          name: "package",
          message: "📦 Package name (e.g. com.example.app):",
        },
        {
          type: "list",
          name: "platform",
          message: "📱 Platform:",
          choices: ["android", "ios"],
          default: "android",
        },
        {
          type: "input",
          name: "version",
          message: "🏷️  Version:",
          default: "1.0.0",
        },
        {
          type: "list",
          name: "channel",
          message: "📢 Channel:",
          choices: ["stable", "beta"],
          default: "stable",
        },
      ]);

      console.log();

      // Create app
      const spinner1 = ora("Registering app...").start();
      const appResult = await api("POST", "/api/v1/apps", {
        name: answers.name,
        package_name: answers.package,
        platform: answers.platform,
      });
      spinner1.succeed(chalk.green("App registered!"));

      // Create release
      const spinner2 = ora("Creating release...").start();
      const relResult = await api("POST", "/api/v1/releases", {
        app_id: appResult.app.id,
        version: answers.version,
        platform: answers.platform,
        channel: answers.channel,
      });
      spinner2.succeed(chalk.green("Release created!"));

      // Save to global config
      config.set("lastAppId", appResult.app.id);
      config.set("lastReleaseId", relResult.release.id);

      // Write .moccipult.json in current directory
      const localConfig = {
        appId: appResult.app.id,
        releaseId: relResult.release.id,
        appName: answers.name,
        version: answers.version,
        platform: answers.platform,
        channel: answers.channel,
      };
      fs.writeJsonSync(path.join(process.cwd(), ".moccipult.json"), localConfig, { spaces: 2 });

      console.log();
      console.log(chalk.bold.green("✅ Setup complete!"));
      console.log();
      console.log(chalk.bold("  Summary:"));
      console.log(chalk.dim("  ─────────────────────────────────"));
      console.log(`  App ID:      ${chalk.cyan(appResult.app.id)}`);
      console.log(`  Release ID:  ${chalk.cyan(relResult.release.id)}`);
      console.log(`  Config:      ${chalk.gray(".moccipult.json")}`);
      console.log();
      console.log(chalk.yellow("  Next steps:"));
      console.log(chalk.white("  1. Build your Flutter app"));
      console.log(chalk.white("  2. Generate a patch file"));
      console.log(chalk.white(`  3. Run: ${chalk.cyan("moccipult patches upload -r " + relResult.release.id + " -f patch.bin")}`));
      console.log();
    } catch (err) {
      console.error(chalk.red("\n❌ Setup failed:"), err.message);
      console.error(chalk.dim("Make sure your server is running: " + getServer()));
    }
  });

// ─── STATUS ─────────────────────────────────────────────────────────────────
program
  .command("status")
  .description("Show server status and local config")
  .action(async () => {
    console.log(chalk.bold.cyan(BANNER));

    // Server status
    try {
      const health = await api("GET", "/health");
      console.log(chalk.green("  ✅ Server:"), getServer());
      console.log(chalk.dim("  Service:"), health.service);
      console.log(chalk.dim("  Version:"), health.version);
    } catch {
      console.log(chalk.red("  ❌ Server:"), getServer(), chalk.red("(offline)"));
    }

    // Local config
    const localConfigPath = path.join(process.cwd(), ".moccipult.json");
    if (fs.existsSync(localConfigPath)) {
      const local = fs.readJsonSync(localConfigPath);
      console.log();
      console.log(chalk.cyan("  📱 Local App:"));
      console.log(chalk.dim("  App ID:"), local.appId);
      console.log(chalk.dim("  Release ID:"), local.releaseId);
      console.log(chalk.dim("  App Name:"), local.appName);
      console.log(chalk.dim("  Version:"), local.version);
      console.log(chalk.dim("  Platform:"), local.platform);
    } else {
      console.log(chalk.dim("\n  No local .moccipult.json found"));
      console.log(chalk.dim("  Run: moccipult init"));
    }
    console.log();
  });

// ─── Parse ──────────────────────────────────────────────────────────────────
program.parse(process.argv);

if (!process.argv.slice(2).length) {
  console.log(chalk.bold.cyan(BANNER));
  console.log();
  program.outputHelp();
  console.log();
  console.log(chalk.yellow("  Quick start:"));
  console.log(chalk.white("  moccipult config server https://your-server.com"));
  console.log(chalk.white("  moccipult init"));
  console.log(chalk.white("  moccipult patches upload -r <RELEASE_ID> -f patch.bin"));
  console.log();
  waitForKeypress();
}

// ─── Keep window open on Windows when double-clicked ────────────────────────
function waitForKeypress() {
  if (process.platform === "win32") {
    console.log(chalk.dim("\n  Press any key to exit..."));
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", () => process.exit(0));
  }
}
