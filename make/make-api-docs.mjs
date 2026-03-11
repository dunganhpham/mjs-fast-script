import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
if (process.argv[2]) process.chdir(resolve(process.argv[2]));

// ─── OpenAPI spec (openapi.yaml) ───
const openapiSpec = `
openapi: 3.1.0
info:
  title: My App API
  description: |
    RESTful API for My App.

    ## Authentication
    Most endpoints require a Bearer JWT token in the Authorization header:
    \`Authorization: Bearer <token>\`

    ## Rate Limiting
    - General: 100 requests/minute
    - Auth: 10 requests/15 minutes
    - Upload: 5 requests/minute

    ## Pagination
    List endpoints support pagination via query parameters:
    - \`page\` (default: 1)
    - \`limit\` (default: 20, max: 100)
    - \`sortBy\` (field name)
    - \`sortOrder\` (asc | desc)
  version: 1.0.0
  contact:
    name: API Support
    email: api@example.com
    url: https://docs.example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: http://localhost:3000/api/v1
    description: Local development
  - url: https://staging.example.com/api/v1
    description: Staging
  - url: https://api.example.com/api/v1
    description: Production

tags:
  - name: Auth
    description: Authentication & authorization
  - name: Users
    description: User management
  - name: Health
    description: Health checks

paths:
  # ─── Health ───
  /healthz:
    get:
      tags: [Health]
      summary: Health check
      operationId: healthCheck
      security: []
      responses:
        "200":
          description: Service is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: ok
                  uptime:
                    type: number
                    example: 12345.67
                  timestamp:
                    type: string
                    format: date-time

  # ─── Auth ───
  /auth/register:
    post:
      tags: [Auth]
      summary: Register new user
      operationId: register
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/RegisterRequest"
      responses:
        "201":
          description: User registered successfully
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthResponse"
        "400":
          $ref: "#/components/responses/BadRequest"
        "409":
          description: Email already exists

  /auth/login:
    post:
      tags: [Auth]
      summary: Login
      operationId: login
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/LoginRequest"
      responses:
        "200":
          description: Login successful
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthResponse"
        "401":
          $ref: "#/components/responses/Unauthorized"
        "429":
          $ref: "#/components/responses/TooManyRequests"

  /auth/refresh:
    post:
      tags: [Auth]
      summary: Refresh access token
      operationId: refreshToken
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [refreshToken]
              properties:
                refreshToken:
                  type: string
      responses:
        "200":
          description: Token refreshed
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthResponse"
        "401":
          $ref: "#/components/responses/Unauthorized"

  /auth/me:
    get:
      tags: [Auth]
      summary: Get current user
      operationId: getCurrentUser
      responses:
        "200":
          description: Current user info
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SuccessResponse"
        "401":
          $ref: "#/components/responses/Unauthorized"

  # ─── Users ───
  /users:
    get:
      tags: [Users]
      summary: List users
      operationId: listUsers
      parameters:
        - $ref: "#/components/parameters/Page"
        - $ref: "#/components/parameters/Limit"
        - $ref: "#/components/parameters/SortBy"
        - $ref: "#/components/parameters/SortOrder"
        - name: search
          in: query
          schema:
            type: string
          description: Search by name or email
      responses:
        "200":
          description: List of users
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PaginatedResponse"
        "401":
          $ref: "#/components/responses/Unauthorized"

  /users/{id}:
    get:
      tags: [Users]
      summary: Get user by ID
      operationId: getUserById
      parameters:
        - $ref: "#/components/parameters/UserId"
      responses:
        "200":
          description: User details
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SuccessResponse"
        "404":
          $ref: "#/components/responses/NotFound"

    put:
      tags: [Users]
      summary: Update user
      operationId: updateUser
      parameters:
        - $ref: "#/components/parameters/UserId"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UpdateUserRequest"
      responses:
        "200":
          description: User updated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SuccessResponse"
        "400":
          $ref: "#/components/responses/BadRequest"
        "404":
          $ref: "#/components/responses/NotFound"

    delete:
      tags: [Users]
      summary: Delete user
      operationId: deleteUser
      parameters:
        - $ref: "#/components/parameters/UserId"
      responses:
        "204":
          description: User deleted
        "404":
          $ref: "#/components/responses/NotFound"

# ─── Components ───
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  parameters:
    UserId:
      name: id
      in: path
      required: true
      schema:
        type: string
        format: uuid
    Page:
      name: page
      in: query
      schema:
        type: integer
        minimum: 1
        default: 1
    Limit:
      name: limit
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
    SortBy:
      name: sortBy
      in: query
      schema:
        type: string
        default: createdAt
    SortOrder:
      name: sortOrder
      in: query
      schema:
        type: string
        enum: [asc, desc]
        default: desc

  schemas:
    RegisterRequest:
      type: object
      required: [email, password, name]
      properties:
        email:
          type: string
          format: email
          example: user@example.com
        password:
          type: string
          format: password
          minLength: 8
          example: MyP@ssw0rd!
        name:
          type: string
          minLength: 2
          maxLength: 100
          example: John Doe

    LoginRequest:
      type: object
      required: [email, password]
      properties:
        email:
          type: string
          format: email
        password:
          type: string
          format: password

    UpdateUserRequest:
      type: object
      properties:
        name:
          type: string
        email:
          type: string
          format: email
        avatar:
          type: string
          format: uri

    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
        role:
          type: string
          enum: [user, admin]
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    AuthResponse:
      type: object
      properties:
        success:
          type: boolean
          example: true
        data:
          type: object
          properties:
            user:
              $ref: "#/components/schemas/User"
            accessToken:
              type: string
            refreshToken:
              type: string
            expiresIn:
              type: integer
              example: 900

    SuccessResponse:
      type: object
      properties:
        success:
          type: boolean
          example: true
        data:
          type: object

    PaginatedResponse:
      type: object
      properties:
        success:
          type: boolean
          example: true
        data:
          type: array
          items:
            $ref: "#/components/schemas/User"
        meta:
          type: object
          properties:
            page:
              type: integer
            limit:
              type: integer
            total:
              type: integer
            totalPages:
              type: integer

    ErrorResponse:
      type: object
      properties:
        success:
          type: boolean
          example: false
        error:
          type: object
          properties:
            code:
              type: string
            message:
              type: string
            details:
              type: object

  responses:
    BadRequest:
      description: Bad Request
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
          example:
            success: false
            error:
              code: VALIDATION_ERROR
              message: Invalid request body

    Unauthorized:
      description: Unauthorized
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
          example:
            success: false
            error:
              code: UNAUTHORIZED
              message: Invalid or expired token

    NotFound:
      description: Not Found
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
          example:
            success: false
            error:
              code: NOT_FOUND
              message: Resource not found

    TooManyRequests:
      description: Too Many Requests
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
          example:
            success: false
            error:
              code: RATE_LIMIT
              message: Too many requests, please try again later

security:
  - BearerAuth: []
`;

// ─── Swagger setup (src/config/swagger.ts) ───
const swaggerSetup = `
import swaggerJsdoc from 'swagger-jsdoc';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

// Option 1: Load from YAML file
export function loadOpenApiSpec() {
  const file = readFileSync(resolve(process.cwd(), 'docs/openapi.yaml'), 'utf-8');
  return YAML.parse(file);
}

// Option 2: Generate from JSDoc comments
export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'My App API',
      version: '1.0.0',
      description: 'API documentation generated from JSDoc',
    },
    servers: [
      { url: '/api/v1', description: 'Default' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: [
    'src/routes/**/*.ts',
    'src/controllers/**/*.ts',
    'src/models/**/*.ts',
  ],
});

// ─── Usage with Express ───
// import swaggerUi from 'swagger-ui-express';
// app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// app.get('/docs/openapi.json', (_req, res) => res.json(swaggerSpec));
`;

// ─── .redocly.yaml ───
const redoclyConfig = `
# Redocly CLI config
# npx @redocly/cli lint docs/openapi.yaml
# npx @redocly/cli build-docs docs/openapi.yaml -o docs/index.html

extends:
  - recommended

rules:
  tag-description: warn
  operation-description: warn
  no-unused-components: warn
  no-ambiguous-paths: error
  no-http-verbs-in-paths: warn
  path-not-include-query: error

theme:
  openapi:
    htmlTemplate: ./docs/template.html
    theme:
      colors:
        primary:
          main: "#1a73e8"
      typography:
        fontSize: "15px"
        fontFamily: "Inter, system-ui, sans-serif"
      sidebar:
        width: "280px"
`;

// ─── Write files ───
if (!existsSync("docs")) mkdirSync("docs", { recursive: true });
if (!existsSync("src/config")) mkdirSync("src/config", { recursive: true });

const files = [
  { name: "docs/openapi.yaml", content: openapiSpec },
  { name: "src/config/swagger.ts", content: swaggerSetup },
  { name: ".redocly.yaml", content: redoclyConfig },
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
🚀 API Docs setup done!

Files:
  docs/openapi.yaml        → Full OpenAPI 3.1 spec (auth, users, health, pagination, errors)
  src/config/swagger.ts    → Swagger-jsdoc setup + Express integration
  .redocly.yaml            → Redocly linter & docs builder config

Install:
  npm i swagger-jsdoc swagger-ui-express yaml
  npm i -D @redocly/cli @types/swagger-jsdoc @types/swagger-ui-express

Scripts:
  "docs:lint": "redocly lint docs/openapi.yaml",
  "docs:build": "redocly build-docs docs/openapi.yaml -o docs/index.html",
  "docs:preview": "redocly preview-docs docs/openapi.yaml"

Swagger UI: http://localhost:3000/docs
`);
