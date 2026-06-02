#!/usr/bin/env python3
"""
Shorebird Repository Patching Script

Scans cloned Shorebird repositories (shorebird CLI + updater)
and replaces all hardcoded Shorebird API endpoints with a custom server URL.

Usage:
    python patch_repos.py --shorebird-path /path/to/shorebird --updater-path /path/to/updater --target-url http://localhost:3000

Environment Variables:
    SHOREBIRD_API_URL  — Target URL to replace Shorebird endpoints with
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

# ─── Patterns to find and replace ───────────────────────────────────────────

# Each tuple: (pattern_to_search, replacement_group_name, description)
REPLACEMENTS: List[Tuple[str, str, str]] = [
    # Primary API endpoints
    (
        r"https?://api\.shorebird\.dev",
        "API Server URL (api.shorebird.dev)",
    ),
    (
        r"https?://api\.shorebird\.cloud",
        "API Server URL (api.shorebird.cloud)",
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
    (
        r"https?://\.shorebird\.dev",
        "Shorebird dev subdomain",
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
]

# File extensions to scan
SCAN_EXTENSIONS = {
    ".dart", ".rs", ".toml", ".yaml", ".yml", ".json",
    ".js", ".ts", ".go", ".py", ".sh", ".env",
    ".md", ".txt", ".cfg", ".conf", ".properties",
    ".gradle", ".xml", ".plist",
}

# Directories to skip
SKIP_DIRS = {
    ".git", ".dart_tool", "build", "node_modules",
    "__pycache__", ".gradle", ".idea", "target",
    "dist", ".tox", "venv", ".venv",
}


def find_replacements(content: str, target_url: str) -> Tuple[str, List[dict]]:
    """Find and replace all Shorebird URLs in the given content."""
    changes = []
    new_content = content

    for pattern in REPLACEMENTS:
        matches = list(re.finditer(pattern, content))
        if matches:
            new_content = re.sub(pattern, target_url.rstrip("/"), new_content)
            for match in matches:
                changes.append({
                    "original": match.group(0),
                    "replacement": target_url.rstrip("/"),
                    "position": match.start(),
                })

    return new_content, changes


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
                    log.info(f"  📝 {relative_path}: {change['original']} → {change['replacement']}")

                if not dry_run:
                    filepath.write_text(new_content, encoding="utf-8")
                    log.info(f"  ✅ Patched: {relative_path}")
                else:
                    log.info(f"  🔍 [DRY RUN] Would patch: {relative_path}")

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
╔══════════════════════════════════════════════════╗
║    🔧 Shorebird Repository Patcher              ║
║                                                  ║
║    Target URL: {target_url:<37}║
║    Dry Run:    {str(args.dry_run):<37}║
╚══════════════════════════════════════════════════╝
    """)

    # Scan shorebird repo
    print(f"📂 Scanning shorebird repo: {args.shorebird_path}")
    stats = scan_directory(args.shorebird_path, target_url, args.dry_run)

    # Optionally scan updater repo
    if args.updater_path:
        print(f"\n📂 Scanning updater repo: {args.updater_path}")
        updater_stats = scan_directory(args.updater_path, target_url, args.dry_run)
        stats["files_scanned"] += updater_stats["files_scanned"]
        stats["files_modified"] += updater_stats["files_modified"]
        stats["total_replacements"] += updater_stats["total_replacements"]
        stats["details"].extend(updater_stats["details"])

    # Print summary
    print(f"""
╔══════════════════════════════════════════════════╗
║    📊 Summary                                    ║
║                                                  ║
║    Files Scanned:     {stats['files_scanned']:<27}║
║    Files Modified:    {stats['files_modified']:<27}║
║    Total Replacements:{stats['total_replacements']:<27}║
║    Dry Run:           {str(args.dry_run):<27}║
╚══════════════════════════════════════════════════╝
    """)

    if stats["details"]:
        print("📋 Detailed changes:")
        for d in stats["details"][:50]:  # Show first 50
            print(f"  • {d['file']}: {d['original']} → {d['replacement']}")
        if len(stats["details"]) > 50:
            print(f"  ... and {len(stats['details']) - 50} more changes")

    if args.dry_run:
        print("\n⚠️  This was a dry run. No files were modified.")
        print("   Run without --dry-run to apply changes.")
    else:
        print("\n✅ All changes applied successfully!")


if __name__ == "__main__":
    main()
