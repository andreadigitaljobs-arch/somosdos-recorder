'use client';

import { useState } from 'react';

export default function ListModelsPage() {
    const [models, setModels] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const listModels = async () => {
        setLoading(true);
        setError('');

        try {
            const apiKey = localStorage.getItem('gemini_api_key');

            if (!apiKey) {
                setError('No se encontró API Key. Por favor configúrala primero.');
                return;
            }

            const res = await fetch('/api/list-models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Error al listar modelos');
                return;
            }

            setModels(data.models);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-8">
            <h1 className="text-2xl font-bold mb-4">Modelos Disponibles</h1>

            <button
                onClick={listModels}
                disabled={loading}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
                {loading ? 'Cargando...' : 'Listar Modelos'}
            </button>

            {error && (
                <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
                    {error}
                </div>
            )}

            {models.length > 0 && (
                <div className="mt-6">
                    <h2 className="text-xl font-semibold mb-2">
                        Total: {models.length} modelos
                    </h2>
                    <div className="space-y-2">
                        {models.map((model, idx) => (
                            <div key={idx} className="p-4 border rounded bg-white">
                                <div className="font-mono text-sm text-blue-600">
                                    {model.name}
                                </div>
                                {model.displayName && (
                                    <div className="text-sm font-semibold mt-1">
                                        {model.displayName}
                                    </div>
                                )}
                                {model.description && (
                                    <div className="text-xs text-gray-600 mt-1">
                                        {model.description}
                                    </div>
                                )}
                                {model.supportedMethods && (
                                    <div className="text-xs text-gray-500 mt-1">
                                        Métodos: {model.supportedMethods.join(', ')}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
