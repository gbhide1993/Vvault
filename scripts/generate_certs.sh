#!/bin/bash
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/vvault.key \
  -out certs/vvault.crt \
  -subj "/C=US/ST=Local/L=Local/O=Vvault/CN=localhost"
echo "Certificates generated in ./certs/"
