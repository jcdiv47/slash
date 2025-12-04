# Slash

**Slash** is an open source, self-hosted platform designed to help you organize, manage, and share your most important links. Easily create customizable, human-readable shortcuts to streamline your link management. Use tags to categorize your links and share them easily with your team or publicly.

🧩 Browser extension(v1.0.0) now available! - [Chrome Web Store](https://chrome.google.com/webstore/detail/slash/ebaiehmkammnacjadffpicipfckgeobg), [Firefox Add-on](https://addons.mozilla.org/firefox/addon/your-slash/)

Getting started with Slash's [Shortcuts](https://github.com/yourselfhosted/slash/blob/main/docs/getting-started/shortcuts.md) and [Collections](https://github.com/yourselfhosted/slash/blob/main/docs/getting-started/collections.md).

[👉 Join our Discord 💬](https://discord.gg/QZqUuUAhDV)

<p>
  <a href="https://hub.docker.com/r/yourselfhosted/slash"><img alt="Docker pull" src="https://img.shields.io/docker/pulls/yourselfhosted/slash.svg"/></a>
  <a href="https://discord.gg/QZqUuUAhDV"><img alt="Discord" src="https://img.shields.io/badge/discord-chat-5865f2?logo=discord&logoColor=f5f5f5" /></a>
</p>

![demo](./docs/assets/demo.png)

## Background

In today's workplace, essential information is often scattered across the cloud in the form of links. We understand the frustration of endlessly searching through emails, messages, and websites just to find the right link. Links are notorious for being unwieldy, complex, and easily lost in the shuffle. Remembering and sharing them can be a challenge.

That's why we developed Slash, a solution that transforms these links into easily accessible, discoverable, and shareable shortcuts(e.g., `s/shortcut`). Say goodbye to link chaos and welcome the organizational ease of Slash into your daily online workflow.

## Features

- Create customizable `s/` short links for any URL.
- Share short links public or only with your teammates.
- View analytics on link traffic and sources.
- Easy access to your shortcuts with browser extension.
- Share your shortcuts with Collection to anyone, on any browser.
- Open source self-hosted solution.

## Deploy with Docker in seconds

```bash
docker run -d --name slash -p 5231:5231 -v ~/.slash/:/var/opt/slash yourselfhosted/slash:latest
```

Learn more in [Self-hosting Slash with Docker](https://github.com/yourselfhosted/slash/blob/main/docs/install.md).

## Development

```bash
docker build -t slash-custom .  
docker run -d --name slash -p 5231:5231 -v ~/.slash/:/var/opt/slash slash-custom
```

## Browser Extension

Slash provides a browser extension to help you use your shortcuts in the search bar to go to the corresponding URL.

![browser-extension-example](./docs/assets/browser-extension-example.png)

Learn more in [The Browser Extension of Slash](https://github.com/yourselfhosted/slash/blob/main/docs/install-browser-extension.md).

### Chromium based browsers

For Chromium based browsers(Chrome, Edge, Arc, ...), you can install the extension from the [Chrome Web Store](https://chrome.google.com/webstore/detail/slash/ebaiehmkammnacjadffpicipfckgeobg).

### Firefox

For Firefox, you can install the extension from the [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/your-slash/).

## API

Slash provides both REST and gRPC APIs for interacting with the platform. All REST API endpoints are available at `/api/v1/*` and are auto-generated from gRPC service definitions using grpc-gateway.

### Authentication

Most endpoints require authentication via JWT tokens. You can obtain a token by signing in via the `/api/v1/auth/signin` endpoint.

Include the token in your requests using one of these methods:
- Cookie: `slash.access-token=<token>`
- HTTP Header: `Authorization: Bearer <token>`

**Getting a token:**
```bash
curl -v -X POST http://localhost:5231/api/v1/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your-password"
  }'
```

The token will be in the `Set-Cookie` header as `slash.access-token=<token>` and expires after 7 days.

### Base URL

- Local development: `http://localhost:8082`
- Docker deployment: `http://localhost:5231`

---

### Auth Service

#### Get Auth Status
**POST** `/api/v1/auth/status`

Returns the currently authenticated user.

**Response:** `User` object

#### Sign In
**POST** `/api/v1/auth/signin`

Authenticate with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:** `User` object

#### Sign In with SSO
**POST** `/api/v1/auth/signin/sso`

Authenticate using an SSO identity provider.

**Request Body:**
```json
{
  "idp_id": "provider-id",
  "code": "auth-code",
  "redirect_uri": "https://your-app.com/callback"
}
```

**Response:** `User` object

#### Sign Up
**POST** `/api/v1/auth/signup`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "nickname": "John Doe",
  "password": "password123"
}
```

**Response:** `User` object

#### Sign Out
**POST** `/api/v1/auth/signout`

Sign out the current user.

**Response:** Empty

---

### User Service

#### List Users
**GET** `/api/v1/users`

Get a list of all users (admin only).

**Response:**
```json
{
  "users": [...]
}
```

#### Get User
**GET** `/api/v1/users/{id}`

Get a specific user by ID.

**Response:** `User` object

#### Create User
**POST** `/api/v1/users`

Create a new user (admin only).

**Request Body:**
```json
{
  "email": "user@example.com",
  "nickname": "John Doe",
  "password": "password123",
  "role": "ROLE_USER"
}
```

**Response:** `User` object

#### Update User
**PATCH** `/api/v1/users/{user.id}`

Update user information.

**Request Body:**
```json
{
  "id": 1,
  "nickname": "New Name",
  "email": "newemail@example.com"
}
```

**Note:** Include only the fields you want to update. The `id` field is required and should match the ID in the URL path.

**Response:** `User` object

#### Delete User
**DELETE** `/api/v1/users/{id}`

Delete a user by ID.

**Response:** Empty

#### List User Access Tokens
**GET** `/api/v1/users/{id}/access_tokens`

Get all access tokens for a user.

**Response:**
```json
{
  "access_tokens": [
    {
      "access_token": "token-string",
      "description": "My API token",
      "issued_at": "2024-01-01T00:00:00Z",
      "expires_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### Create User Access Token
**POST** `/api/v1/users/{id}/access_tokens`

Create a new access token for API authentication. This token can be used for long-lived API access instead of using session tokens.

**Request Body:**
```json
{
  "description": "My API token",
  "expires_at": "2025-01-01T00:00:00Z"
}
```

**Note:** The user ID in the URL path specifies which user the token is for. The `expires_at` field is optional.

**Response:** `UserAccessToken` object

#### Delete User Access Token
**DELETE** `/api/v1/users/{id}/access_tokens/{access_token}`

Revoke an access token.

**Response:** Empty

---

### Shortcut Service

#### List Shortcuts
**GET** `/api/v1/shortcuts`

Get all shortcuts accessible to the current user.

**Response:**
```json
{
  "shortcuts": [...]
}
```

#### Get Shortcut
**GET** `/api/v1/shortcuts/{id}`

Get a specific shortcut by ID.

**Response:** `Shortcut` object with fields:
- `id`: Shortcut ID
- `name`: Short name (e.g., "gh" for s/gh)
- `link`: Target URL
- `title`: Display title
- `description`: Optional description
- `tags`: Array of tag strings
- `visibility`: "WORKSPACE" or "PUBLIC"
- `view_count`: Number of times accessed
- `og_metadata`: Open Graph metadata (title, description, image)

#### Create Shortcut
**POST** `/api/v1/shortcuts`

Create a new shortcut.

**Request Body:**
```json
{
  "name": "gh",
  "link": "https://github.com",
  "title": "GitHub",
  "description": "GitHub homepage",
  "tags": ["dev", "tools"],
  "visibility": "WORKSPACE"
}
```

**Note:** The `name` and `link` fields are required. The `visibility` field must be either `WORKSPACE` (visible to workspace members) or `PUBLIC` (visible to everyone).

**Example:**
```bash
curl -X POST http://localhost:5231/api/v1/shortcuts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "example",
    "link": "https://example.com",
    "title": "Example Site",
    "visibility": "WORKSPACE"
  }'
```

**Response:** `Shortcut` object

#### Update Shortcut
**PUT** `/api/v1/shortcuts/{shortcut.id}`

Update an existing shortcut.

**Request Body:**
```json
{
  "id": 1,
  "name": "gh",
  "link": "https://github.com/yourusername",
  "title": "My GitHub"
}
```

**Note:** Include only the fields you want to update. The `id` field is required and should match the ID in the URL path.

**Response:** `Shortcut` object

#### Delete Shortcut
**DELETE** `/api/v1/shortcuts/{id}`

Delete a shortcut.

**Response:** Empty

#### Get Shortcut Analytics
**GET** `/api/v1/shortcuts/{id}/analytics`

Get analytics data for a shortcut (Pro feature).

**Response:**
```json
{
  "references": [
    {"name": "direct", "count": 150},
    {"name": "google.com", "count": 45}
  ],
  "devices": [
    {"name": "desktop", "count": 120},
    {"name": "mobile", "count": 75}
  ],
  "browsers": [
    {"name": "chrome", "count": 100},
    {"name": "firefox", "count": 50}
  ]
}
```

---

### Collection Service

#### List Collections
**GET** `/api/v1/collections`

Get all collections accessible to the current user.

**Response:**
```json
{
  "collections": [...]
}
```

#### Get Collection
**GET** `/api/v1/collections/{id}`

Get a specific collection by ID.

**Response:** `Collection` object with fields:
- `id`: Collection ID
- `name`: URL-friendly name
- `title`: Display title
- `description`: Optional description
- `shortcut_ids`: Array of shortcut IDs in this collection
- `visibility`: "WORKSPACE" or "PUBLIC"

#### Create Collection
**POST** `/api/v1/collections`

Create a new collection.

**Request Body:**
```json
{
  "name": "devtools",
  "title": "Development Tools",
  "description": "Useful development resources",
  "shortcut_ids": [1, 2, 3],
  "visibility": "PUBLIC"
}
```

**Response:** `Collection` object

#### Update Collection
**PUT** `/api/v1/collections/{collection.id}`

Update an existing collection.

**Request Body:**
```json
{
  "id": 1,
  "title": "Updated Title",
  "shortcut_ids": [1, 2, 3, 4]
}
```

**Note:** Include only the fields you want to update. The `id` field is required and should match the ID in the URL path.

**Response:** `Collection` object

#### Delete Collection
**DELETE** `/api/v1/collections/{id}`

Delete a collection.

**Response:** Empty

---

### User Setting Service

#### Get User Setting
**GET** `/api/v1/users/{id}/settings`

Get user preferences and settings.

**Response:**
```json
{
  "user_id": 1,
  "general": {
    "locale": "en",
    "color_theme": "system"
  },
  "access_tokens": {
    "access_tokens": [...]
  }
}
```

#### Update User Setting
**PATCH** `/api/v1/users/{user_setting.user_id}/settings`

Update user settings.

**Request Body:**
```json
{
  "user_id": 1,
  "general": {
    "locale": "zh",
    "color_theme": "dark"
  }
}
```

**Note:** Include only the fields you want to update. The `user_id` field is required and should match the ID in the URL path.

**Response:** `UserSetting` object

---

### Workspace Service

#### Get Workspace Profile
**GET** `/api/v1/workspace/profile`

Get workspace information including mode, version, and subscription.

**Response:**
```json
{
  "mode": "prod",
  "version": "0.1.0",
  "owner": "users/1",
  "subscription": {
    "plan": "FREE",
    "shortcuts_limit": 100,
    "collections_limit": 10,
    "features": []
  },
  "custom_style": "",
  "branding": ""
}
```

#### Get Workspace Setting
**GET** `/api/v1/workspace/setting`

Get workspace configuration (admin only).

**Response:**
```json
{
  "instance_url": "https://slash.example.com",
  "default_visibility": "WORKSPACE",
  "disallow_user_registration": false,
  "disallow_password_auth": false,
  "identity_providers": [...]
}
```

#### Update Workspace Setting
**PATCH** `/api/v1/workspace/setting`

Update workspace configuration (admin only).

**Request Body:**
```json
{
  "instance_url": "https://slash.example.com",
  "default_visibility": "PUBLIC"
}
```

**Note:** Include only the fields you want to update.

**Response:** `WorkspaceSetting` object

---

### Subscription Service

#### Get Subscription
**GET** `/v1/subscription`

Get current workspace subscription details.

**Response:**
```json
{
  "plan": "PRO",
  "started_time": "2024-01-01T00:00:00Z",
  "expires_time": "2025-01-01T00:00:00Z",
  "features": ["analytics", "custom_domain"],
  "seats": 10,
  "shortcuts_limit": -1,
  "collections_limit": -1
}
```

#### Update Subscription
**PATCH** `/v1/subscription`

Activate a subscription with a license key.

**Request Body:**
```json
{
  "license_key": "your-license-key"
}
```

**Response:** `Subscription` object

#### Delete Subscription
**DELETE** `/v1/subscription`

Deactivate the current subscription.

**Response:** `Subscription` object

---

### Common Types

#### User
```json
{
  "id": 1,
  "state": "ACTIVE",
  "created_time": "2024-01-01T00:00:00Z",
  "updated_time": "2024-01-01T00:00:00Z",
  "role": "ADMIN",
  "email": "user@example.com",
  "nickname": "John Doe"
}
```

**Roles:** `ADMIN`, `USER`

**States:** `ACTIVE`, `INACTIVE`

#### Visibility
- `WORKSPACE`: Only accessible to workspace members
- `PUBLIC`: Publicly accessible to anyone

---

### Error Responses

Errors follow standard HTTP status codes and return JSON with error details:

```json
{
  "code": 3,
  "message": "shortcut not found",
  "details": []
}
```

Common status codes:
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error
