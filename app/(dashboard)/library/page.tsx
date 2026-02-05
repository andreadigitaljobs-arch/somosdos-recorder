"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Folder, FileText, ChevronRight, Plus, Upload, Search, Trash2, Eye, X, MoreVertical, Pencil, FolderInput, CornerUpLeft, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { useSpace } from "@/components/providers/space-provider"
import { importZip, exportZip } from "@/lib/zip-utils"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"


// Types
type FileSystemItem = {
    id: string
    name: string
    type: "folder" | "file"
    parentId: string | null
    size?: string
    storagePath?: string
}

export default function LibraryPage() {
    const [items, setItems] = useState<FileSystemItem[]>([])
    const [loading, setLoading] = useState(true)
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [uploading, setUploading] = useState(false)
    const { currentSpace } = useSpace()
    const supabase = createClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // --- Modals State ---
    const [previewItem, setPreviewItem] = useState<FileSystemItem | null>(null)
    const [previewContent, setPreviewContent] = useState<string>("")
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)
    const [isLoadingPreview, setIsLoadingPreview] = useState(false)

    // ZIP Import State
    const zipInputRef = useRef<HTMLInputElement>(null)
    const [importProgress, setImportProgress] = useState<{ total: number; current: number; filename: string } | null>(null)

    const [isRenameOpen, setIsRenameOpen] = useState(false)
    const [itemToRename, setItemToRename] = useState<FileSystemItem | null>(null)
    const [newName, setNewName] = useState("")

    const [isMoveOpen, setIsMoveOpen] = useState(false)
    const [itemToMove, setItemToMove] = useState<FileSystemItem | null>(null)
    const [targetFolderId, setTargetFolderId] = useState<string | null>(null)



    // Helper: Format Bytes
    const formatBytes = (bytes: number, decimals = 2) => {
        if (!+bytes) return '0 Bytes'
        const k = 1024
        const dm = decimals < 0 ? 0 : decimals
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
    }

    // --- Fetching ---
    const fetchFiles = useCallback(async () => {
        if (!currentSpace) {
            setLoading(false)
            return
        }
        // Only set loading if empty, but for refresh we might want visual indicator elsewhere
        if (items.length === 0) setLoading(true)

        try {
            // Timeout helper
            async function withTimeout<T>(promise: Promise<T>, ms = 10000, errorMsg = "TIMEOUT"): Promise<T> {
                const timeout = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(errorMsg)), ms)
                )
                return Promise.race([promise, timeout])
            }

            const { data: { user } } = await withTimeout(supabase.auth.getUser(), 5000)
            if (!user) {
                setLoading(false)
                return
            }

            const fetchPromise = supabase
                .from('files')
                .select('*')
                .eq('user_id', user.id)
                .eq('space_id', currentSpace.id)
                .order('type', { ascending: false })
                .order('name', { ascending: true })
                .limit(2000)

            // eslint-disable-next-line
            const { data, error } = await withTimeout(Promise.resolve(fetchPromise), 10000) as any

            if (error) throw error

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mappedItems: FileSystemItem[] = (data || []).map((f: any) => ({
                id: f.id,
                name: f.name,
                type: f.type,
                parentId: f.parent_id,
                storagePath: f.storage_path,
                size: f.size_bytes ? formatBytes(f.size_bytes) : undefined,
            }))
            setItems(mappedItems)

        } catch (error: any) {
            console.error('Error fetching files:', error)
            if (error.message === 'TIMEOUT') {
                console.warn("Library fetch timed out")
            }
        } finally {
            setLoading(false)
        }
    }, [supabase, currentSpace])


    useEffect(() => {
        if (currentSpace) {
            fetchFiles()
        } else {
            setItems([])
            setLoading(false) // Fix constant loading state on initial load
        }
    }, [fetchFiles, currentSpace])

    // --- ZIP Handler ---
    const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !currentSpace) return

        setImportProgress({ total: 0, current: 0, filename: "Iniciando..." })

        try {
            await importZip(file, currentSpace.id, currentFolderId, supabase, (progress) => {
                setImportProgress(progress)
            })
            fetchFiles()
            alert("Importación completada!")
        } catch (error) {
            console.error(error)
            alert("Error importando ZIP")
        } finally {
            setImportProgress(null)
            if (zipInputRef.current) zipInputRef.current.value = ""
        }
    }

    // --- ZIP Export ---
    const [exportStatus, setExportStatus] = useState<string | null>(null)
    const handleZipExport = async () => {
        if (!currentSpace) return
        setExportStatus("Iniciando...")
        try {
            await exportZip(currentSpace.id, currentFolderId, supabase, (status) => {
                setExportStatus(status)
            })
        } catch (error) {
            console.error(error)
            alert("Error exportando ZIP")
        } finally {
            setExportStatus(null)
        }
    }

    // --- Navigation Helper ---
    const getBreadcrumbs = () => {
        if (!items.length) return [{ id: null, name: "Biblioteca" }]
        const breadcrumbs = []
        let current = items.find(i => i.id === currentFolderId)
        let depth = 0
        while (current && current.parentId && depth < 10) {
            breadcrumbs.unshift(current)
            const parentId = current.parentId
            current = items.find(i => i.id === parentId)
            depth++
        }
        if (current) breadcrumbs.unshift(current)
        return [{ id: null, name: "Biblioteca" }, ...breadcrumbs]
    }

    // --- Filtering ---
    const filteredItems = items.filter(item => {
        if (searchQuery) {
            return item.name.toLowerCase().includes(searchQuery.toLowerCase())
        }
        return item.parentId === currentFolderId
    })

    // --- Actions ---

    const handleCreateFolder = async () => {
        if (!currentSpace) return alert("Selecciona un espacio primero")
        const name = prompt("Nombre de la carpeta:")
        if (!name) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { error } = await supabase.from('files').insert({
            user_id: user.id,
            space_id: currentSpace.id,
            parent_id: currentFolderId,
            name: name,
            type: 'folder'
        })
        if (error) alert("Error: " + error.message)
        else fetchFiles()
    }

    const handleUploadClick = () => {
        fileInputRef.current?.click()
    }

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !currentSpace) return

        setUploading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setUploading(false)
            return
        }

        const filePath = `${user.id}/${Date.now()}_${file.name}`
        const { error: uploadError } = await supabase.storage.from('library_files').upload(filePath, file)

        if (uploadError) {
            alert('Error subiendo archivo: ' + uploadError.message)
            setUploading(false)
            return
        }

        const { error: dbError } = await supabase.from('files').insert({
            user_id: user.id,
            space_id: currentSpace.id,
            parent_id: currentFolderId,
            name: file.name,
            type: 'file',
            size_bytes: file.size,
            storage_path: filePath
        })

        if (dbError) alert('Error guardando: ' + dbError.message)
        else fetchFiles()

        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
    }

    const handleDelete = async (item: FileSystemItem) => {
        if (!confirm(`¿Estás seguro de eliminar "${item.name}"?`)) return

        try {
            if (item.type === 'file' && item.storagePath) {
                await supabase.storage.from('library_files').remove([item.storagePath])
            }
            // Note: RLS or cascading delete needed for folders with children.
            // For now simple delete.
            const { error } = await supabase.from('files').delete().eq('id', item.id)
            if (error) throw error
            fetchFiles()
        } catch (e: any) {
            alert("Error al eliminar: " + e.message)
        }
    }

    // --- Rename ---
    const openRename = (item: FileSystemItem) => {
        setItemToRename(item)
        setNewName(item.name)
        setIsRenameOpen(true)
    }

    const handleCopy = async (item: FileSystemItem) => {
        try {
            // First fetch content if not cached (reusing similar logic to preview)
            // Ideally we should have a cleaner way to fetch content, but for now we download it
            const { data, error } = await supabase.storage
                .from('library_files')
                .download(item.storagePath!)

            if (error) throw error

            const text = await data.text()

            // Clean text logic
            const cleanText = text
                .replace(/^#+\s/gm, '') // Remove headers markdown
                .replace(/(\*\*|__)(.*?)\1/g, '$2') // Remove bold
                .replace(/(\*|_)(.*?)\1/g, '$2') // Remove italic
                .replace(/`{3,}[\s\S]*?`{3,}/g, '') // Remove code blocks
                .replace(/`(.+?)`/g, '$1') // Remove inline code
                .replace(/^[-*+]\s/gm, '') // Remove list bullets
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1') // Remove links, keep text
                .replace(/\n{3,}/g, '\n\n') // Normalize newlines
                .trim()

            await navigator.clipboard.writeText(cleanText)

            // Simple visual feedback could be improved with a toast
            alert("Texto copiado al portapapeles (limpio de formatos)")

        } catch (error) {
            console.error("Error al copiar:", error)
            alert("No se pudo copiar el contenido")
        }
    }

    const confirmRename = async () => {
        if (!itemToRename || !newName) return
        const { error } = await supabase.from('files').update({ name: newName }).eq('id', itemToRename.id)
        if (error) alert("Error al renombrar: " + error.message)
        else {
            fetchFiles()
            setIsRenameOpen(false)
        }
    }

    // --- Move ---
    const openMove = (item: FileSystemItem) => {
        setItemToMove(item)
        setTargetFolderId(null) // Reset to root default
        setIsMoveOpen(true)
    }

    const confirmMove = async () => {
        if (!itemToMove) return
        // Check for cyclic move (folder into itself)
        if (itemToMove.type === 'folder' && targetFolderId === itemToMove.id) {
            alert("No puedes mover una carpeta dentro de sí misma")
            return
        }

        const { error } = await supabase.from('files').update({ parent_id: targetFolderId }).eq('id', itemToMove.id)
        if (error) alert("Error al mover: " + error.message)
        else {
            fetchFiles()
            setIsMoveOpen(false)
        }
    }

    // --- Preview ---
    const handlePreview = async (item: FileSystemItem) => {
        if (item.type !== 'file') return
        setPreviewItem(item)
        setIsPreviewOpen(true)
        setIsLoadingPreview(true)
        setPreviewContent("")

        try {
            if (!item.storagePath) throw new Error("No hay ruta de almacenamiento")
            const { data, error } = await supabase.storage.from('library_files').download(item.storagePath)
            if (error) throw error
            const text = await data.text()
            setPreviewContent(text)
        } catch (e: any) {
            setPreviewContent("No se pudo cargar la vista previa. Puede que no sea un archivo de texto.\n\n" + e.message)
        } finally {
            setIsLoadingPreview(false)
        }
    }

    // Get all folders for Move Dialog (excluding current item tree conceptually, but flat list is easier)
    // We just filter out the item itself if it's a folder.
    const allFolders = items.filter(i => i.type === 'folder' && i.id !== itemToMove?.id)


    // --- Helper: Count Children (Immediate) ---
    const getChildCounts = (folderId: string) => {
        const children = items.filter(i => i.parentId === folderId)
        return {
            folders: children.filter(i => i.type === 'folder').length,
            files: children.filter(i => i.type === 'file').length
        }
    }

    // --- Stats calculation ---
    const currentViewStats = {
        folders: filteredItems.filter(i => i.type === 'folder').length,
        files: filteredItems.filter(i => i.type === 'file').length
    }

    return (
        <div className="space-y-4 h-full flex flex-col">
            {/* Toolbar */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Biblioteca</h2>
                    <div className="flex gap-2">
                        {/* ZIP Import */}
                        <input
                            type="file"
                            accept=".zip"
                            ref={zipInputRef}
                            className="hidden"
                            onChange={handleZipUpload}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            className="hidden md:flex gap-2"
                            onClick={() => zipInputRef.current?.click()}
                            disabled={!!importProgress}
                        >
                            {importProgress ? (
                                <span className="animate-pulse">
                                    {importProgress.total > 0
                                        ? Math.round((importProgress.current / importProgress.total) * 100) + '%'
                                        : "..."}
                                </span>
                            ) : (
                                <>
                                    <FolderInput className="h-4 w-4" /> Importar
                                </>
                            )}
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            className="hidden md:flex gap-2"
                            onClick={handleZipExport}
                            disabled={!!exportStatus}
                        >
                            {exportStatus ? (
                                <span className="animate-pulse text-xs">{exportStatus}</span>
                            ) : (
                                <>
                                    <CornerUpLeft className="h-4 w-4 rotate-45" /> Exportar
                                </>
                            )}
                        </Button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleUpload}
                        />
                        <Button size="sm" variant="outline" onClick={handleUploadClick} disabled={uploading}>
                            {uploading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                            {uploading ? "Subiendo..." : "Subir"}
                        </Button>
                        <Button size="sm" onClick={handleCreateFolder}>
                            <Plus className="h-4 w-4 mr-2" /> Carpeta
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar..."
                            className="pl-9 h-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Breadcrumbs & Stats */}
            <div className="border-b pb-2">
                {!searchQuery ? (
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1.5">
                        {/* Línea 1: Breadcrumb with horizontal scroll on mobile */}
                        <div className="flex items-center gap-1 text-sm text-muted-foreground overflow-x-auto scrollbar-hide">
                            <Button variant="ghost" size="sm" className="h-6 px-1 shrink-0" onClick={() => setCurrentFolderId(null)}>
                                Inicio
                            </Button>
                            {getBreadcrumbs().slice(1).map((crumb) => (
                                <div key={crumb.id} className="flex items-center shrink-0">
                                    <ChevronRight className="h-4 w-4 opacity-50" />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-6 px-1 ${crumb.id === currentFolderId ? 'font-bold text-primary' : ''}`}
                                        onClick={() => setCurrentFolderId(crumb.id as string)}
                                    >
                                        {crumb.name}
                                    </Button>
                                </div>
                            ))}
                        </div>
                        {/* Línea 2: Counters (smaller, lower emphasis) */}
                        <div className="text-[11px] md:text-xs text-muted-foreground/70 flex gap-2 md:gap-3 shrink-0">
                            <span>{currentViewStats.folders} carpetas</span>
                            <span className="opacity-50">•</span>
                            <span>{currentViewStats.files} archivos</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1.5">
                        <div className="text-sm text-muted-foreground">Resultados de búsqueda</div>
                        <div className="text-[11px] md:text-xs text-muted-foreground/70 flex gap-2 md:gap-3">
                            <span>{currentViewStats.folders} carpetas</span>
                            <span className="opacity-50">•</span>
                            <span>{currentViewStats.files} archivos</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Grid */}
            <ScrollArea className="flex-1 -mx-4 px-4 pb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 content-start">
                    {loading && <div className="col-span-full py-10 text-center text-muted-foreground">Cargando...</div>}

                    {!loading && filteredItems.length === 0 && (
                        <div className="col-span-full py-12 flex flex-col items-center text-muted-foreground border-2 border-dashed rounded-xl bg-muted/20">
                            <Folder className="h-10 w-10 mb-2 opacity-20" />
                            <p>Carpeta vacía</p>
                        </div>
                    )}

                    {!loading && filteredItems.map(item => {
                        const counts = item.type === 'folder' ? getChildCounts(item.id) : null

                        return (
                            <div
                                key={item.id}
                                className="group relative flex flex-col items-center p-3 rounded-lg border bg-card hover:bg-accent/50 transition-all cursor-pointer aspect-square"
                                onClick={() => item.type === "folder" ? setCurrentFolderId(item.id) : handlePreview(item)}
                            >
                                <div className="flex-1 flex items-center justify-center w-full transition-transform group-hover:scale-105">
                                    {item.type === "folder" ? (
                                        <div className="relative">
                                            <Folder className="h-12 w-12 text-yellow-500 fill-yellow-500/20" />
                                            {(counts?.files || 0) > 0 && (
                                                <div className="absolute -bottom-1 -right-1 bg-background text-[9px] border font-bold px-1 rounded-full shadow-sm">
                                                    {counts?.files}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <FileText className="h-12 w-12 text-primary fill-primary/10" />
                                    )}
                                </div>
                                <div className="w-full text-center mt-2 space-y-0.5">
                                    <p className="text-xs font-medium truncate w-full" title={item.name}>{item.name}</p>
                                    {item.type === 'file' && item.size && (
                                        <p className="text-[10px] text-muted-foreground">{item.size}</p>
                                    )}
                                    {item.type === 'folder' && counts && (
                                        <p className="text-[9px] text-muted-foreground">
                                            {counts.folders > 0 ? `${counts.folders} carp, ` : ''}{counts.files} arch
                                        </p>
                                    )}
                                </div>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background/50 backdrop-blur-sm">
                                            <MoreVertical className="h-3 w-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {item.type === 'file' && (
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePreview(item) }}>
                                                <Eye className="h-4 w-4 mr-2" /> Ver
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openRename(item) }}>
                                            <Pencil className="h-4 w-4 mr-2" /> Renombrar
                                        </DropdownMenuItem>
                                        {item.type === 'file' && (
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopy(item) }}>
                                                <Copy className="h-4 w-4 mr-2" /> Copiar Contenido
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openMove(item) }}>
                                            <FolderInput className="h-4 w-4 mr-2" /> Mover
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(item) }}>
                                            <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>

            {/* Rename Modal */}
            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Renombrar</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Label>Nuevo nombre</Label>
                        <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-2" />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRenameOpen(false)}>Cancelar</Button>
                        <Button onClick={confirmRename}>Guardar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Move Modal */}
            <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mover "{itemToMove?.name}" a...</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-2 max-h-[300px] overflow-y-auto">
                        <Button
                            variant="ghost"
                            className={`w-full justify-start ${targetFolderId === null ? 'bg-accent' : ''}`}
                            onClick={() => setTargetFolderId(null)}
                        >
                            <CornerUpLeft className="h-4 w-4 mr-2" /> Raíz (Biblioteca)
                        </Button>

                        {allFolders.map(folder => (
                            <Button
                                key={folder.id}
                                variant="ghost"
                                className={`w-full justify-start pl-8 ${targetFolderId === folder.id ? 'bg-accent' : ''}`}
                                onClick={() => setTargetFolderId(folder.id)}
                            >
                                <Folder className="h-4 w-4 mr-2 text-yellow-500" /> {folder.name}
                            </Button>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsMoveOpen(false)}>Cancelar</Button>
                        <Button onClick={confirmMove}>Mover aquí</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Preview Modal */}
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{previewItem?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto min-h-[300px] bg-muted/20 p-4 rounded text-sm font-mono whitespace-pre-wrap border relative">
                        <AnimatePresence mode="wait">
                            {isLoadingPreview ? (
                                <motion.div
                                    key="loading"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 flex items-center justify-center"
                                >
                                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="content"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 1.2, ease: "easeOut" }}
                                    className="h-full"
                                >
                                    {previewContent}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
