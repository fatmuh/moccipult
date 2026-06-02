import 'package:shared_preferences/shared_preferences.dart';

/// Configuration for Moccipult updater.
///
/// Persisted to SharedPreferences so it survives app restarts.
class MoccipultConfig {
  static const _keyServerUrl = 'moccipult_server_url';
  static const _keyAppId = 'moccipult_app_id';
  static const _keyPlatform = 'moccipult_platform';
  static const _keyChannel = 'moccipult_channel';
  static const _keyCurrentPatchNumber = 'moccipult_current_patch_number';

  final String serverUrl;
  final String appId;
  final String platform;
  final String channel;
  final int currentPatchNumber;

  const MoccipultConfig({
    required this.serverUrl,
    required this.appId,
    this.platform = 'android',
    this.channel = 'stable',
    this.currentPatchNumber = 0,
  });

  /// Load config from SharedPreferences ( persisted from last check )
  static Future<MoccipultConfig?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final serverUrl = prefs.getString(_keyServerUrl);
    final appId = prefs.getString(_keyAppId);

    if (serverUrl == null || appId == null) return null;

    return MoccipultConfig(
      serverUrl: serverUrl,
      appId: appId,
      platform: prefs.getString(_keyPlatform) ?? 'android',
      channel: prefs.getString(_keyChannel) ?? 'stable',
      currentPatchNumber: prefs.getInt(_keyCurrentPatchNumber) ?? 0,
    );
  }

  /// Save updated patch number
  static Future<void> setCurrentPatchNumber(int number) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_keyCurrentPatchNumber, number);
  }

  /// Save full config
  static Future<void> save(MoccipultConfig config) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyServerUrl, config.serverUrl);
    await prefs.setString(_keyAppId, config.appId);
    await prefs.setString(_keyPlatform, config.platform);
    await prefs.setString(_keyChannel, config.channel);
    await prefs.setInt(_keyCurrentPatchNumber, config.currentPatchNumber);
  }

  /// Clear all config (for logout / reset)
  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyServerUrl);
    await prefs.remove(_keyAppId);
    await prefs.remove(_keyPlatform);
    await prefs.remove(_keyChannel);
    await prefs.remove(_keyCurrentPatchNumber);
  }
}
