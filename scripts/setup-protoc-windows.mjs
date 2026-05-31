#!/usr/bin/env node
/**
 * Setup script for Windows users to download protoc binary
 * This fixes the STATUS_DLL_NOT_FOUND error (0xC0000135) from grpc-tools protoc.exe
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTOC_VERSION = "25.1";
const DOWNLOAD_URL = `https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOC_VERSION}/protoc-${PROTOC_VERSION}-win64.zip`;
const TMP_PROTOC_DIR = path.resolve(__dirname, "..", "tmp-protoc");
const ZIP_PATH = path.join(TMP_PROTOC_DIR, "protoc.zip");

function downloadFile(url, dest) {
	return new Promise((resolve, reject) => {
		console.log(`Downloading protoc from ${url}...`);
		const file = fs.createWriteStream(dest);
		https.get(url, { redirect: "follow" }, (response) => {
			if (response.statusCode === 302 || response.statusCode === 301) {
				// Follow redirect
				file.close();
				fs.unlinkSync(dest);
				downloadFile(response.headers.location, dest).then(resolve).catch(reject);
				return;
			}
			if (response.statusCode !== 200) {
				reject(new Error(`Download failed with status code ${response.statusCode}`));
				return;
			}
			response.pipe(file);
			file.on("finish", () => {
				file.close();
				resolve();
			});
		}).on("error", (err) => {
			fs.unlinkSync(dest);
			reject(err);
		});
	});
}

function extractZip(zipPath, destDir) {
	console.log("Extracting protoc...");
	// Use PowerShell Expand-Archive
	execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, { stdio: "inherit" });
}

async function main() {
	if (process.platform !== "win32") {
		console.log("This script is only needed on Windows.");
		process.exit(0);
	}

	// Check if protoc already exists
	const protocPath = path.join(TMP_PROTOC_DIR, "bin", "protoc.exe");
	if (fs.existsSync(protocPath)) {
		console.log("protoc already exists at:", protocPath);
		process.exit(0);
	}

	// Create directory
	if (!fs.existsSync(TMP_PROTOC_DIR)) {
		fs.mkdirSync(TMP_PROTOC_DIR, { recursive: true });
	}

	try {
		await downloadFile(DOWNLOAD_URL, ZIP_PATH);
		extractZip(ZIP_PATH, TMP_PROTOC_DIR);
		fs.unlinkSync(ZIP_PATH);
		console.log("✅ protoc installed successfully at:", protocPath);
		console.log("\nYou can now run: npm run dev");
	} catch (error) {
		console.error("❌ Failed to download protoc:", error.message);
		console.log("\nAlternative: Install Visual C++ Redistributable:");
		console.log("https://aka.ms/vs/17/release/vc_redist.x64.exe");
		process.exit(1);
	}
}

main();
