"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { usePathname } from "next/navigation"
import { X, LogOut, Plus, Layers, Key, User, MoreVertical, Pencil, Trash2, Mic, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useSpace } from "@/components/providers/space-provider"
import Image from "next/image"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

interface SidebarProps {
    isOpen: boolean
    onClose: () => void
    isDesktop?: boolean
}

export function Sidebar({ isOpen, onClose, isDesktop = false }: SidebarProps) {

    const supabase = createClient()
    const { spaces, currentSpace, setCurrentSpace, refreshSpaces } = useSpace()
    const router = useRouter()
    const pathname = usePathname()
    const [email, setEmail] = useState("usuario@demo.com")

    // Space Management State
    const [isRenameOpen, setIsRenameOpen] = useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [newName, setNewName] = useState("")

    // Handlers
    const handleRename = async () => {
        if (!currentSpace || !newName.trim()) return

        const { error } = await supabase
            .from('spaces')
            .update({ name: newName })
            .eq('id', currentSpace.id)

        if (error) {
            console.error("Error renaming space:", error)
            alert("Error al renombrar el espacio")
            return
        }

        await refreshSpaces()
        setIsRenameOpen(false)
    }

    const handleDelete = async () => {
        if (!currentSpace) return

        const { error } = await supabase
            .from('spaces')
            .delete()
            .eq('id', currentSpace.id)

        if (error) {
            console.error("Error deleting space:", error)
            alert("Error al eliminar el espacio")
            return
        }

        await refreshSpaces()
        setCurrentSpace(null) // Reset selection
        setIsDeleteOpen(false)
    }

    const openRename = () => {
        if (!currentSpace) return
        setNewName(currentSpace.name)
        setIsRenameOpen(true)
    }



    useEffect(() => {
        // Determine user (mock for now if not logged in, but try to get session)
        async function getUser() {
            const { data } = await supabase.auth.getUser()
            if (data.user?.email) setEmail(data.user.email)
        }
        getUser()
    }, [supabase])



    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push("/login")
    }

    const sidebarContent = (
        <div className="flex flex-col h-full bg-card">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/50">
                <div className="relative w-full h-8">
                    <Image
                        src="/logo.png"
                        alt="SomosDos Recorder Logo"
                        fill
                        className="object-contain object-center"
                        priority
                    />
                </div>
                {!isDesktop && (
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                )}
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                {/* Main Navigation (Desktop Visible) */}
                <div className="space-y-1.5 px-1">
                    <button
                        onClick={() => router.push('/transcriptor')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${pathname === '/transcriptor' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
                    >
                        <Mic className="h-4 w-4" />
                        Grabadora
                    </button>
                    <button
                        onClick={() => router.push('/library')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${pathname === '/library' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
                    >
                        <FileText className="h-4 w-4" />
                        Biblioteca
                    </button>
                </div>

                <div className="border-b border-border/30 my-2" />

                {/* User Info */}
                <div className="space-y-3">
                    <div className="flex items-center gap-3 text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase tracking-wider">Usuario</span>
                    </div>
                    <p className="text-sm font-medium truncate bg-accent/50 p-3 rounded-lg border border-border/50">
                        {email}
                    </p>
                </div>



                {/* Spaces */}
                <div className="space-y-3">
                    <div className="flex items-center gap-3 text-muted-foreground">
                        <Layers className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase tracking-wider">Espacio Actual</span>
                    </div>

                    <div className="p-1">
                        {currentSpace ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 cursor-pointer hover:bg-primary/20 transition-colors group relative">
                                        <p className="font-semibold text-primary pr-6 truncate">{currentSpace.name}</p>
                                        <MoreVertical className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50 group-hover:text-primary transition-colors" />
                                    </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem onClick={openRename}>
                                        <Pencil className="h-4 w-4 mr-2" /> Renombrar
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => setIsDeleteOpen(true)}>
                                        <Trash2 className="h-4 w-4 mr-2" /> Eliminar Espacio
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="p-4 rounded-xl bg-muted/50 border border-dashed border-border flex items-center justify-center text-muted-foreground text-sm">
                                Seleccionar...
                            </div>
                        )}
                    </div>

                    <div className="pt-2 space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">Mis Espacios</p>
                        {spaces.map(space => (
                            <button
                                key={space.id}
                                onClick={() => setCurrentSpace(space)}
                                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${space.id === currentSpace?.id
                                    ? "bg-accent text-accent-foreground font-medium"
                                    : "hover:bg-accent/50 text-muted-foreground"
                                    }`}
                            >
                                {space.name}
                            </button>
                        ))}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentSpace(null)} // Trigger selection view
                            className="w-full justify-start gap-2 mt-2 text-muted-foreground border-dashed"
                        >
                            <Plus className="h-4 w-4" />
                            Gestionar Espacios
                        </Button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border/50">
                <Button
                    variant="destructive"
                    className="w-full gap-2"
                    onClick={handleLogout}
                >
                    <LogOut className="h-4 w-4" />
                    Cerrar Sesión
                </Button>
            </div>

            {/* Rename Space Modal */}
            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Renombrar Espacio</DialogTitle>
                        <DialogDescription>
                            Cambia el nombre de tu espacio de trabajo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label>Nombre del espacio</Label>
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="mt-2"
                            placeholder="Ej. Marketing Digital"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRenameOpen(false)}>Cancelar</Button>
                        <Button onClick={handleRename} disabled={!newName.trim()}>Guardar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Space Modal */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-destructive">Eliminar Espacio</DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro? Esta acción eliminará permanentemente el espacio
                            <span className="font-bold text-foreground"> &quot;{currentSpace?.name}&quot; </span>
                            y todos sus archivos, carpetas, cuestionarios y transcripciones asociados.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 p-4 bg-destructive/10 rounded-lg border border-destructive/20 text-destructive text-sm font-medium">
                        ⚠️ Esta acción es irreversible.
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleDelete}>Eliminar Definitivamente</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )

    if (isDesktop) {
        return sidebarContent
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
                    />

                    {/* Sidebar Panel */}
                    <motion.div
                        initial={{ x: "-100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "-100%" }}
                        transition={{ type: "spring", damping: 20, stiffness: 300 }}
                        className="fixed inset-y-0 left-0 z-50 h-full w-[85%] max-w-[300px] border-r border-border bg-card shadow-2xl md:hidden"
                    >
                        {sidebarContent}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
