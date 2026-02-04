"use client"

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react'
import { useSpace } from "@/components/providers/space-provider"
import { createClient } from "@/lib/supabase/client"

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
                    let currentExtractMsg = getRandomMessage('extract')
                    updateItemStatus(pendingItem.id, 'processing', 5, undefined, undefined, currentExtractMsg)

                    // Step 1: Extract and split audio
                    const { processFileIntoChunks } = await import('@/lib/audio-chunker')
                    let chunks: Blob[] = []

                    try {
                        chunks = await processFileIntoChunks(
                            pendingItem.file,
                            10, // 10-minute chunks
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
                        throw new Error(`Error procesando archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`)
                    }

                    updateItemStatus(pendingItem.id, 'processing', 30, undefined, undefined, `Procesando ${chunks.length} segmentos...`)

                    // Step 2: Process each chunk
                    const transcriptions: string[] = []
                    const { transcribeAudio } = await import("@/app/actions/transcribe")

                    for (let i = 0; i < chunks.length; i++) {
                        const chunk = chunks[i]
                        const chunkProgress = 30 + ((i / chunks.length) * 65) // Map to 30-95%

                        // Pick a fun message for this chunk and stick with it
                        // Add segment info to the message so it's informative AND fun
                        const baseMsg = getRandomMessage('transcribe')
                        const msg = `${baseMsg} (${i + 1}/${chunks.length})`

                        updateItemStatus(
                            pendingItem.id,
                            'processing',
                            Math.round(chunkProgress),
                            undefined,
                            undefined,
                            msg
                        )

                        // Upload chunk to Supabase
                        const chunkPath = `temp_transcriptions/${Date.now()}_chunk_${i}.mp3`
                        const { error: uploadError } = await supabase.storage
                            .from('library_files')
                            .upload(chunkPath, chunk, {
                                cacheControl: '3600',
                                upsert: false
                            })

                        if (uploadError) {
                            throw new Error(`Error subiendo segmento ${i + 1}: ${uploadError.message}`)
                        }

                        // Get signed URL
                        const { data, error: urlError } = await supabase.storage
                            .from('library_files')
                            .createSignedUrl(chunkPath, 3600)

                        if (urlError || !data?.signedUrl) {
                            await supabase.storage.from('library_files').remove([chunkPath])
                            throw new Error(`Error generando URL para segmento ${i + 1}`)
                        }

                        // Transcribe chunk
                        const result = await transcribeAudio({
                            fileUrl: data.signedUrl,
                            apiKey,
                            mimeType: 'audio/mpeg',
                            originalName: `chunk_${i}.mp3`
                        })

                        // Clean up chunk
                        await supabase.storage.from('library_files').remove([chunkPath])

                        if (result.error) {
                            throw new Error(`Error transcribiendo segmento ${i + 1}: ${result.error}`)
                        }

                        transcriptions.push(result.transcription || '')
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
