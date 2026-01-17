# Live Learning Platform

Full-stack demo for a live learning classroom with teacher approval and real-time chat.

## Stack
- React (Vite)
- Tailwind CSS
- Node.js (Express)
- Socket.io

## Project Structure
```
client  # React + Tailwind + Lucide Icons
server  # Express + Socket.io
```

## Setup

### 1) Install dependencies
```
cd server
npm install

cd ../client
npm install
```

### 2) Run servers
```
cd server
npm run dev

cd ../client
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:4000

## Local Network Access
To access from another device on the same Wi-Fi:

1) Find your local IP (example: 192.168.1.20)
2) Set API URL for the client
```
cp client/.env.example client/.env
```
Edit `client/.env` to:
```
VITE_API_URL=http://YOUR_LOCAL_IP:4000
```
3) Run the client (Vite will listen on all interfaces)
```
cd client
npm run dev
```
4) Open from another device:
```
http://YOUR_LOCAL_IP:5173
```

## Screen Sharing on Mobile / Local Network (HTTPS)
Browsers only allow screen sharing on secure contexts (HTTPS or localhost). For
local network access, use HTTPS with a trusted certificate.

### Mock cert (self-signed)
If you don't want mkcert, you can generate a self-signed cert. You will need to
accept the certificate warning on each device.

```
./scripts/gen-local-cert.sh YOUR_LOCAL_IP
```

Then start with:
```
cd server
SSL_KEY=./certs/local-key.pem SSL_CERT=./certs/local-cert.pem npm run dev

cd ../client
VITE_SSL_KEY=./certs/local-key.pem VITE_SSL_CERT=./certs/local-cert.pem npm run dev
```

### Quick HTTPS with mkcert
1) Install mkcert (one time)
```
brew install mkcert
mkcert -install
```
2) Create certs for your local IP
```
mkdir -p client/certs
mkdir -p server/certs
mkcert -key-file client/certs/local-key.pem -cert-file client/certs/local-cert.pem localhost 127.0.0.1 YOUR_LOCAL_IP
mkcert -key-file server/certs/local-key.pem -cert-file server/certs/local-cert.pem localhost 127.0.0.1 YOUR_LOCAL_IP
```
3) Set env values
```
cp client/.env.example client/.env
```
Edit `client/.env`:
```
VITE_API_URL=https://YOUR_LOCAL_IP:4000
VITE_SSL_KEY=./certs/local-key.pem
VITE_SSL_CERT=./certs/local-cert.pem
```
4) Start servers with SSL paths
```
cd server
SSL_KEY=./certs/local-key.pem SSL_CERT=./certs/local-cert.pem npm run dev

cd ../client
npm run dev
```
5) Trust the mkcert CA on your phone
- iOS: AirDrop the `~/.local/share/mkcert/rootCA.pem` to your phone, install it in Settings > General > VPN & Device Management, then enable full trust.
- Android: Install the CA certificate from `~/.local/share/mkcert/rootCA.pem`.

6) Open on phone:
```
https://YOUR_LOCAL_IP:5173
```

## Docker (Client uses Let's Encrypt)
This setup serves the React client with Caddy and issues Let's Encrypt
certificates automatically.

### 1) Set your domain and email
Create a `.env` at repo root:
```
DOMAIN=your-domain.com
ACME_EMAIL=you@example.com
LIVEKIT_API_KEY=change_me_key
LIVEKIT_API_SECRET=change_me_secret
LIVEKIT_URL=wss://your-domain.com:7881
```

### 2) Start services
```
docker compose up --build
```

### 3) Open in browser
```
https://your-domain.com
```

Notes:
- Ports 80 and 443 must be open and routed to this machine.
- LiveKit signaling is proxied by Caddy on 443; keep UDP 50000-51000 open for media.
- Caddy stores certs in Docker volumes `caddy_data` and `caddy_config`.

## Notes
- Authentication is mocked on the client.
- Teachers must approve students before they can chat.
- Rooms and chat history are stored in memory.
