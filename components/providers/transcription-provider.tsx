"use client"

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react'
import { useSpace } from "@/components/providers/space-provider"
import { createClient } from "@/lib/supabase/client"
import { GoogleGenerativeAI } from "@google/generative-ai"

export type QueueItem = {
    id: string
    file: File
    status: 'pending' | 'processing' | 'completed' | 'error'
    progress: number // 0-100
    transcript?: string
    error?: string
    statusMessage?: string
}

interface TranscriptionContextType {
    queue: QueueItem[]
    setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>
    isProcessing: boolean
    setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>
    addToQueue: (files: File[]) => void
    updateItemStatus: (id: string, status: QueueItem['status'], progress?: number, transcript?: string, error?: string, statusMessage?: string) => void
    removeItem: (id: string) => void
}

const TranscriptionContext = createContext<TranscriptionContextType | undefined>(undefined)

export function TranscriptionProvider({ children }: { children: ReactNode }) {
    const [queue, setQueue] = useState<QueueItem[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [currentItemId, setCurrentItemId] = useState<string | null>(null)

    const addToQueue = (files: File[]) => {
        const newItems: QueueItem[] = files.map(file => ({
            id: Math.random().toString(36).substring(7),
            file,
            status: 'pending',
            progress: 0
        }))
        setQueue(prev => [...prev, ...newItems])
    }

    const updateItemStatus = (id: string, status: QueueItem['status'], progress?: number, transcript?: string, error?: string, statusMessage?: string) => {
        setQueue(prev => prev.map(item => {
            if (item.id === id) {
                return {
                    ...item,
                    status,
                    progress: progress !== undefined ? progress : item.progress,
                    transcript: transcript !== undefined ? transcript : item.transcript,
                    error: error !== undefined ? error : item.error,
                    statusMessage: statusMessage !== undefined ? statusMessage : item.statusMessage
                }
            }
            return item
        }))
    }

    const removeItem = (id: string) => {
        setQueue(prev => prev.filter(i => i.id !== id))
    }

    const { currentSpace } = useSpace()
    const supabase = createClient()

    // --- Processing Logic (Global) ---
    useEffect(() => {
        const processQueue = async () => {
            if (!isProcessing) return

            const pendingItem = queue.find(i => i.status === 'pending')
            if (!pendingItem) {
                setIsProcessing(false)
                return
            }

            setCurrentItemId(pendingItem.id)
            updateItemStatus(pendingItem.id, 'processing', 5)
            playNotificationSound('start')

            // Mock progress
            const progressInterval = setInterval(() => {
                setQueue(prev => prev.map(i =>
                    i.id === pendingItem.id && i.status === 'processing' && i.progress < 90
                        ? { ...i, progress: i.progress + 5 }
                        : i
                ))
            }, 800)


            // Fun loading messages to keep user entertained
            const getRandomMessage = (stage: 'upload' | 'extract' | 'split' | 'transcribe' | 'combine') => {
                const messages = {
                    upload: [
                        "Subiendo... ☁️",
                        "Enviando datos... 📡",
                        "Cargando... ⏳",
                    ],
                    extract: [
                        "Desempolvando IA... 🧠",
                        "Extrayendo audio... 🎧",
                        "Escuchando... 👂",
                        "Separando ruido... 🎼"
                    ],
                    split: [
                        "Rebanando audio... 🔪",
                        "Preparando datos... 🍱",
                        "Organizando... 🗂️"
                    ],
                    transcribe: [
                        "Tomando notas... 📝",
                        "Descifrando... 🕵️",
                        "Escribiendo... ✍️",
                        "Convirtiendo... 🔄",
                        "Tecleando... ⌨️"
                    ],
                    combine: [
                        "Uniendo todo... 🧩",
                        "Pulitura final... ✨",
                        "Formateando... 📄",
                        "Casi listo... 🚀"
                    ]
                }
                const stageMessages = messages[stage]
                return stageMessages[Math.floor(Math.random() * stageMessages.length)]
            }

            try {
                const apiKey = localStorage.getItem("gemini_api_key")
                if (!apiKey) throw new Error("No API Key configurada")
                if (!currentSpace) throw new Error("No hay espacio seleccionado")

                // Sanitize filename
                const safeName = pendingItem.file.name.replace(/[^a-zA-Z0-9.-]/g, "_")

                // Check if file needs chunking (> 20MB)
                const { shouldUseChunking } = await import('@/lib/audio-chunker')
                const useChunking = shouldUseChunking(pendingItem.file, 20)

                if (useChunking) {
                    // === CHUNKED PROCESSING FOR LARGE FILES ===
                    clearInterval(progressInterval) // STOP FAKE PROGRESS! We calculate real progress here.

                    let currentExtractMsg = getRandomMessage('extract')
                    updateItemStatus(pendingItem.id, 'processing', 5, undefined, undefined, currentExtractMsg)

                    // Step 1: Extract and split audio
                    const { processFileIntoChunks } = await import('@/lib/audio-chunker')
                    let chunks: Blob[] = []

                    try {
                        chunks = await processFileIntoChunks(
                            pendingItem.file,
                            1, // 1-minute chunks (Bulletproof for Vercel 10s limit)
                            (stage, progress, details) => {
                                if (stage === 'extract') {
                                    // Update progress but KEEP the same message to avoid flickering
                                    updateItemStatus(pendingItem.id, 'processing', Math.round(5 + (progress * 0.15)), undefined, undefined, currentExtractMsg)
                                } else if (stage === 'split') {
                                    if (progress === 0) currentExtractMsg = getRandomMessage('split') // Reuse variable for split msg
                                    updateItemStatus(pendingItem.id, 'processing', Math.round(20 + (progress * 0.1)), undefined, undefined, currentExtractMsg)
                                }
                            }
                        )
                    } catch (error) {
                        // Short error for UI
                        throw new Error(`Error procesando: ${error instanceof Error ? error.message.substring(0, 20) : '...'}`)
                    }

                    updateItemStatus(pendingItem.id, 'processing', 30, undefined, undefined, `Procesando ${chunks.length} segmentos...`)

                    // Step 2: Process each chunk
                    const transcriptions: string[] = []
                    const { transcribeAudio } = await import("@/app/actions/transcribe")

                    for (let i = 0; i < chunks.length; i++) {
                        const chunk = chunks[i]
                        // VALIDATION: Check for empty chunks from ffmpeg
                        if (chunk.size === 0) {
                            console.warn(`Chunk ${i + 1} is 0 bytes. Skipping.`);
                            continue;
                        }

                        const chunkProgress = 30 + ((i / chunks.length) * 65) // Map to 30-95%

                        // 1. DIRECT UPLOAD TO SERVER ACTION (Bypassing Supabase for Speed)
                        updateItemStatus(pendingItem.id, 'processing', Math.round(chunkProgress), undefined, undefined, `Analizando IA (${i + 1}/${chunks.length})...`)

                        // Convert Blob to Base64
                        const base64Promise = new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const result = reader.result as string;
                                const base64 = result.split(',')[1];
                                resolve(base64);
                            }
                            reader.onerror = reject;
                            reader.readAsDataURL(chunk);
                        });

                        const base64Data = await base64Promise;

                        const prompt = "Generate a clean, well-formatted transcription of this audio/video in SPANISH. If the audio is in English or another language, TRANSLATE it to Spanish. Use clear paragraph breaks. Do NOT use markdown. Output plain text only.";

                        // CLIENT-SIDE GEMINI CALL (Bypassing Vercel Server)
                        const genAI = new GoogleGenerativeAI(apiKey);
                        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });

                        const result = await model.generateContent([
                            prompt,
                            {
                                inlineData: {
                                    mimeType: "audio/mp3",
                                    data: base64Data
                                }
                            }
                        ]);

                        const text = result.response.text();

                        if (!text) throw new Error("Empty response from AI");

                        transcriptions.push(text)
                    }

                    // Step 3: Combine transcriptions
                    updateItemStatus(pendingItem.id, 'processing', 95, undefined, undefined, getRandomMessage('combine'))
                    const finalTranscription = transcriptions.join('\n\n')

                    clearInterval(progressInterval)
                    updateItemStatus(pendingItem.id, 'completed', 100, finalTranscription)
                    playNotificationSound('success')

                    // Log to database
                    const { data: { user } } = await supabase.auth.getUser()
                    if (user) {
                        await supabase.from('transcriptions').insert({
                            user_id: user.id,
                            content: finalTranscription,
                            metadata: {
                                space_id: currentSpace?.id,
                                filename: pendingItem.file.name,
                                file_size: pendingItem.file.size,
                                chunks_processed: chunks.length
                            }
                        })
                    }

                } else {
                    // === STANDARD PROCESSING FOR SMALL FILES ===
                    const filePath = `temp_transcriptions/${Date.now()}_${safeName}`

                    updateItemStatus(pendingItem.id, 'processing', 10, undefined, undefined, getRandomMessage('upload'))

                    const { error: uploadError } = await supabase.storage
                        .from('library_files')
                        .upload(filePath, pendingItem.file, {
                            cacheControl: '3600',
                            upsert: false
                        })

                    if (uploadError) throw new Error("Error subiendo archivo: " + uploadError.message)

                    updateItemStatus(pendingItem.id, 'processing', 30, undefined, undefined, getRandomMessage('transcribe'))

                    // Get Signed URL
                    const { data, error: urlError } = await supabase.storage
                        .from('library_files')
                        .createSignedUrl(filePath, 3600)

                    if (urlError || !data?.signedUrl) throw new Error("Error generando URL temporal")

                    // Transcribe
                    const { transcribeAudio } = await import("@/app/actions/transcribe")
                    const result = await transcribeAudio({
                        fileUrl: data.signedUrl,
                        apiKey,
                        mimeType: pendingItem.file.type,
                        originalName: pendingItem.file.name
                    })

                    if (result.error) throw new Error(result.error)

                    // Cleanup
                    await supabase.storage.from('library_files').remove([filePath])

                    clearInterval(progressInterval)
                    updateItemStatus(pendingItem.id, 'completed', 100, result.transcription)
                    playNotificationSound('success')

                    // Log to database
                    const { data: { user } } = await supabase.auth.getUser()
                    if (user) {
                        await supabase.from('transcriptions').insert({
                            user_id: user.id,
                            content: result.transcription,
                            metadata: {
                                space_id: currentSpace?.id,
                                filename: pendingItem.file.name,
                                file_size: pendingItem.file.size
                            }
                        })
                    }
                }

            } catch (error: any) {
                clearInterval(progressInterval)
                updateItemStatus(pendingItem.id, 'error', 0, undefined, error.message)
                playNotificationSound('error')
            } finally {
                setCurrentItemId(null)
            }
        }

        if (isProcessing && !currentItemId) {
            processQueue()
        }
    }, [queue, isProcessing, currentItemId, currentSpace, supabase])

    // --- Audio Feedback ---
    const playNotificationSound = (type: 'success' | 'error' | 'start') => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;

            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'success') {
                // Happy major third beep (Ding!)
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
                osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1); // C#6
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.6);
            } else if (type === 'start') {
                // Soft start blip
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                gain.gain.setValueAtTime(0.05, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.2);
            } else {
                // Error buzz
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(110, ctx.currentTime);
                osc.frequency.linearRampToValueAtTime(55, ctx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.3);
            }
        } catch (e) {
            console.error("Audio playback error:", e);
        }
    }


    return (
        <TranscriptionContext.Provider value={{ queue, setQueue, isProcessing, setIsProcessing, addToQueue, updateItemStatus, removeItem }}>
            {children}
        </TranscriptionContext.Provider>
    )
}

export function useTranscription() {
    const context = useContext(TranscriptionContext)
    if (context === undefined) {
        throw new Error('useTranscription must be used within a TranscriptionProvider')
    }
    return context
}
