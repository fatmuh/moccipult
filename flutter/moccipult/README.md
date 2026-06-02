# 📱 moccipult — Flutter Client

Flutter package untuk cek dan download patch dari Moccipult server.

## Install

Tambahkan ke `pubspec.yaml`:

```yaml
dependencies:
  moccipult:
    git:
      url: https://github.com/fatmuh/moccipult.git
      path: flutter/moccipult
```

Atau kalau package udah dipublish ke pub.dev:

```yaml
dependencies:
  moccipult: ^1.0.0
```

## Quick Start

### 1. Dapatkan App ID dari CLI

```bash
moccipult config server https://patches.yourdomain.com
moccipult init
# Output: App ID: xxx-xxx-xxx
```

### 2. Tambahkan ke `main.dart`

```dart
import 'package:flutter/material.dart';
import 'package:moccipult/moccipult.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final updater = MoccipultUpdater(
    serverUrl: 'https://patches.yourdomain.com',
    appId: 'YOUR_APP_ID',  // dari moccipult init
  );

  // Check & apply patch
  await updater.checkAndApply();

  runApp(const MyApp());
}
```

### 3. Selesai! 🎉

Setiap app dibuka, otomatis cek patch ke server.

## Advanced Usage

### Dengan Callbacks

```dart
final updater = MoccipultUpdater(
  serverUrl: 'https://patches.yourdomain.com',
  appId: 'YOUR_APP_ID',
);

// Ketika patch tersedia
updater.onUpdateAvailable = (patch) {
  print('Patch #${patch.patchNumber} available!');
  print('Size: ${patch.fileSize} bytes');
};

// Progress download
updater.onDownloadProgress = (downloaded, total) {
  print('Progress: ${(downloaded / total * 100).toFixed(0)}%');
};

// Patch berhasil diapply
updater.onPatchApplied = (patchNumber) {
  print('Patch #$patchNumber applied!');
};

// Error handling
updater.onError = (error) {
  print('Update error: $error');
  // Ga akan crash app, cuma log
};

await updater.checkAndApply();
```

### Cek Patch Manual (tanpa apply)

```dart
final updater = MoccipultUpdater(
  serverUrl: 'https://patches.yourdomain.com',
  appId: 'YOUR_APP_ID',
);

final result = await updater.checkForPatch(
  version: '1.0.0',
  currentPatchNumber: 0,
);

if (result.available) {
  print('Patch #${result.patchNumber} available!');
  print('Download: ${result.downloadUrl}');
} else {
  print('No patch: ${result.message}');
}
```

### Cek Patch Number Saat Ini

```dart
final updater = MoccipultUpdater(...);
final patchNum = await updater.getCurrentPatchNumber();
print('Current patch: #$patchNum');
```

### Tampilkan di UI

```dart
FutureBuilder<int>(
  future: updater.getCurrentPatchNumber(),
  builder: (context, snapshot) {
    return Text('Patch version: ${snapshot.data ?? 0}');
  },
)
```

## Workflow Lengkap Programmer Mobile

```
SEKALI SAJA (setup awal):
═════════════════════════
1. Minta App ID ke lead/devops
   (dari: moccipult init)
2. Tambahkan package moccipult ke pubspec.yaml
3. Tambahkan kode di main.dart
4. Build & release ke Play Store

SETIAP KALI ADA BUG FIX:
════════════════════════
1. Fix bug di kode Flutter
2. Generate patch file (dari CI/CD atau manual)
3. Upload: moccipult patches upload -r <RELEASE_ID> -f patch.bin
4. User otomatis dapat patch saat buka app! ✅
```

## API Reference

### MoccipultUpdater

| Property | Type | Description |
|----------|------|-------------|
| `serverUrl` | `String` | Moccipult server URL |
| `appId` | `String` | App ID dari CLI |
| `platform` | `String` | `android` / `ios` (default: `android`) |
| `channel` | `String` | `stable` / `beta` (default: `stable`) |
| `timeout` | `Duration` | Request timeout (default: 30s) |

| Method | Description |
|--------|-------------|
| `checkAndApply()` | Check + download + apply patch |
| `checkForPatch()` | Check only, return `PatchResult` |
| `downloadPatch()` | Download patch file |
| `getCurrentPatchNumber()` | Get current patch number |
| `resetPatchNumber()` | Reset to 0 (for testing) |

| Callback | Description |
|----------|-------------|
| `onUpdateAvailable` | Called when patch found |
| `onDownloadProgress` | Download progress |
| `onPatchApplied` | Patch applied successfully |
| `onError` | Error occurred |
| `onStatusChanged` | Status update |

## Notes

- Package **tidak akan crash app** kalau server down — error hanya di-log
- Patch check bersifat **non-blocking** — app tetap jalan walau check gagal
- Patch number disimpan di **SharedPreferences** — survive app restart
