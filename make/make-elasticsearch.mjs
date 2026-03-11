import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

if (process.argv[2]) process.chdir(resolve(process.argv[2]));

// ─── docker-compose.elasticsearch.yaml ───
const dockerCompose = `
version: "3.8"

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.17.0
    container_name: elasticsearch
    environment:
      - node.name=es-node-1
      - cluster.name=app-cluster
      - discovery.type=single-node
      - xpack.security.enabled=true
      - xpack.security.http.ssl.enabled=false
      - ELASTIC_PASSWORD=\${ELASTIC_PASSWORD:-changeme}
      - bootstrap.memory_lock=true
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
    volumes:
      - es-data:/usr/share/elasticsearch/data
      - ./elasticsearch/elasticsearch.yml:/usr/share/elasticsearch/config/elasticsearch.yml:ro
      - ./elasticsearch/ilm-policy.json:/usr/share/elasticsearch/config/ilm-policy.json:ro
    ports:
      - "9200:9200"
      - "9300:9300"
    networks:
      - elastic
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:9200/_cluster/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
    restart: unless-stopped

  kibana:
    image: docker.elastic.co/kibana/kibana:8.17.0
    container_name: kibana
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
      - ELASTICSEARCH_USERNAME=kibana_system
      - ELASTICSEARCH_PASSWORD=\${ELASTIC_PASSWORD:-changeme}
      - xpack.security.enabled=true
      - xpack.encryptedSavedObjects.encryptionKey=\${KIBANA_ENCRYPTION_KEY:-a]3@mN!9xK#pL7$qR2wT5yU8zA0cE4gI}
    ports:
      - "5601:5601"
    networks:
      - elastic
    depends_on:
      elasticsearch:
        condition: service_healthy
    restart: unless-stopped

volumes:
  es-data:
    driver: local

networks:
  elastic:
    driver: bridge
`;

// ─── elasticsearch.yml ───
const elasticsearchYml = `
# ─── Cluster ───
cluster.name: app-cluster
node.name: es-node-1

# ─── Paths ───
path.data: /usr/share/elasticsearch/data
path.logs: /usr/share/elasticsearch/logs

# ─── Network ───
network.host: 0.0.0.0
http.port: 9200
transport.port: 9300

# ─── Discovery ───
discovery.type: single-node

# ─── Security ───
xpack.security.enabled: true
xpack.security.enrollment.enabled: false
xpack.security.http.ssl.enabled: false
xpack.security.transport.ssl.enabled: false

# ─── Memory ───
bootstrap.memory_lock: true

# ─── Indexing ───
action.auto_create_index: true
action.destructive_requires_name: true

# ─── Logging ───
logger.level: INFO
logger.org.elasticsearch.discovery: DEBUG
`;

// ─── ILM Policy ───
const ilmPolicy = `
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_primary_shard_size": "50gb",
            "max_age": "7d",
            "max_docs": 10000000
          },
          "set_priority": {
            "priority": 100
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": {
            "number_of_shards": 1
          },
          "forcemerge": {
            "max_num_segments": 1
          },
          "set_priority": {
            "priority": 50
          },
          "allocate": {
            "number_of_replicas": 1
          }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "set_priority": {
            "priority": 0
          },
          "allocate": {
            "number_of_replicas": 0
          },
          "freeze": {}
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
`;

// ─── Index Template ───
const indexTemplate = `
{
  "index_patterns": ["app-logs-*"],
  "priority": 200,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 1,
      "index.lifecycle.name": "app-ilm-policy",
      "index.lifecycle.rollover_alias": "app-logs",
      "index.refresh_interval": "5s",
      "index.max_result_window": 50000,
      "analysis": {
        "analyzer": {
          "lowercase_keyword": {
            "type": "custom",
            "tokenizer": "keyword",
            "filter": ["lowercase", "trim"]
          },
          "text_search": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": ["lowercase", "asciifolding", "trim"]
          }
        }
      }
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp": { "type": "date" },
        "level": { "type": "keyword" },
        "message": { "type": "text", "analyzer": "text_search" },
        "service": { "type": "keyword" },
        "environment": { "type": "keyword" },
        "trace_id": { "type": "keyword" },
        "span_id": { "type": "keyword" },
        "user_id": { "type": "keyword" },
        "request": {
          "type": "object",
          "properties": {
            "method": { "type": "keyword" },
            "path": { "type": "keyword" },
            "status_code": { "type": "integer" },
            "duration_ms": { "type": "float" },
            "ip": { "type": "ip" },
            "user_agent": { "type": "text" }
          }
        },
        "error": {
          "type": "object",
          "properties": {
            "type": { "type": "keyword" },
            "message": { "type": "text" },
            "stack": { "type": "text", "index": false }
          }
        },
        "metadata": { "type": "object", "dynamic": true }
      }
    }
  }
}
`;

// ─── Product index template (example CRUD data) ───
const productIndexTemplate = `
{
  "index_patterns": ["app-products-*"],
  "priority": 200,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 1,
      "index.refresh_interval": "1s",
      "index.max_result_window": 50000,
      "analysis": {
        "analyzer": {
          "autocomplete": {
            "type": "custom",
            "tokenizer": "autocomplete_tokenizer",
            "filter": ["lowercase", "asciifolding"]
          },
          "autocomplete_search": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": ["lowercase", "asciifolding"]
          }
        },
        "tokenizer": {
          "autocomplete_tokenizer": {
            "type": "edge_ngram",
            "min_gram": 2,
            "max_gram": 20,
            "token_chars": ["letter", "digit"]
          }
        }
      }
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "id": { "type": "keyword" },
        "name": {
          "type": "text",
          "analyzer": "autocomplete",
          "search_analyzer": "autocomplete_search",
          "fields": {
            "keyword": { "type": "keyword" },
            "suggest": { "type": "completion" }
          }
        },
        "description": { "type": "text" },
        "category": { "type": "keyword" },
        "tags": { "type": "keyword" },
        "price": { "type": "scaled_float", "scaling_factor": 100 },
        "currency": { "type": "keyword" },
        "status": { "type": "keyword" },
        "stock": { "type": "integer" },
        "rating": { "type": "half_float" },
        "location": { "type": "geo_point" },
        "created_at": { "type": "date" },
        "updated_at": { "type": "date" }
      }
    }
  }
}
`;

// ─── src/config/elasticsearch.ts ───
const elasticsearchClient = `
import { Client, type ClientOptions } from '@elastic/elasticsearch';

// ─── Config ───
const esConfig: ClientOptions = {
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
    password: process.env.ELASTICSEARCH_PASSWORD || 'changeme',
  },
  maxRetries: 3,
  requestTimeout: 30_000,
  sniffOnStart: false,
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
  },
};

// ─── Singleton client ───
let client: Client | null = null;

export function getEsClient(): Client {
  if (!client) {
    client = new Client(esConfig);
  }
  return client;
}

// ─── Health check ───
export async function checkEsHealth(): Promise<{ status: string; clusterName: string }> {
  const es = getEsClient();
  const health = await es.cluster.health();
  return {
    status: health.status,
    clusterName: health.cluster_name,
  };
}

// ─── Setup: create ILM + index templates + initial indices ───
export async function setupIndices(): Promise<void> {
  const es = getEsClient();

  // ILM policy
  await es.ilm.putLifecycle({
    name: 'app-ilm-policy',
    body: await import('../../elasticsearch/ilm-policy.json', { with: { type: 'json' } }).then(m => m.default),
  });
  console.log('✅ ILM policy created');

  // Log index template
  await es.indices.putIndexTemplate({
    name: 'app-logs-template',
    body: await import('../../elasticsearch/index-template-logs.json', { with: { type: 'json' } }).then(m => m.default),
  });
  console.log('✅ Logs index template created');

  // Product index template
  await es.indices.putIndexTemplate({
    name: 'app-products-template',
    body: await import('../../elasticsearch/index-template-products.json', { with: { type: 'json' } }).then(m => m.default),
  });
  console.log('✅ Products index template created');

  // Bootstrap indices (if not exist)
  const logsExists = await es.indices.exists({ index: 'app-logs-000001' });
  if (!logsExists) {
    await es.indices.create({
      index: 'app-logs-000001',
      body: { aliases: { 'app-logs': { is_write_index: true } } },
    });
    console.log('✅ app-logs-000001 bootstrapped');
  }

  const productsExists = await es.indices.exists({ index: 'app-products' });
  if (!productsExists) {
    await es.indices.create({ index: 'app-products' });
    console.log('✅ app-products index created');
  }
}

// ─── Graceful shutdown ───
export async function closeEsClient(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
`;

// ─── src/services/elasticsearch.service.ts ───
const elasticsearchService = `
import { getEsClient } from '../config/elasticsearch';
import type {
  SearchRequest,
  SearchResponse,
  BulkRequest,
  BulkResponse,
} from '@elastic/elasticsearch/lib/api/types';

// ─── Generic search helper ───
export async function search<T>(
  index: string,
  query: SearchRequest['body'],
  options: { from?: number; size?: number; sort?: Record<string, 'asc' | 'desc'>[] } = {},
): Promise<{ hits: T[]; total: number }> {
  const es = getEsClient();
  const { from = 0, size = 20, sort } = options;

  const result: SearchResponse<T> = await es.search({
    index,
    body: { ...query, from, size, sort, track_total_hits: true },
  });

  return {
    hits: result.hits.hits.map((h) => ({ _id: h._id, ...h._source } as T)),
    total: typeof result.hits.total === 'number' ? result.hits.total : result.hits.total!.value,
  };
}

// ─── Full-text search with highlights ───
export async function fullTextSearch<T>(
  index: string,
  queryText: string,
  fields: string[],
  options: { from?: number; size?: number; filters?: Record<string, unknown>[] } = {},
): Promise<{ hits: (T & { _highlights?: Record<string, string[]> })[]; total: number }> {
  const es = getEsClient();
  const { from = 0, size = 20, filters = [] } = options;

  const must: unknown[] = [
    {
      multi_match: {
        query: queryText,
        fields,
        type: 'best_fields',
        fuzziness: 'AUTO',
      },
    },
  ];

  const result: SearchResponse<T> = await es.search({
    index,
    body: {
      from,
      size,
      query: {
        bool: { must, filter: filters },
      },
      highlight: {
        fields: Object.fromEntries(fields.map((f) => [f, {}])),
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
      },
      track_total_hits: true,
    },
  });

  return {
    hits: result.hits.hits.map((h) => ({
      _id: h._id,
      ...h._source,
      _highlights: h.highlight,
    })) as (T & { _highlights?: Record<string, string[]> })[],
    total: typeof result.hits.total === 'number' ? result.hits.total : result.hits.total!.value,
  };
}

// ─── Autocomplete / suggest ───
export async function autocomplete(
  index: string,
  field: string,
  prefix: string,
  size = 10,
): Promise<string[]> {
  const es = getEsClient();
  const result = await es.search({
    index,
    body: {
      suggest: {
        suggestions: {
          prefix,
          completion: {
            field: \`\${field}.suggest\`,
            size,
            skip_duplicates: true,
            fuzzy: { fuzziness: 'AUTO' },
          },
        },
      },
      _source: false,
    },
  });

  const suggestions = result.suggest?.suggestions;
  if (!suggestions || !Array.isArray(suggestions)) return [];
  return suggestions.flatMap((s: any) => s.options.map((o: any) => o.text));
}

// ─── Index single document ───
export async function indexDocument<T extends Record<string, unknown>>(
  index: string,
  id: string,
  doc: T,
): Promise<void> {
  const es = getEsClient();
  await es.index({ index, id, body: doc, refresh: 'wait_for' });
}

// ─── Bulk index ───
export async function bulkIndex<T extends Record<string, unknown>>(
  index: string,
  docs: { id: string; doc: T }[],
): Promise<BulkResponse> {
  const es = getEsClient();
  const body: BulkRequest['body'] = docs.flatMap(({ id, doc }) => [
    { index: { _index: index, _id: id } },
    doc,
  ]);
  return es.bulk({ body, refresh: 'wait_for' });
}

// ─── Delete document ───
export async function deleteDocument(index: string, id: string): Promise<void> {
  const es = getEsClient();
  await es.delete({ index, id, refresh: 'wait_for' });
}

// ─── Aggregate ───
export async function aggregate(
  index: string,
  aggs: Record<string, unknown>,
  query?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const es = getEsClient();
  const result = await es.search({
    index,
    body: { size: 0, query: query || { match_all: {} }, aggs },
  });
  return result.aggregations as Record<string, unknown>;
}
`;

// ─── scripts/es-setup.ts ───
const setupScript = `
import { setupIndices, checkEsHealth, closeEsClient } from '../src/config/elasticsearch';

async function main() {
  console.log('🔌 Connecting to Elasticsearch...');

  const health = await checkEsHealth();
  console.log(\`📊 Cluster: \${health.clusterName} | Status: \${health.status}\`);

  if (health.status === 'red') {
    console.error('❌ Cluster is RED, aborting setup');
    process.exit(1);
  }

  await setupIndices();
  console.log('\\n✅ Elasticsearch setup complete!');

  await closeEsClient();
}

main().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
`;

// ─── .env.elasticsearch ───
const envFile = `
# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=changeme

# Kibana
KIBANA_ENCRYPTION_KEY=a]3@mN!9xK#pL7$qR2wT5yU8zA0cE4gI
`;

// ─── Write all files ───
const dirs = [
  "elasticsearch",
  "src/config",
  "src/services",
  "scripts",
];

for (const d of dirs) {
  if (!existsSync(d)) {
    mkdirSync(d, { recursive: true });
  }
}

const files = [
  { name: "docker-compose.elasticsearch.yaml", content: dockerCompose },
  { name: "elasticsearch/elasticsearch.yml", content: elasticsearchYml },
  { name: "elasticsearch/ilm-policy.json", content: ilmPolicy },
  { name: "elasticsearch/index-template-logs.json", content: indexTemplate },
  { name: "elasticsearch/index-template-products.json", content: productIndexTemplate },
  { name: "src/config/elasticsearch.ts", content: elasticsearchClient },
  { name: "src/services/elasticsearch.service.ts", content: elasticsearchService },
  { name: "scripts/es-setup.ts", content: setupScript },
  { name: ".env.elasticsearch", content: envFile },
];

for (const file of files) {
  if (!existsSync(file.name)) {
    writeFileSync(file.name, file.content.trim());
    console.log(`✅ ${file.name} created`);
  } else {
    console.log(`⚠️ ${file.name} already exists`);
  }
}

console.log(`
🚀 Elasticsearch setup done!

Files:
  docker-compose.elasticsearch.yaml     → ES 8.17 + Kibana (single-node dev)
  elasticsearch/elasticsearch.yml       → ES config
  elasticsearch/ilm-policy.json         → ILM: hot → warm → cold → delete (7d/30d/90d)
  elasticsearch/index-template-logs.json     → Logs index template (structured logging)
  elasticsearch/index-template-products.json → Products index template (autocomplete, geo)
  src/config/elasticsearch.ts           → Client singleton + health check + setup
  src/services/elasticsearch.service.ts → Search, full-text, autocomplete, bulk, aggregation
  scripts/es-setup.ts                   → Bootstrap script (ILM + templates + indices)
  .env.elasticsearch                    → Environment variables

Install:
  npm i @elastic/elasticsearch

Scripts (add to package.json):
  "es:up": "docker compose -f docker-compose.elasticsearch.yaml up -d",
  "es:down": "docker compose -f docker-compose.elasticsearch.yaml down",
  "es:setup": "npx tsx scripts/es-setup.ts",
  "es:reset": "docker compose -f docker-compose.elasticsearch.yaml down -v && docker compose -f docker-compose.elasticsearch.yaml up -d"

Quick start:
  1. npm run es:up          → Start ES + Kibana
  2. npm run es:setup       → Create ILM, templates, indices
  3. Open http://localhost:5601  → Kibana
  4. Open http://localhost:9200  → ES API
`);
