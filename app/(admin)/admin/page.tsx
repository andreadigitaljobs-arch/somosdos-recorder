"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

export default function AdminPage() {
    const [users, setUsers] = useState([
        { id: 1, email: "admin@edu.com", role: "admin", password: "admin" },
        { id: 2, email: "estudiante@edu.com", role: "student", password: "pass" }
    ])
    const [newUserEmail, setNewUserEmail] = useState("")
    const [newUserPass, setNewUserPass] = useState("")
    const [adminPass, setAdminPass] = useState("")

    const handleCreate = () => {
        if (!newUserEmail || !newUserPass) return
        setUsers([...users, { id: Date.now(), email: newUserEmail, role: "student", password: newUserPass }])
        setNewUserEmail("")
        setNewUserPass("")
        alert("Usuario creado exitosamente")
    }

    const handleDelete = (id: number) => {
        setUsers(users.filter(u => u.id !== id))
    }

    const toggleRole = (id: number) => {
        setUsers(users.map(u =>
            u.id === id ? { ...u, role: u.role === "admin" ? "student" : "admin" } : u
        ))
    }

    const handleChangePassword = (id: number) => {
        const newPass = prompt("Ingresa la nueva contraseña para este usuario:")
        if (newPass) {
            setUsers(users.map(u => u.id === id ? { ...u, password: newPass } : u))
            alert("Contraseña actualizada")
        }
    }

    const handleUpdateAdminPass = () => {
        if (!adminPass) return
        // In a real app this would update the logged in admin's password via Supabase
        alert("Contraseña de administrador general actualizada (Simulación)")
        setAdminPass("")
    }

    return (
        <div className="min-h-screen bg-background p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Panel de Administrador</h1>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => window.location.href = "/login"}>Volver al Login</Button>
                    </div>
                </div>

                {/* Admin Settings */}
                <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle>Configuración de Administrador</CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-4 items-end">
                        <div className="space-y-2 flex-1 relative">
                            <label className="text-sm font-medium">Nueva Contraseña Admin</label>
                            <Input
                                type="password"
                                value={adminPass}
                                onChange={(e) => setAdminPass(e.target.value)}
                                placeholder="••••••"
                                className="bg-background/50"
                            />
                        </div>
                        <Button onClick={handleUpdateAdminPass} disabled={!adminPass}>Actualizar Mi Clave</Button>
                    </CardContent>
                </Card>

                {/* Create User */}
                <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle>Crear Nuevo Usuario</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="space-y-2 flex-1 w-full">
                            <label className="text-sm font-medium">Correo Electrónico</label>
                            <Input
                                value={newUserEmail}
                                onChange={e => setNewUserEmail(e.target.value)}
                                placeholder="correo@usuario.com"
                                className="bg-background/50"
                            />
                        </div>
                        <div className="space-y-2 flex-1 w-full">
                            <label className="text-sm font-medium">Contraseña Temporal</label>
                            <Input
                                value={newUserPass}
                                onChange={e => setNewUserPass(e.target.value)}
                                type="password"
                                placeholder="••••••"
                                className="bg-background/50"
                            />
                        </div>
                        <Button onClick={handleCreate} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full md:w-auto">
                            Crear Usuario
                        </Button>
                    </CardContent>
                </Card>

                {/* User List */}
                <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle>Usuarios Registrados</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-muted-foreground border-b border-border">
                                    <tr>
                                        <th className="py-3 px-2">ID</th>
                                        <th className="py-3 px-2">Email</th>
                                        <th className="py-3 px-2">Rol / Contraseña</th>
                                        <th className="py-3 px-2 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                                            <td className="py-3 px-2 text-muted-foreground">{u.id}</td>
                                            <td className="py-3 px-2 font-medium">
                                                {u.email}
                                                <div className="text-[10px] text-muted-foreground">Pass: {u.password}</div>
                                            </td>
                                            <td className="py-3 px-2">
                                                <button
                                                    onClick={() => toggleRole(u.id)}
                                                    className={`px-3 py-1 rounded-full text-xs border font-medium transition-colors ${u.role === 'admin' ? 'bg-primary/20 text-primary border-primary/20 hover:bg-primary/30' : 'bg-secondary/20 text-secondary border-secondary/20 hover:bg-secondary/30'}`}
                                                >
                                                    {u.role === 'admin' ? 'Admin' : 'Estudiante'}
                                                </button>
                                            </td>
                                            <td className="py-3 px-2 text-right space-x-2">
                                                <button
                                                    onClick={() => handleChangePassword(u.id)}
                                                    className="text-primary hover:underline text-xs bg-transparent border-none cursor-pointer"
                                                >
                                                    Cambiar Clave
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(u.id)}
                                                    className="text-destructive hover:underline text-xs bg-transparent border-none cursor-pointer"
                                                >
                                                    Eliminar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

