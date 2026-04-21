"use client"

import { useState } from "react"
import { Sidebar } from "@/components/layout/sidebar"
import { DashboardHeader } from "@/components/layout/dashboard-header"
import { SpaceProvider, useSpace } from "@/components/providers/space-provider"
import { TranscriptionProvider } from "@/components/providers/transcription-provider"
import { TopNav } from "@/components/layout/top-nav"
import { SpaceSelector } from "@/components/layout/space-selector"

// 1. Capa externa: Provee el contexto de Espacios
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <SpaceProvider>
            <DashboardInnerContent>
                {children}
            </DashboardInnerContent>
        </SpaceProvider>
    )
}

// 2. Capa interna: Usa el contexto y renderiza la UI
function DashboardInnerContent({ children }: { children: React.ReactNode }) {
    const { currentSpace } = useSpace()

    return (
        <TranscriptionProvider>
            <div className="min-h-screen bg-background relative flex flex-col md:flex-row">
                {/* Desktop Sidebar: Solo visible en MD+ */}
                <div className="hidden md:block h-screen sticky top-0 w-[280px] border-r border-border bg-card shadow-xl z-20">
                    <Sidebar isOpen={true} onClose={() => { }} isDesktop={true} />
                </div>

                <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
                    <DashboardHeader onOpenSidebar={() => {}} />
                    
                    <main className="flex-1 container mx-auto px-6 py-4 pb-32 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto">
                        {!currentSpace ? (
                            <SpaceSelector />
                        ) : (
                            children
                        )}
                    </main>

                    {/* Dock Inferior Móvil: Solo visible en pantallas pequeñas */}
                    <div className="md:hidden">
                        <TopNav />
                    </div>
                </div>
            </div>
        </TranscriptionProvider>
    )
}
