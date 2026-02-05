"use server"

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { writeFile, unlink } from "fs/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { finished } from "stream/promises";
import path from "path";
import os from "os";

// Types
type TranscribeParams = {
    fileBase64?: string;
    fileUrl?: string; // Legacy/Fallback
    apiKey: string;
    prompt?: string;
    mimeType: string;
    originalName: string;
}

export async function transcribeAudio(params: TranscribeParams) {
    let tempFilePath = "";

    // Validate Input
    const finalApiKey = params.apiKey || process.env.GEMINI_API_KEY;
    if (!finalApiKey) {
        return { error: "API Key is required." };
    }

    try {
        const { fileBase64, fileUrl, mimeType, originalName } = params;
        const apiKey = finalApiKey;
        const prompt = params.prompt || "Generate a clean, well-formatted transcription of this audio/video in SPANISH. If the audio is in English or another language, TRANSLATE it to Spanish. Use clear paragraph breaks. Do NOT use markdown. Output plain text only.";

        // Initialize Gemini Clients
        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GoogleAIFileManager(apiKey);

        // Create a safe temp filename
        const tempDir = os.tmpdir();
        const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const fileName = `upload-${Date.now()}-${safeName}`;
        tempFilePath = path.join(tempDir, fileName);

        // 1. GET FILE CONTENT
        if (fileBase64) {
            console.log("Processing Direct Base64 Upload...");
            const buffer = Buffer.from(fileBase64, 'base64');
            await writeFile(tempFilePath, buffer);
        } else if (fileUrl) {
            // Fetch file from Supabase (or any URL) with 15s timeout
            console.log("Fetching file from URL:", fileUrl);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s

            try {
                const fileResponse = await fetch(fileUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!fileResponse.ok) throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);

                const fileStream = createWriteStream(tempFilePath);
                // @ts-ignore: Readable.fromWeb matches
                await finished(Readable.fromWeb(fileResponse.body).pipe(fileStream));
            } catch (error: any) {
                if (error.name === 'AbortError') throw new Error("Timeout descargando archivo de Supabase.");
                throw error;
            }
        } else {
            throw new Error("No Input File (Base64 or URL needed)");
        }

        console.log("File saved to temp:", tempFilePath);

        // Determine MimeType (Fallback to extension if missing or generic)
        let finalMimeType = mimeType;
        if (!finalMimeType || finalMimeType === 'application/octet-stream') {
            const ext = path.extname(safeName).toLowerCase();
            if (ext === '.mp3') finalMimeType = 'audio/mp3';
            else if (ext === '.wav') finalMimeType = 'audio/wav';
            else if (ext === '.m4a') finalMimeType = 'audio/m4a';
            else if (ext === '.mp4') finalMimeType = 'video/mp4';
            else if (ext === '.mov') finalMimeType = 'video/quicktime';
        }

        // STRATEGY: Use Google File API (Upload -> Generate -> Delete)
        // This is more robust than Inline Data for Vercel networking.

        console.log("Uploading file to Google AI File Manager...");
        const uploadResult = await fileManager.uploadFile(tempFilePath, {
            mimeType: finalMimeType || "audio/mp3",
            displayName: originalName,
        });

        const fileUri = uploadResult.file.uri;
        console.log(`Uploaded to Google: ${fileUri}`);

        // Wait for processing (Crucial for Video)
        let file = await fileManager.getFile(uploadResult.file.name);
        let retries = 0;
        const maxRetries = 60; // 2 minutes max waiting

        while (file.state === "PROCESSING") {
            retries++;
            if (retries > maxRetries) {
                throw new Error("Timeout esperando que Google procese el archivo (Video muy largo o servicio lento).");
            }
            console.log(`File processing... (${retries}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            file = await fileManager.getFile(uploadResult.file.name);
        }

        if (file.state === "FAILED") {
            throw new Error("Google falló al procesar el archivo de video/audio.");
        }

        console.log(`File is ACTIVE. State: ${file.state}`);

        let promptParts = [
            { text: prompt },
            { fileData: { mimeType: uploadResult.file.mimeType, fileUri: fileUri } }
        ];

        // 3. Generate Content
        // EXHAUSTIVE MODEL LIST based on User's Diagnostic Dump
        const modelsToTry = [
            "gemini-2.0-flash",
            "gemini-2.0-flash-001",
            "gemini-2.0-flash-lite-preview-02-05", // From List
            "gemini-2.5-flash", // From List
            "gemini-1.5-flash",
            "gemini-1.5-flash-001",
            "gemini-1.5-pro",
            "gemini-1.5-flash-8b"
        ];

        let attemptLog: string[] = [];
        let transcriptionText = "";
        let successModel = "";

        for (const modelName of modelsToTry) {
            try {
                console.log(`Attempting transcription with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(promptParts);
                transcriptionText = result.response.text();
                successModel = modelName;
                console.log(`Success with model: ${modelName}`);
                break;
            } catch (error: any) {
                console.error(`Failed with model ${modelName}:`, error.message);
                attemptLog.push(`${modelName}: ${error.message}`);
                // Loop continues
            }
        }

        // CLEANUP GOOGLE FILE
        try {
            await fileManager.deleteFile(uploadResult.file.name);
            console.log("Deleted file from Google:", uploadResult.file.name);
        } catch (cleanupErr) {
            console.warn("Failed to delete Google file:", cleanupErr);
        }

        if (!transcriptionText) {
            // Check for Quota issues
            const fullLog = attemptLog.join(" | ");
            if (fullLog.includes("429")) {
                throw new Error("Has excedido tu cuota gratuita de Gemini (Error 429).");
            }
            throw new Error(`Todos los modelos fallaron. Detalles: ${fullLog}`);
        }

        return { transcription: transcriptionText };

    } catch (error: any) {
        console.error("Transcription error:", error);
        // RAW ERROR FOR DEBUGGING
        return { error: `[Server] ${error.message}` };
    } finally {
        // Clean up local temp file
        if (tempFilePath) {
            try {
                await unlink(tempFilePath);
            } catch (e) {
                console.error("Failed to cleanup temp file:", e);
            }
        }
    }
}
