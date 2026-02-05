"use server"

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { writeFile, unlink } from "fs/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { finished } from "stream/promises";
import path from "path";
import os from "os";

// Set max execution time to 60 seconds (Vercel Limit)
export const maxDuration = 60;

// Types
type TranscribeParams = {
    fileUrl: string;
    apiKey: string;
    prompt?: string;
    mimeType: string;
    originalName: string;
}

export async function transcribeAudio(params: TranscribeParams) {
    let tempFilePath = "";

    // Validate Input
    if (!params.fileUrl || !params.apiKey) {
        return { error: "File URL and API Key are required." };
    }

    try {
        const { fileUrl, apiKey, mimeType, originalName } = params;
        const prompt = params.prompt || "Generate a clean, well-formatted transcription of this audio/video in SPANISH. If the audio is in English or another language, TRANSLATE it to Spanish. Use clear paragraph breaks. Do NOT use markdown. Output plain text only.";

        // Initialize Gemini Clients
        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GoogleAIFileManager(apiKey);

        // Fetch file from Supabase (or any URL)
        console.log("Fetching file from URL:", fileUrl);
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);

        // Create a safe temp filename
        const tempDir = os.tmpdir();
        const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const fileName = `upload-${Date.now()}-${safeName}`;
        tempFilePath = path.join(tempDir, fileName);

        // Stream to disk to avoid memory issues with large files
        const fileStream = createWriteStream(tempFilePath);
        // @ts-ignore: Readable.fromWeb is available in Node 18+ (Vercel default)
        await finished(Readable.fromWeb(fileResponse.body).pipe(fileStream));
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

        // 1. Upload to Gemini
        const uploadResponse = await fileManager.uploadFile(tempFilePath, {
            mimeType: finalMimeType || "video/mp4",
            displayName: originalName,
        });
        console.log("Uploaded to Gemini:", uploadResponse.file.uri);

        // 2. Poll for processing (Active) state
        let fileRecord = await fileManager.getFile(uploadResponse.file.name);
        while (fileRecord.state === FileState.PROCESSING) {
            console.log("Processing file...");
            await new Promise((resolve) => setTimeout(resolve, 2000));
            fileRecord = await fileManager.getFile(uploadResponse.file.name);
        }

        if (fileRecord.state === FileState.FAILED) {
            throw new Error("Video processing failed.");
        }

        console.log("File is active. Generating content...");

        // 3. Generate Content with Fallback Strategy
        const modelsToTry = [
            "gemini-2.0-flash",
            "gemini-1.5-flash"
        ];

        let lastError = null;
        let transcriptionText = "";
        let successModel = "";

        for (const modelName of modelsToTry) {
            try {
                console.log(`Attempting transcription with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent([
                    prompt,
                    {
                        fileData: {
                            fileUri: uploadResponse.file.uri,
                            mimeType: uploadResponse.file.mimeType,
                        },
                    },
                ]);
                transcriptionText = result.response.text();
                successModel = modelName;
                console.log(`Success with model: ${modelName}`);
                break;
            } catch (error: any) {
                console.error(`Failed with model ${modelName}:`, error.message);
                lastError = error;
                // Loop continues
            }
        }

        if (!transcriptionText) {
            // If all failed, check if it was a quota error (429) and throw a clearer message
            if (lastError?.message.includes("429")) {
                throw new Error("Has excedido tu cuota gratuita de Gemini (Error 429). Intenta más tarde o revisa tu facturación.");
            }
            throw lastError || new Error("Todos los modelos fallaron.");
        }

        return { transcription: transcriptionText };

    } catch (error: any) {
        console.error("Transcription error:", error);
        return { error: error.message || "Failed to transcribe." };
    } finally {
        // Clean up local temp file
        if (tempFilePath) {
            try {
                await unlink(tempFilePath);
                console.log("Cleaned up temp file:", tempFilePath);
            } catch (e) {
                console.error("Failed to cleanup temp file:", e);
            }
        }
    }
}
