# TASK: BUILD A SELF-HOSTED SHOREBIRD ALTERNATIVE (WHITE LABEL)

I want to build a self-hosted, white-labeled version of the Shorebird Code Push system. 
You need to create a custom patch server and a script to modify the official Shorebird repositories to talk to our custom server instead of api.shorebird.dev.

Please execute the following tasks:

## TASK 1: CREATE THE CUSTOM PATCH SERVER
Write a lightweight, production-ready backend server (Node.js/Express with SQLite OR Python/FastAPI with SQLite) that mimics the Shorebird patch checking and upload protocol.
It must include:
1. Database Schema: Tables for `apps`, `releases` (app version, platform), and `patches` (patch number, download URL, file hash, file size).
2. Endpoint `POST /api/v1/apps`: For registering new apps.
3. Endpoint `POST /api/v1/patches/upload`: For uploading patch binaries (saving them locally or S3-like storage and recording details in the DB).
4. Endpoint `POST /api/v1/patches/check`: For the Flutter app to call at runtime to check if a new patch number exists compared to the client's current patch number. Return the download URL, hash, and size.

## TASK 2: REPOSITORY PATCHING SCRIPT
Write an automation script (Python or Shell) that will:
1. Scan the cloned directories of the Shorebird CLI (`github.com/shorebirdtech/shorebird`) and the Rust updater (`github.com/shorebirdtech/updater`).
2. Search for all hardcoded Shorebird API endpoints (like `api.shorebird.dev`, `api.shorebird.cloud`, and `shorebird.cloud`).
3. Replace them with our custom local server URL (e.g. `http://localhost:3000` or load it from an environment variable `SHOREBIRD_API_URL`).

## TASK 3: DOCKER & DEPLOYMENT SETUP
Generate a Dockerfile and docker-compose.yml to run the patch server along with its SQLite database, exposing it on port 3000.

Please write all files to the workspace, keep them modular, and provide clear step-by-step instructions on how to run the backend and execute the patching script.