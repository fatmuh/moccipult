# 🚀 Moccipult — Self-Hosted Code Push for Flutter

> Self-hosted alternative untuk [Shorebird Code Push](https://shorebird.dev) —
> push update Flutter langsung ke HP user tanpa lewat Play Store.

---

## 📁 Project Structure

```
.
├── patch-server/              # Express + SQLite backend
│   ├── src/
│   │   ├── server.js          # Main entry point
│   │   ├── database.js        # SQLite schema & setup
│   │   └── routes/
│   │       ├── apps.js        # App & release management
│   │       ├── patches.js     # Patch upload & check
│   │       └── downloads.js   # Patch file download
│   ├── Dockerfile
│   ├── package.json
│   └── .env
├── cli/                       # Cross-platform CLI tool
│   ├── bin/moccipult.js       # CLI entry point
│   ├── build.sh               # Build binaries (Linux/macOS)
│   ├── build.bat              # Build binaries (Windows)
│   └── package.json
├── patch_repos.py             # Patch Shorebird repos to use custom server
├── docker-compose.yml         # Docker deployment
├── test-server.js             # End-to-end test suite
└── README.md
```

---

## 🚀 Quick Start (3 langkah)

### Langkah 1: Jalankan Server

#### Option A: Docker (Production)
```bash
docker-compose up -d --build
```

#### Option B: Local (Development)
```bash
cd patch-server
npm install
PORT=3001 npm start
```

### Langkah 2: Install CLI

#### Option A: Dari source (semua OS)
```bash
cd cli
npm install

# Jalankan langsung
node bin/moccipult.js --help

# Atau link global
npm link
moccipult --help
```

#### Option B: Build binary standalone (Windows / Linux / macOS)
```bash
cd cli
npm install

# Build semua platform:
bash build.sh          # Linux/macOS
build.bat              # Windows

# Hasilnya:
#   dist/moccipult-windows.exe
#   dist/moccipult-linux
#   dist/moccipult-macos

# Pake langsung tanpa Node.js:
./dist/moccipult-windows.exe --help
```

#### Option C: Build per platform
```bash
cd cli
npx pkg . --targets node18-win-x64   --output dist/moccipult-windows.exe
npx pkg . --targets node18-linux-x64 --output dist/moccipult-linux
npx pkg . --targets node18-macos-x64 --output dist/moccipult-macos

# macOS ARM (Apple Silicon):
npx pkg . --targets node18-macos-arm64 --output dist/moccipult-macos-arm
```

### Langkah 3: Setup & Deploy Patch

```bash
# 1. Set server URL
moccipult config server http://localhost:3001

# 2. Interactive setup (register app + create release)
moccipult init
# 📱 App name: My App
# 📦 Package: com.example.myapp
# 📱 Platform: android
# 🏷️  Version: 1.0.0
# 📢 Channel: stable

# 3. Upload patch
moccipult patches upload -r <RELEASE_ID> -f patch.bin
# ✅ Patch is live!

# 4. Cek status
moccipult status
```

---

## 💻 CLI Commands (moccipult)

### Config
```bash
moccipult config server http://your-server.com    # Set server URL
moccipult config show                              # Show all config
moccipult config get server                        # Get specific value
```

### Apps
```bash
moccipult apps create -n "My App" -p com.example.app --platform android
moccipult apps list
```

### Releases
```bash
moccipult releases create -a <APP_ID> -v 1.0.0 --platform android
moccipult releases list -a <APP_ID>
```

### Patches
```bash
moccipult patches upload -r <RELEASE_ID> -f patch.bin         # Upload patch
moccipult patches check -a <APP_ID> -v 1.0.0                  # Check for updates
moccipult patches list -r <RELEASE_ID>                         # List patches
moccipult patches status <PATCH_ID> disabled                   # Disable patch
```

### Init (Quick Setup)
```bash
moccipult init        # Interactive: register app + create release + save config
```

### Status
```bash
moccipult status      # Show server health + local project config
```

---

## 🌍 Deployment ke Server Production

### Option 1: Docker (Paling Gampar)

#### 1. Di server lo (VPS/cloud)
```bash
# Clone project
git clone <your-repo> && cd moccipult

# Edit config
# Ganti SERVER_URL jadi domain/public IP lo
```

Edit `docker-compose.yml`:
```yaml
environment:
  - SERVER_URL=https://patches.yourdomain.com    # ← Ganti ini
  - PORT=3000
```

```bash
# Build & jalankan
docker-compose up -d --build

# Cek
docker-compose logs -f
```

#### 2. Setup reverse proxy + HTTPS

**Caddy (paling gampar, auto HTTPS):**
```
# /etc/caddy/Caddyfile
patches.yourdomain.com {
    reverse_proxy localhost:3000
}
```

**Nginx:**
```nginx
server {
    listen 443 ssl;
    server_name patches.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 3. Di komputer developer
```bash
moccipult config server https://patches.yourdomain.com
moccipult init
moccipult patches upload -r <RELEASE_ID> -f patch.bin
```

### Option 2: VPS Langsung (tanpa Docker)

```bash
# Di server
sudo apt update && sudo apt install -y nodejs npm nginx
git clone <your-repo> && cd moccipult/patch-server
npm install

# Pakai PM2 untuk keep alive
npm install -g pm2
PORT=3000 SERVER_URL=https://patches.yourdomain.com pm2 start src/server.js --name moccipult
pm2 save
pm2 startup    # auto start saat boot

# Setup nginx reverse proxy (lihat config di atas)
```

### Option 3: Railway / Fly.io / Render (Cloud PaaS)

Bisa di-deploy ke cloud platform mana saja yang support Node.js:

```bash
# Railway
railway init
railway up

# Fly.io
fly launch
fly deploy

# Render
# Connect repo → set build command: cd patch-server && npm install
# Set start command: cd patch-server && node src/server.js
# Set env vars: PORT, SERVER_URL, DB_PATH, STORAGE_PATH
```

---

## 🔧 Patching Shorebird Repos (Opsional)

Kalau lo mau pake official Shorebird CLI tapi redirect ke server lo:

```bash
# 1. Clone repos
git clone https://github.com/shorebirdtech/shorebird.git
git clone https://github.com/shorebirdtech/updater.git

# 2. Preview perubahan
python patch_repos.py \
  --shorebird-path ./shorebird \
  --updater-path ./updater \
  --target-url https://patches.yourdomain.com \
  --dry-run

# 3. Apply
python patch_repos.py \
  --shorebird-path ./shorebird \
  --updater-path ./updater \
  --target-url https://patches.yourdomain.com
```

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/apps` | Register new app |
| `GET` | `/api/v1/apps` | List all apps |
| `GET` | `/api/v1/apps/:id` | Get app details |
| `POST` | `/api/v1/releases` | Create release |
| `GET` | `/api/v1/releases?app_id=` | List releases |
| `POST` | `/api/v1/patches/upload` | Upload patch binary |
| `POST` | `/api/v1/patches/check` | Check for updates |
| `GET` | `/api/v1/patches?release_id=` | List patches |
| `PATCH` | `/api/v1/patches/:id/status` | Update patch status |
| `GET` | `/downloads/:release_id/:file` | Download patch file |

---

## 🧪 Testing

```bash
# Start server
cd patch-server && PORT=3001 node src/server.js &

# Run end-to-end tests
node test-server.js

# Expected: 8/8 tests passed ✅
```

---

## 🔒 Security Notes

- Set `API_KEY` di `.env` untuk auth (opsional)
- Wajib HTTPS di production
- Limit upload size di nginx
- Backup SQLite database secara berkala
- Taruh di belakang firewall

---

## 📄 Database Schema

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│      apps        │     │     releases     │     │     patches      │
├─────────────────┤     ├──────────────────┤     ├──────────────────┤
│ id (PK, UUID)   │◄────│ app_id (FK)      │     │ id (PK, UUID)    │
│ name            │     │ id (PK, UUID)    │◄────│ release_id (FK)  │
│ package_name    │     │ version          │     │ patch_number     │
│ platform        │     │ platform         │     │ download_url     │
│ created_at      │     │ channel          │     │ file_hash        │
│ updated_at      │     │ created_at       │     │ file_size        │
└─────────────────┘     └──────────────────┘     │ file_path        │
                                                 │ status           │
                                                 │ created_at       │
                                                 └──────────────────┘
```

---

## 📝 License

MIT
