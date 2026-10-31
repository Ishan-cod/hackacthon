# CivicLine frontend

React and Vite interface for the Civic Triage FastAPI backend in `../backend_model`.

## Run locally

Start the backend at `http://localhost:8000` (see `../backend_model/README.md`), then run:

```bash
cd frontend_model
pnpm install
pnpm dev
```

By default the frontend calls `http://localhost:8000`. Set `VITE_API_BASE_URL` before starting or building to point at another backend, for example:

```bash
VITE_API_BASE_URL=https://api.example.org pnpm build
```

The interface uses the backend routes for public map filters, department metrics and queues, ward rankings, routing rules, ticket status history, comments, votes, satisfaction ratings, and opt-in status notifications. Reports can be anonymous or pseudonymous and may include image/video, voice, description, location and notification preferences. The map draws configured ward polygons and clustered issue heat spots. Dashboard lists show canonical nearby issues with linked-report counts; ticket details show the 0–100 score and its factors.

The public issue map uses Leaflet controls and standard OpenStreetMap tiles. Issue markers are fitted to the map independently of ward boundaries, and selecting a marker zooms to its coordinates. The OSM tile layer requires an internet connection and displays the required attribution.
