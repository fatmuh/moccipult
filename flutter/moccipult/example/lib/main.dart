import 'package:flutter/material.dart';
import 'package:moccipult/moccipult.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ─── Setup Moccipult ─────────────────────────────
  const appId = 'YOUR_APP_ID_HERE';
  const serverUrl = 'https://patches.yourdomain.com';
  const appVersion = '1.0.0'; // sesuaikan dengan versi di pubspec.yaml

  final updater = MoccipultUpdater(
    serverUrl: serverUrl,
    appId: appId,
    appVersion: appVersion,
    platform: 'android', // atau 'ios'
    channel: 'stable',
  );

  // Optional: callbacks
  updater.onUpdateAvailable = (patch) {
    debugPrint('🎉 Patch available: #${patch.patchNumber}');
  };

  updater.onPatchApplied = (patchNumber) {
    debugPrint('✅ Patch #$patchNumber applied!');
  };

  await updater.checkAndApply();

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'My App',
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My App')),
      body: const Center(child: Text('App is running!')),
    );
  }
}
