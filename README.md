# AFC Private Listing Network

A full-stack web application for the AFC / AHA Private Listing Network where listing agents can publish off-market homes, buyers can browse inventory, maintain saved searches, and receive targeted email notifications when new properties hit their preferred areas.

## Features

- **Role-based authentication** — Agents and buyers can register/login with JWT-secured sessions.
- **Listing management** — Agents create, edit, and remove their own private listings with rich property details.
- **Advanced discovery** — Buyers can filter inventory by neighborhood, price range, and bedroom/bathroom counts.
- **Saved searches** — Buyers define reusable search profiles tied to specific areas and budget criteria.
- **Targeted alerts** — When an agent publishes a home, buyers with matching saved searches automatically receive an email (logged for auditing).
- **Responsive UI** — Modern, mobile-friendly interface built with vanilla HTML/CSS/JS that consumes the REST API.

## Tech stack

| Layer   | Technology |
|---------|------------|
| API     | Node.js, Express, Mongoose, JSON Web Tokens |
| Database| MongoDB |
| Email   | Nodemailer (JSON transport + Mongo audit log) |
| Frontend| Vanilla JS, modular ES builds, modern CSS |
| Testing | Jest, Supertest, mongodb-memory-server |

## Project structure

```
.
├── client/                # Static frontend assets
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── server/                # Express API
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   ├── jest.config.js
│   └── .env.example
└── README.md
```

## Getting started

### Prerequisites

- Node.js 18+
- npm 9+
- MongoDB 6+ accessible via a connection string (local or Atlas)

### Backend setup

```bash
cd server
cp .env.example .env
# Update MONGODB_URI and JWT_SECRET in .env
npm install
npm run dev        # starts the API on http://localhost:4000
```

The server automatically runs database migrations via Mongoose models. The `/api/health` endpoint returns status and timestamp for quick diagnostics.

### Frontend setup

The Express server automatically serves the static assets under `client/`. After running `npm run dev` (or `npm start` in production) visit:

```
http://localhost:4000
```

If you prefer a standalone static host, copy `client/` to your provider of choice and set the `SERVE_CLIENT=false` environment variable on the API so it only exposes JSON endpoints.

### Running tests

Integration tests cover authentication, listing creation, access control, and email logging.

```bash
cd server
npm test
```

Tests run against an in-memory MongoDB instance so they do not affect your local database.

## API highlights

- `POST /api/auth/register` — Create buyer or agent accounts.
- `POST /api/auth/login` — Obtain a JWT token for subsequent requests.
- `GET /api/listings` — Query listings with optional filters (`area`, `city`, `minPrice`, etc.).
- `POST /api/listings` — Agents publish new listings (triggers saved-search email workflow).
- `GET /api/users/me/saved-searches` — Buyers manage saved searches.

Refer to the source inside `server/src/routes` for full request/response schemas.

## Email notifications

The project uses Nodemailer’s JSON transport by default so development and automated tests log email payloads instead of sending live emails. Messages are recorded in the `EmailLog` collection for transparency. Configure a real SMTP transport in `server/src/services/emailService.js` to integrate with production mail providers.

## Deployment notes

- Serve the frontend and backend from the same domain or configure CORS on the API layer.
- Set `JWT_SECRET` to a strong, random value in production.
- Configure environment variables for MongoDB, SMTP credentials, and custom email sender addresses.
- Consider provisioning MongoDB Atlas with multi-region replication for high availability.

---

Designed for the AFC community to share exclusive inventory while keeping buyers engaged with targeted alerts.
