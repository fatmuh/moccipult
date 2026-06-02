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
  .description("Install Shorebird CLI resmi + patch URL ke server Moccipult")
  .option("--shorebird-path <path>", "Path ke instalasi Shorebird (auto-detect)")
  .action(async (opts) => {
    console.log(chalk.bold.cyan(BANNER));
    console.log(chalk.bold("  🔧 Shorebird CLI Setup\n"));

    const serverUrl = getServer();
    console.log(chalk.dim(`  Target server: ${serverUrl}`));
    console.log();

    const { execSync } = require("child_process");
    const ok = (msg) => console.log(chalk.green("  ✅ " + msg));
    const fail = (msg) => console.log(chalk.red("  ❌ " + msg));

    try {
      // ── Step 1: Find existing Shorebird installation ──
      let sbPath = opts.shorebirdPath;
      if (!sbPath) {
        const possiblePaths = [
          path.join(os.homedir(), ".shorebird"),
          path.join(process.env.LOCALAPPDATA || "", "shorebird"),
          path.join(process.env.USERPROFILE || "", ".shorebird"),
          path.join(process.env.USERPROFILE || "", "AppData", "Local", "shorebird"),
        ];
        for (const p of possiblePaths) {
          if (fs.existsSync(path.join(p, "bin", "shorebird")) || fs.existsSync(path.join(p, "bin", "shorebird.exe"))) {
            sbPath = p;
            break;
          }
        }
      }

      // ── Step 2: Install Shorebird if not found ──
      if (!sbPath) {
        console.log(chalk.yellow("  Shorebird CLI belum terinstall.\n"));
        console.log(chalk.bold("  Install dulu:"));

        if (process.platform === "win32") {
          console.log(chalk.white("  1. Buka PowerShell"));
          console.log(chalk.cyan("     Invoke-RestMethod https://raw.githubusercontent.com/nicoverbruggen/shorebird-installer/main/install.ps1 | Invoke-Expression"));
        } else {
          console.log(chalk.cyan("     curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/nicoverbruggen/shorebird-installer/main/install.sh | sh"));
        }
        console.log();
        console.log(chalk.white("  2. Setelah selesai, jalankan lagi:"));
        console.log(chalk.cyan("     moccipult setup-shorebird"));
        console.log();
        return;
      }

      ok(`Shorebird found: ${sbPath}`);

      // ── Step 3: Verify ──
      const ext = process.platform === "win32" ? ".exe" : "";
      const sbBin = path.join(sbPath, "bin", `shorebird${ext}`);
      if (!fs.existsSync(sbBin)) {
        fail(`Binary not found: ${sbBin}`);
        return;
      }

      // ── Step 4: Patch URLs ──
      const spinner3 = ora(`Patching URLs to ${serverUrl}...`).start();

      const tmpPatchScript = path.join(os.tmpdir(), "moccipult-patch-repos.py");
      const embeddedPatchScript = path.join(__dirname, "..", "..", "patch_repos.py");
      let patchScript;
      if (fs.existsSync(embeddedPatchScript)) {
        patchScript = embeddedPatchScript;
      } else {
        try {
          const resp = await fetch("https://raw.githubusercontent.com/fatmuh/moccipult/master/patch_repos.py");
          const scriptContent = await resp.text();
          fs.writeFileSync(tmpPatchScript, scriptContent, "utf-8");
          patchScript = tmpPatchScript;
        } catch (dlErr) {
          spinner3.fail("Failed to download patch script");
          throw dlErr;
        }
      }

      const pythonCmd = process.platform === "win32" ? "py" : "python3";
      const execOpts = { stdio: "pipe", shell: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } };
      execSync(
        `${pythonCmd} "${patchScript}" --shorebird-path "${sbPath}" --target-url "${serverUrl}"`,
        execOpts
      );
      spinner3.succeed(`URLs patched to ${serverUrl}`);

      // ── Done! ──
      console.log();
      console.log(chalk.bold.green("  ✅ Shorebird CLI siap!"));
      console.log(chalk.dim(`  Binary: ${sbBin}`));
      console.log(chalk.dim(`  Server: ${serverUrl}`));
      console.log();
      console.log(chalk.yellow("  Langkah selanjutnya:"));
      console.log(chalk.white("  1. Buka terminal BARU"));
      console.log(chalk.white("  2. cd /path/to/flutter/app"));
      console.log(chalk.white("  3. shorebird login"));
      console.log(chalk.white("  4. shorebird release android"));
      console.log(chalk.white("  5. Fix bug, lalu: shorebird patch android"));
      console.log();
      console.log(chalk.dim("  ⚠️  Kalau Shorebird update & URL ke-reset:"));
      console.log(chalk.dim("     Jalankan lagi: moccipult setup-shorebird"));
      console.log();

    } catch (err) {
      console.error(chalk.red("\n  ❌ Setup gagal:"), err.message?.split("\n").slice(-3).join("\n"));
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
