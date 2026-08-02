// ローカルビルドした .ipa（preview プロファイル）を Vercel Blob に上げ、
// OTA インストール用の manifest.plist を添えて itms-services:// リンク（＋QR）を
// 発行する。TestFlight を経由しない「出先からの簡易確認」用（AGENTS.md 参照）。
//
// 使い方:
//   cd apps/mobile
//   npx eas-cli build --platform ios --profile preview --local --non-interactive \
//     --output ./build/triplot-preview.ipa
//   node ../../scripts/ios-preview-upload.mjs ./build/triplot-preview.ipa
//
// BLOB_READ_WRITE_TOKEN は .env.local（リポジトリルート）にある
// （`vercel blob create-store` 実行時に自動で書き込まれた値）。
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { put } from "@vercel/blob";
import QRCode from "qrcode";

const [, , ipaPath] = process.argv;
if (!ipaPath) {
  console.error("usage: node ios-preview-upload.mjs <ipa-path>");
  process.exit(1);
}

// .ipa 内の Info.plist からタイトル・バンドルID・バージョンを読む
// （手入力させると打ち間違いで manifest とビルドの中身がズレるため自動化）。
function readIpaMetadata(ipaAbsPath) {
  const tmp = mkdtempSync(path.join(tmpdir(), "ios-preview-"));
  try {
    execFileSync("unzip", ["-q", ipaAbsPath, "-d", tmp]);
    const payloadDir = path.join(tmp, "Payload");
    const appDirName = execFileSync("ls", [payloadDir]).toString().trim();
    const infoPlistPath = path.join(payloadDir, appDirName, "Info.plist");
    const json = execFileSync("plutil", ["-convert", "json", "-o", "-", infoPlistPath]).toString();
    const info = JSON.parse(json);
    return {
      bundleId: info.CFBundleIdentifier,
      version: info.CFBundleShortVersionString,
      buildNumber: info.CFBundleVersion,
      title: info.CFBundleDisplayName ?? info.CFBundleName,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const ipaAbsPath = path.resolve(ipaPath);
const meta = readIpaMetadata(ipaAbsPath);
console.log(`ipa metadata: ${JSON.stringify(meta)}`);

const stamp = Date.now();
const ipaBlobName = `ios-preview/${stamp}/triplot-preview.ipa`;
const manifestBlobName = `ios-preview/${stamp}/manifest.plist`;

const ipaBuffer = readFileSync(ipaAbsPath);
console.log(`Uploading ipa (${(ipaBuffer.length / 1024 / 1024).toFixed(1)} MB)...`);
const ipaBlob = await put(ipaBlobName, ipaBuffer, {
  access: "public",
  contentType: "application/octet-stream",
});
console.log(`ipa: ${ipaBlob.url}`);

const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${ipaBlob.url}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>${meta.bundleId}</string>
        <key>bundle-version</key>
        <string>${meta.version}</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>${meta.title}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;

const manifestBlob = await put(manifestBlobName, manifest, {
  access: "public",
  contentType: "application/xml",
});
console.log(`manifest: ${manifestBlob.url}`);

const installUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestBlob.url)}`;
console.log(`\ninstall link (open in iPhone Safari):\n${installUrl}`);

const qrPath = path.join(path.dirname(ipaAbsPath), `qr-${stamp}.png`);
await QRCode.toFile(qrPath, installUrl, { width: 640 });
console.log(`\nQR saved to: ${qrPath}`);
