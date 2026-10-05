#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Running API tests..."

# 1. Test: Get OAuth2 token with valid credentials
echo -n "Test 1: Get OAuth2 token... "
TOKEN_RES=$(curl -s -k -X POST https://localhost:8443/nms/oauth2/token \
  -d "grant_type=client_credentials" \
  -d "client_id=nms-client-id" \
  -d "client_secret=nms-client-secret" \
  -d "scope=nms-read nms-write")

TOKEN=$(echo $TOKEN_RES | grep -o '"access_token":"[^"]*' | grep -o '[^"]*$')

if [ -n "$TOKEN" ]; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL${NC}"
  echo "Response: $TOKEN_RES"
  exit 1
fi

# 2. Test: Access API with valid token
echo -n "Test 2: Access API with valid token... "
STATUS_CODE=$(curl -s -k -o /dev/null -w "%{http_code}" -X GET https://localhost:8443/nms/rest/info \
  -H "Authorization: Bearer $TOKEN")
if [ "$STATUS_CODE" -eq 200 ]; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL (HTTP $STATUS_CODE)${NC}"
fi

# 3. Test: Access API without token
echo -n "Test 3: Access API without token... "
STATUS_CODE=$(curl -s -k -o /dev/null -w "%{http_code}" -X GET https://localhost:8443/nms/rest/info)
if [ "$STATUS_CODE" -eq 401 ]; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL (HTTP $STATUS_CODE)${NC}"
fi

# 4. Test: Access API with invalid token
echo -n "Test 4: Access API with invalid token... "
STATUS_CODE=$(curl -s -k -o /dev/null -w "%{http_code}" -X GET https://localhost:8443/nms/rest/info \
  -H "Authorization: Bearer invalidtoken123")
if [ "$STATUS_CODE" -eq 401 ]; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL (HTTP $STATUS_CODE)${NC}"
fi

# 5. Test: Verify HTTPS on port 8443 works
echo -n "Test 5: Verify HTTPS on port 8443... "
if curl -s -k -I https://localhost:8443 > /dev/null; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL${NC}"
fi

# 6. Test: Rate limiting headers present in response
echo -n "Test 6: Rate limiting headers present... "
HEADERS=$(curl -s -k -I -X GET https://localhost:8443/nms/rest/info -H "Authorization: Bearer $TOKEN")
if echo "$HEADERS" | grep -qi "X-RateLimit-Limit-Minute"; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL${NC}"
fi

# 7. Test: Rate limiting enforced
echo -n "Test 7: Rate limiting enforced (sending 110 requests)... "
PASS=false
for i in {1..110}; do
  STATUS=$(curl -s -k -o /dev/null -w "%{http_code}" -X GET https://localhost:8443/nms/rest/info -H "Authorization: Bearer $TOKEN")
  if [ "$STATUS" -eq 429 ]; then
    PASS=true
    break
  fi
done

if [ "$PASS" = true ]; then
  echo -e "${GREEN}PASS (429 Too Many Requests received)${NC}"
else
  echo -e "${RED}FAIL (No 429 received)${NC}"
fi

echo "API tests completed."
