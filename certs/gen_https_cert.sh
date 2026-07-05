#!/usr/bin/env bash

openssl genrsa -out blog.key 4096
openssl req -new -key blog.key -out blog.csr
openssl x509 -req -in blog.csr -CA ~/certs/CA.pem -CAkey ~/certs/CA.key -CAcreateserial -out blog.crt -days 825 -sha256 -extfile blog.ext


# https://deliciousbrains.com/ssl-certificate-authority-for-local-https-development/
# if [ "$#" -ne 1 ]
# then
#   echo "Usage: Must supply a domain"
#   exit 1
# fi

# DOMAIN=$1

# cd ~/certs

# openssl genrsa -out $DOMAIN.key 4096
# openssl req -new -key $DOMAIN.key -out $DOMAIN.csr

# cat > $DOMAIN.ext << EOF
# authorityKeyIdentifier=keyid,issuer
# basicConstraints=CA:FALSE
# keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
# subjectAltName = @alt_names
# [alt_names]
# DNS.1 = $DOMAIN
# EOF

# openssl x509 -req -in $DOMAIN.csr -CA ~/certs/CA.pem -CAkey ~/certs/CA.key -CAcreateserial -out $DOMAIN.crt -days 825 -sha256 -extfile $DOMAIN.ext
