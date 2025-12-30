'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createLobby, joinLobby } from '@/app/actions/lobby';
import { setPlayerId } from '@/lib/utils/player';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');

    const result = await createLobby(name.trim());
    setLoading(false);

    if ('error' in result) {
      setError(result.error);
    } else {
      setPlayerId(result.playerId);
      router.push(`/lobby/${result.joinCode}`);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!joinCode.trim()) {
      setError('Please enter a join code');
      return;
    }

    setLoading(true);
    setError('');

    const result = await joinLobby(joinCode.trim().toUpperCase(), name.trim());
    setLoading(false);

    if ('error' in result) {
      setError(result.error);
    } else {
      setPlayerId(result.playerId);
      router.push(`/lobby/${joinCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900">TV Theme Hipster</h1>
          <p className="mt-2 text-gray-600">Guess when TV shows premiered!</p>
        </div>

        <div className="flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => {
              setMode('create');
              setError('');
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'bg-white text-purple-600 shadow-sm'
                : 'text-gray-600'
            }`}
          >
            Create Game
          </button>
          <button
            onClick={() => {
              setMode('join');
              setError('');
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'join'
                ? 'bg-white text-purple-600 shadow-sm'
                : 'text-gray-600'
            }`}
          >
            Join Game
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {mode === 'create' ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="create-name" className="block text-sm font-medium text-gray-700">
                Your Name
              </label>
              <input
                id="create-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500"
                disabled={loading}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Game'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="join-name" className="block text-sm font-medium text-gray-700">
                Your Name
              </label>
              <input
                id="join-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500"
                disabled={loading}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="join-code" className="block text-sm font-medium text-gray-700">
                Join Code
              </label>
              <input
                id="join-code"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-letter code"
                maxLength={6}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-2xl font-mono tracking-widest shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Joining...' : 'Join Game'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
