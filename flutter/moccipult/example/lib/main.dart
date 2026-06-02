import 'package:flutter/material.dart';
import 'package:moccipult/moccipult.dart';

void main() async {
  // WAJIB: ensureBinding sebelum async code
  WidgetsFlutterBinding.ensureInitialized();

  // ─── Setup Moccipult ─────────────────────────────
  // App ID dari: moccipult init (simpan dari output CLI)
  const appId = 'YOUR_APP_ID_HERE'; // ganti dengan app id dari moccipult init
  const serverUrl = 'https://patches.yourdomain.com'; // ganti dengan URL server lo

  final updater = MoccipultUpdater(
    serverUrl: serverUrl,
    appId: appId,
    platform: 'android', // atau 'ios'
    channel: 'stable',
  );

  // Optional: callbacks buat monitoring
  updater.onUpdateAvailable = (patch) {
    debugPrint('🎉 Patch available: #${patch.patchNumber}');
  };

  updater.onDownloadProgress = (downloaded, total) {
    if (total > 0) {
      final percent = (downloaded / total * 100).toStringAsFixed(0);
      debugPrint('Downloading: $percent%');
    }
  };

  updater.onPatchApplied = (patchNumber) {
    debugPrint('✅ Patch #$patchNumber applied!');
  };

  // Check & apply patch (non-blocking, ga akan crash kalau server down)
  await updater.checkAndApply();

  // ─── Run app seperti biasa ───────────────────────
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
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('App is running!'),
            const SizedBox(height: 20),
            // Cek patch number saat ini
            FutureBuilder<int>(
              future: MoccipultUpdater(
                serverUrl: 'https://patches.yourdomain.com',
                appId: 'YOUR_APP_ID_HERE',
              ).getCurrentPatchNumber(),
              builder: (context, snapshot) {
                return Text(
                  'Current patch: #${snapshot.data ?? 0}',
                  style: const TextStyle(color: Colors.grey),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
