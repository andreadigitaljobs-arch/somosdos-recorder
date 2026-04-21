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
        if (!finalMimeType || finalMimeType === 'application/octet-stream' || finalMimeType.includes('m4a')) {
            const ext = path.extname(safeName).toLowerCase();
            if (ext === '.mp3') finalMimeType = 'audio/mp3';
            else if (ext === '.wav') finalMimeType = 'audio/wav';
            else if (ext === '.m4a' || ext === '.mp4') finalMimeType = 'audio/mp4'; 
            else finalMimeType = 'audio/mp4'; // Use mp4 as universal for unknown
        }

        // 2. STRATEGY: Inline Data (< 15MB) or File API (> 15MB)
        // Inline data is much more reliable for small voice notes as it avoids fetch issues.
        const stats = await import('fs').then(fs => fs.promises.stat(tempFilePath));
        const fileSizeInMB = stats.size / (1024 * 1024);
        
        let promptParts: any[] = [{ text: prompt }];

        if (fileSizeInMB < 15) {
            console.log("Using Direct Inline Data Strategy (Fast & Reliable)...");
            const data = await import('fs').then(fs => fs.promises.readFile(tempFilePath));
            promptParts.push({
                inlineData: {
                    data: data.toString('base64'),
                    mimeType: finalMimeType
                }
            });
        } else {
            console.log("Using Google File manager for large file...");
            const fileManager = new GoogleAIFileManager(apiKey);
            const uploadResult = await fileManager.uploadFile(tempFilePath, {
                mimeType: finalMimeType,
                displayName: originalName,
            });

            // Wait for processing
            let file = await fileManager.getFile(uploadResult.file.name);
            let retries = 0;
            while (file.state === "PROCESSING" && retries < 60) {
                retries++;
                await new Promise(resolve => setTimeout(resolve, 2000));
                file = await fileManager.getFile(uploadResult.file.name);
            }
            
            promptParts.push({
                fileData: {
                    mimeType: uploadResult.file.mimeType,
                    fileUri: uploadResult.file.uri
                }
            });
            
            // Background cleanup of Google file
            fileManager.deleteFile(uploadResult.file.name).catch(e => console.warn(e));
        }

        // 3. Generate with the EXACT models confirmed by your API key diagnostic
        const modelsToTry = [
            "gemini-2.5-flash", 
            "gemini-2.0-flash",
            "gemini-3.1-flash-lite-preview",
            "gemini-flash-latest",
            "gemini-2.0-flash-lite"
        ];

        let transcriptionText = "";
        let errorDetails = "";

        for (const modelName of modelsToTry) {
            try {
                console.log(`Using your verified model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(promptParts);
                transcriptionText = result.response?.text() || "";
                if (transcriptionText.trim()) break;
            } catch (error: any) {
                console.warn(`Model ${modelName} failed or busy:`, error.message);
                errorDetails = error.message;
            }
        }

        if (!transcriptionText) {
            throw new Error(`Ningún modelo de tu lista respondió. Último error: ${errorDetails}`);
        }

        return { transcription: transcriptionText };
    } catch (error: any) {
        console.error("Final Error Handling:", error);
        return { error: error.message };
    } finally {
        // ... (existing cleanup)
    }
}

/**
 * Fetches the real list of models available for this specific API Key
 * using the REST API to ensure we see exactly what Google sees.
 */
export async function listAvailableModels(apiKey: string) {
    if (!apiKey) return { error: "No se proporcionó clave." };

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || "Error al listar modelos");
        }

        // Filter and clean the model list
        const models = (data.models || [])
            .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => ({
                id: m.name.replace('models/', ''),
                name: m.displayName,
                description: m.description
            }));

        return { models };
    } catch (error: any) {
        console.error("List Models Error:", error.message);
        return { error: error.message };
    }
}
