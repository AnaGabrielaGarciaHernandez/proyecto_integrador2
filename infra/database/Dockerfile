FROM postgres:18-alpine

COPY infra/database/bootstrap/ /docker-entrypoint-initdb.d/
COPY infra/database/seeds/ /opt/ecobazar/seeds/
