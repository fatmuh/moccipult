#!/usr/bin/env python3
"""
Shorebird Repository Patching Script

Scans cloned Shorebird repositories (shorebird CLI + updater)
and replaces all hardcoded Shorebird API endpoints with a custom server URL.

Usage:
    python patch_repos.py --shorebird-path /path/to/shorebird --updater-path /path/to/updater --target-url http://localhost:3000

Environment Variables:
    SHOREBIRD_API_URL   Target URL to replace Shorebird endpoints with
"""

import os
import sys
import re
import argparse
import logging
from pathlib import Path
from typing import List, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s  %(message)s",
)
log = logging.getLogger("patch-repos")

#  Patterns to find and replace 

# Each tuple: (pattern_to_search, description)
REPLACEMENTS: List[Tuple[str, str]] = [
    # Primary API endpoints
    (
        r"https?://api\.shorebird\.dev",
        "API Server URL (api.shorebird.dev)",
    ),
    (
        r"https?://api\.shorebird\.cloud",
        "API Server URL (api.shorebird.cloud)",
    ),
    # Auth service
    (
        r"https?://auth\.shorebird\.dev",
        "Auth Service URL (auth.shorebird.dev)",
    ),
    # Console / dashboard
    (
        r"https?://console\.shorebird\.dev",
        "Shorebird Console URL",
    ),
    (
        r"https?://console\.shorebird\.cloud",
        "Shorebird Console Cloud URL",
    ),
    (
        r"https?://shorebird\.cloud",
        "Shorebird Cloud URL (shorebird.cloud)",
    ),
    (
        r"https?://www\.shorebird\.cloud",
        "Shorebird Cloud URL (www.shorebird.cloud)",
    ),
    # Storage / download endpoints
    (
        r"https?://storage\.googleapis\.com/shorebird",
        "GCS Storage URL",
    ),
    # Shorebird subdomains (cdn, download, etc)
    (
        r"https?://cdn\.shorebird\.cloud",
        "CDN URL (cdn.shorebird.cloud)",
    ),
    (
        r"https?://download\.shorebird\.dev",
        "Download URL (download.shorebird.dev)",
    ),
]

# File extensions to scan
SCAN_EXTENSIONS = {
    ".dart", ".rs", ".toml", ".yaml", ".yml", ".json",
    ".js", ".ts", ".go", ".py", ".sh", ".env",
    ".md", ".txt", ".cfg", ".conf", ".properties",
    ".gradle", ".xml", ".plist", ".ps1", ".bat",
}

# Directories to skip
SKIP_DIRS = {
    ".git", ".dart_tool", "build", "node_modules",
    "__pycache__", ".gradle", ".idea", "target",
    "dist", ".tox", "venv", ".venv",
    "bin", "cache", "engine", "flutter",
}


# Pattern to detect a previously patched URL (non-Shorebird custom URL)
# Matches: http://something, https://something  but NOT shorebird.dev/cloud
_PREVIOUS_PATCH_PATTERN = re.compile(
    r"https?://(?!api\.shorebird\.dev|auth\.shorebird\.dev|console\.shorebird\.dev"
    r"|cdn\.shorebird\.cloud|download\.shorebird\.dev|shorebird\.cloud"
    r"|www\.shorebird\.cloud|storage\.googleapis\.com/shorebird"
    r")[\w.-]+(?:\.[\w]+)?(?::\d+)?"
)


def find_replacements(content: str, target_url: str) -> Tuple[str, List[dict]]:
    """Find and replace all Shorebird URLs in the given content.
    Also handles re-patching: if URLs were already patched to a previous
    custom URL, replace those too.
    """
    changes = []
    new_content = content
    base = target_url.rstrip("/")

    # Phase 1: Replace original Shorebird URLs
    for pattern, _description in REPLACEMENTS:
        matches = list(re.finditer(pattern, content))
        if matches:
            new_content = re.sub(pattern, base, new_content)
            for match in matches:
                changes.append({
                    "original": match.group(0),
                    "replacement": base,
                    "position": match.start(),
                })

    return new_content, changes


def re_patch_previous_url(content: str, target_url: str, directory: str = "") -> Tuple[str, List[dict]]:
    """Detect and replace URLs from a previous patch run.
    
    If the files were already patched to e.g. http://localhost:3000,
    this will replace those with the new target URL.
    
    We track the previously patched URL in a stamp file.
    """
    changes = []
    new_content = content
    base = target_url.rstrip("/")

    # Skip if already correct
    if base in content:
        return content, changes

    # Try to read the previous URL from stamp file
    stamp_path = Path(directory) / ".moccipult-url"
    prev_url = None
    if stamp_path.exists():
        prev_url = stamp_path.read_text().strip().rstrip("/")
    
    if not prev_url:
        return content, changes

    # Replace previous URL with new one
    if prev_url in content:
        new_content = content.replace(prev_url, base)
        count = content.count(prev_url)
        for _ in range(count):
            changes.append({
                "original": prev_url,
                "replacement": base,
                "position": 0,
            })

    return new_content, changes


def patch_uri_https_constructs(content: str, target_url: str) -> Tuple[str, List[dict]]:
    """Patch Dart's Uri.https('host') constructs that regex misses.
    
    Shorebird uses:  Uri.https('api.shorebird.dev')
    We need to turn it into: Uri.parse('http://your-server')
    """
    changes = []
    new_content = content
    base = target_url.rstrip("/")

    # Match: Uri.https('api.shorebird.dev') or Uri.https('api.shorebird.dev', path)
    uri_pattern = r"Uri\.https\(['\"]api\.shorebird\.dev['\"]\)"
    matches = list(re.finditer(uri_pattern, content))
    if matches:
        if base.startswith("https://"):
            replacement = f"Uri.parse('{base}')"
        else:
            replacement = f"Uri.parse('{base}')"
        new_content = re.sub(uri_pattern, replacement, new_content)
        for match in matches:
            changes.append({
                "original": match.group(0),
                "replacement": replacement,
                "position": match.start(),
            })

    return new_content, changes


def patch_auth_bypass(content: str, target_url: str) -> Tuple[str, List[dict]]:
    """Patch the auth validator to always report as authenticated.
    
    In shorebird_validator.dart, replace:
      if (checkUserIsAuthenticated && !auth.isAuthenticated) {
    with:
      if (false && !auth.isAuthenticated) {
    so that auth check is always skipped.
    """
    changes = []
    
    # Pattern in shorebird_validator.dart
    pattern = r"if \(checkUserIsAuthenticated && !auth\.isAuthenticated\)"
    matches = list(re.finditer(pattern, content))
    if matches:
        new_content = re.sub(
            pattern,
            "if (false && !auth.isAuthenticated)",
            content,
        )
        for match in matches:
            changes.append({
                "original": match.group(0),
                "replacement": "if (false && !auth.isAuthenticated)",
                "position": match.start(),
            })
        return new_content, changes
    
    return content, changes


def scan_directory(directory: str, target_url: str, dry_run: bool = False) -> dict:
    """Scan a directory recursively and apply replacements."""
    stats = {
        "files_scanned": 0,
        "files_modified": 0,
        "total_replacements": 0,
        "details": [],
    }

    dir_path = Path(directory)
    if not dir_path.exists():
        log.error(f"Directory does not exist: {directory}")
        return stats

    for root, dirs, files in os.walk(directory):
        # Skip unwanted directories
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

        for filename in files:
            filepath = Path(root) / filename

            if filepath.suffix not in SCAN_EXTENSIONS:
                continue

            try:
                content = filepath.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            stats["files_scanned"] += 1

            new_content, changes = find_replacements(content, target_url)

            # Also patch Uri.https('api.shorebird.dev') constructs
            uri_content, uri_changes = patch_uri_https_constructs(
                new_content, target_url
            )
            new_content = uri_content
            changes.extend(uri_changes)

            # Patch auth bypass in validator
            auth_content, auth_changes = patch_auth_bypass(
                new_content, target_url
            )
            new_content = auth_content
            changes.extend(auth_changes)

            # Re-patch: replace previous custom URL with new one
            repatch_content, repatch_changes = re_patch_previous_url(
                new_content, target_url, directory=directory
            )
            new_content = repatch_content
            changes.extend(repatch_changes)

            if changes:
                stats["files_modified"] += 1
                stats["total_replacements"] += len(changes)

                relative_path = filepath.relative_to(directory)

                for change in changes:
                    detail = {
                        "file": str(relative_path),
                        "original": change["original"],
                        "replacement": change["replacement"],
                    }
                    stats["details"].append(detail)
                    log.info(f"   {relative_path}: {change['original']} -> {change['replacement']}")

                if not dry_run:
                    filepath.write_text(new_content, encoding="utf-8")
                    log.info(f"  [OK] Patched: {relative_path}")
                else:
                    log.info(f"   [DRY RUN] Would patch: {relative_path}")

    # After patching, invalidate the Shorebird snapshot cache so the
    # patched source files get recompiled on next run.
    if not dry_run and stats["total_replacements"] > 0:
        stamp_candidates = [
            Path(directory) / "bin" / "cache" / "shorebird.stamp",
            Path(directory) / "bin" / "cache" / "shorebird.snapshot",
        ]
        for stamp_file in stamp_candidates:
            if stamp_file.exists():
                stamp_file.unlink()
                log.info(f"    Deleted cache: {stamp_file.name}")

        # Save the patched URL for future re-patching
        url_stamp = Path(directory) / ".moccipult-url"
        url_stamp.write_text(target_url.rstrip("/"))
        log.info(f"   Saved URL stamp: {target_url}")

    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Patch Shorebird repositories to use a custom API server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Dry run (preview changes):
  python patch_repos.py --shorebird-path ./shorebird --dry-run

  # Apply changes:
  python patch_repos.py --shorebird-path ./shorebird --target-url http://localhost:3000

  # Using environment variable:
  SHOREBIRD_API_URL=http://my-server.com python patch_repos.py --shorebird-path ./shorebird
        """,
    )
    parser.add_argument(
        "--shorebird-path",
        required=True,
        help="Path to the cloned shorebird repository",
    )
    parser.add_argument(
        "--updater-path",
        default=None,
        help="Path to the cloned updater repository (optional)",
    )
    parser.add_argument(
        "--target-url",
        default=None,
        help="Target URL to replace Shorebird endpoints (default: SHOREBIRD_API_URL env var or http://localhost:3000)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without modifying files",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Determine target URL
    target_url = args.target_url or os.environ.get("SHOREBIRD_API_URL") or "http://localhost:3000"

    print(f"""
+==================================================+
|    [PATCH] Shorebird Repository Patcher              |
|                                                  |
|    Target URL: {target_url:<37}|
|    Dry Run:    {str(args.dry_run):<37}|
+==================================================+
    """)

    # Scan shorebird repo
    print(f"[SCAN] Scanning shorebird repo: {args.shorebird_path}")
    stats = scan_directory(args.shorebird_path, target_url, args.dry_run)

    # Optionally scan updater repo
    if args.updater_path:
        print(f"\n[SCAN] Scanning updater repo: {args.updater_path}")
        updater_stats = scan_directory(args.updater_path, target_url, args.dry_run)
        stats["files_scanned"] += updater_stats["files_scanned"]
        stats["files_modified"] += updater_stats["files_modified"]
        stats["total_replacements"] += updater_stats["total_replacements"]
        stats["details"].extend(updater_stats["details"])

    # Print summary
    print(f"""
+==================================================+
|    [STATS] Summary                                    |
|                                                  |
|    Files Scanned:     {stats['files_scanned']:<27}|
|    Files Modified:    {stats['files_modified']:<27}|
|    Total Replacements:{stats['total_replacements']:<27}|
|    Dry Run:           {str(args.dry_run):<27}|
+==================================================+
    """)

    if stats["details"]:
        print("[LIST] Detailed changes:")
        for d in stats["details"][:50]:  # Show first 50
            print(f"  * {d['file']}: {d['original']} -> {d['replacement']}")
        if len(stats["details"]) > 50:
            print(f"  ... and {len(stats['details']) - 50} more changes")

    if args.dry_run:
        print("\n[WARN]  This was a dry run. No files were modified.")
        print("   Run without --dry-run to apply changes.")
    else:
        print("\n[OK] All changes applied successfully!")


if __name__ == "__main__":
    main()
