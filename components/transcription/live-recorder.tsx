"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Mic, StopCircle, Pause, Play, Loader2, Circle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranscription } from "@/components/providers/transcription-provider"

export function LiveRecorder() {
    const { addToQueue } = useTranscription()
    const [isRecording, setIsRecording] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [duration, setDuration] = useState(0)
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    // Format duration to MM:SS
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

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data)
                }
            }

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
                const file = new File([audioBlob], `Grabacion_${timestamp}.webm`, { type: 'audio/webm' })
                
                // Feed into the existing transcription queue
                addToQueue([file])
                
                // Stop all tracks in the stream
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorder.start()
            setIsRecording(true)
            setIsPaused(false)
            setDuration(0)
            
            timerRef.current = setInterval(() => {
                setDuration(prev => prev + 1)
            }, 1000)

        } catch (err) {
            console.error("Error starting recording:", err)
            alert("No se pudo acceder al micrófono. Por favor verifica los permisos.")
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
            setIsPaused(false)
            if (timerRef.current) clearInterval(timerRef.current)
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

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [])

    return (
        <div className="w-full p-6 rounded-3xl bg-card/40 border border-primary/20 backdrop-blur-xl shadow-2xl relative overflow-hidden group transition-all hover:border-primary/40">
            {/* Background Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all duration-500" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-secondary/10 rounded-full blur-3xl group-hover:bg-secondary/20 transition-all duration-500" />

            <div className="flex flex-col items-center gap-6 relative z-10">
                <div className="flex flex-col items-center gap-2">
                    <h3 className="text-lg font-semibold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                        Grabación en Vivo
                    </h3>
                    <p className="text-xs text-muted-foreground">Tu audio se transcribirá automáticamente al finalizar</p>
                </div>

                <div className="flex items-center justify-center gap-8 py-2">
                    <AnimatePresence mode="wait">
                        {!isRecording ? (
                            <motion.div
                                key="start"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                            >
                                <Button
                                    onClick={startRecording}
                                    size="lg"
                                    className="h-16 w-16 rounded-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30 group/btn"
                                >
                                    <Mic className="h-8 w-8 group-hover/btn:scale-110 transition-transform" />
                                </Button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="recording"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="flex items-center gap-6"
                            >
                                <div className="flex flex-col items-center gap-3">
                                    <div className="text-3xl font-mono font-bold tracking-wider text-primary drop-shadow-[0_0_10px_rgba(39,73,208,0.5)]">
                                        {formatTime(duration)}
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                                        <div className={`h-2 w-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`} />
                                        <span className="text-[10px] uppercase font-bold tracking-widest">
                                            {isPaused ? 'En Pausa' : 'Grabando'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <Button
                                        onClick={togglePause}
                                        variant="outline"
                                        size="icon"
                                        className="h-12 w-12 rounded-full border-primary/20 hover:bg-primary/10"
                                    >
                                        {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                                    </Button>
                                    <Button
                                        onClick={stopRecording}
                                        variant="destructive"
                                        size="icon"
                                        className="h-12 w-12 rounded-full shadow-lg shadow-destructive/20"
                                    >
                                        <StopCircle className="h-6 w-6" />
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {!isRecording && (
                    <div className="px-4 py-2 bg-accent/30 rounded-2xl border border-border/50 text-[10px] font-medium text-muted-foreground">
                        LISTO PARA CAPTURAR
                    </div>
                )}
            </div>
        </div>
    )
}
