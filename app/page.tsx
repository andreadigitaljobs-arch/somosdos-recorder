"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { LoadingRing } from "@/components/ui/loading-ring"

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    // Proactive redirect to login
    router.push("/login")
  }, [router])

  return <LoadingRing />
}
