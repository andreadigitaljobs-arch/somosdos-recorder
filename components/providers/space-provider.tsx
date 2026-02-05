"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Layers, Loader2, ArrowRight, LayoutGrid } from "lucide-react"

type Space = {
    id: string
    name: string
    description?: string
}

type SpaceContextType = {
    spaces: Space[]
    currentSpace: Space | null
    setCurrentSpace: (space: Space | null) => void
    refreshSpaces: () => Promise<void>
    loading: boolean
}

const SpaceContext = createContext<SpaceContextType>({
    spaces: [],
    currentSpace: null,
    setCurrentSpace: () => { },
    refreshSpaces: async () => { },
    loading: true,
})

export const useSpace = () => useContext(SpaceContext)

export function SpaceProvider({ children }: { children: React.ReactNode }) {
    const [spaces, setSpaces] = useState<Space[]>([])
    const [currentSpace, _setCurrentSpace] = useState<Space | null>(null)
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [newSpaceName, setNewSpaceName] = useState("")

    // View state: 'loading', 'list', 'create', 'ready'
    // Actually simplicity: if currentSpace is null, show selection. If set, show children.

    const supabase = createClient()

    // Wrapper to handle persistence
    const setCurrentSpace = (space: Space | null) => {
        _setCurrentSpace(space)
        if (space) {
            localStorage.setItem('current_space_id', space.id)
        } else {
            localStorage.removeItem('current_space_id')
        }
    }

    const fetchSpaces = useCallback(async () => {
        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser()
            if (authError || !user) return

            const { data, error: spacesError } = await supabase
                .from('spaces')
                .select('*')
                .order('created_at', { ascending: false })

            if (spacesError) {
                console.error("Error fetching spaces:", spacesError)
                return
            }

            if (data) {
                setSpaces(data)
                // Restore from local storage if valid
                const storedId = localStorage.getItem('current_space_id')
                if (storedId) {
                    const found = data.find((s: Space) => s.id === storedId)
                    if (found) _setCurrentSpace(found)
                }
            }
        } catch (error) {
            console.error("Unexpected error in space provider:", error)
        }
    }, [supabase, setSpaces]) // removed setCurrentSpace dependency to avoid loop, it's stable enough or we use wrapping

    useEffect(() => {
        let mounted = true

        const init = async () => {
            setLoading(true)

            // Check session first
            const { data: { session } } = await supabase.auth.getSession()

            if (session && mounted) {
                await fetchSpaces()
            }

            // Listen for auth changes
            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
                if (session && mounted) {
                    await fetchSpaces()
                }
            })

            if (mounted) setLoading(false)
            return () => {
                mounted = false
                subscription.unsubscribe()
            }
        }

        init()
    }, [supabase, fetchSpaces])

    const handleSelectSpace = setCurrentSpace // Alias for internal use if needed, or remove handleSelectSpace usage below

    const handleCreateSpace = async () => {
        if (!newSpaceName.trim()) return
        setCreating(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
            .from('spaces')
            .insert({
                user_id: user.id,
                name: newSpaceName,
                description: 'Espacio creado por el usuario'
            })
            .select()
            .single()

        if (data) {
            setSpaces([data, ...spaces])
            handleSelectSpace(data)
        }
        setCreating(false)
        setNewSpaceName("")
    }

    // IF loading -> Show Spinner
    if (loading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    // IF No Current Space Selected -> Show Selection Screen
    if (!currentSpace) {
        return (
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background p-4 animate-in fade-in duration-500">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center space-y-2">
                        <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
                            <Layers className="h-6 w-6 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">Elige tu Espacio de Estudio</h1>
                        <p className="text-muted-foreground">Selecciona un entorno para comenzar a trabajar o crea uno nuevo.</p>
                    </div>

                    <div className="space-y-4">
                        {spaces.map(space => (
                            <button
                                key={space.id}
                                onClick={() => handleSelectSpace(space)}
                                className="w-full flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-accent/50 transition-all group group-hover:shadow-md"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                        <LayoutGrid className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{space.name}</p>
                                        <p className="text-xs text-muted-foreground">Último acceso: Reciente</p>
                                    </div>
                                </div>
                                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary opacity-50 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
                            </button>
                        ))}

                        {/* Create New Space Input */}
                        <div className="pt-6 border-t border-border mt-8">
                            <p className="text-sm font-medium mb-4 text-muted-foreground text-center sm:text-left">
                                {spaces.length === 0 ? "Para comenzar, crea tu primer espacio:" : "O crea uno nuevo:"}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <Input
                                    placeholder="Nombre del nuevo espacio (ej. Universitaria)"
                                    value={newSpaceName}
                                    onChange={(e) => setNewSpaceName(e.target.value)}
                                    className="bg-background h-12 text-base"
                                />
                                <Button
                                    onClick={handleCreateSpace}
                                    disabled={creating || !newSpaceName.trim()}
                                    className="h-12 w-full sm:w-auto min-w-[100px]"
                                >
                                    {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5 mr-2" />}
                                    {creating ? "Creando..." : "Crear"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <SpaceContext.Provider value={{ spaces, currentSpace, setCurrentSpace, refreshSpaces: fetchSpaces, loading }}>
            {children}
        </SpaceContext.Provider>
    )
}
