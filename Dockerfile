# syntax=docker/dockerfile:1

# ── Stage 1: build the React/Vite SPA ─────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build          # outputs to /app/frontend/dist

# ── Stage 2: build & publish the ASP.NET Core API ─────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /src
COPY backend/Moneta.Api.csproj ./backend/
RUN dotnet restore backend/Moneta.Api.csproj
COPY backend/ ./backend/
RUN dotnet publish backend/Moneta.Api.csproj -c Release -o /app/publish /p:UseAppHost=false
# Bundle the SPA so the API serves it same-origin from wwwroot
COPY --from=frontend /app/frontend/dist /app/publish/wwwroot

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=backend /app/publish ./
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
# SQLite database lives here — mount a volume to persist it
VOLUME ["/app/data"]
ENTRYPOINT ["dotnet", "Moneta.Api.dll"]
