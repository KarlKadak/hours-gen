const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = 9876;
const ALLOWED_ORIGIN = "https://hours.karlkadak.dev";

http
  .createServer((req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      });
      res.end();
      return;
    }

    const targetUrl = req.headers["x-target-url"];
    if (!targetUrl) {
      res.writeHead(400, { "Access-Control-Allow-Origin": ALLOWED_ORIGIN });
      res.end("Missing x-target-url header");
      return;
    }

    const parsed = new URL(targetUrl);
    const body = [];

    req.on("data", (chunk) => body.push(chunk));
    req.on("end", () => {
      const headers = { ...req.headers };
      delete headers["host"];
      delete headers["x-target-url"];
      headers["origin"] = parsed.origin;
      headers["referer"] = parsed.origin + "/";

      // Convert x-forward-cookies to Cookie header
      if (headers["x-forward-cookies"]) {
        headers["cookie"] = headers["x-forward-cookies"];
        delete headers["x-forward-cookies"];
      }

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: req.method,
        headers,
      };

      const proxy = https.request(options, (proxyRes) => {
        const respHeaders = { ...proxyRes.headers };
        respHeaders["access-control-allow-origin"] = ALLOWED_ORIGIN;
        res.writeHead(proxyRes.statusCode, respHeaders);
        proxyRes.pipe(res);
      });

      proxy.on("error", (err) => {
        res.writeHead(500, { "Access-Control-Allow-Origin": ALLOWED_ORIGIN });
        res.end(err.message);
      });

      if (body.length > 0) proxy.write(Buffer.concat(body));
      proxy.end();
    });
  })
  .listen(PORT, () => {
    console.log(`Local CORS proxy running on http://localhost:${PORT}`);
  });
