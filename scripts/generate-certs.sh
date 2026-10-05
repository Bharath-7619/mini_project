#!/bin/bash
set -e

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout kong/certs/kong.key \
  -out kong/certs/kong.crt \
  -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
