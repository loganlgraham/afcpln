# AFCPLN – Private Listing Network

A lightweight Node.js application that powers the AFC/AHA Private Listing Network. It provides three key workflows:

- **List a Property** – Submit a new private listing with photos and rich property details.
- **Find Private Listings** – Filter the inventory with the same polished layout used by the listing form.
- **Register Members** – Onboard buyers or agents and automatically trigger a confirmation email via Resend.

## Getting Started

1. **Install dependencies** – The project uses only Node.js built‑ins, so no packages are required beyond Node 18+
   (the version available in this environment works out of the box).
2. **Configure your environment:**
   - Copy `.env.example` to `.env` and supply your Resend API key so registration emails can be delivered.
   - Optional: set `PORT` or `HOST` if you need the server to bind to a different interface.
3. **Run the server:**

   ```bash
   npm run start
   ```

   The app defaults to <http://localhost:3000>. The UI is served from the `public/` directory, and the JSON APIs, uploads,
   and email integration are handled through `server.js`.

## Key Features

- **Matching layouts:** The “Find Private Listings” filters now share the same responsive, two-column grid and styling as
  the “List a Property” form for a cohesive experience.
- **Photo uploads:** Listing submissions accept a single image up to 10MB. Images are stored on disk inside the `uploads/`
  directory and are immediately displayed in the listings feed.
- **Automatic confirmation email:** Successful registrations call the Resend API using `RESEND_API_KEY` and send a branded
  welcome email. Failures return a helpful error so administrators know the email needs attention.

## Data Persistence

Submitted properties and registered users are stored as JSON arrays inside the `data/` directory. This keeps the app
lightweight while providing a simple audit trail that you can back up or replace with a database later.

## Available Scripts

- `npm run start` – start the HTTP server.
- `npm run dev` – run the server in watch mode (auto restarts on file changes; requires Node 18+).

## Environment Variables

| Variable          | Required | Description                                                     |
| ----------------- | -------- | --------------------------------------------------------------- |
| `RESEND_API_KEY`  | Yes      | Resend API key used to send confirmation emails on registration |
| `PORT`            | No       | Port number for the HTTP server (defaults to `3000`)            |
| `HOST`            | No       | Host binding for the HTTP server (defaults to `0.0.0.0`)        |

## API Overview

All endpoints accept and return JSON.

| Method | Endpoint                | Description                                      |
| ------ | ----------------------- | ------------------------------------------------ |
| GET    | `/api/listings`         | Fetch all stored property listings               |
| POST   | `/api/listings`         | Create a new listing (supports base64 photo)     |
| POST   | `/api/listings/search`  | Filter listings by area, price, bedrooms, etc.   |
| POST   | `/api/register`         | Register a new member and send confirmation mail |

## Notes

- Photo uploads are validated on both the client and server with a 10MB size limit.
- Listing data is prepended so the newest properties appear at the top of the feed without needing a reload.
- Registration requires an eight-character password and deduplicates users by email before sending confirmation.
