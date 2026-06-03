import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import 'moccipult_config.dart';

/// Result of a patch check.
class PatchResult {
  final bool available;
  final int? patchNumber;
  final String? downloadUrl;
  final String? fileHash;
  final int? fileSize;
  final String? message;

  const PatchResult({
    required this.available,
    this.patchNumber,
    this.downloadUrl,
    this.fileHash,
    this.fileSize,
    this.message,
  });

  factory PatchResult.fromJson(Map<String, dynamic> json) {
    if (json['patch_available'] == true) {
      final patch = json['patch'] as Map<String, dynamic>;
      return PatchResult(
        available: true,
        patchNumber: patch['patch_number'] as int?,
        downloadUrl: patch['download_url'] as String?,
        fileHash: patch['file_hash'] as String?,
        fileSize: patch['file_size'] as int?,
      );
    }
    return PatchResult(
      available: false,
      message: json['message'] as String?,
    );
  }

  @override
  String toString() {
    if (available) {
      return 'PatchResult(available: true, patchNumber: #$patchNumber, size: ${fileSize ?? 0} bytes)';
    }
    return 'PatchResult(available: false, message: $message)';
  }
}

/// Download progress callback.
typedef ProgressCallback = void Function(int downloaded, int total);

/// Moccipult updater — checks for patches and applies them.
///
/// Usage in `main.dart`:
/// ```dart
/// void main() async {
///   WidgetsFlutterBinding.ensureInitialized();
///
///   final updater = MoccipultUpdater(
///     serverUrl: 'https://patches.yourdomain.com',
///     appId: 'your-app-id-from-moccipult-init',
///   );
///
///   // Optional: listen for updates
///   updater.onUpdateAvailable = (patch) {
///     print('New patch available: #${patch.patchNumber}');
///   };
///
///   await updater.checkAndApply();
///
///   runApp(MyApp());
/// }
/// ```
class MoccipultUpdater {
  final String serverUrl;
  final String appId;
  final String platform;
  final String channel;
  final Duration timeout;

  /// Called when a new patch is found during check
  void Function(PatchResult)? onUpdateAvailable;

  /// Called when download progresses (bytes downloaded, total bytes)
  ProgressCallback? onDownloadProgress;

  /// Called when patch is successfully applied
  void Function(int patchNumber)? onPatchApplied;

  /// Called on error
  void Function(String error)? onError;

  /// Called for status updates
  void Function(String status)? onStatusChanged;

  String appVersion;

  MoccipultUpdater({
    required this.serverUrl,
    required this.appId,
    this.appVersion = '',
    this.platform = 'android',
    this.channel = 'stable',
    this.timeout = const Duration(seconds: 30),
  });

  /// The main method — check for patches and apply if available.
  ///
  /// Call this before `runApp()` in `main.dart`.
  Future<void> checkAndApply() async {
    try {
      onStatusChanged?.call('Checking for patches...');

      // Load current patch number
      final config = await MoccipultConfig.load();
      final currentPatchNumber = config?.currentPatchNumber ?? 0;

      if (appVersion.isEmpty) {
        throw Exception(
          'moccipult: appVersion is required.\n'
          'Add appVersion to MoccipultUpdater:\n'
          '  MoccipultUpdater(serverUrl: ..., appId: ..., appVersion: "1.0.0")',
        );
      }
      final version = appVersion;

      // Check server
      final result = await checkForPatch(
        version: version,
        currentPatchNumber: currentPatchNumber,
      );

      if (!result.available) {
        onStatusChanged?.call(result.message ?? 'Already up to date');
        return;
      }

      onUpdateAvailable?.call(result);

      // Download patch
      onStatusChanged?.call('Downloading patch #${result.patchNumber}...');
      final patchFile = await downloadPatch(
        result.downloadUrl!,
        result.patchNumber!,
        onProgress: onDownloadProgress,
      );

      // Save patch number
      await MoccipultConfig.setCurrentPatchNumber(result.patchNumber!);

      // Save config if not saved yet
      if (config == null) {
        await MoccipultConfig.save(MoccipultConfig(
          serverUrl: serverUrl,
          appId: appId,
          platform: platform,
          channel: channel,
          currentPatchNumber: result.patchNumber!,
        ));
      }

      onStatusChanged?.call('Patch #${result.patchNumber} applied!');
      onPatchApplied?.call(result.patchNumber!);

      debugPrint('[Moccipult] Patch #${result.patchNumber} applied successfully');
    } catch (e) {
      onError?.call(e.toString());
      debugPrint('[Moccipult] Error: $e');
      // Don't crash the app — just log
    }
  }

  /// Check server for new patches.
  ///
  /// Returns [PatchResult] with patch details if available.
  Future<PatchResult> checkForPatch({
    required String version,
    int currentPatchNumber = 0,
  }) async {
    final url = Uri.parse('${serverUrl.replaceAll(RegExp(r'/+$'), '')}/api/v1/patches/check');

    final response = await http
        .post(
          url,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'app_id': appId,
            'version': version,
            'current_patch_number': currentPatchNumber,
            'platform': platform,
            'channel': channel,
          }),
        )
        .timeout(timeout);

    if (response.statusCode != 200) {
      throw Exception('Server returned ${response.statusCode}: ${response.body}');
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;

    if (json['ok'] != true) {
      throw Exception('Server error: ${json['error'] ?? 'Unknown'}');
    }

    return PatchResult.fromJson(json);
  }

  /// Download a patch file from the server.
  ///
  /// Saves to app's temporary directory.
  Future<File> downloadPatch(
    String downloadUrl,
    int patchNumber, {
    ProgressCallback? onProgress,
  }) async {
    final url = Uri.parse(downloadUrl);
    final client = http.Client();

    try {
      final request = http.Request('GET', url);
      final response = await client.send(request).timeout(timeout);

      if (response.statusCode != 200) {
        throw Exception('Download failed: ${response.statusCode}');
      }

      final totalBytes = response.contentLength ?? 0;
      int downloadedBytes = 0;

      final tempDir = await getTemporaryDirectory();
      final file = File('${tempDir.path}/moccipult_patch_$patchNumber.bin');
      final sink = file.openWrite();

      await response.stream.forEach((chunk) {
        sink.add(chunk);
        downloadedBytes += chunk.length;
        onProgress?.call(downloadedBytes, totalBytes);
      });

      await sink.close();
      client.close();

      return file;
    } catch (e) {
      client.close();
      rethrow;
    }
  }

  /// Get current patch number from local storage.
  Future<int> getCurrentPatchNumber() async {
    final config = await MoccipultConfig.load();
    return config?.currentPatchNumber ?? 0;
  }

  /// Reset patch number (for testing).
  Future<void> resetPatchNumber() async {
    await MoccipultConfig.setCurrentPatchNumber(0);
  }
}
