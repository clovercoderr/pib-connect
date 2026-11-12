import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import http from "node:http";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "pib-dynamic-proxy",
      configureServer(server) {
        // In-memory robot URL — updated at runtime via /__pib_config__
        let robotUrl =
          process.env.PIB_ROBOT_URL ||
          `http://${process.env.PIB_ROBOT_IP || "localhost"}:${process.env.PIB_ROBOT_PORT || "5000"}`;

        // Dev endpoint: GET / POST /__pib_config__
        server.middlewares.use("/__pib_config__", (req, res) => {
          res.setHeader("Content-Type", "application/json");

          if (req.method === "GET") {
            res.end(JSON.stringify({ robotUrl }));
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
            });
            req.on("end", () => {
              try {
                const { robotUrl: newUrl } = JSON.parse(body);
                if (newUrl) {
                  robotUrl = newUrl;
                  console.log(`[PIB] Robot URL updated → ${robotUrl}`);
                  res.end(JSON.stringify({ success: true, robotUrl }));
                } else {
                  res.writeHead(400);
                  res.end(JSON.stringify({ error: "robotUrl required" }));
                }
              } catch {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "Invalid JSON" }));
              }
            });
            return;
          }

          res.writeHead(405);
          res.end();
        });

        // Dynamic reverse proxy: /pib-api/** → robotUrl/**
        server.middlewares.use("/pib-api", (req, res) => {
          let target: URL;
          try {
            target = new URL(robotUrl);
          } catch {
            res.writeHead(502);
            res.end(JSON.stringify({ error: "Invalid robot URL", robotUrl }));
            return;
          }

          const path = req.url || "/";
          const port =
            target.port
              ? parseInt(target.port)
              : target.protocol === "https:"
                ? 443
                : 80;

          const headers: Record<string, string | string[] | undefined> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            headers[k] = v as string | string[] | undefined;
          }
          headers["host"] = target.host;
          delete headers["origin"];
          delete headers["referer"];

          const options: http.RequestOptions = {
            hostname: target.hostname,
            port,
            path,
            method: req.method,
            headers,
          };

          const proxyReq = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            proxyRes.pipe(res);
          });

          proxyReq.on("error", (err) => {
            console.error(`[PIB Proxy] ${req.method} ${path} → ${robotUrl}: ${err.message}`);
            if (!res.headersSent) {
              res.writeHead(502);
              res.end(
                JSON.stringify({ error: "Proxy connection failed", details: err.message })
              );
            }
          });

          req.pipe(proxyReq);
        });
      },
    },
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        project: "project.html",
        settings: "settings.html",
      },
    },
  },
}));
