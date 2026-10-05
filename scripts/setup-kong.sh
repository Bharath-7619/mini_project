#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Waiting for Kong to be ready..."
while ! curl -s http://localhost:8001/status > /dev/null; do
  sleep 2
done
echo -e "${GREEN}Kong is ready!${NC}"

# 2. Create the OpenNMS service
echo "Creating OpenNMS service..."
if curl -i -X POST http://localhost:8001/services \
  --data name=opennms-api \
  --data url=http://opennms:8980/opennms > /dev/null 2>&1; then
  echo -e "${GREEN}Service opennms-api created.${NC}"
else
  echo -e "${RED}Failed to create service opennms-api.${NC}"
fi

# 3. Create the route
echo "Creating route..."
if curl -i -X POST http://localhost:8001/services/opennms-api/routes \
  --data name=opennms-route \
  --data "paths[]=/nms" \
  --data strip_path=true > /dev/null 2>&1; then
  echo -e "${GREEN}Route opennms-route created.${NC}"
else
  echo -e "${RED}Failed to create route opennms-route.${NC}"
fi

# 4. Enable OAuth2 plugin
echo "Enabling OAuth2 plugin..."
if curl -i -X POST http://localhost:8001/services/opennms-api/plugins \
  --data name=oauth2 \
  --data config.enable_client_credentials=true \
  --data config.enable_authorization_code=false \
  --data config.enable_implicit_grant=false \
  --data config.enable_password_grant=false \
  --data config.scopes=nms-read \
  --data config.scopes=nms-write \
  --data config.mandatory_scope=true \
  --data config.token_expiration=3600 \
  --data config.accept_http_if_already_terminated=true > /dev/null 2>&1; then
  echo -e "${GREEN}OAuth2 plugin enabled.${NC}"
else
  echo -e "${RED}Failed to enable OAuth2 plugin.${NC}"
fi

# 5. Create a consumer
echo "Creating consumer..."
if curl -i -X POST http://localhost:8001/consumers \
  --data username=nms-client > /dev/null 2>&1; then
  echo -e "${GREEN}Consumer nms-client created.${NC}"
else
  echo -e "${RED}Failed to create consumer nms-client.${NC}"
fi

# 6. Create OAuth2 credentials
echo "Creating OAuth2 credentials..."
if curl -i -X POST http://localhost:8001/consumers/nms-client/oauth2 \
  --data name="NMS Client Application" \
  --data client_id=nms-client-id \
  --data client_secret=nms-client-secret \
  --data redirect_uris=https://localhost:8443/callback > /dev/null 2>&1; then
  echo -e "${GREEN}OAuth2 credentials created.${NC}"
else
  echo -e "${RED}Failed to create OAuth2 credentials.${NC}"
fi

# 7. Add Request Transformer plugin
echo "Adding Request Transformer plugin..."
if curl -i -X POST http://localhost:8001/services/opennms-api/plugins \
  --data name=request-transformer \
  --data config.replace.headers="Authorization:Basic YWRtaW46YWRtaW4=" > /dev/null 2>&1; then
  echo -e "${GREEN}Request Transformer plugin added.${NC}"
else
  echo -e "${RED}Failed to add Request Transformer plugin.${NC}"
fi

# 8. Enable Rate Limiting plugin
echo "Enabling Rate Limiting plugin..."
if curl -i -X POST http://localhost:8001/services/opennms-api/plugins \
  --data name=rate-limiting \
  --data config.minute=100 \
  --data config.hour=1000 \
  --data config.policy=local \
  --data config.fault_tolerant=true \
  --data config.hide_client_headers=false > /dev/null 2>&1; then
  echo -e "${GREEN}Rate Limiting plugin enabled.${NC}"
else
  echo -e "${RED}Failed to enable Rate Limiting plugin.${NC}"
fi

# 9. Enable CORS plugin
echo "Enabling CORS plugin..."
if curl -i -X POST http://localhost:8001/services/opennms-api/plugins \
  --data name=cors \
  --data config.origins=http://localhost:3000 \
  --data config.origins=https://localhost:8443 \
  --data config.methods=GET \
  --data config.methods=POST \
  --data config.methods=PUT \
  --data config.methods=DELETE \
  --data config.methods=OPTIONS \
  --data config.headers=Authorization \
  --data config.headers=Content-Type \
  --data config.headers=Accept \
  --data config.credentials=true > /dev/null 2>&1; then
  echo -e "${GREEN}CORS plugin enabled.${NC}"
else
  echo -e "${RED}Failed to enable CORS plugin.${NC}"
fi

echo -e "${GREEN}Kong setup complete!${NC}"
