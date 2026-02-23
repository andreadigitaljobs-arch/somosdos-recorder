"use client"

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react'
import { useSpace } from "@/components/providers/space-provider"
import { createClient } from "@/lib/supabase/client"
import { useAudioFeedback } from "@/hooks/use-audio-feedback"

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
    saveToLibrary: (item: QueueItem, folderId: string | null, customName?: string) => Promise<boolean>
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

            // Fun loading messages to keep user entertained
            const getRandomMessage = (stage: 'upload' | 'extract' | 'split' | 'transcribe' | 'combine') => {
                const messages = {
                    upload: [
                        "Subiendo al servidor... ☁️",
                        "Enviando datos... 📡",
                        "Cargando... ⏳",
                    ],
                    extract: [
                        "Desempolvando IA... 🧠",
                        "Extrayendo audio... 🎧",
                        "Escuchando... 👂",
                    ],
                    split: [
                        "Rebanando audio... 🔪",
                        "Preparando datos... 🍱",
                    ],
                    transcribe: [
                        "La IA está pensando... 🤖",
                        "Descifrando audio... 🕵️",
                        "Escribiendo transcripción... ✍️",
                        "Procesando en Railway... 🚄",
                    ],
                    combine: [
                        "Uniendo todo... 🧩",
                        "Pulitura final... ✨",
                        "Guardando... 💾"
                    ]
                }
                const stageMessages = messages[stage]
                return stageMessages[Math.floor(Math.random() * stageMessages.length)]
            }

            try {
                // Determine API Key (Local or let Server use fallback)
                const localKey = localStorage.getItem("gemini_api_key") || "";
                if (!currentSpace) throw new Error("No hay espacio seleccionado")

                // Sanitize filename
                const safeName = pendingItem.file.name.replace(/[^a-zA-Z0-9.-]/g, "_")

                // Check if file needs chunking
                // LOWERED to 20MB: files >20MB get chunked into 10-min segments
                // This ensures long audio (e.g. 52MB/1.5hr) is fully transcribed
                // instead of hitting Gemini's output token limit
                const { shouldUseChunking } = await import('@/lib/audio-chunker')
                const useChunking = shouldUseChunking(pendingItem.file, 20)

                // Helper to safely import with version check
                async function safeImport<T>(importFn: () => Promise<T>): Promise<T> {
                    try {
                        return await importFn()
                    } catch (error: any) {
                        try {
                            if (error.name === 'ChunkLoadError' || error.message?.includes('load chunk')) {
                                throw new Error("Sistema actualizado. Por favor recarga la página (F5) para continuar.")
                            }
                        } catch (e) {
                            // Ignore error checking logic errors
                        }
                        throw error
                    }
                }

                if (useChunking) {
                    // === CHUNKED PROCESSING (For files > 95MB) ===
                    let currentExtractMsg = getRandomMessage('extract')
                    updateItemStatus(pendingItem.id, 'processing', 5, undefined, undefined, currentExtractMsg)

                    // Step 1: Extract and split audio
                    const { processFileIntoChunks } = await safeImport(() => import('@/lib/audio-chunker'))
                    let chunks: Blob[] = []

                    try {
                        chunks = await processFileIntoChunks(
                            pendingItem.file,
                            2, // 2-minute chunks (Safe for File API)
                            (stage, progress, details) => {
                                if (stage === 'extract') {
                                    updateItemStatus(pendingItem.id, 'processing', Math.round(5 + (progress * 0.15)), undefined, undefined, currentExtractMsg)
                                } else if (stage === 'split') {
                                    if (progress === 0) currentExtractMsg = getRandomMessage('split')
                                    updateItemStatus(pendingItem.id, 'processing', Math.round(20 + (progress * 0.1)), undefined, undefined, currentExtractMsg)
                                }
                            }
                        )
                    } catch (error) {
                        throw new Error(`Error procesando: ${error instanceof Error ? error.message.substring(0, 50) : '...'}`)
                    }

                    updateItemStatus(pendingItem.id, 'processing', 30, undefined, undefined, `Procesando ${chunks.length} segmentos...`)

                    // Step 2: Process each chunk via Server Action
                    const transcriptions: string[] = []

                    for (let i = 0; i < chunks.length; i++) {
                        const chunk = chunks[i]
                        const chunkProgress = 30 + ((i / chunks.length) * 65)

                        updateItemStatus(pendingItem.id, 'processing', Math.round(chunkProgress), undefined, undefined, `Analizando bloque ${i + 1}/${chunks.length}...`)

                        // Convert Chunk to Base64
                        const base64Promise = new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const result = reader.result as string;
                                // Handle both data: URLs and raw
                                const base64 = result.includes(',') ? result.split(',')[1] : result;
                                resolve(base64);
                            }
                            reader.onerror = reject;
                            reader.readAsDataURL(chunk);
                        });
                        const base64Data = await base64Promise;

                        // Call SERVER ACTION
                        const { transcribeAudio } = await safeImport(() => import("@/app/actions/transcribe"))
                        const result = await transcribeAudio({
                            fileBase64: base64Data,
                            apiKey: localKey, // Pass local key if exists, or Server will use ENV
                            mimeType: 'audio/mp3',
                            originalName: `part_${i}_${safeName}`
                        })

                        if (result.error) {
                            throw new Error(`Error en bloque ${i + 1}: ${result.error}`)
                        }

                        transcriptions.push(result.transcription || "")
                    }

                    // Step 3: Combine
                    const finalTranscription = transcriptions.join('\n\n')
                    updateItemStatus(pendingItem.id, 'completed', 100, finalTranscription)
                    playNotificationSound('success')
                    // Fix: Don't await DB save to prevent blocking queue if network is slow
                    saveToDb(finalTranscription, pendingItem, currentSpace, chunks.length).catch(e => console.error("Background Save Error:", e))

                } else {
                    // === SINGLE FILE PROCESSING (< 95MB) ===
                    // This is the optimized path on Railway
                    updateItemStatus(pendingItem.id, 'processing', 10, undefined, undefined, getRandomMessage('upload'))

                    const base64Promise = new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const result = reader.result as string;
                            const base64 = result.includes(',') ? result.split(',')[1] : result;
                            resolve(base64);
                        }
                        reader.onerror = reject;
                        reader.readAsDataURL(pendingItem.file);
                    });
                    const base64Data = await base64Promise;

                    updateItemStatus(pendingItem.id, 'processing', 15, undefined, undefined, getRandomMessage('transcribe'))

                    // SIMULATED PROGRESS: Start advancing from 15% to 98% while waiting
                    let currentSimulatedProgress = 15
                    const progressInterval = setInterval(() => {
                        currentSimulatedProgress += (Math.random() * 1.5) // Slower increment to last longer
                        if (currentSimulatedProgress > 98) currentSimulatedProgress = 98 // Cap at 98%
                        updateItemStatus(pendingItem.id, 'processing', Math.round(currentSimulatedProgress))
                    }, 800) // Update every 800ms

                    const { transcribeAudio } = await safeImport(() => import("@/app/actions/transcribe"))

                    let result
                    try {
                        result = await transcribeAudio({
                            fileBase64: base64Data, // Send Full File
                            apiKey: localKey,
                            mimeType: pendingItem.file.type || 'audio/mp3',
                            originalName: safeName
                        })
                    } finally {
                        clearInterval(progressInterval) // Stop animation
                    }

                    if (result.error) {
                        throw new Error(`Error Servidor: ${result.error}`)
                    }

                    updateItemStatus(pendingItem.id, 'completed', 100, result.transcription)
                    playNotificationSound('success')
                    // Fix: Don't await DB save to prevent blocking queue
                    saveToDb(result.transcription || "", pendingItem, currentSpace).catch(e => console.error("Background Save Error:", e))
                }

            } catch (error: any) {
                console.error(error)
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

    // Helper for DB Save (Internal Log)
    const saveToDb = async (content: string, item: QueueItem, space: any, chunksCount = 1) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            await supabase.from('transcriptions').insert({
                user_id: user.id,
                content: content,
                metadata: {
                    space_id: space?.id,
                    filename: item.file.name,
                    file_size: item.file.size,
                    chunks_processed: chunksCount
                }
            })
        }
    }

    // === PERSISTENT SAVE TO LIBRARY (Survives Navigation) ===
    const saveToLibrary = async (item: QueueItem, folderId: string | null, customName?: string) => {
        // 1. Session Check
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !session?.user) {
            const { data: refreshData } = await supabase.auth.refreshSession()
            if (!refreshData.session) throw new Error("Tu sesión ha expirado.")
        }

        const user = (await supabase.auth.getUser()).data.user
        if (!user) throw new Error("No autenticado")
        if (!currentSpace) throw new Error("No hay espacio seleccionado")

        // 2. Prepare Data
        const fullFileName = customName ? customName.trim() : item.file.name
        const finalName = fullFileName.endsWith('.txt') ? fullFileName : `${fullFileName}.txt`
        const sanitizedName = finalName.replace(/[^a-zA-Z0-9.-]/g, '_')
        const filePath = `${user.id}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${sanitizedName}`

        const blob = new Blob([item.transcript || ""], { type: 'text/plain' })
        const fileObj = new File([blob], finalName, { type: 'text/plain' })

        // 3. Parallel Upload & Insert
        // We do NOT use Promise.race timeout here to allow background throttling to take its time if needed
        const uploadPromise = supabase.storage.from('library_files').upload(filePath, fileObj)

        const insertPromise = supabase.from('files').insert({
            user_id: user.id,
            space_id: currentSpace.id,
            parent_id: folderId,
            name: finalName,
            type: 'file',
            size_bytes: blob.size,
            storage_path: filePath
        }).select().single()

        try {
            const [uploadResult, insertResult] = await Promise.all([uploadPromise, insertPromise])

            if (uploadResult.error) throw uploadResult.error
            if (insertResult.error) throw insertResult.error

            return true
        } catch (error) {
            console.error("Save failed:", error)
            // Rollback (Silent)
            await supabase.storage.from('library_files').remove([filePath])
            throw error
        }
    }

    // --- Audio Feedback ---
    const { playSound } = useAudioFeedback()
    const playNotificationSound = playSound // Alias for compatibility with existing code

    return (
        <TranscriptionContext.Provider value={{ queue, setQueue, isProcessing, setIsProcessing, addToQueue, updateItemStatus, removeItem, saveToLibrary }}>
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
