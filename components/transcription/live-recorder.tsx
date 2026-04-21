"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Mic, StopCircle, Pause, Play, Loader2, Circle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranscription } from "@/components/providers/transcription-provider"

import { saveRecordingSession, deleteRecordingSession, getAllPendingRecordings, PendingRecording } from "@/lib/recorder-db"
import { Download, Trash2, RotateCcw } from "lucide-react"

export function LiveRecorder() {
    const { addToQueue } = useTranscription()
    const [isRecording, setIsRecording] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [duration, setDuration] = useState(0)
    const [pendingRecovery, setPendingRecovery] = useState<PendingRecording | null>(null)
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const sessionIdRef = useRef<string>(`rec_${Date.now()}`)

    // Check for recoveries on mount
    useEffect(() => {
        async function checkRecoveries() {
            const pending = await getAllPendingRecordings()
            if (pending.length > 0) {
                setPendingRecovery(pending[0]) // Show most recent recovery
            }
        }
        checkRecoveries()
    }, [])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mediaRecorder = new MediaRecorder(stream)
            
            mediaRecorderRef.current = mediaRecorder
            chunksRef.current = []
            sessionIdRef.current = `rec_${Date.now()}`

            mediaRecorder.ondataavailable = async (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data)
                    // PERSISTENCE: Save to IndexedDB on every chunk
                    await saveRecordingSession({
                        id: sessionIdRef.current,
                        timestamp: Date.now(),
                        chunks: chunksRef.current
                    })
                }
            }

            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorder.start(3000) // Chunk every 3 seconds for safety
            setIsRecording(true)
            setIsPaused(false)
            setDuration(0)
            
            timerRef.current = setInterval(() => {
                setDuration(prev => prev + 1)
            }, 1000)

        } catch (err) {
            console.error("Error starting recording:", err)
            alert("No se pudo acceder al micrófono.")
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
            setIsPaused(false)
            if (timerRef.current) clearInterval(timerRef.current)
            // Note: Data is already in IndexedDB thanks to ondataavailable
        }
    }

    const handleTranscription = async (recording: PendingRecording | null = null) => {
        const session = recording || { chunks: chunksRef.current, id: sessionIdRef.current }
        if (session.chunks.length === 0) return

        const audioBlob = new Blob(session.chunks, { type: 'audio/webm' })
        const file = new File([audioBlob], `Grabacion_${new Date().toISOString()}.webm`, { type: 'audio/webm' })
        
        addToQueue([file])
        
        // Cleanup IndexedDB after successful dispatch to queue
        await deleteRecordingSession(session.id)
        if (recording) setPendingRecovery(null)
    }

    const handleDownload = (recording: PendingRecording | null = null) => {
        const session = recording || { chunks: chunksRef.current }
        if (session.chunks.length === 0) return

        const audioBlob = new Blob(session.chunks, { type: 'audio/webm' })
        const url = URL.createObjectURL(audioBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = `SomosDos_Grabacion_${new Date().toLocaleDateString()}.webm`
        a.click()
        URL.revokeObjectURL(url)
    }

    const discardRecording = async (id: string) => {
        if (confirm("¿Estás seguro de descartar esta grabación? No se podrá recuperar.")) {
            await deleteRecordingSession(id)
            setPendingRecovery(null)
            if (!isRecording) chunksRef.current = []
        }
    }

    const togglePause = () => {
        if (mediaRecorderRef.current && isRecording) {
            if (isPaused) {
                mediaRecorderRef.current.resume()
                timerRef.current = setInterval(() => {
                    setDuration(prev => prev + 1)
                }, 1000)
            } else {
                mediaRecorderRef.current.pause()
                if (timerRef.current) clearInterval(timerRef.current)
            }
            setIsPaused(!isPaused)
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Recovery Alert */}
            <AnimatePresence>
                {pendingRecovery && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="glass-card p-4 rounded-2xl border-amber-500/30 bg-amber-500/5 flex items-center justify-between gap-4"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/20 rounded-full">
                                <RotateCcw className="h-4 w-4 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-amber-500 uppercase tracking-tighter">Grabación Recuperada</p>
                                <p className="text-[10px] text-muted-foreground">{new Date(pendingRecovery.timestamp).toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="h-8 text-[10px] border-amber-500/20" onClick={() => handleDownload(pendingRecovery)}>Descargar</Button>
                            <Button size="sm" className="h-8 text-[10px] bg-amber-600 hover:bg-amber-700" onClick={() => handleTranscription(pendingRecovery)}>Transcribir</Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => discardRecording(pendingRecovery.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Recorder Card */}
            <div className="w-full p-8 rounded-[2rem] glass border-primary/20 shadow-2xl relative overflow-hidden group transition-all hover:border-primary/40 min-h-[220px] flex flex-col items-center justify-center">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                
                <div className="flex flex-col items-center gap-6 relative z-10 w-full text-center">
                    {!isRecording && !pendingRecovery && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="space-y-4"
                        >
                            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-primary to-secondary p-[2px] mx-auto group-hover:scale-105 transition-transform duration-500">
                                <Button
                                    onClick={startRecording}
                                    className="w-full h-full rounded-full bg-card hover:bg-transparent transition-colors flex items-center justify-center p-0"
                                >
                                    <Mic className="h-8 w-8 text-foreground group-hover:text-white transition-colors" />
                                </Button>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold">Iniciar Nueva Grabación</h3>
                                <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">Tus sesiones se guardan localmente para evitar pérdidas.</p>
                            </div>
                        </motion.div>
                    )}

                    {isRecording && (
                        <div className="w-full space-y-6">
                            <div className="flex flex-col items-center gap-2">
                                <div className="text-5xl font-mono font-black tracking-tighter text-foreground drop-shadow-[0_0_15px_rgba(39,73,208,0.3)]">
                                    {formatTime(duration)}
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-background/50 rounded-full border border-border/50">
                                    <div className={`h-2 w-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`} />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground/70">
                                        {isPaused ? 'En Pausa' : 'Grabando'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center justify-center gap-4">
                                <Button
                                    onClick={togglePause}
                                    variant="outline"
                                    size="lg"
                                    className="h-14 w-14 rounded-full border-primary/20 bg-primary/5 hover:bg-primary/10"
                                >
                                    {isPaused ? <Play className="h-6 w-6 text-primary fill-primary" /> : <Pause className="h-6 w-6 text-primary fill-primary" />}
                                </Button>
                                <Button
                                    onClick={stopRecording}
                                    size="lg"
                                    className="h-16 w-16 rounded-full bg-primary hover:bg-primary/90 shadow-xl shadow-primary/30"
                                >
                                    <StopCircle className="h-8 w-8" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {!isRecording && chunksRef.current.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full space-y-4"
                        >
                            <p className="text-xs font-bold text-primary uppercase tracking-widest italic">Grabación Finalizada</p>
                            <div className="flex gap-3 justify-center">
                                <Button variant="outline" className="gap-2 rounded-2xl h-12" onClick={() => handleDownload()}>
                                    <Download className="h-4 w-4" /> Descargar
                                </Button>
                                <Button className="gap-2 rounded-2xl h-12 px-8 bg-gradient-to-r from-primary to-secondary" onClick={() => handleTranscription()}>
                                    Transcribir con IA
                                </Button>
                                <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl hover:bg-destructive/10 hover:text-destructive" onClick={() => discardRecording(sessionIdRef.current)}>
                                    <Trash2 className="h-5 w-5" />
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    )
}
    )
}
