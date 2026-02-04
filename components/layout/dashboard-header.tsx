"use client"

import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TopNav } from "./top-nav"

export function DashboardHeader({ onOpenSidebar }: { onOpenSidebar: () => void }) {
    return (
        <header className="sticky top-0 z-30 w-full bg-background/80 backdrop-blur-xl border-b border-border/50 supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-2 px-10 py-3">
                <Button variant="ghost" size="icon" onClick={onOpenSidebar} className="shrink-0 -ml-2 hover:bg-muted/50 md:hidden">
                    <Menu className="h-6 w-6" />
                </Button>
                <div className="flex-1 min-w-0">
                    <TopNav />
                </div>
            </div>
        </header>
    )
}
