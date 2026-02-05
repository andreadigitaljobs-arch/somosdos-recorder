"use client"

import { useState, useEffect, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Upload, Play, Save, Copy, FolderPlus, Folder, X, CheckCircle, Clock, Loader2, AlertCircle, Eye, Pencil } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { useSpace } from "@/components/providers/space-provider"
import { useTranscription, QueueItem } from "@/components/providers/transcription-provider"

// Types
type FolderItem = {
    id: string
    name: string
    parent_id: string | null
}

export default function TranscriptorPage() {
    // --- Global State ---
    const { queue, isProcessing, setIsProcessing, addToQueue, removeItem, updateItemStatus } = useTranscription()

    // --- Local UI State ---
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
    const [itemToSave, setItemToSave] = useState<QueueItem | null>(null)
    const [saveFileName, setSaveFileName] = useState("")
    const [folders, setFolders] = useState<FolderItem[]>([])
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
    const [showToast, setShowToast] = useState(false)
    const [toastStatus, setToastStatus] = useState<'loading' | 'success' | 'error'>('loading')
    const [toastMessage, setToastMessage] = useState("")

    // Toast Auto-Dismiss (only for success/error)
    useEffect(() => {
        if (showToast && toastStatus !== 'loading') {
            const timer = setTimeout(() => setShowToast(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [showToast, toastStatus])
    const [isCreatingFolder, setIsCreatingFolder] = useState(false)
    const [newFolderName, setNewFolderName] = useState("")

    // Preview/Edit State
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
    const [previewItem, setPreviewItem] = useState<QueueItem | null>(null)
    const [previewText, setPreviewText] = useState("")

    const { currentSpace } = useSpace()
    const supabase = createClient()

    // --- File Handling ---
    const onDrop = (acceptedFiles: File[]) => {
        addToQueue(acceptedFiles)
    }

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'audio/*': [], 'video/*': [] },
        maxFiles: 10
    })

    const [loadingFolders, setLoadingFolders] = useState(false)

    // --- Save Modal Logic ---
    const openSaveModal = (item: QueueItem) => {
        if (!currentSpace) {
            alert("Selecciona un espacio primero")
            return
        }
        setItemToSave(item)
        // FIX: Use original filename without extension as default
        const originalName = item.file.name.substring(0, item.file.name.lastIndexOf('.')) || item.file.name
        setSaveFileName(originalName)

        setIsSaveModalOpen(true)
        // Only show loading spinner if we don't have folders yet
        fetchFolders(folders.length > 0)
    }

    const fetchFolders = async (silent = false) => {
        if (!currentSpace) return
        if (!silent) setLoadingFolders(true)
        if (silent) setConnectionStatus('reconnecting')

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            if (!silent) setLoadingFolders(false)
            setConnectionStatus('disconnected')
            return
        }

        try {
            // Timeout promise to prevent hanging
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Tiempo de espera agotado")), 8000)
            );

            const fetchPromise = supabase
                .from('files')
                .select('id, name, parent_id')
                .eq('user_id', user.id)
                .eq('space_id', currentSpace.id)
                .eq('type', 'folder')
                .order('name', { ascending: true })
                .limit(2000)

            // Race against timeout
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any

            if (error) throw error
            if (data) {
                setFolders(data)
                setConnectionStatus('connected')
                setLastRefreshed(new Date())
            }

        } catch (error: any) {
            console.error(error)
            setConnectionStatus('disconnected')
            if (!silent) {
                alert(error.message === "Tiempo de espera agotado"
                    ? "La conexión tardó demasiado. Intenta refrescar de nuevo."
                    : "Error cargando carpetas. Verifica tu conexión."
                )
            }
        } finally {
            if (!silent) setLoadingFolders(false)
        }
    }

    // Auto-refresh folders every 30s to keep connection alive
    // Auto-refresh folders every 30s AND on window focus
    useEffect(() => {
        if (currentSpace) {
            fetchFolders(true)

            // 1. Interval (5s Aggressive Heartbeat)
            const interval = setInterval(() => {
                fetchFolders(true)
            }, 5000)

            // 2. Focus Handler
            const handleFocus = () => {
                // Force refresh when tab becomes active
                fetchFolders(true)
            }
            window.addEventListener('focus', handleFocus)

            return () => {
                clearInterval(interval)
                window.removeEventListener('focus', handleFocus)
            }
        }
    }, [currentSpace, fetchFolders])

    const handleCreateFolder = async () => {
        if (!newFolderName || !currentSpace) return
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data, error } = await supabase
                .from('files')
                .insert({
                    user_id: user.id,
                    space_id: currentSpace.id,
                    parent_id: selectedFolderId,
                    name: newFolderName,
                    type: 'folder'
                })
                .select().single()

            if (error) throw error
            await fetchFolders()
            if (data) setSelectedFolderId(data.id)
            setNewFolderName("")
            setIsCreatingFolder(false)
        } catch (e: any) {
            console.error(e)
            alert("Error creando carpeta: " + e.message)
        }
    }

    // --- Batch Save State ---
    const [isBatchSaveModalOpen, setIsBatchSaveModalOpen] = useState(false)
    // removed unused batchFolderName

    // --- Helper: Save Single Item (Refactored) ---
    const saveItemToLibrary = async (item: QueueItem, folderId: string | null, customName?: string) => {
        if (!item.transcript) throw new Error("No hay transcripción disponible para guardar")
        if (!currentSpace) throw new Error("No hay un espacio seleccionado")

        // Use getSession for faster, local validation to avoid timeouts
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        // Explicitly check and try to refresh if needed
        if (sessionError || !session?.user) {
            console.warn("Session may be expired, attempting refresh...")
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
            if (refreshError || !refreshData.session) {
                throw new Error("Tu sesión ha expirado. Por favor recarga la página.")
            }
        }

        const user = session?.user || (await supabase.auth.getUser()).data.user
        if (!user) throw new Error("No usuario autenticado")

        // Ensure .txt extension
        const fullFileName = customName ? customName.trim() : item.file.name
        const finalName = fullFileName.endsWith('.txt') ? fullFileName : `${fullFileName}.txt`

        // SANITIZATION
        const sanitizedName = finalName.replace(/[^a-zA-Z0-9.-]/g, '_')
        const filePath = `${user.id}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${sanitizedName}`

        const blob = new Blob([item.transcript], { type: 'text/plain' })
        const fileObj = new File([blob], finalName, { type: 'text/plain' })

        // PARALLEL EXECUTION: Upload and Insert simultaneously to reduce latency
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
            // SAFETY TIMEOUT: 15 seconds max
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Tiempo de espera agotado (15s). Verifica tu conexión.")), 15000)
            )

            const [uploadResult, insertResult] = await Promise.race([
                Promise.all([uploadPromise, insertPromise]),
                timeoutPromise
            ]) as [any, any] // Type assertion for race result

            // Check for errors in results
            if (uploadResult.error) throw uploadResult.error
            if (insertResult.error) throw insertResult.error

        } catch (error) {
            // ROLLBACK: If something failed, try to clean up to avoid orphans/broken links
            console.error("Error in parallel save, rolling back:", error)
            // Attempt to delete file (silent fail ok)
            await supabase.storage.from('library_files').remove([filePath])
            // Attempt to delete DB row (difficult without ID, but if insert failed we are good. 
            // If insert succeeded but upload failed, we ideally delete the row. 
            // Since we can't easily get the ID if upload threw first, we rely on user retrying.)
            throw error
        }
    }

    // --- Optimistic Save Logic ---
    const [isSaving, setIsSaving] = useState(false) // Restore state for batch/compatibility

    const confirmSave = async () => {
        if (!itemToSave) return

        // 1. Optimistic Close
        setIsSaveModalOpen(false)

        // 2. Show Loading Toast
        setToastStatus('loading')
        setToastMessage("Guardando transcripción...")
        setShowToast(true)

        try {
            // 3. Background Save
            await saveItemToLibrary(itemToSave, selectedFolderId, saveFileName)

            // 4. Update Toast to Success
            setToastStatus('success')
            setToastMessage("¡Guardado exitosamente!")

        } catch (error: any) {
            console.error("Error guardando:", error)
            setToastStatus('error')
            setToastMessage(`Error: ${error.message}`)
            // Keep error toast visible longer or let user dismiss? 
            // Auto-dismiss handles it in 3s
        }
    }

    const openBatchSave = () => {
        if (!currentSpace) return alert("Selecciona un espacio")
        fetchFolders()
        // removed setBatchFolderName
        setIsBatchSaveModalOpen(true)
    }

    const confirmBatchSave = async () => {
        const completedItems = queue.filter(i => i.status === 'completed')
        if (completedItems.length === 0 || !currentSpace) return

        // Optimistic UI for Batch
        setIsBatchSaveModalOpen(false)
        setToastStatus('loading')
        setToastMessage(`Guardando ${completedItems.length} archivos...`)
        setShowToast(true)

        try {
            let targetId = selectedFolderId

            // If creating a new folder for this batch
            if (isCreatingFolder && newFolderName) {
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.user) throw new Error("No autenticado")

                const { data, error } = await supabase.from('files').insert({
                    user_id: session.user.id,
                    space_id: currentSpace.id,
                    parent_id: selectedFolderId,
                    name: newFolderName,
                    type: 'folder'
                }).select().single()

                if (error) throw error
                targetId = data.id
            }

            // PARALLEL BATCH SAVE
            // Run all saves simultaneously so total timeout is max ~15s, not 15s * N
            const savePromises = completedItems.map(async (item) => {
                try {
                    await saveItemToLibrary(item, targetId)
                    return { status: 'fulfilled', item }
                } catch (error) {
                    console.error(`Failed to save ${item.file.name}`, error)
                    return { status: 'rejected', item, error }
                }
            })

            const results = await Promise.all(savePromises)

            // Count success
            const successCount = results.filter(r => r.status === 'fulfilled').length
            const failures = results.filter(r => r.status === 'rejected')

            if (failures.length > 0) {
                // Log or handle partial failures if needed
                console.warn("Algunos archivos no se guardaron:", failures)
            }

            setToastStatus('success')
            setToastMessage(`Guardado completado: ${successCount}/${completedItems.length}`)
            setIsCreatingFolder(false)
            setNewFolderName("")

        } catch (error: any) {
            setToastStatus('error')
            setToastMessage("Error en guardado masivo: " + error.message)
        }
    }


    // --- Preview Logic ---
    const openPreview = (item: QueueItem) => {
        setPreviewItem(item)
        setPreviewText(item.transcript || "")
        setIsPreviewModalOpen(true)
    }

    const savePreviewEdits = () => {
        if (!previewItem) return
        // Update the global state with the new transcript
        updateItemStatus(previewItem.id, 'completed', 100, previewText)
        setIsPreviewModalOpen(false)
    }


    return (
        <div className="space-y-4 h-full flex flex-col relative">
            {/* Custom Status Toast */}
            <AnimatePresence mode="wait">
                {showToast && (
                    <motion.div
                        key={toastStatus} // force re-render on status change for animation
                        initial={{ opacity: 0, y: -20, x: "-50%" }}
                        animate={{ opacity: 1, y: 0, x: "-50%" }}
                        exit={{ opacity: 0, y: -20, x: "-50%" }}
                        className={`fixed top-6 left-1/2 pixel-perfect-center z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-md bg-opacity-95 border transition-colors duration-300
                            ${toastStatus === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' :
                                toastStatus === 'error' ? 'bg-red-500 border-red-400 text-white' :
                                    'bg-indigo-500 border-indigo-400 text-white'}`}
                        style={{ transform: "translateX(-50%)" }}
                    >
                        <div className="bg-white/20 p-1 rounded-full">
                            {toastStatus === 'success' && <CheckCircle className="h-4 w-4 text-white" />}
                            {toastStatus === 'error' && <AlertCircle className="h-4 w-4 text-white" />}
                            {toastStatus === 'loading' && <Loader2 className="h-4 w-4 text-white animate-spin" />}
                        </div>
                        <span className="font-medium text-sm">{toastMessage}</span>
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Transcriptor IA</h2>
                {queue.some(i => i.status === 'completed') && (
                    <Button onClick={openBatchSave} className="bg-primary hover:bg-primary/90">
                        <Save className="h-4 w-4 mr-2" /> Guardar Todo ({queue.filter(i => i.status === 'completed').length})
                    </Button>
                )}
            </div>

            {/* Main Area: Split into Upload / Queue */}
            <div className="flex-1 overflow-hidden flex flex-col gap-6">

                {/* Upload Area (Always visible but shrinks if queue exists) */}
                <div
                    {...getRootProps()}
                    className={`w-full ${queue.length > 0 ? 'h-32' : 'flex-1'} min-h-[150px] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all cursor-pointer ${isDragActive ? 'border-primary bg-primary/10' : 'border-border bg-card/50 hover:bg-card/80'}`}
                >
                    <input {...getInputProps()} />
                    <div className="p-3 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 mb-2 shadow-inner">
                        <Upload className={`${queue.length > 0 ? 'h-6 w-6' : 'h-10 w-10'} text-primary`} />
                    </div>
                    <p className="text-sm font-medium text-center">
                        {isDragActive ? "Suelta los archivos aquí" : "Arrastra tus archivos de audio/video"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Soporta múltiples archivos</p>
                </div>

                {/* Queue List */}
                {queue.length > 0 && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-card/30 rounded-2xl border border-border/50">
                        <div className="p-4 border-b border-border/50 flex justify-between items-center bg-card/50">
                            <h3 className="font-semibold text-sm">Cola de Transcripción ({queue.length})</h3>
                            {!isProcessing && queue.find(i => i.status === 'pending') && (
                                <Button size="sm" onClick={() => setIsProcessing(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                    <Play className="h-3 w-3 mr-2" /> Iniciar Todo
                                </Button>
                            )}
                            {isProcessing && (
                                <p className="text-xs text-primary animate-pulse font-medium">Procesando cola...</p>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            <AnimatePresence>
                                {queue.map(item => (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className={`relative flex items-center gap-3 p-3 rounded-xl border ${item.status === 'processing' ? 'border-primary/50 bg-primary/5' : 'border-border/30 bg-card/60'}`}
                                    >
                                        {/* Status Icon */}
                                        <div className="flex-shrink-0">
                                            {item.status === 'pending' && <Clock className="h-5 w-5 text-muted-foreground" />}
                                            {item.status === 'processing' && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
                                            {item.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-500" />}
                                            {item.status === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
                                        </div>

                                        {/* File Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{item.file.name}</p>
                                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                <span>{(item.file.size / 1024 / 1024).toFixed(2)} MB</span>
                                                {item.status === 'processing' && (
                                                    <span className="flex items-center gap-2">
                                                        <span>{Math.round(item.progress)}%</span>
                                                        {item.statusMessage && (
                                                            <span className="hidden sm:inline-block text-primary/80 animate-pulse truncate max-w-[300px] md:max-w-[400px]">
                                                                {item.statusMessage}
                                                            </span>
                                                        )}
                                                    </span>
                                                )}
                                                {item.status === 'error' && <span className="text-red-400 truncate max-w-[150px]">{item.error}</span>}
                                            </div>
                                            {/* Progress Bar */}
                                            {item.status === 'processing' && (
                                                <div className="h-1 w-full bg-accent rounded-full mt-2 overflow-hidden">
                                                    <motion.div
                                                        className="h-full bg-primary"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${item.progress}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2">
                                            {item.status === 'completed' && (
                                                <>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-500 hover:bg-blue-50" onClick={() => openPreview(item)} title="Ver/Editar">
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => openSaveModal(item)} title="Guardar">
                                                        <Save className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { navigator.clipboard.writeText(item.transcript || ""); alert("Copiado!") }}>
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            )}
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {queue.length === 0 && (
                                <p className="text-center text-muted-foreground text-sm py-8">La cola está vacía</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Save Modal */}
            {isSaveModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <Card className="w-full max-w-md p-6 space-y-4 bg-background border-border shadow-2xl relative">
                        <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => setIsSaveModalOpen(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                        <h3 className="text-lg font-semibold">Guardar Transcripción</h3>

                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Nombre del archivo</label>
                                <Input value={saveFileName} onChange={(e) => setSaveFileName(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-medium">Carpeta</label>
                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => fetchFolders(false)} title="Recargar carpetas">
                                        <Clock className={`h-3 w-3 ${loadingFolders ? 'animate-spin' : ''}`} />
                                    </Button>
                                </div>
                                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-1 relative">
                                    {loadingFolders && folders.length === 0 && (
                                        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                        </div>
                                    )}
                                    <button onClick={() => setSelectedFolderId(null)} className={`flex items-center gap-2 p-2 w-full text-sm hover:bg-accent rounded-sm ${selectedFolderId === null ? 'bg-accent/50 text-primary' : ''}`}>
                                        <Folder className="h-4 w-4 opacity-50" /> Biblioteca (Raíz)
                                    </button>
                                    {folders.map(f => (
                                        <button key={f.id} onClick={() => setSelectedFolderId(f.id)} className={`flex items-center gap-2 p-2 w-full text-sm hover:bg-accent rounded-sm ${selectedFolderId === f.id ? 'bg-accent/50 text-primary' : ''}`}>
                                            <Folder className="h-4 w-4 text-yellow-500" /> {f.name}
                                        </button>
                                    ))}
                                </div>
                                {!isCreatingFolder ? (
                                    <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setIsCreatingFolder(true)}>
                                        <FolderPlus className="h-4 w-4 mr-2" /> Nueva Carpeta
                                    </Button>
                                ) : (
                                    <div className="flex gap-2 mt-2">
                                        <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Nombre carpeta" className="h-8" />
                                        <Button size="sm" onClick={handleCreateFolder} disabled={loadingFolders}>
                                            {loadingFolders ? <Loader2 className="h-3 w-3 animate-spin" /> : "Crear"}
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsCreatingFolder(false)}><X className="h-4 w-4" /></Button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setIsSaveModalOpen(false)}>Cancelar</Button>
                            <Button onClick={confirmSave} disabled={isSaving}>
                                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                Guardar
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Batch Save Modal */}
            {isBatchSaveModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <Card className="w-full max-w-md p-6 space-y-4 bg-background border-border shadow-2xl relative">
                        <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => setIsBatchSaveModalOpen(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                        <h3 className="text-lg font-semibold">Guardar Todo ({queue.filter(i => i.status === 'completed').length})</h3>
                        <p className="text-sm text-muted-foreground">Elige dónde guardar los archivos resultantes.</p>

                        <div className="space-y-3">
                            <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-medium">Carpeta de Destino</label>
                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => fetchFolders(false)} title="Recargar carpetas">
                                        <Clock className={`h-3 w-3 ${loadingFolders ? 'animate-spin' : ''}`} />
                                    </Button>
                                </div>
                                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-1 relative">
                                    {loadingFolders && folders.length === 0 && (
                                        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                        </div>
                                    )}
                                    <button onClick={() => setSelectedFolderId(null)} className={`flex items-center gap-2 p-2 w-full text-sm hover:bg-accent rounded-sm ${selectedFolderId === null ? 'bg-accent/50 text-primary' : ''}`}>
                                        <Folder className="h-4 w-4 opacity-50" /> Biblioteca (Raíz)
                                    </button>
                                    {folders.map(f => (
                                        <button key={f.id} onClick={() => setSelectedFolderId(f.id)} className={`flex items-center gap-2 p-2 w-full text-sm hover:bg-accent rounded-sm ${selectedFolderId === f.id ? 'bg-accent/50 text-primary' : ''}`}>
                                            <Folder className="h-4 w-4 text-yellow-500" /> {f.name}
                                        </button>
                                    ))}
                                </div>
                                {!isCreatingFolder ? (
                                    <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setIsCreatingFolder(true)}>
                                        <FolderPlus className="h-4 w-4 mr-2" /> Crear Carpeta para este lote
                                    </Button>
                                ) : (
                                    <div className="flex gap-2 mt-2">
                                        <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Ej: Transcripciones Reunión X" className="h-8" />
                                        <Button size="sm" onClick={() => { /* Logic to create wrapper folder in memory? No just create immediately */ }} disabled>
                                            Use 'Crear' inside logic
                                        </Button>
                                        <span className="text-xs text-muted-foreground self-center">Se creará al guardar</span>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsCreatingFolder(false)}><X className="h-4 w-4" /></Button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setIsBatchSaveModalOpen(false)}>Cancelar</Button>
                            <Button onClick={confirmBatchSave}>Guardar Todo</Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Preview/Edit Modal */}
            {isPreviewModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="w-full max-w-3xl h-[80vh] flex flex-col bg-background border-border shadow-2xl relative animate-in slide-in-from-bottom-10 duration-500">
                        <div className="flex items-center justify-between p-4 border-b">
                            <div className="flex items-center gap-2">
                                <Pencil className="h-4 w-4 text-primary" />
                                <h3 className="text-lg font-semibold">Revisar Transcripción</h3>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setIsPreviewModalOpen(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="flex-1 p-0 overflow-hidden relative">
                            <textarea
                                className="w-full h-full p-6 resize-none focus:outline-none bg-transparent font-mono text-sm leading-relaxed"
                                value={previewText}
                                onChange={(e) => setPreviewText(e.target.value)}
                            />
                        </div>

                        <div className="p-4 border-t flex justify-between items-center bg-muted/20">
                            <span className="text-xs text-muted-foreground">{previewText.length} caracteres</span>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setIsPreviewModalOpen(false)}>Cancelar</Button>
                                <Button onClick={savePreviewEdits}>Confirmar Cambios</Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}
