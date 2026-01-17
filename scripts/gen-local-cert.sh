#!/usr/bin/env bash
set -euo pipefail

IP=${1:-""}
if [[ -z "$IP" ]]; then
  echo "Usage: ./scripts/gen-local-cert.sh YOUR_LOCAL_IP"
  exit 1
fi

mkdir -p client/certs server/certs

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 \
  -keyout client/certs/local-key.pem \
  -out client/certs/local-cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${IP}"

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 \
  -keyout server/certs/local-key.pem \
  -out server/certs/local-cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${IP}"

echo "Created certs in client/certs and server/certs"
