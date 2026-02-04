"use server"

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import os from "os";

export async function transcribeAudio(formData: FormData) {
    let tempFilePath = "";

    try {
        const file = formData.get("file") as File;
        const apiKey = formData.get("apiKey") as string;
        const prompt = formData.get("prompt") as string || "Generate a clean, well-formatted transcription of this audio/video in SPANISH. If the audio is in English or another language, TRANSLATE it to Spanish. Use clear paragraph breaks. Do NOT use markdown. Output plain text only.";

        if (!file || !apiKey) {
            return { error: "File and API Key are required." };
        }

        // Initialize Gemini Clients
        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GoogleAIFileManager(apiKey);

        // Save file temporarily to disk (GoogleAIFileManager requires a path)
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Create a safe temp filename
        const tempDir = os.tmpdir();
        const fileName = `upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        tempFilePath = path.join(tempDir, fileName);

        await writeFile(tempFilePath, buffer);
        console.log("File saved to temp:", tempFilePath);

        // 1. Upload to Gemini
        const uploadResponse = await fileManager.uploadFile(tempFilePath, {
            mimeType: file.type || "video/mp4",
            displayName: file.name,
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
            "gemini-2.0-flash-001",
            "gemini-2.5-flash",
            "gemini-2.0-flash"
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
