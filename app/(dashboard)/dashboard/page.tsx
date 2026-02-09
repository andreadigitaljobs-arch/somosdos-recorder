"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Folder, Mic, Brain, Activity, Clock } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useSpace } from "@/components/providers/space-provider"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

type ActivityItem = {
    id: string
    type: 'transcription' | 'quiz'
    title: string
    date: string
    icon: any
    color: string
}

export default function DashboardPage() {
    const supabase = createClient()
    const { currentSpace } = useSpace()

    const [loading, setLoading] = useState(true)
    const [activities, setActivities] = useState<ActivityItem[]>([])
    const [counts, setCounts] = useState({
        files: 0,
        folders: 0,
        transcriptions: 0,
        quizzes: 0
    })

    useEffect(() => {
        async function fetchCounts() {
            if (!currentSpace) return
            // Don't set loading to true here to avoid flickering on space switch if not desired, 
            // but usually good to reset. Let's keep it simple.
            setLoading(true)

            try {
                // 1. Files & Folders
                const { count: filesCount } = await supabase
                    .from('files')
                    .select('*', { count: 'exact', head: true })
                    .eq('space_id', currentSpace.id)
                    .eq('type', 'file')

                const { count: foldersCount } = await supabase
                    .from('files')
                    .select('*', { count: 'exact', head: true })
                    .eq('space_id', currentSpace.id)
                    .eq('type', 'folder')

                // 2. Transcriptions & Quizzes (Filtered by Space)
                const { count: transcriptionsCount } = await supabase
                    .from('transcriptions')
                    .select('*', { count: 'exact', head: true })
                    .eq('metadata->>space_id', currentSpace.id)

                const { count: quizzesCount } = await supabase
                    .from('quizzes')
                    .select('*', { count: 'exact', head: true })
                    .eq('results->>space_id', currentSpace.id)

                setCounts({
                    files: filesCount || 0,
                    folders: foldersCount || 0,
                    transcriptions: transcriptionsCount || 0,
                    quizzes: quizzesCount || 0
                })

                // 3. Recent Activity Feed
                const { data: recentTranscriptions } = await supabase
                    .from('transcriptions')
                    .select('id, created_at, metadata')
                    .eq('metadata->>space_id', currentSpace.id)
                    .order('created_at', { ascending: false })
                    .limit(5)

                const { data: recentQuizzes } = await supabase
                    .from('quizzes')
                    .select('id, created_at, title, results')
                    .eq('results->>space_id', currentSpace.id)
                    .order('created_at', { ascending: false })
                    .limit(5)

                const unifiedActivity: ActivityItem[] = [
                    ...(recentTranscriptions || []).map(t => ({
                        id: t.id,
                        type: 'transcription' as const,
                        title: (t.metadata as any)?.filename || 'Audio Transcrito',
                        date: t.created_at,
                        icon: Mic,
                        color: "text-purple-500 bg-purple-500/10"
                    })),
                    ...(recentQuizzes || []).map(q => ({
                        id: q.id,
                        type: 'quiz' as const,
                        title: q.title || 'Quiz Generado',
                        date: q.created_at,
                        icon: Brain,
                        color: "text-pink-500 bg-pink-500/10"
                    }))
                ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 5)

                setActivities(unifiedActivity)

            } catch (error) {
                console.error("Error fetching stats:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchCounts()
    }, [currentSpace, supabase])


    const stats = [
        { title: "Archivos", value: counts.files, icon: FileText, color: "text-blue-500" },
        { title: "Carpetas", value: counts.folders, icon: Folder, color: "text-yellow-500" },
        { title: "Transcripciones", value: counts.transcriptions, icon: Mic, color: "text-purple-500" },
        { title: "Quizzes", value: counts.quizzes, icon: Brain, color: "text-pink-500" },
    ]

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground/90">Inicio</h2>

            {/* Overview Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => (
                    <Card key={stat.title} className="bg-card/40 border-primary/10 backdrop-blur-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {stat.title}
                            </CardTitle>
                            <stat.icon className={`h-4 w-4 ${stat.color}`} />
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 min-h-[32px] flex items-center">
                                {loading ? (
                                    <div className="h-6 w-12 bg-primary/10 animate-pulse rounded-md" />
                                ) : (
                                    stat.value
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Dashboard Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Empty State for Chart (Placeholder for now) */}
                <Card className="lg:col-span-2 border-border/50 bg-card/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Actividad Reciente</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-12 w-full bg-accent/10 animate-pulse rounded-md" />
                                ))}
                            </div>
                        ) : activities.length === 0 ? (
                            <div className="h-[200px] w-full flex items-center justify-center bg-accent/20 rounded-lg border border-dashed border-border/60">
                                <div className="text-center text-muted-foreground">
                                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <span className="text-sm">Sin actividad reciente</span>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {activities.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:bg-accent/40 transition-colors group">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-full ${item.color}`}>
                                                <item.icon className="h-4 w-4" />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-medium leading-none truncate" title={item.title}>{item.title}</span>
                                                <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: es })}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Optional: Add link button if needed */}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 gap-4">
                    <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20 h-full">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Acceso Rápido</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-3">
                            <a href="/transcriptor" className="flex flex-col items-center justify-center p-4 bg-background/60 rounded-xl border border-primary/10 hover:bg-background/80 transition-all hover:scale-[1.02] active:scale-95">
                                <div className="p-2 rounded-full bg-primary/10 mb-2">
                                    <Mic className="h-5 w-5 text-primary" />
                                </div>
                                <span className="text-xs font-medium">Transcribir</span>
                            </a>
                            <a href="/quiz" className="flex flex-col items-center justify-center p-4 bg-background/60 rounded-xl border border-secondary/10 hover:bg-background/80 transition-all hover:scale-[1.02] active:scale-95">
                                <div className="p-2 rounded-full bg-secondary/10 mb-2">
                                    <Brain className="h-5 w-5 text-secondary" />
                                </div>
                                <span className="text-xs font-medium">Nuevo Quiz</span>
                            </a>
                        </CardContent>
                    </Card>
                </div>
            </div>

        </div>
    )
}
