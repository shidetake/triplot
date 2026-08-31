#!/usr/bin/env node

import { exec } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import PostalMime from "postal-mime";

const CREDS_DIR = path.join(os.homedir(), ".gmail-mcp");
const CREDS_FILE = path.join(CREDS_DIR, "credentials.json");
const KEYS_FILE = path.join(CREDS_DIR, "gcp-oauth.keys.json");
const DEFAULT_STATE_FILE = path.join(CREDS_DIR, "forwarded_state.json");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

function loadKeys() {
  if (!fs.existsSync(KEYS_FILE)) {
    throw new Error(
      `OAuth keys file not found at ${KEYS_FILE}. Please configure Google Cloud OAuth client credentials.`,
    );
  }
  const keys = JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
  const clientId = keys.installed?.client_id || keys.web?.client_id;
  const clientSecret = keys.installed?.client_secret || keys.web?.client_secret;
  if (!clientId || !clientSecret) {
    throw new Error("Invalid client_id or client_secret in " + KEYS_FILE);
  }
  return { clientId, clientSecret };
}

async function performBrowserAuth(clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://${req.headers.host}`);
        if (reqUrl.pathname === "/favicon.ico") {
          res.writeHead(404);
          res.end();
          return;
        }

        const code = reqUrl.searchParams.get("code");
        const error = reqUrl.searchParams.get("error");

        if (error) {
          if (!res.headersSent) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`<h1>Authentication Failed</h1><p>${error}</p>`);
          }
          if (!resolved) {
            resolved = true;
            server.close();
            reject(new Error(`OAuth Error: ${error}`));
          }
          return;
        }

        if (code && !resolved) {
          resolved = true;
          if (!res.headersSent) {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end("<h1>認証成功</h1><p>ブラウザを閉じてターミナルにお戻りください。</p>");
          }

          const port = server.address().port;
          const redirectUri = `http://localhost:${port}`;

          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            }),
          });

          const tokenData = await tokenRes.json();
          server.close();

          if (!tokenRes.ok) {
            reject(new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`));
            return;
          }

          tokenData.expiry_date = Date.now() + (tokenData.expires_in || 3600) * 1000;
          fs.mkdirSync(CREDS_DIR, { recursive: true });
          fs.writeFileSync(CREDS_FILE, JSON.stringify(tokenData, null, 2));
          console.log("Updated OAuth credentials saved to", CREDS_FILE);
          resolve(tokenData.access_token);
          return;
        }

        if (!res.headersSent) {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("Waiting for authentication...");
        }
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Internal error: " + e.message);
        }
        if (!resolved) {
          resolved = true;
          server.close();
          reject(e);
        }
      }
    });

    server.listen(0, () => {
      const port = server.address().port;
      const redirectUri = `http://localhost:${port}`;

      const authUrl = new URL("https://accounts.google.com/o/oauth2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES.join(" "));
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");

      console.log("\n[OAuth] Google 認証が必要です。ブラウザを開いてアクセスを許可してください:");
      console.log(authUrl.toString() + "\n");

      exec(`open "${authUrl.toString()}"`);
    });
  });
}

async function getAccessToken() {
  const { clientId, clientSecret } = loadKeys();

  if (!fs.existsSync(CREDS_FILE)) {
    return await performBrowserAuth(clientId, clientSecret);
  }

  const creds = JSON.parse(fs.readFileSync(CREDS_FILE, "utf8"));
  const refreshToken = creds.refresh_token;

  if (!refreshToken) {
    return await performBrowserAuth(clientId, clientSecret);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.warn("[OAuth] Token refresh failed. Triggering browser authentication...");
    return await performBrowserAuth(clientId, clientSecret);
  }

  return data.access_token;
}

async function getMyEmail(token) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Get profile failed: ${JSON.stringify(data)}`);
  return data.emailAddress;
}

async function listAllMessages(token, query) {
  let allMessages = [];
  let pageToken = undefined;

  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(`List failed: ${JSON.stringify(data)}`);

    if (data.messages) {
      allMessages.push(...data.messages);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allMessages;
}

async function getMessageMeta(token, id) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=minimal`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Get minimal message ${id} failed: ${JSON.stringify(data)}`);
  return {
    id: data.id,
    threadId: data.threadId,
    internalDate: data.internalDate,
  };
}

async function getRawMessage(token, id) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=raw`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Get raw message ${id} failed: ${JSON.stringify(data)}`);

  return Buffer.from(data.raw, "base64url");
}

async function sendForwardMessage(token, rawMimeString) {
  const rawBase64Url = Buffer.from(rawMimeString, "utf8").toString("base64url");
  const url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: rawBase64Url }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Send failed: ${JSON.stringify(data)}`);
  }
  return data;
}

function encodeSubject(subject) {
  if (!subject) return "";
  const buf = Buffer.from(subject, "utf8");
  return `=?UTF-8?B?${buf.toString("base64")}?=`;
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAddress(addrObj) {
  if (!addrObj) return "";
  if (typeof addrObj === "string") return addrObj;
  if (Array.isArray(addrObj)) {
    return addrObj.map(formatAddress).join(", ");
  }
  if (addrObj.name && addrObj.address) {
    return `"${addrObj.name}" <${addrObj.address}>`;
  }
  return addrObj.address || addrObj.name || "";
}

function wrapBase64(b64Str) {
  return b64Str.match(/.{1,76}/g)?.join("\r\n") || b64Str;
}

function buildForwardMime({ from, to, parsedOriginal }) {
  const originalSubject = parsedOriginal.subject || "(no subject)";
  const fwdSubject = originalSubject.startsWith("Fwd:") ? originalSubject : `Fwd: ${originalSubject}`;

  const origFrom = formatAddress(parsedOriginal.from);
  const origTo = formatAddress(parsedOriginal.to);
  const origDate = parsedOriginal.date || "";

  // Plain text body
  const origText = parsedOriginal.text || "";
  const textBody = `---------- Forwarded message ---------
From: ${origFrom}
Date: ${origDate}
Subject: ${originalSubject}
To: ${origTo}

${origText}`.trim();

  // HTML body
  let htmlBody = "";
  if (parsedOriginal.html) {
    htmlBody = `<div class="gmail_quote">
<div dir="ltr" class="gmail_attr">
---------- Forwarded message ---------<br>
From: <strong class="gmail_sendername">${escapeHtml(origFrom)}</strong><br>
Date: ${escapeHtml(origDate)}<br>
Subject: ${escapeHtml(originalSubject)}<br>
To: ${escapeHtml(origTo)}<br>
</div>
<br><br>
${parsedOriginal.html}
</div>`;
  } else {
    htmlBody = `<div class="gmail_quote">
<div dir="ltr" class="gmail_attr">
---------- Forwarded message ---------<br>
From: <strong class="gmail_sendername">${escapeHtml(origFrom)}</strong><br>
Date: ${escapeHtml(origDate)}<br>
Subject: ${escapeHtml(originalSubject)}<br>
To: ${escapeHtml(origTo)}<br>
</div>
<br><br>
<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(origText)}</pre>
</div>`;
  }

  const attachments = (parsedOriginal.attachments || []).filter((att) => att.content);

  const boundaryMixed = `----=_Part_Mixed_${crypto.randomBytes(8).toString("hex")}`;
  const boundaryAlt = `----=_Part_Alt_${crypto.randomBytes(8).toString("hex")}`;

  const dateHeader = new Date().toUTCString();
  const messageId = `<${crypto.randomUUID()}@gmail.com>`;

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(fwdSubject)}`,
    `Date: ${dateHeader}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
  ];

  let raw = "";

  if (attachments.length > 0) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`);
    raw += headers.join("\r\n") + "\r\n\r\n";

    raw += `--${boundaryMixed}\r\n`;
    raw += `Content-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n\r\n`;

    raw += `--${boundaryAlt}\r\n`;
    raw += `Content-Type: text/plain; charset=UTF-8\r\n`;
    raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
    raw += wrapBase64(Buffer.from(textBody, "utf8").toString("base64")) + "\r\n";

    raw += `--${boundaryAlt}\r\n`;
    raw += `Content-Type: text/html; charset=UTF-8\r\n`;
    raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
    raw += wrapBase64(Buffer.from(htmlBody, "utf8").toString("base64")) + "\r\n";

    raw += `--${boundaryAlt}--\r\n`;

    for (const att of attachments) {
      const filename = att.filename || "attachment";
      const contentType = att.mimeType || "application/octet-stream";
      const contentBuf = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content);

      raw += `--${boundaryMixed}\r\n`;
      raw += `Content-Type: ${contentType}; name="${encodeSubject(filename)}"\r\n`;
      raw += `Content-Disposition: attachment; filename="${encodeSubject(filename)}"\r\n`;
      raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
      raw += wrapBase64(contentBuf.toString("base64")) + "\r\n";
    }

    raw += `--${boundaryMixed}--\r\n`;
  } else {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
    raw += headers.join("\r\n") + "\r\n\r\n";

    raw += `--${boundaryAlt}\r\n`;
    raw += `Content-Type: text/plain; charset=UTF-8\r\n`;
    raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
    raw += wrapBase64(Buffer.from(textBody, "utf8").toString("base64")) + "\r\n";

    raw += `--${boundaryAlt}\r\n`;
    raw += `Content-Type: text/html; charset=UTF-8\r\n`;
    raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
    raw += wrapBase64(Buffer.from(htmlBody, "utf8").toString("base64")) + "\r\n";

    raw += `--${boundaryAlt}--\r\n`;
  }

  return raw;
}

function loadState(stateFile) {
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, "utf8"));
    }
  } catch (e) {
    console.error("Error loading state file:", e.message);
  }
  return { forwardedMessageIds: {} };
}

function saveState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { values } = parseArgs({
    options: {
      query: { type: "string", short: "q" },
      to: { type: "string", short: "t" },
      limit: { type: "string", short: "n" },
      "dry-run": { type: "boolean", default: false },
      state: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help || (!values.query && !values.to)) {
    console.log(`
Gmail Forwarding CLI for Triplot Import

Usage:
  npm run gmail:forward -- --query "<search_query>" --to "<recipient_email>" [options]
  node scripts/forward-gmail.mjs -q "<search_query>" -t "<recipient_email>" [options]

Options:
  -q, --query <string>    Gmail query string (e.g. "label:2026-04-28-hawaii") [Required]
  -t, --to <string>       Destination email address (e.g. "receipts+token@triplot.app") [Required]
  -n, --limit <number>    Maximum number of emails to send
      --dry-run           Simulate fetching and MIME generation without sending
      --state <path>      Custom state JSON file path to track sent messages
  -h, --help              Show this help message
`);
    process.exit(values.help ? 0 : 1);
  }

  const query = values.query;
  const to = values.to;
  const dryRun = values["dry-run"] ?? false;
  const limit = values.limit ? parseInt(values.limit, 10) : Infinity;
  const stateFile = values.state ? path.resolve(values.state) : DEFAULT_STATE_FILE;

  if (!query) throw new Error("Missing required argument: --query");
  if (!to) throw new Error("Missing required argument: --to");

  let token = await getAccessToken();
  const myEmail = await getMyEmail(token);

  console.log(`Authenticated as: ${myEmail}`);
  console.log(`Forward target:   ${to}`);
  console.log(`Query:            ${query}`);
  console.log(`Mode:             ${dryRun ? "DRY-RUN (no emails sent)" : "LIVE SENDING"}`);
  console.log(`State file:       ${stateFile}`);
  if (limit !== Infinity) console.log(`Limit:            ${limit} message(s)`);

  const messages = await listAllMessages(token, query);
  console.log(`Found ${messages.length} messages matching "${query}".`);

  const state = loadState(stateFile);
  const alreadyForwardedCount = Object.keys(state.forwardedMessageIds).length;
  console.log(`Previously forwarded: ${alreadyForwardedCount} message(s).`);

  console.log("Fetching message timestamps for chronological ordering...");
  const detailedMessages = [];
  const chunkSize = 10;
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map((m) => getMessageMeta(token, m.id)));
    detailedMessages.push(...chunkResults);
  }

  detailedMessages.sort((a, b) => Number(a.internalDate) - Number(b.internalDate));

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < detailedMessages.length; i++) {
    if (sentCount >= limit) {
      console.log(`Reached limit of ${limit} sent messages. Stopping.`);
      break;
    }

    const item = detailedMessages[i];
    const indexLabel = `[${i + 1}/${detailedMessages.length}] (ID: ${item.id})`;

    if (state.forwardedMessageIds[item.id]) {
      console.log(`${indexLabel} Already forwarded at ${state.forwardedMessageIds[item.id].sentAt}. Skipping.`);
      skippedCount++;
      continue;
    }

    try {
      if (i > 0 && i % 20 === 0) {
        token = await getAccessToken();
      }

      const rawBuffer = await getRawMessage(token, item.id);
      const parsedOriginal = await PostalMime.parse(rawBuffer);
      const subject = parsedOriginal.subject || "(no subject)";
      const fromAddr = parsedOriginal.from?.address || "unknown";
      console.log(`${indexLabel} Forwarding: "${subject}" from ${fromAddr}...`);

      const forwardMime = buildForwardMime({
        from: myEmail,
        to,
        parsedOriginal,
      });

      if (dryRun) {
        console.log(`  -> [DRY RUN] Generated ${forwardMime.length} bytes MIME.`);
        sentCount++;
      } else {
        const sendResult = await sendForwardMessage(token, forwardMime);
        console.log(`  -> Sent! (SentMsgId: ${sendResult.id})`);

        state.forwardedMessageIds[item.id] = {
          sentAt: new Date().toISOString(),
          sentMessageId: sendResult.id,
          subject,
          from: fromAddr,
          targetRecipient: to,
        };
        saveState(stateFile, state);
        sentCount++;

        // Rate limit sleep: 600ms between sends
        await sleep(600);
      }
    } catch (err) {
      console.error(`${indexLabel} ERROR:`, err.message);
      failedCount++;
      await sleep(1500);
    }
  }

  console.log("\n================ Execution Summary ================");
  console.log(`Total messages in query: ${detailedMessages.length}`);
  console.log(`Successfully sent:       ${sentCount}`);
  console.log(`Skipped (already sent):  ${skippedCount}`);
  console.log(`Failed:                  ${failedCount}`);
  console.log("===================================================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
