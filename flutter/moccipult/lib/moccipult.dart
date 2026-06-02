library moccipult;

/// Moccipult — Self-hosted code push for Flutter
///
/// Usage:
/// ```dart
/// import 'package:moccipult/moccipult.dart';
///
/// void main() async {
///   WidgetsFlutterBinding.ensureInitialized();
///
///   final updater = MoccipultUpdater(
///     serverUrl: 'https://patches.yourdomain.com',
///     appId: 'your-app-id',
///   );
///
///   // Check and apply patch before running app
///   await updater.checkAndApply();
///
///   runApp(MyApp());
/// }
/// ```

export 'src/moccipult_updater.dart';
export 'src/moccipult_config.dart';
