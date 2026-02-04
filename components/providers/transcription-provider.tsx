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
}

interface TranscriptionContextType {
    queue: QueueItem[]
    setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>
    isProcessing: boolean
    setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>
    addToQueue: (files: File[]) => void
    updateItemStatus: (id: string, status: QueueItem['status'], progress?: number, transcript?: string, error?: string) => void
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

    const updateItemStatus = (id: string, status: QueueItem['status'], progress?: number, transcript?: string, error?: string) => {
        setQueue(prev => prev.map(item => {
            if (item.id === id) {
                return {
                    ...item,
                    status,
                    progress: progress !== undefined ? progress : item.progress,
                    transcript: transcript !== undefined ? transcript : item.transcript,
                    error: error !== undefined ? error : item.error
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
        const process = async () => {
            if (!isProcessing) return

            const pendingItem = queue.find(i => i.status === 'pending')
            if (!pendingItem) {
                setIsProcessing(false)
                return
            }

            setCurrentItemId(pendingItem.id)
            updateItemStatus(pendingItem.id, 'processing', 5)

            // Mock progress
            const progressInterval = setInterval(() => {
                setQueue(prev => prev.map(i =>
                    i.id === pendingItem.id && i.status === 'processing' && i.progress < 90
                        ? { ...i, progress: i.progress + 5 }
                        : i
                ))
            }, 800)

            try {
                const apiKey = localStorage.getItem("gemini_api_key")
                if (!apiKey) throw new Error("No API Key configurada")

                const formData = new FormData()
                formData.append("file", pendingItem.file)
                formData.append("apiKey", apiKey)

                // Dynamic import to avoid server-action issues in context if any? 
                // No, standard import should work if 'use client'
                const { transcribeAudio } = await import("@/app/actions/transcribe")
                const result = await transcribeAudio(formData)

                if (result.error) throw new Error(result.error)

                clearInterval(progressInterval)
                updateItemStatus(pendingItem.id, 'completed', 100, result.transcription)

                // Log usage to Supabase
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

                // Sound effect could be dispatched here or via event
                // const audio = new Audio('/success.mp3') 
                // Placeholder for now

            } catch (error: any) {
                clearInterval(progressInterval)
                updateItemStatus(pendingItem.id, 'error', 0, undefined, error.message)
            } finally {
                setCurrentItemId(null)
            }
        }

        if (isProcessing && !currentItemId) {
            process()
        }
    }, [queue, isProcessing, currentItemId, currentSpace, supabase])


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
