# 🚀 Project 18: Complete Setup & Deployment Guide

This guide walks you through setting up and running the **Secure API Gateway for OpenNMS Northbound Interfaces** from scratch on any computer (Windows, macOS, or Linux).

---

## 📋 System Prerequisites

Before starting, ensure your machine meets the following requirements:

| Component | Minimum Requirement | Recommended |
|---|---|---|
| **Operating System** | Windows 10/11 (64-bit), macOS, or Linux | Windows 11 with WSL 2 |
| **CPU Architecture** | x86_64 / AMD64 (Intel or AMD) | 4+ Cores |
| **RAM** | 8 GB | 16 GB |
| **Free Disk Space** | 8 GB on primary drive | 15 GB+ |
| **Required Software** | **Docker Desktop** (Engine 24+), **Git** | Docker Compose v2+ |

> [!IMPORTANT]
> **Windows Users:** Make sure **WSL 2** is enabled and **Docker Desktop is set to "Use WSL 2 based engine"** in Docker Desktop Settings ➔ General.

---

## ⚡ Quick Start (5 Steps)

### Step 1: Clone the Repository

Open your terminal (PowerShell, Command Prompt, or Git Bash) and run:

```bash
git clone <YOUR_REPOSITORY_URL>
cd project_name
```

---

### Step 2: Configure Environment Variables

Create your local `.env` configuration file from the provided template:

* **Windows PowerShell:**
  ```powershell
  Copy-Item .env.example .env
  ```
* **Windows Command Prompt (cmd):**
  ```cmd
  copy .env.example .env
  ```
* **Linux / macOS / Git Bash:**
  ```bash
  cp .env.example .env
  ```

Open `.env` in any text editor and set your passwords (or leave default for local testing):
```env
# PostgreSQL password for OpenNMS database
POSTGRES_PASSWORD=Password@7890

# PostgreSQL password for Kong database
KONG_DB_PASSWORD=Passsword@1234
```

---

### Step 3: Generate TLS/SSL Certificates

Kong Gateway requires a valid TLS certificate and private key (`kong.crt` and `kong.key`) to serve encrypted HTTPS on port 8443.

* **Using Git Bash / Linux / macOS:**
  ```bash
  bash scripts/generate-certs.sh
  ```
* **Using Windows PowerShell with Git installed:**
  ```powershell
  & "C:\Program Files\Git\usr\bin\openssl.exe" req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "kong/certs/kong.key" -out "kong/certs/kong.crt" -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  ```

Verify that both `kong/certs/kong.crt` and `kong/certs/kong.key` exist.

---

### Step 4: Build and Start All Containers

Start the full containerized environment using Docker Compose:

```bash
docker compose up -d --build
```

This starts **6 coordinated services**:
1. `nms-database` (PostgreSQL 15 for OpenNMS)
2. `kong-database` (PostgreSQL 15 for Kong)
3. `kong-migration` (Initializes Kong database schema and exits)
4. `opennms` (OpenNMS Horizon 36.0.4 server)
5. `kong` (Kong API Gateway 3.9 on ports 8000, 8001, 8443)
6. `nms-dashboard` (React + Vite + Tailwind frontend on port 3000)

> [!NOTE]
> **Wait 60 to 90 seconds** after starting Docker Compose. OpenNMS Horizon is a full Java/OSGi enterprise platform and takes about a minute to initialize its internal database tables on first boot.

You can verify all containers are healthy with:
```bash
docker compose ps
```

---

### Step 5: Configure the Kong API Gateway

Once the containers are up, configure the OAuth2 security plugin, Rate Limiting, Request Transformer, and CORS on Kong via its Admin API:

* **Using Git Bash / WSL / Linux / macOS:**
  ```bash
  bash scripts/setup-kong.sh
  ```
* **Using Windows (via Git Bash):**
  ```powershell
  & "C:\Program Files\Git\bin\bash.exe" scripts/setup-kong.sh
  ```

You should see all green checkmarks:
```
Waiting for Kong to be ready...
Kong is ready!
Creating OpenNMS service...
Service opennms-api created.
Creating route...
Route opennms-route created.
Enabling OAuth2 plugin...
OAuth2 plugin enabled.
Creating consumer...
Consumer nms-client created.
Creating OAuth2 credentials...
OAuth2 credentials created.
Adding Request Transformer plugin...
Request Transformer plugin added.
Enabling Rate Limiting plugin...
Rate Limiting plugin enabled.
Enabling CORS plugin...
CORS plugin enabled.
Kong setup complete!
```

---

## 🌐 Accessing the Application

Once setup is complete, open your browser to the following URLs:

| Service | URL | Default Credentials / Purpose |
|---|---|---|
| 🖥️ **Web Dashboard** | **[http://localhost:3000](http://localhost:3000)** | Client ID: `nms-client-id`<br>Client Secret: `nms-client-secret` |
| 🔒 **Kong Gateway (HTTPS)** | `https://localhost:8443/nms/rest/info` | Secured via OAuth2 Bearer Token |
| ⚙️ **Kong Admin API** | [http://localhost:8001](http://localhost:8001) | Gateway Management & Plugins |
| 📊 **OpenNMS Native Web UI** | [http://localhost:8980/opennms](http://localhost:8980/opennms) | User: `admin`<br>Password: `admin` |

---

## 🧪 Verifying with Automated Tests

Run the included automated test suite to verify all 7 security layers:

```bash
bash scripts/test-api.sh
```

**Expected output:**
```
Running API tests...
Test 1: Get OAuth2 token........................... PASS
Test 2: Access API with valid token................ PASS
Test 3: Access API without token (401)............. PASS
Test 4: Access API with invalid token (401)........ PASS
Test 5: Verify HTTPS on port 8443.................. PASS
Test 6: Rate limiting headers present.............. PASS
Test 7: Rate limiting enforced (110 burst)......... PASS (429 Too Many Requests received)
API tests completed.
```

---

## 🛑 Stopping and Restarting

* **To stop all services:**
  ```bash
  docker compose down
  ```
* **To stop all services and delete database volumes (complete reset):**
  ```bash
  docker compose down -v
  ```
* **To start everything again:**
  ```bash
  docker compose up -d
  ```

---

## 🔧 Troubleshooting Common Issues

### 1. `docker: command not found`
* **Fix:** Docker Desktop is not installed or not in your system PATH. Make sure Docker Desktop is running and open.

### 2. `Error response from daemon: Docker Desktop is unable to start` (or `ENOSPC`)
* **Fix:** Your primary system drive (usually `C:`) ran out of disk space. Free up at least 5–10 GB of disk space on `C:` drive and restart Docker Desktop.

### 3. "This app can't run on your PC" when installing Docker on Windows
* **Fix:** You downloaded the **ARM64** version of Docker Desktop instead of the **Intel/AMD x86_64** version. Download the correct [Docker Desktop for Windows (x86_64)](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe).

### 4. `502 Bad Gateway` when calling `/nms/rest/info`
* **Fix:** OpenNMS is still completing its internal boot sequence. Wait 60 seconds and try again. You can check OpenNMS logs with `docker logs -f opennms`.

### 5. `Route not matched` or `404 Not Found`
* **Fix:** You need to re-run the gateway configuration script: `bash scripts/setup-kong.sh`.

### 6. SSL Certificate Warning in Browser or cURL
* **Fix:** The gateway uses a self-signed TLS certificate for local development (`localhost`). When testing with `curl`, include the `-k` (insecure) flag. In your web browser, click *Advanced ➔ Proceed to localhost (unsafe)* if prompted.
