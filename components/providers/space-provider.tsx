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
    handleCreateSpace: () => Promise<void>
    newSpaceName: string
    setNewSpaceName: (name: string) => void
    creating: boolean
}

const SpaceContext = createContext<SpaceContextType>({
    spaces: [],
    currentSpace: null,
    setCurrentSpace: () => { },
    refreshSpaces: async () => { },
    loading: true,
    handleCreateSpace: async () => { },
    newSpaceName: "",
    setNewSpaceName: () => { },
    creating: false,
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

    return (
        <SpaceContext.Provider value={{ 
            spaces, 
            currentSpace, 
            setCurrentSpace, 
            refreshSpaces: fetchSpaces, 
            loading,
            handleCreateSpace,
            newSpaceName,
            setNewSpaceName,
            creating
        }}>
            {children}
        </SpaceContext.Provider>
    )
}
