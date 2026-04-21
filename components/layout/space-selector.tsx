"use client"

import { useState } from "react"
import { useSpace } from "@/components/providers/space-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Layers, Loader2, ArrowRight, LayoutGrid } from "lucide-react"

export function SpaceSelector() {
    const { 
        spaces, 
        currentSpace, 
        setCurrentSpace, 
        loading, 
        handleCreateSpace, 
        newSpaceName, 
        setNewSpaceName, 
        creating 
    } = useSpace()

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground animate-pulse text-sm">Cargando tus espacios...</p>
            </div>
        )
    }

    return (
        <div className="w-full max-w-md mx-auto space-y-8 py-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-2">
                <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
                    <Layers className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Elige tu Espacio</h1>
                <p className="text-muted-foreground text-sm">Selecciona dónde quieres trabajar hoy.</p>
            </div>

            <div className="space-y-4">
                {spaces.map(space => (
                    <button
                        key={space.id}
                        onClick={() => setCurrentSpace(space)}
                        className="w-full flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-accent/50 transition-all group hover:shadow-md"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <LayoutGrid className="h-5 w-5 text-primary" />
                            </div>
                            <div className="text-left">
                                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{space.name}</p>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Entrar ahora</p>
                            </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary opacity-50 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
                    </button>
                ))}

                {spaces.length === 0 && (
                    <div className="text-center p-8 border-2 border-dashed rounded-xl bg-accent/20">
                        <p className="text-sm text-muted-foreground">Tu estudio está vacío. Crea tu primer espacio abajo.</p>
                    </div>
                )}

                <div className="pt-6 border-t border-border/50 mt-8">
                    <p className="text-[10px] font-bold mb-4 text-muted-foreground uppercase tracking-widest text-center">
                        Nuevo Proyecto / Espacio
                    </p>
                    <div className="flex flex-col gap-3">
                        <Input
                            placeholder="Nombre del espacio..."
                            value={newSpaceName}
                            onChange={(e) => setNewSpaceName(e.target.value)}
                            className="bg-background h-12"
                        />
                        <Button
                            onClick={handleCreateSpace}
                            disabled={creating || !newSpaceName.trim()}
                            className="h-12 w-full text-sm font-bold uppercase tracking-tight"
                        >
                            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5 mr-2" />}
                            Crear y Empezar
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
