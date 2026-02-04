"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Home, Mic, FileText, Brain } from "lucide-react"

const navItems = [
    { name: "Inicio", href: "/dashboard", icon: Home },
    { name: "Transcriptor", href: "/transcriptor", icon: Mic },
    { name: "Zona Quiz", href: "/quiz", icon: Brain },
    { name: "Biblioteca", href: "/library", icon: FileText },
]

export function TopNav() {
    const pathname = usePathname()

    return (
        <nav className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {navItems.map((item) => {
                // Simple active check; typically needs explicit exact match or startsWith logic
                // but since paths are distinct, exact match or simple includes works.
                const isActive = pathname === item.href
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap border border-transparent",
                            isActive
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 border-primary/20"
                                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border-border/50"
                        )}
                    >
                        <item.icon className="h-4 w-4" />
                        {item.name}
                    </Link>
                )
            })}
        </nav>
    )
}
